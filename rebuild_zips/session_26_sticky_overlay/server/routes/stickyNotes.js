const router = require('express').Router();
const StickyNote = require('../models/StickyNote');
const { protect } = require('../middleware/auth');

// GET /api/v1/sticky-notes — all notes for current user (own + shared with me)
router.get('/', protect, async (req, res) => {
  try {
    const notes = await StickyNote.find({
      isActive: true,
      $or: [
        { creator: req.user._id },
        { 'sharedWith.user': req.user._id }
      ]
    })
      .populate('creator', 'name avatar')
      .populate('sharedWith.user', 'name avatar')
      .sort({ order: 1, updatedAt: -1 });
    res.json(notes);
  } catch (err) {
    console.error('Get sticky notes error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/sticky-notes/context/:entityType/:entityId — notes attached to a specific entity
router.get('/context/:entityType/:entityId', protect, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const notes = await StickyNote.find({
      isActive: true,
      'attachedTo.entityType': entityType,
      'attachedTo.entityId': entityId,
      $or: [
        { creator: req.user._id },
        { 'sharedWith.user': req.user._id }
      ]
    })
      .populate('creator', 'name avatar')
      .sort({ updatedAt: -1 });
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/sticky-notes/context-count/:entityType/:entityId — badge count
router.get('/context-count/:entityType/:entityId', protect, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const count = await StickyNote.countDocuments({
      isActive: true,
      'attachedTo.entityType': entityType,
      'attachedTo.entityId': entityId,
      $or: [
        { creator: req.user._id },
        { 'sharedWith.user': req.user._id }
      ]
    });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/sticky-notes — create note
router.post('/', protect, async (req, res) => {
  try {
    const { title, content, color, attachedTo } = req.body;
    const note = await StickyNote.create({
      title: title || '',
      content: content || '',
      color: color || '#FEF3C7',
      creator: req.user._id,
      attachedTo: attachedTo || []
    });
    const populated = await StickyNote.findById(note._id).populate('creator', 'name avatar');
    res.status(201).json(populated);
  } catch (err) {
    console.error('Create sticky note error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/sticky-notes/:id — update note
router.put('/:id', protect, async (req, res) => {
  try {
    const note = await StickyNote.findById(req.params.id);
    if (!note) return res.status(404).json({ error: 'Note not found.' });

    // Check permission: creator or shared with edit
    const isCreator = note.creator.toString() === req.user._id.toString();
    const sharedEntry = note.sharedWith.find(s => s.user.toString() === req.user._id.toString());
    if (!isCreator && (!sharedEntry || !sharedEntry.canEdit)) {
      return res.status(403).json({ error: 'Cannot edit this note.' });
    }

    const { title, content, color, order, isExpanded } = req.body;
    if (title !== undefined) note.title = title;
    if (content !== undefined) note.content = content;
    if (color !== undefined) note.color = color;
    if (order !== undefined) note.order = order;
    if (isExpanded !== undefined) note.isExpanded = isExpanded;
    await note.save();

    res.json(note);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/sticky-notes/:id/attach — attach to entity
router.put('/:id/attach', protect, async (req, res) => {
  try {
    const { entityType, entityId } = req.body;
    const note = await StickyNote.findOne({ _id: req.params.id, creator: req.user._id });
    if (!note) return res.status(404).json({ error: 'Note not found.' });

    const alreadyAttached = note.attachedTo.some(
      a => a.entityType === entityType && a.entityId.toString() === entityId
    );
    if (!alreadyAttached) {
      note.attachedTo.push({ entityType, entityId });
      await note.save();
    }
    res.json(note);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/sticky-notes/:id/detach — detach from entity
router.put('/:id/detach', protect, async (req, res) => {
  try {
    const { entityType, entityId } = req.body;
    const note = await StickyNote.findOne({ _id: req.params.id, creator: req.user._id });
    if (!note) return res.status(404).json({ error: 'Note not found.' });

    note.attachedTo = note.attachedTo.filter(
      a => !(a.entityType === entityType && a.entityId.toString() === entityId)
    );
    await note.save();
    res.json(note);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/sticky-notes/:id/share — share with a user
router.put('/:id/share', protect, async (req, res) => {
  try {
    const { userId, canEdit } = req.body;
    const note = await StickyNote.findOne({ _id: req.params.id, creator: req.user._id });
    if (!note) return res.status(404).json({ error: 'Note not found.' });

    const existing = note.sharedWith.find(s => s.user.toString() === userId);
    if (existing) {
      existing.canEdit = canEdit || false;
    } else {
      note.sharedWith.push({ user: userId, canEdit: canEdit || false });
    }
    note.isShared = true;
    await note.save();
    res.json(note);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/sticky-notes/:id/unshare — remove sharing with a user
router.put('/:id/unshare', protect, async (req, res) => {
  try {
    const { userId } = req.body;
    const note = await StickyNote.findOne({ _id: req.params.id, creator: req.user._id });
    if (!note) return res.status(404).json({ error: 'Note not found.' });

    note.sharedWith = note.sharedWith.filter(s => s.user.toString() !== userId);
    note.isShared = note.sharedWith.length > 0;
    await note.save();
    res.json(note);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/v1/sticky-notes/:id
// Session 26 (N1): draggable sticky notes overlay endpoints.
// These let the client save a note's "on-screen" position + size after
// the user drags/resizes the floating note. We treat overlay state as
// owned by the note's creator only — shared viewers can see the note
// but can't change where it floats for the creator.

// PUT /api/v1/sticky-notes/:id/pin — toggle "pin to screen"
router.put('/:id/pin', protect, async (req, res) => {
  try {
    const note = await StickyNote.findOne({ _id: req.params.id, creator: req.user._id });
    if (!note) return res.status(404).json({ error: 'Note not found.' });
    const { pinned } = req.body;
    note.overlayPinned = pinned === undefined ? !note.overlayPinned : Boolean(pinned);
    await note.save();
    res.json(note);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/sticky-notes/:id/overlay — update position / size after drag/resize
router.put('/:id/overlay', protect, async (req, res) => {
  try {
    const note = await StickyNote.findOne({ _id: req.params.id, creator: req.user._id });
    if (!note) return res.status(404).json({ error: 'Note not found.' });
    const { x, y, width, height } = req.body;
    // Clamp to reasonable bounds so a busted client can't stick notes off-screen forever.
    if (x      !== undefined) note.overlayX      = Math.max(0, Math.min(10000, Number(x)));
    if (y      !== undefined) note.overlayY      = Math.max(0, Math.min(10000, Number(y)));
    if (width  !== undefined) note.overlayWidth  = Math.max(140, Math.min(600, Number(width)));
    if (height !== undefined) note.overlayHeight = Math.max(100, Math.min(600, Number(height)));
    await note.save();
    res.json(note);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/sticky-notes/pinned — fetch just my pinned-to-overlay notes
router.get('/pinned', protect, async (req, res) => {
  try {
    const notes = await StickyNote.find({
      creator: req.user._id,
      isActive: true,
      overlayPinned: true,
    }).sort({ updatedAt: -1 });
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.delete('/:id', protect, async (req, res) => {
  try {
    const note = await StickyNote.findOne({ _id: req.params.id, creator: req.user._id });
    if (!note) return res.status(404).json({ error: 'Note not found.' });
    note.isActive = false;
    await note.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
