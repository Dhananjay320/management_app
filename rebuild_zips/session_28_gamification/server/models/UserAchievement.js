// ============================================================================
// UserAchievement.js — links a user to an unlocked achievement.
// ============================================================================
// Session 28 (N8). Achievement *definitions* live in code
// (utils/gamificationContent.js). This collection records which user
// unlocked which achievement, and when.
//
// One row per (user, achievementKey). Unique index prevents double-awards
// if two concurrent triggers race (e.g. two tasks completed in the same ms).
// ============================================================================

const mongoose = require('mongoose');

const userAchievementSchema = new mongoose.Schema({
  user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  achievementKey: { type: String, required: true },
  xpAwarded:      { type: Number, required: true },
  unlockedAt:     { type: Date, default: Date.now },
}, { timestamps: true });

userAchievementSchema.index({ user: 1, achievementKey: 1 }, { unique: true });
userAchievementSchema.index({ user: 1, unlockedAt: -1 });

module.exports = mongoose.model('UserAchievement', userAchievementSchema);
