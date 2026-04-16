const mongoose = require('mongoose');

const calendarEventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  type: {
    type: String,
    enum: ['task', 'meeting', 'leave', 'half_day', 'holiday', 'activity', 'reminder', 'custom'],
    required: true
  },
  date: { type: String, required: true }, // YYYY-MM-DD
  startTime: { type: String }, // HH:MM
  endTime: { type: String },
  allDay: { type: Boolean, default: false },
  color: { type: String }, // Override color
  priority: { type: String, enum: ['top', 'high', 'medium', 'low'] },

  // Associations
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  office: { type: mongoose.Schema.Types.ObjectId, ref: 'Office' },

  // Reference to source
  sourceType: { type: String, enum: ['task', 'meeting', 'leave', 'attendance', 'activity', 'holiday', 'manual'] },
  sourceId: { type: mongoose.Schema.Types.ObjectId },

  isCompanyWide: { type: Boolean, default: false },
  isPrivate: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

calendarEventSchema.index({ user: 1, date: 1 });
calendarEventSchema.index({ date: 1, isCompanyWide: 1 });

module.exports = mongoose.model('CalendarEvent', calendarEventSchema);
