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

module.exports = router;
