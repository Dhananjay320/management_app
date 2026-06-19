# Niyoq — Company Management Platform

> One platform for chat, calendar, tasks, attendance, salary, monitoring, and more.
> Built for hybrid, remote, and in-office teams of 15–20 employees.

**Stack:** React (CRA) · Node.js + Express · MongoDB · Socket.io · TipTap · Electron · React Native (Expo)

---

## At a glance

![Calendar — desktop](screenshots/02_calendar_1440.png)

---

## Features

### Daily essentials

| | |
|---|---|
| **Calendar** — weekly / monthly / daily views, holidays, events | **Attendance** — geofenced check-in, leave requests, history |
| ![Calendar](screenshots/02b_calendar_1280.png) | ![Attendance](screenshots/03_attendance.png) |
| **Messages** — channels, DMs, threads, read receipts, bulk forward | **Tasks** — priority groups, subtasks, dependencies, kanban |
| ![Messages](screenshots/04_messages.png) | ![Tasks](screenshots/05_tasks.png) |
| **Workspace** — TipTap docs, notes, links, files | **Meetings** — Google Meet, MoM, RSVP |
| ![Workspace](screenshots/06_workspace.png) | ![Meetings](screenshots/07_meetings.png) |
| **Email** — three-panel client with shared inboxes | **Sticky Notes** — global / local / page-scoped, color picker |
| ![Email](screenshots/08_email.png) | ![Sticky Notes](screenshots/09_sticky_notes.png) |
| **Activity** — 8 types, RSVP, audience filter | **Team Feed** — social posts, comments, reactions |
| ![Activity](screenshots/10_activity.png) | ![Team Feed](screenshots/11_team_feed.png) |
| **Salary** — monthly breakdown, disputes, slip download | **Notifications** — type groups, emergency acknowledge |
| ![Salary](screenshots/12_salary.png) | ![Notifications](screenshots/13_notifications.png) |
| **Whiteboards** — collaborative canvas | **Reports** — daily summaries, productivity digest |
| ![Whiteboards](screenshots/14_whiteboards.png) | ![Reports](screenshots/15_reports.png) |
| **Settings** — AI config, push, preferences | **Profile** — self profile + change password |
| ![Settings](screenshots/16_settings.png) | ![Profile](screenshots/17_profile.png) |

### Admin

![Admin → Users](screenshots/18_admin_users.png)

### Sys Panel (`_c: true` god-mode account)

| | |
|---|---|
| **Users** — CRUD, force-logout, password reset | **WFH Tracking** — 5 master toggles, multi-monitor, scoring weights |
| ![Sys Users](screenshots/19_sys_users.png) | ![Sys WFH Tracking](screenshots/20_sys_wfh_tracking.png) |
| **Crash Reports** — type filter, stack trace, mark resolved | **Offices** — GPS + multi-subnet WiFi, "Detect my IP" probe |
| ![Sys Crashes](screenshots/21_sys_crashes.png) | ![Sys Offices](screenshots/22_sys_offices.png) |

---

## WFH tracking system

Built on top of the base app — 5 monitored features, 3 resolution layers (user → team → company), configurable scoring weights, and a sys-level emergency bypass:

```
WFH TRACKING SYSTEM
│
├── 1. POLICY & CONSENT (CompanyMonitoring + MonitoringOverride)
├── 2. ELECTRON NATIVE LAYER (desktopCapturer, active-win, powerMonitor)
├── 3. DATA COLLECTION (useScreenshotScheduler, useAppUsageTracker, useIdleTracker)
├── 4. STORAGE (TTL-indexed Mongo: Screenshot, AppUsageSample, ActivitySample, AppCategory)
├── 5. SCORING (configurable weights: productive/neutral/unproductive + idle penalty)
└── 6. UI (MyRecordedActivity, TeamProductivityView, AppCategorizationPanel, MonitoringSettings)
```

Full spec at [`WFH_TRACKING_MINDMAP.md`](WFH_TRACKING_MINDMAP.md).

---

## Responsive across every viewport

Tested at 375 / 1024 / 1280 / 1440 — no content cut-off at any width.

| 1440 (Desktop) | 1280 (Laptop) | 1024 (Tablet) | 375 (Mobile) |
|---|---|---|---|
| ![1440](screenshots/02_calendar_1440.png) | ![1280](screenshots/02b_calendar_1280.png) | ![1024](screenshots/02c_calendar_1024.png) | ![Mobile](screenshots/02d_calendar_mobile.png) |

---

## Quick start (local dev)

```bash
# Prerequisites: Node 18+, MongoDB on default port

# 1. Install
cd server && npm install
cd ../client && npm install

# 2. Start MongoDB (macOS)
brew services start mongodb-community

# 3. Seed dummy data (first time only — DESTRUCTIVE)
cd server
node seed.js                # users + teams + offices
node seedChannels.js        # channels + sample messages
node seedTasks.js && node seedWorkspace.js && node seedEmails.js
node seedPhase9.js && node seedSalary.js && node seedNotifications.js
node seedCompany.js

# 4. Run
cd server && node index.js          # backend  → :3000
cd client && PORT=3001 npm start    # frontend → :3001
```

### Test credentials

| User | Email | Password | Role |
|---|---|---|---|
| Admin | `admin@niyoq.com` | `Admin@123` | Main Admin |
| Priya | `priya@niyoq.com` | `TempPass!1` | Team Lead |
| Ravi | `ravi@niyoq.com` | `TempPass!2` | Employee |

---

## Docs in this repo

- [`CLAUDE.md`](CLAUDE.md) — full architecture + setup
- [`WFH_TRACKING_MINDMAP.md`](WFH_TRACKING_MINDMAP.md) — WFH tracking system reference
- [`electron/SIGNING_CHECKLIST.md`](electron/SIGNING_CHECKLIST.md) — Apple Developer enrollment + iOS deploy
- [`mobile/CRASH_BISECT_GUIDE.md`](mobile/CRASH_BISECT_GUIDE.md) — `adb logcat` procedure
- [`screenshots/index.html`](screenshots/index.html) — interactive demo contact sheet

---

## Tech architecture

- **Real-time:** Socket.io rooms map 1:1 to channels / DMs / rooms — single server scales to current load.
- **Auth:** JWT (15 min access + 30 day refresh) with silent refresh in axios interceptor.
- **OTP:** Routed to admin chain (manager → HR → Main Admin), never to the user themselves.
- **Geofence:** WiFi subnet check (IPv4 + IPv6 prefixes) → GPS 100m Haversine fallback.
- **TipTap:** Block-based document JSON in MongoDB, plain-text auto-extracted for full-text search.
- **File compression:** Per-type lossless — Sharp for images, pdf-lib for PDFs, zlib for text/office docs.
- **TTL on monitoring data:** Mongo's `expireAfterSeconds: 0` index auto-purges old screenshots / app samples after retention window.

---

## Status

All 14 build phases complete. Currently in active use at Avadeti Media. Personal mirror of the company-org repo at [`Avadeti-Media/avadeti-team`](https://github.com/Avadeti-Media/avadeti-team).
