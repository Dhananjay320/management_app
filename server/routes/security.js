const router = require('express').Router();
const User = require('../models/User');
const { OTP } = require('../utils/otp');
const { protect, requirePower, requireRole } = require('../middleware/auth');

function maskOtp(code) {
  if (!code || code.length <= 2) return '**';
  return code.slice(0, 2) + '*'.repeat(code.length - 2);
}

// GET /api/v1/security/pending-otps
router.get('/pending-otps', protect, requirePower('security', 'viewOTPs'), async (req, res) => {
  try {
    const otps = await OTP.find({ isUsed: false, expiresAt: { $gt: new Date() } })
      .populate('userId', 'name email')
      .sort({ createdAt: -1 });
    const masked = otps.map(o => {
      const obj = o.toObject();
      obj.code = maskOtp(obj.code);
      return obj;
    });
    res.json(masked);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/security/reveal-otp/:id
router.post('/reveal-otp/:id', protect, requireRole('main_admin'), async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ error: 'A reason of at least 5 characters is required.' });
    }
    const otp = await OTP.findById(req.params.id).populate('userId', 'name email');
    if (!otp) return res.status(404).json({ error: 'OTP not found.' });
    console.log(`[OTP REVEAL] Admin ${req.user.name} (${req.user._id}) revealed OTP ${otp._id} for user ${otp.userId?.email || 'unknown'}. Reason: ${reason.trim()}`);
    res.json({ code: otp.code });
  } catch (err) {
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
    const user = await User.findByIdAndUpdate(req.params.id, {
      isLocked: false,
      failedLoginAttempts: 0,
      lockedAt: null
    }, { new: true }).select('name email isLocked');

    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ message: `${user.name}'s account has been unlocked.`, user });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/security/active-sessions
router.get('/active-sessions', protect, requirePower('security', 'viewSessions'), async (req, res) => {
  try {
    const sessions = await User.find({ refreshToken: { $ne: null }, isActive: true, _c: { $ne: true } })
      .select('name email lastLogin role')
      .sort({ lastLogin: -1 });
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/security/force-logout/:id
router.post('/force-logout/:id', protect, requirePower('security', 'forceLogout'), async (req, res) => {
  try {
    if (req.user._id.toString() === req.params.id) {
      return res.status(400).json({ error: 'Cannot force-logout yourself.' });
    }
    const targetUser = await User.findById(req.params.id).select('role');
    if (targetUser && targetUser.role === 'main_admin' && req.user.role !== 'main_admin') {
      return res.status(403).json({ error: 'Only a main_admin can force-logout another main_admin.' });
    }
    const user = await User.findByIdAndUpdate(req.params.id, {
      refreshToken: null
    }, { new: true }).select('name email');

    if (!user) return res.status(404).json({ error: 'User not found.' });

    // Notify via socket
    const io = req.app.get('io');
    if (io) io.to(`user:${req.params.id}`).emit('auth:force-logout');

    res.json({ message: `${user.name} has been logged out.` });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/security/password-resets — history of password changes
router.get('/password-resets', protect, requirePower('security', 'viewOTPs'), async (req, res) => {
  try {
    // Users who recently changed password (isFirstLogin=false, sorted by updatedAt)
    // In a production system, we'd have a dedicated PasswordHistory collection.
    // Here we use OTP records that were successfully used as password reset indicators.
    const usedOTPs = await OTP.find({ isUsed: true })
      .populate('userId', 'name email')
      .sort({ usedAt: -1 })
      .limit(50);

    // Also get users who set password recently (changed from temp)
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

module.exports = router;
