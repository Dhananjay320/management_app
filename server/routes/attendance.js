const router = require('express').Router();
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const User = require('../models/User');
const Office = require('../models/Office');
const { protect, requirePower } = require('../middleware/auth');
const { verifyLocation } = require('../utils/geofence');

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// GET /api/v1/attendance/today — get today's record for current user
router.get('/today', protect, async (req, res) => {
  try {
    const record = await Attendance.findOne({ user: req.user._id, date: todayStr() });
    res.json(record || { status: 'not_marked', date: todayStr() });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/attendance/mark-entry
router.post('/mark-entry', protect, async (req, res) => {
  try {
    const { deviceIP, coordinates } = req.body;
    const user = await User.findById(req.user._id).populate('office');
    const date = todayStr();

    // Check if already marked
    const existing = await Attendance.findOne({ user: user._id, date });
    if (existing && existing.entryTime) {
      return res.status(400).json({ error: 'Entry already marked for today.', record: existing });
    }

    // Check if it's a hybrid off-day that requires office
    const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const needsOfficeCheck = user.workType === 'full_office' ||
      (user.workType === 'hybrid' && user.hybridOfficeDays.includes(dayOfWeek));

    let verificationMethod = 'remote';
    let distance = null;
    let coords = coordinates;

    if (needsOfficeCheck && user.office) {
      const office = user.office;
      const result = verifyLocation(office, deviceIP, coordinates);

      if (!result.allowed) {
        return res.status(403).json({
          error: 'You are not in the office. Please connect to office WiFi or be physically present in the office to mark entry.',
          blocked: true
        });
      }
      verificationMethod = result.method;
      distance = result.distance;
    }

    // Create or update attendance record
    const record = await Attendance.findOneAndUpdate(
      { user: user._id, date },
      {
        entryTime: new Date(),
        status: 'present',
        verificationMethod,
        distanceMeters: distance,
        deviceIP,
        coordinates: coords,
        office: user.office?._id || user.office
      },
      { upsert: true, new: true }
    );

    // Notify via socket
    const io = req.app.get('io');
    if (io) {
      io.emit('attendance:marked', { userId: user._id, name: user.name, time: record.entryTime });
    }

    res.json(record);
  } catch (err) {
    console.error('Mark entry error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/attendance/wrap-up
router.post('/wrap-up', protect, async (req, res) => {
  try {
    const date = todayStr();
    const record = await Attendance.findOne({ user: req.user._id, date });

    if (!record || !record.entryTime) {
      return res.status(400).json({ error: 'No entry marked for today.' });
    }
    if (record.wrapUpTime) {
      return res.status(400).json({ error: 'Already wrapped up for today.' });
    }

    // Check if after 5 PM
    const now = new Date();
    const hour = now.getHours();
    if (hour < 17) {
      return res.status(400).json({ error: 'Wrap up is available after 5:00 PM.' });
    }

    record.wrapUpTime = now;
    record.totalHours = Math.round((now - record.entryTime) / (1000 * 60 * 60) * 100) / 100;
    await record.save();

    res.json(record);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/attendance/history?month=2026-04
router.get('/history', protect, async (req, res) => {
  try {
    const { month, userId } = req.query;
    const targetUser = userId || req.user._id;

    // If viewing another user, check power
    if (userId && userId !== req.user._id.toString()) {
      if (req.user.role !== 'main_admin' && !req.user.hasPower('attendance', 'viewIndividual')) {
        return res.status(403).json({ error: 'No permission to view this user\'s attendance.' });
      }
    }

    let dateFilter = {};
    if (month) {
      dateFilter = { date: { $regex: `^${month}` } };
    } else {
      // Default to current month
      const now = new Date();
      const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      dateFilter = { date: { $regex: `^${m}` } };
    }

    const records = await Attendance.find({ user: targetUser, ...dateFilter })
      .sort({ date: 1 });

    res.json(records);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/attendance/team — admin view
router.get('/team', protect, requirePower('attendance', 'viewTeam'), async (req, res) => {
  try {
    const date = req.query.date || todayStr();
    const records = await Attendance.find({ date })
      .populate('user', 'name email jobTitle avatar')
      .sort({ entryTime: 1 });

    // Also get users who haven't marked
    const markedUserIds = records.map(r => r.user._id.toString());
    const unmarked = await User.find({
      _id: { $nin: markedUserIds },
      isActive: true,
      role: { $ne: 'main_admin' }
    }).select('name email jobTitle');

    res.json({ marked: records, unmarked, date });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/attendance/leave — request leave
router.post('/leave', protect, async (req, res) => {
  try {
    const { type, halfDayType, startDate, endDate, reason } = req.body;
    if (!type || !startDate || !endDate || !reason) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const leave = await Leave.create({
      user: req.user._id,
      type,
      halfDayType: type === 'half_day' ? halfDayType : undefined,
      startDate,
      endDate,
      reason
    });

    // Notify manager
    const io = req.app.get('io');
    if (io && req.user.manager) {
      io.to(`user:${req.user.manager}`).emit('notification:new', {
        type: 'approval',
        title: 'Leave Request',
        message: `${req.user.name} requested ${type} leave from ${startDate} to ${endDate}`
      });
    }

    res.status(201).json(leave);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/attendance/leaves — my leaves
router.get('/leaves', protect, async (req, res) => {
  try {
    const leaves = await Leave.find({ user: req.user._id })
      .sort({ createdAt: -1 });
    res.json(leaves);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/attendance/leave/:id/approve
router.put('/leave/:id/approve', protect, requirePower('attendance', 'editRecords'), async (req, res) => {
  try {
    const leave = await Leave.findByIdAndUpdate(req.params.id, {
      status: 'approved',
      approvedBy: req.user._id
    }, { new: true }).populate('user', 'name');

    if (!leave) return res.status(404).json({ error: 'Leave not found.' });

    // Create attendance records for leave days
    const start = new Date(leave.startDate);
    const end = new Date(leave.endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      await Attendance.findOneAndUpdate(
        { user: leave.user._id, date: dateStr },
        { status: leave.type === 'half_day' ? 'half_day' : 'leave', halfDayType: leave.halfDayType },
        { upsert: true }
      );
    }

    res.json(leave);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/attendance/leave/:id/reject
router.put('/leave/:id/reject', protect, requirePower('attendance', 'editRecords'), async (req, res) => {
  try {
    const leave = await Leave.findByIdAndUpdate(req.params.id, {
      status: 'rejected',
      rejectionReason: req.body.reason || ''
    }, { new: true });
    if (!leave) return res.status(404).json({ error: 'Leave not found.' });
    res.json(leave);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/attendance/stats — summary stats
router.get('/stats', protect, async (req, res) => {
  try {
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + 1); // Monday

    const monthRecords = await Attendance.find({
      user: req.user._id,
      date: { $regex: `^${monthStr}` },
      status: 'present'
    });

    const weekRecords = monthRecords.filter(r => {
      const d = new Date(r.date);
      return d >= weekStart && d <= now;
    });

    // Count working days this week (Mon-Fri up to today)
    let weekWorkDays = 0;
    for (let d = new Date(weekStart); d <= now; d.setDate(d.getDate() + 1)) {
      if (d.getDay() >= 1 && d.getDay() <= 5) weekWorkDays++;
    }

    // Count working days this month
    let monthWorkDays = 0;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    for (let d = new Date(monthStart); d <= now; d.setDate(d.getDate() + 1)) {
      if (d.getDay() >= 1 && d.getDay() <= 5) monthWorkDays++;
    }

    const pendingLeaves = await Leave.countDocuments({ user: req.user._id, status: 'pending' });

    res.json({
      week: { present: weekRecords.length, total: weekWorkDays },
      month: { present: monthRecords.length, total: monthWorkDays },
      pendingLeaves
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
