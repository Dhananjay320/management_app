import { useEffect, useRef } from 'react';
import api from '../services/api';

// Auto screenshot scheduler — runs only inside Electron, only when the
// monitoring config has screenshots enabled, and only while the user is
// clocked in. Pauses on system lock / suspend.
//
// Modes:
//   periodic — fires exactly every `intervalMinutes` minutes
//   blur     — same as periodic, but the server applies blur on save
//   random   — picks a random delay within each interval window so the
//              employee can't predict exactly when the next shot lands
export default function useScreenshotScheduler({ monitoring, user }) {
  const stoppedRef = useRef(false);
  const timeoutRef = useRef(null);
  const lastCaptureRef = useRef(0);

  useEffect(() => {
    // Hard gates — exit early if any are false
    if (!window.niyoqDesktop?.capturePrimary) return;     // not in Electron
    if (!user || user._c) return;                         // logged out, or sys account exempt
    if (monitoring.bypass) return;                        // explicit bypass
    if (monitoring.needsAcceptance) return;               // waiting for user consent
    const sc = monitoring.config?.screenshots;
    if (!sc?.enabled) return;                             // feature off

    stoppedRef.current = false;

    const intervalMs = Math.max(60_000, (sc.intervalMinutes || 10) * 60_000);
    const mode = sc.mode || 'periodic';

    const computeNextDelay = () => {
      if (mode === 'random') {
        // Random delay between 30% and 100% of intervalMs — bounded so the
        // capture rate over time still averages to roughly the configured rate.
        return Math.floor(intervalMs * (0.3 + Math.random() * 0.7));
      }
      return intervalMs;
    };

    const captureAndSchedule = async () => {
      if (stoppedRef.current) return;
      try {
        // Skip if a capture just happened (e.g. visibility change re-triggered)
        if (Date.now() - lastCaptureRef.current < 30_000) {
          schedule();
          return;
        }

        // Multi-monitor: capture every connected display in parallel; otherwise
        // just the primary. Each display goes up as a separate Screenshot row
        // tagged with its capturedAt so the timeline stays consistent.
        const uploadOne = async (jpegBase64, capturedAtIso, displayName) => {
          const blob = await (await fetch('data:image/jpeg;base64,' + jpegBase64)).blob();
          const fd = new FormData();
          fd.append('image', blob, `auto-${displayName || 'primary'}.jpg`);
          fd.append('capturedAt', capturedAtIso);
          if (displayName) fd.append('displayName', displayName);
          try {
            await api.post('/usage/screenshot', fd);
          } catch (err) {
            if (err.response?.data?.stop) { stoppedRef.current = true; }
          }
        };

        if (sc.multiScreen && window.niyoqDesktop.captureScreens) {
          const shots = await window.niyoqDesktop.captureScreens();
          if (Array.isArray(shots) && shots.length > 0) {
            lastCaptureRef.current = Date.now();
            const capturedAtIso = new Date().toISOString();
            await Promise.all(shots.map((s, i) =>
              uploadOne(s.dataUrl, capturedAtIso, s.name || `screen-${i + 1}`)
            ));
          }
        } else {
          const shot = await window.niyoqDesktop.capturePrimary();
          if (shot?.jpegBase64) {
            lastCaptureRef.current = Date.now();
            await uploadOne(shot.jpegBase64, new Date(shot.capturedAt).toISOString(), null);
          }
        }
      } catch {}
      schedule();
    };

    const schedule = () => {
      if (stoppedRef.current) return;
      timeoutRef.current = setTimeout(captureAndSchedule, computeNextDelay());
    };

    // First fire after one full interval — don't snap on mount
    schedule();

    // Pause / resume on system power events
    const unsub = window.niyoqDesktop.onPowerState?.((state) => {
      if (state === 'lock' || state === 'suspend') {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      } else if (state === 'unlock' || state === 'resume') {
        if (!timeoutRef.current && !stoppedRef.current) schedule();
      }
    });

    return () => {
      stoppedRef.current = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (typeof unsub === 'function') unsub();
    };
  }, [
    monitoring.config?.screenshots?.enabled,
    monitoring.config?.screenshots?.intervalMinutes,
    monitoring.config?.screenshots?.mode,
    monitoring.config?.screenshots?.multiScreen,
    monitoring.bypass,
    monitoring.needsAcceptance,
    user?._id
  ]);
}
