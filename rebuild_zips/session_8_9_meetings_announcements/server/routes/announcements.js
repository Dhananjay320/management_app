const router = require('express').Router();
const Announcement = require('../models/Announcement');
const { protect, requirePower } = require('../middleware/auth');

// ═══════════════════════════════════════════════════════════════════════════
// Session 9: Announcements CRUD UI support
//   • GET /all — admin list of EVERY announcement (including dismissed) for
//     management panel
//   • PUT /:id — edit announcement (creator or power)
//   • DELETE /:id — soft-delete (creator or power)
// ═══════════════════════════════════════════════════════════════════════════

// Helper: returns true if user can manage a given announcement
function canManageAnnouncement(user, ann) {
  if (!user || !ann) return false;
  if (String(ann.createdBy) === String(user._id)) return true;
  if (user.role === 'main_admin') return true;
  if (user.hasPower && user.hasPower('announcements', 'manageAll')) return true;
  if (user.hasPower && user.hasPower('announcements', 'sendCompanyWide')) return true;
  return false;
}

// GET /api/v1/announcements — get active announcements for user
router.get('/', protect, async (req, res) => {
  try {
    const announcements = await Announcement.find({
      isActive: true,
      dismissedBy: { $ne: req.user._id },
      $or: [
        { audience: 'company' },
        { audience: 'team', team: { $in: req.user.teams || [] } }
      ]
    })
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .limit(10);
    res.json(announcements);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/announcements/all — full list for admin management
router.get('/all', protect, async (req, res) => {
  try {
    // Only main_admin or users with manage power see the full list
    const canManage = req.user.role === 'main_admin' ||
      (req.user.hasPower && (
        req.user.hasPower('announcements', 'manageAll') ||
        req.user.hasPower('announcements', 'sendCompanyWide')
      ));
    if (!canManage) return res.status(403).json({ error: 'No permission.' });

    const { includeInactive = 'true' } = req.query;
    const filter = includeInactive === 'true' ? {} : { isActive: true };

    const all = await Announcement.find(filter)
      .populate('createdBy', 'name email')
      .populate('team', 'name')
      .sort({ createdAt: -1 })
      .limit(200);
    res.json(all);
  } catch (err) {
    console.error('Announcement list error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/announcements — create (requires power for company-wide, anyone for team-scope)
router.post('/', protect, async (req, res) => {
  try {
    const { title, content, audience, team } = req.body;

    // Company-wide announcements require power
    if (audience === 'company' && !req.user.hasPower('announcements', 'sendCompanyWide') && req.user.role !== 'main_admin') {
      return res.status(403).json({ error: 'No permission for company-wide announcements.' });
    }

    const ann = await Announcement.create({
      title, content,
      audience: audience || 'company',
      team: audience === 'team' ? team : undefined,
      createdBy: req.user._id
    });

    // Push notification to all relevant users
    const io = req.app.get('io');
    if (io) {
      io.emit('notification:new', {
        type: 'announcement',
        title: 'New Announcement',
        message: title
      });
      io.emit('announcement:new', ann);
    }

    const populated = await Announcement.findById(ann._id).populate('createdBy', 'name');
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/announcements/:id/dismiss — dismiss for current user
router.put('/:id/dismiss', protect, async (req, res) => {
  try {
    await Announcement.findByIdAndUpdate(req.params.id, { $addToSet: { dismissedBy: req.user._id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/announcements/:id — edit (creator or power)
router.put('/:id', protect, async (req, res) => {
  try {
    const ann = await Announcement.findById(req.params.id);
    if (!ann) return res.status(404).json({ error: 'Announcement not found.' });
    if (!canManageAnnouncement(req.user, ann)) {
      return res.status(403).json({ error: 'You cannot edit this announcement.' });
    }

    const allowed = ['title', 'content', 'audience', 'team', 'isActive'];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }
    // Clear team when switching to company audience to avoid stale references
    if (updates.audience === 'company') updates.team = undefined;

    const updated = await Announcement.findByIdAndUpdate(req.params.id, updates, { new: true })
      .populate('createdBy', 'name email')
      .populate('team', 'name');

    // Notify via socket so live banners refresh
    const io = req.app.get('io');
    if (io) io.emit('announcement:updated', updated);

    res.json(updated);
  } catch (err) {
    console.error('Edit announcement error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/v1/announcements/:id — soft delete (creator or power)
router.delete('/:id', protect, async (req, res) => {
  try {
    const ann = await Announcement.findById(req.params.id);
    if (!ann) return res.status(404).json({ error: 'Announcement not found.' });
    if (!canManageAnnouncement(req.user, ann)) {
      return res.status(403).json({ error: 'You cannot delete this announcement.' });
    }

    await Announcement.findByIdAndUpdate(req.params.id, { isActive: false });

    const io = req.app.get('io');
    if (io) io.emit('announcement:deleted', { _id: ann._id });

    res.json({ ok: true });
  } catch (err) {
    console.error('Delete announcement error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
