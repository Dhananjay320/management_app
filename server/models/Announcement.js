const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  content: { type: String, required: true },

  // Audience: company-wide or team-specific
  audience: { type: String, enum: ['company', 'team'], default: 'company' },
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Dismissal tracking — per user
  dismissedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

announcementSchema.index({ audience: 1, createdAt: -1 });

module.exports = mongoose.model('Announcement', announcementSchema);
