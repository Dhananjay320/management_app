# Session 27 — Wellness Module (N6)

**Status: ✅ Build-verified.** Client: 305.49 kB main.js (+1.94 kB), 30.23 kB CSS (+940 B). Server routes + content utility load cleanly.

Fourth Phase F feature. A quiet corner of the app for a daily inspirational quote, a meditation timer, and a mood check-in. Deliberately short and gentle — a counterweight to the rest of the productivity-focused UI.

---

## What's in this zip

```
server/
├── index.js                              (patched — wired /api/v1/wellness route)
├── models/MoodCheckin.js                 (NEW — daily mood record)
├── routes/wellness.js                    (NEW — 4 endpoints)
└── utils/wellnessContent.js              (NEW — 60 quotes + meditation presets)

client/src/
├── App.js                                (patched — /wellness route)
├── components/layout/AppLayout.js        (patched — sidebar link)
└── pages/
    ├── WellnessPage.js                   (NEW — three cards + trend)
    └── WellnessPage.css                  (NEW)
```

**8 files: 3 patched + 5 new.** No new npm dependencies.

---

## What it does

**`/wellness` — one page, three cards plus a trend strip:**

### 1. Daily quote card
- Different quote for each user, stable all day
- 60-quote library across 8 categories (mindful, focus, resilience, kindness, growth, gratitude, balance, connection)
- Each category has an accent color shown as a left border + kicker tint
- Quote chosen by deterministic hash of `(today's date, user ID)` — same user sees the same quote all day, two users see different quotes, library wraps every 60 days

### 2. Meditation card
- Four presets: 2 min / 5 min / 10 min / 15 min
- Big animated breathing circle in the center
- Cycles through 4 s inhale (expand) → 2 s hold → 6 s exhale (contract)
- Phase label updates live: "breathe in" · "hold" · "breathe out"
- Countdown timer display (mm:ss tabular numerals)
- Soft 528 Hz Web Audio bell on completion — no asset files needed, pure browser API
- "End session" button to abort

### 3. Mood check-in card
- Five-emoji scale: 😔 Rough / 😕 Low / 😐 Okay / 🙂 Good / 😄 Great
- Optional 200-char note (private, stays with the user)
- Upserts by default — you can correct or update your check-in later the same day
- After submit: button flashes "Saved ✓" for 2.4 seconds
- If you've already checked in, the card shows the emoji you picked

### 4. 14-day trend strip
- Mini bar chart at the bottom showing last 14 days' mood
- Bar height proportional to mood (1–5 mapped to 20–100%)
- Days without a check-in show as faded stubs
- Average mood ("Avg 3.8 / 5") shown to the right of the title

---

## API

### `GET /api/v1/wellness/today`
Returns `{ date, quote: { text, author, category, color }, mood | null }`. Used for initial page load.

### `POST /api/v1/wellness/mood`
```json
{ "mood": 4, "energy": 3, "note": "Focused morning, great standup" }
```
- `mood` required, 1–5
- `energy` optional, 1–5
- `note` optional, clipped to 200 chars server-side
- Upserts on `(user, date)` so duplicate submissions update rather than 409. Date is computed server-side in the user's timezone (matches the Session 17 attendance pattern).

### `GET /api/v1/wellness/history?limit=14`
Returns records oldest-first (reversed server-side from the `sort({ date: -1 })` query) so the client can render them left-to-right. Limit caps at 180 days.

### `GET /api/v1/wellness/presets`
Returns `{ meditation: [{ key, label, durationSec }] }`. Currently static — fine since there are only 4 presets — but the endpoint exists so admins can later override via a DB collection without a code change.

---

## Design choices worth noting

### Why deterministic quotes, not random?

If `Math.random()` picked the quote, reloading the page would show a different quote — giving the page a "slot machine" feel that's the opposite of the calm tone we want. Deterministic `(date, userId)` hash gives the page a single stable message for the day, which is how you'd encounter a quote-of-the-day on paper.

### Why 528 Hz?

Popularly called the "healing tone" in meditation culture. Practically: it's a mid-range frequency that cuts through at low volume without feeling harsh, and doesn't clash with most laptop speakers. Nothing mystical — just a pleasant choice.

### Why upsert the mood instead of blocking duplicates?

Users realize a few minutes after checking in "actually, I was more 3 than 4 today". Forcing a 409 would be paternalistic. Upserting lets them update until the day rolls over.

### Why the breathing animation cycle is 12 seconds (4+2+6)?

Based on pranayama and box-breathing research — extended exhale (6 s) is where the relaxation happens. A classic "box breath" is 4-4-4-4 but slightly longer exhales produce stronger parasympathetic response. If this feels too slow, the CSS variable `--ad-breath-dur` can be tuned.

### Why private notes only?

A shared mood feed could be great for team culture but also invasive. Team-wide mood dashboards are a separate feature — better as an opt-in admin/HR view rather than something every teammate sees by default.

---

## Integration steps

**Prerequisite:** Sessions 1–26 integrated. Specifically Session 17 (`utils/timezone.js` → `userToday()`) is required.

### 1. Copy server files

```
server/models/MoodCheckin.js
server/routes/wellness.js
server/utils/wellnessContent.js
server/index.js                              (replace)
```

### 2. Copy client files

```
client/src/App.js                                       (replace)
client/src/components/layout/AppLayout.js               (replace)
client/src/pages/WellnessPage.js                        (new)
client/src/pages/WellnessPage.css                       (new)
```

### 3. Restart

```bash
cd server && npm start
cd client && npm start
```

### 4. Verify

- Click the new "Wellness" link in the sidebar (Sparkles icon)
- Quote card appears with a category color left-border
- Click a meditation preset → Begin → circle starts pulsing, phase label changes every 4 s, countdown decreases. Let it run out → soft bell plays
- Select a mood emoji → add optional note → Check in → button flashes "Saved ✓"
- Reload the page → your mood is remembered ("You checked in as 🙂 today.")
- Change your mood selection and Update → server upserts, no error

### End-to-end trend chart

1. Check in with mood = 4 today
2. In MongoDB: `db.moodcheckins.insertMany([{ user: <userId>, date: '2026-04-19', mood: 3 }, { user: <userId>, date: '2026-04-18', mood: 5 }])`
3. Reload `/wellness` → bottom trend strip shows 3 bars with the right heights, empty days as faded stubs, avg ~= 4.0

---

## Known tradeoffs

- **No quote curation UI.** The 60-quote library is hardcoded. Adding a DB collection with admin UI would be ~1 day more work; the library is big enough that it feels infinite to any single user for several months.
- **No team or cohort mood dashboards.** By design — see "Why private notes only?" above. If this becomes a real HR request it's a separate admin-only page.
- **No meditation progress tracking.** We don't record which meditations users started/completed. Could add a `MeditationSession` collection for streak tracking (pairs naturally with N8 gamification).
- **Breathing animation has no sound cues** beyond the final bell. Some meditation apps play a soft tone at each phase transition — considered, decided it was more intrusive than helpful for a default.
- **Bell fails silently if AudioContext is blocked.** Some browsers block WebAudio without a user gesture; since the user clicked "Begin", context creation should always succeed, but a `try {} catch {}` guards the edge case.
- **Trend strip shows last 14 days only.** A longer-range view (30/60/90 days) could go on a dedicated "Insights" tab but wasn't scoped for N6 MVP.

---

## What's next

Remaining Phase F features:

| # | Feature | Est. sessions | Why now? |
|---|---|---|---|
| N8 | Gamification (XP, badges, leaderboard) | 2 | Can layer badges onto the new UserProfilePage slots |
| N7 | Content hub (tutorials, feeds) | 1–2 | Extends Team Feed |
| N5 | Knowledge graph (backlinks in docs) | 2 | Workspace ready for it |
| N2 | Whiteboard | 2 | Largest effort — save for last |

Recommended next: **N8 Gamification** — XP for completing tasks, badges for milestones (first month, 100 tasks, 7-day streak), leaderboard. Pairs well with the Wellness module we just shipped (meditation streaks = badges) and brings the ongoing emotional tone of the app together.

Alternative: **N7 Content hub** or go straight into **N5 Knowledge graph** which adds Notion/Obsidian-style backlinks and database blocks to Workspace docs.

---

## Progress map

| Phase | Sessions | Status |
|---|---|---|
| A — Foundation | 1, 2, 3 | ✅ |
| B — Security | 4, 5 | ✅ |
| C — Broken repairs | 6–9 | ✅ |
| D — Cross-cutting | 10–17 | ✅ |
| E — Module restyles | 18–23 | ✅ |
| **F — New features** | 24, 25, 26, **27** + N2/N5/N7/N8 | 🟡 **4/11 done** |
| G — Electron | 28, 29 | Pending |

**36% of Phase F complete.** Seven features remaining (spanning ~10 sessions) before Electron packaging closes out the project.

Say **"next"** when ready for Session 28 — or tell me which feature to tackle (N8 gamification recommended, or N7 content hub, N5 knowledge graph, N2 whiteboard).
