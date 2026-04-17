const router = require('express').Router();
const Team = require('../models/Team');
const Office = require('../models/Office');
const { protect } = require('../middleware/auth');

// GET /api/v1/teams
router.get('/', protect, async (req, res) => {
  try {
    const teams = await Team.find({ isActive: true }).populate('lead', 'name').sort({ name: 1 });
    res.json(teams);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/teams/offices
router.get('/offices', protect, async (req, res) => {
  try {
    const offices = await Office.find({ isActive: true }).sort({ name: 1 });
    res.json(offices);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/teams — create team + auto-create #[team-name] channel (per spec Section 6.1.1)
const { requireRole } = require('../middleware/auth');
router.post('/', protect, requireRole('main_admin', 'admin'), async (req, res) => {
  try {
    const { name, description, lead } = req.body;
    const team = await Team.create({ name, description, lead });

    // Auto-create team channel per spec
    const Channel = require('../models/Channel');
    const Message = require('../models/Message');
    const members = lead ? [req.user._id, lead] : [req.user._id];

    const channel = await Channel.create({
      name: `#${name.toLowerCase().replace(/\s+/g, '-')}`,
      type: 'channel',
      description: `Channel for ${name}`,
      members,
      admins: [req.user._id],
      createdBy: req.user._id,
      team: team._id,
      isDefault: true
    });

    await Message.create({
      channel: channel._id,
      sender: req.user._id,
      content: `Team channel created for "${name}"`,
      type: 'system'
    });

    res.status(201).json({ team, channel });
  } catch (err) {
    console.error('Create team error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
