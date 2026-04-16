import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import '../styles/attendance.css';

export default function Attendance() {
  const { user } = useAuth();
  const [tab, setTab] = useState('mark'); // mark, history, leave
  const [todayAtt, setTodayAtt] = useState(null);
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { type: 'success'|'blocked', message }
  const [time, setTime] = useState(new Date());

  const loadData = useCallback(async () => {
    try {
      const [attRes, statsRes, histRes] = await Promise.all([
        api.get('/attendance/today'),
        api.get('/attendance/stats'),
        api.get('/attendance/history')
      ]);
      setTodayAtt(attRes.data);
      setStats(statsRes.data);
      setHistory(histRes.data);
    } catch {}
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const markEntry = async () => {
    setLoading(true);
    setResult(null);
    try {
      // Try to get GPS location
      let coordinates = null;
      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true, timeout: 10000, maximumAge: 0
          });
        });
        coordinates = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      } catch {}

      const { data } = await api.post('/attendance/mark-entry', { coordinates });
      setTodayAtt(data);
      setResult({
        type: 'success',
        time: new Date(data.entryTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      });
      loadData();
    } catch (err) {
      if (err.response?.data?.blocked) {
        setResult({ type: 'blocked', message: err.response.data.error });
      } else {
        setResult({ type: 'error', message: err.response?.data?.error || 'Failed to mark entry.' });
      }
    } finally {
      setLoading(false);
    }
  };

  const wrapUp = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/attendance/wrap-up');
      setTodayAtt(data);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to wrap up.');
    } finally {
      setLoading(false);
    }
  };

  const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const dateDisplay = time.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const workTypeLabel = { full_office: 'Full Office', full_remote: 'Full Remote', hybrid: 'Hybrid' }[user.workType] || 'Office';

  // Result screens
  if (result?.type === 'success') {
    return (
      <div className="att-result">
        <div className="card" style={{ padding: 36 }}>
          <div className="att-result-icon success">✅</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#10B981', marginBottom: 4 }}>Entry Marked!</h2>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#1E293B', fontFamily: "'JetBrains Mono', monospace", marginBottom: 4 }}>{result.time}</div>
          <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 20 }}>{dateDisplay}</div>
          <button className="btn btn-primary-sm" onClick={() => setResult(null)}>Go to Attendance →</button>
        </div>
      </div>
    );
  }
  if (result?.type === 'blocked') {
    return (
      <div className="att-result">
        <div className="card" style={{ padding: 36 }}>
          <div className="att-result-icon blocked">🚫</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#1E293B', marginBottom: 8 }}>Cannot Mark Entry</h2>
          <p style={{ fontSize: 12, color: '#64748B', lineHeight: 1.7, marginBottom: 24 }}>{result.message}</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn btn-secondary" onClick={() => setResult(null)}>Go Back</button>
            <button className="btn btn-primary-sm" onClick={markEntry}>Try Again</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Attendance</div>
        <div className="chip-group">
          {[['mark','Mark Entry'],['history','History'],['leave','Request Leave']].map(([k,l]) => (
            <div key={k} className={`chip ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</div>
          ))}
        </div>
      </div>

      {tab === 'mark' && (
        <div className="att-center">
          <div className="att-clock-card">
            <div className="att-time">{timeStr}</div>
            <div className="att-date">{dateDisplay}</div>
            <div className="att-badges">
              <span className="badge-pill" style={{ background: 'rgba(99,102,241,0.08)', color: '#6366F1' }}>{workTypeLabel}</span>
              {user.office && <span className="badge-pill" style={{ background: 'rgba(16,185,129,0.08)', color: '#10B981' }}>Hyderabad HQ</span>}
            </div>

            {!todayAtt?.entryTime ? (
              <button className="att-mark-btn entry" onClick={markEntry} disabled={loading}>
                <div className="att-mark-btn-icon">👆</div>
                <div className="att-mark-btn-text">{loading ? 'Checking...' : 'Mark\nEntry'}</div>
              </button>
            ) : !todayAtt?.wrapUpTime ? (
              <button className="att-mark-btn wrapup" onClick={wrapUp} disabled={loading}>
                <div className="att-mark-btn-icon">🌙</div>
                <div className="att-mark-btn-text">{loading ? 'Wrapping...' : 'Wrap\nUp'}</div>
              </button>
            ) : (
              <button className="att-mark-btn done" disabled>
                <div className="att-mark-btn-icon">✅</div>
                <div className="att-mark-btn-text">Done</div>
              </button>
            )}

            <div className="att-status">
              {todayAtt?.entryTime && <div><span className="check">✓</span> Entry at {new Date(todayAtt.entryTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} ({todayAtt.verificationMethod})</div>}
              {todayAtt?.wrapUpTime && <div><span className="check">✓</span> Wrapped up at {new Date(todayAtt.wrapUpTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} ({todayAtt.totalHours}h)</div>}
              {!todayAtt?.entryTime && user.workType === 'full_remote' && <div>You're remote — no location check needed</div>}
            </div>
          </div>

          {stats && (
            <div className="att-stats">
              <div className="stat-card" style={{ flex: 1 }}>
                <div className="stat-card-label">This Week</div>
                <div className="stat-card-value" style={{ color: '#10B981' }}>{stats.week.present}/{stats.week.total}</div>
              </div>
              <div className="stat-card" style={{ flex: 1 }}>
                <div className="stat-card-label">This Month</div>
                <div className="stat-card-value" style={{ color: '#6366F1' }}>{stats.month.present}/{stats.month.total}</div>
              </div>
              {stats.pendingLeaves > 0 && (
                <div className="stat-card" style={{ flex: 1 }}>
                  <div className="stat-card-label">Pending Leaves</div>
                  <div className="stat-card-value" style={{ color: '#F59E0B' }}>{stats.pendingLeaves}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="table-container">
          <div className="att-history-row" style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>
            <div>Date</div><div>Entry</div><div>Wrap Up</div><div>Hours</div><div>Status</div>
          </div>
          {history.map(r => {
            const statusColors = { present: '#10B981', absent: '#EF4444', leave: '#EF4444', half_day: '#F97316', holiday: '#8B5CF6', not_marked: '#94A3B8' };
            const statusLabels = { present: 'Present', absent: 'Absent', leave: 'Leave', half_day: 'Half Day', holiday: 'Holiday', not_marked: 'Not Marked' };
            return (
              <div key={r.date} className="att-history-row" style={{ borderBottom: '1px solid #F0F2F7' }}>
                <div style={{ fontWeight: 600, color: '#1E293B' }}>
                  {new Date(r.date + 'T00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
                </div>
                <div style={{ color: '#475569', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
                  {r.entryTime ? new Date(r.entryTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}
                </div>
                <div style={{ color: '#475569', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
                  {r.wrapUpTime ? new Date(r.wrapUpTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}
                </div>
                <div style={{ color: '#475569' }}>{r.totalHours ? `${r.totalHours}h` : '—'}</div>
                <div>
                  <span className="badge-pill" style={{ background: (statusColors[r.status] || '#94A3B8') + '14', color: statusColors[r.status] || '#94A3B8' }}>
                    {statusLabels[r.status] || r.status}
                  </span>
                </div>
              </div>
            );
          })}
          {history.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: '#94A3B8' }}>No records this month.</div>}
        </div>
      )}

      {tab === 'leave' && <LeaveRequestForm onSuccess={loadData} />}
    </div>
  );
}

function LeaveRequestForm({ onSuccess }) {
  const [type, setType] = useState('casual');
  const [halfDayType, setHalfDayType] = useState('morning');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [leaves, setLeaves] = useState([]);

  useEffect(() => {
    api.get('/attendance/leaves').then(res => setLeaves(res.data)).catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/attendance/leave', { type, halfDayType: type === 'half_day' ? halfDayType : undefined, startDate, endDate: endDate || startDate, reason });
      setStartDate(''); setEndDate(''); setReason('');
      onSuccess();
      const res = await api.get('/attendance/leaves');
      setLeaves(res.data);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to submit.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="form-card" style={{ maxWidth: '100%', marginBottom: 20 }}>
        <div className="form-section-title">📋 Request Leave</div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Leave Type</label>
            <div className="chip-group">
              {[['casual','Casual'],['sick','Sick'],['personal','Personal'],['half_day','Half Day']].map(([k,l]) => (
                <div key={k} className={`chip ${type === k ? 'active' : ''}`} onClick={() => setType(k)}>{l}</div>
              ))}
            </div>
          </div>
          {type === 'half_day' && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Which Half?</label>
              <div className="chip-group">
                <div className={`chip ${halfDayType === 'morning' ? 'active' : ''}`} onClick={() => setHalfDayType('morning')}>Morning Off</div>
                <div className={`chip ${halfDayType === 'afternoon' ? 'active' : ''}`} onClick={() => setHalfDayType('afternoon')}>Afternoon Off</div>
              </div>
            </div>
          )}
          <div className="form-grid">
            <div className="form-field">
              <label>Start Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
            </div>
            <div className="form-field">
              <label>End Date</label>
              <input type="date" value={endDate || startDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="form-field" style={{ marginBottom: 16 }}>
            <label>Reason</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for leave..." rows={3} required />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary-sm" disabled={loading}>
              {loading ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>

      {leaves.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 10 }}>My Leave Requests</div>
          <div className="table-container">
            {leaves.map(l => {
              const sc = { pending: '#F59E0B', approved: '#10B981', rejected: '#EF4444' };
              return (
                <div key={l._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #F0F2F7' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#1E293B' }}>{l.type.replace('_', ' ')} — {l.startDate}</div>
                    <div style={{ fontSize: 10, color: '#94A3B8' }}>{l.reason}</div>
                  </div>
                  <span className="badge-pill" style={{ background: (sc[l.status] || '#94A3B8') + '14', color: sc[l.status] }}>{l.status}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
