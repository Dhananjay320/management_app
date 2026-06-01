import { useState } from 'react';

// Blocking modal shown when company monitoring is enabled and the user hasn't
// accepted the current policy. Lists exactly which monitoring features are on
// so there are no hidden surprises.

const ROWS = [
  { key: 'screenshots',    icon: '📸', label: 'Periodic desktop screenshots' },
  { key: 'appUsage',       icon: '🪟', label: 'Active app and window tracking' },
  { key: 'activityLevel',  icon: '⚡', label: 'Keystroke and mouse activity counts' },
  { key: 'selfieAtEntry',  icon: '🤳', label: 'Selfie verification at clock-in' },
  { key: 'idleAutoPause',  icon: '⏸',  label: 'Auto-pause the work timer when idle' }
];

export default function MonitoringConsentModal({ config, onAccept }) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  const enabledRows = ROWS.filter(r => config?.[r.key]?.enabled);
  if (enabledRows.length === 0) return null;

  const submit = async () => {
    setBusy(true);
    try { await onAccept(); }
    finally { setBusy(false); }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
      backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 14,
        padding: 24, width: 'min(94vw, 540px)', maxHeight: '90vh', overflowY: 'auto'
      }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', marginBottom: 6 }}>
          🔒 Workplace monitoring policy
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 18, lineHeight: 1.5 }}>
          Your company has turned on the following workplace tracking features.
          You can see exactly what's collected — there are no hidden categories.
          You must accept to continue using the app.
        </div>

        <div style={{ marginBottom: 18 }}>
          {enabledRows.map(r => (
            <div key={r.key} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 12px', borderRadius: 8,
              background: 'var(--glass)', border: '1px solid var(--line)',
              marginBottom: 8
            }}>
              <span style={{ fontSize: 20 }}>{r.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{r.label}</div>
                {r.key === 'screenshots' && config.screenshots && (
                  <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>
                    Every {config.screenshots.intervalMinutes} min · {config.screenshots.mode} mode · kept {config.screenshots.retentionDays} days
                  </div>
                )}
                {r.key === 'activityLevel' && config.activityLevel && (
                  <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>
                    Idle after {config.activityLevel.idleThresholdMinutes} min · Away after {config.activityLevel.awayThresholdMinutes} min
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 12, lineHeight: 1.5 }}>
          You can view every screenshot taken of you in your Profile → "My recorded activity".
          The data is used for fair time and productivity tracking only.
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, cursor: 'pointer' }}>
          <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
            style={{ width: 16, height: 16 }} />
          <span style={{ fontSize: 12, color: 'var(--ink)' }}>I understand and accept this monitoring policy.</span>
        </label>

        <button onClick={submit} disabled={!agreed || busy}
          style={{
            width: '100%', padding: 12, borderRadius: 10,
            background: agreed ? 'var(--indigo)' : 'var(--glass-2)',
            color: agreed ? '#fff' : 'var(--ink-3)',
            border: 'none', fontSize: 13, fontWeight: 700,
            cursor: agreed && !busy ? 'pointer' : 'not-allowed'
          }}>
          {busy ? 'Recording your acceptance…' : 'Accept and continue'}
        </button>
      </div>
    </div>
  );
}
