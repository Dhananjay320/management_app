const router = require('express').Router();
const Announcement = require('../models/Announcement');
const { protect, requirePower } = require('../middleware/auth');

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

module.exports = router;
