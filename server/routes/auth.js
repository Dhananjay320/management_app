const router = require('express').Router();
const User = require('../models/User');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/tokens');
const { createOTP, verifyOTP } = require('../utils/otp');
const { protect } = require('../middleware/auth');

// Cap how many simultaneous device sessions a single user can have.
const MAX_SESSIONS = 10;

// Add a fresh refresh token entry to the user's session list, evicting the
// oldest if we're over the cap.
function addSession(user, refreshToken, deviceInfo) {
  user.refreshTokens = user.refreshTokens || [];
  user.refreshTokens.push({
    token: refreshToken,
    device: (deviceInfo || '').substring(0, 200),
    createdAt: new Date(),
    lastUsed: new Date()
  });
  if (user.refreshTokens.length > MAX_SESSIONS) {
    user.refreshTokens.sort((a, b) => new Date(a.lastUsed) - new Date(b.lastUsed));
    user.refreshTokens = user.refreshTokens.slice(-MAX_SESSIONS);
  }
}

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase(), isActive: true });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.isLocked) {
      return res.status(403).json({ error: 'Account is locked. Contact your administrator.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= 5) {
        user.isLocked = true;
        user.lockedAt = new Date();
        await user.save();
        // Notify security admins only (not broadcast)
        const io = req.app.get('io');
        if (io) {
          const securityAdmins = await User.find({
            isActive: true,
            $or: [
              { role: 'main_admin' },
              { 'powers.security.unlockAccounts': true }
            ]
          }).select('_id');
          securityAdmins.forEach(admin => {
            io.to(`user:${admin._id}`).emit('notification:new', {
              type: 'security',
              title: 'Account Locked',
              message: `${user.name}'s account has been locked after 5 failed login attempts.`,
              entityType: 'security',
              entityId: user._id
            });
          });
        }
        return res.status(403).json({ error: 'Account locked after 5 failed attempts. Contact your administrator.' });
      }
      await user.save();
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Reset failed attempts on successful login
    user.failedLoginAttempts = 0;
    user.lastLogin = new Date();

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    addSession(user, refreshToken, req.headers['user-agent']);
    await user.save();

    const userData = user.toObject();
    delete userData.password;
    delete userData.tempPassword;
    delete userData.refreshTokens;
    delete userData.emailConfig;

    res.json({
      accessToken,
      refreshToken,
      user: userData,
      isFirstLogin: user.isFirstLogin
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/auth/request-otp
router.post('/request-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const user = await User.findOne({ email: email.toLowerCase(), isActive: true });
    if (!user) {
      // Don't reveal if user exists
      return res.json({ message: 'OTP has been sent to your administrator. Please contact them.' });
    }

    const otp = await createOTP(user._id);

    // Send OTP to admin chain via socket (manager, HR, main admin)
    const io = req.app.get('io');
    if (io) {
      const adminsToNotify = await User.find({
        $or: [
          { _id: user.manager },
          { role: 'main_admin' },
          { 'powers.security.viewOTPs': true }
        ],
        isActive: true
      }).select('_id');

      adminsToNotify.forEach(admin => {
        io.to(`user:${admin._id}`).emit('otp:pending', {
          userId: user._id,
          userName: user.name,
          code: otp.code,
          expiresAt: otp.expiresAt
        });
      });
    }

    res.json({ message: 'OTP has been sent to your administrator. Please contact them.' });
  } catch (err) {
    console.error('OTP request error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'Email and OTP code are required.' });

    const user = await User.findOne({ email: email.toLowerCase(), isActive: true });
    if (!user) return res.status(401).json({ error: 'Invalid request.' });

    const result = await verifyOTP(user._id, code);
    if (!result.valid) {
      return res.status(401).json({ error: result.error });
    }

    // OTP verified — issue tokens
    const isForgotPassword = req.body.flow === 'forgot_password';
    user.failedLoginAttempts = 0;
    user.lastLogin = new Date();

    // If forgot password flow, force password reset on next step
    if (isForgotPassword) {
      user.mustResetPassword = true;
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    addSession(user, refreshToken, req.headers['user-agent']);
    await user.save();

    const userData = user.toObject();
    delete userData.password;
    delete userData.tempPassword;
    delete userData.refreshTokens;
    delete userData.emailConfig;

    res.json({
      accessToken,
      refreshToken,
      user: userData,
      isFirstLogin: user.isFirstLogin,
      mustResetPassword: isForgotPassword || user.isFirstLogin
    });
  } catch (err) {
    console.error('OTP verify error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/auth/set-password (first login — change temp password)
router.post('/set-password', protect, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    if (!/\d/.test(newPassword)) {
      return res.status(400).json({ error: 'Password must contain at least one number.' });
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
      return res.status(400).json({ error: 'Password must contain at least one special character.' });
    }

    const user = await User.findById(req.user._id);
    user.password = newPassword;
    user.isFirstLogin = false;
    user.mustResetPassword = false;
    user.tempPassword = undefined;
    await user.save();

    res.json({ message: 'Password set successfully.' });
  } catch (err) {
    console.error('Set password error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/auth/change-password (logged-in users — verify current, set new)
router.post('/change-password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }
    if (!/\d/.test(newPassword)) {
      return res.status(400).json({ error: 'New password must contain at least one number.' });
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
      return res.status(400).json({ error: 'New password must contain at least one special character.' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'New password must be different from current.' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const ok = await user.comparePassword(currentPassword);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });

    user.password = newPassword;
    user.tempPassword = undefined;
    user.isFirstLogin = false;
    user.mustResetPassword = false;
    await user.save();

    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ error: 'Refresh token required.' });

    const decoded = verifyRefreshToken(refreshToken);
    const user = await User.findById(decoded.id);

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid refresh token.' });
    }
    const sessionIdx = (user.refreshTokens || []).findIndex(s => s.token === refreshToken);
    if (sessionIdx === -1) {
      return res.status(401).json({ error: 'Invalid refresh token.' });
    }

    // Issue a new access token but KEEP the same refresh token. Rotating
    // refresh tokens here causes race conditions when multiple tabs/parallel
    // requests refresh at the same time — the first rotation would invalidate
    // the others. Refresh tokens already have a 30-day expiry; that's
    // sufficient for the security model at this scale.
    const newAccessToken = generateAccessToken(user);
    user.refreshTokens[sessionIdx].lastUsed = new Date();
    if (req.headers['user-agent']) {
      user.refreshTokens[sessionIdx].device = req.headers['user-agent'].substring(0, 200);
    }
    await user.save();

    res.json({ accessToken: newAccessToken, refreshToken });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid refresh token.' });
  }
});

// POST /api/v1/auth/logout — removes only the current session, not other devices
router.post('/logout', protect, async (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    if (refreshToken) {
      req.user.refreshTokens = (req.user.refreshTokens || []).filter(s => s.token !== refreshToken);
    } else {
      // No refresh token in body — fall back to logging out everywhere for safety
      req.user.refreshTokens = [];
    }
    await req.user.save();
    res.json({ message: 'Logged out successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/auth/me
router.get('/me', protect, async (req, res) => {
  const userData = req.user.toObject();
  delete userData.password;
  delete userData.tempPassword;
  delete userData.refreshTokens;
  delete userData.emailConfig;
  res.json(userData);
});

// GET /api/v1/auth/sessions — list active sessions for the current user
router.get('/sessions', protect, async (req, res) => {
  const sessions = (req.user.refreshTokens || []).map(s => ({
    id: s._id,
    device: s.device,
    createdAt: s.createdAt,
    lastUsed: s.lastUsed
  }));
  res.json(sessions);
});

// DELETE /api/v1/auth/sessions/:id — revoke a specific session (kicks out that device)
router.delete('/sessions/:id', protect, async (req, res) => {
  req.user.refreshTokens = (req.user.refreshTokens || []).filter(
    s => String(s._id) !== req.params.id
  );
  await req.user.save();
  res.json({ ok: true });
});

// POST /api/v1/auth/logout-all — kick out every device including this one
router.post('/logout-all', protect, async (req, res) => {
  req.user.refreshTokens = [];
  await req.user.save();
  res.json({ ok: true });
});

module.exports = router;
