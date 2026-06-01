# OjasTrack — React Frontend Implementation Plan

How to build each OjasTrack feature using only the React frontend (`client/`),
with honest notes on what the browser allows and what it forbids.

The browser sandbox is the hard ceiling. Where a feature isn't possible in
pure web, this doc names the smallest escape hatch (Electron API, browser
extension, or native permission).

---

## 1. Time & Attendance Tracking

### 1.1 Clock In / Clock Out

**Already in Niyoq.** No new work. We capture entry/wrap-up, GPS, IP, and
`verificationMethod` on the `Attendance` record.

### 1.2 Live Work Timer (running stopwatch on screen)

**Pure React, no server changes.** Read `entryTime` from
`/attendance/today`, then drive a counter from it:

```jsx
function WorkTimer({ entryTime }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!entryTime) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [entryTime]);
  const ms = entryTime ? now - new Date(entryTime).getTime() : 0;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return <span>{h}h {m}m</span>;
}
```

Mount this in `AppLayout.js` topbar so it's always visible. Stop on
wrap-up. Persistent across refresh because the source of truth is the
server `entryTime`, not local state.

### 1.3 Selfie Verification at Clock-In

**Pure browser API.** Use `navigator.mediaDevices.getUserMedia` to grab a
single frame, then upload as a normal multipart file.

```jsx
async function takeSelfie() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  const video = Object.assign(document.createElement('video'), { srcObject: stream });
  await video.play();
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  stream.getTracks().forEach(t => t.stop());
  return new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
}
```

Wire into the "Mark Entry" flow: capture the blob, append to FormData
together with location, hit `/attendance/mark-entry`. Mobile WebView needs
the `CAMERA` permission already declared in `app.json` (we have
`ACCESS_FINE_LOCATION` but not yet `CAMERA`).

### 1.4 Break Tracking (typed breaks with their own timer)

**Pure frontend with one new model on the server.**

- Add a Break sub-document on Attendance: `{ type: 'lunch'|'tea'|'personal', startedAt, endedAt }`.
- React state: `const [activeBreak, setActiveBreak] = useState(null)`.
- A "Start Break" dropdown opens, user picks a type, optimistically updates UI, POSTs `/attendance/break/start`.
- During the break, the work timer freezes (`workTime = totalElapsed − sumOfBreaks`).
- "End Break" POSTs `/attendance/break/end`.
- Cap overruns are calculated server-side at end-of-day and flagged in the
  attendance summary.

### 1.5 Minimum Hours Alert on Wrap-Up

**Pure frontend gate.** Before calling `/attendance/wrap-up`, compute
`now - entryTime` minus break time. If less than 8h, show an
`AlertModal` with "Confirm anyway / Cancel". This is purely a nudge — the
backend already accepts wrap-up at any time.

### 1.6 Attendance Dashboard (color-coded calendar + monthly summary)

**Pure React, just a richer calendar component.** Extend the existing
attendance history endpoint to return per-day status and render a
month-grid:

```jsx
const STATUS_COLORS = {
  present: 'var(--emerald)', late: 'var(--amber)',
  half_day: 'var(--gold)',   absent: 'var(--danger)',
  leave: 'var(--cyan)',      holiday: 'var(--ink-4)', weekend: 'var(--ink-4)'
};
```

Each `<div>` per day takes its color from `STATUS_COLORS[day.status]`.
At the top render a summary row computed via `Array.reduce`.

### 1.7 Team View (manager sees all team members at once)

**Already mostly there.** Extend `/attendance/team-today` to return one
row per direct report and render as a table with status pills. Pure UI.

---

## 2. Activity Monitoring & Productivity

This is the section where the browser sandbox bites. Each feature lists
what's possible in pure web vs. what needs a non-web escape hatch.

### 2.1 Screenshot Capture

**Pure-web answer: limited and intrusive.** The only browser API for
taking screenshots is `getDisplayMedia` — and it:
1. Requires a user click *each time* a session starts.
2. Shows a "Niyoq is sharing your screen" banner that can't be hidden.
3. Captures only what the user picks (whole screen / one window / a tab).

That makes silent periodic screenshots impossible in a browser tab.

```jsx
// One-time, user-initiated screen capture
async function captureOnce() {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  const track = stream.getVideoTracks()[0];
  const cap = new ImageCapture(track);
  const blob = await cap.grabFrame().then(bmp => {
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0);
    return new Promise(res => c.toBlob(res, 'image/jpeg', 0.7));
  });
  track.stop();
  return blob;
}
```

**Realistic answer: Electron.** Wrap the existing React app in Electron
and expose `desktopCapturer` over an IPC bridge:

```js
// preload.js (electron)
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('niyoqDesktop', {
  screenshot: () => ipcRenderer.invoke('niyoq:screenshot'),
});
```

```jsx
// React side — exactly the same call as the web version above, just no permission prompt
useInterval(async () => {
  if (!window.niyoqDesktop) return; // running in pure browser, no-op
  const blob = await window.niyoqDesktop.screenshot();
  upload(blob);
}, 5 * 60 * 1000);
```

`useInterval` is a tiny custom hook so the interval handle survives renders.

**Blur mode** is just a server-side image transform (`sharp.blur(20)`) on
upload. The React side doesn't change.

### 2.2 App and Website Usage Tracking

**Pure-web: not possible.** A browser tab cannot see what apps the user
has open, what other browser tabs are open, or which window is in the
foreground. Privacy sandbox forbids it.

**Realistic options, in order of effort:**

1. **Electron + `active-win`** (npm package) — gives you the foreground
   window title + executable name every N seconds. Send it up the IPC
   bridge to React, then to the server.
   ```js
   // electron main
   const activeWin = require('active-win');
   setInterval(async () => {
     const w = await activeWin();
     win.webContents.send('niyoq:active', { app: w?.owner?.name, title: w?.title, ts: Date.now() });
   }, 30_000);
   ```
   React listens via `window.niyoqDesktop.onActive(cb)` and POSTs to a
   new `/usage/sample` endpoint.

2. **Browser extension** — for URL tracking inside Chrome/Firefox. A
   tiny WebExtension can read the active tab's URL with the `tabs`
   permission and POST it to our server. Pure React in the dashboard
   then shows the data. The user installs the extension once.

3. **Self-reported diary mode** — if the team rejects monitoring, give
   them a "What did you work on?" 30-min nudge that they fill in.
   100% pure web, but the data is only as honest as the user.

App categorization (Productive / Neutral / Unproductive / Uncategorized)
is purely UI + a `categories` table. React shows a "Categorize new apps"
admin screen that picks up `category: 'uncategorized'` rows.

### 2.3 Activity Level (mouse + keyboard counts)

**Pure-web: works only while our tab has focus.** That's a real
limitation — once the user clicks any other window, we stop seeing input.

```jsx
function useActivityCounter() {
  const counts = useRef({ keys: 0, clicks: 0, moves: 0 });
  useEffect(() => {
    const k = () => counts.current.keys++;
    const c = () => counts.current.clicks++;
    let lastMove = 0;
    const m = () => {
      // Sample mouse moves at ~5 Hz so we don't count every pixel
      const now = performance.now();
      if (now - lastMove > 200) { counts.current.moves++; lastMove = now; }
    };
    window.addEventListener('keydown', k);
    window.addEventListener('mousedown', c);
    window.addEventListener('mousemove', m);
    return () => {
      window.removeEventListener('keydown', k);
      window.removeEventListener('mousedown', c);
      window.removeEventListener('mousemove', m);
    };
  }, []);
  return counts;
}
```

Every 60 seconds, drain `counts.current` into a server POST
`/activity/sample` and reset. The server stores an
`ActivitySample { user, ts, keys, clicks, moves, focused: true }` row.

**For OS-wide activity:** Electron's `powerMonitor.getSystemIdleTime()`
returns seconds since last input *anywhere*. Sample it every 30s and
classify Active / Idle / Away (>10 min). This is the real productive
build of this feature.

Activity status (Active / Idle / Away / On Break / Offline) is purely a
state machine computed from these inputs — no further infrastructure.

### 2.4 Productivity Score

**Pure React calculation.** Given app usage + categories, the formula is
trivial:

```js
const productive = samples.filter(s => s.category === 'productive').length;
const total = samples.length;
const score = total ? Math.round(productive / total * 100) : 0;
```

Render as a number badge + a trend sparkline. Without 2.2 data, this
shows "—".

### 2.5 Auto-Pause on Inactivity

**Pure-web fallback:** combine `document.hidden`, `window.blur`, and
`useActivityCounter` to guess. If no input + tab hidden for X minutes,
auto-pause the work timer and show a "Are you still working?" modal on
return.

```jsx
useEffect(() => {
  let timer = setTimeout(promptStillWorking, 10 * 60 * 1000);
  const reset = () => { clearTimeout(timer); timer = setTimeout(promptStillWorking, 10 * 60 * 1000); };
  window.addEventListener('mousemove', reset);
  window.addEventListener('keydown', reset);
  return () => { clearTimeout(timer); window.removeEventListener('mousemove', reset); window.removeEventListener('keydown', reset); };
}, []);
```

**Electron answer:** `powerMonitor.getSystemIdleTime()` for accurate
system-idle detection.

---

## 3. Task & Project Management

### 3.1 Existing State

Niyoq already has: title, description, assignee, priority, deadline,
subtasks, projects (Workspaces), labels, status (Not Started / In
Progress / Done). The OjasTrack spec adds:

- **In Review** status — work done, manager hasn't checked.
- **P0–P3** priority naming — we use Top / High / Medium / Low. Pure
  label change.

### 3.2 Adding "In Review"

One-line server change (add to enum). Frontend: extend
`STATUS_CONFIG`:

```js
const STATUS_CONFIG = {
  not_started: { label: 'To Do', color: '#94A3B8' },
  in_progress: { label: 'In Progress', color: '#6366F1' },
  in_review:   { label: 'In Review', color: '#F59E0B' }, // new
  done:        { label: 'Done', color: '#10B981' },
};
```

Two new chips on the filter row, one new column on a Kanban view (3.3
below).

### 3.3 Kanban Board View

**Pure React.** Add a "Board" view toggle next to the existing list
view. Each status is a column, tasks are draggable cards.

Use `@dnd-kit/core` (free, lightweight, no extra backend) for drag &
drop. On drop, optimistically setState + PATCH `/tasks/:id` with the new
status.

```jsx
import { DndContext } from '@dnd-kit/core';

<DndContext onDragEnd={({ active, over }) => {
  if (over && active.data.current.status !== over.id) {
    updateTaskStatus(active.id, over.id);
  }
}}>
  {STATUSES.map(s => <Column key={s} status={s} tasks={tasksByStatus[s]} />)}
</DndContext>
```

### 3.4 Subtasks UI

Already supported in the model. A polish pass on the Task detail page:
checkbox list with progress bar (`done / total`).

---

## 4. Notifications, Reminders, Alerts

Already covered by the existing notification system. Frontend additions:

- **Daily summary toast at 6 PM** — query `/attendance/today` and
  `/tasks/my-summary`, render a card.
- **Pattern alerts** ("You were late 3 times this week") — backend job
  posts a regular notification, no UI changes.

---

## 5. What the React-Only Build Cannot Do

Be honest with the team about these:

| Feature | Why React/web can't | Minimum unlock |
|---|---|---|
| Silent periodic screenshots | `getDisplayMedia` requires user click each session + shows persistent share banner | **Electron** (`desktopCapturer`) |
| Foreground app detection | Browser tab can't see other apps | **Electron** (`active-win`) |
| URL tracking in other browsers | Sandbox forbids cross-browser inspection | **Browser extension** per browser |
| OS-wide mouse/kbd counts | Only our tab's events are visible | **Electron** (`uiohook-napi`) |
| OS idle time | Only `document.hidden` available | **Electron** (`powerMonitor`) |
| Background continuous run | Tabs get suspended | **Electron** stays running |
| Mobile app-usage tracking | iOS forbids; Android needs `UsageStatsManager` + intrusive permission | Skip on mobile |

Everything else in the OjasTrack guide ships in pure React + our
existing Node backend.

---

## 6. Suggested Build Order (React-only)

If you stay in pure web and never ship Electron, the realistic phased
order is:

1. **Phase 1 — Pure React, ~1 week**
   - Live work timer in topbar
   - Selfie at clock-in
   - Typed break tracking
   - Minimum-hours wrap-up nudge
   - Color-coded attendance calendar + monthly summary
   - Team view table for managers
   - "In Review" task status + chip
   - Kanban board view via `@dnd-kit`
2. **Phase 2 — Diary / self-report, ~3 days**
   - In-tab activity counter (mouse/keys while focused)
   - "What are you working on?" 30-min nudge
   - Tab-focus based active/idle/away status
   - Per-category app declaration (manually filled by user)
3. **Phase 3 — Productivity dashboard, ~3 days**
   - Productivity score using diary + tab focus
   - Per-team leaderboard
   - Weekly/monthly trend charts (recharts)

For 80% of the OjasTrack spec, **Phase 1 + Phase 2 + Phase 3 is enough**
and stays purely in the React + existing Node backend.

The remaining 20% (true silent screenshots, OS-wide app tracking) needs
Electron, and that's a separate decision.
