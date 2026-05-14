const mongoose = require('mongoose');

const powerPresetSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true }, // e.g., "HR", "Team Lead", "Project Manager"
  description: { type: String, default: '' },

  // Target role this preset is for
  targetRole: { type: String, enum: ['admin', 'employee'], default: 'admin' },

  // The power configuration — same structure as User.powers
  powers: { type: Object, default: {} },

  // Who created it
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

module.exports = mongoose.model('PowerPreset', powerPresetSchema);
