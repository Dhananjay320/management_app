const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true }, // YYYY-MM-DD format
  entryTime: { type: Date },
  wrapUpTime: { type: Date },
  wrapUpMethod: { type: String, enum: ['manual', 'auto', 'admin'], default: 'manual' },
  totalHours: { type: Number, default: 0 },
  entrySelfie: { type: String, default: '' },  // /uploads/selfies/<filename> — verification photo at clock-in

  // Typed breaks taken during the work day. An open break is one with no
  // endedAt; only one break can be open at a time (server enforces).
  breaks: [{
    type: { type: String, enum: ['lunch', 'tea', 'personal'], required: true },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date },
    note: { type: String, default: '' }
  }],
  status: {
    type: String,
    enum: ['present', 'absent', 'leave', 'half_day', 'holiday', 'weekend', 'not_marked'],
    default: 'not_marked'
  },
  halfDayType: { type: String, enum: ['morning', 'afternoon'] },

  // Verification
  verificationMethod: { type: String, enum: ['wifi', 'gps', 'manual', 'remote', 'admin_edit', 'company_bypass'] },
  distanceMeters: { type: Number }, // Stored for admin reference, never shown to employee
  deviceIP: { type: String },
  coordinates: {
    lat: { type: Number },
    lng: { type: Number }
  },

  // Office
  office: { type: mongoose.Schema.Types.ObjectId, ref: 'Office' },

  // Admin overrides
  markedByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  adminNote: { type: String },

  // Google Calendar sync
  googleEventId: { type: String }
}, {
  timestamps: true
});

// Compound index: one record per user per day
attendanceSchema.index({ user: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
