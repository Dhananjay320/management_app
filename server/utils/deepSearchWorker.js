const DeepSearchJob = require('../models/DeepSearchJob');
const path = require('path');
const { extractTextFromFile, isExtractable } = require('./fileTextExtractor');

// Models for each scope
const SCOPE_CONFIGS = {
  workspace: {
    model: () => require('../models/Workspace').WorkspaceDocument,
    textField: 'plainTextContent',
    titleField: 'title',
    entityType: 'document'
  },
  tasks: {
    model: () => require('../models/Task'),
    textField: 'plainTextDescription',
    titleField: 'title',
    entityType: 'task',
    fallbackField: 'description'
  },
  meetings: {
    model: () => {
      const { MoM } = require('../models/Meeting');
      return MoM;
    },
    textField: 'plainTextContent',
    titleField: 'title',
    entityType: 'mom'
  },
  email: {
    model: () => require('../models/Email').Email,
    textField: 'bodyText',
    titleField: 'subject',
    entityType: 'email'
  },
  messages: {
    model: () => require('../models/Message'),
    textField: 'content',
    titleField: 'content',
    entityType: 'message'
  },
  stickynotes: {
    model: () => require('../models/StickyNote'),
    textField: 'content',
    titleField: 'title',
    entityType: 'stickynote'
  }
};

const CHUNK_SIZE = 20;
const CHUNK_DELAY = 10000; // 10 seconds
const MAX_RESULTS = 4;
const MAX_CONCURRENT = 2;

function getSnippet(text, query, maxLen = 120) {
  const lower = (text || '').toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return (text || '').substring(0, maxLen);
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + query.length + 80);
  let snippet = text.substring(start, end);
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet += '...';
  return snippet;
}

async function processJob(job, io) {
  try {
    const config = SCOPE_CONFIGS[job.scope];
    if (!config) {
      job.status = 'complete';
      job.completedAt = new Date();
      await job.save();
      return;
    }

    const Model = config.model();

    // Count total documents
    const totalDocs = await Model.countDocuments({});
    job.totalChunks = Math.ceil(totalDocs / CHUNK_SIZE);
    job.status = 'processing';
    await job.save();

    let skip = 0;
    let totalFound = 0;

    while (skip < totalDocs) {
      // Check if cancelled
      const fresh = await DeepSearchJob.findById(job._id);
      if (fresh.status === 'cancelled') {
        if (io) {
          io.to(`user:${job.userId}`).emit('deep_search_cancelled', {
            jobId: job._id,
            results: fresh.results || []
          });
        }
        return;
      }

      // Fetch chunk
      const docs = await Model.find({})
        .select(`${config.textField} ${config.titleField} ${config.fallbackField || ''}`)
        .skip(skip)
        .limit(CHUNK_SIZE)
        .lean();

      // Search in chunk
      const chunkResults = [];
      for (const doc of docs) {
        const searchText = doc[config.textField] || doc[config.fallbackField] || '';
        if (searchText.toLowerCase().includes(job.query.toLowerCase())) {
          chunkResults.push({
            entityType: config.entityType,
            entityId: doc._id,
            title: doc[config.titleField] || 'Untitled',
            snippet: getSnippet(searchText, job.query),
            matchIndex: searchText.toLowerCase().indexOf(job.query.toLowerCase())
          });
        }
      }

      // Add results
      if (chunkResults.length > 0) {
        job.results = [...(job.results || []), ...chunkResults];
        totalFound = job.results.length;
        await job.save();

        // Send partial results via WebSocket
        if (io) {
          io.to(`user:${job.userId}`).emit('deep_search_partial', {
            jobId: job._id,
            newResults: chunkResults,
            totalFound
          });
        }

        // Stop if we hit max results
        if (totalFound >= MAX_RESULTS) {
          job.status = 'complete';
          job.completedAt = new Date();
          await job.save();

          if (io) {
            io.to(`user:${job.userId}`).emit('deep_search_complete', {
              jobId: job._id,
              totalFound,
              message: `Search complete — ${totalFound} results found. Refine your search for different results.`
            });
          }
          return;
        }
      }

      skip += CHUNK_SIZE;
      job.processedChunks = Math.ceil(skip / CHUNK_SIZE);
      await job.save();

      // Send progress
      if (io) {
        io.to(`user:${job.userId}`).emit('deep_search_progress', {
          jobId: job._id,
          processedChunks: job.processedChunks,
          totalChunks: job.totalChunks,
          totalFound
        });
      }

      // Delay between chunks
      if (skip < totalDocs) {
        await new Promise(resolve => setTimeout(resolve, CHUNK_DELAY));
      }
    }

    // ═══ FILE CONTENT SEARCH (when searchFiles toggle is ON) ═══
    if (job.searchFiles && (job.results || []).length < MAX_RESULTS) {
      await searchFileContents(job, io);
    }

    // All chunks processed
    job.status = 'complete';
    job.completedAt = new Date();
    await job.save();

    const finalCount = (job.results || []).length;
    if (io) {
      io.to(`user:${job.userId}`).emit('deep_search_complete', {
        jobId: job._id,
        totalFound: finalCount,
        message: finalCount === 0
          ? 'No results found. Try different keywords.'
          : `${finalCount} result(s) found.`
      });
    }
  } catch (err) {
    console.error('Deep search worker error:', err);
    job.status = 'complete';
    job.completedAt = new Date();
    await job.save();
  }
}

// ═══ FILE CONTENT SEARCH ═══
// Searches inside uploaded file attachments (PDF, DOCX, TXT, etc.)
async function searchFileContents(job, io) {
  try {
    // Collect all files from different sources based on scope
    const { WorkspaceFile } = require('../models/Workspace');
    const Task = require('../models/Task');

    let files = [];

    // Workspace files
    if (job.scope === 'workspace' || job.scope === 'tasks') {
      const wsFiles = await WorkspaceFile.find({ isDeleted: false })
        .select('name originalName path mimeType workspace')
        .lean();
      files.push(...wsFiles.map(f => ({ ...f, source: 'workspace', sourceLabel: 'Workspace File' })));
    }

    // Task attachments
    if (job.scope === 'tasks' || job.scope === 'workspace') {
      const tasksWithAttachments = await Task.find({
        isActive: true,
        'attachments.0': { $exists: true }
      }).select('title attachments').lean();

      for (const task of tasksWithAttachments) {
        for (const att of (task.attachments || [])) {
          files.push({
            _id: task._id,
            name: att.name,
            path: att.path,
            mimeType: att.mimeType,
            source: 'task_attachment',
            sourceLabel: `Task: ${task.title}`,
            taskTitle: task.title
          });
        }
      }
    }

    // Filter to only extractable file types
    files = files.filter(f => f.path && isExtractable(f.mimeType, f.name));

    if (files.length === 0) return;

    // Send progress update
    if (io) {
      io.to(`user:${job.userId}`).emit('deep_search_progress', {
        jobId: job._id,
        processedChunks: job.processedChunks,
        totalChunks: job.totalChunks + Math.ceil(files.length / CHUNK_SIZE),
        totalFound: (job.results || []).length,
        phase: 'files'
      });
    }

    // Process files in chunks
    for (let i = 0; i < files.length; i += CHUNK_SIZE) {
      // Check cancellation
      const fresh = await DeepSearchJob.findById(job._id);
      if (fresh.status === 'cancelled') return;

      const chunk = files.slice(i, i + CHUNK_SIZE);
      const chunkResults = [];

      for (const file of chunk) {
        try {
          // Resolve relative path to absolute for disk reading
          const absPath = file.path.startsWith('/') ? file.path : path.join(__dirname, '..', file.path);
          const text = await extractTextFromFile(absPath, file.mimeType);
          if (!text) continue;

          if (text.toLowerCase().includes(job.query.toLowerCase())) {
            chunkResults.push({
              entityType: 'file',
              entityId: file._id,
              title: `📄 ${file.originalName || file.name}`,
              snippet: getSnippet(text, job.query, 150),
              matchIndex: text.toLowerCase().indexOf(job.query.toLowerCase())
            });
          }
        } catch {
          // Skip files that fail to extract
        }
      }

      if (chunkResults.length > 0) {
        job.results = [...(job.results || []), ...chunkResults];
        await job.save();

        if (io) {
          io.to(`user:${job.userId}`).emit('deep_search_partial', {
            jobId: job._id,
            newResults: chunkResults,
            totalFound: job.results.length,
            phase: 'files'
          });
        }

        if (job.results.length >= MAX_RESULTS) return;
      }

      job.processedChunks = (job.processedChunks || 0) + 1;
      await job.save();

      // Delay between file chunks
      if (i + CHUNK_SIZE < files.length) {
        await new Promise(resolve => setTimeout(resolve, CHUNK_DELAY / 2)); // Faster for files
      }
    }
  } catch (err) {
    console.error('File content search error:', err.message);
  }
}

// Worker loop — checks for pending jobs every 30 seconds
let workerRunning = false;

function startDeepSearchWorker(io) {
  if (workerRunning) return;
  workerRunning = true;

  setInterval(async () => {
    try {
      // Check concurrent limit
      const activeCount = await DeepSearchJob.countDocuments({ status: 'processing' });
      if (activeCount >= MAX_CONCURRENT) return;

      // Pick next pending job
      const job = await DeepSearchJob.findOneAndUpdate(
        { status: 'pending' },
        { status: 'processing' },
        { new: true, sort: { createdAt: 1 } }
      );

      if (job) {
        processJob(job, io);
      }
    } catch (err) {
      console.error('Deep search worker poll error:', err);
    }
  }, 30000); // Check every 30 seconds

  console.log('Deep search worker started');
}

module.exports = { startDeepSearchWorker };
