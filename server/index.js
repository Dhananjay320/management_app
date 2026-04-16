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

// Health check
app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.io connection handling
const onlineUsers = new Map(); // userId -> socketId

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on('user:online', (userId) => {
    socket.userId = userId;
    socket.join(`user:${userId}`);
    onlineUsers.set(userId, socket.id);
    io.emit('user:online', { userId, onlineUsers: Array.from(onlineUsers.keys()) });
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

  socket.on('disconnect', () => {
    if (socket.userId) {
      onlineUsers.delete(socket.userId);
      io.emit('user:offline', { userId: socket.userId, onlineUsers: Array.from(onlineUsers.keys()) });
    }
  });
});

// Expose online users to routes
app.set('onlineUsers', onlineUsers);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Avadeti Team server running on port ${PORT}`);
});
