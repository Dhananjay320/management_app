const router = require('express').Router();
const Channel = require('../models/Channel');
const Message = require('../models/Message');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');

// GET /api/v1/messages/channels — all channels/conversations for current user
router.get('/channels', protect, async (req, res) => {
  try {
    const channels = await Channel.find({
      members: req.user._id,
      isActive: true
    })
      .populate('members', 'name email avatar')
      .populate('lastMessage')
      .sort({ lastMessageAt: -1 });

    // Get unread counts
    const result = await Promise.all(channels.map(async (ch) => {
      const unread = await Message.countDocuments({
        channel: ch._id,
        readBy: { $ne: req.user._id },
        sender: { $ne: req.user._id },
        isDeleted: false
      });
      return { ...ch.toObject(), unreadCount: unread };
    }));

    res.json(result);
  } catch (err) {
    console.error('Get channels error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/messages/channels — create channel/room/group
router.post('/channels', protect, async (req, res) => {
  try {
    const { name, type, description, members, isPrivate } = req.body;

    // Room creation requires power
    if (type === 'room' && !req.user.hasPower('messaging', 'createRooms') && req.user.role !== 'main_admin') {
      return res.status(403).json({ error: 'You do not have permission to create rooms.' });
    }
    // Public channel creation requires power
    if (type === 'channel' && !isPrivate && !req.user.hasPower('messaging', 'createPublicChannels') && req.user.role !== 'main_admin') {
      return res.status(403).json({ error: 'You do not have permission to create public channels.' });
    }

    const memberIds = members || [];
    if (!memberIds.map(m => m.toString()).includes(req.user._id.toString())) {
      memberIds.push(req.user._id);
    }

    const channel = await Channel.create({
      name,
      type: type || 'channel',
      description,
      members: memberIds,
      admins: [req.user._id],
      createdBy: req.user._id,
      isPrivate: isPrivate || type === 'room'
    });

    // System message
    await Message.create({
      channel: channel._id,
      sender: req.user._id,
      content: `${req.user.name} created ${type === 'room' ? 'room' : type === 'group' ? 'group' : 'channel'} "${name}"`,
      type: 'system'
    });

    const populated = await Channel.findById(channel._id).populate('members', 'name email avatar');
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/messages/dm — create or get DM conversation
router.post('/dm', protect, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required.' });

    const isSelf = String(userId) === String(req.user._id);

    // Self-DM: a personal "saved messages" channel — single member, type 'dm'
    if (isSelf) {
      let channel = await Channel.findOne({ type: 'dm', members: { $all: [req.user._id], $size: 1 } });
      if (!channel) {
        channel = await Channel.create({
          name: `📌 Saved (${req.user.name})`,
          type: 'dm',
          members: [req.user._id],
          createdBy: req.user._id
        });
      }
      const populated = await Channel.findById(channel._id).populate('members', 'name email avatar');
      return res.json(populated);
    }

    // Check if DM already exists between two users
    const existing = await Channel.findOne({
      type: 'dm',
      members: { $all: [req.user._id, userId], $size: 2 }
    }).populate('members', 'name email avatar');

    if (existing) return res.json(existing);

    const otherUser = await User.findById(userId).select('name');
    const channel = await Channel.create({
      name: `DM: ${req.user.name} & ${otherUser.name}`,
      type: 'dm',
      members: [req.user._id, userId],
      createdBy: req.user._id
    });

    const populated = await Channel.findById(channel._id).populate('members', 'name email avatar');
    res.status(201).json(populated);
  } catch (err) {
    console.error('DM creation error:', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// GET /api/v1/messages/:channelId — get messages for a channel
router.get('/:channelId', protect, async (req, res) => {
  try {
    const { before, limit = 50 } = req.query;

    const channel = await Channel.findById(req.params.channelId);
    if (!channel || !channel.members.some(m => m.toString() === req.user._id.toString())) {
      return res.status(403).json({ error: 'Not a member of this channel.' });
    }

    let query = { channel: req.params.channelId, isDeleted: false, parentMessage: null };
    if (before) query.createdAt = { $lt: new Date(before) };

    const messages = await Message.find(query)
      .populate('sender', 'name email avatar')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    // Mark as read
    await Message.updateMany(
      { channel: req.params.channelId, readBy: { $ne: req.user._id } },
      { $addToSet: { readBy: req.user._id } }
    );

    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/messages/:channelId — send message
router.post('/:channelId([a-fA-F0-9]{24})', protect, async (req, res) => {
  try {
    const { content, type, file, parentMessage, mentions } = req.body;

    const channel = await Channel.findById(req.params.channelId);
    if (!channel || !channel.members.some(m => m.toString() === req.user._id.toString())) {
      return res.status(403).json({ error: 'Not a member of this channel.' });
    }

    // #announcements restriction — only users with announcement power can post
    if (channel.name === '#announcements' || channel.name === 'announcements') {
      if (!req.user.hasPower('messaging', 'postAnnouncements') && req.user.role !== 'main_admin') {
        return res.status(403).json({ error: 'Only users with announcement permission can post in this channel.' });
      }
    }

    const message = await Message.create({
      channel: req.params.channelId,
      sender: req.user._id,
      content,
      type: type || 'text',
      file,
      parentMessage,
      mentions: mentions || [],
      readBy: [req.user._id]
    });

    // Update channel lastMessage
    channel.lastMessage = message._id;
    channel.lastMessageAt = new Date();
    await channel.save();

    // If reply, increment parent reply count
    if (parentMessage) {
      await Message.findByIdAndUpdate(parentMessage, { $inc: { replyCount: 1 } });
    }

    const populated = await Message.findById(message._id).populate('sender', 'name email avatar');

    // Async link-preview unfurl (fire-and-forget). When the OG fetch finishes
    // we update the message + emit a socket event so all clients render the card.
    if (type === 'text' || !type) {
      const { fetchPreview, extractFirstUrl } = require('../utils/linkPreview');
      const url = extractFirstUrl(content);
      if (url) {
        (async () => {
          const preview = await fetchPreview(url);
          if (!preview) return;
          await Message.findByIdAndUpdate(message._id, { linkPreview: preview });
          const ioLocal = req.app.get('io');
          if (ioLocal) {
            const updated = await Message.findById(message._id).populate('sender', 'name email avatar');
            ioLocal.to(`channel:${req.params.channelId}`).emit('message:updated', updated);
          }
        })().catch(() => {});
      }
    }

    // Emit via socket
    const io = req.app.get('io');
    if (io) {
      io.to(`channel:${req.params.channelId}`).emit('message:received', populated);

      // Notify mentioned users
      if (mentions?.length) {
        mentions.forEach(uid => {
          io.to(`user:${uid}`).emit('notification:new', {
            type: 'mention',
            title: `${req.user.name} mentioned you`,
            message: content.substring(0, 100),
            channelId: req.params.channelId,
            entityType: 'channel',
            entityId: req.params.channelId
          });
        });
      }
    }

    // Create notification documents for all channel members (except sender)
    const recipients = (channel.members || []).filter(m => m.toString() !== req.user._id.toString());
    const notifTitle = channel.type === 'dm' ? `New message from ${req.user.name}` : `New message in ${channel.name}`;
    const notifMsg = (content || '').substring(0, 100);
    for (const uid of recipients) {
      await Notification.create({
        user: uid,
        type: 'message',
        title: notifTitle,
        message: notifMsg,
        entityType: 'channel',
        entityId: channel._id,
        sender: req.user._id
      }).catch(() => {});
      // Also emit a socket event so Electron desktop app (which doesn't get web push)
      // can show a native OS notification via the renderer's Notification API.
      if (io) {
        io.to(`user:${uid}`).emit('notification:new', {
          type: 'message',
          title: notifTitle,
          message: notifMsg,
          entityType: 'channel',
          entityId: channel._id
        });
      }
    }

    res.status(201).json(populated);
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/messages/:channelId/:messageId/react
router.post('/:channelId/:messageId/react', protect, async (req, res) => {
  try {
    const { emoji } = req.body;
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ error: 'Message not found.' });

    const existing = message.reactions.find(r => r.emoji === emoji);
    if (existing) {
      if (existing.users.some(u => u.toString() === req.user._id.toString())) {
        existing.users = existing.users.filter(u => u.toString() !== req.user._id.toString());
        if (existing.users.length === 0) {
          message.reactions = message.reactions.filter(r => r.emoji !== emoji);
        }
      } else {
        existing.users.push(req.user._id);
      }
    } else {
      message.reactions.push({ emoji, users: [req.user._id] });
    }
    await message.save();

    const io = req.app.get('io');
    if (io) io.to(`channel:${req.params.channelId}`).emit('message:reaction', { messageId: message._id, reactions: message.reactions });

    res.json(message.reactions);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/messages/:channelId/:messageId/pin
router.post('/:channelId/:messageId/pin', protect, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    message.isPinned = !message.isPinned;
    await message.save();

    if (message.isPinned) {
      await Channel.findByIdAndUpdate(req.params.channelId, { $addToSet: { pinnedMessages: message._id } });
    } else {
      await Channel.findByIdAndUpdate(req.params.channelId, { $pull: { pinnedMessages: message._id } });
    }

    res.json({ pinned: message.isPinned });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/messages/broadcast — send broadcast (one msg → separate DMs)
router.post('/broadcast', protect, async (req, res) => {
  try {
    const { userIds, content, visibility } = req.body;
    // visibility: 'visible' (recipients see each other) or 'hidden' (BCC style)
    if (!userIds?.length || !content?.trim()) {
      return res.status(400).json({ error: 'userIds and content required.' });
    }

    const results = [];
    for (const userId of userIds) {
      // Find or create DM with each recipient
      let dm = await Channel.findOne({
        type: 'dm',
        members: { $all: [req.user._id, userId], $size: 2 }
      });

      if (!dm) {
        const otherUser = await User.findById(userId).select('name');
        dm = await Channel.create({
          name: `DM: ${req.user.name} & ${otherUser.name}`,
          type: 'dm',
          members: [req.user._id, userId],
          createdBy: req.user._id
        });
      }

      const message = await Message.create({
        channel: dm._id,
        sender: req.user._id,
        content: content.trim(),
        type: 'text',
        readBy: [req.user._id],
        isBroadcast: true,
        broadcastVisibility: visibility || 'hidden'
      });

      dm.lastMessage = message._id;
      dm.lastMessageAt = new Date();
      await dm.save();

      const io = req.app.get('io');
      if (io) {
        const populated = await Message.findById(message._id).populate('sender', 'name email avatar');
        io.to(`user:${userId}`).emit('message:received', populated);
      }

      results.push({ userId, channelId: dm._id, messageId: message._id });
    }

    res.status(201).json({ sent: results.length, results });
  } catch (err) {
    console.error('Broadcast error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/messages/:channelId/task — create task from chat message
router.post('/:channelId/task', protect, async (req, res) => {
  try {
    const { title, assignees, priority, deadline, description, messageId } = req.body;
    const Task = require('../models/Task');

    const task = await Task.create({
      title,
      assignees: assignees || [req.user._id],
      priority: priority || 'medium',
      deadline: deadline ? new Date(deadline) : undefined,
      description: description || '',
      createdBy: req.user._id,
      linkedChat: req.params.channelId,
      linkedMessage: messageId
    });

    // Post system message in chat
    await Message.create({
      channel: req.params.channelId,
      sender: req.user._id,
      content: `${req.user.name} created task "${title}" from this conversation`,
      type: 'system'
    });

    // Notify assignees
    const io = req.app.get('io');
    if (io) {
      (assignees || []).forEach(uid => {
        if (uid !== req.user._id.toString()) {
          io.to(`user:${uid}`).emit('notification:new', {
            type: 'task', title: 'New Task from Chat',
            message: `${req.user.name} assigned you "${title}"`,
            entityType: 'task', entityId: task._id
          });
        }
      });
    }

    res.status(201).json(task);
  } catch (err) {
    console.error('Create task from chat error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/messages/:channelId/read — mark all messages in a channel as read for current user
router.post('/:channelId/read', protect, async (req, res) => {
  try {
    await Message.updateMany(
      { channel: req.params.channelId, readBy: { $ne: req.user._id } },
      { $addToSet: { readBy: req.user._id } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/messages/:channelId/:messageId/read-receipts — who has seen
router.get('/:channelId/:messageId/read-receipts', protect, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId)
      .populate('readBy', 'name avatar');
    if (!message) return res.status(404).json({ error: 'Message not found.' });
    res.json({ readBy: message.readBy, count: message.readBy.length });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/messages/:channelId/:messageId — edit message (sender only)
router.put('/:channelId/:messageId', protect, async (req, res) => {
  try {
    const { content } = req.body;
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ error: 'Message not found.' });
    if (message.sender.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Can only edit your own messages.' });
    }

    message.content = content;
    message.isEdited = true;
    await message.save();

    const populated = await Message.findById(message._id).populate('sender', 'name email avatar');
    const io = req.app.get('io');
    if (io) io.to(`channel:${req.params.channelId}`).emit('message:edited', populated);

    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/v1/messages/:channelId/:messageId — delete message (sender or admin)
router.post('/forward', protect, async (req, res) => {
  try {
    const { messageId, targetChannelIds, note } = req.body;
    if (!messageId || !Array.isArray(targetChannelIds) || targetChannelIds.length === 0) {
      return res.status(400).json({ error: 'messageId and targetChannelIds required.' });
    }
    const original = await Message.findById(messageId).populate('sender', 'name');
    if (!original) return res.status(404).json({ error: 'Source message not found.' });

    // Source channel — must be member
    const srcChannel = await Channel.findById(original.channel);
    if (!srcChannel?.members?.some(m => String(m) === String(req.user._id))) {
      return res.status(403).json({ error: 'You don\'t have access to forward this message.' });
    }

    const results = [];
    const io = req.app.get('io');
    for (const targetId of targetChannelIds) {
      const target = await Channel.findById(targetId);
      if (!target) { results.push({ targetId, error: 'Channel not found' }); continue; }
      if (!target.members.some(m => String(m) === String(req.user._id))) {
        results.push({ targetId, error: 'Not a member of target channel' }); continue;
      }

      const forwardedHeader = `➤ Forwarded from ${original.sender?.name || 'someone'}`;
      const newContent = [forwardedHeader, note?.trim(), original.content].filter(Boolean).join('\n\n');

      const fwd = await Message.create({
        channel: target._id,
        sender: req.user._id,
        content: newContent,
        type: original.type === 'task_card' ? 'text' : (original.type || 'text'),
        file: original.file,
        linkPreview: original.linkPreview,
        readBy: [req.user._id],
        // Track the source for "see original" feature later
        forwardedFrom: original._id
      });

      target.lastMessage = fwd._id;
      target.lastMessageAt = new Date();
      await target.save();

      const populated = await Message.findById(fwd._id).populate('sender', 'name email avatar');
      if (io) io.to(`channel:${target._id}`).emit('message:received', populated);

      // Notify recipients via DB notification (post-save hook pushes)
      const recipients = (target.members || []).filter(m => String(m) !== String(req.user._id));
      const notifTitle = target.type === 'dm' ? `Forwarded message from ${req.user.name}` : `Forwarded in ${target.name}`;
      for (const uid of recipients) {
        await Notification.create({
          user: uid, type: 'message',
          title: notifTitle,
          message: (newContent || '').substring(0, 100),
          entityType: 'channel', entityId: target._id, sender: req.user._id
        }).catch(() => {});
      }

      results.push({ targetId: target._id, messageId: fwd._id });
    }
    res.status(201).json({ forwarded: results.length, results });
  } catch (err) {
    console.error('Forward message error:', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// DELETE /api/v1/messages/channels/:channelId — delete an entire channel
// Allowed: creator, main_admin, or system account
router.delete('/channels/:channelId', protect, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found.' });

    const isMainAdmin = req.user.role === 'main_admin' || req.user._c;
    const isCreator = channel.createdBy?.toString() === req.user._id.toString();
    if (!isMainAdmin && !isCreator) {
      return res.status(403).json({ error: 'Only the channel creator or main admin can delete a channel.' });
    }
    // Don't allow deleting DMs (they're personal — just hide)
    if (channel.type === 'dm') {
      return res.status(400).json({ error: 'DMs cannot be deleted; archive or hide them instead.' });
    }

    // Delete all messages in the channel + the channel itself
    await Message.deleteMany({ channel: channel._id });
    await Channel.deleteOne({ _id: channel._id });

    const io = req.app.get('io');
    if (io) io.to(`channel:${channel._id}`).emit('channel:deleted', { channelId: channel._id });

    res.json({ ok: true, deletedChannelId: channel._id });
  } catch (err) {
    console.error('Delete channel error:', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

router.delete('/:channelId/:messageId', protect, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ error: 'Message not found.' });

    const isSender = message.sender.toString() === req.user._id.toString();
    const isAdmin = ['main_admin', 'admin'].includes(req.user.role);
    if (!isSender && !isAdmin) {
      return res.status(403).json({ error: 'Cannot delete this message.' });
    }

    message.isDeleted = true;
    message.content = 'This message has been deleted.';
    await message.save();

    const io = req.app.get('io');
    if (io) io.to(`channel:${req.params.channelId}`).emit('message:deleted', { messageId: message._id });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/messages/:channelId/:messageId/replies — get thread replies
router.get('/:channelId/:messageId/replies', protect, async (req, res) => {
  try {
    const replies = await Message.find({
      channel: req.params.channelId,
      parentMessage: req.params.messageId,
      isDeleted: false
    })
      .populate('sender', 'name email avatar')
      .sort({ createdAt: 1 });
    res.json(replies);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/messages/:channelId/pinned — get pinned messages
router.get('/:channelId/pinned', protect, async (req, res) => {
  try {
    const messages = await Message.find({
      channel: req.params.channelId,
      isPinned: true,
      isDeleted: false
    })
      .populate('sender', 'name email avatar')
      .sort({ createdAt: -1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/messages/:channelId/search — search messages within a channel
router.get('/:channelId/search', protect, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);

    const messages = await Message.find({
      channel: req.params.channelId,
      content: { $regex: q, $options: 'i' },
      isDeleted: false
    })
      .populate('sender', 'name email avatar')
      .sort({ createdAt: -1 })
      .limit(20);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/messages/:channelId/upload — file upload in chat
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const chatUploadDir = path.join(__dirname, '..', 'uploads', 'chat');
if (!fs.existsSync(chatUploadDir)) fs.mkdirSync(chatUploadDir, { recursive: true });

const chatStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, chatUploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const chatUpload = multer({ storage: chatStorage, limits: { fileSize: 50 * 1024 * 1024 } });

router.post('/:channelId/upload', protect, chatUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file.' });

    const channel = await Channel.findById(req.params.channelId);
    if (!channel || !channel.members.some(m => m.toString() === req.user._id.toString())) {
      return res.status(403).json({ error: 'Not a member.' });
    }

    const message = await Message.create({
      channel: req.params.channelId,
      sender: req.user._id,
      content: req.body.content || '',
      type: 'file',
      file: {
        name: req.file.originalname,
        originalSize: req.file.size,
        compressedSize: req.file.size,
        mimeType: req.file.mimetype,
        path: 'uploads/chat/' + req.file.filename
      },
      readBy: [req.user._id]
    });

    channel.lastMessage = message._id;
    channel.lastMessageAt = new Date();
    await channel.save();

    const populated = await Message.findById(message._id).populate('sender', 'name email avatar');
    const io = req.app.get('io');
    if (io) io.to(`channel:${req.params.channelId}`).emit('message:received', populated);

    // Notification fanout — same as text messages (DB row triggers push hook)
    const fileLabel = req.file.mimetype?.startsWith('image/') ? '🖼️ Image' :
      req.file.mimetype?.startsWith('video/') ? '🎬 Video' :
      req.file.mimetype === 'application/pdf' ? '📕 PDF' :
      '📎 File';
    const recipients = (channel.members || []).filter(m => m.toString() !== req.user._id.toString());
    const notifTitle = channel.type === 'dm' ? `${fileLabel} from ${req.user.name}` : `${fileLabel} in ${channel.name}`;
    const captionSnippet = (req.body.content || '').trim().substring(0, 80);
    const notifMsg = captionSnippet || req.file.originalname;
    for (const uid of recipients) {
      await Notification.create({
        user: uid,
        type: 'message',
        title: notifTitle,
        message: notifMsg,
        entityType: 'channel',
        entityId: channel._id,
        sender: req.user._id
      }).catch(() => {});
      if (io) {
        io.to(`user:${uid}`).emit('notification:new', {
          type: 'message',
          title: notifTitle,
          message: notifMsg,
          entityType: 'channel',
          entityId: channel._id
        });
      }
    }

    res.status(201).json(populated);
  } catch (err) {
    console.error('Chat file upload error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/messages/:channelId/files — list files shared in channel
router.get('/:channelId/files', protect, async (req, res) => {
  try {
    const messages = await Message.find({
      channel: req.params.channelId,
      type: 'file',
      isDeleted: false
    })
      .populate('sender', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/messages/:channelId/members
router.get('/:channelId/members', protect, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.channelId).populate('members', 'name email avatar jobTitle');
    res.json(channel.members);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/messages/:channelId/members — add members to channel
router.post('/:channelId/members', protect, async (req, res) => {
  try {
    const { userIds } = req.body;
    if (!userIds?.length) return res.status(400).json({ error: 'userIds required.' });

    const channel = await Channel.findById(req.params.channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found.' });

    // DMs are always 1-1 — never allow adding members (would turn them into a group)
    if (channel.type === 'dm') {
      return res.status(400).json({ error: 'Cannot add members to a DM. Create a Group chat instead.' });
    }

    // Only channel members or admins can add
    const isMember = channel.members.some(m => m.toString() === req.user._id.toString());
    const isAdmin = ['main_admin', 'admin'].includes(req.user.role);
    if (!isMember && !isAdmin) return res.status(403).json({ error: 'Not a member of this channel.' });

    const newMembers = userIds.filter(id => !channel.members.some(m => m.toString() === id));
    if (newMembers.length === 0) return res.status(400).json({ error: 'All users are already members.' });

    channel.members.push(...newMembers);
    await channel.save();

    // Send system message
    const User = require('../models/User');
    const addedUsers = await User.find({ _id: { $in: newMembers } }).select('name');
    const names = addedUsers.map(u => u.name).join(', ');
    await Message.create({
      channel: channel._id, sender: req.user._id,
      content: `${req.user.name} added ${names} to the channel`,
      type: 'system'
    });

    const populated = await Channel.findById(channel._id).populate('members', 'name email avatar jobTitle');
    res.json(populated.members);
  } catch (err) {
    console.error('Add member error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/v1/messages/:channelId/members/:userId — remove member
router.delete('/:channelId/members/:userId', protect, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found.' });

    channel.members = channel.members.filter(m => m.toString() !== req.params.userId);
    await channel.save();

    await Message.create({
      channel: channel._id, sender: req.user._id,
      content: `A member was removed from the channel`,
      type: 'system'
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/messages/broadcast — send broadcast message (BCC-style per spec Section 6.1.3)
router.post('/broadcast/send', protect, async (req, res) => {
  try {
    const { content, recipientIds, visibility = 'hidden' } = req.body;
    if (!content || !recipientIds?.length) return res.status(400).json({ error: 'Content and recipients required.' });

    const results = [];
    for (const recipientId of recipientIds) {
      // Create or get DM with each recipient
      let dm = await Channel.findOne({ type: 'dm', members: { $all: [req.user._id, recipientId], $size: 2 } });
      if (!dm) {
        const otherUser = await User.findById(recipientId).select('name');
        dm = await Channel.create({
          name: `DM: ${req.user.name} & ${otherUser.name}`,
          type: 'dm', members: [req.user._id, recipientId], createdBy: req.user._id
        });
      }

      const msg = await Message.create({
        channel: dm._id, sender: req.user._id, content,
        type: 'text', readBy: [req.user._id],
        isBroadcast: true, broadcastVisibility: visibility
      });

      dm.lastMessage = msg._id;
      dm.lastMessageAt = new Date();
      await dm.save();

      const io = req.app.get('io');
      if (io) {
        const populated = await Message.findById(msg._id).populate('sender', 'name email avatar');
        io.to(`user:${recipientId}`).emit('message:received', populated);
      }
      results.push({ recipientId, messageId: msg._id });
    }

    res.status(201).json({ message: `Broadcast sent to ${results.length} recipients.`, results });
  } catch (err) {
    console.error('Broadcast error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/messages/:channelId/:messageId/create-task — create task from chat message
router.post('/:channelId/:messageId/create-task', protect, async (req, res) => {
  try {
    const { title, priority, deadline, assignees, description } = req.body;
    const message = await Message.findById(req.params.messageId).populate('sender', 'name');
    if (!message) return res.status(404).json({ error: 'Message not found.' });

    const Task = require('../models/Task');
    const task = await Task.create({
      title: title || message.content.substring(0, 100),
      description: description || `Created from chat message by ${message.sender?.name}: "${message.content}"`,
      assignees: assignees?.length ? assignees : [req.user._id],
      priority: priority || 'medium',
      deadline: deadline ? new Date(deadline) : undefined,
      createdBy: req.user._id,
      sourceType: 'chat',
      sourceId: message._id,
      linkedChat: req.params.channelId,
      activity: [{ user: req.user._id, action: 'created', detail: 'Created from chat message' }]
    });

    // Notify assignees
    const io = req.app.get('io');
    if (io) {
      (assignees || []).forEach(uid => {
        if (uid.toString() !== req.user._id.toString()) {
          io.to(`user:${uid}`).emit('notification:new', {
            type: 'task', title: 'New task from chat',
            message: `${req.user.name} created task: "${task.title}"`,
            entityType: 'task', entityId: task._id
          });
        }
      });
    }

    const populated = await Task.findById(task._id).populate('assignees', 'name email avatar');
    res.status(201).json(populated);
  } catch (err) {
    console.error('Create task from chat error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/messages/:channelId/:messageId/add-to-calendar — add message as calendar event
router.post('/:channelId/:messageId/add-to-calendar', protect, async (req, res) => {
  try {
    const { date, startTime, title } = req.body;
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ error: 'Message not found.' });

    const CalendarEvent = require('../models/CalendarEvent');
    const event = await CalendarEvent.create({
      title: title || message.content.substring(0, 100),
      type: 'custom',
      date: date || new Date().toISOString().split('T')[0],
      startTime: startTime || '09:00',
      user: req.user._id,
      createdBy: req.user._id,
      sourceType: 'chat',
      sourceId: message._id
    });

    res.status(201).json(event);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
