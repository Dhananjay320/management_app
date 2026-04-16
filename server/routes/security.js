const router = require('express').Router();
const User = require('../models/User');
const { OTP } = require('../utils/otp');
const { protect, requirePower } = require('../middleware/auth');

// GET /api/v1/security/pending-otps
router.get('/pending-otps', protect, requirePower('security', 'viewOTPs'), async (req, res) => {
  try {
    const otps = await OTP.find({ isUsed: false, expiresAt: { $gt: new Date() } })
      .populate('userId', 'name email')
      .sort({ createdAt: -1 });
    res.json(otps);
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
    const sessions = await User.find({ refreshToken: { $ne: null }, isActive: true })
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

module.exports = router;
