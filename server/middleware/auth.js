const { verifyAccessToken } = require('../utils/tokens');
const User = require('../models/User');

// Protect routes — require valid access token
async function protect(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authorized. No token provided.' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.id).select('-password -tempPassword -emailConfig');
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User not found or deactivated.' });
    }
    if (user.isLocked) {
      return res.status(403).json({ error: 'Account is locked. Contact your administrator.' });
    }
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired.', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token.' });
  }
}

// Require specific role
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient role permissions.' });
    }
    next();
  };
}

// Require specific power
function requirePower(group, power) {
  return (req, res, next) => {
    if (req.user._c || req.user.role === 'main_admin') return next();
    if (req.user.powers?.[group]?.[power] === true) return next();
    return res.status(403).json({ error: 'You do not have permission for this action.' });
  };
}

module.exports = { protect, requireRole, requirePower };
