# Avadeti Team — Company Management App

## What This Is
A comprehensive company management platform (Slack + Google Calendar + Notion) built as an Electron desktop app with web and mobile browser support. Designed for hybrid, remote, and in-office teams of 15-20 employees.

## Tech Stack
- **Frontend**: React (CRA) — `client/`
- **Backend**: Node.js + Express — `server/`
- **Database**: MongoDB (local) — `mongodb://127.0.0.1:27017/avadeti_team`
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
  -d '{"email":"admin@avadeti.com","password":"Admin@123"}'
```

## How to Continue Building
When the user says "next" or "continue", pick up from Phase 7 (Meetings). See **Build Progress** section below for what's done and what's remaining. Read the three .docx spec files (use `textutil -convert txt -stdout <file>` on macOS) for full feature details.

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
| Admin | admin@avadeti.com | Admin@123 | Main Admin |
| Priya | priya@avadeti.com | TempPass!1 | Team Lead (first login → set password) |
| Ravi | ravi@avadeti.com | TempPass!2 | Employee (first login) |
| Meera | meera@avadeti.com | TempPass!3 | Employee (first login) |

## Project Structure

```
management_app/
├── CLAUDE.md                    ← You are here
├── Avadeti_Team_Product_Spec.docx    ← Full product spec (source of truth)
├── Avadeti_Team_Developer_Log.docx   ← Technical architecture decisions
├── Avadeti_Team_Features_Simple.docx ← Non-technical feature overview
├── avadeti_team_navigator.html       ← Interactive HTML screen navigator (48 screens)
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
│   │   └── workspace.js         ← Workspaces, documents (TipTap), notes, links
│   ├── utils/
│   │   ├── tokens.js            ← JWT generate/verify
│   │   ├── otp.js               ← OTP generation, verification, storage
│   │   └── geofence.js          ← Haversine formula, WiFi subnet check
│   ├── seed.js                  ← Seed users, teams, offices
│   ├── seedChannels.js          ← Seed channels and messages
│   ├── seedTasks.js             ← Seed tasks, labels, to-dos
│   └── seedWorkspace.js         ← Seed workspaces, documents, notes, links
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
        │   ├── Placeholder.js   ← Placeholder for unbuilt modules
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
            └── workspace.css    ← Workspace (grid, TipTap editor, notes, links)
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

### Remaining Phases
- **Phase 8**: Email (SMTP/IMAP integration via Postfix/Dovecot)
- **Phase 9**: Sticky Notes, Daily Activity, Team Feed
- **Phase 10**: Salary & Payroll calculation
- **Phase 11**: Notifications (Mac-style stack, notification center, DND, emergency alerts)
- **Phase 12**: Search (normal metadata + deep search with chunked background jobs)
- **Phase 13**: AI layer (summarize, draft, extract tasks — generic adapter for Gemini/OpenAI/Claude)
- **Phase 14**: Onboarding flow, polish, Electron packaging

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
