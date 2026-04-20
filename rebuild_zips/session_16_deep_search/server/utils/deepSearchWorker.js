// ============================================================================
// deepSearchWorker.js — REAL indexed full-text search.
// ============================================================================
// Session 16 (C6). The previous version did brute-force String.includes
// through every document in a collection, 20 at a time, with 10-SECOND
// delays between chunks. Results took literal minutes to appear and scaled
// O(n) with the collection size. That was effectively a placeholder.
//
// This rewrite:
//   • Uses MongoDB $text search on indexes defined per-model (see each
//     model file for its text index definition — Session 16 added them
//     where they were missing: Message, Meeting, MoM, Email.bodyText,
//     StickyNote.content).
//   • Respects the same access scoping as /search/normal so users don't
//     see content they wouldn't see elsewhere.
//   • Returns weighted relevance scores from the text index.
//   • Completes in one pass (fast) instead of streaming chunked results,
//     but still emits socket events matching the old API so the existing
//     frontend just sees it finish quickly.
//
// The DeepSearchJob record is kept as the persistence/audit layer. The job
// now moves from pending -> processing -> complete in quick succession.
// ============================================================================

const DeepSearchJob = require('../models/DeepSearchJob');
const User = require('../models/User');

const MAX_RESULTS = 4;          // per spec, we still cap at 4 results
const MAX_CONCURRENT = 3;       // safe to bump up now that each job is fast
const SNIPPET_MAX_LEN = 160;
const POLL_INTERVAL_MS = 3_000; // poll for new jobs every 3s

// Snippet extraction. $text gives us matching docs + relevance, but we
// still build a snippet around the query term so the UI can show context.
function getSnippet(text, query, maxLen = SNIPPET_MAX_LEN) {
  if (!text) return '';
  const lower = text.toLowerCase();
  const q = String(query).toLowerCase().trim();
  let idx = lower.indexOf(q);
  if (idx === -1) {
    const firstWord = q.split(/\s+/)[0];
    idx = lower.indexOf(firstWord);
  }
  if (idx === -1) return text.slice(0, maxLen);
  const start = Math.max(0, idx - 40);
  const end   = Math.min(text.length, idx + q.length + 80);
  let snip = text.slice(start, end);
  if (start > 0) snip = '...' + snip;
  if (end < text.length) snip += '...';
  return snip;
}

// ─── Per-scope text-search handlers ─────────────────────────────────────────
const SCOPE_HANDLERS = {
  async tasks(query, user) {
    const Task = require('../models/Task');
    const filter = { $text: { $search: query }, isActive: true };
    if (user.role !== 'main_admin') {
      filter.$or = [
        { createdBy: user._id },
        { assignees: user._id },
        { watchers: user._id },
        { isPrivate: { $ne: true } },
      ];
    }
    const docs = await Task.find(filter, { score: { $meta: 'textScore' } })
      .select('title plainTextDescription description')
      .sort({ score: { $meta: 'textScore' } })
      .limit(MAX_RESULTS)
      .lean();
    return docs.map(d => ({
      entityType: 'task',
      entityId: d._id,
      title: d.title || 'Untitled',
      snippet: getSnippet(d.plainTextDescription || d.description || '', query),
      score: d.score || 0,
    }));
  },

  async meetings(query, user) {
    const { Meeting } = require('../models/Meeting');
    const filter = { $text: { $search: query }, isActive: true };
    if (user.role !== 'main_admin') {
      filter.$or = [
        { createdBy: user._id },
        { 'attendees.user': user._id },
      ];
    }
    const docs = await Meeting.find(filter, { score: { $meta: 'textScore' } })
      .select('title agenda')
      .sort({ score: { $meta: 'textScore' } })
      .limit(MAX_RESULTS)
      .lean();
    return docs.map(d => ({
      entityType: 'meeting',
      entityId: d._id,
      title: d.title,
      snippet: getSnippet(d.agenda || '', query),
      score: d.score || 0,
    }));
  },

  async messages(query, user) {
    const Message = require('../models/Message');
    const Channel = require('../models/Channel');
    const memberChannels = await Channel.find({ members: user._id }).select('_id').lean();
    const channelIds = memberChannels.map(c => c._id);
    const filter = {
      $text: { $search: query },
      channel: { $in: channelIds },
      isDeleted: false,
    };
    const docs = await Message.find(filter, { score: { $meta: 'textScore' } })
      .select('content channel')
      .sort({ score: { $meta: 'textScore' } })
      .limit(MAX_RESULTS)
      .lean();
    return docs.map(d => ({
      entityType: 'message',
      entityId: d._id,
      title: (d.content || '').slice(0, 80),
      snippet: getSnippet(d.content || '', query),
      score: d.score || 0,
      channelId: d.channel,
    }));
  },

  async workspace(query, user) {
    const { WorkspaceDocument, Workspace } = require('../models/Workspace');
    const memberWs = await Workspace.find({ members: user._id, isActive: true }).select('_id').lean();
    const wsIds = memberWs.map(w => w._id);
    const filter = {
      $text: { $search: query },
      workspace: { $in: wsIds },
      isActive: true,
    };
    const docs = await WorkspaceDocument.find(filter, { score: { $meta: 'textScore' } })
      .select('title plainTextContent workspace')
      .sort({ score: { $meta: 'textScore' } })
      .limit(MAX_RESULTS)
      .lean();
    return docs.map(d => ({
      entityType: 'document',
      entityId: d._id,
      title: d.title || 'Untitled',
      snippet: getSnippet(d.plainTextContent || '', query),
      score: d.score || 0,
      workspaceId: d.workspace,
    }));
  },

  async email(query, user) {
    const { Email } = require('../models/Email');
    const docs = await Email.find(
      { $text: { $search: query }, user: user._id, isDeleted: false },
      { score: { $meta: 'textScore' } }
    )
      .select('subject fromName bodyText')
      .sort({ score: { $meta: 'textScore' } })
      .limit(MAX_RESULTS)
      .lean();
    return docs.map(d => ({
      entityType: 'email',
      entityId: d._id,
      title: d.subject || '(No subject)',
      snippet: getSnippet(d.bodyText || '', query),
      score: d.score || 0,
    }));
  },

  async stickynotes(query, user) {
    const StickyNote = require('../models/StickyNote');
    const filter = {
      $text: { $search: query },
      isActive: true,
      $or: [{ creator: user._id }, { 'sharedWith.user': user._id }],
    };
    const docs = await StickyNote.find(filter, { score: { $meta: 'textScore' } })
      .select('title content')
      .sort({ score: { $meta: 'textScore' } })
      .limit(MAX_RESULTS)
      .lean();
    return docs.map(d => ({
      entityType: 'stickynote',
      entityId: d._id,
      title: d.title || 'Untitled',
      snippet: getSnippet(d.content || '', query),
      score: d.score || 0,
    }));
  },
};

// ─── Job processor ──────────────────────────────────────────────────────────
async function processJob(job, io) {
  try {
    job.status = 'processing';
    job.totalChunks = 1;
    job.processedChunks = 0;
    await job.save();

    const user = await User.findById(job.userId);
    if (!user) {
      job.status = 'complete';
      job.completedAt = new Date();
      await job.save();
      return;
    }

    const handler = SCOPE_HANDLERS[job.scope];
    if (!handler) {
      job.status = 'complete';
      job.completedAt = new Date();
      await job.save();
      return;
    }

    const q = String(job.query || '').trim();
    if (q.length < 2) {
      job.results = [];
      job.status = 'complete';
      job.completedAt = new Date();
      await job.save();
      if (io) {
        io.to(`user:${job.userId}`).emit('deep_search_complete', {
          jobId: job._id,
          totalFound: 0,
          message: 'Query too short.',
        });
      }
      return;
    }

    const fresh = await DeepSearchJob.findById(job._id);
    if (fresh?.status === 'cancelled') {
      if (io) {
        io.to(`user:${job.userId}`).emit('deep_search_cancelled', {
          jobId: job._id,
          results: [],
        });
      }
      return;
    }

    let results = [];
    try {
      results = await handler(q, user);
    } catch (err) {
      // Most common cause: no text index on the target collection yet.
      console.error(`[deep-search] scope ${job.scope} failed:`, err.message);
      results = [];
    }

    job.results = results;
    job.processedChunks = 1;
    job.status = 'complete';
    job.completedAt = new Date();
    await job.save();

    if (io) {
      if (results.length > 0) {
        io.to(`user:${job.userId}`).emit('deep_search_partial', {
          jobId: job._id,
          newResults: results,
          totalFound: results.length,
        });
      }
      io.to(`user:${job.userId}`).emit('deep_search_complete', {
        jobId: job._id,
        totalFound: results.length,
        message: results.length === 0
          ? 'No results found. Try different keywords.'
          : `${results.length} result(s) found.`,
      });
    }
  } catch (err) {
    console.error('[deep-search] worker error:', err);
    try {
      job.status = 'complete';
      job.completedAt = new Date();
      await job.save();
    } catch {}
  }
}

// ─── Worker loop ────────────────────────────────────────────────────────────
let workerRunning = false;

function startDeepSearchWorker(io) {
  if (workerRunning) return;
  workerRunning = true;

  setInterval(async () => {
    try {
      const activeCount = await DeepSearchJob.countDocuments({ status: 'processing' });
      if (activeCount >= MAX_CONCURRENT) return;

      const job = await DeepSearchJob.findOneAndUpdate(
        { status: 'pending' },
        { status: 'processing' },
        { new: true, sort: { createdAt: 1 } }
      );

      if (job) {
        processJob(job, io);
      }
    } catch (err) {
      console.error('[deep-search] poll error:', err.message);
    }
  }, POLL_INTERVAL_MS);

  console.log('[deep-search] worker started (text-index backed)');
}

module.exports = { startDeepSearchWorker };
