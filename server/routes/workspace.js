const router = require('express').Router();
const { Workspace, WorkspaceDocument, WorkspaceNote, WorkspaceFile, WorkspaceLink } = require('../models/Workspace');
const { protect } = require('../middleware/auth');

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

router.get('/:id', protect, async (req, res) => {
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

router.post('/:id/documents', protect, async (req, res) => {
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

router.get('/documents/:docId', protect, async (req, res) => {
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

router.put('/documents/:docId', protect, async (req, res) => {
  try {
    const updates = { ...req.body, lastEditedBy: req.user._id };
    // Extract plain text from tiptap if provided
    if (updates.tiptapJSON) {
      updates.plainTextContent = extractPlainText(updates.tiptapJSON);
    }
    const doc = await WorkspaceDocument.findByIdAndUpdate(req.params.docId, updates, { new: true });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.delete('/documents/:docId', protect, async (req, res) => {
  try {
    await WorkspaceDocument.findByIdAndUpdate(req.params.docId, { isActive: false });
    res.json({ message: 'Document deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── NOTES ───

router.post('/:id/notes', protect, async (req, res) => {
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

router.put('/notes/:noteId', protect, async (req, res) => {
  try {
    const note = await WorkspaceNote.findByIdAndUpdate(req.params.noteId, req.body, { new: true });
    res.json(note);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.delete('/notes/:noteId', protect, async (req, res) => {
  try {
    await WorkspaceNote.findByIdAndUpdate(req.params.noteId, { isActive: false });
    res.json({ message: 'Note deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── LINKS ───

router.post('/:id/links', protect, async (req, res) => {
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

router.delete('/links/:linkId', protect, async (req, res) => {
  try {
    await WorkspaceLink.findByIdAndDelete(req.params.linkId);
    res.json({ message: 'Link deleted.' });
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

module.exports = router;
