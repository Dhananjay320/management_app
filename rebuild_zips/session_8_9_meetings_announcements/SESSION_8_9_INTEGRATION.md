# Sessions 8 + 9 — Meetings fixes + Announcements CRUD + Team Picker

**Status: ✅ Build-verified.** Client: 286.79 kB main.js (+2.3 kB over Session 7). All server routes load.

These sessions close the last remaining "broken-repair" items in Phase C.

---

## What's in this zip

```
server/
├── routes/
│   ├── meetings.js          (patched — Session 8)
│   ├── announcements.js     (patched — Session 9, added CRUD)
│   ├── activities.js        (patched — Session 9, team filter fix)
│   └── feed.js              (patched — Session 9, team filter fix)
└── models/
    └── Meeting.js           (patched — added lastAutoSaveAt field)

client/src/
├── App.js                   (patched — new admin route)
├── components/
│   ├── ConfirmDialog.js     (patched — IMPORTANT: fixes broken import from S5)
│   └── layout/
│       └── AppLayout.js     (patched — added Announcements entry in admin nav)
└── pages/admin/
    ├── AnnouncementManager.js   (NEW — full CRUD UI)
    └── AnnouncementManager.css  (NEW)
```

**11 files total: 9 patched + 2 new.**

---

## ⚠️ Important — ConfirmDialog import fix

During Session 8+9 verification I found a latent bug in Session 5's `ConfirmDialog.js`:

**Before (broken):** `import { ... } from '../../design-system';`
**After (correct):** `import { ... } from '../design-system';`

From `src/components/ConfirmDialog.js`, the design-system folder is one level up (`../design-system`), not two. The original Session 5 zip had this wrong. Nothing broke in Session 5 because **nothing actually imported ConfirmDialog yet** — the first consumer is Session 9's `AnnouncementManager`.

**If you already integrated Session 4+5**, replace your `ConfirmDialog.js` with the one in this zip. Otherwise no action needed.

---

## Integration steps

**Prerequisite:** Sessions 1–7 already integrated.

### Step 1 — Apply server changes

Copy these files over your existing ones:
```
server/routes/meetings.js
server/routes/announcements.js
server/routes/activities.js
server/routes/feed.js
server/models/Meeting.js
```

No new npm dependencies. No new env vars.

### Step 2 — Apply client changes

Copy these files over your existing ones (and add the new ones):
```
client/src/App.js                                  (replace)
client/src/components/ConfirmDialog.js             (replace — fixes import)
client/src/components/layout/AppLayout.js          (replace)
client/src/pages/admin/AnnouncementManager.js      (new)
client/src/pages/admin/AnnouncementManager.css     (new)
```

### Step 3 — Restart + verify

```bash
cd server && npm start
cd client && npm start
```

Log in as main_admin. Toggle admin mode in the topbar. In the sidebar under **Admin** you'll see a new **Announcements** entry (with the megaphone icon).

---

## What changed — Session 8 (Meetings)

### GET /api/v1/meetings — list fix

**Upcoming tab** was missing meetings the user *created* (creator not always in attendees list). **Past tab** was only showing meetings explicitly marked `completed` or `cancelled` — a meeting that ended at 10am but was never marked done was invisible at 11am.

Now:
- Both tabs include meetings where user is an attendee OR the creator
- Past tab = (date < today) OR (status is completed/cancelled)
- Upcoming tab = date ≥ today AND status not in completed/cancelled
- Scoped to `isActive: true` to hide soft-deleted ones

### POST /api/v1/meetings — no more fake Google Meet links

**Before:** for `type: 'online'`, the server generated a random-looking URL like `https://meet.google.com/a1b-2c3d-4e5` that 404'd because we don't have Google Workspace integration. The audit flagged this in Section 8.

**Now:** the generator is gone. The endpoint accepts an optional `videoLink` (or `googleMeetLink`) in the body. Must be HTTPS. If absent, the field stays null and the UI can prompt the creator to paste a link when the meeting starts.

The UI in `pages/Meetings.js` still needs a text-field for pasting the video link — that's a Session 18 (Meetings restyle) task. For now the backend is ready.

### PUT /api/v1/meetings/mom/:momId — MoM auto-save support

**Added:** author-check so only the MoM's author (or main_admin) can edit. Each save updates `lastAutoSaveAt` timestamp so the UI can show "Saved just now" feedback.

**To use from the frontend** (Session 18 task): debounce tiptap changes by 1.5 s and `PUT` the updated JSON:

```js
useEffect(() => {
  const t = setTimeout(() => {
    if (isDirty) api.put(`/meetings/mom/${momId}`, { tiptapJSON: editor.getJSON() });
  }, 1500);
  return () => clearTimeout(t);
}, [editor.getJSON(), isDirty]);
```

---

## What changed — Session 9 (Announcements + Team picker)

### Announcements — full CRUD

New endpoints:
- `GET  /api/v1/announcements/all` — admin list (every announcement, active + archived), requires `announcements.manageAll` or `announcements.sendCompanyWide` power, or main_admin role
- `PUT  /api/v1/announcements/:id` — edit title/content/audience/team (creator or power)
- `DELETE /api/v1/announcements/:id` — soft-delete (creator or power), broadcasts `announcement:deleted` socket event so live banners vanish

### AnnouncementManager UI

Accessible at `/admin/announcements` for users with management power. Features:
- List view with pills for Company / Team audience
- Toggle between "Active only" and "All" (including archived)
- "New announcement" button opens a modal with title, content, audience picker, team selector
- Edit inline by clicking the settings icon on any row
- Delete with confirmation dialog (uses the fixed `ConfirmDialog` component)
- Archived announcements appear greyed-out with an "Archived" badge in the "All" view

### Team picker fix — applies to BOTH Activities and Feed

**Bug from audit Section 13:** when the UI sent `?audience=team&team=<id>` to filter to a specific team, the backend IGNORED the `team` param and returned activities/posts from ALL teams the user was in.

**Fix:** both `routes/activities.js` and `routes/feed.js` now:
1. Accept the `team` query param
2. Verify the user is a member of that team (403 otherwise)
3. Filter to exactly that team

Also tightened the other audience values:
- `audience=company` → only company-wide items
- `audience=individual` → only user's own individual activities
- no audience → everything user can see (company + their teams + their individual items)

This is a backwards-compatible change — existing UI code still works, it just now correctly filters when given an explicit team.

---

## Testing

### Meetings

1. Create a meeting with yourself as the only attendee AND as the creator. Check Upcoming tab — visible.
2. Wait until the meeting's date passes (or manually set it in the past). Check Past tab — should now be visible even if status is still `scheduled`.
3. Create an "online" meeting without a videoLink. In the DB, `googleMeetLink` should be `null` (not a fake URL).
4. Create one with `videoLink: "https://meet.google.com/real-link"` in the body — stored correctly.
5. As user A, open your scratchpad on a meeting. Edit some notes. Refresh the page. Notes persist.
6. As user B, try to `PUT /api/v1/meetings/mom/<user-A-momId>` directly — should return 403.

### Announcements

1. As admin, visit `/admin/announcements`. See the list.
2. Click "New announcement". Create a team-scoped announcement. It should appear immediately in the list.
3. Click edit on it, change the content, save. Updated in the list.
4. Click delete, confirm. It disappears from the active list. Toggle to "All" — appears greyed with "Archived" badge.
5. Go to Calendar homepage. Active announcements show as banners.

### Team picker (activities)

1. User A is a member of Team X only.
2. `GET /api/v1/activities?audience=team&team=X` → returns Team X activities. ✓
3. `GET /api/v1/activities?audience=team&team=Y` (user NOT in Y) → 403. ✓
4. `GET /api/v1/activities?audience=team` (no team param) → all Team X activities. ✓
5. `GET /api/v1/activities` → company + team X + user's individual. ✓

Same tests apply to `/api/v1/feed`.

---

## Build verification

**Server:**
```
✓ meetings
✓ announcements
✓ activities
✓ feed
```
All routes load without errors (`AI_MASTER_SECRET=... NODE_ENV=test require(route)`).

**Client:**
```
Compiled successfully.
286.79 kB  main.js  (+2.3 kB over Session 7 — from AnnouncementManager)
20.37 kB   main.css (+0.9 kB — AnnouncementManager styles)
```

---

## Progress map

| Phase | Sessions | Status |
|---|---|---|
| A — Foundation | 1, 2, 3 | ✅ Complete |
| B — Security | 4, 5 | ✅ Complete |
| **C — Broken repairs** | 6, 7, 8, 9 | ✅ **Complete** |
| D — Cross-cutting | 10–17 | ⏸ Next |
| E — Module restyles | 18–23 | Pending |
| F — New features | 24–27 | Pending |
| G — Electron | 28, 29 | Pending |

## Next up — Phase D (Cross-cutting)

This is the longest phase. 8 sessions covering cross-cutting gaps C1–C11 from the audit doc:

**Session 10** — C4 Multi-admin roles & granular powers (powers system cleanup)
**Session 11** — C9 Team membership enforcement (team-scoped everything)
**Session 12** — C3 Notification deep-linking (click a notification → go to that item)
**Session 13** — C5 Socket reliability (reconnect, missed messages, presence)
**Session 14** — C11 Error boundaries + retry UX everywhere
**Session 15** — C10 Global search UI (⌘K palette)
**Session 16** — C6 Deep-search real indexing (replace the stub worker)
**Session 17** — C2+C7+C8 Timezone, i18n scaffolding, mobile responsive audit

Each of these is a single session. These will take longer than Phase B/C because they touch many files at once. I recommend one per message from here on.

When ready for Session 10, say "**next**".
