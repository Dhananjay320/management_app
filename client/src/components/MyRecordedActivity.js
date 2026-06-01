import { useEffect, useState } from 'react';
import api, { getFileUrl } from '../services/api';
import useMonitoringConfig from '../hooks/useMonitoringConfig';

// Employee-only "what was recorded of me" view, surfaced on the Profile page.
// Shows the user their own data exactly as captured — no aggregations, no
// admin-only fields. Sections render only when the relevant monitoring
// feature is enabled by the company.

const BREAK_ICON = { lunch: '🍱', tea: '🍵', personal: '🚶' };

function Card({ title, subtitle, children, action }) {
  return (
    <div style={{ background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ icon, message }) {
  return (
    <div style={{ padding: 16, textAlign: 'center', color: 'var(--ink-3)', fontSize: 12 }}>
      <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
      {message}
    </div>
  );
}

export default function MyRecordedActivity() {
  const { config, bypass, loading: monLoading } = useMonitoringConfig();
  const [today, setToday] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/attendance/today').then(r => setToday(r.data)).catch(() => setToday(null)).finally(() => setLoading(false));
  }, []);

  // Sys users see a marker that they're exempt from all monitoring.
  if (bypass) {
    return (
      <div className="profile-section">
        <h3>My recorded activity</h3>
        <div style={{ padding: 16, fontSize: 12, color: 'var(--ink-3)', background: 'var(--glass)', border: '1px dashed var(--line-2)', borderRadius: 10 }}>
          Your account is exempt from workplace monitoring. Nothing is being recorded.
        </div>
      </div>
    );
  }

  if (monLoading || loading) {
    return (
      <div className="profile-section">
        <h3>My recorded activity</h3>
        <div style={{ padding: 16, color: 'var(--ink-3)', fontSize: 12 }}>Loading…</div>
      </div>
    );
  }

  // Compute total break time for today
  const breaks = today?.breaks || [];
  const totalBreakMs = breaks.reduce((sum, b) => {
    const start = new Date(b.startedAt).getTime();
    const end = b.endedAt ? new Date(b.endedAt).getTime() : Date.now();
    return sum + Math.max(0, end - start);
  }, 0);
  const totalBreakMin = Math.round(totalBreakMs / 60_000);

  // Compute today's worked time
  const workedMin = today?.entryTime
    ? Math.max(0, Math.round(
        ((today.wrapUpTime ? new Date(today.wrapUpTime).getTime() : Date.now()) - new Date(today.entryTime).getTime() - totalBreakMs) / 60_000
      ))
    : 0;

  const anyFeatureEnabled = config && [
    config.screenshots?.enabled,
    config.appUsage?.enabled,
    config.activityLevel?.enabled,
    config.selfieAtEntry?.enabled
  ].some(Boolean);

  return (
    <div className="profile-section">
      <h3>My recorded activity</h3>

      {!anyFeatureEnabled && (
        <div style={{ padding: 14, fontSize: 12, color: 'var(--ink-3)', background: 'var(--glass)', border: '1px dashed var(--line-2)', borderRadius: 10, marginBottom: 12 }}>
          Workplace monitoring is currently <strong style={{ color: 'var(--ink-2)' }}>off</strong> for your company.
          When your admin turns it on, you'll see exactly what was captured here.
        </div>
      )}

      {/* Today's work summary — always shown */}
      <Card title="Today" subtitle={today?.entryTime ? new Date(today.entryTime).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) : 'Not clocked in yet'}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
          <Stat label="Entry"   value={today?.entryTime ? new Date(today.entryTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—'} />
          <Stat label="Wrap-up" value={today?.wrapUpTime ? new Date(today.wrapUpTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—'} />
          <Stat label="Worked"  value={today?.entryTime ? `${Math.floor(workedMin/60)}h ${workedMin%60}m` : '—'} />
          <Stat label="Breaks"  value={breaks.length ? `${breaks.length} · ${totalBreakMin}m` : '—'} />
        </div>
      </Card>

      {/* Entry selfie — shown only if the monitoring feature was on AND a selfie exists */}
      {config?.selfieAtEntry?.enabled && (
        <Card title="🤳 Entry selfie" subtitle="Captured at clock-in to verify it was you.">
          {today?.entrySelfie ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <img src={getFileUrl(today.entrySelfie)} alt="Today's entry selfie"
                style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover', border: '1px solid var(--line-2)' }} />
              <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                Taken when you marked entry. Only visible to you and your admin.
              </div>
            </div>
          ) : (
            <EmptyState icon="📷" message="No selfie captured today." />
          )}
        </Card>
      )}

      {/* Breaks — always shown if any happened */}
      {breaks.length > 0 && (
        <Card title="🍵 Breaks taken today">
          {breaks.map((b, i) => {
            const ended = b.endedAt ? new Date(b.endedAt) : null;
            const ms = (ended ? ended.getTime() : Date.now()) - new Date(b.startedAt).getTime();
            const min = Math.round(ms / 60_000);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 12, color: 'var(--ink-2)' }}>
                <span style={{ fontSize: 18 }}>{BREAK_ICON[b.type] || '☕'}</span>
                <span style={{ flex: 1, fontWeight: 600 }}>{b.type[0].toUpperCase() + b.type.slice(1)}</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink-3)' }}>
                  {new Date(b.startedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  {' → '}
                  {ended ? ended.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 'ongoing'}
                </span>
                <span style={{ minWidth: 50, textAlign: 'right', color: 'var(--ink-2)', fontWeight: 700 }}>{min}m</span>
              </div>
            );
          })}
        </Card>
      )}

      {/* Screenshots — placeholder until the Electron pipeline + storage land */}
      {config?.screenshots?.enabled && (
        <Card title="📸 Recorded screenshots"
          subtitle={`Captured every ${config.screenshots.intervalMinutes} min · kept ${config.screenshots.retentionDays} days · ${config.screenshots.mode} mode`}>
          <EmptyState icon="🖼" message="No screenshots have been captured yet. They'll show here as a timeline once the desktop tracker is running." />
        </Card>
      )}

      {/* App usage — placeholder */}
      {config?.appUsage?.enabled && (
        <Card title="🪟 App & website usage"
          subtitle={`Kept ${config.appUsage.retentionDays} days. Only window titles, no content.`}>
          <EmptyState icon="📊" message="Nothing recorded yet. App usage shows here once the desktop tracker has been running for a few minutes." />
        </Card>
      )}

      {/* Activity level — placeholder */}
      {config?.activityLevel?.enabled && (
        <Card title="⚡ Activity level"
          subtitle={`Idle after ${config.activityLevel.idleThresholdMinutes} min · away after ${config.activityLevel.awayThresholdMinutes} min`}>
          <EmptyState icon="📈" message="Activity samples will appear here as the day progresses." />
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', marginTop: 2, fontFamily: 'var(--mono)' }}>{value}</div>
    </div>
  );
}
