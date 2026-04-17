const mongoose = require('mongoose');

const deepSearchJobSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  query: { type: String, required: true },
  scope: {
    type: String,
    enum: ['workspace', 'tasks', 'meetings', 'email', 'messages', 'stickynotes'],
    required: true
  },

  status: {
    type: String,
    enum: ['pending', 'processing', 'complete', 'cancelled'],
    default: 'pending'
  },

  totalChunks: { type: Number, default: 0 },
  processedChunks: { type: Number, default: 0 },

  results: [{
    entityType: { type: String },
    entityId: { type: mongoose.Schema.Types.ObjectId },
    title: { type: String },
    snippet: { type: String },
    matchIndex: { type: Number }
  }],

  completedAt: { type: Date },

  // Auto-delete after 24 hours
  expiresAt: { type: Date }
}, {
  timestamps: true
});

deepSearchJobSchema.index({ userId: 1, status: 1 });
deepSearchJobSchema.index({ status: 1 });
deepSearchJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Set 24h expiry on save
deepSearchJobSchema.pre('save', function (next) {
  if (!this.expiresAt) {
    this.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  }
  next();
});

module.exports = mongoose.model('DeepSearchJob', deepSearchJobSchema);
