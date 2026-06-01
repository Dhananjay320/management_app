require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
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
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false
}));
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files — handles special characters in filenames
const fs = require('fs');
app.use('/uploads', (req, res, next) => {
  // Try decoded path first, then raw path
  const decodedPath = path.join(__dirname, 'uploads', decodeURIComponent(req.path));
  const rawPath = path.join(__dirname, 'uploads', req.path);

  if (fs.existsSync(decodedPath)) {
    return res.sendFile(decodedPath);
  }
  if (fs.existsSync(rawPath)) {
    return res.sendFile(rawPath);
  }

  // Try listing directory and finding a fuzzy match (handles encoding mismatches)
  const dir = path.dirname(decodedPath);
  const targetName = path.basename(decodedPath);
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir);
    // Find file that matches when normalized (strip non-ASCII differences)
    const match = files.find(f => {
      if (f === targetName) return true;
      // Compare by timestamp prefix (first part before first dash)
      const targetPrefix = targetName.split('-')[0];
      const filePrefix = f.split('-')[0];
      return targetPrefix === filePrefix && targetPrefix.length > 8;
    });
    if (match) {
      return res.sendFile(path.join(dir, match));
    }
  }

  next();
}, express.static(path.join(__dirname, 'uploads')));

// Connect to MongoDB
connectDB();

// Start deep search background worker
const { startDeepSearchWorker } = require('./utils/deepSearchWorker');
const { startSchedulers } = require('./utils/schedulers');
const { startCleanupJob } = require('./utils/cleanupJob');

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
app.use('/api/v1/whiteboards', require('./routes/whiteboards'));
app.use('/api/v1/escalations', require('./routes/escalations'));
app.use('/api/v1/push', require('./routes/push'));
app.use('/api/v1/reports', require('./routes/reports'));
app.use('/api/v1/pending-actions', require('./routes/pendingActions'));
app.use('/api/v1/monitoring', require('./routes/monitoring'));

app.use('/api/v1/sys', require('./routes/core'));

// Health check
app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve React frontend from /public if it exists
const publicPath = path.join(__dirname, 'public');
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
  // Catch-all: send index.html for any non-API route (React Router)
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/') && !req.path.startsWith('/uploads/') && !req.path.startsWith('/socket.io')) {
      res.sendFile(path.join(publicPath, 'index.html'));
    }
  });
}

// Socket.io connection handling
// Multi-socket presence: a single user can be on multiple tabs/devices.
// Map<userId, Set<socketId>> — user is "online" while any socket is alive.
const onlineUsers = new Map();
const isOnline = (userId) => onlineUsers.has(userId) && onlineUsers.get(userId).size > 0;
const broadcastPresence = (eventName, userId) => {
  io.emit(eventName, { userId, onlineUsers: Array.from(onlineUsers.keys()).filter(isOnline) });
};

// Bells deliberately do NOT auto-replay on socket reconnect. If a user is
// offline at the moment the bell fires, they don't get a late delivery.
// Refresh during the ring is handled entirely client-side via localStorage —
// the server is fire-and-forget.

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on('user:online', (userId) => {
    socket.userId = userId;
    socket.join(`user:${userId}`);
    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId).add(socket.id);
    broadcastPresence('user:online', userId);
  });

  // Cross-tab sync: when one tab stops the bell, propagate to the user's
  // other tabs so the ring stops everywhere. No server state involved.
  socket.on('bell:stop', () => {
    if (socket.userId) {
      socket.to(`user:${socket.userId}`).emit('bell:stopped');
    }
  });

  // Heartbeat — clients can ping to confirm they're still alive.
  // If a socket goes silent for too long the disconnect event fires anyway,
  // so this is more of a sanity ping.
  socket.on('user:ping', () => {
    if (socket.userId) {
      if (!onlineUsers.has(socket.userId)) onlineUsers.set(socket.userId, new Set());
      onlineUsers.get(socket.userId).add(socket.id);
    }
  });

  // Join a channel room for real-time messages
  socket.on('channel:join', (channelId) => {
    socket.join(`channel:${channelId}`);
  });

  socket.on('channel:leave', (channelId) => {
    socket.leave(`channel:${channelId}`);
  });

  socket.on('user:typing', (data) => {
    socket.to(`channel:${data.channelId}`).emit('user:typing', {
      userId: data.userId,
      name: data.name,
      channelId: data.channelId
    });
  });

  socket.on('user:stop-typing', (data) => {
    socket.to(`channel:${data.channelId}`).emit('user:stop-typing', {
      userId: data.userId,
      channelId: data.channelId
    });
  });

  // Whiteboard real-time events
  socket.on('whiteboard:join', (boardId) => socket.join(`wb:${boardId}`));
  socket.on('whiteboard:leave', (boardId) => socket.leave(`wb:${boardId}`));
  socket.on('whiteboard:shape-update', (data) => socket.to(`wb:${data.boardId}`).emit('whiteboard:shape-update', data));
  socket.on('whiteboard:cursor', (data) => socket.to(`wb:${data.boardId}`).emit('whiteboard:cursor', data));

  socket.on('disconnect', () => {
    if (socket.userId) {
      const set = onlineUsers.get(socket.userId);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) {
          onlineUsers.delete(socket.userId);
          broadcastPresence('user:offline', socket.userId);
        }
        // If they still have other tabs open, do NOT mark them offline
      }
    }
  });
});

// Expose online users to routes
app.set('onlineUsers', onlineUsers);

// REST snapshot — used on app mount before sockets sync the full list
app.get('/api/v1/presence/online', (req, res) => {
  res.json({ onlineUsers: Array.from(onlineUsers.keys()).filter(uid => onlineUsers.get(uid)?.size > 0) });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Niyoq server running on port ${PORT}`);
  startDeepSearchWorker(io);
  startSchedulers(io);
  startCleanupJob();
});
