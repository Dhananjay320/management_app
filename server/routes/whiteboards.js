const router = require('express').Router();
const Whiteboard = require('../models/Whiteboard');
const { protect } = require('../middleware/auth');

// GET / — list user's whiteboards (owned or shared with me)
router.get('/', protect, async (req, res) => {
  try {
    const boards = await Whiteboard.find({
      isActive: true,
      $or: [{ owner: req.user._id }, { 'members.user': req.user._id }]
    })
      .populate('owner', 'name avatar')
      .populate('members.user', 'name avatar')
      .sort({ updatedAt: -1 });
    res.json(boards);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST / — create new whiteboard
router.post('/', protect, async (req, res) => {
  try {
    const { title, workspace, meeting } = req.body;
    const board = await Whiteboard.create({
      title: title || 'Untitled Board',
      owner: req.user._id,
      members: [],
      workspace: workspace || undefined,
      meeting: meeting || undefined,
      shapes: [],
      viewport: { x: 0, y: 0, zoom: 1 }
    });
    const populated = await board.populate('owner', 'name avatar');
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /:id — get board
router.get('/:id', protect, async (req, res) => {
  try {
    const board = await Whiteboard.findById(req.params.id)
      .populate('owner', 'name avatar')
      .populate('members.user', 'name avatar');
    if (!board || !board.isActive) {
      return res.status(404).json({ error: 'Whiteboard not found.' });
    }
    const isOwner = board.owner._id.toString() === req.user._id.toString();
    const memberEntry = board.members.find(m => (m.user?._id || m.user)?.toString() === req.user._id.toString());
    if (!isOwner && !memberEntry && req.user.role !== 'main_admin') {
      return res.status(403).json({ error: 'Not authorized to view this board.' });
    }
    // Include user's role in response
    const userRole = isOwner ? 'owner' : (memberEntry?.role || 'viewer');
    res.json({ ...board.toObject(), _userRole: userRole });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /:id — save shapes (only owner or editor)
router.put('/:id', protect, async (req, res) => {
  try {
    const board = await Whiteboard.findById(req.params.id);
    if (!board || !board.isActive) {
      return res.status(404).json({ error: 'Whiteboard not found.' });
    }
    const isOwner = board.owner.toString() === req.user._id.toString();
    const memberEntry = board.members.find(m => (m.user?._id || m.user)?.toString() === req.user._id.toString());
    const isEditor = memberEntry?.role === 'editor';

    if (!isOwner && !isEditor && req.user.role !== 'main_admin') {
      return res.status(403).json({ error: 'View-only access. You cannot edit this board.' });
    }

    if (req.body.title !== undefined) board.title = req.body.title;
    if (req.body.shapes !== undefined) board.shapes = req.body.shapes;
    if (req.body.viewport !== undefined) board.viewport = req.body.viewport;

    await board.save();
    res.json(board);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /:id/share — share with users (editor or viewer)
router.put('/:id/share', protect, async (req, res) => {
  try {
    const { userId, role = 'editor' } = req.body;
    const board = await Whiteboard.findById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Board not found.' });
    if (board.owner.toString() !== req.user._id.toString() && req.user.role !== 'main_admin') {
      return res.status(403).json({ error: 'Only the owner can share this board.' });
    }

    const existing = board.members.find(m => (m.user?._id || m.user)?.toString() === userId);
    if (existing) {
      existing.role = role;
    } else {
      board.members.push({ user: userId, role });
    }
    board.isShared = true;
    await board.save();

    const populated = await Whiteboard.findById(board._id)
      .populate('owner', 'name avatar')
      .populate('members.user', 'name avatar');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /:id/unshare — remove user from board
router.put('/:id/unshare', protect, async (req, res) => {
  try {
    const { userId } = req.body;
    const board = await Whiteboard.findById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Board not found.' });
    if (board.owner.toString() !== req.user._id.toString() && req.user.role !== 'main_admin') {
      return res.status(403).json({ error: 'Only the owner can manage sharing.' });
    }

    board.members = board.members.filter(m => (m.user?._id || m.user)?.toString() !== userId);
    board.isShared = board.members.length > 0;
    await board.save();
    res.json(board);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /:id — soft delete (owner only)
router.delete('/:id', protect, async (req, res) => {
  try {
    const board = await Whiteboard.findById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Whiteboard not found.' });
    if (board.owner.toString() !== req.user._id.toString() && req.user.role !== 'main_admin') {
      return res.status(403).json({ error: 'Only the owner can delete this board.' });
    }
    board.isActive = false;
    await board.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
