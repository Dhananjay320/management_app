const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  channelId: { type: mongoose.Schema.Types.ObjectId }, // Auto-created channel
  // Weekly off days override for this team (0=Sun..6=Sat). Empty = use office or company default.
  weeklyOffDays: { type: [Number], default: undefined },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Team', teamSchema);
