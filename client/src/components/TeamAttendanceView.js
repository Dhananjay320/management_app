import { useEffect, useState } from 'react';
import api from '../services/api';
import Avatar from './Avatar';

// Manager view of the whole team's attendance for a single date. Polls every
// 30s while open so live break/active state stays fresh.

const STATUS = {
  active:   { label: 'Active',     dot: '#10B981', bg: 'rgba(16,185,129,0.10)',  ink: '#10B981' },
  on_break: { label: 'On break',   dot: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  ink: '#F59E0B' },
  wrapped:  { label: 'Wrapped up', dot: '#94A3B8', bg: 'rgba(148,163,184,0.10)', ink: '#94A3B8' },
  absent:   { label: 'Absent',     dot: '#EF4444', bg: 'rgba(239,68,68,0.10)',   ink: '#EF4444' }
};

const BREAK_ICONS = { lunch: '🍱', tea: '🍵', personal: '🚶' };

const fmtMinutes = (m) => {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
};

const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—';

export default function TeamAttendanceView() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState({ marked: [], unmarked: [] });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await api.get('/attendance/team', { params: { date } });
        if (!cancelled) setData(data);
      } catch (err) {
        if (!cancelled) setData({ marked: [], unmarked: [], error: err.response?.data?.error });
      } finally { if (!cancelled) setLoading(false); }
    };
    setLoading(true);
    load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [date]);

  // Build a unified rows list: marked users with their record + unmarked as "absent"
  const rows = [
    ...(data.marked || []),
    ...(data.unmarked || []).map(u => ({ user: u, liveStatus: 'absent' }))
  ].filter(r => {
    if (filter !== 'all' && r.liveStatus !== filter) return false;
    if (query && !r.user?.name?.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  // Counts for filter pills
  const counts = (data.marked || []).reduce((acc, r) => {
    acc[r.liveStatus] = (acc[r.liveStatus] || 0) + 1;
    return acc;
  }, { absent: (data.unmarked || []).length });
  const totalCount = (data.marked?.length || 0) + (data.unmarked?.length || 0);

  return (
    <div>
      {/* Header: date picker + summary + search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--glass)', border: '1px solid var(--line-2)', color: 'var(--ink)', fontSize: 12 }} />
        <input type="text" placeholder="Search by name…" value={query} onChange={e => setQuery(e.target.value)}
          style={{ flex: 1, minWidth: 180, padding: '6px 10px', borderRadius: 8, background: 'var(--glass)', border: '1px solid var(--line-2)', color: 'var(--ink)', fontSize: 12 }} />
        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{rows.length} of {totalCount}</span>
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {[
          ['all',      'All',      totalCount],
          ['active',   'Active',   counts.active   || 0],
          ['on_break', 'On break', counts.on_break || 0],
          ['wrapped',  'Wrapped',  counts.wrapped  || 0],
          ['absent',   'Absent',   counts.absent   || 0]
        ].map(([k, l, n]) => {
          const s = STATUS[k];
          const active = filter === k;
          return (
            <button key={k} onClick={() => setFilter(k)}
              style={{
                padding: '6px 12px', borderRadius: 14, cursor: 'pointer',
                fontSize: 11, fontWeight: 700,
                background: active ? (s?.bg || 'var(--glass-2)') : 'transparent',
                border: `1px solid ${active ? (s?.ink || 'var(--ink-2)') : 'var(--line-2)'}`,
                color: active ? (s?.ink || 'var(--ink)') : 'var(--ink-2)'
              }}>
              {l} <span style={{ marginLeft: 6, opacity: 0.7 }}>{n}</span>
            </button>
          );
        })}
      </div>

      {loading && rows.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)' }}>Loading team…</div>}

      {/* Table */}
      {rows.length > 0 && (
        <div style={{ background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr',
            gap: 12, padding: '10px 14px',
            background: 'var(--glass-2)',
            fontSize: 10, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 0.5
          }}>
            <div>Employee</div>
            <div>Status</div>
            <div>Entry</div>
            <div>Wrap-up</div>
            <div>Worked</div>
            <div>Breaks</div>
          </div>
          {rows.map((r, i) => {
            const s = STATUS[r.liveStatus] || STATUS.absent;
            const isOpenBreak = r.liveStatus === 'on_break';
            const breakMin = r.currentBreakStartedAt
              ? Math.round((Date.now() - new Date(r.currentBreakStartedAt).getTime()) / 60000)
              : 0;
            return (
              <div key={r.user?._id || i} style={{
                display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr',
                gap: 12, padding: '12px 14px',
                borderTop: '1px solid var(--line)',
                fontSize: 12, alignItems: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar user={r.user} size={28} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.user?.name || '—'}</div>
                    <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>{r.user?.jobTitle || r.user?.workType || ''}</div>
                  </div>
                </div>
                <div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 10, background: s.bg, color: s.ink, fontSize: 11, fontWeight: 700 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }} />
                    {s.label}
                  </span>
                  {isOpenBreak && (
                    <div style={{ fontSize: 9, color: 'var(--ink-3)', marginTop: 2 }}>
                      {BREAK_ICONS[r.currentBreakType] || ''} {r.currentBreakType} · {breakMin}m
                    </div>
                  )}
                </div>
                <div style={{ color: 'var(--ink-2)', fontFamily: 'var(--mono)' }}>{fmtTime(r.entryTime)}</div>
                <div style={{ color: 'var(--ink-2)', fontFamily: 'var(--mono)' }}>{fmtTime(r.wrapUpTime)}</div>
                <div style={{ color: 'var(--ink)', fontWeight: 700 }}>{r.entryTime ? fmtMinutes(r.workedMinutes || 0) : '—'}</div>
                <div style={{ color: 'var(--ink-2)' }}>
                  {r.breaksToday > 0
                    ? <span>{r.breaksToday} · {fmtMinutes(r.breakMinutes || 0)}</span>
                    : <span style={{ color: 'var(--ink-4)' }}>—</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)' }}>
          No employees match this filter.
        </div>
      )}
    </div>
  );
}
