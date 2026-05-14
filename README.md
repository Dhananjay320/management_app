# Niyoq

A self-hosted team-management platform combining the day-to-day tools a small company actually needs: real-time chat, calendar, attendance with geofence, tasks, meetings with minutes, shared inboxes, sticky notes, an activity feed, salary/payroll, and a collaborative whiteboard. Designed for hybrid, remote, and in-office teams of 15–20.

Built as a full-stack monorepo: React + Node.js/Express + MongoDB + Socket.io. Includes desktop (Electron) and mobile (Expo) wrappers.

## Highlights

- **Real-time messaging** — channels, DMs, group chats, private rooms, broadcasts; reactions, typing indicators, read receipts
- **Calendar with hierarchy** — personal events override team/office/company defaults; weekly off-days configurable per scope
- **Attendance** — GPS geofence + WiFi-subnet check, wrap-up reminders, half-day & leave management
- **Tasks** — priority/status/subtasks/dependencies, deadline reminders, overdue alerts, in-app discussion threads per task
- **Meetings** — Google Meet links, attendee responses, MoM editor (TipTap), publish flow, AI-assisted summaries
- **Email** — multi-account, shared inboxes with "Replied by" indicator, drafts, templates
- **Whiteboard** — multi-user collaborative canvas with shapes, freehand, text, sticky notes, eraser, undo/redo
- **Salary & payroll** — monthly generation from attendance, configurable rules, dispute resolution
- **Notifications** — in-app, web push (VAPID), Expo push (mobile), Electron native; off-day & holiday aware
- **AI layer** — pluggable Gemini/OpenAI/Claude adapter with encrypted per-user keys
- **Granular permissions** — every admin action is gated by a specific power; HR/Manager/Team Lead presets included

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React (CRA), TipTap, socket.io-client |
| Backend | Node.js, Express, Mongoose, socket.io |
| Database | MongoDB |
| Real-time | Socket.io (single server) |
| Push | web-push (VAPID) + Expo Push Service |
| Desktop | Electron (Mac/Windows wrapper) |
| Mobile | Expo + React Native WebView |

## Quick start (local development)

### Prerequisites

- Node.js 18+
- MongoDB 6+ running locally on port 27017
- npm

### 1. Install

```bash
cd server && npm install
cd ../client && npm install
```

### 2. Configure environment

```bash
cp server/.env.example server/.env
# Edit server/.env — generate JWT secrets, VAPID keys, etc. Comments in the file explain each value.
```

Generate JWT secrets:
```bash
openssl rand -base64 48
```

Generate a VAPID keypair:
```bash
npx web-push generate-vapid-keys
```

### 3. Seed the database (first time only)

```bash
cd server
node seed.js                # admin + sample employees + office + teams
node seedChannels.js        # demo channels and messages
node seedTasks.js           # demo tasks
node seedWorkspace.js       # demo workspaces and documents
node seedEmails.js          # demo emails
node seedPhase9.js          # sticky notes, activities, feed
node seedSalary.js          # salary structures, monthly records
node seedNotifications.js   # sample notifications
node seedCompany.js         # company info card
```

### 4. Run

```bash
# Terminal 1 — backend
cd server && node index.js

# Terminal 2 — frontend
cd client && PORT=3001 npm start
```

Open `http://localhost:3001`.

### Demo credentials

| Role | Email | Password |
|---|---|---|
| Main Admin | admin@example.com | Admin@123 |
| Team Lead | alice@example.com | TempPass!1 |
| Employee | bob@example.com | TempPass!2 |
| Designer | carol@example.com | TempPass!3 |

The non-admin accounts are flagged "first login" — you'll be asked to change the temporary password on the first sign-in.

## Project layout

```
.
├── client/                    React frontend (CRA)
│   ├── public/
│   ├── src/
│   │   ├── components/        layout, modals, shared widgets
│   │   ├── context/           AuthContext, SocketContext
│   │   ├── hooks/             custom hooks (push, etc.)
│   │   ├── pages/             one file per top-level route
│   │   │   └── admin/         admin-only routes
│   │   ├── services/          axios client + helpers
│   │   └── styles/            CSS for each module
├── server/                    Node.js backend
│   ├── config/                MongoDB connection
│   ├── middleware/            auth (JWT, power checks)
│   ├── models/                Mongoose schemas
│   ├── routes/                REST endpoints under /api/v1/*
│   ├── utils/                 schedulers, push sender, AI adapters
│   ├── scripts/               admin/dev CLI utilities
│   └── seed*.js               demo data generators
├── electron/                  Desktop wrapper
└── mobile/                    Expo mobile wrapper
```

## Key design decisions

- **Single Node/Express server with Socket.io** — sufficient for ~20-user scale. Sharding is unnecessary at this size and adds operational cost.
- **Separate MongoDB collections per message type** (chat / email / activity / feed) — lets each have its own search index profile and simplifies retention rules.
- **JWT 15 min access token + 30 day refresh token** with silent refresh in the axios interceptor.
- **Two-layer geofence**: WiFi subnet check first (cheap, accurate), GPS fallback (Haversine, 100 m default radius).
- **TipTap (ProseMirror)** for documents — JSON in MongoDB, plain text auto-extracted for search.
- **Per-user encrypted AI keys** — provider-agnostic adapter with fallback chain.

## Scripts

```bash
# Reset just the developer/system account (data preserved)
node server/scripts/resetSystem.js

# Wipe the database completely and re-seed (destructive)
node server/scripts/resetAndSeed.js
```

## Building distributables

### Mac DMG (Apple Silicon)
```bash
cd electron && npm run build:mac
# Output: electron/dist/Niyoq-1.0.0-arm64.dmg
```

### Windows .exe (requires Wine on Mac, or build on Windows)
```bash
cd electron && npm run build:win
```

### Android APK
```bash
cd mobile
eas build --platform android --profile preview
```

## License

MIT — see [LICENSE](LICENSE).

## Notes

This is a portfolio project. The seed data uses placeholder names and `example.com` addresses. Configure `.env` carefully before exposing on the public internet — never commit real secrets.
