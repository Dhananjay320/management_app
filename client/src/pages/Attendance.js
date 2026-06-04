import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAlert } from '../components/AlertModal';
import AttendanceCalendar from '../components/AttendanceCalendar';
import SelfieCapture from '../components/SelfieCapture';
import BreakTracker from '../components/BreakTracker';
import TeamAttendanceView from '../components/TeamAttendanceView';
import TeamProductivityView from '../components/TeamProductivityView';
import api from '../services/api';
import '../styles/attendance.css';

export default function Attendance() {
  const { user } = useAuth();
  const dialog = useAlert();
  const [tab, setTab] = useState('mark'); // mark, history, leave, approvals
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

  const [selfieOpen, setSelfieOpen] = useState(false);
  const [pendingCoords, setPendingCoords] = useState(null);

  const markEntry = async () => {
    // If user has opted into selfie verification, capture the photo first,
    // then the camera modal calls back into `submitEntry` with the blob.
    if (user?.settings?.requireSelfieAtEntry) {
      setLoading(true);
      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true, timeout: 10000, maximumAge: 0
          });
        });
        setPendingCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {
        setPendingCoords(null);
      } finally {
        setLoading(false);
      }
      setSelfieOpen(true);
      return;
    }
    return submitEntry(null);
  };

  const submitEntry = async (selfieBlob) => {
    setLoading(true);
    setResult(null);
    try {
      let coordinates = pendingCoords;
      if (!coordinates) {
        try {
          const pos = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true, timeout: 10000, maximumAge: 0
            });
          });
          coordinates = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        } catch {}
      }

      const { data } = await api.post('/attendance/mark-entry', { coordinates });
      // Best-effort selfie upload after entry is created
      if (selfieBlob) {
        const fd = new FormData();
        fd.append('selfie', selfieBlob, 'selfie.jpg');
        try { await api.post('/attendance/entry-selfie', fd); } catch {}
      }
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
      setPendingCoords(null);
    }
  };

  const wrapUp = async () => {
    // Min-hours nudge: if user has worked less than 8 hours, show a clearer
    // confirm prompt with the actual gap. Pure UX nudge — backend still allows
    // wrap-up at any time.
    const MIN_HOURS = 8;
    const entryMs = todayAtt?.entryTime ? new Date(todayAtt.entryTime).getTime() : null;
    const workedMs = entryMs ? Date.now() - entryMs : 0;
    const workedH = workedMs / 3_600_000;

    let ok;
    if (entryMs && workedH < MIN_HOURS) {
      const hWhole = Math.floor(workedH);
      const mPart = Math.round((workedH - hWhole) * 60);
      const shortBy = MIN_HOURS - workedH;
      const sh = Math.floor(shortBy);
      const sm = Math.round((shortBy - sh) * 60);
      ok = await dialog.confirm(
        `You've worked ${hWhole}h ${mPart}m today — ${sh}h ${sm}m short of the ${MIN_HOURS}h minimum.\n\n` +
        `If you wrap up now, today will be logged as a partial day. ` +
        `You can always wrap up later when you're done.\n\n` +
        `Wrap up anyway?`,
        'Wrap up early?'
      );
    } else {
      ok = await dialog.confirm(
        'Once you wrap up, your day is closed and the entry time gets locked. You will not be able to undo this.\n\nAre you sure?',
        'Wrap up your day?'
      );
    }
    if (!ok) return;

    setLoading(true);
    try {
      const { data } = await api.post('/attendance/wrap-up');
      setTodayAtt(data);
      loadData();
    } catch (err) {
      dialog.alert(err.response?.data?.error || 'Failed to wrap up.', 'Error');
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
          <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--ink)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 4 }}>{result.time}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 20 }}>{dateDisplay}</div>
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
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }}>Cannot Mark Entry</h2>
          <p style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.7, marginBottom: 24 }}>{result.message}</p>
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
      <SelfieCapture
        open={selfieOpen}
        onCancel={() => { setSelfieOpen(false); setPendingCoords(null); }}
        onCapture={(blob) => { setSelfieOpen(false); submitEntry(blob); }}
      />
      <div className="page-header">
        <div className="page-title">Attendance</div>
        <div className="chip-group">
          {[['mark','Mark Entry'],['history','History'],['leave','Request Leave'],
            ...((user.powers?.attendance?.viewTeam || user.role === 'main_admin') ? [['team','Team']] : []),
            ...((user.powers?.attendance?.viewTeam || user.role === 'main_admin') ? [['productivity','Productivity']] : []),
            ...(user.powers?.attendance?.editRecords ? [['approvals','Pending Approvals']] : [])
          ].map(([k,l]) => (
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
              <WrapUpButton user={user} loading={loading} onWrapUp={wrapUp} time={time} />
            ) : (
              <button className="att-mark-btn done" disabled>
                <div className="att-mark-btn-icon">✅</div>
                <div className="att-mark-btn-text">Done</div>
              </button>
            )}

            <div className="att-status">
              {todayAtt?.entryTime && <div><span className="check">✓</span> Entry at {new Date(todayAtt.entryTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} ({todayAtt.verificationMethod})</div>}
              {todayAtt?.entrySelfie && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <img src={todayAtt.entrySelfie} alt="Entry selfie"
                    style={{ width: 36, height: 36, borderRadius: 18, objectFit: 'cover', border: '1px solid var(--line-2)' }} />
                  <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>📸 Selfie verified at entry</span>
                </div>
              )}
              {todayAtt?.wrapUpTime && <div><span className="check">✓</span> Wrapped up at {new Date(todayAtt.wrapUpTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} ({todayAtt.totalHours}h)</div>}
              {!todayAtt?.entryTime && user.workType === 'full_remote' && <div>You're remote — no location check needed</div>}
            </div>
            <BreakTracker todayAtt={todayAtt} onChange={loadData} />
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
        <>
          <AttendanceCalendar history={history} />
          <div className="table-container">
          <div className="att-history-row" style={{ background: 'var(--glass)', borderBottom: '1px solid var(--line)', fontSize: 10, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase' }}>
            <div>Date</div><div>Entry</div><div>Wrap Up</div><div>Hours</div><div>Status</div>
          </div>
          {history.map(r => {
            const statusColors = { present: '#10B981', absent: '#EF4444', leave: '#EF4444', half_day: '#F97316', holiday: '#8B5CF6', not_marked: 'var(--ink-3)' };
            const statusLabels = { present: 'Present', absent: 'Absent', leave: 'Leave', half_day: 'Half Day', holiday: 'Holiday', not_marked: 'Not Marked' };
            return (
              <div key={r.date} className="att-history-row" style={{ borderBottom: '1px solid var(--line)' }}>
                <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                  {new Date(r.date + 'T00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
                </div>
                <div style={{ color: 'var(--ink-2)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
                  {r.entryTime ? new Date(r.entryTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}
                </div>
                <div style={{ color: 'var(--ink-2)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
                  {r.wrapUpTime ? new Date(r.wrapUpTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}
                </div>
                <div style={{ color: 'var(--ink-2)' }}>{r.totalHours ? `${r.totalHours}h` : '—'}</div>
                <div>
                  <span className="badge-pill" style={{ background: (statusColors[r.status] || 'var(--ink-3)') + '14', color: statusColors[r.status] || 'var(--ink-3)' }}>
                    {statusLabels[r.status] || r.status}
                  </span>
                </div>
              </div>
            );
          })}
          {history.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)' }}>No records this month.</div>}
          </div>
        </>
      )}

      {tab === 'leave' && <LeaveRequestForm onSuccess={loadData} />}

      {tab === 'team' && <TeamAttendanceView />}

      {tab === 'productivity' && <TeamProductivityView />}

      {tab === 'approvals' && <LeaveApprovals />}
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
      window.alert(err.response?.data?.error || 'Failed to submit.');
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
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', display: 'block', marginBottom: 6 }}>Leave Type</label>
            <div className="chip-group">
              {[['casual','Casual'],['sick','Sick'],['personal','Personal'],['half_day','Half Day']].map(([k,l]) => (
                <div key={k} className={`chip ${type === k ? 'active' : ''}`} onClick={() => setType(k)}>{l}</div>
              ))}
            </div>
          </div>
          {type === 'half_day' && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', display: 'block', marginBottom: 6 }}>Which Half?</label>
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
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>My Leave Requests</div>
          <div className="table-container">
            {leaves.map(l => {
              const sc = { pending: '#F59E0B', approved: '#10B981', rejected: '#EF4444' };
              return (
                <div key={l._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--line)' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{l.type.replace('_', ' ')} — {l.startDate}</div>
                    <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>{l.reason}</div>
                  </div>
                  <span className="badge-pill" style={{ background: (sc[l.status] || 'var(--ink-3)') + '14', color: sc[l.status] }}>{l.status}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function LeaveApprovals() {
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    loadPending();
  }, []);

  const loadPending = async () => {
    try {
      const { data } = await api.get('/attendance/leaves/pending');
      setPendingLeaves(data);
    } catch {} finally { setLoading(false); }
  };

  const handleAction = async (leaveId, action) => {
    setActionLoading(leaveId + action);
    try {
      await api.put(`/attendance/leave/${leaveId}/${action}`);
      setPendingLeaves(prev => prev.filter(l => l._id !== leaveId));
    } catch (err) {
      window.alert(err.response?.data?.error || `Failed to ${action} leave.`);
    } finally { setActionLoading(null); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-3)' }}>Loading pending approvals...</div>;

  if (pendingLeaves.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>No pending approvals</div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>All leave requests have been processed</div>
      </div>
    );
  }

  return (
    <div className="table-container">
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
        Pending Leave Requests ({pendingLeaves.length})
      </div>
      {pendingLeaves.map(l => (
        <div key={l._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
              {l.user?.name || 'Unknown'} — {(l.type || '').replace('_', ' ')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>
              {l.startDate}{l.endDate && l.endDate !== l.startDate ? ` to ${l.endDate}` : ''}
            </div>
            {l.reason && <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>{l.reason}</div>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="btn btn-primary-sm"
              style={{ padding: '5px 12px', fontSize: 10, background: '#10B981', border: 'none' }}
              disabled={actionLoading === l._id + 'approve'}
              onClick={() => handleAction(l._id, 'approve')}
            >
              {actionLoading === l._id + 'approve' ? '...' : 'Approve'}
            </button>
            <button
              className="btn btn-secondary"
              style={{ padding: '5px 12px', fontSize: 10, color: '#EF4444', borderColor: '#EF4444' }}
              disabled={actionLoading === l._id + 'reject'}
              onClick={() => handleAction(l._id, 'reject')}
            >
              {actionLoading === l._id + 'reject' ? '...' : 'Reject'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function WrapUpButton({ loading, onWrapUp }) {
  return (
    <button className="att-mark-btn wrapup" onClick={onWrapUp} disabled={loading}>
      <div className="att-mark-btn-icon">🌙</div>
      <div className="att-mark-btn-text">{loading ? 'Wrapping...' : 'Wrap\nUp'}</div>
    </button>
  );
}
