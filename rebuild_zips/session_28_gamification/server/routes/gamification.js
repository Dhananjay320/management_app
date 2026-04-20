// ============================================================================
// gamification.js — my stats, achievements list, leaderboard.
// ============================================================================
// Session 28 (N8). Read-only endpoints (mutation happens via the engine,
// not directly from clients).
//
//   GET /gamification/me               — my xp, level, streak, unlocks
//   GET /gamification/user/:userId     — public stats for any user
//   GET /gamification/achievements     — all achievement definitions
//   GET /gamification/leaderboard      — top users by XP (all-time for now)
// ============================================================================

const router = require('express').Router();
const User = require('../models/User');
const UserAchievement = require('../models/UserAchievement');
const { protect } = require('../middleware/auth');
const {
  publicAchievements, xpToNextLevel,
} = require('../utils/gamificationContent');

// ─── GET /me — my full profile with progress ──────────────────────────
router.get('/me', protect, async (req, res) => {
  try {
    const [user, unlocked] = await Promise.all([
      User.findById(req.user._id, 'xp level moodStreak').lean(),
      UserAchievement.find({ user: req.user._id }).sort({ unlockedAt: -1 }).lean(),
    ]);

    const progress = xpToNextLevel(user.xp || 0);
    res.json({
      xp:         user.xp || 0,
      level:      user.level || 1,
      moodStreak: user.moodStreak || 0,
      progress,
      unlockedCount: unlocked.length,
      unlocked: unlocked.map(u => ({
        key: u.achievementKey,
        xpAwarded: u.xpAwarded,
        unlockedAt: u.unlockedAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── GET /user/:userId — public stats for any user ────────────────────
router.get('/user/:userId', protect, async (req, res) => {
  try {
    const [user, unlocked] = await Promise.all([
      User.findById(req.params.userId, 'name xp level moodStreak').lean(),
      UserAchievement.find({ user: req.params.userId })
        .sort({ unlockedAt: -1 })
        .limit(50)
        .lean(),
    ]);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({
      name: user.name,
      xp: user.xp || 0,
      level: user.level || 1,
      moodStreak: user.moodStreak || 0,
      progress: xpToNextLevel(user.xp || 0),
      unlockedCount: unlocked.length,
      unlocked: unlocked.map(u => ({
        key: u.achievementKey,
        xpAwarded: u.xpAwarded,
        unlockedAt: u.unlockedAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── GET /achievements — all definitions ──────────────────────────────
router.get('/achievements', protect, (req, res) => {
  res.json(publicAchievements());
});

// ─── GET /leaderboard — top 20 by XP ──────────────────────────────────
router.get('/leaderboard', protect, async (req, res) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit, 10) || 20);
    const top = await User.find({ isActive: true })
      .select('name email avatar xp level moodStreak')
      .sort({ xp: -1, _id: 1 })     // _id tiebreak for stable order
      .limit(limit)
      .lean();

    // Find where the calling user ranks — cheap since users are sorted.
    const myRank = await User.countDocuments({
      isActive: true,
      $or: [
        { xp: { $gt: req.user.xp || 0 } },
        { xp: req.user.xp || 0, _id: { $lt: req.user._id } },
      ],
    });

    res.json({
      leaderboard: top.map((u, i) => ({
        rank: i + 1,
        userId: u._id,
        name: u.name,
        avatar: u.avatar,
        xp: u.xp || 0,
        level: u.level || 1,
        moodStreak: u.moodStreak || 0,
        isMe: String(u._id) === String(req.user._id),
      })),
      myRank: myRank + 1,  // 0-indexed count of users above me → +1 for 1-indexed rank
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
