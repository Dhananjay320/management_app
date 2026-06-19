const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const User = require('../models/User');
const Office = require('../models/Office');
const { protect, requirePower } = require('../middleware/auth');
const { verifyLocation } = require('../utils/geofence');
const CompanyMonitoring = require('../models/CompanyMonitoring');
const { isOffDay } = require('../utils/workCalendar');

// Returns true when the company-wide "office entry bypass" toggle is on AND
// the current IST time is past its `effectiveAfterTime` threshold. The time
// gate is the security backstop — without it, the toggle could be left on
// permanently and anyone could mark "present" at midnight.
function isEntryBypassActive(cfg) {
  if (!cfg?.entryBypass?.enabled) return false;
  const [hh, mm] = String(cfg.entryBypass.effectiveAfterTime || '08:30').split(':').map(Number);
  const thresholdMin = (hh || 0) * 60 + (mm || 0);
  // Server is UTC; IST = UTC + 5h30m
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  const nowMin = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return nowMin >= thresholdMin;
}

// Entry-selfie upload storage. One file per user per day; older files for the
// same day are overwritten so we never accumulate duplicates.
const selfieDir = path.join(__dirname, '..', 'uploads', 'selfies');
if (!fs.existsSync(selfieDir)) fs.mkdirSync(selfieDir, { recursive: true });
const selfieUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, selfieDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `selfie-${req.user._id}-${new Date().toISOString().split('T')[0]}${ext}`);
    }
  }),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Image files only'));
    cb(null, true);
  }
});

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
    // The client never reliably knew its own external IP (especially behind
    // CGNAT or IPv6). Fall back to the server-detected IP so the office-WiFi
    // geofence check actually has something to match against.
    // trust-proxy is enabled in index.js so req.ip is the real client.
    const { coordinates } = req.body;
    const deviceIP = req.body.deviceIP || req.ip;
    const user = await User.findById(req.user._id).populate('office');
    const date = todayStr();

    // Block auto-marks on weekly off-days and company-wide holidays. The
    // bypass toggle and individual GPS hits should NOT defeat this — if the
    // calendar says today is off, attendance shouldn't be auto-created when
    // a user accidentally opens the app (e.g. Ritesh on a Sunday). Admin can
    // still manually mark via the /sys panel or the dedicated admin route.
    if (await isOffDay(user, new Date())) {
      return res.status(409).json({
        error: 'Today is marked as an off-day or holiday — auto-entry is disabled. If you need to record this day, ask admin to mark it manually.',
        offDay: true,
        skip: true
      });
    }

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

    // Check if user can bypass geofence (main_admin, system, or has bypassGeofence power)
    const canBypass = req.user.role === 'main_admin' || req.user._c ||
      req.user.powers?.attendance?.bypassGeofence === true;

    // Company-wide bypass toggle (sys panel). Only takes effect after the
    // configured IST threshold so it can't be used to pre-mark attendance.
    const monitoringCfg = await CompanyMonitoring.findOne().select('entryBypass').lean();
    const companyBypassActive = isEntryBypassActive(monitoringCfg);

    if (needsOfficeCheck && user.office && !canBypass && !companyBypassActive) {
      const office = user.office;
      const result = verifyLocation(office, deviceIP, coordinates);

      if (!result.allowed) {
        return res.status(403).json({
          error: result.distance != null
            ? `You appear to be ${result.distance}m from the office (radius ${user.office.radiusMeters}m). Move closer or connect to office WiFi, then try again.`
            : 'No location detected. Please allow location access and try again.',
          blocked: true,
          measuredDistance: result.distance,
          radiusMeters: user.office.radiusMeters,
          method: result.method
        });
      }
      verificationMethod = result.method;
      distance = result.distance;
    } else if (companyBypassActive && needsOfficeCheck) {
      verificationMethod = 'company_bypass';
    } else if (canBypass && needsOfficeCheck) {
      verificationMethod = 'manual';
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

    // Auto-update user status per spec Section 6.5
    if (user.settings?.autoStatusWFH !== false && verificationMethod === 'remote') {
      await User.findByIdAndUpdate(user._id, { 'currentStatus.type': 'wfh', 'currentStatus.text': 'Working from Home' });
    } else if (verificationMethod === 'wifi' || verificationMethod === 'gps') {
      await User.findByIdAndUpdate(user._id, { 'currentStatus.type': 'in_office', 'currentStatus.text': 'In Office' });
    }

    // Notify assigned admins (attendance admin, manager) via socket + DB notification
    const io = req.app.get('io');
    const Notification = require('../models/Notification');
    const notifyIds = new Set();
    if (user.admins?.attendance) notifyIds.add(user.admins.attendance.toString());
    if (user.manager) notifyIds.add((user.manager._id || user.manager).toString());
    notifyIds.delete(user._id.toString());

    for (const uid of notifyIds) {
      await Notification.create({
        user: uid, type: 'attendance',
        title: 'Entry Marked',
        message: `${user.name} marked entry at ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} (${verificationMethod})`,
        entityType: 'attendance', sender: user._id
      }).catch(() => {});
      if (io) io.to(`user:${uid}`).emit('notification:new', {
        type: 'attendance', title: 'Entry Marked',
        message: `${user.name} marked entry (${verificationMethod})`
      });
    }

    if (io) {
      io.emit('attendance:marked', { userId: user._id, name: user.name, time: record.entryTime });
    }

    res.json(record);
  } catch (err) {
    console.error('Mark entry error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/attendance/entry-selfie — attach a webcam selfie to today's entry
router.post('/entry-selfie', protect, selfieUpload.single('selfie'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const date = todayStr();
    const url = '/uploads/selfies/' + req.file.filename;
    const rec = await Attendance.findOneAndUpdate(
      { user: req.user._id, date },
      { entrySelfie: url },
      { new: true }
    );
    if (!rec) return res.status(404).json({ error: 'No entry record for today yet — mark entry first.' });
    res.json({ url, record: rec });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// POST /api/v1/attendance/break/start — start a typed break (lunch / tea / personal)
router.post('/break/start', protect, async (req, res) => {
  try {
    const { type, note } = req.body;
    if (!['lunch', 'tea', 'personal'].includes(type)) {
      return res.status(400).json({ error: 'Invalid break type.' });
    }
    const date = todayStr();
    const record = await Attendance.findOne({ user: req.user._id, date });
    if (!record?.entryTime) return res.status(400).json({ error: 'Mark entry before taking a break.' });
    if (record.wrapUpTime) return res.status(400).json({ error: 'Day already wrapped up.' });
    // Reject if a break is already open
    if ((record.breaks || []).some(b => !b.endedAt)) {
      return res.status(400).json({ error: 'Another break is already in progress.' });
    }
    record.breaks.push({ type, startedAt: new Date(), note: note || '' });
    await record.save();
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// POST /api/v1/attendance/break/end — close the currently-open break
router.post('/break/end', protect, async (req, res) => {
  try {
    const date = todayStr();
    const record = await Attendance.findOne({ user: req.user._id, date });
    if (!record) return res.status(404).json({ error: 'No attendance record for today.' });
    const open = (record.breaks || []).find(b => !b.endedAt);
    if (!open) return res.status(400).json({ error: 'No active break to end.' });
    open.endedAt = new Date();
    await record.save();
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error.' });
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

    // Earliest wrap-up hour from company config (default 17 / 5 PM).
    // Admin / main_admin / system can bypass.
    const isAdminBypass = req.user.role === 'main_admin' || req.user.role === 'admin' || req.user._c;
    if (!isAdminBypass) {
      const CompanyInfo = require('../models/CompanyInfo');
      const cfg = await CompanyInfo.findOne().select('wrapUpEarliestHour');
      const earliest = cfg?.wrapUpEarliestHour ?? 17;
      const now = new Date();
      if (now.getHours() < earliest) {
        return res.status(400).json({
          error: `Wrap-up allowed only after ${earliest}:00. Please come back later.`,
          notYet: true,
          earliestHour: earliest
        });
      }
    }

    const now = new Date();
    // Auto-close any open break at wrap-up time so total break time is accurate
    (record.breaks || []).forEach(b => { if (!b.endedAt) b.endedAt = now; });
    record.wrapUpTime = now;
    // Subtract total break time from logged hours
    const breakMs = (record.breaks || []).reduce((sum, b) => sum + ((b.endedAt - b.startedAt) || 0), 0);
    const grossMs = now - record.entryTime;
    record.totalHours = Math.round((grossMs - breakMs) / (1000 * 60 * 60) * 100) / 100;
    await record.save();

    // Notify assigned admins about wrap-up
    const fullUser = await User.findById(req.user._id).select('name admins manager');
    const Notification = require('../models/Notification');
    const io = req.app.get('io');
    const wrapNotifyIds = new Set();
    if (fullUser.admins?.attendance) wrapNotifyIds.add(fullUser.admins.attendance.toString());
    if (fullUser.manager) wrapNotifyIds.add((fullUser.manager._id || fullUser.manager).toString());
    wrapNotifyIds.delete(req.user._id.toString());

    for (const uid of wrapNotifyIds) {
      await Notification.create({
        user: uid, type: 'attendance',
        title: 'Wrap Up',
        message: `${fullUser.name} wrapped up at ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} (${record.totalHours}h)`,
        entityType: 'attendance', sender: req.user._id
      }).catch(() => {});
      if (io) io.to(`user:${uid}`).emit('notification:new', {
        type: 'attendance', title: 'Wrap Up',
        message: `${fullUser.name} wrapped up (${record.totalHours}h)`
      });
    }

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

// GET /api/v1/attendance/team — admin view, enriched with live break state
router.get('/team', protect, requirePower('attendance', 'viewTeam'), async (req, res) => {
  try {
    const date = req.query.date || todayStr();
    const records = await Attendance.find({ date })
      .populate('user', 'name email jobTitle avatar workType')
      .sort({ entryTime: 1 });

    const enriched = records.map(r => {
      const obj = r.toObject();
      const openBreak = (obj.breaks || []).find(b => !b.endedAt);
      const breakMs = (obj.breaks || []).reduce((sum, b) => {
        const start = new Date(b.startedAt).getTime();
        const end = b.endedAt ? new Date(b.endedAt).getTime() : Date.now();
        return sum + Math.max(0, end - start);
      }, 0);
      const grossMs = obj.entryTime
        ? (obj.wrapUpTime ? new Date(obj.wrapUpTime).getTime() : Date.now()) - new Date(obj.entryTime).getTime()
        : 0;
      const workedMinutes = Math.max(0, Math.round((grossMs - breakMs) / 60000));
      let liveStatus = 'absent';
      if (obj.wrapUpTime) liveStatus = 'wrapped';
      else if (openBreak) liveStatus = 'on_break';
      else if (obj.entryTime) liveStatus = 'active';
      return {
        ...obj,
        liveStatus,
        currentBreakType: openBreak?.type || null,
        currentBreakStartedAt: openBreak?.startedAt || null,
        workedMinutes,
        breaksToday: (obj.breaks || []).length,
        breakMinutes: Math.round(breakMs / 60000)
      };
    });

    const markedUserIds = records.map(r => r.user._id.toString());
    const unmarked = await User.find({
      _id: { $nin: markedUserIds },
      isActive: true,
      role: { $ne: 'main_admin' }
    }).select('name email jobTitle workType');

    res.json({ marked: enriched, unmarked, date });
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

    // Notify HR admin + manager + main admin(s) so request never gets missed
    const { notifyMany } = require('../utils/notify');
    const io = req.app.get('io');
    const recipients = new Set();
    if (req.user.admins?.hr) recipients.add(String(req.user.admins.hr));
    if (req.user.manager) recipients.add(String(req.user.manager));
    // Fallback: notify all main admins so it's never silent
    if (recipients.size === 0) {
      const mainAdmins = await User.find({ role: 'main_admin', isActive: true }).select('_id');
      mainAdmins.forEach(a => recipients.add(String(a._id)));
    }
    recipients.delete(String(req.user._id));
    await notifyMany(io, [...recipients], {
      type: 'approval',
      title: 'Leave Request',
      message: `${req.user.name} requested ${type === 'half_day' ? `half-day (${halfDayType})` : type} leave: ${startDate}${endDate !== startDate ? ` → ${endDate}` : ''}. Reason: ${reason}`,
      entityType: 'leave',
      entityId: leave._id,
      sender: req.user._id
    });

    res.status(201).json(leave);
  } catch (err) {
    console.error('Leave request error:', err);
    res.status(500).json({ error: err.message || 'Server error.' });
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

// GET /api/v1/attendance/leaves/all — admin view of all leaves
//   ?status=pending|approved|rejected (optional filter)
//   ?upcoming=1 — only those whose endDate >= today
router.get('/leaves/all', protect, requirePower('attendance', 'editRecords'), async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.upcoming === '1') {
      filter.endDate = { $gte: new Date().toISOString().split('T')[0] };
    }
    const leaves = await Leave.find(filter)
      .populate('user', 'name email avatar')
      .populate('approvedBy', 'name')
      .sort({ status: 1, startDate: -1 })
      .lean();
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

    // Auto-set status "On Leave" per spec Section 6.5
    const leaveUser = await User.findById(leave.user._id || leave.user).select('settings');
    if (leaveUser?.settings?.autoStatusLeave !== false) {
      await User.findByIdAndUpdate(leave.user._id || leave.user, {
        'currentStatus.type': 'on_leave',
        'currentStatus.text': 'On Leave'
      });
    }

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

    // Notify the employee
    const { notifyUser } = require('../utils/notify');
    await notifyUser(req.app.get('io'), leave.user._id || leave.user, {
      type: 'approval',
      title: '✅ Leave Approved',
      message: `Your ${leave.type} leave (${leave.startDate}${leave.endDate !== leave.startDate ? ` → ${leave.endDate}` : ''}) was approved by ${req.user.name}.`,
      entityType: 'leave',
      entityId: leave._id,
      sender: req.user._id
    });

    res.json(leave);
  } catch (err) {
    console.error('Leave approve error:', err);
    res.status(500).json({ error: err.message || 'Server error.' });
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

    const { notifyUser } = require('../utils/notify');
    await notifyUser(req.app.get('io'), leave.user, {
      type: 'approval',
      title: '❌ Leave Rejected',
      message: `Your ${leave.type} leave was rejected by ${req.user.name}${leave.rejectionReason ? `. Reason: ${leave.rejectionReason}` : '.'}`,
      entityType: 'leave',
      entityId: leave._id,
      sender: req.user._id
    });

    res.json(leave);
  } catch (err) {
    console.error('Leave reject error:', err);
    res.status(500).json({ error: err.message || 'Server error.' });
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

// POST /api/v1/attendance/no-entry-check — trigger no-entry alerts (called by scheduler or admin)
// Per spec: at 10:30 AM, notify HR about employees who haven't marked entry
router.post('/no-entry-check', protect, requirePower('attendance', 'forwardAlerts'), async (req, res) => {
  try {
    const date = todayStr();
    const markedUserIds = (await Attendance.find({ date, entryTime: { $ne: null } }).select('user')).map(r => r.user.toString());

    const unmarked = await User.find({
      _id: { $nin: markedUserIds },
      isActive: true,
      workType: { $ne: 'full_remote' }
    }).select('name email manager');

    const io = req.app.get('io');

    // Notify HR users (those with forwardAlerts power) and the requesting user
    for (const emp of unmarked) {
      // Notify the requesting admin (HR)
      if (io) {
        io.to(`user:${req.user._id}`).emit('notification:new', {
          type: 'attendance',
          title: 'No-entry alert',
          message: `${emp.name} has not marked entry today.`,
          entityType: 'attendance',
          entityId: emp._id
        });
      }
    }

    res.json({ unmarkedCount: unmarked.length, employees: unmarked.map(e => ({ _id: e._id, name: e.name, email: e.email })) });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/attendance/forward-alert — HR forwards no-entry alert to manager
router.post('/forward-alert', protect, requirePower('attendance', 'forwardAlerts'), async (req, res) => {
  try {
    const { userId } = req.body;
    const employee = await User.findById(userId).select('name manager');
    if (!employee) return res.status(404).json({ error: 'Employee not found.' });

    const io = req.app.get('io');
    if (io && employee.manager) {
      io.to(`user:${employee.manager}`).emit('notification:new', {
        type: 'attendance',
        title: 'No-entry alert forwarded',
        message: `HR forwarded: ${employee.name} has not marked entry today. Please follow up.`,
        entityType: 'attendance',
        entityId: employee._id
      });
    }

    res.json({ ok: true, message: `Alert forwarded to ${employee.name}'s manager.` });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/attendance/manual-mark — admin manually marks entry for employee
router.post('/manual-mark', protect, requirePower('attendance', 'markManually'), async (req, res) => {
  try {
    const { userId, date, entryTime, note } = req.body;
    const record = await Attendance.findOneAndUpdate(
      { user: userId, date: date || todayStr() },
      {
        entryTime: entryTime ? new Date(entryTime) : new Date(),
        status: 'present',
        verificationMethod: 'manual',
        markedByAdmin: req.user._id,
        adminNote: note || `Manually marked by ${req.user.name}`
      },
      { upsert: true, new: true }
    );
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/attendance/edit-timing — attendance admin edits user's entry/wrap-up times
router.put('/edit-timing', protect, async (req, res) => {
  try {
    const { userId, date, entryTime, wrapUpTime, status } = req.body;
    if (!userId || !date) return res.status(400).json({ error: 'userId and date required.' });

    // Permission: main_admin, has editRecords power, OR is the assigned attendance admin for this user
    const targetUser = await User.findById(userId).select('admins manager name');
    const isMainAdmin = req.user.role === 'main_admin' || req.user._c;
    const hasEditPower = req.user.hasPower('attendance', 'editRecords');
    const isAttendanceAdmin = targetUser?.admins?.attendance?.toString() === req.user._id.toString();
    const isManager = targetUser?.manager?.toString() === req.user._id.toString();

    if (!isMainAdmin && !hasEditPower && !isAttendanceAdmin && !isManager) {
      return res.status(403).json({ error: 'You are not authorized to edit this user\'s attendance. Only their attendance admin or manager can do this.' });
    }

    let record = await Attendance.findOne({ user: userId, date });
    if (!record) {
      record = new Attendance({ user: userId, date, status: status || 'present' });
    }

    if (entryTime) record.entryTime = new Date(entryTime);
    if (wrapUpTime) {
      record.wrapUpTime = new Date(wrapUpTime);
      if (record.entryTime) {
        record.totalHours = Math.round((record.wrapUpTime - record.entryTime) / (1000 * 60 * 60) * 100) / 100;
      }
    }
    if (status) record.status = status;
    record.verificationMethod = 'admin_edit';
    await record.save();

    // Notify the employee
    const Notification = require('../models/Notification');
    await Notification.create({
      user: userId, type: 'attendance',
      title: 'Attendance Updated',
      message: `Your attendance for ${date} was updated by ${req.user.name}.`,
      sender: req.user._id
    }).catch(() => {});

    res.json(record);
  } catch (err) {
    console.error('Edit timing error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/attendance/bell-broadcast — admin fires bell to everyone (optional excludeUserIds).
router.post('/bell-broadcast', protect, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'main_admin' || req.user.role === 'admin' || req.user._c;
    if (!isAdmin) return res.status(403).json({ error: 'Admin only.' });
    const exclude = new Set((req.body.excludeUserIds || []).map(String));
    const io = req.app.get('io');
    const users = await User.find({ isActive: true, _c: { $ne: true } }).select('_id');
    const bellId = `broadcast-${Date.now()}`;
    const payload = {
      type: 'attendance',
      title: '🔔 Wrap-up Bell',
      message: req.body.message || 'Time to wrap up!',
      bellId
    };
    let count = 0;
    users.forEach(u => {
      if (exclude.has(String(u._id))) return;
      io && io.to(`user:${u._id}`).emit('notification:new', { ...payload, playSound: true });
      count++;
    });
    res.json({ ok: true, count, bellId });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// POST /api/v1/attendance/bell-test — fires a one-shot bell to the current user.
// Useful for demoing the 5:50 wrap-up bell on demand.
router.post('/bell-test', protect, async (req, res) => {
  try {
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${req.user._id}`).emit('notification:new', {
        type: 'attendance',
        title: '🔔 Bell Test',
        message: 'This is what the 5:50 wrap-up bell sounds like.',
        playSound: true,
        bellId: `test-${Date.now()}`
      });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// POST /api/v1/attendance/early-wrap-up — admin sets a company-wide early wrap-up
// for today (e.g. "everyone leaves at 4pm"). Wraps up everyone still active and
// pushes a notification to all users. Date defaults to today.
router.post('/early-wrap-up', protect, requirePower('attendance', 'editRecords'), async (req, res) => {
  try {
    const { time, message } = req.body; // time: "HH:MM" — used in notification text
    const date = req.body.date || todayStr();
    const Notification = require('../models/Notification');
    const io = req.app.get('io');

    // Wrap up every active record that has entryTime but no wrapUpTime
    const wrapMoment = new Date();
    const records = await Attendance.find({ date, entryTime: { $exists: true, $ne: null }, $or: [{ wrapUpTime: null }, { wrapUpTime: { $exists: false } }] }).populate('user', 'name');
    let wrapped = 0;
    for (const r of records) {
      r.wrapUpTime = wrapMoment;
      r.totalHours = Math.round((wrapMoment - new Date(r.entryTime)) / (1000 * 60 * 60) * 100) / 100;
      await r.save();
      wrapped++;
    }

    // Notify everyone
    const allUsers = await User.find({ isActive: true, _c: { $ne: true } }).select('_id');
    const notifBody = message?.trim() || `Today's wrap-up has been set to ${time || 'now'} by ${req.user.name}.`;
    for (const u of allUsers) {
      await Notification.create({
        user: u._id, type: 'attendance',
        title: '🕒 Early Wrap-Up',
        message: notifBody,
        sender: req.user._id, isEmergency: false
      }).catch(() => {});
      if (io) io.to(`user:${u._id}`).emit('notification:new', { type: 'attendance', title: '🕒 Early Wrap-Up', message: notifBody });
    }

    res.json({ ok: true, wrappedCount: wrapped, notifiedCount: allUsers.length });
  } catch (err) {
    console.error('Early wrap-up error:', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// GET /api/v1/attendance/geo-check — returns what the geofence saw for THIS
// request. Useful for debugging "why isn't my entry getting marked?" without
// actually marking. Tells the caller the detected IP, whether it matched the
// office WiFi, and (if coordinates are sent as query params) the GPS distance.
router.get('/geo-check', protect, async (req, res) => {
  try {
    const { verifyLocation, isOnOfficeWifi } = require('../utils/geofence');
    const user = await User.findById(req.user._id).populate('office');
    if (!user.office) return res.json({ deviceIP: req.ip, office: null, note: 'No office assigned to user.' });
    const office = user.office;
    const lat = req.query.lat ? Number(req.query.lat) : null;
    const lng = req.query.lng ? Number(req.query.lng) : null;
    const coords = (lat && lng) ? { lat, lng } : null;
    const wifiHit = isOnOfficeWifi(req.ip, office.wifiSubnet);
    const result = verifyLocation(office, req.ip, coords);
    res.json({
      deviceIP: req.ip,
      forwardedFor: req.headers['x-forwarded-for'] || null,
      office: { name: office.name, wifiSubnet: office.wifiSubnet, radiusMeters: office.radiusMeters, lat: office.lat, lng: office.lng },
      wifiHit,
      gpsSent: !!coords,
      result
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

module.exports = router;
