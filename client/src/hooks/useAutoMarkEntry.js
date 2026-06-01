import { useEffect, useRef } from 'react';
import api from '../services/api';

// Auto-mark entry once per day, but with retry on common failure modes:
//   - tab becomes visible again (user opened laptop / switched back to tab)
//   - network/window comes back online
//   - periodic re-check every 2 minutes if not yet marked today
//
// Previous version gated by sessionStorage and never retried on failure, so a
// single GPS hiccup or stale tab would leave the user unmarked for the day.
// This version only debounces *attempts* (min 90s between tries) and stops
// completely once today's entry is confirmed.
export default function useAutoMarkEntry(user) {
  // Refs so handlers always see the latest values without re-binding listeners
  const markedRef = useRef(false);          // confirmed entry exists today
  const inFlightRef = useRef(false);        // an attempt is currently running
  const lastAttemptRef = useRef(0);         // ms timestamp of last attempt

  useEffect(() => {
    if (!user || user._c) return;

    let cancelled = false;

    const getCoords = (highAccuracy, timeoutMs) => new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('no geolocation'));
      const t = setTimeout(() => reject(new Error('gps timeout')), timeoutMs);
      navigator.geolocation.getCurrentPosition(
        p => { clearTimeout(t); resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }); },
        e => { clearTimeout(t); reject(e); },
        { enableHighAccuracy: highAccuracy, timeout: timeoutMs, maximumAge: 30000 }
      );
    });

    const attempt = async (trigger) => {
      if (cancelled) return;
      if (markedRef.current) return;                       // already marked today
      if (inFlightRef.current) return;                     // request in flight
      if (Date.now() - lastAttemptRef.current < 90 * 1000) return; // 90s debounce
      inFlightRef.current = true;
      lastAttemptRef.current = Date.now();

      try {
        // Already marked? Cache and stop forever.
        const today = await api.get('/attendance/today').then(r => r.data).catch(() => null);
        if (today?.entryTime) { markedRef.current = true; return; }

        let coordinates = null;
        try { coordinates = await getCoords(true, 10000); }
        catch (_) { try { coordinates = await getCoords(false, 5000); } catch (_) {} }
        if (coordinates) {
          console.log(`[Niyoq] Auto-entry (${trigger}) GPS:`,
            coordinates.lat.toFixed(6), coordinates.lng.toFixed(6),
            'accuracy ±' + Math.round(coordinates.accuracy) + 'm');
        }

        const res = await api.post('/attendance/mark-entry', { coordinates });
        if (res?.data?.entryTime) {
          markedRef.current = true;
          console.log(`[Niyoq] Auto-marked entry at`, new Date(res.data.entryTime).toLocaleTimeString());
          window.dispatchEvent(new CustomEvent('auto-entry-marked', {
            detail: { time: res.data.entryTime, method: res.data.verificationMethod }
          }));
        }
      } catch (err) {
        // 400 "already marked" is success-equivalent — stop retrying.
        if (err?.response?.status === 400 && /already/i.test(err?.response?.data?.error || '')) {
          markedRef.current = true;
          return;
        }
        const detail = err?.response?.data?.error || err?.message;
        console.warn(`[Niyoq] Auto-entry failed (${trigger}):`, err?.response?.status, detail);
        window.dispatchEvent(new CustomEvent('auto-entry-failed', {
          detail: { reason: detail, blocked: err?.response?.data?.blocked }
        }));
      } finally {
        inFlightRef.current = false;
      }
    };

    // 1. Initial attempt on mount
    attempt('mount');

    // 2. Re-attempt when the tab becomes visible (user reopened laptop / switched tabs)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') attempt('visibility');
    };
    document.addEventListener('visibilitychange', onVisibility);

    // 3. Re-attempt when the browser comes back online
    const onOnline = () => attempt('online');
    window.addEventListener('online', onOnline);

    // 4. Slow periodic retry — every 2 minutes — so a user who opened the app
    //    too early (still en route to office) gets marked when they arrive.
    const interval = setInterval(() => attempt('interval'), 2 * 60 * 1000);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      clearInterval(interval);
    };
  }, [user]);
}
