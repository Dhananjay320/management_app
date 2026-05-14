const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Type groups
  type: {
    type: String,
    enum: ['emergency', 'task', 'message', 'meeting', 'approval', 'announcement', 'salary', 'attendance', 'email', 'system'],
    required: true
  },

  // Content
  title: { type: String, required: true },
  message: { type: String, default: '' },
  icon: { type: String, default: '' },

  // Quick action
  actionType: { type: String }, // 'view_task', 'view_meeting', 'reply', 'acknowledge', 'add_to_calendar'
  actionTarget: { type: String }, // Entity ID or URL

  // Link to entity
  entityType: { type: String }, // 'task', 'meeting', 'channel', 'email', 'leave', 'dispute'
  entityId: { type: mongoose.Schema.Types.ObjectId },

  // State
  isRead: { type: Boolean, default: false },
  isDismissed: { type: Boolean, default: false },

  // Emergency
  isEmergency: { type: Boolean, default: false },
  acknowledgedAt: { type: Date },

  // Sender (for context)
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Auto-cleanup: notifications older than 3 months get deleted
  expiresAt: { type: Date }
}, {
  timestamps: true
});

notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ user: 1, type: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index — auto-deletes after 3 months

// Set expiry on save (3 months for non-emergency, permanent for emergency)
notificationSchema.pre('save', function (next) {
  if (!this.expiresAt && !this.isEmergency) {
    const threeMonths = new Date();
    threeMonths.setMonth(threeMonths.getMonth() + 3);
    this.expiresAt = threeMonths;
  }
  next();
});

// After saving, send push notification to user's devices
notificationSchema.post('save', async function (doc) {
  try {
    const { sendPushToUser } = require('../utils/pushSender');
    await sendPushToUser(doc.user, {
      title: doc.title,
      message: doc.message,
      type: doc.type,
      entityId: doc.entityId,
      entityType: doc.entityType,
      tag: `${doc.type}-${doc._id}`,
      url: doc.entityType === 'task' ? `/tasks?id=${doc.entityId}` :
           doc.entityType === 'channel' ? `/messages?channel=${doc.entityId}` :
           doc.entityType === 'meeting' ? `/meetings?id=${doc.entityId}` :
           '/notifications'
    });
  } catch {}
});

module.exports = mongoose.model('Notification', notificationSchema);
