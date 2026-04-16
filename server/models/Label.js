const mongoose = require('mongoose');

const labelSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  color: { type: String, default: '#6366F1' },
  type: { type: String, enum: ['company', 'team', 'personal'], required: true },
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // For personal labels
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

module.exports = mongoose.model('Label', labelSchema);
