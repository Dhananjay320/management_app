# Sessions 4 + 5 — Security Hardening

**Status: ✅ Build-verified.** All server routes load; client compiles clean.

---

## What this delivers

**Session 4 — Backend security fixes** (12 issues closed):

| # | Fix | Files |
|---|---|---|
| S1 | OTP codes masked by default. Full reveal requires main_admin + a written reason | `server/routes/security.js` |
| S2 | AuditLog model + helper. Every reveal, unlock, force-logout, delete is logged | `server/models/AuditLog.js`, `server/utils/audit.js` |
| S3 | Private-task access check on `GET /tasks/:id` | `server/routes/tasks.js` |
| S5 | `requireWorkspaceMember` middleware applied to 12 workspace routes. `/my-invites` route order bug fixed | `server/routes/workspace.js` |
| S6 | Power check on `POST /notifications/send` (prevents spoofed system notifications) | `server/routes/notifications.js` |
| S7 | Creator/power check on meeting edit + delete, with audit log on delete | `server/routes/meetings.js` |
| S8 | Regex-escape user input in search (ReDoS fix) + access-scoped filters | `server/routes/search.js` |
| S9 | **Breaking change:** `AI_MASTER_SECRET` env var now required. Server refuses to start without it | `server/utils/aiAdapters.js` |
| S10 | Activation code expiry parsing robust to both `YYYY-MM` and `YYYY-MM-DD` formats | `server/utils/aiAdapters.js`, `server/routes/ai.js` |
| S11 | Main_admin force-logout protection; self-force-logout blocked | `server/routes/security.js` |
| S12 | `task:updated` socket emit scoped to assignees/watchers/creator only | `server/routes/tasks.js` |
| + | Task delete hardened with creator/power check + audit | `server/routes/tasks.js` |

**Session 5 — Frontend security hardening**:

| Item | Files |
|---|---|
| `sanitizeHtml()` helper (DOMPurify with allow-list) | `client/src/utils/sanitize.js` |
| XSS fix — email body rendered through sanitize | `client/src/pages/EmailPage.js` |
| XSS fix — onboarding intro copy sanitized | `client/src/pages/OnboardingPage.js` |
| Force-logout socket handler shows admin name before redirect | `client/src/context/SocketContext.js` |
| `ConfirmDialog` component with optional reason field | `client/src/components/ConfirmDialog.{js,css}` |

---

## ⚠️ BREAKING CHANGE — read before deploying

**The server now REQUIRES `AI_MASTER_SECRET` in the environment.** If it's missing or shorter than 16 characters, the server refuses to start. This is intentional — the previous default secret (`niyoq_ai_secret_key_32ch`) was hardcoded into the source, meaning anyone with code access could decrypt all stored AI API keys.

### Set it before starting the server

Add to `server/.env` (create the file if you don't have one):

```bash
# Generate a strong secret:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
AI_MASTER_SECRET=<a_long_random_string_at_least_16_chars>
```

If the server fails to start after this update, check your env var. The error message will be clear:

```
[FATAL] AI_MASTER_SECRET env var is missing or too short (<16 chars).
```

### Migrating existing encrypted keys

If you already have users with activated AI (stored encrypted keys using the old default), those keys **will no longer decrypt** with the new secret. Options:

1. **Dev/staging:** Delete the `apiconfigs` collection and have users re-activate.
2. **Prod:** Temporarily set `AI_MASTER_SECRET=niyoq_ai_secret_key_32ch` (the old default) to keep old keys working. Then rotate: script to decrypt with old, encrypt with new, update. This is a real migration concern but out of scope for Session 4 (that's Phase C material).

---

## Integration steps

**Prerequisite:** Sessions 1, 2, 3 already integrated (this extends them).

### Step 1 — Install `dompurify` in the client

```bash
cd client
npm install dompurify --save
```

(The `sanitize.js` helper gracefully falls back to strip-all-tags mode if dompurify isn't available, so your app won't crash — but sanitization is much weaker. Install it.)

### Step 2 — Set `AI_MASTER_SECRET` in server env

See the breaking-change section above.

### Step 3 — Copy the files

**Server side:**
```
server/routes/security.js         (rewritten)
server/routes/tasks.js            (patched)
server/routes/workspace.js        (patched)
server/routes/notifications.js    (patched)
server/routes/meetings.js         (patched)
server/routes/search.js           (patched)
server/routes/ai.js               (patched)
server/utils/aiAdapters.js        (patched)
server/utils/audit.js             (NEW)
server/models/AuditLog.js         (NEW)
```

**Client side:**
```
client/src/utils/sanitize.js              (NEW)
client/src/components/ConfirmDialog.js    (NEW)
client/src/components/ConfirmDialog.css   (NEW)
client/src/context/SocketContext.js       (patched)
client/src/pages/EmailPage.js             (patched)
client/src/pages/OnboardingPage.js        (patched)
```

### Step 4 — Restart servers and verify

```bash
# Server
cd server
npm start  # or: AI_MASTER_SECRET=... npm start
```

Expected: server starts normally. If you see `[FATAL] AI_MASTER_SECRET env var is missing`, set the env var.

```bash
# Client
cd client
npm start
```

Expected: compiles clean, app loads, every feature you used before still works.

---

## Testing the security fixes

**S1 + S2 — OTP masking/audit:**
1. As an admin, visit Security Panel → Pending OTPs. Codes should show as `****12` (masked).
2. Only if you're `main_admin` should the backend accept `POST /security/reveal-otp/:id` with a reason.
3. All reveals now write to `AuditLog` collection.

**S3 — Private task access:**
1. Create a private task as user A.
2. As user B (not assignee/watcher), try `GET /tasks/:id` — should return 403.

**S5 — Workspace member check:**
1. Try `GET /workspace/:id` for a workspace you're not a member of — should return 403.
2. Try `GET /workspace/my-invites` — should return your pending invites (was unreachable before).

**S6 — Notification send power:**
1. As a non-admin user, try `POST /notifications/send` — should return 403.

**S7 — Meeting edit/delete:**
1. As an attendee (not creator), try to edit or delete the meeting — should return 403.

**S8 — Search regex escape:**
1. Search for `(((((a)))))`  — should not hang or crash.
2. Search workspace/meetings/messages — should only return items you're a member of.

**S9 — MASTER_SECRET:**
1. Start server without `AI_MASTER_SECRET` — should crash with clear message.

**S10 — Activation expiry:**
1. Use an activation code with expiry `2020-01-01` (format with day) — should correctly reject as expired.

**S11 — Force-logout protection:**
1. As admin (not main_admin), try to force-logout main_admin — should return 403.
2. Try force-logout on yourself — should return 400.

**S12 — Task socket scoping:**
1. Have user A update task X. User B (not assigned) should NOT receive the `task:updated` event.

**S4 — Email XSS:**
1. Receive an email with body `<script>alert(1)</script>Hello` — should render "Hello" only, no alert.
2. `<img src=x onerror=alert(1)>` — should render as safe image or be stripped.

---

## Build verification

**Server:**
- All 21 route files load without errors
- `AI_MASTER_SECRET=xxx node -e "require('./routes/...'); ..."` passes

**Client:**
```
Compiled successfully.
284.5 kB    main.js (+8.5 KB for DOMPurify)
19.5 kB     main.css
```

---

## What's next — Session 6+7

**Session 6: Email — Real SMTP/IMAP** (nodemailer + imapflow integration)  
**Session 7: Salary — Real PDF + calc fixes** (pdfkit or puppeteer)

When ready, come back and say "next batch". Both are backend-heavy but independent, so they batch well.
