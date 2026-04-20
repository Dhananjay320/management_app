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
    return res.status(403).json({
      error: 'You do not have permission for this action.',
      requiredPower: `${group}.${power}`,
    });
  };
}

// Session 10: require ANY of the listed powers. Useful for endpoints that
// can be invoked under multiple privilege flags (e.g. meeting edit: creator
// already checked; falls back to meetings.editAny OR meetings.viewAll).
//
// Usage:
//   requireAnyPower([['tasks', 'deleteAny'], ['tasks', 'editAny']])
function requireAnyPower(pairs) {
  return (req, res, next) => {
    if (req.user._c || req.user.role === 'main_admin') return next();
    for (const [group, power] of pairs) {
      if (req.user.powers?.[group]?.[power] === true) return next();
    }
    return res.status(403).json({
      error: 'You do not have permission for this action.',
      requiredAnyOf: pairs.map(([g, p]) => `${g}.${p}`),
    });
  };
}

// Session 10: require admin scope to include a specific team or office.
// Use on routes where a scoped admin should only touch their assigned teams.
//
// Usage:
//   router.put('/attendance/bulk-mark', protect,
//              requirePower('attendance', 'markManually'),
//              requireAdminScope('teams', (req) => req.body.teamId),
//              handler);
function requireAdminScope(kind, getIdFromReq) {
  return (req, res, next) => {
    if (req.user.role === 'main_admin') return next();
    const targetId = getIdFromReq(req);
    if (!targetId) return next();  // if unspecified, skip scope check (handler may decide)
    if (req.user.isInAdminScope(kind, targetId)) return next();
    return res.status(403).json({
      error: `This action is restricted to admins assigned to this ${kind.slice(0, -1)}.`,
    });
  };
}

module.exports = { protect, requireRole, requirePower, requireAnyPower, requireAdminScope };
