const mongoose = require('mongoose');

// One document per company. Master switches for the WFH-tracking features.
// Off by default — admin has to explicitly enable each one. Bumping the
// `policyVersion` invalidates all existing employee acceptances and forces
// everyone to re-accept on next login.
//
// The actual monitoring agents (Electron tracker, web client) read this via
// GET /api/v1/monitoring/config and only run features where `enabled: true`.

const monitoringSchema = new mongoose.Schema({
  // Bumped whenever policy semantics change (new features, retention changes).
  // Comparing against User.monitoringConsent.acceptedVersion tells us if a
  // user needs to re-accept.
  policyVersion: { type: Number, default: 1 },

  screenshots: {
    enabled:        { type: Boolean, default: false },
    mode:           { type: String, enum: ['periodic', 'random', 'blur'], default: 'periodic' },
    intervalMinutes:{ type: Number, default: 10, min: 1, max: 60 },
    retentionDays:  { type: Number, default: 30, min: 1, max: 365 }
  },

  appUsage: {
    enabled:        { type: Boolean, default: false },
    retentionDays:  { type: Number, default: 30 }
  },

  activityLevel: {
    enabled:               { type: Boolean, default: false },
    idleThresholdMinutes:  { type: Number, default: 5, min: 1, max: 60 },
    awayThresholdMinutes:  { type: Number, default: 10, min: 1, max: 120 }
  },

  selfieAtEntry: {
    enabled: { type: Boolean, default: false }
  },

  idleAutoPause: {
    enabled:       { type: Boolean, default: false },
    idleMinutes:   { type: Number, default: 10, min: 1, max: 60 }
  },

  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('CompanyMonitoring', monitoringSchema);
