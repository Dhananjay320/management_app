# Session 17 — Timezone, i18n scaffolding, Mobile responsive (C2 + C7 + C8)

**Status: ✅ Build-verified.** Client: 294.55 kB main.js (+1.78 kB), 23.39 kB CSS (+708 B). Server routes load cleanly.

Session 17 is the final Phase D session and closes **three** audit gaps in one:

- **C2 — Timezone awareness** (the most important)
- **C7 — i18n scaffolding** (structural, English-only at ship)
- **C8 — Mobile responsive** (shell-level only; per-module polish is each restyle session's job)

---

## What's in this zip

```
server/
├── models/User.js               (patched — settings.timezone + settings.locale added)
├── routes/
│   ├── users.js                 (patched — new PUT /users/me/settings endpoint)
│   ├── attendance.js            (patched — all date ops now user-timezone-aware)
│   └── meetings.js              (patched — upcoming/past cutoff uses user timezone)
└── utils/
    └── timezone.js              (NEW — dateStrInTz, userToday, startOfUserDay, isOnUserDay)

client/src/
├── i18n/                        (NEW folder — translation infrastructure)
│   ├── index.js                 (NEW — t(), setLocale(), formatDate, formatNumber)
│   └── locales/en.js            (NEW — ~50 seed strings)
├── hooks/useLocale.js           (NEW — syncs user.settings.locale to i18n)
├── context/AuthContext.js       (patched — exposes refreshUser)
├── components/
│   ├── PreferencesPanel.js      (NEW — timezone + locale picker UI)
│   ├── PreferencesPanel.css     (NEW)
│   └── layout/
│       ├── AppLayout.js         (patched — hamburger + drawer state)
│       └── AppLayout.css        (patched — mobile drawer + 44px touch targets)
└── pages/SettingsPage.js        (patched — mounts <PreferencesPanel>)
```

**14 files: 9 patched + 5 new.**

---

## C2 — Timezone awareness (the real fix)

### The bug

`new Date().toISOString().split('T')[0]` gives UTC's date. If an IST user marks attendance at 01:00 local time (which is 19:30 UTC the **previous** day), the attendance record went on the wrong date. The user would appear "absent" for today and "late" for yesterday.

Same problem hit the meetings list: "upcoming" meetings for an IST user at 23:00 local included meetings already 3 hours in the past in their wallclock, because the cutoff was UTC midnight.

### The fix

- **User gets a timezone setting.** Default is UTC. Settable via the new Preferences panel.
- **New `utils/timezone.js` module** provides four helpers:
  - `dateStrInTz(tz, date)` — YYYY-MM-DD string in the given IANA zone
  - `userToday(user)` — today's date string in this user's tz
  - `startOfUserDay(user, dateStr)` — JS Date representing 00:00 local wallclock on that day (as a UTC instant)
  - `isOnUserDay(user, date, dateStr)` — does this UTC timestamp fall on that local date?
- **No new npm packages.** Uses built-in `Intl.DateTimeFormat` — available since Node 14 and every modern browser.
- **Graceful fallback.** Invalid timezone strings (e.g. a typo) don't throw; they fall back to UTC.

### What this touches

| File | Change |
|---|---|
| `attendance.js` | All 8 `todayStr()` call sites → `todayStrFor(req.user)` |
| `meetings.js` | `startOfToday` → `startOfUserDay(req.user)` — past/upcoming correctly per-user |

### What this doesn't touch (yet)

The restyle sessions (18–23) will format displayed times using each user's tz. For now the server sends back the correct dates; the frontend still uses the browser's local tz for display, which is fine for most users (their browser tz matches their setting). Edge cases: a user on holiday who set their home tz will see dates from their home tz only after the Session 18+ display layer rolls out.

---

## C7 — i18n scaffolding

### Why "scaffolding," not "i18n"

We ship English-only. But every string in a growing codebase gets harder to translate later. Session 17 lays the groundwork so you can add Spanish, Hindi, Arabic later without hunting through JSX for hardcoded strings.

### No new dependencies

`react-intl` adds ~30 KB. `i18next` adds ~40 KB. Both are overkill for just English. Session 17 ships a **~60-line custom module** that:

- Supports `t('namespace.key')` lookups
- Supports `{name}` interpolation
- Supports plurals via `.one` / `.other` suffix keys
- Falls through to the key itself when missing (visible placeholder in dev console + warning)
- Exposes `formatDate()` + `formatNumber()` via `Intl.*` (same API as react-intl)

When a second locale ships, you swap this file for `react-intl` with zero call-site changes.

### Usage

```js
import { t, formatDate, formatNumber } from '../i18n';

<button>{t('common.save')}</button>
<span>{t('greeting.hi', { name: user.name })}</span>
<span>{t('tasks.count', { count: tasks.length })}</span>  // "1 task" / "5 tasks"
<time>{formatDate(meeting.date, { dateStyle: 'medium' })}</time>
```

### What's pre-filled

`locales/en.js` has ~50 seed strings grouped by namespace:

- `common.*` — Cancel, Save, Loading, etc.
- `nav.*` — every sidebar label
- `auth.*` — Sign in, Sign out, etc.
- `settings.*` — Timezone, Language
- `error.*` — Generic error messages (paired with `ErrorState` from Session 14)
- `empty.*` — Empty-state copy
- Plural examples for counts

**Existing pages don't use these yet.** That's intentional — wholesale migration would balloon this session. The restyle sessions (18–23) will adopt `t()` as they touch each page. For now the scaffolding is ready and the Preferences panel demonstrates the pattern.

### Adding a new language later

1. Copy `locales/en.js` to `locales/es.js`, translate the values
2. Add it to the `CATALOGS` map in `i18n/index.js`
3. Add `<option value="es">Español</option>` to the locale dropdown in `PreferencesPanel.js`

That's it.

---

## C8 — Mobile responsive

### What's done at the shell level

- **< 1100 px:** Sidebar collapses to icon-only (was already there)
- **< 760 px:** Sidebar becomes a **drawer** that slides in from the left. Hamburger button appears in the topbar. Backdrop blur when open. Clicking backdrop or navigating closes the drawer.
- **Touch devices (`pointer: coarse`):** All nav items minimum 44 px tall. Topbar icon buttons minimum 40×40 px.
- **Search bar on mobile:** Keyboard shortcut hint hidden, max width reduced so the bell / avatar still fit.
- **Topbar wordmark** hidden on < 760 px to save horizontal space.

### What's NOT done

Per-page layouts still need mobile polish. Example: the Messages page assumes two columns (channel list + chat); on mobile it needs a stack with a back button. That's the Messages restyle session (Session 18). Same story for Tasks, Meetings, Email, Workspace.

**Why defer?** The shell-level fixes make the app **navigable** on mobile. The per-page polish makes it **pleasant**. Navigability is table-stakes and belongs here; pleasantness belongs where you're already refreshing each page's styling.

### The Command Palette (Session 15) is already mobile-friendly

It uses `92vw` max-width `640px` so on a phone it occupies most of the screen naturally. Nothing to do.

---

## Integration steps

**Prerequisite:** Sessions 1–16 integrated.

### 1. Server

Copy these over existing files:
```
server/models/User.js
server/routes/users.js
server/routes/attendance.js
server/routes/meetings.js
server/utils/timezone.js                (new)
```

No new npm packages, no env vars, no DB migration — the new `settings.timezone` and `settings.locale` fields default to `'UTC'` and `'en'` respectively for existing users.

### 2. Client

Copy these:
```
client/src/i18n/index.js                         (new folder + file)
client/src/i18n/locales/en.js                    (new)
client/src/hooks/useLocale.js                    (new)
client/src/components/PreferencesPanel.js        (new)
client/src/components/PreferencesPanel.css       (new)

client/src/context/AuthContext.js                (replace)
client/src/components/layout/AppLayout.js        (replace)
client/src/components/layout/AppLayout.css       (replace)
client/src/pages/SettingsPage.js                 (replace)
```

### 3. Restart

```bash
cd server && npm start
cd client && npm start
```

### 4. Verify

- Open Settings → Preferences panel at the top shows timezone (default UTC) and Language (default English)
- Click "Use browser timezone (…)" → dropdown changes to your actual tz
- Save → saves via `PUT /users/me/settings`
- Log an IST user at 01:00 local → attendance records the correct date (not UTC yesterday)
- Resize browser to < 760 px → hamburger appears, sidebar becomes a drawer, tapping a link auto-closes it

---

## Testing

### Timezone

1. Set your timezone to `Asia/Kolkata` in Preferences. Save.
2. Look at the database: `users.findOne({_id:...})` shows `settings.timezone: "Asia/Kolkata"`.
3. Hit `GET /api/v1/attendance/today` — the returned `date` field is today in IST, not UTC.
4. Change to `America/Los_Angeles`. Hit attendance endpoint again — different date if the UTC→PST offset crosses midnight.
5. Try a nonsense value (`"Not/A_Real/Zone"`). Requests don't error; everything falls back to UTC.

### i18n

1. Open the DevTools console.
2. Trigger any screen that uses `t()` (Preferences panel does).
3. If you change `en.js` to delete a key (e.g. remove `common.save`), the console shows `[i18n] missing key: common.save` and the button literally renders "common.save" — easy to spot in dev.

### Mobile

1. Chrome DevTools → Device toolbar → iPhone 12 Pro
2. Reload. Hamburger button appears in topbar.
3. Tap hamburger → drawer slides in from left with blurred backdrop.
4. Tap a nav item → navigates AND drawer closes.
5. Open again, tap backdrop → drawer closes without navigating.
6. Tab order works: Hamburger → Brand → Search → Admin → Bell → Avatar.

---

## What's next

**Phase D is DONE.** 🎉

All 8 Phase D sessions finished. Summary:

- **S10** — Multi-admin roles & granular powers (C4)
- **S11** — Team membership enforcement (C9)
- **S12** — Notification deep-linking (C3)
- **S13** — Socket reliability (C5)
- **S14** — Error boundaries + retry UX (C11)
- **S15** — Global search palette (C10)
- **S16** — Deep-search real indexing (C6)
- **S17** — Timezone + i18n + mobile (C2+C7+C8) ← you are here

---

## Updated Phase F backlog (your + senior's features)

Original Phase F had 4 new features (N1–N4). After your senior's input, it now has 8:

| # | Feature | Source | Estimated sessions |
|---|---|---|---|
| N1 | Draggable sticky notes overlay | Original spec | 1 |
| N2 | Whiteboard | Original spec | 2 (26–27) |
| N3 | Scheduled messages | You | 1 |
| N4 | Follow someone (+ social-media follow) | You + senior | 1 |
| N5 | Knowledge graph (Notion/Obsidian: backlinks, db blocks, task embeds) | Senior | 2 |
| N6 | Wellness module (daily quote, meditation, mood) | Senior | 1 |
| N7 | Content hub (tutorials, context, industry feeds) | Senior | 1–2 |
| N8 | Gamification (XP, badges, leaderboard) | Senior | 2 |

This expands Phase F from 4 to ~12 sessions. That's fine — we'll prioritize when we get there. Some of these (like N5 knowledge graph) might be split into an MVP slice in Phase F and an expansion in a later release.

---

## Progress map

| Phase | Sessions | Status |
|---|---|---|
| A — Foundation | 1, 2, 3 | ✅ Complete |
| B — Security | 4, 5 | ✅ Complete |
| C — Broken repairs | 6, 7, 8, 9 | ✅ Complete |
| **D — Cross-cutting** | **10, 11, 12, 13, 14, 15, 16, 17** | ✅ **Complete** |
| **E — Module restyles** | **18–23** | ⏸ **Next** (6 sessions) |
| F — New features | 24–27 + N3–N8 (≈ 12 sessions) | Pending |
| G — Electron | 28, 29 | Pending |

## Next — Phase E begins

6 sessions restyling each major module with the approved design system and fixing the audit's UX findings:

- **Session 18** — Tasks (kanban, list, calendar views + `?highlight=` deep-link support)
- **Session 19** — Messages (glass channel rail, typing indicator polish, mobile stack layout)
- **Session 20** — Meetings (calendar-prominent, MoM editor polish, `?highlight=` support)
- **Session 21** — Email (3-column glass layout, real HTML rendering)
- **Session 22** — Workspace (Notion-lite doc view, breadcrumb navigation)
- **Session 23** — Salary + Analysis (person calendar view, chart polish)

Say **"next"** when ready for Session 18.
