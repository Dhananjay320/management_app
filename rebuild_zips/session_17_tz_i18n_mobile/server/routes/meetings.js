const router = require('express').Router();
const { Meeting, MoM } = require('../models/Meeting');
const Channel = require('../models/Channel');
const Message = require('../models/Message');
const { protect } = require('../middleware/auth');

// GET /api/v1/meetings — list meetings for current user
// Session 8 fixes:
//   • Include creator's meetings (not just attendees) — they may have deleted
//     themselves from the attendee list but still own the meeting.
//   • "Past" tab now includes meetings whose date has passed, regardless of
//     status — previously it only showed completed/cancelled, so meetings
//     that ended but never got marked complete were invisible.
//   • Scoped to isActive to exclude soft-deleted meetings.
router.get('/', protect, async (req, res) => {
  try {
    const { tab = 'upcoming' } = req.query;
    // Session 17 C2: "today" is user-local, not server UTC. Without this,
    // IST users see yesterday's meetings in "upcoming" for ~5.5h every day.
    const { startOfUserDay } = require('../utils/timezone');
    const startOfToday = startOfUserDay(req.user);

    const userFilter = {
      $or: [
        { 'attendees.user': req.user._id },
        { createdBy: req.user._id },
      ],
    };

    let filter;
    if (tab === 'upcoming') {
      filter = {
        ...userFilter,
        isActive: true,
        date: { $gte: startOfToday },
        status: { $nin: ['completed', 'cancelled'] },
      };
    } else {
      // "Past" = anything whose date is before today, OR explicitly marked done/cancelled.
      filter = {
        ...userFilter,
        isActive: true,
        $or: [
          { date: { $lt: startOfToday } },
          { status: { $in: ['completed', 'cancelled'] } },
        ],
      };
      // Preserve the outer $or (attendees/creator) — Mongo allows only one
      // top-level $or, so merge both arrays explicitly via $and.
      delete filter.$or;
      filter.$and = [
        { $or: [{ 'attendees.user': req.user._id }, { createdBy: req.user._id }] },
        { $or: [{ date: { $lt: startOfToday } }, { status: { $in: ['completed', 'cancelled'] } }] },
      ];
    }

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

    // Session 8 fix (audit §8): the old code generated a fake Google Meet URL
    // that 404'd because we don't have Google Workspace integration. We no
    // longer invent one. If the creator supplied a real meeting URL, use it.
    // Otherwise leave null so the UI can prompt to paste one later.
    let videoLink = null;
    if (type === 'online') {
      const providedLink = (req.body.videoLink || req.body.googleMeetLink || '').trim();
      // Basic sanity: accept HTTPS URLs only. No fake generation.
      if (providedLink && /^https:\/\/\S+$/i.test(providedLink)) {
        videoLink = providedLink;
      }
    }

    const meeting = await Meeting.create({
      title, agenda, type, date: new Date(date), startTime, endTime, duration,
      location, attendees, createdBy: req.user._id,
      // Keep the old field name for backward compat with the Meeting schema,
      // but the value now comes from creator-provided input (or is null).
      googleMeetLink: videoLink, isRecurring, recurringPattern
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

    // S7: only creator, main_admin, or user with meetings.editAny may edit.
    // Audit doc Section 8 bug: any attendee could edit anyone's meeting.
    const uid = String(req.user._id);
    const isCreator = String(old.createdBy) === uid;
    const isMainAdmin = req.user.role === 'main_admin';
    const hasEditAny = req.user.powers?.meetings?.editAny;
    if (!isCreator && !isMainAdmin && !hasEditAny) {
      return res.status(403).json({ error: 'Only the meeting creator or an admin can edit this meeting.' });
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
// S7: only creator, main_admin, or meetings.deleteAny may delete.
router.delete('/:id', protect, async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id)
      .populate('attendees.user', 'name');
    if (!meeting) return res.status(404).json({ error: 'Meeting not found.' });

    // S7: power check
    const uid = String(req.user._id);
    const isCreator = String(meeting.createdBy) === uid;
    const isMainAdmin = req.user.role === 'main_admin';
    const hasDeleteAny = req.user.powers?.meetings?.deleteAny;
    if (!isCreator && !isMainAdmin && !hasDeleteAny) {
      return res.status(403).json({ error: 'Only the meeting creator or an admin can delete this meeting.' });
    }

    const createdAgo = Date.now() - new Date(meeting.createdAt).getTime();
    const silentWindow = createdAgo < 10000; // Within 10 seconds

    meeting.isActive = false;
    meeting.status = 'cancelled';
    await meeting.save();

    // Audit log (best-effort — doesn't block success)
    try {
      const { logAction } = require('../utils/audit');
      await logAction(req, 'meeting.delete', {
        target: 'Meeting', targetId: meeting._id, targetLabel: meeting.title,
        meta: { silentWindow },
      });
    } catch {}

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

// PUT /api/v1/meetings/mom/:momId — update MoM (Session 8: auto-save support)
// Adds an author-check guard and stamps lastAutoSaveAt so the UI can show
// "Saved just now" or "Saved 2 min ago" feedback.
router.put('/mom/:momId', protect, async (req, res) => {
  try {
    const existing = await MoM.findById(req.params.momId);
    if (!existing) return res.status(404).json({ error: 'MoM not found.' });

    // Only the author can edit their scratchpad / MoM. Main-admin override
    // left in for cleanup/moderation scenarios.
    const isOwner = String(existing.author) === String(req.user._id);
    if (!isOwner && req.user.role !== 'main_admin') {
      return res.status(403).json({ error: 'You can only edit your own MoM.' });
    }

    const updates = { ...req.body };
    if (updates.tiptapJSON) {
      updates.plainTextContent = extractPlainText(updates.tiptapJSON);
    }
    if (updates.isPublished && !updates.publishedAt) {
      updates.publishedAt = new Date();
    }
    // Session 8: always update autosave timestamp so UI can show save state
    updates.lastAutoSaveAt = new Date();

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
