# Session 11 — Team Membership Enforcement (C9)

**Status: ✅ Verified.** All 5 affected server routes load cleanly.

Session 11 closes audit gap **C9**: most team-scoped endpoints accepted a team ID from the client without checking whether the caller was actually a member of that team. An admin could browse any team's tasks, read any team channel, or post to any team feed by just passing the right team ID.

This session centralizes the membership check in one helper module and applies it to every team-scoped route.

---

## What's in this zip

```
server/
├── utils/
│   └── teamAccess.js          (NEW — centralized team/channel membership helpers)
└── routes/
    ├── tasks.js               (patched — team enforcement on list + create)
    ├── activities.js          (patched — uses canAccessTeam helper)
    ├── feed.js                (patched — uses canAccessTeam + enforce on create)
    ├── attendance.js          (patched — /team respects adminScope + ?team= param)
    └── messages.js            (patched — isChannelMember fixes ObjectId includes bug)
```

**6 files: 5 patched + 1 new.**

---

## What changed

### New module: `server/utils/teamAccess.js`

Single source of truth for team access checks. Exports:

```js
isTeamMember(user, teamId)           // sync — reads user.teams array
isChannelMember(channel, userId)     // sync — reads channel.members array
isTeamLead(user, teamOrId)           // async — checks Team.lead field
canAccessTeam(user, teamId)          // async — member OR lead OR main_admin OR scoped admin
requireTeamMember(getTeamId)         // Express middleware
assertTeamMember(user, teamId)       // throws HTTP-shaped error for try/catch
```

`canAccessTeam` is the main one. It returns true when:
- The user is `main_admin`
- The user's `teams` array contains the team ID
- The user has `adminScope.teams` that includes the team ID (Session 10 concept)

**Scoped admin semantics:** a user with `adminScope.teams = [X, Y]` can access teams X and Y even without being a member of those teams. A user with empty `adminScope.teams` does NOT get a pass — they still need to be a member. This is intentional so non-admins don't unexpectedly gain access.

### Channel membership ObjectId bug — fixed

I found a latent bug across `messages.js`: 4 places used `channel.members.includes(req.user._id)`. This doesn't work reliably for mongoose ObjectId arrays — `Array.prototype.includes` uses `===` which is always false between different ObjectId instances. The check sometimes worked (when the IDs were strings), sometimes didn't (when they were proper ObjectIds).

`isChannelMember(channel, userId)` normalizes both sides to strings before comparing. All 4 call sites in `messages.js` now use it. This fix in itself is a security bug closure — users could sometimes get 403 from channels they legitimately belonged to.

### Per-route enforcement applied

**tasks.js** — `GET /?view=team&team=X` requires `canAccessTeam`. `POST /` checks team membership when the task has a `team` field.

**activities.js** — `GET /?audience=team&team=X` now uses `canAccessTeam` (cleaner than the inline check from Session 9). `POST /` requires team access when `audience=team`.

**feed.js** — same pattern as activities. List uses `canAccessTeam`, create uses `assertTeamMember`.

**attendance.js** `GET /team`:
- main_admin with no `?team=`: sees everyone (unchanged)
- main_admin with `?team=X`: sees that team only
- Scoped admin with `?team=X`: requires `canAccessTeam`, 403 if not scoped to X
- Scoped admin with no `?team=`: narrows to their `adminScope.teams` automatically
- Unscoped admin: sees everyone they could before (unchanged)

**messages.js** — fixed `channel.members.includes` bug on 4 routes.

---

## Integration steps

**Prerequisite:** Sessions 1–10 integrated. Session 10's `adminScope` field on User is referenced here.

### 1. Copy the new helper

```
server/utils/teamAccess.js        (new)
```

### 2. Replace the 5 route files

```
server/routes/tasks.js           (replace)
server/routes/activities.js      (replace)
server/routes/feed.js            (replace)
server/routes/attendance.js      (replace)
server/routes/messages.js        (replace)
```

### 3. No frontend changes

The frontend behavior is unchanged. The only difference is that requests that were previously "accidentally allowed" now return 403 with a clear error.

### 4. Restart

```bash
cd server && npm start
```

---

## Testing

1. User A (member of Team X only). `GET /api/v1/tasks?view=team&team=X` → 200.
2. User A. `GET /api/v1/tasks?view=team&team=Y` → 403 "You are not a member of that team."
3. HR admin scoped to Team X (adminScope.teams = [X]). `GET /api/v1/tasks?view=team&team=X` → 200 (not a member, but scoped).
4. HR admin scoped to Team X. `GET /api/v1/tasks?view=team&team=Y` → 403.
5. main_admin → any team, always 200.

Same test matrix applies to `/activities`, `/feed`, and `/attendance/team`.

### Channel membership regression fix

Previously, depending on whether you reached the messages endpoint from a fresh channel fetch vs. a populated one, the `includes` check would sometimes return false for legitimate members. That's fixed. If any of your test users had been intermittently getting "Not a member of this channel" errors, they should stop.

---

## Progress map

| Phase | Sessions | Status |
|---|---|---|
| A — Foundation | 1, 2, 3 | ✅ Complete |
| B — Security | 4, 5 | ✅ Complete |
| C — Broken repairs | 6, 7, 8, 9 | ✅ Complete |
| **D — Cross-cutting** | 10, **11**, 12–17 | 🟡 2/8 done |
| E — Module restyles | 18–23 | Pending |
| F — New features | 24–27 | Pending |
| G — Electron | 28, 29 | Pending |

## Next — Session 12

**C3 — Notification deep-linking.** When you click a notification, nothing happens. Should navigate to the relevant item (task, meeting, message, etc.). Requires:
- Notification model already has `actionType` + `actionTarget` — they're just unused by the frontend
- Wire the notification click handler to `navigate(...)` based on actionType
- Add a reusable `useNotificationDeepLink()` hook
- Update the notifications page + toast to use it

When ready, say "**next**".
