const mongoose = require('mongoose');

const pushSubscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Web Push subscription
  webPush: {
    endpoint: String,
    keys: {
      p256dh: String,
      auth: String
    }
  },
  // FCM token (Android/iOS native)
  fcmToken: { type: String },
  // Expo Push Token (for Expo Go development)
  expoPushToken: { type: String },
  // Device info
  platform: { type: String, enum: ['web', 'ios', 'android', 'desktop'], default: 'web' },
  userAgent: { type: String },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

pushSubscriptionSchema.index({ user: 1, isActive: 1 });
pushSubscriptionSchema.index({ 'webPush.endpoint': 1 }, { sparse: true });
pushSubscriptionSchema.index({ expoPushToken: 1 }, { sparse: true });

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
