const router = require('express').Router();
const PushSubscription = require('../models/PushSubscription');
const { protect } = require('../middleware/auth');

// GET /api/v1/push/vapid-key — public key for web push subscription
router.get('/vapid-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' });
});

// POST /api/v1/push/subscribe — register a push subscription
router.post('/subscribe', protect, async (req, res) => {
  try {
    const { subscription, expoPushToken, fcmToken, platform } = req.body;

    if (subscription?.endpoint) {
      // Web Push — check if already exists
      const existing = await PushSubscription.findOne({
        user: req.user._id,
        'webPush.endpoint': subscription.endpoint,
        isActive: true
      });
      if (existing) return res.json({ ok: true, message: 'Already subscribed.' });

      await PushSubscription.create({
        user: req.user._id,
        webPush: {
          endpoint: subscription.endpoint,
          keys: subscription.keys
        },
        platform: platform || 'web',
        userAgent: req.headers['user-agent']
      });
    } else if (fcmToken) {
      // FCM token (Android/iOS native)
      const existing = await PushSubscription.findOne({ user: req.user._id, fcmToken, isActive: true });
      if (existing) return res.json({ ok: true, message: 'Already subscribed.' });

      await PushSubscription.create({
        user: req.user._id,
        fcmToken,
        platform: platform || 'android',
        userAgent: req.headers['user-agent']
      });
    } else if (expoPushToken) {
      // Expo Push (development)
      const existing = await PushSubscription.findOne({ user: req.user._id, expoPushToken, isActive: true });
      if (existing) return res.json({ ok: true, message: 'Already subscribed.' });

      await PushSubscription.create({
        user: req.user._id,
        expoPushToken,
        platform: platform || 'android',
        userAgent: req.headers['user-agent']
      });
    } else {
      return res.status(400).json({ error: 'subscription, fcmToken, or expoPushToken required.' });
    }

    res.json({ ok: true, message: 'Push notifications enabled.' });
  } catch (err) {
    console.error('Push subscribe error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/v1/push/unsubscribe — remove subscription
router.delete('/unsubscribe', protect, async (req, res) => {
  try {
    const { endpoint, expoPushToken } = req.body;
    if (endpoint) {
      await PushSubscription.updateMany({ user: req.user._id, 'webPush.endpoint': endpoint }, { isActive: false });
    } else if (expoPushToken) {
      await PushSubscription.updateMany({ user: req.user._id, expoPushToken }, { isActive: false });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
