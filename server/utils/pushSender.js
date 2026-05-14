const webPush = require('web-push');
const PushSubscription = require('../models/PushSubscription');

// ═══ Web Push (Browser) — VAPID keys ═══
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@niyoq.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  console.log('Web Push configured with VAPID keys');
}

// ═══ Firebase / FCM ═══
// Using Expo Push Service as FCM proxy — no service account needed
// Expo handles FCM delivery when you use expo-notifications with google-services.json
console.log('[PUSH] Using Expo Push Service for Android notifications (no Firebase service account needed)');

/**
 * Send push notification to a user across all their subscribed devices
 */
async function sendPushToUser(userId, payload) {
  try {
    const subscriptions = await PushSubscription.find({ user: userId, isActive: true });
    if (!subscriptions.length) return;

    const webPayload = JSON.stringify({
      title: payload.title || 'Niyoq',
      body: payload.message || payload.body || '',
      icon: '/logo192.png',
      badge: '/logo192.png',
      tag: payload.tag || payload.type || 'notification',
      data: {
        url: payload.url || '/',
        type: payload.type,
        entityId: payload.entityId,
        entityType: payload.entityType
      }
    });

    for (const sub of subscriptions) {
      try {
        // Web Push (browser)
        if (sub.webPush?.endpoint) {
          await webPush.sendNotification({
            endpoint: sub.webPush.endpoint,
            keys: sub.webPush.keys
          }, webPayload);
        }

        // Expo Push (Android/iOS via Expo Push Service — handles FCM internally)
        if (sub.expoPushToken) {
          await sendExpoPush(sub.expoPushToken, payload);
        }
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await PushSubscription.findByIdAndUpdate(sub._id, { isActive: false });
        }
      }
    }
  } catch (err) {
    console.error('Push notification error:', err.message);
  }
}

/**
 * Send via Expo Push Service (handles FCM/APNs delivery)
 */
async function sendExpoPush(expoPushToken, payload) {
  try {
    const resp = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        to: expoPushToken,
        title: payload.title || 'Niyoq',
        body: payload.message || payload.body || '',
        sound: 'default',
        priority: 'high',
        channelId: 'default',
        data: { type: payload.type, entityId: payload.entityId, url: payload.url }
      })
    });
    const json = await resp.json().catch(() => null);
    if (!resp.ok || json?.data?.status === 'error' || json?.errors) {
      console.warn('[ExpoPush] FAIL', expoPushToken.substring(0, 25), 'status:', resp.status, JSON.stringify(json));
    } else {
      console.log('[ExpoPush] OK', expoPushToken.substring(0, 25), 'title:', payload.title);
    }
  } catch (e) {
    console.warn('[ExpoPush] EXCEPTION', expoPushToken.substring(0, 25), e?.message);
  }
}

module.exports = { sendPushToUser };
