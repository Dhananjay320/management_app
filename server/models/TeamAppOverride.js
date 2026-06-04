const mongoose = require('mongoose');

// Per-team override of the company-wide AppCategory. When present, the
// productivity calculation uses this category for users on that team instead
// of the global one. Compound index (team, app) makes lookups O(1).
const teamAppOverrideSchema = new mongoose.Schema({
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
  app:  { type: String, required: true, lowercase: true, trim: true },
  category: {
    type: String,
    enum: ['productive', 'neutral', 'unproductive', 'uncategorized'],
    required: true
  },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

teamAppOverrideSchema.index({ team: 1, app: 1 }, { unique: true });

module.exports = mongoose.model('TeamAppOverride', teamAppOverrideSchema);
