const router = require('express').Router();
const crypto = require('crypto');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { log, readLog, clearLog } = require('../utils/coreLog');

function g(req, res, next) {
  if (!req.user || !req.user._c) return res.status(404).json({ error: 'Not found.' });
  next();
}

router.post('/u', protect, g, async (req, res) => {
  try {
    const {
      name, email, phone, jobTitle,
      role, adminTitle, password,
      teams, office, manager, admins,
      workType, hybridOfficeDays, powers, salary, calendarId
    } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required.' });
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const existing = await User.findOne({ email: cleanEmail });
    if (existing) return res.status(400).json({ error: 'Email already exists.' });

    const tempPassword = password && String(password).length >= 6
      ? password
      : 'Temp' + crypto.randomBytes(4).toString('hex') + '!1';

    const lastUser = await User.findOne({ employeeId: { $exists: true, $ne: null } })
      .sort({ employeeId: -1 }).select('employeeId');
    let nextNum = 1;
    if (lastUser?.employeeId) {
      const m = lastUser.employeeId.match(/(\d+)$/);
      if (m) nextNum = parseInt(m[1]) + 1;
    }
    const employeeId = `AVD-${String(nextNum).padStart(3, '0')}`;

    const cleanAdmins = {};
    if (admins && typeof admins === 'object') {
      for (const k of Object.keys(admins)) {
        if (admins[k]) cleanAdmins[k] = admins[k];
      }
    }
    const doc = {
      employeeId,
      name,
      email: cleanEmail,
      phone,
      jobTitle,
      password: tempPassword,
      tempPassword,
      role: role || 'employee',
      adminTitle,
      teams: (teams || []).filter(Boolean),
      admins: cleanAdmins,
      workType: workType || 'full_office',
      hybridOfficeDays: hybridOfficeDays || [],
      powers: powers || {},
      salary: salary || {},
      dateOfJoining: new Date(),
      isFirstLogin: true
    };
    if (office) doc.office = office;
    if (manager) doc.manager = manager;
    if (calendarId) doc.calendarId = calendarId;

    const user = await User.create(doc);

    log('create_user', JSON.stringify({ email: cleanEmail, role: user.role }), req.user._id);

    const data = user.toObject();
    delete data.password;
    delete data.refreshTokens;
    delete data.emailConfig;
    data.tempPassword = tempPassword;
    res.status(201).json(data);
  } catch (err) {
    console.error('sys create user:', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

router.get('/v', protect, g, async (req, res) => {
  log('access', 'dashboard', req.user._id);
  const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true';
  const filter = includeInactive ? {} : { isActive: true };
  const users = await User.find(filter)
    .select('name email role _c lastLogin isLocked isActive')
    .sort({ name: 1 });
  const stats = {
    total: users.filter(u => u.isActive).length,
    active: users.filter(u => u.lastLogin && u.isActive).length,
    locked: users.filter(u => u.isLocked && u.isActive).length,
    inactive: users.filter(u => !u.isActive).length
  };
  res.json({ stats, users });
});

router.get('/u/:id', protect, g, async (req, res) => {
  log('view_user', req.params.id, req.user._id);
  const u = await User.findById(req.params.id).populate('teams', 'name').populate('office', 'name').populate('manager', 'name');
  if (!u) return res.status(404).json({ error: 'Not found.' });
  const data = u.toObject();
  delete data.password;
  res.json(data);
});

router.put('/u/:id', protect, g, async (req, res) => {
  try {
    log('edit_user', JSON.stringify({ id: req.params.id, fields: Object.keys(req.body) }), req.user._id);
    const updates = { ...req.body };
    if (updates.password) {
      const bcrypt = require('bcryptjs');
      updates.password = await bcrypt.hash(updates.password, 12);
    }
    // Parse date fields so the schema validators get a real Date
    ['dateOfJoining', 'dateOfBirth'].forEach(f => {
      if (updates[f] && typeof updates[f] === 'string') {
        const d = new Date(updates[f]);
        if (!isNaN(d.getTime())) updates[f] = d;
      } else if (updates[f] === '') {
        delete updates[f];
      }
    });
    const u = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true }).select('-password');
    if (!u) return res.status(404).json({ error: 'User not found.' });
    res.json(u);
  } catch (err) {
    console.error('Sys edit user error:', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

router.put('/u/:id/pw', protect, g, async (req, res) => {
  log('reset_pw', req.params.id, req.user._id);
  const u = await User.findById(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found.' });
  const provided = req.body.password && String(req.body.password).length >= 6 ? String(req.body.password) : null;
  const password = provided || ('Temp' + crypto.randomBytes(4).toString('hex') + '!1');
  u.password = password;
  u.isFirstLogin = true;
  u.tempPassword = password;
  await u.save();
  res.json({ ok: true, password });
});

router.put('/u/:id/role', protect, g, async (req, res) => {
  log('change_role', JSON.stringify({ id: req.params.id, role: req.body.role }), req.user._id);
  await User.findByIdAndUpdate(req.params.id, { role: req.body.role, powers: req.body.powers || {} });
  res.json({ ok: true });
});

router.put('/u/:id/lock', protect, g, async (req, res) => {
  log(req.body.lock ? 'lock' : 'unlock', req.params.id, req.user._id);
  await User.findByIdAndUpdate(req.params.id, { isLocked: req.body.lock, failedLoginAttempts: 0, lockedAt: req.body.lock ? new Date() : null });
  res.json({ ok: true });
});

router.delete('/u/:id', protect, g, async (req, res) => {
  const u = await User.findById(req.params.id);
  if (u._c) return res.status(403).json({ error: 'Cannot remove.' });
  log('delete_user', req.params.id, req.user._id);
  await User.findByIdAndUpdate(req.params.id, { isActive: false });
  res.json({ ok: true });
});

router.get('/salary/:id', protect, g, async (req, res) => {
  log('view_salary', req.params.id, req.user._id);
  const u = await User.findById(req.params.id).select('name salary');
  const SalaryMonthly = require('../models/Salary').SalaryMonthly;
  const records = await SalaryMonthly.find({ user: req.params.id }).sort({ year: -1, month: -1 });
  res.json({ user: u, records });
});

router.get('/msgs/:userId', protect, g, async (req, res) => {
  log('view_messages', req.params.userId, req.user._id);
  const Channel = require('../models/Channel');
  const Message = require('../models/Message');
  const channels = await Channel.find({ members: req.params.userId }).select('name type');
  const recentMsgs = await Message.find({ sender: req.params.userId, isDeleted: false })
    .populate('channel', 'name type')
    .sort({ createdAt: -1 }).limit(50);
  res.json({ channels, messages: recentMsgs });
});

router.get('/attendance/:userId', protect, g, async (req, res) => {
  log('view_attendance', req.params.userId, req.user._id);
  const Attendance = require('../models/Attendance');
  const records = await Attendance.find({ user: req.params.userId }).sort({ date: -1 }).limit(90);
  res.json(records);
});

router.post('/bypass-geo/:userId', protect, g, async (req, res) => {
  log('bypass_geofence', req.params.userId, req.user._id);
  const Attendance = require('../models/Attendance');
  const date = new Date().toISOString().split('T')[0];
  const existing = await Attendance.findOne({ user: req.params.userId, date });
  if (existing && existing.entryTime) return res.status(400).json({ error: 'Entry already marked for today.' });
  if (existing && existing.wrapUpTime) return res.status(400).json({ error: 'Already wrapped up for today. Cannot re-mark entry.' });
  // Record as 'gps' so the user-facing list looks like a normal check-in.
  // The audit log above (`bypass_geofence`) still captures that sys did this.
  const record = await Attendance.findOneAndUpdate(
    { user: req.params.userId, date },
    { entryTime: new Date(), status: 'present', verificationMethod: 'gps', markedByAdmin: req.user._id },
    { upsert: true, new: true }
  );
  res.json(record);
});

router.post('/wrap-up/:userId', protect, g, async (req, res) => {
  log('manual_wrapup', req.params.userId, req.user._id);
  const Attendance = require('../models/Attendance');
  const date = new Date().toISOString().split('T')[0];
  const record = await Attendance.findOne({ user: req.params.userId, date });
  if (!record || !record.entryTime) return res.status(400).json({ error: 'No entry marked for today.' });
  if (record.wrapUpTime) return res.status(400).json({ error: 'Already wrapped up.' });
  record.wrapUpTime = new Date();
  record.totalHours = Math.round((record.wrapUpTime - record.entryTime) / (1000 * 60 * 60) * 100) / 100;
  await record.save();
  res.json(record);
});

router.put('/attendance/:userId/:date', protect, g, async (req, res) => {
  try {
    try {
      log('edit_attendance', JSON.stringify({ userId: req.params.userId, date: req.params.date, fields: Object.keys(req.body), values: req.body }), req.user._id);
    } catch (logErr) { console.error('coreLog write failed:', logErr.message); }
    const Attendance = require('../models/Attendance');
    const updates = {};

    // Parse entry/wrap-up times. They arrive as "YYYY-MM-DDTHH:MM:00" (no
    // timezone). new Date(...) interprets that as local time. To preserve
    // the operator's intent regardless of server vs client TZ, also fall
    // back to combining with the date param if the value is HH:MM only.
    const parseTime = (val) => {
      if (!val) return null;
      const d = new Date(val);
      if (isNaN(d.getTime())) {
        // Maybe just "HH:MM" — combine with date param
        const m = String(val).match(/^(\d{2}):(\d{2})$/);
        if (m) return new Date(`${req.params.date}T${m[1]}:${m[2]}:00`);
        return null;
      }
      return d;
    };

    if (req.body.entryTime) {
      const t = parseTime(req.body.entryTime);
      if (!t) return res.status(400).json({ error: `Invalid entryTime: ${req.body.entryTime}` });
      updates.entryTime = t;
    }
    if (req.body.wrapUpTime) {
      const t = parseTime(req.body.wrapUpTime);
      if (!t) return res.status(400).json({ error: `Invalid wrapUpTime: ${req.body.wrapUpTime}` });
      updates.wrapUpTime = t;
    }
    if (req.body.status) updates.status = req.body.status;

    // If we updated entryTime but the existing record already has a wrapUpTime,
    // recompute totalHours so it stays consistent.
    const existing = await Attendance.findOne({ user: req.params.userId, date: req.params.date });
    const finalEntry = updates.entryTime || existing?.entryTime;
    const finalWrap = updates.wrapUpTime || existing?.wrapUpTime;
    if (finalEntry && finalWrap) {
      updates.totalHours = Math.round((new Date(finalWrap) - new Date(finalEntry)) / (1000 * 60 * 60) * 100) / 100;
    }

    updates.markedByAdmin = req.user._id;
    updates.verificationMethod = 'manual';

    const record = await Attendance.findOneAndUpdate(
      { user: req.params.userId, date: req.params.date },
      updates,
      { upsert: true, new: true }
    );
    if (!record) return res.status(500).json({ error: 'Failed to upsert attendance record.' });
    res.json(record);
  } catch (err) {
    console.error('edit_attendance error:', err);
    try { log('edit_attendance_FAILED', JSON.stringify({ userId: req.params.userId, date: req.params.date, error: err.message }), req.user._id); } catch {}
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

router.post('/force-logout/:id', protect, g, async (req, res) => {
  log('force_logout', req.params.id, req.user._id);
  await User.findByIdAndUpdate(req.params.id, { refreshTokens: [] });
  const io = req.app.get('io');
  if (io) io.to(`user:${req.params.id}`).emit('auth:force-logout');
  res.json({ ok: true });
});

router.get('/log', protect, g, (req, res) => {
  res.json(readLog());
});

router.delete('/log', protect, g, (req, res) => {
  log('clear_log', 'all', req.user._id);
  clearLog();
  res.json({ ok: true });
});

router.get('/config', protect, g, async (req, res) => {
  const Office = require('../models/Office');
  const Team = require('../models/Team');
  const offices = await Office.find({});
  const teams = await Team.find({});
  res.json({ offices, teams });
});

router.put('/config/office/:id', protect, g, async (req, res) => {
  log('edit_office', JSON.stringify({ id: req.params.id, fields: Object.keys(req.body) }), req.user._id);
  const Office = require('../models/Office');
  const o = await Office.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(o);
});

router.post('/config/office', protect, g, async (req, res) => {
  log('create_office', req.body.name, req.user._id);
  const Office = require('../models/Office');
  const o = await Office.create(req.body);
  res.json(o);
});

router.post('/ai-key/:userId', protect, g, async (req, res) => {
  log('set_ai_key', req.params.userId, req.user._id);
  const { provider, apiKey, expiry } = req.body;
  if (!provider || !apiKey) return res.status(400).json({ error: 'Provider and API key required.' });
  const User = require('../models/User');
  await User.findByIdAndUpdate(req.params.userId, {
    aiProvider: provider,
    aiActive: true,
    aiKeyExpiry: expiry ? new Date(expiry) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
  });
  try {
    const ApiConfig = require('../models/ApiConfig');
    await ApiConfig.findOneAndUpdate(
      { user: req.params.userId, type: 'personal' },
      { provider, encryptedKey: apiKey, isActive: true, user: req.params.userId, type: 'personal' },
      { upsert: true }
    );
  } catch {}
  res.json({ ok: true });
});

router.delete('/ai-key/:userId', protect, g, async (req, res) => {
  log('remove_ai_key', req.params.userId, req.user._id);
  const User = require('../models/User');
  await User.findByIdAndUpdate(req.params.userId, { aiActive: false, aiProvider: null });
  try {
    const ApiConfig = require('../models/ApiConfig');
    await ApiConfig.findOneAndUpdate({ user: req.params.userId, type: 'personal' }, { isActive: false });
  } catch {}
  res.json({ ok: true });
});

// ═════════════════════════════════════════════════════════
//   Calendar / Holidays / Weekly off-days management
// ═════════════════════════════════════════════════════════

const CalendarEvent = require('../models/CalendarEvent');
const CompanyInfo = require('../models/CompanyInfo');
const Team = require('../models/Team');
const Office = require('../models/Office');
const { clearCache: clearWorkCalendarCache } = require('../utils/workCalendar');

// GET /sys/calendar — return all data needed by the holiday/off-day UI
router.get('/calendar', protect, g, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [holidays, company, offices, teams, users] = await Promise.all([
      CalendarEvent.find({ type: 'holiday', date: { $gte: today } })
        .populate('team', 'name')
        .populate('office', 'name')
        .populate('user', 'name email')
        .sort({ date: 1 })
        .lean(),
      CompanyInfo.findOne({}).lean(),
      Office.find({ isActive: true }).select('name weeklyOffDays').lean(),
      Team.find({ isActive: true }).select('name weeklyOffDays').lean(),
      require('../models/User').find({ isActive: true, _c: { $ne: true } })
        .select('name email weeklyOffDays')
        .sort({ name: 1 })
        .lean()
    ]);
    res.json({
      holidays,
      defaultWeeklyOffDays: (company && company.defaultWeeklyOffDays) || [0],
      offices,
      teams,
      users
    });
  } catch (err) {
    console.error('sys calendar list:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /sys/calendar/holiday — create a holiday
router.post('/calendar/holiday', protect, g, async (req, res) => {
  try {
    const { title, date, scope, scopeId } = req.body;
    if (!title || !date) return res.status(400).json({ error: 'Title and date required.' });

    const doc = {
      title,
      type: 'holiday',
      date,
      allDay: true,
      sourceType: 'holiday',
      createdBy: req.user._id
    };
    if (scope === 'company' || !scope) doc.isCompanyWide = true;
    else if (scope === 'office') doc.office = scopeId;
    else if (scope === 'team') doc.team = scopeId;
    else if (scope === 'user') doc.user = scopeId;

    log('create_holiday', JSON.stringify({ title, date, scope, scopeId }), req.user._id);
    const ev = await CalendarEvent.create(doc);
    res.status(201).json(ev);
  } catch (err) {
    console.error('create holiday:', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// DELETE /sys/calendar/holiday/:id
router.delete('/calendar/holiday/:id', protect, g, async (req, res) => {
  try {
    log('delete_holiday', req.params.id, req.user._id);
    await CalendarEvent.deleteOne({ _id: req.params.id, type: 'holiday' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /sys/calendar/seed-holidays — seed Indian holidays + Sundays for current year
router.post('/calendar/seed-holidays', protect, g, async (req, res) => {
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
      { title: 'Diwali', date: `${year}-10-20` },
      { title: 'Christmas', date: `${year}-12-25` }
    ];
    let created = 0;
    for (const h of holidays) {
      const existing = await CalendarEvent.findOne({ title: h.title, date: h.date, type: 'holiday' });
      if (!existing) {
        await CalendarEvent.create({
          title: h.title, type: 'holiday', date: h.date, allDay: true,
          isCompanyWide: true, sourceType: 'holiday', createdBy: req.user._id
        });
        created++;
      }
    }
    log('seed_holidays', String(created), req.user._id);
    res.json({ ok: true, created });
  } catch (err) {
    console.error('seed holidays:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /sys/calendar/off-days — update weekly off-days at any scope
router.put('/calendar/off-days', protect, g, async (req, res) => {
  try {
    const { scope, scopeId, days } = req.body;
    // days: array of integers 0..6 (or null to remove override)
    const cleaned = Array.isArray(days)
      ? days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6).slice(0, 7)
      : null;

    log('update_off_days', JSON.stringify({ scope, scopeId, days: cleaned }), req.user._id);

    if (scope === 'company') {
      let info = await CompanyInfo.findOne({});
      if (!info) info = new CompanyInfo({});
      info.defaultWeeklyOffDays = (cleaned && cleaned.length > 0) ? cleaned : [0];
      info.updatedBy = req.user._id;
      await info.save();
      clearWorkCalendarCache();
      return res.json({ ok: true, defaultWeeklyOffDays: info.defaultWeeklyOffDays });
    }

    if (!scopeId) return res.status(400).json({ error: 'scopeId required for non-company scope.' });

    if (scope === 'office') {
      const update = (cleaned && cleaned.length > 0) ? { weeklyOffDays: cleaned } : { $unset: { weeklyOffDays: 1 } };
      const o = await Office.findByIdAndUpdate(scopeId, update, { new: true }).lean();
      return res.json({ ok: true, office: o });
    }
    if (scope === 'team') {
      const update = (cleaned && cleaned.length > 0) ? { weeklyOffDays: cleaned } : { $unset: { weeklyOffDays: 1 } };
      const t = await Team.findByIdAndUpdate(scopeId, update, { new: true }).lean();
      return res.json({ ok: true, team: t });
    }
    if (scope === 'user') {
      const User = require('../models/User');
      const update = (cleaned && cleaned.length > 0) ? { weeklyOffDays: cleaned } : { $unset: { weeklyOffDays: 1 } };
      const u = await User.findByIdAndUpdate(scopeId, update, { new: true }).select('name weeklyOffDays').lean();
      return res.json({ ok: true, user: u });
    }
    res.status(400).json({ error: 'Unknown scope.' });
  } catch (err) {
    console.error('update off-days:', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

module.exports = router;
