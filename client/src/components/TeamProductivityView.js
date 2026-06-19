import { useEffect, useState } from 'react';
import api from '../services/api';
import Avatar from './Avatar';
import AdminScreenshotViewer from './AdminScreenshotViewer';

// Admin team productivity dashboard. One row per employee with:
//   - productivity score (donut + %)
//   - time mix (productive / neutral / unproductive bars)
//   - active vs idle vs away percentages from idle-tracker samples
//   - live status (on duty / wrapped / off)
//
// Date-range presets: Today, Last 24h, This week, This month.

const RANGES = [
  { key: '24h',   label: 'Last 24h',  hours: 24 },
  { key: 'today', label: 'Today',     hours: null }, // computed as start-of-day
  { key: 'week',  label: 'Last 7d',   hours: 24 * 7 },
  { key: 'month', label: 'Last 30d',  hours: 24 * 30 }
];

const STATUS = {
  on_duty: { label: 'On duty',     dot: '#10B981' },
  wrapped: { label: 'Wrapped',     dot: '#94A3B8' },
  off:     { label: 'Off',         dot: '#475569' }
};

function pctColor(pct) {
  if (pct === null) return 'var(--ink-4)';
  if (pct >= 70) return 'var(--emerald)';
  if (pct >= 40) return 'var(--amber)';
  return 'var(--danger)';
}

export default function TeamProductivityView() {
  const [range, setRange] = useState('24h');
  const [data, setData] = useState({ rows: [] });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [viewerFor, setViewerFor] = useState(null); // { _id, name } or null

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const r = RANGES.find(x => x.key === range);
    let from;
    if (r.key === 'today') {
      const d = new Date(); d.setHours(0,0,0,0);
      from = d.toISOString();
    } else {
      from = new Date(Date.now() - r.hours * 60 * 60 * 1000).toISOString();
    }
    api.get('/usage/team-productivity', { params: { from } })
      .then(res => { if (!cancelled) setData(res.data); })
      .catch(err => { if (!cancelled) setData({ rows: [], error: err.response?.data?.error }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range]);

  const rows = (data.rows || []).filter(r =>
    !query || r.user?.name?.toLowerCase().includes(query.toLowerCase())
  );

  const aggregate = rows.reduce((acc, r) => {
    if (r.productivityPct !== null) { acc.sum += r.productivityPct; acc.count++; }
    return acc;
  }, { sum: 0, count: 0 });
  const teamAvg = aggregate.count > 0 ? Math.round(aggregate.sum / aggregate.count) : null;

  return (
    <div>
      {data.error && <div style={{ padding: 16, background: 'rgba(239,68,68,0.08)', color: 'var(--danger)', borderRadius: 8, fontSize: 12, marginBottom: 14 }}>{data.error}</div>}

      {/* Header: range picker + search + team average */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {RANGES.map(r => (
            <button key={r.key} onClick={() => setRange(r.key)}
              style={{
                padding: '5px 12px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                background: range === r.key ? 'rgba(99,102,241,0.10)' : 'transparent',
                color: range === r.key ? 'var(--indigo)' : 'var(--ink-2)',
                border: `1px solid ${range === r.key ? 'var(--indigo)' : 'var(--line-2)'}`,
                cursor: 'pointer'
              }}>{r.label}</button>
          ))}
        </div>
        <input type="text" placeholder="Search…" value={query} onChange={e => setQuery(e.target.value)}
          style={{ flex: 1, minWidth: 160, padding: '6px 10px', borderRadius: 8, background: 'var(--glass)', border: '1px solid var(--line-2)', color: 'var(--ink)', fontSize: 12 }} />
        {teamAvg !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 10 }}>
            <span style={{ fontSize: 10, color: 'var(--ink-3)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>Team avg</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: pctColor(teamAvg) }}>{teamAvg}%</span>
          </div>
        )}
      </div>

      {loading && rows.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)' }}>Loading…</div>
      )}

      {!loading && rows.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)', fontSize: 12 }}>
          No data yet for this period. Make sure the desktop tracker is enabled and employees have accepted the policy.
        </div>
      )}

      {/* Cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {rows.map(r => {
          const pct = r.productivityPct;
          const col = pctColor(pct);
          const s = STATUS[r.liveStatus] || STATUS.off;
          const b = r.buckets || {};
          const total = Math.max(1, b.productive + b.neutral + b.unproductive);
          return (
            <div key={r.user?._id}
              onClick={() => r.user?._id && setViewerFor({ _id: r.user._id, name: r.user.name })}
              title="Click to view screenshots"
              style={{
                background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 12,
                padding: 14, cursor: r.user?._id ? 'pointer' : 'default',
                transition: 'border-color 0.12s, transform 0.12s'
              }}
              onMouseEnter={e => { if (r.user?._id) { e.currentTarget.style.borderColor = 'var(--indigo)'; e.currentTarget.style.transform = 'translateY(-2px)'; } }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.transform = 'translateY(0)'; } }
              >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <Avatar user={r.user} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.user?.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--ink-3)' }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot }} />
                    {s.label}{r.user?.jobTitle ? ` · ${r.user.jobTitle}` : ''}
                  </div>
                </div>
                {/* Donut */}
                {pct !== null ? (
                  <div style={{
                    width: 50, height: 50, borderRadius: '50%',
                    background: `conic-gradient(${col} ${pct * 3.6}deg, var(--bg-1) 0)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: col }}>{pct}%</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ width: 50, height: 50, borderRadius: '50%', border: '1px dashed var(--line-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-4)', fontSize: 10 }}>—</div>
                )}
              </div>

              {/* Time mix bars */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: 'var(--bg-1)' }}>
                  {b.productive > 0 && <div style={{ width: `${(b.productive / total) * 100}%`, background: 'var(--emerald)' }} title={`Productive ${b.productive}m`} />}
                  {b.neutral > 0 && <div style={{ width: `${(b.neutral / total) * 100}%`, background: 'var(--ink-3)' }} title={`Neutral ${b.neutral}m`} />}
                  {b.unproductive > 0 && <div style={{ width: `${(b.unproductive / total) * 100}%`, background: 'var(--danger)' }} title={`Unproductive ${b.unproductive}m`} />}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--ink-3)', marginTop: 4, fontFamily: 'var(--mono)' }}>
                  <span style={{ color: 'var(--emerald)' }}>{b.productive}m</span>
                  <span>{b.neutral}m</span>
                  <span style={{ color: 'var(--danger)' }}>{b.unproductive}m</span>
                </div>
              </div>

              {/* Activity mix */}
              {r.activityMix && (
                <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                  <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ color: 'var(--emerald)', fontWeight: 800, fontFamily: 'var(--mono)' }}>{r.activityMix.activePct}%</div>
                    <div style={{ color: 'var(--ink-3)' }}>Active</div>
                  </div>
                  <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ color: 'var(--amber)', fontWeight: 800, fontFamily: 'var(--mono)' }}>{r.activityMix.idlePct}%</div>
                    <div style={{ color: 'var(--ink-3)' }}>Idle</div>
                  </div>
                  <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ color: 'var(--danger)', fontWeight: 800, fontFamily: 'var(--mono)' }}>{r.activityMix.awayPct}%</div>
                    <div style={{ color: 'var(--ink-3)' }}>Away</div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {viewerFor && (
        <AdminScreenshotViewer
          userId={viewerFor._id}
          userName={viewerFor.name}
          onClose={() => setViewerFor(null)}
        />
      )}
    </div>
  );
}
