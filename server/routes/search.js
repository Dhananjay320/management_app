const router = require('express').Router();
const DeepSearchJob = require('../models/DeepSearchJob');
const { protect } = require('../middleware/auth');

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

    // Build regex query for each field
    const orConditions = config.fields.map(field => ({
      [field]: { $regex: q, $options: 'i' }
    }));

    let query = { $or: orConditions };

    // Scope-specific access filters
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
      query.isActive = true;
    } else if (scope === 'meetings') {
      query.isActive = true;
    } else if (scope === 'messages') {
      query.isDeleted = false;
    } else if (scope === 'workspace') {
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
//  SEARCH HISTORY
// ══════════════════════════════════════

// Search history stored client-side (localStorage) per the spec
// This endpoint is a convenience for server-tracked history if needed

module.exports = router;
