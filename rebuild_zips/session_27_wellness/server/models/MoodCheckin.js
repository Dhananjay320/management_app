// ============================================================================
// MoodCheckin.js — daily mood / energy log per user.
// ============================================================================
// Session 27 (N6). One record per user per day (in their local date).
// Score: 1 (rough) to 5 (great). Energy: 1 (drained) to 5 (energized).
// Optional 200-char note — kept private to the user by default.
// ============================================================================

const mongoose = require('mongoose');

const moodCheckinSchema = new mongoose.Schema({
  user:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Stored as YYYY-MM-DD string in the user's local timezone (matches the
  // pattern Session 17 established for attendance). This avoids off-by-one
  // issues when someone checks in just before/after midnight.
  date:   { type: String, required: true },
  mood:   { type: Number, min: 1, max: 5, required: true },
  energy: { type: Number, min: 1, max: 5 },
  note:   { type: String, default: '', maxlength: 200 },
}, { timestamps: true });

// One check-in per user per day.
moodCheckinSchema.index({ user: 1, date: 1 }, { unique: true });
moodCheckinSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('MoodCheckin', moodCheckinSchema);
