const router = require('express').Router();
const CalendarEvent = require('../models/CalendarEvent');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const { protect, requirePower } = require('../middleware/auth');

// GET /api/v1/calendar/events?start=2026-04-14&end=2026-04-20
router.get('/events', protect, async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'start and end dates required.' });

    // Calendar hierarchy per spec Section 5.4:
    // Personal > Location+Team > Team > Location > Default Company
    // REPLACES — employee sees only one calendar at a time (most specific wins)
    const user = await require('../models/User').findById(req.user._id).select('teams office calendarId');

    let calendarFilter;
    if (user.calendarId) {
      // Priority 1: Personal calendar assigned by admin
      calendarFilter = { $or: [{ user: req.user._id }, { calendar: user.calendarId }] };
    } else if (user.office && user.teams?.length) {
      // Priority 2: Location+Team
      calendarFilter = { $or: [{ user: req.user._id }, { team: { $in: user.teams }, office: user.office }, { isCompanyWide: true, type: 'holiday' }] };
    } else if (user.teams?.length) {
      // Priority 3: Team
      calendarFilter = { $or: [{ user: req.user._id }, { team: { $in: user.teams } }, { isCompanyWide: true, type: 'holiday' }] };
    } else if (user.office) {
      // Priority 4: Location
      calendarFilter = { $or: [{ user: req.user._id }, { office: user.office }, { isCompanyWide: true, type: 'holiday' }] };
    } else {
      // Priority 5: Default Company
      calendarFilter = { $or: [{ user: req.user._id }, { isCompanyWide: true }, { team: { $in: req.user.teams || [] } }] };
    }

    const events = await CalendarEvent.find({
      date: { $gte: start, $lte: end },
      ...calendarFilter
    }).sort({ date: 1, startTime: 1 });

    // Get activities for this range (show as yellow on calendar per spec)
    const Activity = require('../models/Activity');
    const activities = await Activity.find({
      isActive: true,
      date: { $gte: new Date(start), $lte: new Date(end + 'T23:59:59') },
      $or: [
        { audience: 'company' },
        { audience: 'team', team: { $in: user?.teams || req.user.teams || [] } },
        { createdBy: req.user._id }
      ]
    }).select('title date type');

    // Merge activities into events as yellow calendar entries
    const activityEvents = activities.map(a => ({
      title: a.title,
      date: a.date.toISOString().split('T')[0],
      type: 'activity',
      priority: null,
      startTime: a.date.toTimeString().slice(0, 5)
    }));

    // Get user's tasks that overlap with this date range
    // A task shows on all days from startDate (or createdAt) through deadline
    const Task = require('../models/Task');
    const rangeStart = new Date(start);
    const rangeEnd = new Date(end + 'T23:59:59');

    const tasks = await Task.find({
      assignees: req.user._id,
      isActive: true,
      status: { $nin: ['cancelled'] },
      // Task overlaps range if: task starts before range ends AND task ends after range starts
      $or: [
        // Has deadline: show from startDate/createdAt through deadline
        { deadline: { $gte: rangeStart }, $or: [{ startDate: { $lte: rangeEnd } }, { createdAt: { $lte: rangeEnd } }] },
        // Has deadline within range
        { deadline: { $gte: rangeStart, $lte: rangeEnd } },
        // Started in range but no deadline yet (ongoing)
        { deadline: null, createdAt: { $gte: rangeStart, $lte: rangeEnd } },
        { deadline: { $exists: false }, createdAt: { $gte: rangeStart, $lte: rangeEnd } },
        // Started before range, deadline after range (spans entire range)
        { startDate: { $lte: rangeEnd }, deadline: { $gte: rangeStart } }
      ]
    }).select('title deadline deadlineTime startDate createdAt priority status taskType count countUnit');

    // Expand each task into events for each day it spans
    const taskEvents = [];
    const toDateStr = (d) => {
      const dt = new Date(d);
      return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
    };

    for (const t of tasks) {
      const taskStart = t.startDate || t.createdAt;
      const taskEnd = t.deadline || taskStart; // If no deadline, show only on start day

      // Clamp to the requested range
      const showFrom = new Date(Math.max(taskStart.getTime(), rangeStart.getTime()));
      const showTo = new Date(Math.min(taskEnd.getTime(), rangeEnd.getTime()));

      // Generate one event per day
      for (let d = new Date(showFrom); d <= showTo; d.setDate(d.getDate() + 1)) {
        const ds = toDateStr(d);
        const isDeadlineDay = t.deadline && toDateStr(t.deadline) === ds;
        const isStartDay = toDateStr(taskStart) === ds;

        taskEvents.push({
          title: t.title,
          date: ds,
          type: 'task',
          priority: t.priority,
          startTime: isDeadlineDay ? (t.deadlineTime || null) : null,
          sourceType: 'task',
          sourceId: t._id,
          _taskStatus: t.status,
          _taskType: t.taskType,
          _count: t.count,
          _countUnit: t.countUnit,
          _isDeadlineDay: isDeadlineDay,
          _isStartDay: isStartDay
        });
      }
    }

    const noDeadlineEvents = []; // Already handled above

    // Also get attendance records for this range
    const attendance = await Attendance.find({
      user: req.user._id,
      date: { $gte: start, $lte: end }
    });

    // Get approved leaves for this range
    const leaves = await Leave.find({
      user: req.user._id,
      status: 'approved',
      startDate: { $lte: end },
      endDate: { $gte: start }
    });

    // Get meetings for this range
    const { Meeting } = require('../models/Meeting');
    const meetings = await Meeting.find({
      'attendees.user': req.user._id,
      isActive: true,
      date: { $gte: new Date(start), $lte: new Date(end + 'T23:59:59') }
    }).select('title date startTime endTime type status');

    const meetingEvents = meetings.map(m => ({
      title: m.title,
      date: m.date.toISOString().split('T')[0],
      type: 'meeting',
      startTime: m.startTime,
      endTime: m.endTime,
      sourceType: 'meeting',
      sourceId: m._id
    }));

    // Get announcements for this range
    const Announcement = require('../models/Announcement');
    const announcements = await Announcement.find({
      isActive: true,
      createdAt: { $gte: new Date(start), $lte: new Date(end + 'T23:59:59') }
    }).select('title content createdAt');

    const announcementEvents = announcements.map(a => ({
      title: '📢 ' + a.title,
      date: a.createdAt.toISOString().split('T')[0],
      type: 'announcement',
      sourceType: 'announcement',
      sourceId: a._id
    }));

    res.json({
      events: [...events, ...activityEvents, ...taskEvents, ...noDeadlineEvents, ...meetingEvents, ...announcementEvents],
      attendance,
      leaves
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/calendar/user/:userId — admin views another user's calendar
router.get('/user/:userId', protect, async (req, res) => {
  try {
    if (!['main_admin', 'admin'].includes(req.user.role) && !req.user._c) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'start and end required.' });

    const targetUser = await require('../models/User').findById(req.params.userId).select('teams office name');
    if (!targetUser) return res.status(404).json({ error: 'User not found.' });

    // Get all events visible to this user
    const events = await CalendarEvent.find({
      date: { $gte: start, $lte: end },
      $or: [
        { user: req.params.userId },
        { isCompanyWide: true, type: 'holiday' },
        { team: { $in: targetUser.teams || [] } }
      ]
    }).sort({ date: 1, startTime: 1 });

    // Tasks — assigned to this user OR created by this user
    const Task = require('../models/Task');
    const tasks = await Task.find({
      isActive: true,
      status: { $nin: ['cancelled'] },
      deadline: { $gte: new Date(start), $lte: new Date(end + 'T23:59:59') },
      $and: [
        { $or: [{ assignees: req.params.userId }, { createdBy: req.params.userId }] },
        { $or: [{ isPrivate: { $ne: true } }, { watchers: req.user._id }, { createdBy: req.user._id }, { assignees: req.user._id }] }
      ]
    }).select('title deadline deadlineTime priority status taskType isPrivate');

    // Use local date to avoid timezone shift (IST is UTC+5:30)
    const toLocalDate = (d) => {
      const dt = new Date(d);
      return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
    };

    const taskEvents = tasks.filter(t => t.deadline).map(t => ({
      title: t.isPrivate ? '🔒 Private Task' : t.title,
      date: toLocalDate(t.deadline),
      type: 'task', priority: t.priority,
      startTime: t.deadlineTime || null,
      sourceType: 'task', sourceId: t._id,
      _taskStatus: t.status, _isPrivate: t.isPrivate
    }));

    // Meetings
    const { Meeting } = require('../models/Meeting');
    const meetings = await Meeting.find({
      'attendees.user': req.params.userId,
      isActive: true,
      date: { $gte: new Date(start), $lte: new Date(end + 'T23:59:59') }
    }).select('title date startTime endTime type');

    const meetingEvents = meetings.map(m => ({
      title: m.title, date: toLocalDate(m.date),
      type: 'meeting', startTime: m.startTime, endTime: m.endTime,
      sourceType: 'meeting', sourceId: m._id
    }));

    // Leaves
    const leaves = await Leave.find({
      user: req.params.userId, status: 'approved',
      startDate: { $lte: end }, endDate: { $gte: start }
    });

    // Attendance
    const attendance = await Attendance.find({
      user: req.params.userId, date: { $gte: start, $lte: end }
    });

    res.json({
      userName: targetUser.name,
      events: [...events, ...taskEvents, ...meetingEvents],
      attendance, leaves
    });
  } catch (err) {
    console.error('Admin calendar view error:', err.message, err.stack);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// POST /api/v1/calendar/events — create manual event
router.post('/events', protect, async (req, res) => {
  try {
    // Power check: company-wide or holiday events require calendar powers
    if (req.body.isCompanyWide && !req.user.hasPower('calendar', 'createCompany')) {
      return res.status(403).json({ error: 'You do not have permission to create company-wide calendar events.' });
    }
    if (req.body.type === 'holiday' && !req.user.hasPower('calendar', 'markHolidays')) {
      return res.status(403).json({ error: 'You do not have permission to mark holidays.' });
    }

    const event = await CalendarEvent.create({
      ...req.body,
      user: req.user._id,
      createdBy: req.user._id
    });
    res.status(201).json(event);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/calendar/events/holidays — list all holidays (admin view)
router.get('/events/holidays', protect, requirePower('calendar', 'markHolidays'), async (req, res) => {
  try {
    const upcomingOnly = req.query.upcoming === '1';
    const filter = { type: 'holiday' };
    if (upcomingOnly) {
      const today = new Date().toISOString().split('T')[0];
      filter.date = { $gte: today };
    }
    const holidays = await CalendarEvent.find(filter)
      .populate('team', 'name')
      .populate('office', 'name')
      .populate('user', 'name email')
      .populate('createdBy', 'name')
      .sort({ date: 1 })
      .lean();
    res.json(holidays);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/v1/calendar/events/:id — admin delete (gated by markHolidays power for holidays)
router.delete('/events/:id', protect, async (req, res) => {
  try {
    const ev = await CalendarEvent.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found.' });
    if (ev.type === 'holiday' && !req.user.hasPower('calendar', 'markHolidays')) {
      return res.status(403).json({ error: 'No permission to delete holidays.' });
    }
    await CalendarEvent.deleteOne({ _id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/calendar/seed-holidays — seed Indian holidays for current year
router.post('/seed-holidays', protect, requirePower('calendar', 'markHolidays'), async (req, res) => {
  try {
    const year = new Date().getFullYear();
    const holidays = [
      { title: 'Republic Day', date: `${year}-01-26` },
      { title: 'Holi', date: `${year}-03-14` },
      { title: 'Good Friday', date: `${year}-04-18` },
      { title: 'Ram Navami', date: `${year}-04-20` },
      { title: 'Eid ul-Fitr', date: `${year}-03-31` },
      { title: 'Independence Day', date: `${year}-08-15` },
      { title: 'Ganesh Chaturthi', date: `${year}-09-05` },
      { title: 'Gandhi Jayanti', date: `${year}-10-02` },
      { title: 'Dussehra', date: `${year}-10-02` },
      { title: 'Diwali', date: `${year}-10-20` },
      { title: 'Christmas', date: `${year}-12-25` },
    ];

    // Also seed all Sundays per spec
    const sundayStart = new Date(year, 0, 1);
    while (sundayStart.getDay() !== 0) sundayStart.setDate(sundayStart.getDate() + 1);
    for (let d = new Date(sundayStart); d.getFullYear() === year; d.setDate(d.getDate() + 7)) {
      holidays.push({ title: 'Sunday', date: d.toISOString().split('T')[0] });
    }

    const created = [];
    for (const h of holidays) {
      const existing = await CalendarEvent.findOne({ title: h.title, date: h.date, type: 'holiday' });
      if (!existing) {
        const event = await CalendarEvent.create({
          title: h.title,
          type: 'holiday',
          date: h.date,
          allDay: true,
          isCompanyWide: true,
          createdBy: req.user._id
        });
        created.push(event);
      }
    }
    res.json({ message: `${created.length} holidays created (including Sundays).`, holidays: created });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
