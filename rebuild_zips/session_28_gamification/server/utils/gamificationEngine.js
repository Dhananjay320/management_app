// ============================================================================
// gamificationEngine.js — award XP and check for newly unlocked achievements.
// ============================================================================
// Session 28 (N8). Single entry point: `awardXpAndCheck(user, event, extra)`.
// Call it from anywhere that matters (task complete, meeting attend, etc.).
// The engine:
//   1) Adds XP to the user (if specified)
//   2) Recomputes level
//   3) Loads the user's snapshot of relevant counters (tasks done, etc.)
//   4) Runs every achievement's check(ctx) function
//   5) For each newly-unlocked one: creates a UserAchievement row, awards
//      its XP, emits a socket event, returns it to the caller
//
// Never throws. Callers treat gamification as best-effort — a failure to
// award XP must never block the primary workflow.
// ============================================================================

const User = require('../models/User');
const UserAchievement = require('../models/UserAchievement');
const Task = require('../models/Task');
const Message = require('../models/Message');
const Follow = require('../models/Follow');
const MoodCheckin = require('../models/MoodCheckin');
const ScheduledMessage = require('../models/ScheduledMessage');
const { ACHIEVEMENTS, levelForXp } = require('./gamificationContent');

// XP amounts awarded on-the-fly for common actions (in addition to any
// achievement unlocks the event triggers).
const EVENT_XP = {
  task_completed:       5,
  meeting_attended:     3,
  mood_logged:          2,
  meditation_completed: 5,
  message_sent:         0,  // too frequent — no per-event XP; only milestones
  follow_created:       3,
  message_scheduled:    2,
  login:                1,
  profile_updated:      0,
};

// Build a context object passed to every achievement's check() function.
// Takes one DB round-trip per counter we care about; kept small so the
// overhead is negligible on hot paths like task completion.
async function buildContext(user, event, extra = {}) {
  const ctx = {
    event,
    user,
    ...extra,
  };

  // Only load the counters an achievement in that event's category might
  // need. Keeps this fast.
  if (event === 'task_completed') {
    ctx.tasksCompletedTotal = await Task.countDocuments({
      assignees: user._id, status: 'done',
    });
  }
  if (event === 'follow_created') {
    ctx.followingTotal = await Follow.countDocuments({
      follower: user._id, isActive: true,
    });
  }
  if (event === 'follower_added') {
    ctx.followerCount = await Follow.countDocuments({
      following: user._id, isActive: true,
    });
  }
  if (event === 'message_sent') {
    ctx.messagesSentTotal = await Message.countDocuments({ sender: user._id });
  }
  if (event === 'mood_logged') {
    ctx.moodCheckinsTotal = await MoodCheckin.countDocuments({ user: user._id });
    ctx.moodStreak = user.moodStreak || 0;
  }
  if (event === 'meditation_completed') {
    // We don't yet record meditation sessions in DB; caller must pass total.
    ctx.meditationsTotal = extra.meditationsTotal || 1;
  }
  if (event === 'meeting_attended') {
    // Assumes caller passes the running total; cheap to compute downstream.
    ctx.meetingsAttendedTotal = extra.meetingsAttendedTotal || 1;
  }
  if (event === 'login') {
    ctx.loginHour = extra.loginHour ?? new Date().getHours();
  }
  if (event === 'profile_updated') {
    ctx.profile = extra.profile || user;
  }

  return ctx;
}

async function awardXpAndCheck(userOrId, event, extra = {}) {
  try {
    const user = userOrId._id ? userOrId : await User.findById(userOrId);
    if (!user) return { awarded: 0, unlocked: [] };

    const baseXp = EVENT_XP[event] || 0;
    let totalXp = baseXp;

    const ctx = await buildContext(user, event, extra);

    // Find achievements whose check() returns true AND the user doesn't
    // already have. Load the user's existing achievement keys in one query.
    const existingKeys = new Set(
      (await UserAchievement.find({ user: user._id }, 'achievementKey').lean())
        .map(r => r.achievementKey)
    );

    const newlyUnlocked = [];
    for (const def of ACHIEVEMENTS) {
      if (existingKeys.has(def.key)) continue;
      let passed = false;
      try { passed = def.check(ctx); } catch { passed = false; }
      if (passed) {
        // Insert with unique-index guard against races.
        try {
          await UserAchievement.create({
            user: user._id,
            achievementKey: def.key,
            xpAwarded: def.xp,
          });
          totalXp += def.xp;
          newlyUnlocked.push(def);
        } catch (e) {
          if (e.code !== 11000) throw e;  // dup = already awarded elsewhere
        }
      }
    }

    // Persist XP + level bump.
    if (totalXp > 0 || newlyUnlocked.length > 0) {
      user.xp = (user.xp || 0) + totalXp;
      const newLevel = levelForXp(user.xp);
      const leveledUp = newLevel > (user.level || 1);
      user.level = newLevel;
      await user.save();

      // Socket-notify the user (if engine's global io is set) of unlocks
      // and level-ups. Best-effort — silent failure.
      if (global.__gamificationIo) {
        newlyUnlocked.forEach(def => {
          global.__gamificationIo.to(`user:${user._id}`).emit('achievement:unlocked', {
            key: def.key, title: def.title, icon: def.icon, xp: def.xp, tier: def.tier,
          });
        });
        if (leveledUp) {
          global.__gamificationIo.to(`user:${user._id}`).emit('level:up', {
            level: newLevel, xp: user.xp,
          });
        }
      }
    }

    return {
      awarded: totalXp,
      unlocked: newlyUnlocked.map(a => ({
        key: a.key, title: a.title, icon: a.icon, xp: a.xp, tier: a.tier,
      })),
    };
  } catch (err) {
    console.warn('[gamification] engine error (non-fatal):', err.message);
    return { awarded: 0, unlocked: [] };
  }
}

// Register the socket.io instance so the engine can emit events.
// Called once from index.js on server boot.
function registerIo(io) {
  global.__gamificationIo = io;
}

// Update mood streak helper — called from the wellness mood endpoint.
// Returns the new streak count, which the caller can pass via `extra`.
async function updateMoodStreak(user, todayDate) {
  // todayDate is 'YYYY-MM-DD' in the user's local timezone (from Session 17).
  if (!user.lastMoodDate) {
    user.moodStreak = 1;
  } else {
    // Diff in days between lastMoodDate and todayDate
    const prev = new Date(user.lastMoodDate + 'T00:00:00Z');
    const curr = new Date(todayDate + 'T00:00:00Z');
    const days = Math.round((curr - prev) / 86400000);
    if (days === 0) {
      // same-day correction — don't increment, but keep streak
    } else if (days === 1) {
      user.moodStreak = (user.moodStreak || 0) + 1;
    } else {
      // Missed a day — reset to 1
      user.moodStreak = 1;
    }
  }
  user.lastMoodDate = todayDate;
  await user.save();
  return user.moodStreak;
}

module.exports = { awardXpAndCheck, registerIo, updateMoodStreak };
