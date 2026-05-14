import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const KIND_STYLE = {
  leave_approval: { color: '#F59E0B', bg: 'rgba(245,158,11,0.08)' },
  meeting_invite: { color: '#6366F1', bg: 'rgba(99,102,241,0.08)' },
  task_due:       { color: '#EF4444', bg: 'rgba(239,68,68,0.08)' },
  salary_dispute: { color: '#8B5CF6', bg: 'rgba(139,92,246,0.08)' },
  report:         { color: '#06B6D4', bg: 'rgba(6,182,212,0.08)' },
  announcement:   { color: '#10B981', bg: 'rgba(16,185,129,0.08)' },
};

const KIND_LABEL = {
  leave_approval: 'Leave to approve',
  meeting_invite: 'Meeting to respond',
  task_due: 'Task due',
  salary_dispute: 'Salary dispute',
  report: 'Daily report',
  announcement: 'Announcement',
};

const fmtAgo = (iso) => {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return Math.floor(h / 24) + 'd';
};

export default function PendingActionsWidget() {
  const navigate = useNavigate();
  const [data, setData] = useState({ total: 0, counts: {}, items: [] });
  const [collapsed, setCollapsed] = useState(false);
  const [filterKind, setFilterKind] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/pending-actions');
      setData(data);
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000); // re-poll every minute
    return () => clearInterval(t);
  }, [load]);

  if (data.total === 0) return null;

  const visible = filterKind ? data.items.filter(i => i.kind === filterKind) : data.items;

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(99,102,241,0.04), rgba(139,92,246,0.04))',
      border: '1px solid rgba(99,102,241,0.18)',
      borderRadius: 12, padding: 14, marginBottom: 14
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: collapsed ? 0 : 10, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>⚡</span>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Needs your attention</h3>
          <span style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600 }}>{data.total} {data.total === 1 ? 'item' : 'items'}</span>
        </div>
        <button onClick={() => setCollapsed(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', fontSize: 11, fontWeight: 600 }}>
          {collapsed ? 'Show' : 'Hide'}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Kind filter chips */}
          {Object.keys(data.counts).filter(k => data.counts[k] > 0).length > 1 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              <Chip active={!filterKind} label={`All (${data.total})`} onClick={() => setFilterKind(null)} />
              {Object.entries(data.counts).filter(([_, n]) => n > 0).map(([k, n]) => (
                <Chip key={k} active={filterKind === k} color={KIND_STYLE[k]?.color}
                  label={`${KIND_LABEL[k] || k} (${n})`}
                  onClick={() => setFilterKind(filterKind === k ? null : k)} />
              ))}
            </div>
          )}

          {/* Items list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
            {visible.map(it => {
              const s = KIND_STYLE[it.kind] || { color: '#6366F1', bg: 'rgba(99,102,241,0.08)' };
              return (
                <div key={`${it.kind}-${it.id}`} onClick={() => navigate(it.link)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px',
                    background: 'var(--glass)', borderRadius: 8,
                    border: `1px solid ${s.color}33`,
                    cursor: 'pointer', transition: 'background 0.1s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = s.bg}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--glass)'}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{it.icon || '•'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</div>
                    <div style={{ fontSize: 10, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.subtitle}</div>
                  </div>
                  <div style={{ fontSize: 9, color: s.color, fontWeight: 600, padding: '2px 7px', borderRadius: 10, background: s.bg, flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {fmtAgo(it.ts)}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Chip({ label, active, onClick, color }) {
  return (
    <button onClick={onClick}
      style={{
        padding: '4px 10px', fontSize: 10, fontWeight: 700,
        border: '1px solid ' + (active ? (color || '#6366F1') : 'var(--line)'),
        borderRadius: 12,
        background: active ? (color || '#6366F1') + '22' : 'transparent',
        color: active ? (color || '#6366F1') : 'var(--ink-2)',
        cursor: 'pointer', fontFamily: 'Inter, sans-serif'
      }}>
      {label}
    </button>
  );
}
