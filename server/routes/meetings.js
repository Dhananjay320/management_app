const router = require('express').Router();
const { Meeting, MoM } = require('../models/Meeting');
const Channel = require('../models/Channel');
const Message = require('../models/Message');
const { protect } = require('../middleware/auth');

// GET /api/v1/meetings — list meetings for current user
router.get('/', protect, async (req, res) => {
  try {
    const { tab = 'upcoming' } = req.query;
    const now = new Date();

    let filter = { 'attendees.user': req.user._id, isActive: true };
    if (tab === 'upcoming') filter.date = { $gte: new Date(now.toDateString()) };
    else filter.status = { $in: ['completed', 'cancelled'] };

    const meetings = await Meeting.find(filter)
      .populate('attendees.user', 'name email avatar')
      .populate('createdBy', 'name')
      .sort(tab === 'upcoming' ? { date: 1 } : { date: -1 });

    res.json(meetings);
  } catch (err) {
    console.error('Get meetings error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/meetings/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id)
      .populate('attendees.user', 'name email avatar jobTitle')
      .populate('createdBy', 'name email');

    if (!meeting) return res.status(404).json({ error: 'Meeting not found.' });

    // Get MoMs for this meeting
    const moms = await MoM.find({ meeting: meeting._id, isActive: true })
      .populate('author', 'name')
      .populate('linkedTasks', 'title status')
      .sort({ createdAt: -1 });

    // Get user's own scratchpad
    let scratchpad = await MoM.findOne({ meeting: meeting._id, author: req.user._id, type: 'scratchpad' });
    if (!scratchpad) {
      scratchpad = await MoM.create({
        meeting: meeting._id, author: req.user._id, type: 'scratchpad',
        title: 'My Scratchpad'
      });
    }

    res.json({ ...meeting.toObject(), moms, scratchpad });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/meetings — create meeting
router.post('/', protect, async (req, res) => {
  try {
    const { title, agenda, type, date, startTime, endTime, duration, location, attendeeIds, isRecurring, recurringPattern } = req.body;

    if (!title || !agenda || !type || !date || !startTime) {
      return res.status(400).json({ error: 'Title, agenda, type, date, and start time are required.' });
    }

    // Build attendees list — include creator
    const attendees = (attendeeIds || []).map(uid => ({ user: uid, response: 'pending' }));
    if (!attendees.find(a => a.user.toString() === req.user._id.toString())) {
      attendees.push({ user: req.user._id, response: 'confirmed', hasSeen: true });
    }

    // Generate a mock Google Meet link for online meetings
    let googleMeetLink = null;
    if (type === 'online') {
      const meetId = require('crypto').randomBytes(5).toString('hex');
      googleMeetLink = `https://meet.google.com/${meetId.slice(0,3)}-${meetId.slice(3,7)}-${meetId.slice(7)}`;
    }

    const meeting = await Meeting.create({
      title, agenda, type, date: new Date(date), startTime, endTime, duration,
      location, attendees, createdBy: req.user._id,
      googleMeetLink, isRecurring, recurringPattern
    });

    // Create meeting chat thread
    const channel = await Channel.create({
      name: `Meeting: ${title}`,
      type: 'channel',
      members: attendees.map(a => a.user),
      createdBy: req.user._id,
      isPrivate: true
    });
    meeting.chatChannel = channel._id;
    await meeting.save();

    // System message in chat
    await Message.create({
      channel: channel._id, sender: req.user._id,
      content: `${req.user.name} created meeting "${title}" for ${new Date(date).toLocaleDateString()}`,
      type: 'system'
    });

    // Notify attendees
    const io = req.app.get('io');
    if (io) {
      attendees.forEach(a => {
        if (a.user.toString() !== req.user._id.toString()) {
          io.to(`user:${a.user}`).emit('notification:new', {
            type: 'meeting', title: 'New Meeting Invite',
            message: `${req.user.name} invited you to "${title}" on ${new Date(date).toLocaleDateString()}`
          });
        }
      });
    }

    const populated = await Meeting.findById(meeting._id)
      .populate('attendees.user', 'name email avatar')
      .populate('createdBy', 'name');

    res.status(201).json(populated);
  } catch (err) {
    console.error('Create meeting error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/meetings/:id — update meeting
router.put('/:id', protect, async (req, res) => {
  try {
    const updates = { ...req.body };
    delete updates.attendees; // Use separate routes for attendee management
    const meeting = await Meeting.findByIdAndUpdate(req.params.id, updates, { new: true })
      .populate('attendees.user', 'name email avatar');
    res.json(meeting);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/meetings/:id/respond — confirm/decline/reschedule
router.post('/:id/respond', protect, async (req, res) => {
  try {
    const { response, reason } = req.body;
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found.' });

    const attendee = meeting.attendees.find(a => a.user.toString() === req.user._id.toString());
    if (!attendee) return res.status(403).json({ error: 'Not an attendee.' });

    attendee.response = response;
    attendee.hasSeen = true;
    if (response === 'declined' && reason) attendee.declineReason = reason;
    await meeting.save();

    res.json({ message: `Response: ${response}` });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/meetings/:id/mark-present
router.post('/:id/mark-present', protect, async (req, res) => {
  try {
    const { userId, isPresent } = req.body;
    const meeting = await Meeting.findById(req.params.id);
    const attendee = meeting.attendees.find(a => a.user.toString() === userId);
    if (attendee) {
      attendee.isPresent = isPresent;
      await meeting.save();
    }
    res.json({ message: 'Updated.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/meetings/:id/end — end meeting
router.post('/:id/end', protect, async (req, res) => {
  try {
    const meeting = await Meeting.findByIdAndUpdate(req.params.id, {
      status: 'completed', endedAt: new Date(), endedBy: req.user._id
    }, { new: true });

    // Notify task assignees from MoMs (tasks created during meeting)
    const moms = await MoM.find({ meeting: meeting._id }).populate('linkedTasks');
    const io = req.app.get('io');
    if (io) {
      moms.forEach(mom => {
        mom.linkedTasks?.forEach(task => {
          task.assignees?.forEach(uid => {
            io.to(`user:${uid}`).emit('notification:new', {
              type: 'task', title: 'Task from Meeting',
              message: `New task from "${meeting.title}": ${task.title}`
            });
          });
        });
      });
    }

    res.json(meeting);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/v1/meetings/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    await Meeting.findByIdAndUpdate(req.params.id, { isActive: false, status: 'cancelled' });
    res.json({ message: 'Meeting cancelled.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── MoM ───

// POST /api/v1/meetings/:id/mom — create MoM
router.post('/:id/mom', protect, async (req, res) => {
  try {
    const { title, type, tiptapJSON } = req.body;
    const mom = await MoM.create({
      meeting: req.params.id, author: req.user._id,
      type: type || 'personal', title: title || 'Minutes of Meeting',
      tiptapJSON
    });
    res.status(201).json(mom);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/meetings/mom/:momId — update MoM
router.put('/mom/:momId', protect, async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.tiptapJSON) {
      updates.plainTextContent = extractPlainText(updates.tiptapJSON);
    }
    if (updates.isPublished && !updates.publishedAt) {
      updates.publishedAt = new Date();
    }
    const mom = await MoM.findByIdAndUpdate(req.params.momId, updates, { new: true });
    res.json(mom);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

function extractPlainText(json) {
  let text = '';
  function traverse(node) {
    if (node.type === 'text' && node.text) text += node.text + ' ';
    if (node.content && Array.isArray(node.content)) node.content.forEach(traverse);
    if (['paragraph', 'heading', 'listItem'].includes(node.type)) text += '\n';
  }
  traverse(json);
  return text.trim();
}

module.exports = router;
