const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  content: { type: String, required: true },
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' }
}, { timestamps: true });

reportSchema.index({ user: 1, date: 1 }, { unique: true });
reportSchema.index({ date: -1 });

module.exports = mongoose.model('Report', reportSchema);
