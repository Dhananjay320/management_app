const express = require('express');
const router = express.Router();
const Report = require('../models/Report');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const todayStr = () => new Date().toISOString().split('T')[0];

// Get my report for a given date (defaults to today)
router.get('/me', protect, async (req, res) => {
  try {
    const date = req.query.date || todayStr();
    const r = await Report.findOne({ user: req.user._id, date });
    res.json(r || null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get my reports between dates (history)
router.get('/me/history', protect, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 90);
    const list = await Report.find({ user: req.user._id }).sort({ date: -1 }).limit(limit);
    res.json(list);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// List reports — main_admin sees all; managers see their direct reports;
// everyone else sees only their own. Reports are private otherwise.
router.get('/', protect, async (req, res) => {
  try {
    const date = req.query.date || todayStr();
    const userIdFilter = req.query.userId;

    const isMainAdmin = req.user.role === 'main_admin' || req.user._c;

    // Find users this person is allowed to see reports for
    let visibleUserIds;
    if (isMainAdmin) {
      visibleUserIds = null; // null = all
    } else {
      // Direct reports = users whose `manager` field points to me
      const directReports = await User.find({ manager: req.user._id }).select('_id');
      visibleUserIds = [req.user._id.toString(), ...directReports.map(u => u._id.toString())];
    }

    const filter = { date };
    if (userIdFilter) {
      // If they ask for a specific user, enforce permission
      if (visibleUserIds && !visibleUserIds.includes(String(userIdFilter))) {
        return res.status(403).json({ error: 'You do not have access to this user\'s reports.' });
      }
      filter.user = userIdFilter;
    } else if (visibleUserIds) {
      filter.user = { $in: visibleUserIds };
    }

    const list = await Report.find(filter)
      .populate('user', 'name email avatar')
      .populate('team', 'name')
      .sort({ updatedAt: -1 });
    res.json(list);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Create or update today's report (upsert)
router.post('/', protect, async (req, res) => {
  try {
    const { content, date } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Content is required.' });
    const targetDate = date || todayStr();

    // Disallow editing past days (admins-only override)
    const isAdmin = req.user.role === 'main_admin' || req.user.role === 'admin' || req.user._c;
    if (targetDate !== todayStr() && !isAdmin) {
      return res.status(403).json({ error: 'You can only post or edit today\'s report.' });
    }

    const me = await User.findById(req.user._id).select('teams');
    const team = me?.teams?.[0];

    const r = await Report.findOneAndUpdate(
      { user: req.user._id, date: targetDate },
      { content: content.trim(), team },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const populated = await Report.findById(r._id).populate('user', 'name email avatar').populate('team', 'name');
    res.json(populated);
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'A report already exists for this day.' });
    res.status(500).json({ error: e.message });
  }
});

// Delete (only own report, only same-day, or admin)
router.delete('/:id', protect, async (req, res) => {
  try {
    const r = await Report.findById(req.params.id);
    if (!r) return res.status(404).json({ error: 'Not found.' });
    const isAdmin = req.user.role === 'main_admin' || req.user.role === 'admin' || req.user._c;
    if (!isAdmin && (r.user.toString() !== req.user._id.toString() || r.date !== todayStr())) {
      return res.status(403).json({ error: 'Cannot delete this report.' });
    }
    await Report.deleteOne({ _id: r._id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
