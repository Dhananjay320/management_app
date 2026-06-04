import { useEffect, useState } from 'react';
import api from '../services/api';
import AppCategorizationPanel from './AppCategorizationPanel';

// Admin-only Monitoring switches. Lives inside the Settings page.
// Every feature defaults off; toggling `enabled` bumps the policyVersion
// server-side and forces all employees to re-accept on next visit.

function Toggle({ on, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        width: 38, height: 22, borderRadius: 999, padding: 2,
        background: on ? 'var(--emerald)' : 'var(--glass-2)',
        border: `1px solid ${on ? 'var(--emerald)' : 'var(--line-2)'}`,
        position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.15s'
      }}>
      <span style={{
        display: 'block', width: 16, height: 16, borderRadius: 999,
        background: '#fff', transform: `translateX(${on ? 14 : 0}px)`,
        transition: 'transform 0.15s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)'
      }} />
    </button>
  );
}

function Row({ icon, title, desc, on, onToggle, children }) {
  return (
    <div style={{
      padding: 14, marginBottom: 10,
      background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 10
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 22 }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{title}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{desc}</div>
        </div>
        <Toggle on={on} onClick={onToggle} />
      </div>
      {on && children && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--line)', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function NumInput({ label, value, onChange, min, max, suffix }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 110 }}>
      <label style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type="number" value={value} min={min} max={max}
          onChange={e => onChange(Number(e.target.value))}
          style={{
            width: 70, padding: '5px 8px', borderRadius: 6,
            background: 'var(--bg-1)', border: '1px solid var(--line-2)',
            color: 'var(--ink)', fontSize: 12
          }} />
        <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>{suffix}</span>
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 130 }}>
      <label style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{
          padding: '5px 8px', borderRadius: 6,
          background: 'var(--bg-1)', border: '1px solid var(--line-2)',
          color: 'var(--ink)', fontSize: 12
        }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export default function MonitoringSettings() {
  const [cfg, setCfg] = useState(null);
  const [savedAt, setSavedAt] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/monitoring/config')
      .then(r => setCfg(r.data))
      .catch(e => setError(e.response?.data?.error || 'Failed to load monitoring config.'));
  }, []);

  const save = async (patch) => {
    try {
      const { data } = await api.put('/monitoring/config', patch);
      setCfg(data);
      setSavedAt(Date.now());
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to save.');
    }
  };

  if (error) {
    return <div style={{ padding: 16, color: 'var(--danger)', fontSize: 12 }}>{error}</div>;
  }
  if (!cfg) {
    return <div style={{ padding: 16, color: 'var(--ink-3)', fontSize: 12 }}>Loading monitoring config…</div>;
  }

  const showSaved = Date.now() - savedAt < 1500;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Workplace monitoring</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
            Policy version: <strong>{cfg.policyVersion}</strong>
            {' · '}
            Toggling any switch forces every employee to re-accept.
          </div>
        </div>
        {showSaved && <span style={{ fontSize: 10, color: 'var(--emerald)', fontWeight: 700 }}>✓ Saved</span>}
      </div>

      <Row icon="📸" title="Periodic screenshots"
        desc="Capture the employee's desktop at intervals. Employees can see every screenshot in their profile."
        on={cfg.screenshots.enabled}
        onToggle={() => save({ screenshots: { enabled: !cfg.screenshots.enabled } })}>
        <Select label="Mode" value={cfg.screenshots.mode}
          options={[
            { value: 'periodic', label: 'Periodic (fixed)' },
            { value: 'random',   label: 'Random within interval' },
            { value: 'blur',     label: 'Periodic + blurred' }
          ]}
          onChange={v => save({ screenshots: { mode: v } })} />
        <NumInput label="Interval" value={cfg.screenshots.intervalMinutes} min={1} max={60}
          onChange={v => save({ screenshots: { intervalMinutes: v } })} suffix="min" />
        <NumInput label="Retention" value={cfg.screenshots.retentionDays} min={1} max={365}
          onChange={v => save({ screenshots: { retentionDays: v } })} suffix="days" />
      </Row>

      <Row icon="🪟" title="App & window usage tracking"
        desc="Log which application is in the foreground while clocked in (requires the desktop app)."
        on={cfg.appUsage.enabled}
        onToggle={() => save({ appUsage: { enabled: !cfg.appUsage.enabled } })}>
        <NumInput label="Retention" value={cfg.appUsage.retentionDays} min={1} max={365}
          onChange={v => save({ appUsage: { retentionDays: v } })} suffix="days" />
        <div style={{ flex: '1 1 100%', marginTop: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
            App categorization
          </div>
          <AppCategorizationPanel />
        </div>
      </Row>

      <Row icon="⚡" title="Activity level (keystroke + mouse counts)"
        desc="Count input events to flag Active / Idle / Away. No keystrokes are recorded — only counts."
        on={cfg.activityLevel.enabled}
        onToggle={() => save({ activityLevel: { enabled: !cfg.activityLevel.enabled } })}>
        <NumInput label="Idle after" value={cfg.activityLevel.idleThresholdMinutes} min={1} max={60}
          onChange={v => save({ activityLevel: { idleThresholdMinutes: v } })} suffix="min" />
        <NumInput label="Away after" value={cfg.activityLevel.awayThresholdMinutes} min={1} max={120}
          onChange={v => save({ activityLevel: { awayThresholdMinutes: v } })} suffix="min" />
      </Row>

      <Row icon="🤳" title="Selfie at clock-in"
        desc="Ask the employee for a webcam selfie when they mark entry. Stored with the day's attendance record."
        on={cfg.selfieAtEntry.enabled}
        onToggle={() => save({ selfieAtEntry: { enabled: !cfg.selfieAtEntry.enabled } })} />

      <Row icon="⏸" title="Auto-pause work timer when idle"
        desc="If the system is idle past the threshold, automatically pause the running work timer."
        on={cfg.idleAutoPause.enabled}
        onToggle={() => save({ idleAutoPause: { enabled: !cfg.idleAutoPause.enabled } })}>
        <NumInput label="Pause after" value={cfg.idleAutoPause.idleMinutes} min={1} max={60}
          onChange={v => save({ idleAutoPause: { idleMinutes: v } })} suffix="min" />
      </Row>
    </div>
  );
}
