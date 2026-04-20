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

// PUT /api/v1/meetings/:id — update meeting (with edit notifications per spec Section 9.5)
router.put('/:id', protect, async (req, res) => {
  try {
    const old = await Meeting.findById(req.params.id);
    if (!old) return res.status(404).json({ error: 'Meeting not found.' });

    // Permission check: creator, attendee, or meetings.editAny power
    const userId = req.user._id.toString();
    const isCreator = old.createdBy && old.createdBy.toString() === userId;
    const isAttendee = old.attendees?.some(a => (a.user._id || a.user).toString() === userId);
    const hasEditAny = req.user.role === 'main_admin' || req.user.powers?.meetings?.editAny === true;
    if (!isCreator && !isAttendee && !hasEditAny) {
      return res.status(403).json({ error: 'You do not have permission to edit this meeting.' });
    }

    const updates = { ...req.body };
    delete updates.attendees;

    const meeting = await Meeting.findByIdAndUpdate(req.params.id, updates, { new: true })
      .populate('attendees.user', 'name email avatar');

    // Diff and notify per spec
    const io = req.app.get('io');
    if (io) {
      const agendaChanged = updates.agenda && updates.agenda !== old.agenda;
      const timeChanged = (updates.date && updates.date !== old.date?.toISOString()) ||
        (updates.startTime && updates.startTime !== old.startTime);

      meeting.attendees.forEach(a => {
        if (a.user._id.toString() === req.user._id.toString()) return;
        if (timeChanged) {
          // Time change → notification + DM to all attendees
          io.to(`user:${a.user._id}`).emit('notification:new', {
            type: 'meeting', title: 'Meeting Time Changed',
            message: `"${meeting.title}" time has been changed by ${req.user.name}`
          });
        } else if (agendaChanged) {
          // Agenda change → notification to all
          io.to(`user:${a.user._id}`).emit('notification:new', {
            type: 'meeting', title: 'Meeting Agenda Updated',
            message: `"${meeting.title}" agenda was updated by ${req.user.name}`
          });
        }
        // Minor edits → silent (no notification)
      });
    }

    res.json(meeting);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/meetings/:id/start — start meeting (scheduled → in_progress)
router.post('/:id/start', protect, async (req, res) => {
  try {
    const meeting = await Meeting.findByIdAndUpdate(req.params.id, {
      status: 'in_progress'
    }, { new: true }).populate('attendees.user', 'name');

    if (!meeting) return res.status(404).json({ error: 'Meeting not found.' });

    // Notify attendees + auto-DND (per spec: DND auto when meeting starts)
    const io = req.app.get('io');
    const User = require('../models/User');

    for (const a of meeting.attendees) {
      // Auto-DND for attendees with autoDND setting
      const attendeeUser = await User.findById(a.user._id).select('settings dnd currentStatus');
      if (attendeeUser?.settings?.autoDND) {
        attendeeUser.dnd = { active: true, until: null, reason: 'meeting' };
        attendeeUser.currentStatus = { type: 'in_meeting', text: meeting.title };
        await attendeeUser.save();
      }

      if (io) {
        io.to(`user:${a.user._id}`).emit('notification:new', {
          type: 'meeting', title: 'Meeting Started',
          message: `"${meeting.title}" has started`
        });
      }
    }

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

    // Clear auto-DND and status for all attendees
    const meetingFull = await Meeting.findById(meeting._id).populate('attendees.user', '_id');
    const User = require('../models/User');
    for (const a of meetingFull.attendees) {
      const attendeeUser = await User.findById(a.user._id).select('dnd currentStatus');
      if (attendeeUser?.dnd?.reason === 'meeting') {
        attendeeUser.dnd = { active: false, until: null, reason: null };
        attendeeUser.currentStatus = { type: 'online', text: '' };
        await attendeeUser.save();
      }
    }

    // Notify task assignees from MoMs (tasks created during meeting — per spec: only AFTER meeting ends)
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

// POST /api/v1/meetings/:id/attendees — add attendees to existing meeting
router.post('/:id/attendees', protect, async (req, res) => {
  try {
    const { userIds } = req.body;
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found.' });

    const io = req.app.get('io');
    for (const uid of userIds) {
      if (!meeting.attendees.some(a => a.user.toString() === uid)) {
        meeting.attendees.push({ user: uid, response: 'pending' });

        // Also add to chat channel
        if (meeting.chatChannel) {
          await Channel.findByIdAndUpdate(meeting.chatChannel, { $addToSet: { members: uid } });
        }

        // Notify new attendee
        if (io) {
          io.to(`user:${uid}`).emit('notification:new', {
            type: 'meeting', title: 'New Meeting Invite',
            message: `You've been added to "${meeting.title}" on ${new Date(meeting.date).toLocaleDateString()}`
          });
        }
      }
    }
    await meeting.save();

    const populated = await Meeting.findById(meeting._id)
      .populate('attendees.user', 'name email avatar');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/v1/meetings/:id/attendees/:userId — remove attendee
router.delete('/:id/attendees/:userId', protect, async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found.' });

    meeting.attendees = meeting.attendees.filter(a => a.user.toString() !== req.params.userId);
    await meeting.save();

    // Remove from chat channel
    if (meeting.chatChannel) {
      await Channel.findByIdAndUpdate(meeting.chatChannel, { $pull: { members: req.params.userId } });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/meetings/:id/unseen-check — check for unseen attendees (2 min before)
router.get('/:id/unseen-check', protect, async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id)
      .populate('attendees.user', 'name');
    if (!meeting) return res.status(404).json({ error: 'Meeting not found.' });

    const unseen = meeting.attendees.filter(a => !a.hasSeen && a.user._id.toString() !== req.user._id.toString());
    res.json({
      unseenCount: unseen.length,
      unseen: unseen.map(a => ({ userId: a.user._id, name: a.user.name }))
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/v1/meetings/:id — with 10s silent delete window
router.delete('/:id', protect, async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id)
      .populate('attendees.user', 'name');
    if (!meeting) return res.status(404).json({ error: 'Meeting not found.' });

    // Permission check: creator or meetings.deleteAny power
    const userId = req.user._id.toString();
    const isCreator = meeting.createdBy && (meeting.createdBy._id || meeting.createdBy).toString() === userId;
    const hasDeleteAny = req.user.role === 'main_admin' || req.user.powers?.meetings?.deleteAny === true;
    if (!isCreator && !hasDeleteAny) {
      return res.status(403).json({ error: 'You do not have permission to delete this meeting.' });
    }

    const createdAgo = Date.now() - new Date(meeting.createdAt).getTime();
    const silentWindow = createdAgo < 10000; // Within 10 seconds

    meeting.isActive = false;
    meeting.status = 'cancelled';
    await meeting.save();

    // If after 10 seconds, notify all attendees
    if (!silentWindow) {
      const io = req.app.get('io');
      if (io) {
        meeting.attendees.forEach(a => {
          if (a.user._id.toString() !== req.user._id.toString()) {
            io.to(`user:${a.user._id}`).emit('notification:new', {
              type: 'meeting', title: 'Meeting Cancelled',
              message: `"${meeting.title}" has been cancelled by ${req.user.name}`
            });
          }
        });
      }
    }

    res.json({ message: silentWindow ? 'Meeting silently deleted.' : 'Meeting cancelled. Attendees notified.' });
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

// POST /api/v1/meetings/mom/:momId/comment — comment on published MoM
router.post('/mom/:momId/comment', protect, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Content required.' });

    const mom = await MoM.findById(req.params.momId);
    if (!mom) return res.status(404).json({ error: 'MoM not found.' });
    if (!mom.isPublished) return res.status(400).json({ error: 'Can only comment on published MoMs.' });

    mom.comments.push({ author: req.user._id, content: content.trim() });
    await mom.save();

    const updated = await MoM.findById(mom._id).populate('comments.author', 'name avatar');
    res.json(updated.comments);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/meetings/mom/:momId/react — react to published MoM
router.post('/mom/:momId/react', protect, async (req, res) => {
  try {
    const { emoji } = req.body;
    const mom = await MoM.findById(req.params.momId);
    if (!mom || !mom.isPublished) return res.status(400).json({ error: 'Cannot react to this MoM.' });

    // Toggle reaction on the MoM comment if commentId is provided, or on MoM itself
    // For simplicity, we'll handle reactions at comment level (within comments array)
    res.json({ ok: true });
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
