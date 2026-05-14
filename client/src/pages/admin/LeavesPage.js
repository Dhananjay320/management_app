import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

const STATUS_FILTERS = [
  { key: 'pending', label: 'Pending', color: '#F59E0B' },
  { key: 'approved', label: 'Approved', color: '#10B981' },
  { key: 'rejected', label: 'Rejected', color: '#EF4444' },
  { key: 'all', label: 'All' }
];

const TYPE_LABEL = {
  casual: 'Casual',
  sick: 'Sick',
  personal: 'Personal',
  half_day: 'Half day'
};

export default function LeavesPage() {
  const { user } = useAuth();
  const canManage = user?.role === 'main_admin' || user?.powers?.attendance?.editRecords === true;

  const [leaves, setLeaves] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rejectId, setRejectId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = filter === 'all'
        ? '/attendance/leaves/all'
        : `/attendance/leaves/all?status=${filter}`;
      const { data } = await api.get(url);
      setLeaves(data);
    } catch {}
    setLoading(false);
  }, [filter]);

  useEffect(() => { if (canManage) load(); }, [canManage, load]);

  if (!canManage) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
        <h2 style={{ color: 'var(--ink)' }}>Permission required</h2>
        <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>You need the <strong>Attendance &rsaquo; Edit Records</strong> power to access this page.</p>
      </div>
    );
  }

  const approve = async (id) => {
    if (!window.confirm('Approve this leave?')) return;
    setBusy(true);
    try {
      await api.put(`/attendance/leave/${id}/approve`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed.');
    }
    setBusy(false);
  };

  const reject = async () => {
    if (!rejectId) return;
    setBusy(true);
    try {
      await api.put(`/attendance/leave/${rejectId}/reject`, { reason: rejectReason });
      setRejectId(null);
      setRejectReason('');
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed.');
    }
    setBusy(false);
  };

  const fmtDate = (s) => {
    try { return new Date(s).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return s; }
  };

  const dayCount = (l) => {
    const start = new Date(l.startDate);
    const end = new Date(l.endDate);
    const diff = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
    return l.type === 'half_day' ? '0.5' : diff;
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Leaves</div>
          <div className="page-subtitle">Approve or reject leave requests from your team</div>
        </div>
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {STATUS_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '6px 16px',
              fontSize: 12,
              fontWeight: 600,
              border: '1px solid',
              borderColor: filter === f.key ? (f.color || '#6366F1') : 'var(--line)',
              borderRadius: 14,
              background: filter === f.key ? (f.color ? `${f.color}22` : 'rgba(99,102,241,0.15)') : 'transparent',
              color: filter === f.key ? (f.color || '#6366F1') : 'var(--ink-2)',
              cursor: 'pointer',
              fontFamily: 'Inter, sans-serif'
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--ink-3)' }}>Loading…</div>
      ) : leaves.length === 0 ? (
        <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--ink-3)' }}>
          No leaves match this filter.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {leaves.map(l => {
            const status = STATUS_FILTERS.find(f => f.key === l.status);
            return (
              <div key={l._id} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{l.user?.name || 'Unknown'}</span>
                      <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{l.user?.email}</span>
                      <span style={{
                        padding: '2px 8px',
                        fontSize: 10,
                        fontWeight: 700,
                        borderRadius: 10,
                        background: status?.color ? `${status.color}22` : 'rgba(148,163,184,0.15)',
                        color: status?.color || 'var(--ink-3)',
                        textTransform: 'uppercase'
                      }}>
                        {l.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 6 }}>
                      <strong>{TYPE_LABEL[l.type] || l.type}</strong>
                      {l.type === 'half_day' && l.halfDayType && ` (${l.halfDayType})`}
                      {' • '}
                      {fmtDate(l.startDate)}
                      {l.startDate !== l.endDate && ` → ${fmtDate(l.endDate)}`}
                      {' • '}
                      <span style={{ color: 'var(--ink-3)' }}>{dayCount(l)} day{dayCount(l) === '1' ? '' : 's'}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)', fontStyle: 'italic' }}>
                      "{l.reason}"
                    </div>
                    {l.status === 'rejected' && l.rejectionReason && (
                      <div style={{ fontSize: 11, color: '#EF4444', marginTop: 6 }}>
                        Rejected: {l.rejectionReason}
                      </div>
                    )}
                    {l.status === 'approved' && l.approvedBy?.name && (
                      <div style={{ fontSize: 11, color: '#10B981', marginTop: 6 }}>
                        Approved by {l.approvedBy.name}
                      </div>
                    )}
                  </div>
                  {l.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button onClick={() => approve(l._id)} disabled={busy} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 6, background: '#10B981', color: '#fff', cursor: busy ? 'wait' : 'pointer' }}>
                        ✓ Approve
                      </button>
                      <button onClick={() => { setRejectId(l._id); setRejectReason(''); }} disabled={busy} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, border: '1px solid #EF4444', borderRadius: 6, background: 'transparent', color: '#EF4444', cursor: busy ? 'wait' : 'pointer' }}>
                        ✗ Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reject modal */}
      {rejectId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: 420, padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>Reject Leave</h3>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', display: 'block', marginBottom: 6 }}>Reason (will be shown to employee)</label>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="e.g. Workload that week — please pick another date"
              style={{ width: '100%', minHeight: 80, padding: 10, border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, background: 'var(--bg-1)', color: 'var(--ink)', resize: 'vertical', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box', marginBottom: 12 }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setRejectId(null); setRejectReason(''); }} disabled={busy} style={{ padding: '8px 16px', fontSize: 12, fontWeight: 600, border: '1px solid var(--line)', borderRadius: 6, background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={reject} disabled={busy} style={{ padding: '8px 16px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 6, background: '#EF4444', color: '#fff', cursor: busy ? 'wait' : 'pointer' }}>
                {busy ? 'Rejecting…' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
