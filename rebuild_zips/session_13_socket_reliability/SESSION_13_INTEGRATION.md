# Session 13 — Socket Reliability (C5)

**Status: ✅ Build-verified.** Server: syntax OK. Client: 289.89 kB main.js (+0.6 kB).

This session closes audit gap **C5**. Real-time was flaky:
- **Multi-tab bug:** opening a second tab kicked the first tab "offline" in the presence map
- **No heartbeat:** laptop sleep / wifi drop left users marked online for minutes until TCP keepalive gave up
- **Typing indicators stuck:** if a user closed their tab mid-type, others saw "typing…" forever
- **No catch-up on reconnect:** brief disconnects silently missed events
- **No UI feedback:** no indication when the connection dropped

Session 13 fixes all of these with a hardened server socket manager, proper reconnect logic, and a connection status banner.

---

## What's in this zip

```
server/
├── index.js                        (patched — delegates to socketManager)
└── utils/
    └── socketManager.js            (NEW — multi-tab presence, typing timeouts, catch-up)

client/src/
├── App.js                          (patched — renders ConnectionBanner)
├── context/
│   └── SocketContext.js            (rewritten — reliable reconnect, heartbeat, auto-stop typing)
└── components/
    ├── ConnectionBanner.js         (NEW — floating "Reconnecting…" pill)
    └── ConnectionBanner.css        (NEW)
```

**6 files: 2 patched + 4 new.**

---

## Key fixes

### 1. Multi-tab presence

**Before:**
```js
const onlineUsers = new Map();  // userId → socketId
socket.on('user:online', userId => onlineUsers.set(userId, socket.id));
```
Opening tab B overwrites tab A's socket. When tab A eventually disconnects, the server emits `user:offline` for the user — even though tab B is still connected.

**After:**
```js
const presence = new Map();  // userId → Set<socketId>
addSocketForUser(userId, socket.id);  // returns true if user just came online
removeSocketForUser(userId, socket.id);  // returns true if NO tabs remain
```
`user:offline` only fires when every tab is closed. `user:online` only fires on the first tab.

### 2. Heartbeat

- **Server-side:** socket.io's `pingInterval: 25s`, `pingTimeout: 45s` makes the engine itself detect dead sockets.
- **Client-side:** explicit `heartbeat` ACK emitted every 20 s. If the ACK doesn't come back in 11 s, client forcibly disconnects+reconnects. Catches cases where the socket is "connected" from TCP's POV but the app-level pipe is wedged.

### 3. Typing auto-stop

Three layers of protection:
- Client auto-emits `user:stop-typing` 4 s after the last `user:typing` emit
- Server also sets a 5 s timeout on every `user:typing` received; if no new typing event arrives, server emits `user:stop-typing` to the channel
- On any disconnect, server clears all typing state for that user and broadcasts `user:stop-typing` for every channel they were typing in

### 4. Reconnect catch-up

- Client tracks `lastEventAtRef` on every received server event
- On reconnect, client emits `sync:catch-up { since: lastEventAt }`
- Server replies with `sync:catch-up { refetch: ['notifications', 'messages'] }` as a hint
- Consuming hooks (e.g. `useNotificationCounts` from Session 12) already re-fetch on socket reconnect. Others can subscribe to the `sync:catch-up` event if they have expensive local state to validate.

### 5. Connection banner

A small amber pill appears centered at the top when the socket is disconnected. Shows "Reconnecting… (attempt N)" during reconnect. Has a 2-second grace period on initial page load so you don't see a flash of "Connecting…" every time.

---

## Server: what `attachSocketHandlers` does

Imported via:
```js
const { attachSocketHandlers, onlineUserIds, isUserOnline, socketsForUser } =
  require('./utils/socketManager');
attachSocketHandlers(io);
```

Events handled:

| Client → server | Behavior |
|---|---|
| `user:online` | Adds socket to user's presence set. Emits `user:online` globally only if first tab. |
| `heartbeat` (with ack cb) | Resets missed counter, ACKs immediately. |
| `channel:join` / `channel:leave` | Same as before. |
| `user:typing` | Forwards to channel room, sets 5 s server-side auto-stop. |
| `user:stop-typing` | Forwards + clears the server timer. |
| `sync:catch-up { since }` | Replies with `{ refetch: [...] }` hint. |
| `disconnect` | Removes socket from presence. Clears user's typing state. Emits offline only if no tabs remain. |

### Backwards compatibility

Routes that used `app.get('onlineUsers')` to check online status still work — the Map has been replaced with a shim exposing `.has(id)`, `.keys()`, and `.size`. For new code, prefer:
```js
const isOnline = req.app.get('isUserOnline');
if (isOnline(userId)) { ... }
```

---

## Client: what the new `SocketContext` exposes

```jsx
const { socket, onlineUsers, isConnected, reconnectAttempt,
        joinChannel, leaveChannel, emitTyping, emitStopTyping } = useSocket();
```

Two new fields:
- **`isConnected`** — boolean, tracks the current connection state
- **`reconnectAttempt`** — number, current retry attempt (0 when connected or first try)

`emitTyping(channelId)` now auto-schedules `emitStopTyping` after 4 s. Components don't need to manage that timer themselves anymore.

`leaveChannel(channelId)` also stops typing for that channel — prevents stuck indicators when the user navigates away mid-type.

---

## Integration steps

**Prerequisite:** Sessions 1–12 integrated.

### 1. Copy files

```
server/utils/socketManager.js         (new)
server/index.js                       (replace)

client/src/context/SocketContext.js   (replace)
client/src/App.js                     (replace)
client/src/components/ConnectionBanner.js   (new)
client/src/components/ConnectionBanner.css  (new)
```

### 2. No new npm packages needed

Everything uses your existing `socket.io` + `socket.io-client` dependencies.

### 3. No env var changes

### 4. Restart

```bash
cd server && npm start
# Expected startup: unchanged, no new messages

cd client && npm start
```

---

## Testing

### Multi-tab

1. Open the app in two browser tabs as the same user. In a third browser, another user.
2. User B should see you online.
3. Close tab 1. User B should still see you online (tab 2 is still connected).
4. Close tab 2. User B sees you go offline.

### Reconnect

1. Open the app. Open DevTools → Network → set Offline.
2. Within ~30 s the **amber "Reconnecting…"** banner should appear.
3. Set back to Online.
4. Banner disappears within 1–2 s. Notification counts refresh automatically.

### Heartbeat

1. Open the app. DevTools → Application → Service Workers → offline (or close the laptop lid for a minute).
2. Within ~45 s server marks you offline (others no longer see you as online).
3. Bring the laptop back. Client reconnects within 10 s, presence restores.

### Typing

1. Start typing in a channel. Other user sees "X is typing…".
2. Close the tab (or navigate away).
3. Within 5 s the other user's "typing…" indicator vanishes.

### Server-side backwards compat

No existing route behavior changes. Any code that did `const onlineUsers = req.app.get('onlineUsers'); if (onlineUsers.has(id)) ...` continues to work via the shim.

---

## Progress map

| Phase | Sessions | Status |
|---|---|---|
| A — Foundation | 1, 2, 3 | ✅ Complete |
| B — Security | 4, 5 | ✅ Complete |
| C — Broken repairs | 6, 7, 8, 9 | ✅ Complete |
| **D — Cross-cutting** | 10, 11, 12, **13**, 14–17 | 🟡 4/8 done |
| E — Module restyles | 18–23 | Pending |
| F — New features | 24–27 | Pending |
| G — Electron | 28, 29 | Pending |

## Next — Session 14

**C11 — Error boundaries + retry UX.** Currently unhandled errors (failed fetches, render crashes) either white-screen the app or fail silently. Session 14 adds:
- A top-level React `<ErrorBoundary>` with a friendly fallback
- Per-module error boundaries (Messages, Meetings, etc.) so one crash doesn't take down everything
- A small `useRetry()` hook for fetches that commonly fail (flaky network, token expiry race)
- Consistent toast + inline error pattern

Say "**next**" when ready.
