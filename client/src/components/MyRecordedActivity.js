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
  const [screenshots, setScreenshots] = useState([]);
  const [appUsage, setAppUsage] = useState([]);
  const [productivity, setProductivity] = useState(null);

  useEffect(() => {
    api.get('/attendance/today').then(r => setToday(r.data)).catch(() => setToday(null)).finally(() => setLoading(false));
    api.get('/usage/screenshots', { params: { limit: 60 } }).then(r => setScreenshots(r.data || [])).catch(() => setScreenshots([]));
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    api.get('/usage/app-summary', { params: { from } })
      .then(r => setAppUsage(r.data?.totals || []))
      .catch(() => setAppUsage([]));
    api.get('/usage/productivity', { params: { from } })
      .then(r => setProductivity(r.data))
      .catch(() => setProductivity(null));
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

      {/* Screenshots — real timeline if any exist, placeholder otherwise */}
      {config?.screenshots?.enabled && (
        <Card title="📸 Recorded screenshots"
          subtitle={`Captured every ${config.screenshots.intervalMinutes} min · kept ${config.screenshots.retentionDays} days · ${config.screenshots.mode} mode`}>
          {screenshots.length === 0 ? (
            <EmptyState icon="🖼" message="No screenshots captured yet. Open the Niyoq desktop app to start recording." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
              {screenshots.map(s => (
                <a key={s._id} href={getFileUrl(s.imageUrl)} target="_blank" rel="noreferrer"
                  style={{ display: 'block', background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 8, overflow: 'hidden', textDecoration: 'none' }}>
                  <img src={getFileUrl(s.imageUrl)} alt=""
                    style={{ width: '100%', height: 90, objectFit: 'cover', display: 'block', background: '#000' }} />
                  <div style={{ padding: '5px 7px', fontSize: 10, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>
                    {new Date(s.capturedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    {s.blurred ? ' · blur' : ''}
                  </div>
                </a>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Productivity score — only if we have any data */}
      {config?.appUsage?.enabled && productivity && productivity.productivityPct !== null && (
        <Card title="📈 Productivity score (last 24h)"
          subtitle={`Based on ${productivity.totalMinutes} min of tracked app usage. Uncategorized apps are excluded.`}>
          {(() => {
            const pct = productivity.productivityPct;
            const color = pct >= 70 ? 'var(--emerald)' : pct >= 40 ? 'var(--amber)' : 'var(--danger)';
            const b = productivity.buckets || {};
            const total = Math.max(1, b.productive + b.neutral + b.unproductive);
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                <div style={{
                  width: 88, height: 88, borderRadius: '50%',
                  background: `conic-gradient(${color} ${pct * 3.6}deg, var(--bg-1) 0)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative'
                }}>
                  <div style={{ width: 70, height: 70, borderRadius: '50%', background: 'var(--glass)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color }}>{pct}%</div>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  {[
                    ['Productive', b.productive, 'var(--emerald)'],
                    ['Neutral', b.neutral, 'var(--ink-3)'],
                    ['Unproductive', b.unproductive, 'var(--danger)']
                  ].map(([label, mins, c]) => (
                    <div key={label} style={{ marginBottom: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3, color: 'var(--ink-2)' }}>
                        <span style={{ fontWeight: 600 }}>{label}</span>
                        <span style={{ fontFamily: 'var(--mono)' }}>{mins}m</span>
                      </div>
                      <div style={{ height: 4, background: 'var(--bg-1)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(mins / total) * 100}%`, background: c }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </Card>
      )}

      {/* App usage — real top-apps if any, placeholder otherwise */}
      {config?.appUsage?.enabled && (
        <Card title="🪟 App & window usage (last 24h)"
          subtitle={`Kept ${config.appUsage.retentionDays} days. Only app + window title, never input content.`}>
          {appUsage.length === 0 ? (
            <EmptyState icon="📊" message="No samples yet. Open the Niyoq desktop app and stay clocked in for a minute." />
          ) : (
            (() => {
              const max = Math.max(...appUsage.map(a => a.minutes), 1);
              return (
                <div>
                  {appUsage.slice(0, 10).map(a => {
                    const pct = (a.minutes / max) * 100;
                    const mins = Math.round(a.minutes);
                    return (
                      <div key={a.app} style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                          <span style={{ color: 'var(--ink-2)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.app}</span>
                          <span style={{ color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>{mins < 1 ? '<1m' : `${mins}m`}</span>
                        </div>
                        <div style={{ height: 4, background: 'var(--bg-1)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--indigo)', transition: 'width 0.2s' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}
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
