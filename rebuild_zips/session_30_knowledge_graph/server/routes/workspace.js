const router = require('express').Router();
const { Workspace, WorkspaceDocument, WorkspaceNote, WorkspaceFile, WorkspaceLink } = require('../models/Workspace');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { logAction } = require('../utils/audit');

// ═══════════════════════════════════════════════════════════════════════════
// Session 4 security fixes applied in this file:
//   S5  — isWorkspaceMember() guard on all workspace-scoped routes
//   Bug — /my-invites route moved BEFORE /:id so it isn't swallowed
//   S* — workspace.delete audited via logAction
// ═══════════════════════════════════════════════════════════════════════════

// Returns true if user is a member (or main_admin with override power).
function isWorkspaceMember(ws, user) {
  if (!ws || !user) return false;
  const uid = String(user._id);
  const isMember = (ws.members || []).some(m => String(m._id || m) === uid);
  const isCreator = String(ws.createdBy?._id || ws.createdBy) === uid;
  const hasOverride = user.role === 'main_admin' || user.powers?.workspace?.viewPrivate;
  return isMember || isCreator || hasOverride;
}

// Middleware: load workspace by :id into req.workspace and verify access.
// Use on any route that accepts :id as a workspace id.
async function requireWorkspaceMember(req, res, next) {
  try {
    const ws = await Workspace.findById(req.params.id);
    if (!ws) return res.status(404).json({ error: 'Workspace not found.' });
    if (!isWorkspaceMember(ws, req.user)) {
      return res.status(403).json({ error: 'You do not have access to this workspace.' });
    }
    req.workspace = ws;
    next();
  } catch (err) {
    console.error('[workspace] member-check failed', err);
    res.status(500).json({ error: 'Server error.' });
  }
}

// Middleware variant: verify access by finding the workspace that owns a document/note/file/link.
// Checks req.params[paramKey] to fetch the child, then checks its workspace.
function requireMemberViaChild(ModelCtor, paramKey) {
  return async function (req, res, next) {
    try {
      const child = await ModelCtor.findById(req.params[paramKey]);
      if (!child) return res.status(404).json({ error: 'Item not found.' });
      const ws = await Workspace.findById(child.workspace);
      if (!ws) return res.status(404).json({ error: 'Workspace not found.' });
      if (!isWorkspaceMember(ws, req.user)) {
        return res.status(403).json({ error: 'You do not have access to this item.' });
      }
      req.workspace = ws;
      req.workspaceChild = child;
      next();
    } catch (err) {
      console.error('[workspace] child member-check failed', err);
      res.status(500).json({ error: 'Server error.' });
    }
  };
}

// ─── WORKSPACES ───

router.get('/', protect, async (req, res) => {
  try {
    const workspaces = await Workspace.find({ members: req.user._id, isActive: true })
      .populate('createdBy', 'name')
      .populate('team', 'name')
      .sort({ updatedAt: -1 });

    const result = await Promise.all(workspaces.map(async (ws) => {
      const [docCount, noteCount, fileCount, linkCount] = await Promise.all([
        WorkspaceDocument.countDocuments({ workspace: ws._id, isActive: true }),
        WorkspaceNote.countDocuments({ workspace: ws._id, isActive: true }),
        WorkspaceFile.countDocuments({ workspace: ws._id, isDeleted: false }),
        WorkspaceLink.countDocuments({ workspace: ws._id })
      ]);
      return { ...ws.toObject(), docCount, noteCount, fileCount, linkCount };
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/', protect, async (req, res) => {
  try {
    const { name, description, icon, color, type, team, members } = req.body;
    const memberIds = members || [];
    if (!memberIds.includes(req.user._id.toString())) memberIds.push(req.user._id);

    const ws = await Workspace.create({
      name, description, icon, color, type: type || 'personal',
      createdBy: req.user._id, members: memberIds, team
    });
    res.status(201).json(ws);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// BUG FIX (audit Section 7): /my-invites must come BEFORE /:id route,
// otherwise Express matches /:id with id='my-invites' and this route is unreachable.
// GET /api/v1/workspace/my-invites — get pending workspace invites for current user
router.get('/my-invites', protect, async (req, res) => {
  try {
    const workspaces = await Workspace.find({
      'pendingInvites.user': req.user._id,
      'pendingInvites.status': 'pending',
      isActive: true
    }).select('name icon color type pendingInvites');

    const invites = workspaces.map(ws => {
      const invite = ws.pendingInvites.find(
        i => i.user.toString() === req.user._id.toString() && i.status === 'pending'
      );
      return { workspaceId: ws._id, name: ws.name, icon: ws.icon, invitedAt: invite?.createdAt };
    });

    res.json(invites);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.get('/:id', protect, requireWorkspaceMember, async (req, res) => {
  try {
    const ws = await Workspace.findById(req.params.id)
      .populate('members', 'name email avatar')
      .populate('createdBy', 'name')
      .populate('team', 'name');
    if (!ws) return res.status(404).json({ error: 'Workspace not found.' });

    const [documents, notes, files, links] = await Promise.all([
      WorkspaceDocument.find({ workspace: ws._id, isActive: true }).populate('createdBy', 'name').populate('lastEditedBy', 'name').sort({ updatedAt: -1 }),
      WorkspaceNote.find({ workspace: ws._id, isActive: true }).sort({ updatedAt: -1 }),
      WorkspaceFile.find({ workspace: ws._id, isDeleted: false }).populate('uploadedBy', 'name').sort({ createdAt: -1 }),
      WorkspaceLink.find({ workspace: ws._id }).populate('addedBy', 'name').sort({ createdAt: -1 })
    ]);

    res.json({ ...ws.toObject(), documents, notes, files, links });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── DOCUMENTS ───

router.post('/:id/documents', protect, requireWorkspaceMember, async (req, res) => {
  try {
    const doc = await WorkspaceDocument.create({
      workspace: req.params.id,
      title: req.body.title || 'Untitled Document',
      tiptapJSON: req.body.tiptapJSON,
      classification: req.body.classification || 'personal',
      tags: req.body.tags || [],
      createdBy: req.user._id,
      lastEditedBy: req.user._id
    });
    res.status(201).json(doc);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.get('/documents/:docId', protect, requireMemberViaChild(WorkspaceDocument, 'docId'), async (req, res) => {
  try {
    const doc = await WorkspaceDocument.findById(req.params.docId)
      .populate('createdBy', 'name')
      .populate('lastEditedBy', 'name');
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.put('/documents/:docId', protect, requireMemberViaChild(WorkspaceDocument, 'docId'), async (req, res) => {
  try {
    const updates = { ...req.body, lastEditedBy: req.user._id };
    // Extract plain text from tiptap if provided
    if (updates.tiptapJSON) {
      updates.plainTextContent = extractPlainText(updates.tiptapJSON);
      // Session 30 (N5): re-resolve backlinks whenever the body changes.
      // Needs the current doc's workspace + id for scoping and self-filtering.
      try {
        const current = await WorkspaceDocument.findById(req.params.docId, 'workspace').lean();
        if (current) {
          updates.backlinksOut = await resolveBacklinks(
            updates.plainTextContent,
            current.workspace,
            req.params.docId,
          );
        }
      } catch (e) {
        // Backlink resolution is best-effort — never block a save on it.
        console.warn('[backlinks] resolve error:', e.message);
      }
    }
    const doc = await WorkspaceDocument.findByIdAndUpdate(req.params.docId, updates, { new: true });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.delete('/documents/:docId', protect, requireMemberViaChild(WorkspaceDocument, 'docId'), async (req, res) => {
  try {
    await WorkspaceDocument.findByIdAndUpdate(req.params.docId, { isActive: false });
    res.json({ message: 'Document deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── NOTES ───

router.post('/:id/notes', protect, requireWorkspaceMember, async (req, res) => {
  try {
    const note = await WorkspaceNote.create({
      workspace: req.params.id,
      title: req.body.title || 'Untitled Note',
      content: req.body.content || '',
      color: req.body.color,
      createdBy: req.user._id
    });
    res.status(201).json(note);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.put('/notes/:noteId', protect, requireMemberViaChild(WorkspaceNote, 'noteId'), async (req, res) => {
  try {
    const note = await WorkspaceNote.findByIdAndUpdate(req.params.noteId, req.body, { new: true });
    res.json(note);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.delete('/notes/:noteId', protect, requireMemberViaChild(WorkspaceNote, 'noteId'), async (req, res) => {
  try {
    await WorkspaceNote.findByIdAndUpdate(req.params.noteId, { isActive: false });
    res.json({ message: 'Note deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── LINKS ───

router.post('/:id/links', protect, requireWorkspaceMember, async (req, res) => {
  try {
    const link = await WorkspaceLink.create({
      workspace: req.params.id,
      url: req.body.url,
      title: req.body.title || req.body.url,
      description: req.body.description || '',
      image: req.body.image || '',
      addedBy: req.user._id
    });
    res.status(201).json(link);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.delete('/links/:linkId', protect, requireMemberViaChild(WorkspaceLink, 'linkId'), async (req, res) => {
  try {
    await WorkspaceLink.findByIdAndDelete(req.params.linkId);
    res.json({ message: 'Link deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── FILE UPLOADS ───

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '..', 'uploads', 'workspace');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB

router.post('/:id/files', protect, requireWorkspaceMember, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const wsFile = await WorkspaceFile.create({
      workspace: req.params.id,
      name: req.file.filename,
      originalName: req.file.originalname,
      path: req.file.path,
      mimeType: req.file.mimetype,
      originalSize: req.file.size,
      compressedSize: req.file.size, // No compression yet (future: per-type compression)
      compressionRatio: 1,
      uploadedBy: req.user._id
    });

    const populated = await WorkspaceFile.findById(wsFile._id).populate('uploadedBy', 'name');
    res.status(201).json(populated);
  } catch (err) {
    console.error('File upload error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.delete('/files/:fileId', protect, requireMemberViaChild(WorkspaceFile, 'fileId'), async (req, res) => {
  try {
    await WorkspaceFile.findByIdAndUpdate(req.params.fileId, { isDeleted: true });
    res.json({ message: 'File deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── MEMBER MANAGEMENT ───

const Channel = require('../models/Channel');
const Message = require('../models/Message');

// PUT /api/v1/workspace/:id/members — add members (with cross-team invite flow per spec 8.2)
router.put('/:id/members', protect, requireWorkspaceMember, async (req, res) => {
  try {
    const { userIds } = req.body;
    const ws = await Workspace.findById(req.params.id);
    if (!ws) return res.status(404).json({ error: 'Workspace not found.' });

    const io = req.app.get('io');

    for (const uid of userIds) {
      if (ws.members.some(m => m.toString() === uid)) continue;

      if (ws.type === 'cross_team') {
        // Cross-team invite flow per spec Section 8.2:
        // Step 1: Creator adds person from different team
        // Step 2: Person receives DM — "I want to add you to this workspace: [Name]"
        // Step 3: Accept → silent access granted. Reject → creator notified.

        // Create or find DM between creator and invitee
        const otherUser = await User.findById(uid).select('name');
        let dm = await Channel.findOne({
          type: 'dm', members: { $all: [req.user._id, uid], $size: 2 }
        });
        if (!dm) {
          dm = await Channel.create({
            name: `DM: ${req.user.name} & ${otherUser.name}`,
            type: 'dm', members: [req.user._id, uid], createdBy: req.user._id
          });
        }

        // Send invite DM
        await Message.create({
          channel: dm._id, sender: req.user._id,
          content: `I want to add you to workspace "${ws.name}". Would you like to join?\n\nAccept or reject from the notification.`,
          type: 'system'
        });

        // Track invite
        ws.pendingInvites.push({ user: uid, invitedBy: req.user._id, dmChannel: dm._id });

        // Socket notification
        if (io) {
          io.to(`user:${uid}`).emit('notification:new', {
            type: 'approval',
            title: 'Workspace Invitation',
            message: `${req.user.name} wants to add you to workspace "${ws.name}"`,
            actionType: 'workspace_invite',
            actionTarget: ws._id.toString()
          });
        }
      } else {
        // Team/personal — direct add
        ws.members.push(uid);
      }
    }
    await ws.save();

    const populated = await Workspace.findById(ws._id).populate('members', 'name email avatar');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/workspace/:id/invite-respond — accept or reject cross-team invite
router.post('/:id/invite-respond', protect, async (req, res) => {
  try {
    const { response } = req.body; // 'accept' or 'reject'
    const ws = await Workspace.findById(req.params.id);
    if (!ws) return res.status(404).json({ error: 'Workspace not found.' });

    const invite = ws.pendingInvites.find(
      i => i.user.toString() === req.user._id.toString() && i.status === 'pending'
    );
    if (!invite) return res.status(404).json({ error: 'No pending invite found.' });

    const io = req.app.get('io');

    if (response === 'accept') {
      // Accept — silent access granted, appear in members list
      invite.status = 'accepted';
      if (!ws.members.some(m => m.toString() === req.user._id.toString())) {
        ws.members.push(req.user._id);
      }
    } else {
      // Reject — creator notified in the DM thread
      invite.status = 'rejected';
      if (invite.dmChannel) {
        await Message.create({
          channel: invite.dmChannel, sender: req.user._id,
          content: `${req.user.name} declined the invitation to workspace "${ws.name}".`,
          type: 'system'
        });
      }
      if (io) {
        io.to(`user:${invite.invitedBy}`).emit('notification:new', {
          type: 'approval',
          title: 'Workspace Invite Declined',
          message: `${req.user.name} declined your invite to "${ws.name}"`
        });
      }
    }

    await ws.save();
    res.json({ ok: true, status: response });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── EXTERNAL SHARING (Spec Section 8.5 — Client docs only) ───

// POST /api/v1/workspace/documents/:docId/request-share — request admin approval for external sharing
router.post('/documents/:docId/request-share', protect, requireMemberViaChild(WorkspaceDocument, 'docId'), async (req, res) => {
  try {
    const { externalEmail } = req.body;
    const doc = await WorkspaceDocument.findById(req.params.docId);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });

    // Only Client classification docs can be shared externally
    if (doc.classification !== 'client') {
      return res.status(400).json({ error: 'Only Client-classified documents can be shared externally.' });
    }

    const ws = await Workspace.findById(doc.workspace);
    ws.externalShares.push({
      documentId: doc._id,
      externalEmail,
      requestedBy: req.user._id,
      status: 'pending_approval'
    });
    await ws.save();

    // Notify admins
    const io = req.app.get('io');
    const admins = await User.find({ role: 'main_admin', isActive: true }).select('_id');
    if (io) {
      admins.forEach(a => {
        io.to(`user:${a._id}`).emit('notification:new', {
          type: 'approval',
          title: 'External Sharing Request',
          message: `${req.user.name} requests to share "${doc.title}" with ${externalEmail}`
        });
      });
    }

    res.json({ message: 'Sharing request sent to admin for approval.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/workspace/:id/external-share/:shareId/approve — admin approves sharing
router.put('/:id/external-share/:shareId/approve', protect, requireWorkspaceMember, async (req, res) => {
  try {
    if (!['main_admin', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin approval required.' });
    }

    const ws = await Workspace.findById(req.params.id);
    const share = ws.externalShares.id(req.params.shareId);
    if (!share) return res.status(404).json({ error: 'Share request not found.' });

    const { approved } = req.body;
    if (approved) {
      share.status = 'approved';
      share.approvedBy = req.user._id;
      share.shareToken = require('crypto').randomBytes(16).toString('hex');
    } else {
      share.status = 'rejected';
    }
    await ws.save();

    // Notify requester
    const io = req.app.get('io');
    if (io && share.requestedBy) {
      io.to(`user:${share.requestedBy}`).emit('notification:new', {
        type: 'approval',
        title: approved ? 'Sharing Approved' : 'Sharing Rejected',
        message: approved
          ? `Your request to share externally has been approved. Token: ${share.shareToken}`
          : 'Your external sharing request was rejected by admin.'
      });
    }

    res.json({ ok: true, status: share.status });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/v1/workspace/:id/members/:userId — remove member
router.delete('/:id/members/:userId', protect, requireWorkspaceMember, async (req, res) => {
  try {
    const ws = await Workspace.findById(req.params.id);
    if (!ws) return res.status(404).json({ error: 'Workspace not found.' });

    // Only creator can remove members
    if (ws.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only workspace creator can remove members.' });
    }

    ws.members = ws.members.filter(m => m.toString() !== req.params.userId);
    await ws.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/workspace/:id — update workspace settings
router.put('/:id', protect, requireWorkspaceMember, async (req, res) => {
  try {
    const { name, description, icon, color } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (description !== undefined) update.description = description;
    if (icon !== undefined) update.icon = icon;
    if (color !== undefined) update.color = color;

    const ws = await Workspace.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('members', 'name email avatar');
    res.json(ws);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// TipTap plain text extractor
function extractPlainText(tiptapJSON) {
  let text = '';
  function traverse(node) {
    if (node.type === 'text' && node.text) text += node.text + ' ';
    if (node.content && Array.isArray(node.content)) node.content.forEach(traverse);
    if (['paragraph', 'heading', 'listItem', 'taskItem', 'blockquote', 'codeBlock'].includes(node.type)) text += '\n';
  }
  traverse(tiptapJSON);
  return text.trim();
}

// ─── Session 30 (N5): backlink parsing ─────────────────────────────────
// Scan plain text for [[Title]] tokens and resolve each to a real document
// within the same workspace (case-insensitive, whitespace-collapsed match).
// Unresolved tokens are still recorded with targetId = null + the title,
// so the graph can later show them as "pending links" or highlight missing
// references.
//
// Matching rules:
//   - [[Doc Title]] matches any document whose `title` (trimmed, lowercased)
//     equals the lowercased+trimmed token
//   - Duplicate [[...]] references to the same target are de-duped
//   - Self-references (links to the current doc) are allowed but noted
//   - Scans the PLAIN TEXT only — if someone pastes HTML with literal
//     "[[" characters it still works, which is what we want
async function resolveBacklinks(plainText, workspaceId, currentDocId) {
  if (!plainText) return [];
  // Match [[anything not containing ] or newlines]]
  const re = /\[\[([^\]\n]{1,200})\]\]/g;
  const found = new Map();  // normalizedTitle → originalTitle
  let m;
  while ((m = re.exec(plainText)) !== null) {
    const raw = m[1].trim();
    if (!raw) continue;
    const norm = raw.toLowerCase().replace(/\s+/g, ' ');
    if (!found.has(norm)) found.set(norm, raw);
  }
  if (found.size === 0) return [];

  // Fetch candidates from the same workspace in one query. We use a regex
  // to match titles case-insensitively rather than running N queries.
  const titlesArray = [...found.values()];
  const docs = await WorkspaceDocument.find({
    workspace: workspaceId,
    isActive: true,
    // Escape regex metacharacters and build an `$or` of exact-match, case-insensitive
    $or: titlesArray.map(t => ({
      title: new RegExp('^' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'),
    })),
  }, '_id title').lean();

  // Build map: normalized title → doc
  const titleToDoc = new Map();
  for (const d of docs) {
    titleToDoc.set(d.title.toLowerCase().replace(/\s+/g, ' '), d);
  }

  // Produce the backlinks array. Unresolved titles keep targetId = null
  // so we record the intent even when the target doesn't exist yet.
  const links = [];
  for (const [norm, title] of found.entries()) {
    const target = titleToDoc.get(norm);
    links.push({
      targetId: target?._id || null,
      title: target?.title || title,
    });
  }
  return links;
}

// ─── Session 30 (N5): knowledge graph endpoints ──────────────────────

// GET /documents/:docId/backlinks-in — who links to me?
router.get('/documents/:docId/backlinks-in', protect, requireMemberViaChild(WorkspaceDocument, 'docId'), async (req, res) => {
  try {
    const refs = await WorkspaceDocument.find({
      'backlinksOut.targetId': req.params.docId,
      isActive: true,
    }, 'title workspace updatedAt lastEditedBy')
      .populate('lastEditedBy', 'name avatar')
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();
    res.json(refs);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /documents/:docId/backlinks-out — who do I link to? (resolved)
// Returned inline on the doc object already, but this endpoint populates
// titleLive from the target doc so renamed targets show correctly.
router.get('/documents/:docId/backlinks-out', protect, requireMemberViaChild(WorkspaceDocument, 'docId'), async (req, res) => {
  try {
    const doc = await WorkspaceDocument.findById(req.params.docId, 'backlinksOut').lean();
    if (!doc) return res.status(404).json({ error: 'Not found.' });
    const out = doc.backlinksOut || [];
    const targetIds = out.filter(b => b.targetId).map(b => b.targetId);
    const liveTargets = await WorkspaceDocument.find(
      { _id: { $in: targetIds }, isActive: true },
      'title',
    ).lean();
    const liveMap = new Map(liveTargets.map(t => [String(t._id), t.title]));
    res.json(out.map(b => ({
      targetId: b.targetId,
      title: b.title,
      titleLive: b.targetId ? liveMap.get(String(b.targetId)) : null,
      broken: b.targetId ? !liveMap.has(String(b.targetId)) : true,  // target deleted OR never matched
    })));
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /:id/suggest?q=... — title autocomplete for [[typeahead]] in the editor
router.get('/:id/suggest', protect, requireWorkspaceMember, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);
    const limit = Math.min(10, parseInt(req.query.limit, 10) || 6);
    // Starts-with match (case-insensitive). Use regex rather than $text because
    // we want prefix matching for typeahead, not relevance scoring.
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const results = await WorkspaceDocument.find({
      workspace: req.params.id,
      isActive: true,
      title: new RegExp('^' + escaped, 'i'),
    }, '_id title updatedAt')
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean();
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /:id/graph — nodes + edges for the full workspace graph view
router.get('/:id/graph', protect, requireWorkspaceMember, async (req, res) => {
  try {
    const docs = await WorkspaceDocument.find(
      { workspace: req.params.id, isActive: true },
      '_id title backlinksOut updatedAt',
    ).lean();

    // Nodes
    const nodes = docs.map(d => ({
      id: String(d._id),
      title: d.title,
      updatedAt: d.updatedAt,
    }));

    // Build edges from backlinksOut — only keep edges whose target exists
    // in the current workspace (skip null / deleted / cross-workspace).
    const validIds = new Set(nodes.map(n => n.id));
    const edges = [];
    for (const d of docs) {
      for (const b of (d.backlinksOut || [])) {
        if (!b.targetId) continue;
        const tid = String(b.targetId);
        if (!validIds.has(tid)) continue;
        edges.push({ source: String(d._id), target: tid });
      }
    }

    res.json({ nodes, edges });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
