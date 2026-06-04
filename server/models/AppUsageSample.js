const mongoose = require('mongoose');

// One row per sample (every ~15 seconds while the tracker is running).
// We store the raw sample so admin tooling can recompute "time on app X"
// from this without re-walking thousands of legacy rows.
const sampleSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  ts: { type: Date, required: true, index: true },
  app: { type: String, required: true },
  title: { type: String, default: '' },
  bundleId: { type: String, default: '' },
  expiresAt: { type: Date, index: { expireAfterSeconds: 0 } }
}, { timestamps: true });

sampleSchema.index({ user: 1, ts: -1 });

module.exports = mongoose.model('AppUsageSample', sampleSchema);
