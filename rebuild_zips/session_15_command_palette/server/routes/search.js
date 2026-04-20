const router = require('express').Router();
const DeepSearchJob = require('../models/DeepSearchJob');
const { protect } = require('../middleware/auth');

// ═══════════════════════════════════════════════════════════════════════════
// Session 4 security fix applied in this file:
//   S8 — Escape regex metacharacters in user query (prevents ReDoS + crashes)
//        Also tightened scope-specific access filters for workspace, tasks,
//        meetings, and messages so results don't leak across membership.
// ═══════════════════════════════════════════════════════════════════════════

// Escape regex metacharacters so user input can safely be used in a $regex.
// Without this, input like "(" or "a{999999,}" can trigger ReDoS or throw.
function escapeRegex(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Lazy-load models to avoid circular deps
function getModel(scope) {
  switch (scope) {
    case 'workspace': return require('../models/Workspace').WorkspaceDocument;
    case 'tasks': return require('../models/Task');
    case 'meetings': return require('../models/Meeting').Meeting;
    case 'email': return require('../models/Email').Email;
    case 'messages': return require('../models/Message');
    case 'stickynotes': return require('../models/StickyNote');
    default: return null;
  }
}

// Normal search field configs per scope
const NORMAL_SEARCH_FIELDS = {
  workspace: { fields: ['title', 'tags'], titleField: 'title' },
  tasks: { fields: ['title'], titleField: 'title' },
  meetings: { fields: ['title', 'agenda'], titleField: 'title' },
  email: { fields: ['subject', 'fromName', 'from'], titleField: 'subject' },
  messages: { fields: ['content'], titleField: 'content' },
  stickynotes: { fields: ['title'], titleField: 'title' }
};

// ══════════════════════════════════════
//  NORMAL SEARCH (instant, metadata)
// ══════════════════════════════════════

// GET /api/v1/search/normal — normal metadata search
router.get('/normal', protect, async (req, res) => {
  try {
    const { q, scope, limit = 20 } = req.query;
    if (!q || !scope) return res.status(400).json({ error: 'q and scope required.' });

    const config = NORMAL_SEARCH_FIELDS[scope];
    if (!config) return res.status(400).json({ error: 'Invalid scope.' });

    const Model = getModel(scope);
    if (!Model) return res.status(400).json({ error: 'Invalid scope.' });

    // S8: escape regex metacharacters before building the query
    const safeQ = escapeRegex(q);

    // Build regex query for each field using the escaped query
    const orConditions = config.fields.map(field => ({
      [field]: { $regex: safeQ, $options: 'i' }
    }));

    let query = { $or: orConditions };

    // Scope-specific access filters — S8: tightened to prevent cross-user leaks.
    // Previously these scopes only filtered by isActive/isDeleted, exposing
    // titles/content of private items across the whole company.
    if (scope === 'email') {
      query.user = req.user._id;
      query.isDeleted = false;
    } else if (scope === 'stickynotes') {
      query.$and = [
        { $or: orConditions },
        { $or: [{ creator: req.user._id }, { 'sharedWith.user': req.user._id }] }
      ];
      delete query.$or;
      query.isActive = true;
    } else if (scope === 'tasks') {
      // Only see tasks you created, are assigned to, or watch — unless main_admin
      query.isActive = true;
      if (req.user.role !== 'main_admin') {
        const uid = req.user._id;
        query.$and = [
          { $or: orConditions },
          { $or: [{ createdBy: uid }, { assignees: uid }, { watchers: uid }, { isPrivate: { $ne: true } }] }
        ];
        delete query.$or;
      }
    } else if (scope === 'meetings') {
      query.isActive = true;
      if (req.user.role !== 'main_admin') {
        const uid = req.user._id;
        query.$and = [
          { $or: orConditions },
          { $or: [{ createdBy: uid }, { 'attendees.user': uid }] }
        ];
        delete query.$or;
      }
    } else if (scope === 'messages') {
      // User must be in the channel to see messages from it
      const Channel = require('../models/Channel');
      const memberChannels = await Channel.find({ members: req.user._id }).select('_id').lean();
      const channelIds = memberChannels.map(c => c._id);
      query.$and = [
        { $or: orConditions },
        { channel: { $in: channelIds } },
      ];
      delete query.$or;
      query.isDeleted = false;
    } else if (scope === 'workspace') {
      // Only workspace documents whose workspace lists the user as a member
      const { Workspace } = require('../models/Workspace');
      const memberWs = await Workspace.find({ members: req.user._id, isActive: true }).select('_id').lean();
      const wsIds = memberWs.map(w => w._id);
      query.$and = [
        { $or: orConditions },
        { workspace: { $in: wsIds } },
      ];
      delete query.$or;
      query.isActive = true;
    }

    const results = await Model.find(query)
      .select(`${config.fields.join(' ')} _id createdAt`)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean();

    const formatted = results.map(r => ({
      entityType: scope,
      entityId: r._id,
      title: r[config.titleField] || 'Untitled',
      snippet: config.fields.map(f => r[f]).filter(Boolean).join(' — ').substring(0, 120),
      createdAt: r.createdAt
    }));

    res.json(formatted);
  } catch (err) {
    console.error('Normal search error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ══════════════════════════════════════
//  DEEP SEARCH (background chunked job)
// ══════════════════════════════════════

// POST /api/v1/search/deep — queue a deep search job
router.post('/deep', protect, async (req, res) => {
  try {
    const { query, scope } = req.body;
    if (!query || !scope) return res.status(400).json({ error: 'query and scope required.' });

    // Check max concurrent for this user
    const activeJobs = await DeepSearchJob.countDocuments({
      userId: req.user._id,
      status: { $in: ['pending', 'processing'] }
    });
    if (activeJobs >= 2) {
      return res.status(429).json({ error: 'Max 2 concurrent deep searches. Please wait or cancel an existing one.' });
    }

    const job = await DeepSearchJob.create({
      userId: req.user._id,
      query,
      scope
    });

    res.status(201).json({
      jobId: job._id,
      status: 'pending',
      message: 'Deep search queued. Results will be delivered progressively.'
    });
  } catch (err) {
    console.error('Queue deep search error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/search/deep/:jobId — get job status and results
router.get('/deep/:jobId', protect, async (req, res) => {
  try {
    const job = await DeepSearchJob.findOne({ _id: req.params.jobId, userId: req.user._id });
    if (!job) return res.status(404).json({ error: 'Job not found.' });
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/search/deep/:jobId/cancel — cancel a job
router.put('/deep/:jobId/cancel', protect, async (req, res) => {
  try {
    const job = await DeepSearchJob.findOneAndUpdate(
      { _id: req.params.jobId, userId: req.user._id, status: { $in: ['pending', 'processing'] } },
      { status: 'cancelled' },
      { new: true }
    );
    if (!job) return res.status(404).json({ error: 'Job not found or already finished.' });
    res.json({ ok: true, results: job.results || [] });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/search/deep — list user's recent deep search jobs
router.get('/deep', protect, async (req, res) => {
  try {
    const jobs = await DeepSearchJob.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(10);
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ══════════════════════════════════════
//  GLOBAL SEARCH (Session 15 — ⌘K palette)
// ══════════════════════════════════════

// GET /api/v1/search/global?q=TERM&limit=5
// Runs the per-scope normal search in parallel, returns grouped results.
// Uses the same access-scoping logic as /search/normal so results respect
// membership. Also includes people search (name/email/jobTitle).
router.get('/global', protect, async (req, res) => {
  try {
    const { q, limit = 5 } = req.query;
    if (!q || q.trim().length < 2) return res.json({ q, groups: [] });

    const safeQ = escapeRegex(q);
    const perScopeLimit = Math.max(1, Math.min(10, Number(limit) || 5));

    // Runs a single scope's query. Returns `{ key, label, items }`.
    async function runScope(scope) {
      const Model = getModel(scope);
      const config = NORMAL_SEARCH_FIELDS[scope];
      if (!Model || !config) return null;

      // Reuse the same filter-building pattern as /search/normal
      const orConditions = config.fields.map(field => ({ [field]: { $regex: safeQ, $options: 'i' } }));
      let query = { $or: orConditions };
      const uid = req.user._id;

      if (scope === 'email') {
        query.user = uid; query.isDeleted = false;
      } else if (scope === 'stickynotes') {
        query.$and = [{ $or: orConditions }, { $or: [{ creator: uid }, { 'sharedWith.user': uid }] }];
        delete query.$or; query.isActive = true;
      } else if (scope === 'tasks') {
        query.isActive = true;
        if (req.user.role !== 'main_admin') {
          query.$and = [
            { $or: orConditions },
            { $or: [{ createdBy: uid }, { assignees: uid }, { watchers: uid }, { isPrivate: { $ne: true } }] },
          ];
          delete query.$or;
        }
      } else if (scope === 'meetings') {
        query.isActive = true;
        if (req.user.role !== 'main_admin') {
          query.$and = [
            { $or: orConditions },
            { $or: [{ createdBy: uid }, { 'attendees.user': uid }] },
          ];
          delete query.$or;
        }
      } else if (scope === 'messages') {
        const Channel = require('../models/Channel');
        const memberChannels = await Channel.find({ members: uid }).select('_id').lean();
        query.$and = [{ $or: orConditions }, { channel: { $in: memberChannels.map(c => c._id) } }];
        delete query.$or; query.isDeleted = false;
      } else if (scope === 'workspace') {
        const { Workspace } = require('../models/Workspace');
        const memberWs = await Workspace.find({ members: uid, isActive: true }).select('_id').lean();
        query.$and = [{ $or: orConditions }, { workspace: { $in: memberWs.map(w => w._id) } }];
        delete query.$or; query.isActive = true;
      }

      const items = await Model.find(query).select(config.fields.concat(['_id', 'createdAt'])).limit(perScopeLimit).lean();
      const titleField = config.titleField;
      return {
        key: scope,
        items: items.map(it => ({
          id: it._id,
          title: String(it[titleField] || '').slice(0, 140) || '(no title)',
          subtitle: scope === 'email' ? it.fromName || it.from
                  : scope === 'messages' ? null
                  : null,
          createdAt: it.createdAt,
        })),
      };
    }

    async function runPeople() {
      const User = require('../models/User');
      // Everyone can search people by name/email/jobTitle (intentional — same
      // info surfaced in member pickers). Exclude deactivated users.
      const users = await User.find({
        isActive: true,
        $or: [
          { name:     { $regex: safeQ, $options: 'i' } },
          { email:    { $regex: safeQ, $options: 'i' } },
          { jobTitle: { $regex: safeQ, $options: 'i' } },
        ],
      }).select('name email jobTitle avatar').limit(perScopeLimit).lean();

      return {
        key: 'people',
        items: users.map(u => ({
          id: u._id,
          title: u.name,
          subtitle: u.jobTitle || u.email,
          avatar: u.avatar,
        })),
      };
    }

    const scopes = ['tasks', 'meetings', 'messages', 'workspace', 'email', 'stickynotes'];
    const settled = await Promise.allSettled([
      ...scopes.map(s => runScope(s)),
      runPeople(),
    ]);
    const groups = settled
      .filter(r => r.status === 'fulfilled' && r.value && r.value.items.length > 0)
      .map(r => r.value);

    res.json({ q, groups });
  } catch (err) {
    console.error('[search] global failed:', err.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;

