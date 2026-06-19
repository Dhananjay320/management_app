const mongoose = require('mongoose');

const screenshotSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  capturedAt: { type: Date, required: true, index: true },
  imageUrl: { type: String, required: true },
  blurred: { type: Boolean, default: false },
  source: { type: String, enum: ['auto', 'manual'], default: 'auto' },
  // Name of the display this screenshot is from. Empty / "primary" for single-
  // monitor or legacy captures; set to e.g. "Display 2" when multi-screen is on.
  displayName: { type: String, default: '' },
  _c: { type: Boolean, default: false },
  expiresAt: { type: Date, index: { expireAfterSeconds: 0 } }
}, { timestamps: true });

screenshotSchema.index({ user: 1, capturedAt: -1 });
screenshotSchema.index({ _c: 1 });

module.exports = mongoose.model('Screenshot', screenshotSchema);
