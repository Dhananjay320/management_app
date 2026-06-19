# WFH Tracking System — Mind Map & Reference

> Everything built on top of the base Niyoq app to enable Work-From-Home time accountability.
> Source of truth for what exists, what each piece does, and where it lives in the code.
> Last updated: 2026-06-09

---

## 1. The big picture (one paragraph)

The WFH tracking system answers two questions for every employee on every day they work remotely:
**(1)** *Were they actually working?* — via screenshots, foreground-app sampling, and keyboard/mouse activity.
**(2)** *Was the work productive?* — via a per-company catalogue of apps labelled Productive / Neutral / Unproductive, with per-team overrides.
Every piece is **opt-in at the company level** (admin toggles a master switch) and **consent-gated per employee** (consent modal must be accepted before any data is collected). All telemetry has a TTL so it auto-deletes after the retention window. The Electron wrapper gives the same web app native superpowers — `desktopCapturer`, `active-win`, `powerMonitor` — that the browser can't access on its own.

---

## 2. Mind map (text form)

```
WFH TRACKING SYSTEM
│
├── 1. POLICY & CONSENT
│   ├── CompanyMonitoring (one doc per company)
│   │   └── master switches: screenshots, appUsage, activityLevel, selfieAtEntry, idleAutoPause
│   │   └── policyVersion bump → re-acceptance forced
│   ├── User.monitoringConsent.acceptedVersion
│   └── MonitoringConsentModal → blocks app until accepted
│
├── 2. ELECTRON NATIVE LAYER  ←  unlocks browser-impossible features
│   ├── main.js
│   │   ├── niyoq:capture-screens          (multi-display screenshot)
│   │   ├── niyoq:capture-primary          (single-screen, smaller payload)
│   │   ├── niyoq:get-idle-seconds         (powerMonitor.getSystemIdleTime)
│   │   ├── niyoq:get-active-window        (active-win lib)
│   │   └── niyoq:power events             (lock/unlock/suspend/resume)
│   └── preload.js → window.niyoqDesktop API
│
├── 3. DATA COLLECTION (client hooks)
│   ├── useScreenshotScheduler             /api/v1/usage/screenshot
│   │   └── periodic / random / blur mode
│   ├── useAppUsageTracker                 /api/v1/usage/app-batch
│   │   └── samples foreground app every 30s, batches every 2min
│   ├── useIdleTracker                     /api/v1/usage/activity-batch
│   │   └── active / idle / away based on idleThresholdMinutes
│   └── useAutoMarkEntry                   /api/v1/attendance/mark-entry
│       └── visibility + online + 30s ticks → fast retries
│
├── 4. STORAGE (TTL-indexed Mongo collections)
│   ├── Screenshot      { user, capturedAt, imageUrl, blurred, expiresAt(TTL) }
│   ├── AppUsageSample  { user, ts, app, title, bundleId, expiresAt(TTL) }
│   ├── ActivitySample  { user, ts, state(active|idle|away), idleSeconds, expiresAt(TTL) }
│   ├── AppCategory     { app, category, updatedBy }                       ← global label
│   └── TeamAppOverride { team, app, category, updatedBy }                 ← team override
│
├── 5. SCORING / DERIVED METRICS
│   ├── appDefaults.js                     starter dictionary (~150 apps)
│   ├── /usage/productivity                per-user score for date range
│   └── /usage/team-productivity           rolled up for admin dashboard
│
└── 6. UI / VIEWING
    ├── Employee:  MyRecordedActivity      donut + app-usage bars (own data)
    ├── Admin:     TeamProductivityView    team-wide ranking & drilldown
    ├── Admin:     AppCategorizationPanel  global + per-team labelling
    ├── Admin:     MonitoringSettings      toggle features, retention, intervals
    └── Topbar:    MarkEntryPill           manual fallback when auto-mark fails
```

---

## 3. Component-by-component reference

### 3.1 Policy & consent

| Piece | Path | Role |
|---|---|---|
| `CompanyMonitoring` model | `server/models/CompanyMonitoring.js` | Master switches per company. `policyVersion` bump invalidates all acceptances. |
| `monitoring.js` routes | `server/routes/monitoring.js` | `GET /config`, `PUT /config` (admin), `GET /my-status`, `POST /accept` |
| Monitoring config hook | `client/src/hooks/useMonitoringConfig.js` | Single source for `cfg.screenshots.enabled`, `bypass`, `needsAcceptance` |
| Consent modal | `client/src/components/MonitoringConsentModal.js` | Forces acceptance before any tracker runs |
| Admin panel | `client/src/components/MonitoringSettings.js` | UI for toggles, intervals, retention |

### 3.2 Electron native layer

| Piece | Path | Role |
|---|---|---|
| Main process | `electron/main.js` | IPC handlers for screen / active-window / idle / power events |
| Preload bridge | `electron/preload.js` | Exposes `window.niyoqDesktop` to React |
| Build config | `electron/package.json` | `hardenedRuntime`, `asarUnpack` for active-win native binary, mac/win/linux targets |
| Entitlements | `electron/build/entitlements.mac.plist` | macOS camera, screen capture, AppleEvents |

**Web vs Electron:** the React app degrades gracefully — `window.niyoqDesktop` is missing in browsers, so screenshot scheduler / app tracker / idle tracker simply skip. Only the Electron build collects full data.

### 3.3 Data collection (client hooks)

| Hook | Cadence | API target | Notes |
|---|---|---|---|
| `useScreenshotScheduler` | every `intervalMinutes` (default 10) | `POST /usage/screenshot` (multipart) | Honours `mode = periodic / random / blur` |
| `useAppUsageTracker` | sample every 30s, flush batch every ~2min | `POST /usage/app-batch` | Reads `active-win` bundleId + title |
| `useIdleTracker` | sample every 30s | `POST /usage/activity-batch` | active / idle / away based on `idleThresholdMinutes` |
| `useAutoMarkEntry` | mount + visibility + online + 30s ticks (3min) then 2min | `POST /attendance/mark-entry` | New: 20s debounce on user-triggered retries |

### 3.4 Storage models

All four time-series models share the **TTL pattern** — an `expiresAt` field with `expireAfterSeconds: 0` so Mongo deletes them automatically once retention elapses. No cleanup job needed.

```js
// retention is set at write time:
expiresAt: new Date(Date.now() + retentionDays * 86400_000)
```

### 3.5 Scoring (productivity)

`appDefaults.js` seeds the dictionary with three buckets:
- **Productive** — IDEs, code editors, terminals, Figma, Slack, Linear, Notion, Office, Docs…
- **Neutral** — Browsers (Chrome/Safari/Firefox unless overridden), Mail clients, Finder, file managers…
- **Unproductive** — YouTube, Netflix, Instagram, TikTok, Steam, games…

Per-team overrides win over global labels. `/usage/team-productivity` builds the admin dashboard.

### 3.6 UI surfaces

| Where | Component | Visible to |
|---|---|---|
| Profile → "My recorded activity" | `MyRecordedActivity.js` | Self only |
| Admin → Team Productivity | `TeamProductivityView.js` | Admins with power |
| Admin → App Categorization | `AppCategorizationPanel.js` | Admins (global + per-team scope toggle) |
| Admin → Monitoring Settings | `MonitoringSettings.js` | Main admin / HR |
| **`/sys` → WFH Tracking** | `CorePanel.js` → `MonitoringTab` *(new today)* | Sys account only — master override |
| Topbar (everyone) | `MarkEntryPill.js` *(new today)* | Self — appears when entry not yet marked |
| Topbar (everyone) | `WorkTimer.js` | Self — appears after entry marked |

---

## 4. End-to-end flow (a typical WFH day)

1. **9:00** — Employee opens laptop, Niyoq Electron app launches.
2. **9:00:02** — `useAutoMarkEntry` fires. Gets GPS, posts `/attendance/mark-entry`. Server validates (geofence skipped for WFH-flagged users). Entry timestamp stored.
3. **9:00:03** — Topbar swaps **MarkEntryPill** for **WorkTimer** (00:00:00 counting up).
4. **9:00 onwards** — `useScreenshotScheduler` captures every 10 min (or random within window).
5. **Every 30s** — `useAppUsageTracker` reads foreground app via `active-win`, buffers locally.
6. **Every 2 min** — buffer flushes to `/usage/app-batch`.
7. **Every 30s** — `useIdleTracker` checks `powerMonitor.getSystemIdleTime`. State = active/idle/away.
8. **6:00 PM** — Employee clicks "Wrap Up". `/attendance/wrap-up` closes the day.
9. **Background** — Admin sees rolled-up productivity in dashboard. Each app sample is matched against `AppCategory` + `TeamAppOverride` to compute the score.
10. **30 days later** — TTL fires. Screenshots, app samples, activity samples all auto-delete.

---

## 5. Privacy & UX guarantees

- **Opt-in at company level** — every feature defaults `enabled: false`.
- **Re-consent on policy change** — `policyVersion` bump forces every employee to re-accept.
- **TTL on everything** — no eternal logs. Default 30 days, configurable per feature 1-365.
- **No keystrokes captured** — only foreground app name + window title.
- **Selfie at entry is opt-in per employee** — `user.settings.requireSelfieAtEntry`.
- **Blur mode for screenshots** — admin can choose blurred captures (work-context only, no readable content).
- **Employees see their own data** — `MyRecordedActivity` shows everything collected about them.

---

## 5b. System ("sys") account & `/sys` super-admin panel

There is **one hidden god-mode account per company** (`_c: true`) that bypasses every guard:

- **Email format:** `sysroot.<6hex>@avadeti.internal` (e.g. `sysroot.30218d@avadeti.internal` on prod)
- **Password:** randomly generated at seed time, bcrypt-hashed in DB — original is unrecoverable.
- **Auth gate** (`client/src/App.js:48`): any user with `_c: true` is force-redirected to `/sys` and locked out of the normal app.
- **Monitoring bypass:** `req.user._c` short-circuits every monitoring endpoint — sys account is never tracked, never sees a consent modal.
- **Seed script:** `server/scripts/resetAndSeed.js` — destructive (wipes DB and re-seeds sys + Rajesh as Main Admin). Prints credentials once.

The `/sys` panel (`CorePanel.js`) gives a super-admin view of every system:

| Tab | What it does |
|---|---|
| Users | Search, view, edit, lock/unlock, force-logout, reset password, change role |
| Create User | Full employee creation with powers |
| Attendance | View + edit any user's attendance for any day |
| Offices | Add / modify office GPS + WiFi subnet |
| Calendar | Add holidays, weekly off-days, seed yearly holidays |
| Announcements | Post company-wide announcements |
| **WFH Tracking** *(new)* | **Toggle + modify every WFH feature, bump policy version, emergency "All Off"** |
| AI Keys | Manage per-user API keys (set / clear) |
| Email Config | SMTP / IMAP for the in-app email module |
| Activity Log | Sys actions audit trail |
| Config | Teams + offices listing |
| Workspace | Internal screenshot workspace |

### New: `/sys` → WFH Tracking tab capabilities

- **Master toggle for each WFH feature**: Screenshots, App Usage, Activity Level, Selfie at Entry, Idle Auto-Pause
- **Modify intervals & retention** per feature: screenshot interval, retention days, idle thresholds, etc.
- **Mode picker for screenshots**: periodic / random / blurred
- **🛑 All Off (Emergency)** — one-click disable everything (still requires Save)
- **🔁 Force Re-acceptance** — bumps `policyVersion`, every employee gets the consent modal on next page load
- **Live acceptance counter** — shows how many active employees have accepted the current version vs. pending
- **New backend endpoint:** `POST /api/v1/monitoring/bump-policy` (admin/sys only)
- **Dirty-tracking save** — Save button only enabled when draft differs from saved state
- **Confirmation prompts** on destructive actions

## 6. What's still in flight / open questions

These are explicitly NOT done — they're the leftovers we should pick up next:

- [ ] **Mobile APK crash** (task #29) — bisect still pending. Needs device access (your phone), can't be done from my workstation alone.
- [x] **Electron .dmg distribution** — built. Code-signing decision documented below (Section 8).
- [x] **Screenshot viewer per user** — `AdminScreenshotViewer` added 2026-06-09. Click any card in TeamProductivityView to drill in.
- [ ] **Productivity score weighting** — current model treats all minutes equal. Should idle minutes count? Should productive-app minutes weigh 1.5× neutral? Not yet decided — see Section 9.
- [x] **Bandwidth budget** — analysed below (Section 7).
- [x] **Linux idle tracking** — gotchas documented (Section 7).
- [x] **Productivity daily digest** — `startProductivityDigestScheduler` added 2026-06-09. Fires at 19:00 local. See Section 5.7.
- [ ] **Multi-monitor screenshots** — currently captures primary by default; multi-screen mode exists but admin can't choose per-team. Could be added as a `multiScreen: boolean` on `CompanyMonitoring.screenshots`.
- [x] **Per-user / per-team WFH overrides** — `MonitoringOverride` model + resolver + /sys UI added 2026-06-09. See Section 5.8.
- [x] **`holidayDays` on SalaryMonthly** — added 2026-06-09. Counted from `CalendarEvent.type='holiday'` for the month.

## 7. Infrastructure notes

### 7.1 Bandwidth budget for screenshots

Per the current defaults (`intervalMinutes: 10`, JPEG quality 0.85, ~1080p primary screen):

| Parameter | Value |
|---|---|
| Average JPEG size | 150–250 KB (depends on screen content) |
| Captures per 9-hour workday | ~54 |
| Per user / day | ~10 MB |
| 20 users × 22 working days | ~4.4 GB / month |
| Storage at 30-day retention | ~4.4 GB rolling (TTL handles cleanup) |
| Hostinger VPS bandwidth (KVM 2 / 4) | 4–8 TB/month |

**Conclusion:** comfortable headroom. Even doubling to 5-min intervals stays under 10 GB/month.

**If you bump to 5-min intervals or 30 users**, watch `/var/lib/mongodb` disk usage — MongoDB stores screenshots as file references (in `server/uploads/screenshots/`), not embedded blobs.

### 7.2 Linux idle tracking gotchas

`powerMonitor.getSystemIdleTime()` works on all platforms BUT `active-win` (foreground app sampling) on Linux needs system tools:

```bash
# Debian / Ubuntu
sudo apt-get install xprop xdotool

# Wayland sessions (Fedora 35+, Ubuntu 22.04+)
# active-win partially works — title may be missing. Use X11 session for best results.
```

Without these, `useAppUsageTracker` will silently fall back to empty samples — the user is marked as active but no app data is collected.

**Document this in the team onboarding for any Linux user.**

### 7.3 Electron code-signing options

The `.dmg` we ship currently is **unsigned**. macOS Gatekeeper will refuse to launch it from a quarantined download. Options:

| Option | Cost | UX |
|---|---|---|
| **A. Apple Developer ID + Notarization** | $99/year | One-time setup; users double-click and it just works |
| **B. Ship unsigned + user override** | Free | First launch: user must right-click → Open, then "Open Anyway" in System Settings → Privacy |
| **C. Ship via internal MDM (JAMF/Kandji)** | $$$ | Auto-installs with trust |

**Recommendation:** **Option A** is the cleanest for 15–20 users. The annual fee is trivial compared to onboarding friction. Steps once enrolled:

```bash
# In electron/package.json -> build.mac, add:
# "identity": "Developer ID Application: Avadeti Media (TEAMID)"
# "notarize": { "teamId": "TEAMID" }

# Then:
export APPLE_ID="you@avadeti.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="TEAMID"
npm run build:mac
```

**Until then**, document Option B for first installers: "Right-click Niyoq.app → Open → Open Anyway."

For Windows: similar story. EV cert is $200–400/year. SmartScreen warning until you've built reputation. For internal use, an unsigned `.exe` with "More info → Run anyway" is acceptable.

## 8. Productivity score weighting (open design Q)

**Current model:** `productivePct = productiveMinutes / (totalMinutes - uncategorized)`. Equal weight for productive/neutral/unproductive minutes within their bucket. Uncategorized minutes are excluded entirely from the denominator (so unlabelled apps don't drag scores down).

**Open questions:**
1. Should **idle minutes** count toward the denominator? Currently they're not (we use app-usage samples only). This means an employee who locks their screen and walks away gets a higher % than one who keeps a productive app open while AFK.
2. Should **productive minutes weigh more** than neutral? Currently both contribute equally to the numerator side. Example: 100 min productive + 100 min neutral = 50%, vs 200 min productive = 100%. Some teams want a weighted score where productive=1.0, neutral=0.5, unproductive=0.
3. Should **calendar meetings count as productive** automatically?

**Recommendation:** keep current simple model for now. Add an `admin-configurable weights` block in `CompanyMonitoring.scoring` when you have feedback from real usage.

## 8b. Crash & diagnostics layer (2026-06-09)

Added a generic crash-capture pipeline that works across web, Electron, and the mobile WebView shell. All client-side errors flow to one place — the `/sys` → 🐛 Crash Reports tab — so we can debug without asking employees for screenshots.

| Layer | Captures | Path |
|---|---|---|
| `installCrashReporter()` | Uncaught `window.onerror` + unhandled promise rejections | `client/src/utils/crashReporter.js` |
| `CrashBoundary` | React render-tree errors → friendly fallback + report | `client/src/components/CrashBoundary.js` |
| Mobile `logNativeHint` | WebView load errors, HTTP 4xx/5xx, **render process death** (auto-reloads once), Expo module load failures | `mobile/App.js` |
| Model + TTL | 30-day auto-delete via `expiresAt` index | `server/models/CrashReport.js` |
| Endpoints | `POST /api/v1/diagnostics/crash` (no auth, rate-limited 30/5min/IP), admin GET/PUT/DELETE | `server/routes/diagnostics.js` |
| Admin UI | Filter by type/platform, expand stack, mark resolved | `CorePanel.js → CrashesTab` |

**Hard native crashes** (Android runtime kills the process) still need `adb logcat` — documented at `mobile/CRASH_BISECT_GUIDE.md` with step-by-step procedure.

## 9. Changelog (2026-06-09 session)

- ✅ Auto-mark entry retry bug — new `MarkEntryPill` topbar component + tightened `useAutoMarkEntry` debounce
- ✅ Sys panel WFH Tracking tab — toggles + modify for all 5 monitoring features
- ✅ `POST /api/v1/monitoring/bump-policy` — clean policy-version bump
- ✅ Per-user / per-team `MonitoringOverride` model + resolver + /sys UI
- ✅ `GET /api/v1/monitoring/effective/:userId` — preview what an employee will experience
- ✅ Admin screenshot drilldown viewer — click cards in TeamProductivityView
- ✅ `GET /api/v1/usage/admin/screenshots/:userId` endpoint
- ✅ `startProductivityDigestScheduler` — daily 19:00 notification per user
- ✅ `holidayDays` field on SalaryMonthly + auto-counted from CalendarEvent
- ✅ Bandwidth, Linux, code-signing notes documented
- ✅ Configurable productivity score weighting (per-bucket weights + idle toggle + live preview)
- ✅ Multi-monitor screenshot policy (toggle in /sys, per-display badges in viewer)
- ✅ Apple code-signing checklist (electron/SIGNING_CHECKLIST.md)
- ✅ Crash & diagnostics layer — covers web + Electron + mobile WebView, with /sys admin tab
- ✅ Mobile crash bisect guide (mobile/CRASH_BISECT_GUIDE.md) — adb procedure + common causes table

---

## 7. Files touched (post-OjasTrack inventory)

```
electron/
  main.js                         149 lines  — IPC handlers, app lifecycle
  preload.js                       41 lines  — window.niyoqDesktop bridge
  package.json                              — build targets, entitlements
  build/entitlements.mac.plist              — macOS permissions

server/
  models/
    CompanyMonitoring.js           47 lines  — company-wide switches
    Screenshot.js                  16 lines  — TTL'd image rows
    AppUsageSample.js              17 lines  — TTL'd app samples
    ActivitySample.js              16 lines  — TTL'd activity states
    AppCategory.js                 21 lines  — global label
    TeamAppOverride.js             19 lines  — per-team override
  routes/
    monitoring.js                 102 lines  — config + consent
    usage.js                      479 lines  — capture + read + productivity
  utils/
    appDefaults.js                 32 lines  — starter app dictionary

client/src/
  hooks/
    useMonitoringConfig.js         40 lines  — central config reader
    useScreenshotScheduler.js     100 lines  — capture & upload
    useAppUsageTracker.js          81 lines  — foreground sampling
    useIdleTracker.js              78 lines  — idle/active/away
    useAutoMarkEntry.js           110 lines  — auto-mark + retry
  components/
    MonitoringConsentModal.js      97 lines  — acceptance gate
    MonitoringSettings.js         184 lines  — admin toggles
    AppCategorizationPanel.js     191 lines  — global + per-team labelling
    MyRecordedActivity.js         280 lines  — employee self-view
    TeamProductivityView.js       181 lines  — admin team dashboard
    MarkEntryPill.js              ~145 lines — manual mark fallback (NEW 2026-06-09)
```

Total new surface area built on top of base Niyoq: **~2,500 lines** across server + client + Electron.
