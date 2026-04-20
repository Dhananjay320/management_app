// ============================================================================
// scheduledMessages.js — REST API for scheduled messages.
// ============================================================================
// Session 24 (N3). Endpoints:
//
//   POST   /scheduled-messages         — schedule a new message
//   GET    /scheduled-messages         — list my pending/sent/cancelled/failed
//   GET    /scheduled-messages/:id     — get one
//   PUT    /scheduled-messages/:id     — edit or reschedule (pending only)
//   DELETE /scheduled-messages/:id     — cancel (pending only)
// ============================================================================

const router = require('express').Router();
const ScheduledMessage = require('../models/ScheduledMessage');
const Channel = require('../models/Channel');
const { protect } = require('../middleware/auth');

// Helper: check user is a member of channel. Mirrors isChannelMember from
// messages.js — duplicated here to avoid import cycles.
function isChannelMember(channel, userId) {
  const memberIds = (channel.members || []).map(id => String(id));
  return memberIds.includes(String(userId));
}

// ─── POST / — create ─────────────────────────────────────────────────────
router.post('/', protect, async (req, res) => {
  try {
    const { channel, content, sendAt, mentions, type, file, parentMessage, note } = req.body;

    if (!channel) return res.status(400).json({ error: 'Channel is required.' });
    if (!content?.trim() && !file) return res.status(400).json({ error: 'Content or file is required.' });
    if (!sendAt) return res.status(400).json({ error: 'Send time is required.' });

    const sendAtDate = new Date(sendAt);
    if (isNaN(sendAtDate.getTime())) return res.status(400).json({ error: 'Invalid send time.' });
    if (sendAtDate.getTime() <= Date.now() + 30_000) {
      // Must be at least 30s in the future so the worker has a chance to pick it up.
      return res.status(400).json({ error: 'Send time must be at least 30 seconds in the future.' });
    }

    const chan = await Channel.findById(channel);
    if (!chan || !isChannelMember(chan, req.user._id)) {
      return res.status(403).json({ error: 'Not a member of this channel.' });
    }

    // Announcement-channel — enforce at schedule time too, matching regular send.
    if (chan.name === '#announcements' || chan.name === 'announcements') {
      if (!req.user.hasPower?.('messaging', 'postAnnouncements') && req.user.role !== 'main_admin') {
        return res.status(403).json({ error: 'Only users with announcement permission can post in this channel.' });
      }
    }

    const record = await ScheduledMessage.create({
      channel,
      sender: req.user._id,
      content: content || '',
      type: type || 'text',
      file,
      mentions: mentions || [],
      parentMessage,
      sendAt: sendAtDate,
      note: note || '',
    });

    res.status(201).json(record);
  } catch (err) {
    console.error('schedule message error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── GET / — list my scheduled messages ─────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const { status } = req.query;   // optional filter: pending / sent / etc
    const filter = { sender: req.user._id };
    if (status) filter.status = status;

    const records = await ScheduledMessage.find(filter)
      .sort({ sendAt: 1 })
      .populate('channel', 'name type members')
      .populate('mentions', 'name email avatar')
      .limit(200);

    res.json(records);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── GET /:id — fetch one ────────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const record = await ScheduledMessage.findOne({
      _id: req.params.id,
      sender: req.user._id,
    })
      .populate('channel', 'name type members')
      .populate('mentions', 'name email avatar');
    if (!record) return res.status(404).json({ error: 'Not found.' });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── PUT /:id — edit or reschedule ──────────────────────────────────────
router.put('/:id', protect, async (req, res) => {
  try {
    const record = await ScheduledMessage.findOne({
      _id: req.params.id,
      sender: req.user._id,
    });
    if (!record) return res.status(404).json({ error: 'Not found.' });
    if (record.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending messages can be edited.' });
    }

    const { content, sendAt, mentions, note } = req.body;

    if (sendAt !== undefined) {
      const d = new Date(sendAt);
      if (isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid send time.' });
      if (d.getTime() <= Date.now() + 30_000) {
        return res.status(400).json({ error: 'Send time must be at least 30 seconds in the future.' });
      }
      record.sendAt = d;
    }
    if (content !== undefined) record.content = content;
    if (mentions !== undefined) record.mentions = mentions;
    if (note !== undefined) record.note = note;

    await record.save();
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── DELETE /:id — cancel ───────────────────────────────────────────────
router.delete('/:id', protect, async (req, res) => {
  try {
    const record = await ScheduledMessage.findOne({
      _id: req.params.id,
      sender: req.user._id,
    });
    if (!record) return res.status(404).json({ error: 'Not found.' });
    if (record.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending messages can be cancelled.' });
    }

    record.status = 'cancelled';
    await record.save();
    res.json({ message: 'Cancelled.', record });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
