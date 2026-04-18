# Avadeti Team — Complete App Structure (Mind Map)

## 🏗️ ARCHITECTURE
```
Avadeti Team
├── Platform: React (CRA) + Node.js + MongoDB + Socket.io
├── Primary: Electron Desktop (Windows + Mac)
├── Secondary: Web Browser (same React build via Nginx)
├── Tertiary: Mobile Browser (responsive CSS, no app store)
└── Hosting: VPS (Hostinger) — single server handles all
```

---

## 🔐 AUTH SYSTEM
```
Authentication
├── Login
│   ├── Email + Password (primary)
│   ├── JWT Access Token (15 min) + Refresh Token (30 days)
│   ├── Silent token refresh (axios interceptor)
│   ├── bcrypt password hashing
│   └── Account locking after 5 failed attempts → admin notified
├── OTP Login
│   ├── User requests OTP → backend console + admin chain
│   ├── OTP appears ONLY in Security → Pending OTPs
│   ├── NOT in notifications, NOT as push notification
│   ├── 6 digits, 10 min validity, max 3 attempts
│   └── User message: "OTP sent to your administrator"
├── Forgot Password
│   ├── Same OTP flow → forced password reset after verify
│   └── mustResetPassword flag on user
├── First Login (Temp Password)
│   ├── Admin creates employee → system generates temp password
│   ├── Visible to: creating admin, Main Admin
│   ├── Employee logs in → forced to set new password
│   ├── Min 8 chars, 1 number, 1 special character
│   └── Temp password disappears after password change
├── Logout
│   ├── Invalidates refresh token in MongoDB
│   └── Force logout by admin → auth:force-logout socket event
└── Token Storage
    ├── Electron: safeStorage API (future)
    └── Browser: localStorage (current) / httpOnly cookies (future)
```

---

## 👥 USER & ROLE MANAGEMENT
```
Roles (Hierarchy)
├── [PRIVATE] System (role: 'system', _c: true)
│   ├── Hidden from ALL user queries and UI
│   ├── Access everything — salary, messages, attendance, geofence bypass
│   ├── Cannot be seen/edited/deleted by any other role
│   ├── Separate encrypted log (AES-256-CBC)
│   ├── Generic file names (core.js, coreLog.js)
│   ├── API: /api/v1/sys/* (returns 404 to non-system users)
│   └── Frontend: /sys (hidden URL)
├── Main Admin (role: 'main_admin')
│   ├── Company owner — created during initial setup
│   ├── Nearly all powers (except system-level settings)
│   ├── Can create/manage all other admins
│   ├── Can edit salary, powers, personal data of all employees
│   ├── Can view private messages
│   ├── Can bypass geofence
│   └── Can toggle whether employees edit own name/email
├── Regular Admin (role: 'admin')
│   ├── Created by Main Admin
│   ├── Powers defined by title template OR manual ticking
│   ├── Can only act within assigned power scope
│   ├── Can only grant powers they themselves have
│   ├── Has Admin Mode toggle (switches employee ↔ admin view)
│   └── Has admin title: HR, Team Lead, Manager, Department Head, or custom
└── Employee (role: 'employee')
    ├── Base access: calendar, tasks, messages, meetings, email, workspace
    └── Additional powers tickable by admin

Power System (13 Groups)
├── Users: create, edit, delete, viewPowers, editPowers
├── Attendance: viewTeam, viewIndividual, editRecords, markManually, bypassGeofence, forwardAlerts
├── Tasks: viewMemberTasks, viewTeamTasks, createForOthers, deleteAny
├── Salary: viewEmployee, editStructure, defineBonusRules, viewDisputes, resolveDisputes
├── Meetings: createCompanyWide, viewAll, deleteAny
├── Messaging: createRooms, createPublicChannels, postAnnouncements
├── Announcements: sendCompanyWide
├── Email: accessSharedInboxes, sendExternal
├── Analysis: viewIndividual, viewTeam, viewCompany
├── Emergency: sendAlert
├── Calendar: createCompany, markHolidays, createLocationTeam
├── Workspace: deleteAny, viewPrivate
└── Security: viewOTPs, unlockAccounts, viewSessions, forceLogout

Admin Title Templates (auto-apply powers)
├── HR → attendance(viewTeam,viewIndividual,editRecords,forwardAlerts) + salary(viewEmployee,editStructure,resolveDisputes,viewDisputes) + analysis(viewIndividual)
├── Team Lead → attendance(viewTeam) + tasks(viewMemberTasks,viewTeamTasks,createForOthers) + meetings(createCompanyWide) + analysis(viewIndividual,viewTeam)
├── Manager → attendance(viewTeam,editRecords) + tasks(viewMemberTasks,viewTeamTasks,createForOthers) + salary(viewDisputes,resolveDisputes) + meetings(createCompanyWide) + analysis(viewIndividual,viewTeam)
└── Department Head → (custom powers)

Employee Creation Form
├── Identity: name, email, phone, jobTitle
├── Team & Location: department/team (multiple), office, work type (Full Office/Remote/Hybrid)
├── Hybrid Config: designated office days (Mon-Fri checkboxes)
├── Compensation: base salary, TDS, PF, ESI, fixed bonus, bonus rules
├── Email & Access: SMTP key, IMAP credentials, shared inbox access
├── Powers & Title: title (auto-applies template), manual power adjustments
├── Management: assigned manager
└── Calendar: calendar assignment
```

---

## 📅 CALENDAR (Home Screen)
```
Calendar
├── Views
│   ├── Weekly (DEFAULT) — 7 days side by side, full event list, drag-drop task reorder
│   ├── Monthly — full month grid, ONE event per date (highest priority), "+X more"
│   └── Daily — one day full detail, time blocks, entry/wrap-up times, priority groups
├── Color System
│   ├── Date Events: Red=Leave, Orange=Half Day, Purple=Holiday, Blue=Tasks, Yellow=Activity
│   └── Task Priority: Red=Top, Orange=High, Yellow=Medium, Green=Low
├── Calendar Hierarchy (REPLACES, not layers)
│   ├── Priority 1: Personal (admin assigned specific calendar)
│   ├── Priority 2: Location + Team combined
│   ├── Priority 3: Team only
│   ├── Priority 4: Location only
│   └── Priority 5: Default Company (fallback)
├── Company Calendar
│   ├── Pre-loaded Indian national holidays + all Sundays
│   ├── Admin can add/remove/mark half working days
│   └── Different calendars per location/team/individual
├── What Shows on Calendar
│   ├── Tasks (color-coded by priority)
│   ├── Meetings
│   ├── Approved leaves and half days
│   ├── Company holidays
│   ├── Daily activities (yellow)
│   ├── Entry and wrap-up times
│   └── Announcements (banner at top)
├── Task Ordering
│   ├── Auto-sorted by priority group (Top > High > Medium > Low)
│   ├── Within group: manual drag-drop order (saved persistently)
│   └── New task appears at bottom of group
├── Launch Tooltip (all users)
│   ├── New tasks since last login
│   ├── Today's meetings
│   ├── New announcements
│   ├── Unread important messages
│   └── (Admins only) Pending approvals, unresolved disputes, no-entry employees
└── Admin Widgets
    ├── HR: Attendance overview, pending leave approvals, unresolved disputes
    ├── Task Admin: Task completion overview, overdue tasks
    └── General: Upcoming meetings, recent announcements, storage usage
```

---

## ⏰ ATTENDANCE
```
Attendance
├── Check-in (Mark Entry)
│   ├── Dual Layer Check
│   │   ├── Layer 1 — WiFi: device IP subnet matches office WiFi (first 3 octets)
│   │   │   └── MATCH → allow immediately, NO MATCH → proceed to Layer 2
│   │   └── Layer 2 — GPS: Haversine distance ≤ 100m from office coordinates
│   │       └── ≤100m → allow, >100m → block
│   ├── Blocked Message: "You are not in the office. Please connect to office WiFi..."
│   ├── Distance IS stored in MongoDB for admin — NEVER shown to employee
│   ├── Mobile Browser: GPS only (no WiFi subnet check)
│   └── Remote employees: no check — mark from anywhere
├── Work Types
│   ├── Full Office: dual check every working day
│   ├── Full Remote: no check — mark from anywhere
│   └── Hybrid: dual check on designated office days only, free on others
├── Wrap Up
│   ├── Button disabled before 5:00 PM
│   ├── Every 30 min after 5 PM: push notification reminder
│   ├── 7:30 PM: stronger reminder
│   ├── 8:00 PM: auto wrap-up with cancel option
│   ├── Cancel options: 30 min / 1 hour / manual
│   └── After cancel: 30-min cycle continues
├── Leave & Half Day
│   ├── Employee raises request (date, type, reason)
│   ├── Goes to assigned manager for approval
│   ├── Approved → calendar + salary deduction applied
│   ├── Leave types: casual, sick, personal, half_day
│   └── Half day: morning or afternoon
├── No-Entry Alert (10:30 AM)
│   ├── System notifies HR: "[Name] has not marked entry today"
│   ├── HR Option 1: manually mark entry time
│   ├── HR Option 2: forward alert to employee's manager
│   └── NO automatic absent marking — human always decides
├── Auto Status Updates
│   ├── Office check-in → "In Office"
│   ├── Remote check-in → "Working from Home"
│   └── Leave approved → "On Leave"
├── History
│   ├── Monthly table: date, entry time, wrap-up, hours, status
│   └── Filter by month
└── Office Configuration
    ├── Developer/System pre-defines: name, GPS (lat/lng), WiFi subnet, radius (100m)
    ├── Only developer/system can create/edit office configs
    └── Regular admin just selects office from dropdown
```

---

## 💬 MESSAGING (Spaces)
```
Messaging
├── Space Types
│   ├── Channels
│   │   ├── #general — company-wide, anyone posts
│   │   ├── #announcements — announcement power required to post
│   │   ├── #team-feed — fun posts, anyone
│   │   └── #[team-name] — auto-created when team created, team members only
│   ├── Rooms
│   │   ├── Private invite-only spaces
│   │   ├── Room creation requires messaging.createRooms power
│   │   └── Creator invites → accept/decline
│   ├── Direct Messages
│   │   ├── One-on-one DM (private, 2 people)
│   │   ├── Group Message (3+ people, casual)
│   │   └── Broadcast (one message → separate individual DMs, BCC-style)
│   └── Contextual Threads
│       ├── Task Thread — auto-created when task assigned
│       ├── Meeting Thread — auto-created when meeting created
│       └── MoM Thread — when someone comments on published MoM
├── Features (All Space Types)
│   ├── Emoji Reactions (any emoji on any message)
│   ├── Thread Reply (reply to any message → nested)
│   ├── Pin Messages (visible in right panel)
│   ├── @Mentions (@person @channel @everyone @here)
│   ├── File Sharing (any file, folders auto-zipped, shows compression ratio)
│   ├── Search (screen-wise within that chat)
│   ├── Message Edit/Delete (sender edits own, admins delete any)
│   ├── Read Receipts (who has seen the message)
│   ├── Typing Indicator (who is composing)
│   ├── Sticky Note Attachment (attach note to any message)
│   ├── Task Creation from Chat (+ Task button → structured card drops in)
│   ├── Add to Calendar (any message → task or event on calendar)
│   └── Format Switching (right panel bar)
│       ├── Default Chat — normal bubbles
│       ├── Email Format — sender, timestamp, clean paragraphs
│       ├── Table Format — Sender/Time/Message/Attachments columns
│       ├── Calendar Format — messages grouped by date with timeline
│       └── Document Format — entire conversation as clean document
├── Right Panel
│   ├── Pinned Messages
│   ├── Files (all shared in this chat)
│   ├── Sticky Notes (attached to this chat)
│   ├── Members (all members with status)
│   ├── Linked Tasks (created from this chat)
│   └── Linked Events (calendar events linked)
├── Task Creation from Chat Flow
│   ├── User hits '+ Task' → structured card: Title, Assignee, Priority, Deadline, Description
│   ├── Sender submits → assignee notified
│   ├── Assignee chooses: 'Add to Calendar' or 'Discuss' (Task Thread)
│   └── If Discuss → thread opens → when done → 'Add to Calendar or Ignore?'
├── User Status
│   ├── Online — app open (automatic)
│   ├── In a Meeting — meeting starts (automatic)
│   ├── On Leave — leave approved (automatic)
│   ├── Working from Home — remote day + entry marked (automatic)
│   ├── In Office — office day + geofence check-in (automatic)
│   └── Custom — user sets text + duration (30min/1hr/today/this week)
└── Conversation Sidebar
    ├── Search bar at top
    ├── Channels section (with unread badges)
    ├── Direct Messages section (with online/offline dots)
    ├── Groups section
    ├── Rooms section (with 🔒 icon)
    └── "+" button on each section to create new
```

---

## ✅ TASKS & TO-DO
```
Tasks
├── Task Fields
│   ├── Always Visible: title, assignees, team tag, priority (4 levels), deadline, status (6 states), progress (0-100%), current status note
│   └── More (expandable): recurring, pre-task dependency, estimated time, watchers, labels, attachments, linked workspace/chat, private/public, description
├── Priority (4 Levels)
│   ├── Top Priority — Red
│   ├── High Priority — Orange
│   ├── Medium Priority — Yellow
│   └── Low Priority — Green
├── Status (6 States)
│   ├── Not Started (grey) — default
│   ├── In Progress (blue)
│   ├── On Hold (yellow) — waiting/blocked
│   ├── Done (green)
│   ├── Cancelled (red)
│   └── Reopened (orange) — was Done, sent back
├── Subtasks & Dependencies
│   ├── Unlimited depth subtasks (same fields as parent)
│   ├── Parent progress auto-calculates from subtask completion
│   ├── Pre-task dependency — task LOCKED until pre-task is Done
│   ├── If pre-task deadline missed → dependent assignees notified
│   └── Dependency chains: A → B → C → D
├── Multiple Assignees
│   ├── One shared task — everyone updates progress together
│   ├── Status change by any assignee reflects for all
│   └── Each assignee controls own Private/Public toggle independently
├── Labels (3 Types)
│   ├── Company Labels — admin created, visible to everyone
│   ├── Team Labels — any team member creates, that team only
│   └── Personal Labels — individual creates, only that person sees
├── Task Sources
│   ├── Created directly in Tasks section
│   ├── Created from chat message (sourceType: 'chat')
│   ├── Created from MoM (sourceType: 'mom', linked to exact point)
│   ├── Created from meeting (sourceType: 'meeting')
│   └── Created from workspace (sourceType: 'workspace')
├── Activity Log — who changed what and when
└── Calendar Integration — all tasks reflect on assignee's calendar

To-Do List
├── Personal only — never shared or assigned
├── Fields: title (required), deadline (optional), priority (optional), notes (optional)
├── Tap checkbox → strikethrough + moves to bottom
├── Auto-reflects on personal calendar as private tasks
├── Convert to Task button → promotes to full task with assignee
└── Can be recurring (daily, weekly, monthly)
```

---

## 📁 WORKSPACE
```
Workspace
├── Types
│   ├── Personal — creator only, no inviting
│   ├── Team — all team members, auto-visible
│   └── Cross-team — invited members outside team via DM (accept/reject)
├── Contents
│   ├── Documents — TipTap block editor (Notion-style)
│   │   ├── Headings, paragraphs, lists (bullet, numbered, task)
│   │   ├── Tables, images, code blocks, toggles, callouts, blockquotes
│   │   ├── Classification: Personal / Company / Client
│   │   ├── Only Client docs can be shared externally (admin approval required)
│   │   ├── Plain text auto-extracted for deep search
│   │   └── Auto-save every 30 seconds
│   ├── Tables — simple spreadsheet-style
│   ├── Links — saved URLs with Open Graph preview cards
│   ├── Files — any file type, auto-compressed on upload
│   │   └── Folders: user zips before upload, stored as zip
│   ├── Notes — quick freeform text (simpler than documents)
│   ├── Whiteboard — drawing canvas for brainstorming (Canvas API)
│   └── Embedded Tasks — linked tasks showing live status
├── Cross-team Invite Flow
│   ├── Creator adds person from different team
│   ├── DM sent: "I want to add you to this workspace"
│   ├── Accept → silent access granted
│   └── Reject → creator notified in same DM thread
└── External Sharing (Client docs only)
    ├── Creator marks doc as Client classification
    ├── Creator requests admin approval
    ├── Admin approves/rejects
    ├── If approved → invite sent to external person
    └── Accept → view-only access
```

---

## 👥 MEETINGS
```
Meetings
├── Creation
│   ├── Required: title, agenda, type (online/offline), date/time, attendees
│   ├── Optional: duration, location, attachments, recurring
│   ├── Anyone can create — no special power needed
│   ├── Online → Google Meet link auto-generated (Service Account)
│   ├── Synced to all attendees' Google Calendars
│   └── 10-second undo window (silent delete, no notification)
├── After 10 Seconds
│   ├── Meeting is live, invitations sent
│   ├── Cannot be silently deleted
│   └── Cancellation → notification to all, Meet link invalidated
├── Invite Responses
│   ├── Confirm — shown as confirmed
│   ├── Decline — reason optional, shown as "Not Joined" (NOT removed)
│   ├── Reschedule Request — reason optional
│   └── Unseen Alert — if attendee hasn't opened invite 2 min before start → organizer notified
├── Editing
│   ├── Anyone in meeting can edit details or add attendees
│   ├── Agenda change → notification to all
│   ├── Time change → notification + DM to all
│   ├── New attendee → standard invitation
│   └── Minor edits → silent (no notification)
├── During Meeting
│   ├── Start Meeting → status changes to in_progress
│   ├── Auto-DND for attendees with autoDND setting
│   ├── Auto-status: "In a Meeting"
│   ├── Mark Present/Absent — creator only, fully manual
│   ├── Personal Scratchpad — every attendee has one, ALWAYS private
│   ├── Team MoM — any attendee can write, multiple MoMs per meeting
│   ├── + Add Task in MoM — inline task block (Title, Assignee, Priority, Deadline)
│   ├── Task Notifications → ONLY after meeting ends (no interruption during)
│   └── Late Joiners — full access to everything from beginning
├── Minutes of Meeting (MoM)
│   ├── Scratchpad — only that person, always private
│   ├── Personal MoM — only creator until published
│   ├── Team MoM — all meeting members once published
│   ├── Default state: PRIVATE until published
│   ├── Published: others can view, comment, react — CANNOT edit
│   ├── Tasks in MoM: assignee gets link back to exact MoM point
│   └── TipTap editor with toolbar (bold, italic, headings, lists, tasks, blockquote)
├── End Meeting
│   ├── Creator clicks End Meeting
│   ├── Task notifications fire
│   ├── Meeting moves to Past Meetings
│   └── DND auto-disabled for attendees
├── Meeting Chat Thread
│   ├── Created automatically when meeting is created
│   ├── Open from creation — pre/during/post meeting
│   ├── Each user closes independently
│   └── Reopen anytime from meeting details
└── Past Meetings
    ├── Stored permanently — no archiving or deletion
    ├── Contains: attendance record, all MoMs, tasks with status, chat, docs, Meet link
    └── New tasks can be created and linked to past meetings at any time
```

---

## ✉️ EMAIL
```
Email
├── Accounts
│   ├── Personal Company Email (ravi@company.com) — only that employee
│   ├── Shared Company Inbox (help@company.com) — admin ticks access
│   └── SMTP/IMAP via self-hosted Postfix + Dovecot on VPS
├── Layout (3 panels)
│   ├── Left Sidebar: All Inbox (unified), per-account inboxes, categories, Sent, Drafts, Trash
│   ├── Middle: Email list (sender, subject, preview, timestamp, category, bold if unread)
│   └── Right: Full email (reply, reply all, forward, assign category, attach to workspace, mark as task)
├── Features
│   ├── Account switching — dropdown selects send-from
│   ├── Browser spellcheck in composer
│   ├── Templates — company-wide (admin) + personal (each user)
│   ├── Categories — user-created, filter in sidebar
│   ├── Mark email as task → goes to task list
│   ├── Shared inbox: "Replied by [Name]" prevents duplicate replies
│   ├── Drafts — auto-saved
│   └── Thread view — group emails by conversation
├── AI Integration
│   └── AI Draft — type one sentence, AI writes complete email
└── Notifications
    └── New email → Mac-style stack notification with Quick Reply option
```

---

## 📝 STICKY NOTES
```
Sticky Notes
├── Access: top right icon on EVERY screen — panel slides in
├── Tabs: each note shown as tab (title or first line as label)
├── Size: small by default, expand button for full window
├── Colors: user picks per note (personal organization)
├── Attachments: one note can attach to MULTIPLE things simultaneously
│   ├── Task, chat, person, meeting, conversation
│   └── Context badge shows count when notes attached to current screen
├── Privacy: private by default
│   ├── Share to specific person via DM
│   └── View-only unless creator grants edit
└── Reminders: no built-in — attach to calendar reminder instead
```

---

## 🎯 DAILY ACTIVITY
```
Daily Activity
├── Types (8)
│   ├── 📚 Reading — book, article, research
│   ├── 🎥 Video — YouTube, documentary, tutorial
│   ├── 🎮 Fun — quiz, game, challenge
│   ├── 🧘 Wellness — stretch, walking, meditation
│   ├── 📖 Learning — course, skill-share, workshop
│   ├── 🎉 Celebration — birthday, anniversary, achievement
│   ├── 💡 Brainstorm — informal idea-sharing
│   └── 🤝 Social — team lunch, coffee, virtual hangout
├── Anyone can create — no special power
├── Audience: company / team / individual
├── RSVP: Join or Skip (counts shown on card)
├── Calendar: shows in Yellow
└── Recurring: daily, weekly, monthly
```

---

## 📰 TEAM FEED
```
Team Feed
├── Purpose: casual, fun, learning content ONLY
├── NOT for work announcements (those go in Channels/Announcements)
├── Anyone can post: text, images, videos, links, files
├── Audience: company-wide or specific team
├── Interactions: comments + emoji reactions
├── Pinning: for yourself ONLY (personal bookmark)
└── Separate from Announcements

Announcements (Separate System)
├── Location: banner on Calendar home screen
├── Delivery: push notification + calendar banner
├── Purpose: official communication
├── Who posts: tickable power for company-wide, anyone for team-scope
└── Dismissible by each user individually
```

---

## 💰 SALARY & PAYROLL
```
Salary
├── Structure
│   ├── Base Salary — admin sets at creation, updatable
│   ├── Company Deduction Rules — per absent day, per half day, per unapproved leave
│   ├── Tax: TDS / PF / ESI — admin defines per employee
│   ├── Fixed Bonus — admin sets, updatable monthly
│   └── Rule-based Performance Bonus — auto-applied at month end (e.g., zero absences = ₹X)
├── Monthly Breakdown
│   ├── Earnings: base + bonuses
│   ├── Deductions: itemized (absent days, half days, tax)
│   └── Net salary = earnings - deductions
├── Employee View
│   ├── Salary Summary in sidebar
│   ├── Full monthly breakdown
│   └── Download as PDF payslip
├── Salary Dispute
│   ├── Employee clicks "Raise Dispute" → form (month, what's wrong, description)
│   ├── Goes to assigned manager AND HR
│   ├── Status: Resolved / Rejected (with reason) / Escalated
│   └── Full dispute history maintained permanently
└── System: calculation only — does NOT auto-process payments
```

---

## 🔔 NOTIFICATIONS
```
Notifications
├── Display
│   ├── Slide in from top right — Mac-style stacked
│   ├── Auto-dismiss after few seconds
│   ├── Infinite stack — Clear All available
│   └── Icon, title, short preview
├── Quick Actions (from notification)
│   ├── Add to Calendar
│   ├── View Task
│   ├── Reply
│   └── Acknowledge (emergency only)
├── Types: Emergency, Tasks, Messages, Meetings, Approvals, Announcements
├── Sounds: different per type, user selectable
├── Do Not Disturb
│   ├── Manual: with duration
│   ├── Auto: when meeting starts
│   ├── @Mention: user controls if it breaks DND
│   └── Emergency: IGNORES DND, cannot dismiss until acknowledged
├── Notification Center (sidebar)
│   ├── Grouped by type
│   ├── Mark read, mark all read, clear all
│   └── Unread count badge on sidebar icon
├── Retention: 3 months then auto-deleted
└── Emergency Alert
    ├── Cannot be dismissed until Acknowledged
    ├── Ignores DND
    ├── Tickable admin power (emergency.sendAlert)
    └── Logged permanently
```

---

## 🔍 SEARCH
```
Search
├── Screen-wise — each section has its own search bar (NO global cross-section)
├── Normal Search
│   ├── Searches metadata: titles, names, tags, labels
│   ├── Fast — instant results on Enter
│   └── MongoDB $text index on metadata fields
└── Deep Search
    ├── User explicitly clicks Deep Search button
    ├── Searches plain text CONTENT inside docs, MoM, task descriptions, emails
    ├── Background chunked job
    │   ├── CHUNK_SIZE: 20 documents per chunk
    │   ├── CHUNK_DELAY: 10 seconds between chunks
    │   ├── MAX_RESULTS: 4 (stops ALL processing at 4)
    │   ├── MAX_CONCURRENT_JOBS: 2 per user
    │   └── RESULT_RETENTION: 24 hours
    ├── Progressive delivery via WebSocket
    │   ├── deep_search_partial — results found in chunk
    │   ├── deep_search_progress — chunk processed update
    │   ├── deep_search_complete — all done or 4 results
    │   └── deep_search_cancelled — user cancelled
    ├── Progress bar shown with cancel option
    └── Completion messages
        ├── 4 results: "Search complete — 4 results found. Refine your search."
        ├── <4 found: "[X] result(s) found."
        └── 0 found: "No results found. Try different keywords."
```

---

## 🤖 AI FEATURES
```
AI Layer
├── Architecture (3 Layers)
│   ├── Layer 1 — Generic Interface: AIService.summarize(), extractTasks(), draftEmail(), formatMoM(), generateMeetingSummary()
│   ├── Layer 2 — Provider Adapters: GeminiAdapter, OpenAIAdapter, ClaudeAdapter (same 5 methods)
│   └── Layer 3 — Fallback Manager: user key → on quota error → HIGH priority uses company key, LOW notifies user
├── Features
│   ├── Summarize chat thread (LOW priority)
│   ├── Analyse MoM — summary + task extraction (HIGH priority)
│   │   └── Each suggestion: Add & Complete / Edit / Deny
│   ├── Draft email from one sentence (LOW priority)
│   ├── Format raw meeting notes to structured MoM (HIGH priority)
│   └── Generate meeting summary from MoM + chat (HIGH priority)
├── CRITICAL RULE: AI NEVER acts automatically — always suggests, user confirms
├── Activation Code System
│   ├── Format: PROVIDER:ENCRYPTED_KEY:EXPIRY:CHECKSUM
│   ├── Developer generates code on their machine (generateCode.js, NOT shipped)
│   ├── Uses Node.js crypto: aes-256-cbc encryption, hmac-sha256 checksum
│   ├── Employee enters in Settings → API Configuration → Activate
│   ├── App validates checksum, checks expiry, decrypts key
│   └── Stored in Electron safeStorage (never plain text)
└── Fallback
    ├── User key works → use it
    ├── User key quota + HIGH priority → silently use company key
    ├── User key quota + LOW priority → "Your AI quota is exhausted"
    └── Both fail → "AI unavailable — please try again later"
```

---

## 🚀 ONBOARDING
```
New Employee Onboarding
├── Step 0A — App Introduction: slides (logo, features, get started), skip option
├── Step 0B — Company Card: contact info, about, social links (accessible anytime from settings)
├── Step 1 — Welcome: personalized (name, role, team, manager), company message
├── Step 2 — Default Settings: interactive tooltip, all settings with suggested defaults pre-selected, skip = defaults applied
├── Step 3 — Profile Setup: upload photo, confirm phone, set status, choose notification sounds
└── Step 4 — Getting Started Checklist: complete profile, check calendar, say hi on Team Feed, check tasks, explore Spaces
```

---

## 🔐 SECURITY SECTION
```
Three Dots → Security (visible ONLY to security admins)
├── Pending OTPs — THE ONLY PLACE OTPs APPEAR IN THE UI
│   ├── Who requested, when, expiry countdown
│   └── OTP code visible here (6 digits)
├── Account Locks — locked employees, unlock button
├── Active Sessions — who is logged in, force logout option
└── Password Resets — history of password changes
```

---

## 📊 ANALYSIS (Admin Only)
```
Analysis
├── Levels
│   ├── Individual — attendance, task completion, activity, salary history, leave history
│   ├── Team — attendance rate, task completion, meeting frequency, most active members
│   └── Company — company-wide attendance, all teams, storage usage, monthly salary
├── Charts: line graphs, bar charts, pie charts
└── Filters: day, week, month, year + team/individual
```

---

## 🗂️ FILE STORAGE
```
File System
├── Compression (per file type, lossless)
│   ├── Images (JPG, PNG, WebP): Sharp — removes metadata, no visual loss
│   ├── PDF: pdf-lib — removes redundant data
│   ├── Office docs (docx, xlsx, pptx): zlib max level — recompress ZIP container
│   ├── Text, JSON, CSV, XML: gzip — 60-80% reduction
│   ├── Audio: store as-is (marginal gains)
│   └── Video: store as-is (too CPU heavy)
├── Folders: user zips before upload, stored as zip, user unzips on download
├── Two-Step Deletion
│   ├── Step 1: mark as deleted in MongoDB (soft delete)
│   └── Step 2: nightly cleanup at 2 AM deletes actual VPS files
├── Cleanup Job (2 AM nightly)
│   ├── Delete files marked deleted in MongoDB
│   ├── Check for orphaned files (VPS files with no MongoDB reference)
│   ├── Clear all /temp folder contents
│   └── Log cleanup report: files deleted, storage freed
└── Frontend: transparent decompression
    ├── gzip files: browser auto-decompresses via Content-Encoding header
    ├── Sharp images: standard JPG/PNG output, no decompression needed
    └── Folders: user downloads zip, manually unzips
```

---

## 🔌 REAL-TIME (Socket.io)
```
Socket.io Events
├── User Presence
│   ├── user:online / user:offline — presence tracking
│   └── onlineUsers map shared across all clients
├── Messaging
│   ├── channel:join / channel:leave — join/leave rooms
│   ├── message:received — new message in channel
│   ├── message:reaction — reaction added/removed
│   ├── message:edited — message content changed
│   ├── message:deleted — message removed
│   ├── user:typing / user:stop-typing — typing indicators
│   └── deep_search_* — progressive search results
├── Notifications
│   ├── notification:new — push notification to user
│   └── otp:pending — OTP sent to admin
├── System
│   ├── auth:force-logout — admin forced user logout
│   ├── task:updated — task status/progress changed
│   └── attendance:marked — entry marked notification
└── Architecture
    ├── Single Node.js server (sufficient for 15-20 users)
    ├── Socket.io rooms map to Channels/DMs/Rooms
    └── Future: Redis adapter for multi-server scaling
```

---

## 🗄️ DATABASE (MongoDB Collections)
```
Collections
├── Communication: channelMessages, roomMessages, directMessages, groupMessages, broadcastMessages, taskThreadMessages, meetingMessages
├── Tasks: tasks, subtasks, todos
├── Meetings: meetings, mom, meetingAttendance
├── Workspace: workspaces, workspaceDocuments, workspaceNotes, workspaceFiles, workspaceLinks
├── Email: emailAccounts, emails, emailDrafts, emailTemplates, emailCategories
├── HR: attendance, leaves, salaryStructure, salaryMonthly, salaryDisputes
├── Core: users, teams, offices, calendars, calendarEvents, announcements, notifications, stickyNotes, labels, activities, teamFeedPosts, apiConfig, deepSearchJobs, companyInfo
└── [PRIVATE]: separate encrypted log file (.core.log.enc)
```

---

## 📱 NAVIGATION (Sidebar)
```
Sidebar Layout
├── MAIN
│   ├── 📅 Calendar (Home)
│   ├── 📢 Announcements (banner on calendar, not sidebar item)
│   ├── 📰 Team Feed
│   └── 🎯 Daily Activity
├── COMMUNICATION
│   ├── 💬 Messages (Spaces)
│   └── ✉️ Email
├── WORK
│   ├── ✅ Tasks
│   ├── ☑️ To-Do (tab within Tasks)
│   └── 📁 Workspace
├── MEETINGS
│   └── 👥 Meetings
├── HR
│   ├── ⏰ Attendance
│   └── 💰 Salary Summary
├── PERSONAL
│   └── 📝 Sticky Notes
├── ADMIN ONLY (visible in Admin Mode)
│   ├── 👤 Manage Users
│   ├── 📊 Analysis
│   └── 🔐 Security
├── NOTIFICATIONS
│   └── 🔔 Notification Center (with unread badge)
└── BOTTOM
    └── ⚙️ Settings
```

---

## 🖥️ API ROUTES (All /api/v1/)
```
Routes
├── /auth/* — login, OTP, refresh, set-password, logout, me
├── /users/* — CRUD employees, powers, directory
├── /security/* — OTPs, locks, sessions, force logout, password resets
├── /teams/* — teams + offices listing, team creation with auto-channel
├── /attendance/* — mark entry, wrap up, leaves, history, team view, stats, admin actions
├── /calendar/* — events CRUD, seed holidays (including Sundays)
├── /messages/* — channels, messages, reactions, pins, threads, broadcast, task-from-chat, add-to-calendar
├── /tasks/* — tasks CRUD, subtasks, to-dos, labels, attachments, convert todo→task
├── /workspace/* — workspaces, documents (TipTap), notes, links, files, cross-team invites, external sharing
├── /meetings/* — meetings CRUD, responses, MoM CRUD, mark present, start/end, add attendees, meeting chat
├── /email/* — accounts, messages, drafts, templates, categories, send, thread view
├── /sticky-notes/* — CRUD, attach/detach, share/unshare
├── /activities/* — CRUD, RSVP join/skip
├── /feed/* — posts, comments, reactions, personal pins, announcements
├── /salary/* — rules, monthly generation, employee override, disputes, PDF payslip
├── /notifications/* — list, read, dismiss, acknowledge, send, emergency
├── /search/* — normal search, deep search queue/cancel/status
├── /ai/* — summarize, extract tasks, draft email, format MoM, meeting summary, config
├── /onboarding/* — company info, onboarding state, profile update, settings
├── /announcements/* — create, list, dismiss
└── /sys/* — [PRIVATE] system panel (hidden, 404 to non-system users)
```
