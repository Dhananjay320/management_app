// ============================================================================
// whiteboards.js — CRUD + element-level operations for whiteboards.
// ============================================================================
// Session 31 (N2) part 1. Endpoints:
//
//   GET    /whiteboards              — list mine (owner or member)
//   POST   /whiteboards              — create new
//   GET    /whiteboards/:id          — fetch one (full elements array)
//   PUT    /whiteboards/:id          — update metadata (title, viewport)
//   DELETE /whiteboards/:id          — soft delete
//
//   PUT    /whiteboards/:id/elements — replace all elements (simple save)
//   POST   /whiteboards/:id/members  — add a member
//   DELETE /whiteboards/:id/members/:userId — remove a member
//
// We use "replace all elements" as the save pattern because it's the
// simplest to reason about: the client holds canonical state, the server
// persists it. Session 32 will add finer-grained patch events over sockets
// for real-time collab; this REST API stays usable as a fallback.
// ============================================================================

const router = require('express').Router();
const Whiteboard = require('../models/Whiteboard');
const { protect } = require('../middleware/auth');

// Helper: can this user view/edit the board?
function canAccess(board, userId) {
  if (!board) return false;
  if (String(board.owner) === String(userId)) return true;
  return (board.members || []).some(m => String(m) === String(userId));
}

// ─── GET / — list mine ────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const boards = await Whiteboard.find({
      isActive: true,
      $or: [
        { owner: req.user._id },
        { members: req.user._id },
      ],
    })
      .select('title owner workspace members updatedAt createdAt')
      .populate('owner', 'name avatar')
      .sort({ updatedAt: -1 })
      .lean();
    res.json(boards);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── POST / — create ─────────────────────────────────────────────────
router.post('/', protect, async (req, res) => {
  try {
    const { title, workspace, members } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required.' });
    const board = await Whiteboard.create({
      title: title.trim(),
      owner: req.user._id,
      workspace: workspace || undefined,
      members: Array.isArray(members) ? members : [],
    });
    res.status(201).json(board);
  } catch (err) {
    console.error('whiteboard create error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── GET /:id — fetch one ────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const board = await Whiteboard.findOne({ _id: req.params.id, isActive: true })
      .populate('owner', 'name avatar')
      .populate('members', 'name avatar');
    if (!board) return res.status(404).json({ error: 'Not found.' });
    if (!canAccess(board, req.user._id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    res.json(board);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── PUT /:id — update metadata ──────────────────────────────────────
router.put('/:id', protect, async (req, res) => {
  try {
    const board = await Whiteboard.findById(req.params.id);
    if (!board || !board.isActive) return res.status(404).json({ error: 'Not found.' });
    if (!canAccess(board, req.user._id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    const { title, viewport } = req.body;
    if (title !== undefined) board.title = String(title).trim().slice(0, 200);
    if (viewport) {
      board.viewport = {
        x: Number(viewport.x) || 0,
        y: Number(viewport.y) || 0,
        zoom: Math.max(0.1, Math.min(5, Number(viewport.zoom) || 1)),
      };
    }
    await board.save();
    res.json(board);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── DELETE /:id — soft delete (owner only) ──────────────────────────
router.delete('/:id', protect, async (req, res) => {
  try {
    const board = await Whiteboard.findById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Not found.' });
    if (String(board.owner) !== String(req.user._id)) {
      return res.status(403).json({ error: 'Only the owner can delete.' });
    }
    board.isActive = false;
    await board.save();
    res.json({ message: 'Deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── PUT /:id/elements — replace entire element list ─────────────────
// Body: { elements: [...] }
// The client sends its full canonical state. We validate types and clamp
// numeric fields; everything else is persisted as-is.
router.put('/:id/elements', protect, async (req, res) => {
  try {
    const board = await Whiteboard.findById(req.params.id);
    if (!board || !board.isActive) return res.status(404).json({ error: 'Not found.' });
    if (!canAccess(board, req.user._id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    const incoming = Array.isArray(req.body.elements) ? req.body.elements : [];
    // Basic sanitization — strip anything that couldn't plausibly be an element.
    const cleaned = incoming
      .filter(el => el && typeof el.id === 'string' && Whiteboard.ELEMENT_TYPES.includes(el.type))
      .slice(0, 2000)     // hard cap to prevent runaway payloads
      .map(el => ({
        id:   String(el.id).slice(0, 80),
        type: el.type,
        x:    Number(el.x) || 0,
        y:    Number(el.y) || 0,
        w:    Math.max(1, Math.min(5000, Number(el.w) || 180)),
        h:    Math.max(1, Math.min(5000, Number(el.h) || 120)),
        z:    Number(el.z) || 0,
        rot:  Number(el.rot) || 0,
        data: el.data && typeof el.data === 'object' ? el.data : {},
        createdBy: el.createdBy || req.user._id,
      }));
    board.elements = cleaned;
    await board.save();
    res.json({ count: cleaned.length, updatedAt: board.updatedAt });
  } catch (err) {
    console.error('whiteboard save elements error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── POST /:id/members — add a member ────────────────────────────────
router.post('/:id/members', protect, async (req, res) => {
  try {
    const board = await Whiteboard.findById(req.params.id);
    if (!board || !board.isActive) return res.status(404).json({ error: 'Not found.' });
    if (String(board.owner) !== String(req.user._id)) {
      return res.status(403).json({ error: 'Only the owner can share.' });
    }
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required.' });
    if (!board.members.some(m => String(m) === String(userId))) {
      board.members.push(userId);
      await board.save();
    }
    res.json(board);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── DELETE /:id/members/:userId — remove a member ──────────────────
router.delete('/:id/members/:userId', protect, async (req, res) => {
  try {
    const board = await Whiteboard.findById(req.params.id);
    if (!board || !board.isActive) return res.status(404).json({ error: 'Not found.' });
    if (String(board.owner) !== String(req.user._id)) {
      return res.status(403).json({ error: 'Only the owner can manage members.' });
    }
    board.members = (board.members || []).filter(m => String(m) !== String(req.params.userId));
    await board.save();
    res.json(board);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
