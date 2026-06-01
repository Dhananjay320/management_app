import { useEffect, useState } from 'react';
import api from '../services/api';

// Break tracker: typed start/end with a live mm:ss counter while a break is
// open, a summary of breaks taken today, and overrun flags against the company
// policy. Renders inline inside the Attendance "Mark Entry" tab.
//
// Props:
//   todayAtt  — today's Attendance record (with breaks[])
//   onChange  — callback to reload parent state after start/end

const TYPES = [
  { key: 'lunch',    label: 'Lunch',    icon: '🍱', defaultMax: 45 },
  { key: 'tea',      label: 'Tea',      icon: '🍵', defaultMax: 15 },
  { key: 'personal', label: 'Personal', icon: '🚶', defaultMax: 20 }
];

const fmtDuration = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
};

export default function BreakTracker({ todayAtt, onChange }) {
  const [policy, setPolicy] = useState({ lunch: 45, tea: 15, personal: 20 });
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    api.get('/onboarding/company')
      .then(r => { if (r.data?.breakPolicy) setPolicy(r.data.breakPolicy); })
      .catch(() => {});
  }, []);

  // Tick once a second while a break is open so the live counter updates
  const open = (todayAtt?.breaks || []).find(b => !b.endedAt);
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  if (!todayAtt?.entryTime || todayAtt?.wrapUpTime) return null;

  const closed = (todayAtt.breaks || []).filter(b => b.endedAt);

  const startBreak = async (type) => {
    setBusy(true);
    try {
      await api.post('/attendance/break/start', { type });
      onChange?.();
      window.dispatchEvent(new CustomEvent('attendance:break-changed'));
    } catch (err) {
      window.alert(err.response?.data?.error || 'Failed to start break.');
    } finally { setBusy(false); }
  };

  const endBreak = async () => {
    setBusy(true);
    try {
      await api.post('/attendance/break/end');
      onChange?.();
      window.dispatchEvent(new CustomEvent('attendance:break-changed'));
    } catch (err) {
      window.alert(err.response?.data?.error || 'Failed to end break.');
    } finally { setBusy(false); }
  };

  return (
    <div style={{
      marginTop: 14,
      padding: 14,
      background: 'var(--glass)',
      border: '1px solid var(--line)',
      borderRadius: 12
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
        Breaks
      </div>

      {open ? (
        (() => {
          const startedAt = new Date(open.startedAt).getTime();
          const elapsedMs = now - startedAt;
          const maxMs = (policy[open.type] ?? TYPES.find(t => t.key === open.type)?.defaultMax ?? 30) * 60_000;
          const over = elapsedMs > maxMs;
          const t = TYPES.find(x => x.key === open.type);
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 26 }}>{t?.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{t?.label} break in progress</div>
                <div style={{ fontSize: 11, color: over ? 'var(--danger)' : 'var(--ink-2)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                  {fmtDuration(elapsedMs)}{over ? ` · ${fmtDuration(elapsedMs - maxMs)} over` : ` / ${policy[open.type]}m max`}
                </div>
              </div>
              <button onClick={endBreak} disabled={busy}
                style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--emerald)', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}>
                ✓ End break
              </button>
            </div>
          );
        })()
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {TYPES.map(t => (
            <button key={t.key} onClick={() => startBreak(t.key)} disabled={busy}
              style={{
                flex: '1 1 0', minWidth: 90,
                padding: '10px 12px',
                borderRadius: 10,
                background: 'rgba(99,102,241,0.08)',
                border: '1px solid rgba(99,102,241,0.20)',
                color: 'var(--ink)',
                cursor: busy ? 'wait' : 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4
              }}>
              <span style={{ fontSize: 22 }}>{t.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 700 }}>{t.label}</span>
              <span style={{ fontSize: 9, color: 'var(--ink-3)' }}>{policy[t.key] ?? t.defaultMax}m max</span>
            </button>
          ))}
        </div>
      )}

      {closed.length > 0 && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          <div style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>
            Today's breaks
          </div>
          {closed.map((b, i) => {
            const ms = new Date(b.endedAt) - new Date(b.startedAt);
            const max = (policy[b.type] ?? 30) * 60_000;
            const over = ms > max;
            const t = TYPES.find(x => x.key === b.type);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '4px 0', color: 'var(--ink-2)' }}>
                <span>{t?.icon}</span>
                <span style={{ flex: 1 }}>{t?.label}</span>
                <span style={{ color: over ? 'var(--danger)' : 'var(--ink-2)', fontFamily: 'var(--mono)' }}>
                  {fmtDuration(ms)}{over ? ' ⚠️' : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
