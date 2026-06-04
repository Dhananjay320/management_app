const mongoose = require('mongoose');

// One row per state report from the Electron tracker (~30s cadence).
// `state` is computed in the renderer from `powerMonitor.getSystemIdleTime()`
// against the company's idle/away thresholds.
const activitySampleSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  ts: { type: Date, required: true, index: true },
  state: { type: String, enum: ['active', 'idle', 'away'], required: true },
  idleSeconds: { type: Number, default: 0 },
  expiresAt: { type: Date, index: { expireAfterSeconds: 0 } }
}, { timestamps: true });

activitySampleSchema.index({ user: 1, ts: -1 });

module.exports = mongoose.model('ActivitySample', activitySampleSchema);
