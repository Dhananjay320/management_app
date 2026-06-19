const mongoose = require('mongoose');

// Per-team or per-user override of the company-wide monitoring config.
// `scope` selects which (team or user). Each block (screenshots, appUsage, etc.)
// is optional — if absent, the company config applies. If present, the override
// REPLACES the corresponding company block entirely.
//
// Effective config resolution order (highest → lowest priority):
//   1. User override (scope=user, target=userId)
//   2. Team override (scope=team, target=teamId of user.team)
//   3. Company config (CompanyMonitoring singleton)
//
// Only the fields explicitly set in the override take effect — others fall
// through to the next level. So a user override of "screenshots.enabled=false"
// while leaving other blocks empty just exempts that user from screenshots.

const blockSchema = (extras = {}) => new mongoose.Schema({
  enabled: { type: Boolean },
  ...extras
}, { _id: false });

const monitoringOverrideSchema = new mongoose.Schema({
  scope:  { type: String, enum: ['team', 'user'], required: true, index: true },
  target: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

  // Each feature block is fully optional. If you only want to override
  // `screenshots.enabled`, leave the others as undefined and the resolver
  // will fall through to company defaults for them.
  screenshots:   { type: blockSchema({
                      mode: { type: String, enum: ['periodic', 'random', 'blur'] },
                      intervalMinutes: { type: Number, min: 1, max: 60 },
                      retentionDays: { type: Number, min: 1, max: 365 },
                      multiScreen: { type: Boolean }
                  }), default: undefined },
  appUsage:      { type: blockSchema({ retentionDays: { type: Number, min: 1, max: 365 } }), default: undefined },
  activityLevel: { type: blockSchema({
                      idleThresholdMinutes: { type: Number, min: 1, max: 60 },
                      awayThresholdMinutes: { type: Number, min: 1, max: 120 }
                  }), default: undefined },
  selfieAtEntry: { type: blockSchema(), default: undefined },
  idleAutoPause: { type: blockSchema({ idleMinutes: { type: Number, min: 1, max: 60 } }), default: undefined },

  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Only one override doc per (scope, target). Upsert pattern: if you want to
// edit, find-or-create and modify in place.
monitoringOverrideSchema.index({ scope: 1, target: 1 }, { unique: true });

module.exports = mongoose.model('MonitoringOverride', monitoringOverrideSchema);
