const mongoose = require('mongoose');

const ACTIVITY_TYPES = ['reading', 'video', 'fun', 'wellness', 'learning', 'celebration', 'brainstorm', 'social'];

const activitySchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  type: { type: String, enum: ACTIVITY_TYPES, required: true },
  description: { type: String, default: '' },

  // Attachment — file or link
  attachment: {
    type: { type: String, enum: ['file', 'link'] },
    url: { type: String },
    name: { type: String },
    path: { type: String }
  },

  // Audience
  audience: { type: String, enum: ['company', 'team', 'individual'], required: true },
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' }, // If audience = 'team'

  // Schedule
  date: { type: Date, required: true },
  endTime: { type: Date },

  // Recurring
  isRecurring: { type: Boolean, default: false },
  recurringPattern: { type: String, enum: ['daily', 'weekly', 'monthly', 'custom'] },

  // RSVP
  rsvpJoin: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  rsvpSkip: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

activitySchema.index({ date: 1, audience: 1 });
activitySchema.index({ createdBy: 1 });
activitySchema.index({ title: 'text', type: 'text' });

module.exports = mongoose.model('Activity', activitySchema);
