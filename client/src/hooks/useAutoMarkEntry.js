import { useEffect } from 'react';
import api from '../services/api';

// Auto-mark entry once per session when the app boots, if the user hasn't
// marked entry today. Silent on failure (out of office, no GPS, etc.) so it
// doesn't spam the user. Skips for system / admin-mode-only users.
export default function useAutoMarkEntry(user) {
  useEffect(() => {
    if (!user || user._c) return;
    // Run at most once per browser session
    const todayKey = `auto-entry-attempted-${new Date().toISOString().split('T')[0]}`;
    if (sessionStorage.getItem(todayKey)) return;
    sessionStorage.setItem(todayKey, '1');

    (async () => {
      try {
        // Already marked? Skip.
        const today = await api.get('/attendance/today').then(r => r.data).catch(() => null);
        if (today?.entryTime) return;

        // Get GPS with HIGH accuracy — needed for tight office geofence.
        // Fall back to a faster low-accuracy reading if high-accuracy times out.
        const getCoords = (highAccuracy, timeoutMs) => new Promise((resolve, reject) => {
          if (!navigator.geolocation) return reject(new Error('no geolocation'));
          const t = setTimeout(() => reject(new Error('gps timeout')), timeoutMs);
          navigator.geolocation.getCurrentPosition(
            p => { clearTimeout(t); resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }); },
            e => { clearTimeout(t); reject(e); },
            { enableHighAccuracy: highAccuracy, timeout: timeoutMs, maximumAge: 30000 }
          );
        });
        let coordinates = null;
        try {
          // First try: high-accuracy, 10s
          coordinates = await getCoords(true, 10000);
        } catch (_) {
          // Fallback: low-accuracy, 5s
          try { coordinates = await getCoords(false, 5000); } catch (_) {}
        }
        if (coordinates) {
          console.log('[Niyoq] Auto-entry GPS:', coordinates.lat.toFixed(6), coordinates.lng.toFixed(6), 'accuracy ±' + Math.round(coordinates.accuracy) + 'm');
        }

        const res = await api.post('/attendance/mark-entry', { coordinates });
        if (res?.data?.entryTime) {
          console.log('[Niyoq] Auto-marked entry at', new Date(res.data.entryTime).toLocaleTimeString());
          window.dispatchEvent(new CustomEvent('auto-entry-marked', {
            detail: { time: res.data.entryTime, method: res.data.verificationMethod }
          }));
        }
      } catch (err) {
        const detail = err?.response?.data?.error || err?.message;
        console.warn('[Niyoq] Auto-entry failed:', err?.response?.status, detail);
        // Tell the user so they can mark manually
        window.dispatchEvent(new CustomEvent('auto-entry-failed', {
          detail: { reason: detail, blocked: err?.response?.data?.blocked }
        }));
      }
    })();
  }, [user]);
}
