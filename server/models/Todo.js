const mongoose = require('mongoose');

const todoSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, trim: true },
  deadline: { type: Date },
  priority: { type: String, enum: ['high', 'medium', 'low'] },
  notes: { type: String, default: '' },
  isDone: { type: Boolean, default: false },
  doneAt: { type: Date },
  isRecurring: { type: Boolean, default: false },
  recurringPattern: { type: String, enum: ['daily', 'weekly', 'monthly'] },
  order: { type: Number, default: 0 }
}, {
  timestamps: true
});

todoSchema.index({ user: 1, isDone: 1 });

module.exports = mongoose.model('Todo', todoSchema);
