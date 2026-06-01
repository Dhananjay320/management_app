import { useEffect, useState } from 'react';
import api from '../services/api';

// Always-on stopwatch shown in the topbar. Reads today's `entryTime` from the
// server (source of truth across refreshes / devices), and ticks once a second
// from there. Stops counting on wrap-up. Returns null until entryTime exists,
// so the timer simply doesn't render before clock-in.
export default function WorkTimer() {
  const [entry, setEntry] = useState(null);     // Date | null
  const [wrap, setWrap]   = useState(null);     // Date | null — freezes the timer
  const [breaks, setBreaks] = useState([]);     // array of {startedAt, endedAt?}
  const [now, setNow]     = useState(Date.now());

  // Fetch today's record on mount and again when an entry/wrap-up event fires.
  // The `auto-entry-marked` event is dispatched from the auto-mark hook.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await api.get('/attendance/today');
        if (cancelled) return;
        setEntry(data?.entryTime ? new Date(data.entryTime) : null);
        setWrap(data?.wrapUpTime ? new Date(data.wrapUpTime) : null);
        setBreaks(data?.breaks || []);
      } catch { /* ignore */ }
    };
    load();
    // Poll for breaks every 15s so start/end taken in the Attendance page reflect
    // even without an explicit event bus message
    const poll = setInterval(load, 15000);
    const reload = () => load();
    window.addEventListener('auto-entry-marked', reload);
    window.addEventListener('attendance:wrap-up', reload);
    window.addEventListener('attendance:break-changed', reload);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
    return () => {
      cancelled = true;
      clearInterval(poll);
      window.removeEventListener('auto-entry-marked', reload);
      window.removeEventListener('attendance:wrap-up', reload);
      window.removeEventListener('attendance:break-changed', reload);
    };
  }, []);

  // Tick every second while running
  useEffect(() => {
    if (!entry || wrap) return; // not started yet, or already wrapped up
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [entry, wrap]);

  if (!entry) return null;

  const endMs = wrap ? wrap.getTime() : now;
  // Subtract all break time (open break uses now as end)
  const breakMs = (breaks || []).reduce((sum, b) => {
    const s = new Date(b.startedAt).getTime();
    const e = b.endedAt ? new Date(b.endedAt).getTime() : endMs;
    return sum + Math.max(0, e - s);
  }, 0);
  const onBreak = (breaks || []).some(b => !b.endedAt);
  const elapsed = Math.max(0, endMs - entry.getTime() - breakMs);
  const h = Math.floor(elapsed / 3_600_000);
  const m = Math.floor((elapsed % 3_600_000) / 60_000);
  const s = Math.floor((elapsed % 60_000) / 1000);

  const stateColor = wrap ? 'var(--ink-3)' : onBreak ? 'var(--amber)' : 'var(--emerald)';
  const stateBg    = wrap ? 'rgba(148,163,184,0.10)' : onBreak ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)';
  const stateBorder= wrap ? 'rgba(148,163,184,0.25)' : onBreak ? 'rgba(245,158,11,0.30)' : 'rgba(16,185,129,0.30)';

  return (
    <div
      title={wrap
        ? `Wrapped up at ${wrap.toLocaleTimeString()}`
        : onBreak
          ? 'On break — timer paused'
          : `Clocked in at ${entry.toLocaleTimeString()}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 10px', borderRadius: 8,
        fontSize: 11, fontWeight: 700,
        background: stateBg,
        color: stateColor,
        border: `1px solid ${stateBorder}`,
        fontVariantNumeric: 'tabular-nums',
        marginRight: 8
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: stateColor }} />
      {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}<span style={{ opacity: 0.6 }}>:{String(s).padStart(2, '0')}</span>
      {onBreak && <span style={{ marginLeft: 4 }}>⏸</span>}
    </div>
  );
}
