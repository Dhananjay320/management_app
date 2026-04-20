// ============================================================================
// gamificationContent.js — achievement definitions and XP calculation.
// ============================================================================
// Session 28 (N8). Rather than storing achievement *definitions* in the DB,
// we keep them as code — they change infrequently, and it's much easier to
// diff and audit in git than a collection. User progress is stored in the
// UserAchievement collection; definitions live here.
//
// Each achievement has:
//   key          — stable ID (never changes; used in DB)
//   title        — display name
//   description  — what you did to earn it
//   icon         — emoji for visual flair
//   xp           — reward in XP on unlock
//   tier         — bronze | silver | gold | platinum (for filtering/sorting)
//   check(ctx)   — pure function: given a snapshot of a user's counters,
//                  return true if the achievement should be unlocked.
//
// The `check` context is whatever is relevant to the trigger — see
// utils/gamificationEngine.js for the canonical shapes.
// ============================================================================

const ACHIEVEMENTS = [
  // ─── Onboarding (bronze) ──────────────────────────────────────────
  {
    key: 'first_login',
    title: 'Welcome aboard',
    description: 'Logged in for the first time',
    icon: '👋', xp: 10, tier: 'bronze',
    check: (ctx) => ctx.event === 'login',
  },
  {
    key: 'profile_filled',
    title: 'Nice to meet you',
    description: 'Added a job title and status to your profile',
    icon: '📝', xp: 15, tier: 'bronze',
    check: (ctx) => ctx.event === 'profile_updated'
      && ctx.profile?.jobTitle && ctx.profile?.statusMessage,
  },

  // ─── Tasks (bronze → gold) ────────────────────────────────────────
  {
    key: 'task_first',
    title: 'First step',
    description: 'Completed your first task',
    icon: '✅', xp: 20, tier: 'bronze',
    check: (ctx) => ctx.event === 'task_completed' && ctx.tasksCompletedTotal >= 1,
  },
  {
    key: 'task_10',
    title: 'Getting things done',
    description: 'Completed 10 tasks',
    icon: '🎯', xp: 50, tier: 'silver',
    check: (ctx) => ctx.event === 'task_completed' && ctx.tasksCompletedTotal >= 10,
  },
  {
    key: 'task_100',
    title: 'Productivity master',
    description: 'Completed 100 tasks',
    icon: '🏆', xp: 200, tier: 'gold',
    check: (ctx) => ctx.event === 'task_completed' && ctx.tasksCompletedTotal >= 100,
  },
  {
    key: 'task_500',
    title: 'Task legend',
    description: 'Completed 500 tasks',
    icon: '👑', xp: 500, tier: 'platinum',
    check: (ctx) => ctx.event === 'task_completed' && ctx.tasksCompletedTotal >= 500,
  },

  // ─── Social (N4 Follow) ───────────────────────────────────────────
  {
    key: 'first_follow',
    title: 'Making connections',
    description: 'Followed someone for the first time',
    icon: '🤝', xp: 15, tier: 'bronze',
    check: (ctx) => ctx.event === 'follow_created' && ctx.followingTotal >= 1,
  },
  {
    key: 'popular',
    title: 'Magnetic',
    description: 'Have 5 followers',
    icon: '⭐', xp: 80, tier: 'silver',
    check: (ctx) => ctx.event === 'follower_added' && ctx.followerCount >= 5,
  },

  // ─── Messaging (N3) ───────────────────────────────────────────────
  {
    key: 'chatty',
    title: 'Team player',
    description: 'Sent 50 messages',
    icon: '💬', xp: 30, tier: 'bronze',
    check: (ctx) => ctx.event === 'message_sent' && ctx.messagesSentTotal >= 50,
  },
  {
    key: 'scheduler',
    title: 'Future-minded',
    description: 'Scheduled your first future message',
    icon: '⏰', xp: 20, tier: 'bronze',
    check: (ctx) => ctx.event === 'message_scheduled',
  },

  // ─── Wellness (N6) ────────────────────────────────────────────────
  {
    key: 'mood_first',
    title: 'Checking in',
    description: 'Logged your first mood',
    icon: '🌱', xp: 15, tier: 'bronze',
    check: (ctx) => ctx.event === 'mood_logged' && ctx.moodCheckinsTotal >= 1,
  },
  {
    key: 'mood_streak_7',
    title: 'Week of awareness',
    description: 'Checked in 7 days in a row',
    icon: '🔥', xp: 70, tier: 'silver',
    check: (ctx) => ctx.event === 'mood_logged' && ctx.moodStreak >= 7,
  },
  {
    key: 'mood_streak_30',
    title: 'Monthly habit',
    description: 'Checked in 30 days in a row',
    icon: '🌟', xp: 300, tier: 'gold',
    check: (ctx) => ctx.event === 'mood_logged' && ctx.moodStreak >= 30,
  },
  {
    key: 'meditator',
    title: 'Finding stillness',
    description: 'Finished your first meditation',
    icon: '🧘', xp: 25, tier: 'bronze',
    check: (ctx) => ctx.event === 'meditation_completed' && ctx.meditationsTotal >= 1,
  },
  {
    key: 'meditator_10',
    title: 'Inner peace',
    description: 'Completed 10 meditations',
    icon: '☯️', xp: 100, tier: 'silver',
    check: (ctx) => ctx.event === 'meditation_completed' && ctx.meditationsTotal >= 10,
  },

  // ─── Time of day (bronze flavor) ──────────────────────────────────
  {
    key: 'early_bird',
    title: 'Early bird',
    description: 'Logged in before 7 AM',
    icon: '🌅', xp: 15, tier: 'bronze',
    check: (ctx) => ctx.event === 'login' && ctx.loginHour !== undefined && ctx.loginHour < 7,
  },
  {
    key: 'night_owl',
    title: 'Night owl',
    description: 'Active after 11 PM',
    icon: '🦉', xp: 15, tier: 'bronze',
    check: (ctx) => ctx.event === 'login' && ctx.loginHour !== undefined && ctx.loginHour >= 23,
  },

  // ─── Meetings ─────────────────────────────────────────────────────
  {
    key: 'meeting_10',
    title: 'Face time',
    description: 'Attended 10 meetings',
    icon: '👥', xp: 40, tier: 'silver',
    check: (ctx) => ctx.event === 'meeting_attended' && ctx.meetingsAttendedTotal >= 10,
  },
];

// XP-per-level curve. Level N requires xpForLevel(N) total XP.
// Classic RPG-style exponential: each level needs ~30% more than the last.
// Level 1 = 0 XP, level 2 = 50 XP, level 3 = 115 XP, etc.
function xpForLevel(level) {
  if (level <= 1) return 0;
  let total = 0;
  let step = 50;
  for (let i = 2; i <= level; i++) {
    total += Math.round(step);
    step *= 1.3;
  }
  return total;
}

function levelForXp(xp) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

function xpToNextLevel(xp) {
  const lvl = levelForXp(xp);
  const nextAt = xpForLevel(lvl + 1);
  const thisAt = xpForLevel(lvl);
  return {
    level: lvl,
    xp,
    xpIntoLevel: xp - thisAt,
    xpForNextLevel: nextAt - thisAt,
    pctToNext: Math.min(100, Math.max(0, ((xp - thisAt) / (nextAt - thisAt)) * 100)),
  };
}

// Strip the check function — clients don't need it.
function publicAchievements() {
  return ACHIEVEMENTS.map(a => ({
    key: a.key,
    title: a.title,
    description: a.description,
    icon: a.icon,
    xp: a.xp,
    tier: a.tier,
  }));
}

module.exports = {
  ACHIEVEMENTS,
  xpForLevel,
  levelForXp,
  xpToNextLevel,
  publicAchievements,
};
