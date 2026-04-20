// ============================================================================
// wellness.js — daily quote, mood check-in, meditation presets.
// ============================================================================
// Session 27 (N6). Endpoints:
//
//   GET  /wellness/today          — today's quote + my mood for today
//   POST /wellness/mood           — record / update today's mood check-in
//   GET  /wellness/history        — my last N mood check-ins (for chart)
//   GET  /wellness/presets        — meditation presets (static data)
// ============================================================================

const router = require('express').Router();
const MoodCheckin = require('../models/MoodCheckin');
const { quoteFor, MEDITATION_PRESETS } = require('../utils/wellnessContent');
const { userToday } = require('../utils/timezone');
const { protect } = require('../middleware/auth');

// ─── GET /today ─────────────────────────────────────────────────────────
// Returns { quote, mood } — mood may be null if user hasn't checked in.
router.get('/today', protect, async (req, res) => {
  try {
    const today = userToday(req.user);
    const [mood, quote] = await Promise.all([
      MoodCheckin.findOne({ user: req.user._id, date: today }),
      Promise.resolve(quoteFor(today, String(req.user._id))),
    ]);
    res.json({ date: today, quote, mood });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── POST /mood — record or update today's mood ────────────────────────
router.post('/mood', protect, async (req, res) => {
  try {
    const { mood, energy, note } = req.body;
    const moodNum = Number(mood);
    if (!(moodNum >= 1 && moodNum <= 5)) {
      return res.status(400).json({ error: 'mood must be 1–5.' });
    }
    const today = userToday(req.user);

    // Upsert so a second submission for the same day overwrites rather
    // than 409s the user. They might want to correct their check-in.
    const record = await MoodCheckin.findOneAndUpdate(
      { user: req.user._id, date: today },
      {
        user: req.user._id,
        date: today,
        mood: moodNum,
        energy: energy !== undefined ? Number(energy) : undefined,
        note: (note || '').slice(0, 200),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Session 28 (N8): update mood streak and award XP. Best-effort.
    try {
      const { awardXpAndCheck, updateMoodStreak } = require('../utils/gamificationEngine');
      await updateMoodStreak(req.user, today);
      await awardXpAndCheck(req.user, 'mood_logged');
    } catch {}

    res.json(record);
  } catch (err) {
    console.error('wellness mood error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── GET /history — my last 60 check-ins (for trend chart) ────────────
router.get('/history', protect, async (req, res) => {
  try {
    const limit = Math.min(180, parseInt(req.query.limit, 10) || 30);
    const records = await MoodCheckin.find({ user: req.user._id })
      .sort({ date: -1 })
      .limit(limit);
    // Reverse so oldest-first for chart rendering
    res.json(records.reverse());
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── GET /presets — meditation presets (static) ────────────────────────
router.get('/presets', protect, (req, res) => {
  res.json({ meditation: MEDITATION_PRESETS });
});

module.exports = router;
