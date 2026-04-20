// ============================================================================
// AuditLog — tracks sensitive admin actions.
// Used by Security Panel to log OTP reveals, unlocks, force-logouts, etc.
// Created in Session 4 as part of critical security fixes (audit doc Phase 1).
// ============================================================================

const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  // Who performed the action
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  actorName: { type: String },  // Denormalized for historical record
  actorRole: { type: String },

  // What action
  action: {
    type: String,
    required: true,
    enum: [
      'otp.reveal',           // S2 — admin viewed a live OTP code
      'otp.list',             // Listing pending OTPs (less sensitive but still tracked)
      'account.unlock',       // Admin unlocked a locked account
      'account.forceLogout',  // Admin force-logged-out a user
      'password.resetByAdmin',
      'user.delete',
      'user.powerChange',     // Powers granted/revoked
      'notification.send',    // System notification sent
      'ai.keyChange',         // AI API key updated
      'meeting.delete',
      'task.delete',
      'workspace.delete',
    ],
    index: true,
  },

  // What the action targeted
  target: {
    type: String,  // e.g. 'User', 'Meeting', 'Task'
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    index: true,
  },
  targetLabel: { type: String },  // Human-readable (name/title) for historical record

  // Reason — optional free-text from admin ("Why did you do this?")
  reason: { type: String, maxlength: 500 },

  // IP + UA for forensic context
  ip: { type: String },
  userAgent: { type: String },

  // Extra metadata (action-specific payload)
  meta: { type: mongoose.Schema.Types.Mixed },

  createdAt: { type: Date, default: Date.now, index: true },
});

// Efficient lookups by action type + date range
auditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
