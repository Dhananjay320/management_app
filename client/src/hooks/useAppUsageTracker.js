import { useEffect, useRef } from 'react';
import api from '../services/api';

// Polls the foreground window every POLL_MS while the user is clocked in,
// buffers samples in memory, and posts a batch to the server every BATCH_MS.
// Only runs in Electron with monitoring config enabled and the user past
// consent. Same gates as the screenshot scheduler.

const POLL_MS = 15_000;   // 15s — matches active-win's overhead profile on macOS
const BATCH_MS = 60_000;  // upload once a minute

export default function useAppUsageTracker({ monitoring, user }) {
  const stoppedRef = useRef(false);
  const bufferRef = useRef([]);
  const lastSampleRef = useRef(null);

  useEffect(() => {
    if (!window.niyoqDesktop?.getActiveWindow) return;
    if (!user || user._c) return;
    if (monitoring.bypass) return;
    if (monitoring.needsAcceptance) return;
    if (!monitoring.config?.appUsage?.enabled) return;

    stoppedRef.current = false;

    const sample = async () => {
      if (stoppedRef.current) return;
      try {
        const w = await window.niyoqDesktop.getActiveWindow();
        if (w && w.app) {
          // Dedupe consecutive identical samples — title-level changes still count
          const sig = `${w.app}|${w.title}`;
          const prev = lastSampleRef.current;
          if (!prev || prev.sig !== sig || (w.ts - prev.ts) > POLL_MS * 2) {
            bufferRef.current.push({ ts: w.ts, app: w.app, title: w.title, bundleId: w.bundleId });
          }
          lastSampleRef.current = { sig, ts: w.ts };
        }
      } catch {}
    };

    const flush = async () => {
      if (stoppedRef.current) return;
      const items = bufferRef.current.splice(0, bufferRef.current.length);
      if (items.length === 0) return;
      try {
        await api.post('/usage/app-batch', { samples: items });
      } catch (err) {
        if (err.response?.data?.stop) { stoppedRef.current = true; return; }
        // Other errors: drop the batch silently — we don't want to grow memory unbounded
      }
    };

    const sampleId = setInterval(sample, POLL_MS);
    const flushId = setInterval(flush, BATCH_MS);
    sample(); // fire once on mount so we don't wait 15s for the first datum

    const unsub = window.niyoqDesktop.onPowerState?.((state) => {
      if (state === 'lock' || state === 'suspend') {
        // Flush whatever we have so it's safe to pause
        flush();
      } else if (state === 'unlock' || state === 'resume') {
        sample();
      }
    });

    return () => {
      stoppedRef.current = true;
      clearInterval(sampleId);
      clearInterval(flushId);
      if (typeof unsub === 'function') unsub();
      // Best-effort final flush so we don't lose the tail
      flush();
    };
  }, [
    monitoring.config?.appUsage?.enabled,
    monitoring.bypass,
    monitoring.needsAcceptance,
    user?._id
  ]);
}
