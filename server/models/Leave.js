const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['casual', 'sick', 'personal', 'half_day'], required: true },
  halfDayType: { type: String, enum: ['morning', 'afternoon'] },
  startDate: { type: String, required: true }, // YYYY-MM-DD
  endDate: { type: String, required: true },
  reason: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectionReason: { type: String },
  googleEventId: { type: String }
}, {
  timestamps: true
});

leaveSchema.index({ user: 1, startDate: 1 });

module.exports = mongoose.model('Leave', leaveSchema);
