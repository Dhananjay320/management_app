const router = require('express').Router();
const Whiteboard = require('../models/Whiteboard');
const { protect } = require('../middleware/auth');

// GET / — list user's whiteboards (owned or member)
router.get('/', protect, async (req, res) => {
  try {
    const boards = await Whiteboard.find({
      isActive: true,
      $or: [{ owner: req.user._id }, { members: req.user._id }]
    })
      .populate('owner', 'name avatar')
      .sort({ updatedAt: -1 });
    res.json(boards);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST / — create new whiteboard
router.post('/', protect, async (req, res) => {
  try {
    const { title, members, workspace, meeting } = req.body;
    const board = await Whiteboard.create({
      title: title || 'Untitled Board',
      owner: req.user._id,
      members: members || [],
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

// GET /:id — get board (owner or member)
router.get('/:id', protect, async (req, res) => {
  try {
    const board = await Whiteboard.findById(req.params.id)
      .populate('owner', 'name avatar')
      .populate('members', 'name avatar');
    if (!board || !board.isActive) {
      return res.status(404).json({ error: 'Whiteboard not found.' });
    }
    const isOwner = board.owner._id.toString() === req.user._id.toString();
    const isMember = board.members.some(m => m._id.toString() === req.user._id.toString());
    if (!isOwner && !isMember && req.user.role !== 'main_admin') {
      return res.status(403).json({ error: 'Not authorized to view this board.' });
    }
    res.json(board);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /:id — save shapes
router.put('/:id', protect, async (req, res) => {
  try {
    const board = await Whiteboard.findById(req.params.id);
    if (!board || !board.isActive) {
      return res.status(404).json({ error: 'Whiteboard not found.' });
    }
    const isOwner = board.owner.toString() === req.user._id.toString();
    const isMember = board.members.some(m => m.toString() === req.user._id.toString());
    if (!isOwner && !isMember && req.user.role !== 'main_admin') {
      return res.status(403).json({ error: 'Not authorized to edit this board.' });
    }

    if (req.body.title !== undefined) board.title = req.body.title;
    if (req.body.shapes !== undefined) board.shapes = req.body.shapes;
    if (req.body.viewport !== undefined) board.viewport = req.body.viewport;
    if (req.body.members !== undefined) board.members = req.body.members;

    await board.save();
    res.json(board);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /:id — soft delete
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
