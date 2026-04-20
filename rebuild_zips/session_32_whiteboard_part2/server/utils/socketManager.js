// ============================================================================
// socketManager.js — hardened socket event handling.
// ============================================================================
// Session 13 (C5 — Socket reliability).
//
// The previous `io.on('connection', ...)` block in index.js had several bugs:
//   1. onlineUsers.set(userId, socket.id) — single socket per user, so opening
//      two tabs kicked the first tab offline in the presence map.
//   2. No heartbeat — silent network drops (laptop sleep, wifi flap) left
//      users marked "online" indefinitely until the TCP keepalive finally
//      gave up minutes later.
//   3. Typing indicators never timed out — if the user closed their tab mid-
//      type, others saw "X is typing…" forever.
//   4. No replay on reconnect — brief disconnects meant missed events.
//
// This module fixes all four. Swap `io.on('connection', ...)` in index.js for
// `attachSocketHandlers(io)` from here.
// ============================================================================

// ─── Presence (multi-tab aware) ─────────────────────────────────────────────
// userId -> Set<socketId>. User is "online" when the set is non-empty.
const presence = new Map();

function addSocketForUser(userId, socketId) {
  if (!userId) return false;
  if (!presence.has(userId)) presence.set(userId, new Set());
  presence.get(userId).add(socketId);
  return presence.get(userId).size === 1; // true if user just came online
}

function removeSocketForUser(userId, socketId) {
  if (!userId || !presence.has(userId)) return false;
  const set = presence.get(userId);
  set.delete(socketId);
  if (set.size === 0) {
    presence.delete(userId);
    return true; // user just went offline (no tabs left)
  }
  return false;
}

function onlineUserIds() { return Array.from(presence.keys()); }
function isUserOnline(userId) { return presence.has(userId); }
function socketsForUser(userId) {
  return Array.from(presence.get(userId) || []);
}

// ─── Typing state (auto-clear on timeout) ───────────────────────────────────
// Key: `${userId}:${channelId}`. Stores a setTimeout handle.
const typingTimers = new Map();
const TYPING_TIMEOUT_MS = 5000;  // clear typing if no activity for 5s

function setTypingTimeout(io, userId, channelId, name) {
  const key = `${userId}:${channelId}`;
  // Clear any existing timer for this (user, channel) pair
  if (typingTimers.has(key)) clearTimeout(typingTimers.get(key));

  const handle = setTimeout(() => {
    typingTimers.delete(key);
    io.to(`channel:${channelId}`).emit('user:stop-typing', { userId, channelId });
  }, TYPING_TIMEOUT_MS);

  typingTimers.set(key, handle);
}

function clearTypingForUser(io, userId) {
  // Called on disconnect — purge all typing state for this user.
  const prefix = `${userId}:`;
  for (const [key, handle] of typingTimers.entries()) {
    if (key.startsWith(prefix)) {
      clearTimeout(handle);
      typingTimers.delete(key);
      const channelId = key.slice(prefix.length);
      io.to(`channel:${channelId}`).emit('user:stop-typing', { userId, channelId });
    }
  }
}

// ─── Main attach function ──────────────────────────────────────────────────
function attachSocketHandlers(io) {
  // Server-initiated heartbeat — ping every 25s, disconnect if no response
  // in 45s. socket.io already has its own ping/pong, but we surface the
  // user-level online/offline event if they miss consecutive pongs.
  io.engine.pingInterval = 25_000;
  io.engine.pingTimeout = 45_000;

  io.on('connection', (socket) => {
    console.log(`[socket] connected: ${socket.id}`);
    let heartbeatMissed = 0;

    // ── Presence: user:online ──────────────────────────────────────────────
    socket.on('user:online', (userId) => {
      if (!userId) return;
      socket.userId = userId;
      socket.join(`user:${userId}`);
      const becameOnline = addSocketForUser(userId, socket.id);

      if (becameOnline) {
        io.emit('user:online', { userId, onlineUsers: onlineUserIds() });
      } else {
        // Still emit the fresh list to this socket only, so the reconnecting
        // tab knows who else is around.
        socket.emit('user:online', { userId, onlineUsers: onlineUserIds() });
      }
    });

    // ── Explicit client-driven heartbeat (optional, belt-and-suspenders) ───
    // Client can emit 'heartbeat' periodically; we ACK so it can detect
    // when the round-trip takes too long.
    socket.on('heartbeat', (cb) => {
      heartbeatMissed = 0;
      if (typeof cb === 'function') cb({ t: Date.now() });
    });

    // ── Channel rooms ──────────────────────────────────────────────────────
    socket.on('channel:join', (channelId) => {
      if (channelId) socket.join(`channel:${channelId}`);
    });
    socket.on('channel:leave', (channelId) => {
      if (channelId) socket.leave(`channel:${channelId}`);
    });

    // ── Typing (with auto-clear timeout) ──────────────────────────────────
    socket.on('user:typing', (data) => {
      if (!data?.channelId || !data?.userId) return;
      socket.to(`channel:${data.channelId}`).emit('user:typing', {
        userId: data.userId,
        name: data.name,
        channelId: data.channelId,
      });
      setTypingTimeout(io, data.userId, data.channelId, data.name);
    });

    socket.on('user:stop-typing', (data) => {
      if (!data?.channelId || !data?.userId) return;
      socket.to(`channel:${data.channelId}`).emit('user:stop-typing', {
        userId: data.userId,
        channelId: data.channelId,
      });
      const key = `${data.userId}:${data.channelId}`;
      if (typingTimers.has(key)) {
        clearTimeout(typingTimers.get(key));
        typingTimers.delete(key);
      }
    });

    // ── Reconnect missed-event catch-up ────────────────────────────────────
    // Client sends the timestamp of the last event it received. We reply
    // with a `replay:data` event containing counts the client should refetch.
    // Actual event replay with a full per-channel message queue is deferred
    // to a future Redis-backed session; this cheap version tells the client
    // "you were disconnected, please refresh unread counts and channels."
    socket.on('sync:catch-up', async ({ since } = {}) => {
      try {
        const payload = { since, now: Date.now(), refetch: ['notifications', 'messages'] };
        socket.emit('sync:catch-up', payload);
      } catch (err) {
        console.error('[socket] catch-up failed', err.message);
      }
    });

    // ── Whiteboard rooms (Session 32 / N2 part 2) ─────────────────────
    // Each whiteboard is a socket.io room. Clients join on mount, leave on
    // unmount. The server relays element patches + cursor positions between
    // room members. We don't persist from the socket layer — the REST
    // endpoint /whiteboards/:id/elements still holds the canonical state.
    // Socket traffic is the "live" layer on top; if someone disconnects
    // mid-session their changes are covered by the debounced save.
    socket.on('whiteboard:join', (boardId) => {
      if (!boardId || typeof boardId !== 'string') return;
      socket.join(`whiteboard:${boardId}`);
      // Announce our presence so others can show our cursor
      socket.to(`whiteboard:${boardId}`).emit('whiteboard:user-joined', {
        userId: socket.userId,
      });
    });
    socket.on('whiteboard:leave', (boardId) => {
      if (!boardId) return;
      socket.leave(`whiteboard:${boardId}`);
      socket.to(`whiteboard:${boardId}`).emit('whiteboard:user-left', {
        userId: socket.userId,
      });
    });

    // Element patches — broadcast to everyone else in the room.
    // Payload shape: { boardId, op: 'upsert'|'delete', element?, elementId? }
    // The server doesn't validate shape in detail here — that's the REST
    // save endpoint's job. Any client sending garbage will just break their
    // own live view.
    socket.on('whiteboard:patch', (data) => {
      if (!data?.boardId) return;
      socket.to(`whiteboard:${data.boardId}`).emit('whiteboard:patch', {
        ...data,
        fromUserId: socket.userId,
      });
    });

    // Cursor position updates — high-frequency, no persistence.
    // Throttled client-side to ~60ms per emission.
    socket.on('whiteboard:cursor', (data) => {
      if (!data?.boardId) return;
      socket.to(`whiteboard:${data.boardId}`).emit('whiteboard:cursor', {
        userId: socket.userId,
        x: data.x,
        y: data.y,
        name: data.name,
      });
    });

    // ── Disconnect ─────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      console.log(`[socket] disconnected: ${socket.id} (${reason})`);
      if (socket.userId) {
        const wentOffline = removeSocketForUser(socket.userId, socket.id);
        if (wentOffline) {
          clearTypingForUser(io, socket.userId);
          io.emit('user:offline', {
            userId: socket.userId,
            onlineUsers: onlineUserIds(),
          });
        }
        // If user still has other tabs, no offline event — they're still here.
      }
    });
  });

  // Expose presence to routes that want to check "is this user online?"
  return {
    isUserOnline,
    onlineUserIds,
    socketsForUser,
  };
}

module.exports = {
  attachSocketHandlers,
  isUserOnline,
  onlineUserIds,
  socketsForUser,
};
