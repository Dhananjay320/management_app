const router = require('express').Router();
const Activity = require('../models/Activity');
const { protect } = require('../middleware/auth');

// GET /api/v1/activities — list activities (with filters)
router.get('/', protect, async (req, res) => {
  try {
    const { date, type, audience, upcoming } = req.query;

    let query = { isActive: true };

    // Audience visibility: company = all, team = user's teams
    if (audience === 'team') {
      query.audience = 'team';
      query.team = { $in: req.user.teams || [] };
    } else {
      query.$or = [
        { audience: 'company' },
        { audience: 'team', team: { $in: req.user.teams || [] } },
        { audience: 'individual', createdBy: req.user._id }
      ];
    }

    if (date) {
      const d = new Date(date);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      query.date = { $gte: start, $lt: end };
    }

    if (upcoming === 'true') {
      query.date = { $gte: new Date() };
    }

    if (type) query.type = type;

    const activities = await Activity.find(query)
      .populate('createdBy', 'name avatar')
      .populate('team', 'name')
      .populate('rsvpJoin', 'name avatar')
      .sort({ date: upcoming === 'true' ? 1 : -1 })
      .limit(50);

    res.json(activities);
  } catch (err) {
    console.error('List activities error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/activities/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const activity = await Activity.findById(req.params.id)
      .populate('createdBy', 'name avatar')
      .populate('team', 'name')
      .populate('rsvpJoin', 'name avatar')
      .populate('rsvpSkip', 'name avatar');
    if (!activity) return res.status(404).json({ error: 'Activity not found.' });
    res.json(activity);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/activities — create activity (anyone can)
router.post('/', protect, async (req, res) => {
  try {
    const { title, type, description, attachment, audience, team, date, endTime, isRecurring, recurringPattern } = req.body;

    const activity = await Activity.create({
      title, type, description,
      attachment: attachment || undefined,
      audience: audience || 'company',
      team: audience === 'team' ? team : undefined,
      date,
      endTime,
      isRecurring: isRecurring || false,
      recurringPattern,
      createdBy: req.user._id
    });

    const populated = await Activity.findById(activity._id)
      .populate('createdBy', 'name avatar')
      .populate('team', 'name');
    res.status(201).json(populated);
  } catch (err) {
    console.error('Create activity error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/activities/:id — update
router.put('/:id', protect, async (req, res) => {
  try {
    const activity = await Activity.findById(req.params.id);
    if (!activity) return res.status(404).json({ error: 'Activity not found.' });
    if (activity.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the creator can edit.' });
    }

    const allowed = ['title', 'type', 'description', 'attachment', 'audience', 'team', 'date', 'endTime', 'isRecurring', 'recurringPattern'];
    allowed.forEach(field => {
      if (req.body[field] !== undefined) activity[field] = req.body[field];
    });
    await activity.save();

    const populated = await Activity.findById(activity._id)
      .populate('createdBy', 'name avatar')
      .populate('team', 'name');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/activities/:id/rsvp — join or skip
router.post('/:id/rsvp', protect, async (req, res) => {
  try {
    const { response } = req.body; // 'join' or 'skip'
    const activity = await Activity.findById(req.params.id);
    if (!activity) return res.status(404).json({ error: 'Activity not found.' });

    // Remove from both arrays first
    activity.rsvpJoin = activity.rsvpJoin.filter(id => id.toString() !== req.user._id.toString());
    activity.rsvpSkip = activity.rsvpSkip.filter(id => id.toString() !== req.user._id.toString());

    if (response === 'join') {
      activity.rsvpJoin.push(req.user._id);
    } else if (response === 'skip') {
      activity.rsvpSkip.push(req.user._id);
    }
    await activity.save();

    res.json({ joinCount: activity.rsvpJoin.length, skipCount: activity.rsvpSkip.length });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/v1/activities/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    const activity = await Activity.findById(req.params.id);
    if (!activity) return res.status(404).json({ error: 'Activity not found.' });
    if (activity.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the creator can delete.' });
    }
    activity.isActive = false;
    await activity.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
