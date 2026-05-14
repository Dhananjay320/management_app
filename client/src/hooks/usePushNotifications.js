import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

export default function usePushNotifications() {
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  // Check current subscription status on mount
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration('/sw-push.js').then(reg => {
        if (reg) {
          reg.pushManager.getSubscription().then(sub => {
            setSubscribed(!!sub);
          });
        }
      });
    }
  }, []);

  // If running inside the Expo WebView wrapper, register the Expo push token
  useEffect(() => {
    let lastSent = null;
    const send = async (token) => {
      if (!token || token === lastSent) return;
      lastSent = token;
      try {
        await api.post('/push/subscribe', {
          expoPushToken: token,
          platform: /iPhone|iPad|iOS/i.test(navigator.userAgent) ? 'ios' : 'android'
        });
        console.log('[Niyoq] Expo push token registered:', token.substring(0, 30) + '…');
        window.__EXPO_PUSH_REGISTERED__ = true;
        setSubscribed(true);
      } catch (e) {
        console.warn('[Niyoq] Expo push register failed:', e?.response?.status, e?.response?.data);
        lastSent = null; // allow retry
      }
    };
    if (typeof window !== 'undefined' && window.__EXPO_PUSH_TOKEN__) {
      send(window.__EXPO_PUSH_TOKEN__);
    }
    const handler = () => { if (window.__EXPO_PUSH_TOKEN__) send(window.__EXPO_PUSH_TOKEN__); };
    window.addEventListener('expo-token-ready', handler);
    // Poll forever (cheap noop after first success) to handle: token arrives
    // before listener attached, login happens later, refresh, etc.
    const interval = setInterval(handler, 3000);
    return () => { window.removeEventListener('expo-token-ready', handler); clearInterval(interval); };
  }, []);

  const subscribe = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Push notifications are not supported in this browser.');
      return false;
    }

    setLoading(true);
    try {
      // Request permission
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setLoading(false);
        return false;
      }

      // Register service worker and wait for it to be active
      const registration = await navigator.serviceWorker.register('/sw-push.js', { scope: '/' });

      // Wait for the service worker to be active
      if (registration.installing) {
        await new Promise(resolve => {
          registration.installing.addEventListener('statechange', function () {
            if (this.state === 'activated') resolve();
          });
        });
      } else if (registration.waiting) {
        await new Promise(resolve => {
          registration.waiting.addEventListener('statechange', function () {
            if (this.state === 'activated') resolve();
          });
        });
      }
      // Ensure we have an active worker
      await navigator.serviceWorker.ready;

      // Get VAPID public key from server
      const { data: { publicKey } } = await api.get('/push/vapid-key');

      const urlBase64ToUint8Array = (base64String) => {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
      };

      // Subscribe using THIS specific registration (not the default CRA one)
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

      console.log('[Push] Subscribed successfully. Endpoint:', subscription.endpoint.substring(0, 50));

      // Send subscription to backend
      await api.post('/push/subscribe', {
        subscription: subscription.toJSON(),
        platform: /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'android' : 'web'
      });

      setSubscribed(true);
      setLoading(false);
      return true;
    } catch (err) {
      console.error('Push subscription error:', err);
      setLoading(false);
      return false;
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw-push.js');
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          const endpoint = sub.endpoint;
          await sub.unsubscribe();
          await api.delete('/push/unsubscribe', { data: { endpoint } });
        }
      }
      setSubscribed(false);
    } catch (err) {
      console.error('Push unsubscribe error:', err);
    }
  }, []);

  return { permission, subscribed, loading, subscribe, unsubscribe };
}
