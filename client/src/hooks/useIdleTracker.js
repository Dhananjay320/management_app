import { useEffect, useRef } from 'react';
import api from '../services/api';

// Polls `powerMonitor.getSystemIdleTime()` every POLL_MS via the Electron
// bridge and posts batches of state samples (active / idle / away). State
// transitions based on the company's configured thresholds.

const POLL_MS = 30_000;     // 30s
const BATCH_MS = 120_000;   // upload every 2 minutes

export default function useIdleTracker({ monitoring, user }) {
  const stoppedRef = useRef(false);
  const bufferRef = useRef([]);
  const lastStateRef = useRef(null);

  useEffect(() => {
    if (!window.niyoqDesktop?.getIdleSeconds) return;
    if (!user || user._c) return;
    if (monitoring.bypass) return;
    if (monitoring.needsAcceptance) return;
    const cfg = monitoring.config?.activityLevel;
    if (!cfg?.enabled) return;

    stoppedRef.current = false;
    const idleThr = (cfg.idleThresholdMinutes || 5) * 60;
    const awayThr = (cfg.awayThresholdMinutes || 10) * 60;

    const classify = (idleSeconds) => {
      if (idleSeconds >= awayThr) return 'away';
      if (idleSeconds >= idleThr) return 'idle';
      return 'active';
    };

    const sample = async () => {
      if (stoppedRef.current) return;
      try {
        const idleSeconds = await window.niyoqDesktop.getIdleSeconds();
        const state = classify(idleSeconds);
        const now = Date.now();
        // Only emit on state change OR every BATCH_MS so we keep one heartbeat
        const last = lastStateRef.current;
        if (!last || last.state !== state || (now - last.ts) > BATCH_MS) {
          bufferRef.current.push({ ts: now, state, idleSeconds: Math.round(idleSeconds) });
          lastStateRef.current = { state, ts: now };
        }
      } catch {}
    };

    const flush = async () => {
      if (stoppedRef.current) return;
      const items = bufferRef.current.splice(0, bufferRef.current.length);
      if (items.length === 0) return;
      try {
        await api.post('/usage/activity-batch', { samples: items });
      } catch (err) {
        if (err.response?.data?.stop) { stoppedRef.current = true; return; }
      }
    };

    const sampleId = setInterval(sample, POLL_MS);
    const flushId = setInterval(flush, BATCH_MS);
    sample();

    return () => {
      stoppedRef.current = true;
      clearInterval(sampleId);
      clearInterval(flushId);
      flush();
    };
  }, [
    monitoring.config?.activityLevel?.enabled,
    monitoring.config?.activityLevel?.idleThresholdMinutes,
    monitoring.config?.activityLevel?.awayThresholdMinutes,
    monitoring.bypass,
    monitoring.needsAcceptance,
    user?._id
  ]);
}
