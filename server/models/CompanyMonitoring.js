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
    retentionDays:  { type: Number, default: 30, min: 1, max: 365 },
    // Capture every connected display (true) vs. just the primary one (false).
    // Multi-screen captures are roughly 1.5–2× the bandwidth depending on
    // resolution; default off to keep costs predictable.
    multiScreen:    { type: Boolean, default: false }
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

  // Office-entry bypass — gives the sys operator an escape hatch when employees
  // are physically at the office but GPS/WiFi checks are failing (router swap,
  // ISP outage, dead GPS in a basement). When `enabled` is true, employees can
  // mark entry without satisfying any geofence check — BUT only after the
  // configured local time (IST), so the toggle can't be used to backdate or
  // pre-mark attendance early in the morning.
  //
  // Default 08:30 IST — well past the normal arrival window so the toggle
  // can't be left on as a "skip the gate forever" trick.
  entryBypass: {
    enabled:             { type: Boolean, default: false },
    // HH:MM in IST. Toggle has no effect before this time on the current day.
    effectiveAfterTime:  { type: String, default: '08:30' }
  },

  // Productivity scoring config — tunes how /productivity and /team-productivity
  // compute the percentage. Defaults match the old "binary" behaviour so
  // existing rollouts don't drift on upgrade.
  scoring: {
    // Per-bucket weights (0..1). Default: productive=1, neutral=0.5, unproductive=0.
    // Score = (productive*wP + neutral*wN + unproductive*wU) / totalCountedMinutes
    weightProductive:    { type: Number, default: 1.0,  min: 0, max: 1 },
    weightNeutral:       { type: Number, default: 0.5,  min: 0, max: 1 },
    weightUnproductive:  { type: Number, default: 0.0,  min: 0, max: 1 },
    // When true, idle/away minutes count toward the denominator (drags score down).
    // When false (default), only app-usage minutes are considered.
    includeIdleInScore:  { type: Boolean, default: false }
  },

  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('CompanyMonitoring', monitoringSchema);
