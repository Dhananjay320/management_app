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

    // Get user's own events + company-wide events
    const events = await CalendarEvent.find({
      date: { $gte: start, $lte: end },
      $or: [
        { user: req.user._id },
        { isCompanyWide: true },
        { team: { $in: req.user.teams } }
      ]
    }).sort({ date: 1, startTime: 1 });

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

    res.json({ events, attendance, leaves });
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
    res.json({ message: `${created.length} holidays created.`, holidays: created });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
