// ============================================================================
// Follow.js — user-follows-user relationship.
// ============================================================================
// Session 25 (N4). One user "follows" another to keep up with their
// progress, mentor them, or just stay socially connected. Follows can be:
//
//   Open-ended  (endAt: null)    — indefinite, like a classic social-media follow
//   Time-bounded (endAt: Date)   — "follow Priya until Dec 1" for a project window
//
// A cleanup cron can deactivate bounded follows whose endAt is past, but
// since the `isActive` field is a boolean, queries can also filter
// on-demand via `{ isActive: true, $or: [{ endAt: null }, { endAt: { $gt: now } }] }`.
// ============================================================================

const mongoose = require('mongoose');

const followSchema = new mongoose.Schema({
  follower:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  following: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  // Optional: date the follow expires automatically. Null = indefinite.
  endAt: { type: Date, default: null },

  // Short user-supplied reason: "mentoring", "project X", "daily standup watch"
  note: { type: String, default: '', maxlength: 200 },

  // Is this follow still active? Cancelled follows are kept in the DB as
  // an audit record but excluded from most queries.
  isActive: { type: Boolean, default: true, index: true },

  // Who saw the follow notification? Used to dedupe "X is following you" toasts.
  notifiedAt: { type: Date },
}, { timestamps: true });

// One active follow per (follower, following) pair. Cancelled follows are
// allowed to stack as historical records, so the uniqueness is enforced in
// the route handler (not with a schema-level unique index).
followSchema.index({ follower: 1, following: 1, isActive: 1 });
followSchema.index({ following: 1, isActive: 1 });
// For cron sweeps expiring bounded follows
followSchema.index({ endAt: 1, isActive: 1 });

// Virtual: is this follow currently in effect (active AND not expired)?
followSchema.virtual('isCurrent').get(function () {
  if (!this.isActive) return false;
  if (!this.endAt) return true;
  return this.endAt.getTime() > Date.now();
});

// Prevent self-follow at the schema level as a defense-in-depth measure.
// Primary enforcement is still in the route handler with a clear error.
followSchema.pre('validate', function (next) {
  if (this.follower?.toString() === this.following?.toString()) {
    return next(new Error('Cannot follow yourself.'));
  }
  next();
});

module.exports = mongoose.model('Follow', followSchema);
