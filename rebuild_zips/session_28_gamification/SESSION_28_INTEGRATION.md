# Session 28 — Gamification (N8)

**Status: ✅ Build-verified.** Client: 307.16 kB main.js (+1.67 kB), 31.46 kB CSS (+1.23 kB). Server routes + engine + content library all load cleanly.

Fifth Phase F feature. Adds XP, levels, achievement badges, and a leaderboard — plus automatic hooks into existing workflows (task completion, mood check-ins, follows) so users earn things passively as they use the app.

---

## What's in this zip

```
server/
├── index.js                             (patched — wired route + engine io hook)
├── models/
│   ├── User.js                          (patched — xp, level, moodStreak, lastMoodDate fields)
│   └── UserAchievement.js               (NEW — per-user unlock records)
├── routes/
│   ├── gamification.js                  (NEW — 4 endpoints)
│   ├── tasks.js                         (patched — awards XP on task done)
│   ├── wellness.js                      (patched — awards XP + updates streak on mood log)
│   └── follows.js                       (patched — awards XP to both users)
└── utils/
    ├── gamificationContent.js           (NEW — 18 achievements + XP curve)
    └── gamificationEngine.js            (NEW — awardXpAndCheck + updateMoodStreak)

client/src/
├── App.js                               (patched — /achievements route + toast import)
├── components/
│   ├── AchievementToast.js              (NEW — celebratory socket toast)
│   ├── AchievementToast.css             (NEW)
│   └── layout/AppLayout.js              (patched — mounted toast + sidebar link)
└── pages/
    ├── GamificationPage.js              (NEW — 3-tab progress page)
    ├── GamificationPage.css             (NEW)
    └── UserProfilePage.js               (patched — shows Lv + XP + badge count)
```

**16 files: 8 patched + 8 new.** No new npm dependencies.

---

## What it does

### XP + levels
- Every relevant action grants a small XP reward (task complete = 5, meeting attended = 3, mood logged = 2, meditation completed = 5, follow created = 3, login = 1)
- Level curve is exponential: level 2 at 50 XP, level 3 at 115 XP, level 5 at 310 XP, level 10 at ~1,300 XP. Each level needs ~30% more than the last.
- User document caches `xp` + `level` for fast leaderboard queries

### Achievements (18 so far)

Organized by tier with per-tier XP bonuses:

| Tier | Examples | XP range |
|---|---|---|
| 🟤 Bronze (8) | First task, First follow, Early bird, Night owl, First mood, First meditation, Scheduler, Profile filled | 10–30 |
| ⚪ Silver (5) | 10 tasks, 50 messages, 10 meetings, 7-day mood streak, 10 meditations | 40–100 |
| 🟡 Gold (2) | 100 tasks, 30-day mood streak | 200–300 |
| 🟣 Platinum (1) | 500 tasks | 500 |

Plus social/wellness specialties (Popular: 5 followers). See `utils/gamificationContent.js` for the full list — easy to add more; no schema migration needed since definitions are code.

### Mood streak tracking
- New fields on User: `moodStreak`, `lastMoodDate`
- On each mood check-in, engine compares previous `lastMoodDate` to today — if yesterday, increment; if today, no change; if gap, reset to 1
- Shown on GamificationPage hero (🔥 icon) and as the trigger for 7-day / 30-day streak achievements

### Leaderboard
- Top 20 users by XP, all-time
- Top 3 get medal emojis (🥇🥈🥉), everyone else shows #rank
- Your own row is highlighted with a "you" pill
- Your rank is shown in the header ("Your rank: #42") even if you're not in the top 20

### Hooks — automatic, best-effort
- **Tasks** (`routes/tasks.js`): when status flips to `done`, calls `awardXpAndCheck(user, 'task_completed')`
- **Wellness** (`routes/wellness.js`): on mood log, calls `updateMoodStreak(user, today)` then `awardXpAndCheck(user, 'mood_logged')`
- **Follows** (`routes/follows.js`): awards XP to the follower (`follow_created`) and the followee (`follower_added` — for the "Popular" badge at 5 followers)

Every hook is wrapped in `try {} catch {}` — if the engine fails for any reason, the primary workflow (saving the task, creating the follow) still succeeds.

### Real-time toasts
- Engine emits `achievement:unlocked` and `level:up` socket events per user
- Client `AchievementToast` component (mounted in AppLayout) catches them and shows a celebratory card for ~4 s
- Toasts are clickable → navigate to `/achievements`
- Multiple unlocks stack — helpful when one action triggers several tiers at once (finishing task #100 unlocks both the first-task milestone if missed and the 100-task badge)

---

## API

### `GET /api/v1/gamification/me`
Your full progress.

```json
{
  "xp": 245,
  "level": 3,
  "moodStreak": 4,
  "progress": {
    "level": 3,
    "xp": 245,
    "xpIntoLevel": 30,
    "xpForNextLevel": 85,
    "pctToNext": 35.3
  },
  "unlockedCount": 6,
  "unlocked": [
    { "key": "task_10", "xpAwarded": 50, "unlockedAt": "2026-04-20T08:12:00Z" },
    ...
  ]
}
```

### `GET /api/v1/gamification/user/:userId`
Public stats for any user (used by UserProfilePage badge display).

### `GET /api/v1/gamification/achievements`
All 18 definitions (no `check` function — just metadata).

### `GET /api/v1/gamification/leaderboard`
Top 20 by XP + your own rank:

```json
{
  "leaderboard": [
    { "rank": 1, "userId": "...", "name": "Priya", "xp": 1420, "level": 8, "moodStreak": 22, "isMe": false },
    ...
  ],
  "myRank": 14
}
```

---

## UI

### `/achievements` — three-tab page

**Stats tab** (default):
- Hero card: big level ring (conic-gradient rainbow border), XP total, progress bar to next level, mood streak, badge count
- Recent unlocks list — last 5 achievements with their icons, titles, XP, dates

**Achievements tab:**
- Grid (auto-fill, min 200 px columns)
- Unlocked = full color + tier-colored border glow + "Unlocked Mar 12" corner label
- Locked = grayscale + dimmed until hover
- Tiers sorted color-coded at the bottom of each card

**Leaderboard tab:**
- Top 20 with medals for 1st/2nd/3rd
- Your row highlighted (border + "you" pill) even mid-list
- Each row links to `/profile/:userId`
- Stats column shows level + XP right-aligned with tabular numerals

### Profile page badges (UserProfilePage)

The stats row on `/profile/:userId` now includes:
- **Lv N** + XP — clickable link to `/achievements`
- **🏅 N** badges count (only shown if > 0) — also links to `/achievements`

Slots the UserProfilePage already had open from Session 25 for exactly this.

### Toast notifications

Bottom-right stacking toasts when:
- **Achievement unlocked** — purple gradient, icon + title + XP reward
- **Level up** — orange/red/purple gradient, up-arrow + level number + total XP

Click-through to `/achievements`. Auto-dismiss after 4.2 s. Stack gracefully.

---

## Integration steps

**Prerequisite:** Sessions 1–27 integrated. Specifically:
- Session 13 socket reliability (toasts use SocketContext)
- Session 17 timezone utility (mood streak uses `userToday`)
- Session 25 UserProfilePage (receives the badge slots)
- Session 27 Wellness (mood log triggers streak update)

### 1. Copy server files

Replace or add:
```
server/models/User.js                           (replace)
server/models/UserAchievement.js                (new)
server/routes/gamification.js                   (new)
server/routes/tasks.js                          (replace)
server/routes/wellness.js                       (replace)
server/routes/follows.js                        (replace)
server/utils/gamificationContent.js             (new)
server/utils/gamificationEngine.js              (new)
server/index.js                                 (replace)
```

### 2. Copy client files

```
client/src/App.js                                         (replace)
client/src/components/AchievementToast.js                 (new)
client/src/components/AchievementToast.css                (new)
client/src/components/layout/AppLayout.js                 (replace)
client/src/pages/GamificationPage.js                      (new)
client/src/pages/GamificationPage.css                     (new)
client/src/pages/UserProfilePage.js                       (replace)
```

### 3. Restart

```bash
cd server && npm start
cd client && npm start
```

### 4. Verify

- Log in → sidebar has new "Achievements" link (⚡ zap icon)
- Click it → Stats tab shows level 1, 0 XP, empty progress bar
- Go to Tasks, complete a task → within ~1 s a purple toast appears: "Achievement unlocked — First step +20 XP" and another "+5 XP" from the event reward
- Return to `/achievements` → Stats shows level 1, 25 XP, progress bar at ~50%
- Check the Achievements tab → "First step" now has full color + bronze border
- Log a mood → "🌱 Checking in" achievement unlocks
- Log a mood tomorrow → streak goes to 2, no new badge (7-day threshold)
- Follow a teammate → "🤝 Making connections" unlocks + they get XP too

### Level up test

1. Grant yourself lots of XP manually for testing:
   ```js
   db.users.updateOne({ _id: <id> }, { $set: { xp: 310 } })
   ```
2. Log a mood (triggers engine recalc)
3. Level should jump from 1 to 5 → "Level up!" orange toast appears
4. Hero card updates to show Lv 5

### Leaderboard test

1. Set a few users' XP to varying amounts:
   ```js
   db.users.updateMany({}, [{ $set: { xp: { $multiply: [{ $rand: {} }, 500] } } }])
   ```
2. Open `/achievements` → Leaderboard tab
3. Sorted highest-first with medals on top 3, your row highlighted

---

## Design rationale

### Why definitions in code, not DB?

Achievement rules are logic, not data. They need a `check(ctx)` function. Storing that as a string and `eval`ing it at runtime is a security nightmare. Keeping them in `gamificationContent.js` means:
- Diff history in git shows exactly when rules changed
- Easy to test with unit tests (not written yet, but trivial to add)
- No admin UI needed for something that changes rarely
- `UserAchievement` stores just the key as an opaque string — renaming an achievement is a one-line code change

Cost: adding an achievement requires a code deploy, not a DB edit. Acceptable — the list will change maybe once a quarter.

### Why best-effort engine?

The whole point of gamification is that it's a secondary layer. If completing a task also quietly awarded you 5 XP, but the XP logic threw an exception, would we want that exception to bubble up and prevent the task from saving? Absolutely not. Every hook is wrapped in `try {} catch {}` — engine errors log to the console but never surface to users.

### Why `on: task_completed` not `post-save hook on Task`?

Mongoose hooks are implicit and hard to audit — you look at the route, don't see any XP logic, and have to know to check the model file. Explicit `awardXpAndCheck` calls in the route keep the flow visible. Three extra lines per hook is a fair price for readability.

### Why cache `level` on User instead of computing it from `xp`?

Leaderboard queries + profile display would need to run `levelForXp()` for every user every time. Caching the derived value means the sort on the DB side is simpler (`sort({ xp: -1 })`, level comes along for free). The engine recomputes level on every XP award anyway, so it stays fresh.

### Why not a daily login streak?

Considered and deferred. Tracking login vs. actual engagement is tricky — do cron-jobs count? What about users who keep the tab open forever? Mood streak is a cleaner signal because the user explicitly takes an action each day. If you want login streaks, add the same pattern as mood: `lastActiveDate` + `activeStreak` on User, update in middleware.

---

## Known tradeoffs

- **No retroactive awards.** If a user completed 100 tasks before Session 28 ships, the "Task 10" / "Task 100" badges won't fire because the engine runs on-event, not on-load. A one-time migration script could scan existing completions and award backdated badges. Left out for simplicity.
- **Meditation XP requires the client to call the engine.** The client doesn't yet — `WellnessPage.js` plays the bell but doesn't POST to any endpoint. Adding a `POST /wellness/meditation-complete` endpoint + engine hook is a one-liner for the next session.
- **No "secret" achievements.** Everything is visible in the Achievements tab from the start. Some games hide certain badges until unlocked for the surprise factor. Easy to add: a `hidden: true` flag in the definition + client filtering.
- **Leaderboard is global, not team-scoped.** A bigger company might want team-level or department-level leaderboards. Would need a `?team=<id>` query param. Easy to add.
- **No rank decay.** XP is monotonically increasing. A user who was active 6 months ago but hasn't logged in since still holds their rank. Some systems use "weekly XP" for rankings to emphasize recent activity. Also easy to add: filter `UserAchievement.unlockedAt >= 7 days ago` for the leaderboard.
- **No abuse guards.** A user could theoretically create + complete 500 tasks rapidly to farm the Task Legend badge. For most companies that's self-defeating (fake tasks don't help anyone). If it becomes an issue, add per-event rate limits.

---

## What's next

Remaining Phase F features:

| # | Feature | Est. sessions |
|---|---|---|
| N7 | Content hub (tutorials, feeds) | 1–2 |
| N5 | Knowledge graph (backlinks in docs) | 2 |
| N2 | Whiteboard | 2 |

**5 of 11 Phase F features delivered.** 3 remaining (spanning 5–6 sessions). Then G — Electron packaging (S30, S31 — I'll re-number the remaining once we cross into G).

---

## Progress map

| Phase | Sessions | Status |
|---|---|---|
| A — Foundation | 1, 2, 3 | ✅ |
| B — Security | 4, 5 | ✅ |
| C — Broken repairs | 6–9 | ✅ |
| D — Cross-cutting | 10–17 | ✅ |
| E — Module restyles | 18–23 | ✅ |
| **F — New features** | 24, 25, 26, 27, **28** + N2/N5/N7 | 🟡 **5/11 done** |
| G — Electron | 29, 30 | Pending |

Say **"next"** when ready — N7 Content hub is the natural follow-on, but N5 Knowledge graph or N2 Whiteboard are also options.
