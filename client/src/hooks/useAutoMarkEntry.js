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
  const slowdownRef = useRef(null);         // handle for the slow interval phase

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
      // Shorter debounce on mount/visibility/online triggers (user-initiated),
      // longer on the periodic interval so we don't hammer the server.
      const debounce = (trigger === 'interval') ? 90 * 1000 : 20 * 1000;
      if (Date.now() - lastAttemptRef.current < debounce) return;
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
        // 409 off-day / holiday → stop retrying for the rest of the day.
        // Backend sets `offDay: true` when today is a Sunday or holiday.
        if (err?.response?.status === 409 && err?.response?.data?.offDay) {
          markedRef.current = true; // sentinel so we don't retry — resets on next page load (next day)
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

    // 4. Fast early retries (every 30s for the first 3 minutes) for GPS-warmup
    //    cases, then slow down to every 2 minutes.
    let tickCount = 0;
    const interval = setInterval(() => {
      tickCount++;
      attempt('interval');
    }, 30 * 1000);
    // After 3 minutes of 30s ticks, swap to a 2-minute cadence
    const slowdown = setTimeout(() => {
      clearInterval(interval);
      const slow = setInterval(() => attempt('interval'), 2 * 60 * 1000);
      // Save handle so cleanup catches it
      slowdownRef.current = slow;
    }, 3 * 60 * 1000);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      clearInterval(interval);
      clearTimeout(slowdown);
      if (slowdownRef.current) clearInterval(slowdownRef.current);
    };
  }, [user]);
}
