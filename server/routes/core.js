const router = require('express').Router();
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { log, readLog, clearLog } = require('../utils/coreLog');

function g(req, res, next) {
  if (!req.user || !req.user._c) return res.status(404).json({ error: 'Not found.' });
  next();
}

router.get('/v', protect, g, async (req, res) => {
  log('access', 'dashboard', req.user._id);
  const users = await User.find({ isActive: true }).select('name email role _c lastLogin isLocked').sort({ name: 1 });
  const stats = {
    total: users.length,
    active: users.filter(u => u.lastLogin).length,
    locked: users.filter(u => u.isLocked).length
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
  log('edit_user', JSON.stringify({ id: req.params.id, fields: Object.keys(req.body) }), req.user._id);
  const updates = { ...req.body };
  if (updates.password) {
    const bcrypt = require('bcryptjs');
    updates.password = await bcrypt.hash(updates.password, 12);
  }
  const u = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password');
  res.json(u);
});

router.put('/u/:id/pw', protect, g, async (req, res) => {
  log('reset_pw', req.params.id, req.user._id);
  const u = await User.findById(req.params.id);
  u.password = req.body.password;
  u.isFirstLogin = true;
  u.tempPassword = req.body.password;
  await u.save();
  res.json({ ok: true });
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
  const record = await Attendance.findOneAndUpdate(
    { user: req.params.userId, date },
    { entryTime: new Date(), status: 'present', verificationMethod: 'manual', markedByAdmin: req.user._id },
    { upsert: true, new: true }
  );
  res.json(record);
});

router.post('/force-logout/:id', protect, g, async (req, res) => {
  log('force_logout', req.params.id, req.user._id);
  await User.findByIdAndUpdate(req.params.id, { refreshToken: null });
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

module.exports = router;
