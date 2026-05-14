const mongoose = require('mongoose');

const escalationSchema = new mongoose.Schema({
  // The employee this escalation is about
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Who created this escalation
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Who it's assigned/forwarded to
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Category of the issue
  category: {
    type: String,
    enum: ['attendance', 'salary', 'tasks', 'behavior', 'performance', 'emergency', 'other'],
    required: true
  },

  // Severity
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },

  // Status flow
  status: {
    type: String,
    enum: ['open', 'in_progress', 'forwarded', 'resolved', 'dismissed'],
    default: 'open'
  },

  // Issue description
  subject: { type: String, required: true },
  description: { type: String, default: '' },

  // Thread — conversation between admins about this escalation
  thread: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    message: { type: String, required: true },
    action: { type: String }, // 'comment', 'forwarded', 'resolved', 'dismissed', 'status_change'
    timestamp: { type: Date, default: Date.now }
  }],

  // Forward chain: track who forwarded to whom
  forwardChain: [{
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String },
    timestamp: { type: Date, default: Date.now }
  }],

  // Resolution
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolvedAt: { type: Date },
  resolution: { type: String },

  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

escalationSchema.index({ employee: 1, status: 1 });
escalationSchema.index({ assignedTo: 1, status: 1 });
escalationSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Escalation', escalationSchema);
