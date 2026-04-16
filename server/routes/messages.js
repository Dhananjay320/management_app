const router = require('express').Router();
const Channel = require('../models/Channel');
const Message = require('../models/Message');
const User = require('../models/User');
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

    const memberIds = members || [];
    if (!memberIds.includes(req.user._id.toString())) {
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

    // Check if DM already exists
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
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/messages/:channelId — get messages for a channel
router.get('/:channelId', protect, async (req, res) => {
  try {
    const { before, limit = 50 } = req.query;

    const channel = await Channel.findById(req.params.channelId);
    if (!channel || !channel.members.includes(req.user._id)) {
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
router.post('/:channelId', protect, async (req, res) => {
  try {
    const { content, type, file, parentMessage, mentions } = req.body;

    const channel = await Channel.findById(req.params.channelId);
    if (!channel || !channel.members.includes(req.user._id)) {
      return res.status(403).json({ error: 'Not a member of this channel.' });
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
            channelId: req.params.channelId
          });
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
      if (existing.users.includes(req.user._id)) {
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

// GET /api/v1/messages/:channelId/members
router.get('/:channelId/members', protect, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.channelId).populate('members', 'name email avatar jobTitle');
    res.json(channel.members);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
