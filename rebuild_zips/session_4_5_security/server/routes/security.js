const router = require('express').Router();
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { OTP } = require('../utils/otp');
const { logAction, maskCode } = require('../utils/audit');
const { protect, requirePower } = require('../middleware/auth');

// ═══════════════════════════════════════════════════════════════════════════
// Session 4 security fixes applied in this file:
//   S1 — OTP codes masked by default; full reveal requires explicit request
//        and writes an audit log entry
//   S2 — Every OTP reveal logged to AuditLog
//   S11 — main_admin protected from force-logout by lesser admins
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/v1/security/pending-otps — returns MASKED codes by default
router.get('/pending-otps', protect, requirePower('security', 'viewOTPs'), async (req, res) => {
  try {
    const otps = await OTP.find({ isUsed: false, expiresAt: { $gt: new Date() } })
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .lean();  // Use lean so we can mutate safely

    // S1: mask every code. Full code only revealed via separate endpoint.
    const masked = otps.map(o => ({
      ...o,
      code: maskCode(o.code),
      isMasked: true,
    }));

    // Light audit trail — listing is less sensitive than revealing
    logAction(req, 'otp.list', { meta: { count: masked.length } });

    res.json(masked);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/security/reveal-otp/:id — explicit reveal with reason required
// Only main_admin can reveal in plaintext; lower admins only see masked codes.
router.post('/reveal-otp/:id', protect, requirePower('security', 'viewOTPs'), async (req, res) => {
  try {
    // S1: restrict full reveal to main_admin
    if (req.user.role !== 'main_admin') {
      return res.status(403).json({
        error: 'Only the main admin can reveal OTP codes in plaintext. Your role can see masked codes only.'
      });
    }

    const { reason } = req.body || {};
    if (!reason || String(reason).trim().length < 5) {
      return res.status(400).json({ error: 'A reason is required to reveal an OTP (minimum 5 characters).' });
    }

    const otp = await OTP.findOne({
      _id: req.params.id,
      isUsed: false,
      expiresAt: { $gt: new Date() },
    }).populate('userId', 'name email');

    if (!otp) return res.status(404).json({ error: 'OTP not found, already used, or expired.' });

    // S2: audit the reveal
    await logAction(req, 'otp.reveal', {
      target: 'OTP',
      targetId: otp._id,
      targetLabel: otp.userId?.name || 'unknown',
      reason: String(reason).trim(),
      meta: { otpType: otp.type, forUser: String(otp.userId?._id) },
    });

    res.json({
      _id: otp._id,
      code: otp.code,
      type: otp.type,
      userId: otp.userId,
      expiresAt: otp.expiresAt,
      revealedAt: new Date(),
    });
  } catch (err) {
    console.error('[security] reveal-otp failed', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/security/locked-accounts
router.get('/locked-accounts', protect, requirePower('security', 'unlockAccounts'), async (req, res) => {
  try {
    const locked = await User.find({ isLocked: true, isActive: true })
      .select('name email lockedAt failedLoginAttempts')
      .sort({ lockedAt: -1 });
    res.json(locked);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/security/unlock/:id
router.post('/unlock/:id', protect, requirePower('security', 'unlockAccounts'), async (req, res) => {
  try {
    const { reason } = req.body || {};
    const user = await User.findByIdAndUpdate(req.params.id, {
      isLocked: false,
      failedLoginAttempts: 0,
      lockedAt: null
    }, { new: true }).select('name email isLocked');

    if (!user) return res.status(404).json({ error: 'User not found.' });

    // Audit the unlock
    await logAction(req, 'account.unlock', {
      target: 'User',
      targetId: user._id,
      targetLabel: user.name,
      reason: reason ? String(reason).trim() : undefined,
    });

    res.json({ message: `${user.name}'s account has been unlocked.`, user });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/security/active-sessions
router.get('/active-sessions', protect, requirePower('security', 'viewSessions'), async (req, res) => {
  try {
    // Fix: removed the mysterious `_c: { $ne: true }` placeholder filter.
    const sessions = await User.find({ refreshToken: { $ne: null }, isActive: true })
      .select('name email lastLogin role')
      .sort({ lastLogin: -1 });
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/security/force-logout/:id
// S11: main_admin is protected; only main_admin can force-logout main_admin.
// Users also cannot force-logout themselves (accidental self-lockout).
router.post('/force-logout/:id', protect, requirePower('security', 'forceLogout'), async (req, res) => {
  try {
    const targetId = String(req.params.id);
    const actorId = String(req.user._id);

    if (targetId === actorId) {
      return res.status(400).json({ error: 'You cannot force-logout yourself. Use normal logout instead.' });
    }

    const target = await User.findById(targetId).select('name email role');
    if (!target) return res.status(404).json({ error: 'User not found.' });

    // S11: block non-main-admin from force-logging-out main_admin
    if (target.role === 'main_admin' && req.user.role !== 'main_admin') {
      return res.status(403).json({ error: 'Only the main admin can force-logout another main admin.' });
    }

    const { reason } = req.body || {};

    await User.findByIdAndUpdate(targetId, { refreshToken: null });

    // Audit
    await logAction(req, 'account.forceLogout', {
      target: 'User',
      targetId: target._id,
      targetLabel: target.name,
      reason: reason ? String(reason).trim() : undefined,
    });

    // Notify via socket
    const io = req.app.get('io');
    if (io) io.to(`user:${targetId}`).emit('auth:force-logout', { by: req.user.name });

    res.json({ message: `${target.name} has been logged out.` });
  } catch (err) {
    console.error('[security] force-logout failed', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/security/password-resets — history of password changes
router.get('/password-resets', protect, requirePower('security', 'viewOTPs'), async (req, res) => {
  try {
    const usedOTPs = await OTP.find({ isUsed: true })
      .populate('userId', 'name email')
      .sort({ usedAt: -1 })
      .limit(50);

    const recentPasswordChanges = await User.find({
      isFirstLogin: false,
      tempPassword: { $exists: false }
    })
      .select('name email updatedAt')
      .sort({ updatedAt: -1 })
      .limit(50);

    res.json({ otpResets: usedOTPs, passwordChanges: recentPasswordChanges });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/security/audit-log — recent security events (main_admin only)
router.get('/audit-log', protect, async (req, res) => {
  try {
    if (req.user.role !== 'main_admin') {
      return res.status(403).json({ error: 'Only the main admin can view audit logs.' });
    }

    const { action, targetId, limit = 100, before } = req.query;
    const query = {};
    if (action) query.action = action;
    if (targetId) query.targetId = targetId;
    if (before) query.createdAt = { $lt: new Date(before) };

    const logs = await AuditLog.find(query)
      .populate('actor', 'name email role')
      .sort({ createdAt: -1 })
      .limit(Math.min(500, Number(limit) || 100));

    res.json(logs);
  } catch (err) {
    console.error('[security] audit-log failed', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
