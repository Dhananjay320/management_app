const router = require('express').Router();
const CalendarEvent = require('../models/CalendarEvent');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const { protect } = require('../middleware/auth');

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

    // Get user's tasks with deadlines in this range
    const Task = require('../models/Task');
    const tasks = await Task.find({
      assignees: req.user._id,
      isActive: true,
      status: { $nin: ['cancelled'] },
      deadline: { $gte: new Date(start), $lte: new Date(end + 'T23:59:59') }
    }).select('title deadline deadlineTime priority status taskType count countUnit');

    const taskEvents = tasks.map(t => ({
      title: t.title,
      date: t.deadline.toISOString().split('T')[0],
      type: 'task',
      priority: t.priority,
      startTime: t.deadlineTime || null,
      sourceType: 'task',
      sourceId: t._id,
      _taskStatus: t.status,
      _taskType: t.taskType,
      _count: t.count,
      _countUnit: t.countUnit
    }));

    // Get tasks assigned to user (by startDate or creation date if no deadline)
    const tasksNoDeadline = await Task.find({
      assignees: req.user._id,
      isActive: true,
      status: { $nin: ['cancelled', 'done'] },
      $or: [{ deadline: null }, { deadline: { $exists: false } }],
      createdAt: { $gte: new Date(start), $lte: new Date(end + 'T23:59:59') }
    }).select('title createdAt priority status taskType');

    const noDeadlineEvents = tasksNoDeadline.map(t => ({
      title: t.title,
      date: t.createdAt.toISOString().split('T')[0],
      type: 'task',
      priority: t.priority,
      startTime: null,
      sourceType: 'task',
      sourceId: t._id,
      _taskStatus: t.status
    }));

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

    res.json({
      events: [...events, ...activityEvents, ...taskEvents, ...noDeadlineEvents, ...meetingEvents],
      attendance,
      leaves
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/calendar/events — create manual event
router.post('/events', protect, async (req, res) => {
  try {
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

// POST /api/v1/calendar/seed-holidays — seed Indian holidays for current year
router.post('/seed-holidays', protect, async (req, res) => {
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
