# Session 10 — Multi-admin Roles & Granular Powers (C4)

**Status: ✅ Build-verified.** Client: 288.38 kB main.js (+1.6 kB), 21.13 kB CSS (+0.8 kB). All server routes load.

This session closes audit gap **C4**: the app advertised granular powers but had no working UI to manage them. It also lays the groundwork for Session 11 (team enforcement) and every future session that checks `user.hasPower(...)`.

---

## What's in this zip

```
server/
├── models/User.js             (patched — powerSchema expanded, adminScope added, hasAnyPower + isInAdminScope methods)
├── routes/users.js            (patched — audit on powers change, /powers/groups catalog, GET /powers endpoint)
└── middleware/auth.js         (patched — requireAnyPower, requireAdminScope helpers)

client/src/
├── App.js                     (patched — new /admin/users/:id/powers route)
└── pages/admin/
    ├── EditUser.js            (patched — added "Open powers editor" button)
    ├── PowersEditor.js        (NEW — the full CRUD UI for powers + admin scope)
    └── PowersEditor.css       (NEW)
```

**7 files: 5 patched + 2 new.**

---

## What changed

### Expanded `powerSchema` (server/models/User.js)

The power catalog now has **16 groups** (was 13) and covers every action referenced across Sessions 4-9. Key additions:

| Group | New flag | Used by |
|---|---|---|
| `users` | `resetPassword` | Admin-driven password reset flow |
| `tasks` | `viewAny`, `editAny` | Session 4 S3 override, edit-any |
| `meetings` | `editAny` | Session 4 S7 reference |
| `messaging` | `moderateAny` | Message moderation |
| `announcements` | `manageAll` | Session 9 CRUD |
| `notifications` | `sendSystem` | Session 4 S6 |
| `email` | `manageAccounts` | Admin account creation |
| `security` | `viewAuditLog` | Session 4 S2 |
| `activities` | `createCompanyWide`, `moderateAny` | (new group) |
| `feed` | `pinAny`, `deleteAny` | (new group) |

`strict: false` on the schema means users created before Session 10 will load cleanly — missing flags default to `false`.

### `adminScope` (new field)

```js
adminScope: {
  teams:   [ObjectId],   // teams this admin can manage (empty = unrestricted)
  offices: [ObjectId],   // offices this admin can manage (empty = unrestricted)
}
```

Lets you have "HR Admin for Team X only" instead of HR admin for everything. Empty arrays mean unrestricted within their granted powers.

### New User methods

```js
user.hasPower('tasks', 'deleteAny')           // existing
user.hasAnyPower([['tasks','deleteAny'], ['tasks','editAny']])  // NEW
user.isInAdminScope('teams', someTeamId)      // NEW — true if teams array is empty OR contains ID
```

### New middleware helpers (server/middleware/auth.js)

```js
requireAnyPower([['tasks', 'deleteAny'], ['tasks', 'editAny']])
requireAdminScope('teams', req => req.body.teamId)
```

### New endpoints

- `GET /api/v1/users/:id/powers` — fetches target user's powers + adminScope (populated team/office names)
- `GET /api/v1/users/powers/groups` — metadata catalog for the frontend editor (groups, flags, human labels). The frontend tree is NO LONGER hardcoded.
- `PUT /api/v1/users/:id/powers` — **now audit-logged** with a diff, accepts `adminTitle` + `adminScope` alongside `powers`, and refuses to modify main_admin unless the caller IS the main_admin.

### PowersEditor UI

Full-screen admin page at `/admin/users/:id/powers`. Features:

- Hero header with avatar, gradient name, enabled-count stat
- **Admin title** text field (e.g. "HR Admin") shown in the admin pill elsewhere
- **Team scope** multi-select chips — unrestricted by default, chip-toggle to restrict
- **Search bar** to filter powers by label or key (⌘F not wired yet, but the input is focusable)
- **Per-group cards** with enable-all/clear-all buttons and animated toggle switches
- **Sticky save bar** at the bottom with count summary + Save / Cancel

Accessed from the existing EditUser page via a new "Open powers editor →" button.

---

## Integration steps

**Prerequisite:** Sessions 1–9 already integrated.

### 1. Copy server files

```
server/models/User.js               (replace)
server/routes/users.js              (replace)
server/middleware/auth.js           (replace)
```

### 2. Copy client files

```
client/src/App.js                                (replace)
client/src/pages/admin/EditUser.js               (replace)
client/src/pages/admin/PowersEditor.js           (new)
client/src/pages/admin/PowersEditor.css          (new)
```

### 3. Restart + verify

```bash
cd server && npm start
cd client && npm start
```

Login as main_admin. Toggle admin mode. Go to **Admin → Manage Users → select a user**. You'll see a new "Open powers editor →" button at the bottom. Click it to open the full powers editor.

---

## Migration notes

### Existing users

No data migration needed. Users created before Session 10 will load with their existing powers intact. New flags (e.g. `notifications.sendSystem`) default to `false`, matching "least privilege." Grant explicitly as needed.

### Backwards compatibility

- The old inline powers section in `EditUser.js` still works (I kept it for quick toggles).
- All existing `requirePower(...)` calls continue to work.
- The OLD schema shape on existing User records is preserved thanks to `strict: false`.

### main_admin protection

The `PUT /users/:id/powers` endpoint now refuses to modify `main_admin`'s powers unless the caller IS that main_admin. This prevents a privileged HR admin from neutering the main_admin. Previously this was possible.

---

## Testing

### Server

1. As main_admin, `PUT /api/v1/users/<employee-id>/powers` with `{ powers: {...}, adminTitle: "HR" }` — should succeed and write an `AuditLog` row with `action: 'user.powerChange'`.
2. As a non-main-admin with `users.editPowers`, try `PUT /users/<main-admin-id>/powers` — should 403.
3. As a non-main-admin, try editing your own powers — also 403 (self-escalation).
4. `GET /api/v1/users/powers/groups` — returns the full 16-group catalog.

### Client

1. Open `/admin/users/<id>/powers`. Toggle a few flags. Type an admin title. Select a team chip for scope. Save.
2. Reload the page — saved values persist.
3. Use search: typing "salary" filters to only salary-related power groups.
4. Enable-all / clear-all per group works atomically.

---

## Progress map

| Phase | Sessions | Status |
|---|---|---|
| A — Foundation | 1, 2, 3 | ✅ Complete |
| B — Security | 4, 5 | ✅ Complete |
| C — Broken repairs | 6, 7, 8, 9 | ✅ Complete |
| **D — Cross-cutting** | **10**, 11–17 | 🟡 1/8 done |
| E — Module restyles | 18–23 | Pending |
| F — New features | 24–27 | Pending |
| G — Electron | 28, 29 | Pending |

## Next — Session 11

**C9 — Team membership enforcement.** Currently most "team-scoped" features accept a team ID without checking the user is actually a member. Session 11 will add middleware + per-route checks for tasks, meetings, messages, attendance visibility, etc.

This session also USES the `isInAdminScope()` method we just built, so this order matters.

Say "**next**" when ready.
