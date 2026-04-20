// ============================================================================
// audit.js — one-liner helper for logging sensitive admin actions.
//
// Usage:
//   const { logAction } = require('../utils/audit');
//   await logAction(req, 'otp.reveal', { targetId: otp.userId, targetLabel: user.name });
//
// All writes are best-effort — if audit logging fails, we do NOT block the
// primary action. We do, however, console.error so ops can notice.
// ============================================================================

const AuditLog = require('../models/AuditLog');

function logAction(req, action, details = {}) {
  const actor = req.user;
  if (!actor) return Promise.resolve(null);  // Shouldn't happen in protected routes

  const entry = {
    actor: actor._id,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    target: details.target,
    targetId: details.targetId,
    targetLabel: details.targetLabel,
    reason: details.reason,
    meta: details.meta,
    ip: req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
    userAgent: req.headers['user-agent'],
  };

  return AuditLog.create(entry).catch(err => {
    console.error('[audit] failed to log', action, err.message);
    return null;
  });
}

// Convenience: mask an OTP code to its last 2 digits
// e.g., "483921" -> "****21"
function maskCode(code) {
  if (!code) return '';
  const s = String(code);
  if (s.length <= 2) return s;
  return '*'.repeat(Math.max(4, s.length - 2)) + s.slice(-2);
}

module.exports = { logAction, maskCode };
