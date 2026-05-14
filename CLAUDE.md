# Niyoq — Company Management App

## What This Is
A comprehensive company management platform (Slack + Google Calendar + Notion) built as an Electron desktop app with web and mobile browser support. Designed for hybrid, remote, and in-office teams of 15-20 employees.

## Tech Stack
- **Frontend**: React (CRA) — `client/`
- **Backend**: Node.js + Express — `server/`
- **Database**: MongoDB (local) — `mongodb://127.0.0.1:27017/niyoq`
- **Real-time**: Socket.io (single server, sufficient for current scale)
- **Document Editor**: TipTap (Notion-style blocks)
- **Future**: Electron wrapper, Google Calendar API, SMTP/IMAP email

## Setup on a New Machine (Claude Code Instructions)

When continuing this project on a different laptop/folder, follow these steps **in order**:

### Prerequisites
- **Node.js** (v18+ recommended)
- **MongoDB** running locally on default port 27017
- **npm** (comes with Node.js)

### Step 1 — Install Dependencies
```bash
cd server && npm install
cd ../client && npm install
```

### Step 2 — Start MongoDB
Make sure MongoDB is running locally. Check with:
```bash
mongosh --eval "db.runCommand({ ping: 1 })"
```
If not running, start it (macOS: `brew services start mongodb-community`, Linux: `sudo systemctl start mongod`).

### Step 3 — Seed the Database (First Time Only)
Run all seed scripts from the `server/` directory:
```bash
cd server
node seed.js          # Creates admin + sample users + office + teams
node seedChannels.js  # Creates channels, DMs, rooms + sample messages
node seedTasks.js     # Creates tasks, labels, to-dos
node seedWorkspace.js # Creates workspaces, documents, notes, links
node seedEmails.js    # Creates email accounts, messages, drafts, templates
node seedPhase9.js    # Creates sticky notes, activities, feed posts
node seedSalary.js    # Creates salary rules, monthly records, disputes
node seedNotifications.js  # Creates sample notifications for all users
node seedCompany.js        # Creates company info card
```

### Step 4 — Run the App
```bash
# Terminal 1 — Backend (port 3000)
cd server
node index.js

# Terminal 2 — Frontend (port 3001)
cd client
PORT=3001 npm start
```

### Step 5 — Open in Browser
Navigate to `http://localhost:3001`

### If the Database Already Has Data
Skip Step 3. Seeds are destructive (they delete and recreate). Only run them on first setup or to reset data.

### Quick Verify Everything Works
```bash
# Check backend
curl http://localhost:3000/api/v1/health

# Check login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@niyoq.com","password":"Admin@123"}'
```

## How to Continue Building
All 14 phases are complete + gap fixes applied. The app is feature-complete for web/browser deployment.

### Gap Fixes Applied (Post Phase 14):
- Fixed Meetings.js JSX syntax error (missing wrapper for conditional children)
- Fixed MeetingDetail missing props (onStart, onAddAttendee, allUsers)
- Added broadcast messaging route (BCC-style per spec Section 6.1.3)
- Added create-task-from-chat route (per spec Section 6.3)
- Added add-to-calendar-from-chat route
- Added meeting unseen alert scheduler (2 min before start, per spec Section 9.4)
- Added notification retention cleanup (3 months, per spec)
- Added deep search job cleanup (24 hours, per spec)
- Added file compression pipeline (Sharp for images, pdf-lib for PDF, zlib for text/office — per spec Topic 4)
- Added nightly file cleanup job at 2 AM (per spec Topic 3.4)
- Confirmed email "Replied by [Name]" indicator already working
- Confirmed 10-second meeting undo window already implemented

### Remaining Infrastructure (Not App Features):
- Electron packaging for desktop app
- VPS deployment (Hostinger) with Nginx
- Google Calendar API service account setup
- Real SMTP/IMAP via Postfix/Dovecot
- [PRIVATE] module (separate implementation with generic filenames, encrypted logs)

## How to Run (Quick Reference)

```bash
# Backend
cd server && npm install && node index.js

# Frontend
cd client && npm install && PORT=3001 npm start
```

## Test Credentials
| User | Email | Password | Role |
|------|-------|----------|------|
| Admin | admin@niyoq.com | Admin@123 | Main Admin |
| Priya | priya@niyoq.com | TempPass!1 | Team Lead (first login → set password) |
| Ravi | ravi@niyoq.com | TempPass!2 | Employee (first login) |
| Meera | meera@niyoq.com | TempPass!3 | Employee (first login) |

## Project Structure

```
management_app/
├── CLAUDE.md                    ← You are here
├── Niyoq_Team_Product_Spec.docx    ← Full product spec (source of truth)
├── Niyoq_Team_Developer_Log.docx   ← Technical architecture decisions
├── Niyoq_Team_Features_Simple.docx ← Non-technical feature overview
├── niyoq_navigator.html       ← Interactive HTML screen navigator (48 screens)
│
├── server/                      ← Node.js + Express backend
│   ├── index.js                 ← Entry point — Express + Socket.io setup
│   ├── .env                     ← Environment vars (MongoDB URI, JWT secrets)
│   ├── config/
│   │   └── db.js                ← MongoDB connection
│   ├── middleware/
│   │   └── auth.js              ← JWT protect, requireRole, requirePower
│   ├── models/
│   │   ├── User.js              ← User with role hierarchy + granular powers
│   │   ├── Team.js              ← Team model
│   │   ├── Office.js            ← Office with GPS coords + WiFi subnet
│   │   ├── Attendance.js        ← Daily attendance records
│   │   ├── Leave.js             ← Leave/half-day requests
│   │   ├── CalendarEvent.js     ← Calendar events (tasks, meetings, holidays, etc.)
│   │   ├── Channel.js           ← Channels, DMs, groups, rooms
│   │   ├── Message.js           ← Chat messages with reactions, threads
│   │   ├── Task.js              ← Tasks with priority, status, subtasks, dependencies
│   │   ├── Todo.js              ← Personal to-do items
│   │   ├── Label.js             ← Company/team/personal labels
│   │   ├── Meeting.js           ← Meetings + MoM (Minutes of Meeting)
│   │   ├── Email.js             ← EmailAccount, Email, EmailDraft, EmailTemplate, EmailCategory
│   │   ├── StickyNote.js        ← Sticky notes with colors, attachments, sharing
│   │   ├── Activity.js          ← Daily activities (8 types, RSVP, audience, recurring)
│   │   ├── TeamFeedPost.js      ← Feed posts with comments, reactions, personal pins
│   │   ├── Salary.js            ← SalaryStructure, EmployeeOverride, SalaryMonthly, SalaryDispute
│   │   ├── Notification.js      ← Notifications with types, emergency, TTL auto-cleanup
│   │   ├── DeepSearchJob.js     ← Deep search background jobs with chunks, results, TTL
│   │   ├── ApiConfig.js         ← AI provider config, encrypted API keys per user
│   │   ├── CompanyInfo.js       ← Company info card (name, about, contact, social)
│   │   └── Workspace.js         ← Workspaces, documents, notes, files, links
│   ├── routes/
│   │   ├── auth.js              ← Login, OTP, refresh, set-password, logout
│   │   ├── users.js             ← CRUD employees, power assignment
│   │   ├── security.js          ← Pending OTPs, locked accounts, active sessions
│   │   ├── teams.js             ← Teams + offices listing
│   │   ├── attendance.js        ← Mark entry (geofence), wrap up, leaves, history
│   │   ├── calendar.js          ← Calendar events, seed holidays
│   │   ├── messages.js          ← Channels, messages, reactions, pins
│   │   ├── tasks.js             ← Tasks CRUD, to-dos, labels
│   │   ├── workspace.js         ← Workspaces, documents (TipTap), notes, links
│   │   ├── email.js             ← Email accounts, messages, drafts, templates, categories
│   │   ├── stickyNotes.js       ← Sticky notes CRUD, attach/detach, share/unshare
│   │   ├── activities.js        ← Activities CRUD, RSVP join/skip
│   │   ├── feed.js              ← Feed posts, comments, reactions, personal pins
│   │   ├── salary.js            ← Rules, monthly generation, disputes, employee overrides
│   │   ├── notifications.js     ← List, read, dismiss, acknowledge, send, emergency
│   │   ├── search.js            ← Normal search, deep search queue/cancel/status
│   │   ├── ai.js                ← AI features (summarize, extract tasks, draft, format, summary)
│   │   └── onboarding.js        ← Company info, onboarding state, profile, settings
│   ├── utils/
│   │   ├── tokens.js            ← JWT generate/verify
│   │   ├── otp.js               ← OTP generation, verification, storage
│   │   ├── geofence.js          ← Haversine formula, WiFi subnet check
│   │   ├── deepSearchWorker.js  ← Background worker for chunked deep search
│   │   └── aiAdapters.js        ← AI provider adapters, encryption, fallback manager
│   ├── seed.js                  ← Seed users, teams, offices
│   ├── seedChannels.js          ← Seed channels and messages
│   ├── seedTasks.js             ← Seed tasks, labels, to-dos
│   ├── seedWorkspace.js         ← Seed workspaces, documents, notes, links
│   ├── seedEmails.js            ← Seed email accounts, messages, drafts, templates
│   ├── seedPhase9.js            ← Seed sticky notes, activities, feed posts
│   ├── seedSalary.js            ← Seed salary rules, monthly records, disputes
│   ├── seedNotifications.js     ← Seed sample notifications for all users
│   └── seedCompany.js           ← Seed company info
│
└── client/                      ← React frontend
    └── src/
        ├── App.js               ← Router + ProtectedRoute + all page routes
        ├── App.css              ← Global styles
        ├── context/
        │   ├── AuthContext.js    ← Auth state, login/logout/OTP/setPassword
        │   └── SocketContext.js  ← Socket.io connection, online users, typing
        ├── services/
        │   └── api.js           ← Axios instance with auth interceptor + silent refresh
        ├── components/
        │   └── layout/
        │       └── AppLayout.js ← Main shell — sidebar + topbar + admin toggle + outlet
        ├── pages/
        │   ├── Login.js         ← Login page (gradient + form)
        │   ├── OTPLogin.js      ← OTP request + verify flow
        │   ├── SetPassword.js   ← First-login password change
        │   ├── CalendarHome.js  ← Calendar with weekly/monthly/daily views
        │   ├── Attendance.js    ← Mark entry, wrap up, leave requests, history
        │   ├── Messages.js      ← Real-time chat with conversation sidebar
        │   ├── Tasks.js         ← Task list, detail, create, to-do list
        │   ├── WorkspacePage.js ← Workspace list, TipTap editor, notes, links
        │   ├── EmailPage.js     ← Three-panel email client (sidebar, list, detail + compose)
        │   ├── StickyNotesPage.js ← Sticky notes grid with colors, inline edit, attach, share
        │   ├── ActivityPage.js  ← Daily activities with type filters, RSVP, create modal
        │   ├── TeamFeedPage.js  ← Social feed with posts, comments, reactions, personal pins
        │   ├── SalaryPage.js    ← Monthly salary summary, breakdown, disputes
        │   ├── NotificationsPage.js ← Notification center with type groups, emergency acknowledge
        │   ├── SettingsPage.js  ← Settings with AI configuration (activate, status, features)
        │   ├── OnboardingPage.js ← 6-step onboarding wizard
        │   ├── ProfilePage.js   ← User profile view + edit
        │   ├── Placeholder.js   ← Placeholder for unbuilt modules
        │   └── ...
        ├── components/
        │   ├── layout/
        │   │   └── AppLayout.js ← Main shell — sidebar + topbar + admin toggle + outlet
        │   └── SearchPanel.js   ← Reusable search component with normal + deep search
        │   └── admin/
        │       ├── UserList.js  ← Employee table with search
        │       └── CreateUser.js← Full employee creation form with powers
        └── styles/
            ├── auth.css         ← Auth pages (gradient, form, buttons)
            ├── layout.css       ← App shell, sidebar, topbar, cards, forms, badges
            ├── calendar.css     ← Calendar views (weekly grid, monthly grid, daily timeline)
            ├── attendance.css   ← Attendance (clock, mark button, history)
            ├── messaging.css    ← Chat (conversation sidebar, bubbles, reactions, input)
            ├── tasks.css        ← Tasks (cards, detail, priority sections, to-do)
            ├── workspace.css    ← Workspace (grid, TipTap editor, notes, links)
            ├── email.css        ← Email (three-panel layout, compose modal, templates)
            ├── stickynotes.css  ← Sticky notes (grid cards, color picker, shared badges)
            ├── activity.css     ← Activity (cards, type icons, RSVP, create modal)
            ├── teamfeed.css     ← Team feed (post cards, comments, reactions, pins)
            ├── salary.css       ← Salary (month cards, breakdown table, disputes)
            ├── notifications.css ← Notifications (center, toast stack, emergency)
            ├── search.css       ← Search (bar, results, deep progress, history)
            ├── ai.css           ← AI (settings, feature buttons, result panels, task suggestions)
            └── onboarding.css   ← Onboarding (wizard steps, toggles, checklist) + Profile page
```

## Architecture Decisions (from Developer Log)

- **Socket.io rooms** map to Channels/DMs/Rooms — single server handles all real-time
- **Separate MongoDB collections** per message type for targeted search indexes
- **JWT**: Access token 15 min + Refresh token 30 days, silent refresh in axios interceptor
- **OTP**: Goes to admin chain (manager, HR, Main Admin) — NEVER to user. Only visible in Security → Pending OTPs
- **Geofence**: WiFi subnet check (Layer 1) → GPS 100m Haversine (Layer 2). Distance stored but never shown to employee
- **TipTap**: JSON stored in MongoDB, plain text auto-extracted for search
- **File compression**: Per-type lossless (Sharp for images, pdf-lib for PDF, zlib for text/office docs)
- **Calendar hierarchy**: Personal > Location+Team > Team > Location > Default Company (replaces, not layers)

## Role Hierarchy

1. **Main Admin** — company owner, nearly all powers, created during setup
2. **Regular Admin** — created by Main Admin, powers defined by title template or manual ticking
3. **Employee** — base access, additional powers tickable by admin

Admin titles with power templates: HR, Team Lead, Manager, Department Head (or custom).

## API Routes (all prefixed /api/v1/)

| Route | Purpose |
|-------|---------|
| `/auth/*` | Login, OTP, refresh, set-password, logout, me |
| `/users/*` | CRUD employees, power assignment |
| `/security/*` | Pending OTPs, locked accounts, sessions, force logout |
| `/teams/*` | Teams + offices listing |
| `/attendance/*` | Mark entry, wrap up, leaves, history, team view, stats |
| `/calendar/*` | Events CRUD, seed holidays |
| `/messages/*` | Channels, messages, reactions, pins, DM creation |
| `/tasks/*` | Tasks CRUD, to-dos, labels, convert to-do → task |
| `/workspace/*` | Workspaces, documents (TipTap), notes, links |
| `/meetings/*` | Meetings CRUD, responses, MoM, mark present, end meeting |
| `/email/*` | Accounts, messages, send, drafts, templates, categories, bulk actions |
| `/sticky-notes/*` | CRUD, attach/detach to entities, share/unshare |
| `/activities/*` | CRUD, RSVP (join/skip), filter by type/audience/date |
| `/feed/*` | Posts CRUD, comments, reactions, personal pin/unpin |
| `/salary/*` | Rules, monthly generation, view, finalize, disputes CRUD |
| `/notifications/*` | List, unread counts, mark read, dismiss, acknowledge, send, emergency |
| `/search/*` | Normal metadata search, deep search queue/cancel/status, per-scope |
| `/ai/*` | Config status, activate (code/direct), summarize, extract-tasks, draft-email, format-mom, meeting-summary |
| `/onboarding/*` | Company info CRUD, onboarding status/complete, settings update, profile CRUD |

## Socket.io Events

| Event | Direction | Purpose |
|-------|-----------|---------|
| `user:online` / `user:offline` | Both | Online presence |
| `channel:join` / `channel:leave` | Client→Server | Join/leave chat rooms |
| `message:received` | Server→Client | New message in channel |
| `message:reaction` | Server→Client | Reaction update |
| `user:typing` / `user:stop-typing` | Both | Typing indicators |
| `notification:new` | Server→Client | Push notification |
| `task:updated` | Server→Client | Task status/progress change |
| `attendance:marked` | Server→Client | Entry marked notification |
| `otp:pending` | Server→Client | OTP sent to admin |
| `auth:force-logout` | Server→Client | Admin force-logged user out |

## Build Progress

### Completed Phases
- **Phase 1**: Project setup, MongoDB, auth (login, JWT, OTP, temp password, account locking)
- **Phase 2**: App layout with sidebar, admin mode toggle, user management, employee creation with powers
- **Phase 3**: Calendar (weekly/monthly/daily views), attendance (geofence check-in, wrap up, leave requests)
- **Phase 4**: Real-time messaging (channels, DMs, groups, rooms, reactions, typing indicators)
- **Phase 5**: Tasks (priority groups, detail view, progress, status, subtasks, labels, to-do list)
- **Phase 6**: Workspace (TipTap document editor, notes, links, workspace management)
- **Phase 7**: Meetings (creation, Google Meet link, invite responses, MoM with TipTap, scratchpad, publish flow, attendee management, end meeting)
- **Phase 8**: Email (accounts, compose, reply/reply-all/forward, drafts, templates, categories, shared inboxes with "Replied by", starred, trash, three-panel UI)
- **Phase 9**: Sticky Notes (grid, colors, inline edit, attach to entities, share), Daily Activity (8 types, RSVP, filters, create modal), Team Feed (posts, comments, reactions, personal pins, audience filter)
- **Phase 10**: Salary & Payroll (company deduction rules, per-employee overrides, monthly generation from attendance, breakdown table, disputes with resolve/reject, admin salary management)
- **Phase 11**: Notifications (notification center with type groups, mark read/clear, emergency alerts with acknowledge, send/broadcast, socket real-time, TTL auto-cleanup)
- **Phase 12**: Search (normal instant metadata search per scope, deep search background worker with chunked processing, progressive WebSocket delivery, max 4 results, cancel, search history, reusable SearchPanel component)
- **Phase 13**: AI layer (generic adapter for Gemini/OpenAI/Claude, 5 features: summarize, extract tasks, draft email, format MoM, meeting summary, activation code system, fallback manager, encrypted key storage, Settings page)
- **Phase 14**: Onboarding (6-step wizard: app intro, company card, welcome, settings, profile setup, checklist), Profile page, Company Info management

### All Phases Complete
The core application is feature-complete. Future work: Electron desktop packaging, VPS deployment with Nginx, Google Calendar API integration with service account, real SMTP/IMAP connection.

## Design System (Stitch)
- **Stitch Project ID**: `4985826695348725443`
- **Design System Asset**: `3397041213866975853`
- 12 screens generated (7 desktop, 5 mobile) — login, calendar, chat, tasks, attendance
- Theme: Light mode, joyful colorful, Indigo primary (#6366F1), Inter + Plus Jakarta Sans fonts

## Important Rules

- **[PRIVATE] module exists** — files named generically (e.g., `core.js`). AI should skip any file/function marked `[PRIVATE]`. No comments, no documentation, no logging in standard logs. Separate encrypted log only.
- All endpoints use `/api/v1/` prefix
- Build only what is specified in the spec — do not add unrequested features
- Calendar is the home screen
- Admin always decides — no automated penalties
- Privacy by default — content is private unless explicitly made public
- No dark theme — joyful light colorful UI
