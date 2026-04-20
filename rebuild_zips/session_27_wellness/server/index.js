require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const { Server } = require('socket.io');
const connectDB = require('./config/db');

const app = express();
const server = http.createServer(app);

// Socket.io — single server setup (sufficient for 15-20 users)
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Make io accessible to routes
app.set('io', io);

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Connect to MongoDB
connectDB();

// Start deep search background worker
const { startDeepSearchWorker } = require('./utils/deepSearchWorker');
const { startSchedulers } = require('./utils/schedulers');
const { startCleanupJob } = require('./utils/cleanupJob');
// Session 24 (N3): scheduled messages worker.
const { startScheduledMessagesWorker } = require('./utils/scheduledMessagesWorker');

// API Routes
app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1/users', require('./routes/users'));
app.use('/api/v1/security', require('./routes/security'));
app.use('/api/v1/teams', require('./routes/teams'));
app.use('/api/v1/attendance', require('./routes/attendance'));
app.use('/api/v1/calendar', require('./routes/calendar'));
app.use('/api/v1/messages', require('./routes/messages'));
app.use('/api/v1/tasks', require('./routes/tasks'));
app.use('/api/v1/workspace', require('./routes/workspace'));
app.use('/api/v1/meetings', require('./routes/meetings'));
app.use('/api/v1/email', require('./routes/email'));
app.use('/api/v1/sticky-notes', require('./routes/stickyNotes'));
app.use('/api/v1/activities', require('./routes/activities'));
app.use('/api/v1/feed', require('./routes/feed'));
app.use('/api/v1/salary', require('./routes/salary'));
app.use('/api/v1/notifications', require('./routes/notifications'));
app.use('/api/v1/search', require('./routes/search'));
app.use('/api/v1/ai', require('./routes/ai'));
app.use('/api/v1/onboarding', require('./routes/onboarding'));
app.use('/api/v1/announcements', require('./routes/announcements'));
// Session 24 (N3): scheduled messages.
app.use('/api/v1/scheduled-messages', require('./routes/scheduledMessages'));
// Session 25 (N4): user-to-user follows.
app.use('/api/v1/follows', require('./routes/follows'));
// Session 27 (N6): wellness — daily quote, meditation, mood check-in.
app.use('/api/v1/wellness', require('./routes/wellness'));

app.use('/api/v1/sys', require('./routes/core'));

// Health check
app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Socket.IO ────────────────────────────────────────────────────────────
// Session 13: socket handling delegated to utils/socketManager, which
// handles multi-tab presence, typing timeouts, and reconnect catch-up.
const { attachSocketHandlers, onlineUserIds, isUserOnline, socketsForUser } =
  require('./utils/socketManager');

attachSocketHandlers(io);

// Expose presence helpers to routes that want to check online status.
// Legacy `app.set('onlineUsers', ...)` kept as a Map-like for any existing
// consumers, but prefer the helpers for new code.
app.set('isUserOnline', isUserOnline);
app.set('onlineUserIds', onlineUserIds);
app.set('socketsForUser', socketsForUser);
// Legacy Map shim — old code that did `onlineUsers.has(id)` still works.
app.set('onlineUsers', {
  has: (id) => isUserOnline(id),
  keys: () => onlineUserIds()[Symbol.iterator](),
  get size() { return onlineUserIds().length; },
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Avadeti Team server running on port ${PORT}`);
  startDeepSearchWorker(io);
  startSchedulers(io);
  startCleanupJob();
  // Session 24 (N3): scheduled messages worker.
  startScheduledMessagesWorker(io);

  // Session 6: start real IMAP polling for incoming email.
  // Opt-out via ENABLE_IMAP_POLLER=false — useful in dev where no IMAP servers exist.
  if (process.env.ENABLE_IMAP_POLLER !== 'false') {
    try {
      const { startImapPoller } = require('./utils/emailTransport');
      const intervalMs = Number(process.env.IMAP_POLL_INTERVAL_MS) || 5 * 60 * 1000;
      startImapPoller({ intervalMs, io });
    } catch (err) {
      console.error('[email] Failed to start IMAP poller:', err.message);
    }
  }
});
