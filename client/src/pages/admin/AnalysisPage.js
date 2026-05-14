import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import '../../styles/calendar.css';

const TABS = [
  { key: 'individual', label: 'Individual' },
  { key: 'calendar', label: 'Calendar View' },
  { key: 'team', label: 'Team' },
  { key: 'company', label: 'Company' },
];

const PERIODS = [
  { key: 'day', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'year', label: 'This Year' },
];

const tabStyle = (active) => ({
  padding: '8px 18px',
  fontSize: 12,
  fontWeight: active ? 700 : 500,
  color: active ? '#6366F1' : 'var(--ink-2)',
  background: active ? 'rgba(99,102,241,0.08)' : 'transparent',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  transition: 'all 0.15s',
  fontFamily: 'Inter, sans-serif',
});

const periodStyle = (active) => ({
  padding: '5px 12px',
  fontSize: 11,
  fontWeight: active ? 600 : 400,
  color: active ? '#fff' : 'var(--ink-2)',
  background: active ? '#6366F1' : 'transparent',
  border: active ? 'none' : '1px solid #E2E8F0',
  borderRadius: 6,
  cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
});

function StatCard({ label, value, subtitle, color, total }) {
  const pct = total ? Math.round((value / total) * 100) : null;
  return (
    <div className="card" style={{ padding: 20, flex: 1, minWidth: 160 }}>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 8, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: color || 'var(--ink)', lineHeight: 1 }}>{value}</div>
      {subtitle && <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>{subtitle}</div>}
      {pct !== null && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>{pct}%</span>
            <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>{value}/{total}</span>
          </div>
          <div style={{ height: 6, background: '#F1F5F9', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: color || '#6366F1', borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function AnalysisPage() {
  const [tab, setTab] = useState('individual');
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Individual tab
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [individualStats, setIndividualStats] = useState(null);
  const [individualAttendance, setIndividualAttendance] = useState([]);
  const [individualLeaves, setIndividualLeaves] = useState([]);
  const [individualTasks, setIndividualTasks] = useState([]);
  const [editingAttendance, setEditingAttendance] = useState(null); // { userId, date, entryTime, wrapUpTime, status }
  const [attSaving, setAttSaving] = useState(false);

  const saveAttendanceEdit = async () => {
    if (!editingAttendance) return;
    setAttSaving(true);
    try {
      const { userId, date, entryTime, wrapUpTime, status } = editingAttendance;
      await api.put('/attendance/edit-timing', {
        userId, date,
        entryTime: entryTime ? `${date}T${entryTime}:00` : undefined,
        wrapUpTime: wrapUpTime ? `${date}T${wrapUpTime}:00` : undefined,
        status
      });
      setEditingAttendance(null);
      // Reload
      if (selectedUser) {
        const r = getDateRange();
        const res = await api.get('/attendance/history', { params: { userId: selectedUser, month: r.month } });
        setIndividualAttendance(res.data);
      }
    } catch (err) {
      window.alert(err.response?.data?.error || 'Failed to update attendance.');
    }
    setAttSaving(false);
  };

  // Team tab
  const [teamData, setTeamData] = useState(null);

  // Company tab
  const [companyStats, setCompanyStats] = useState(null);

  // Load user directory for individual tab picker
  useEffect(() => {
    api.get('/users').then(res => setUsers(res.data)).catch(() => {});
  }, []);

  const getDateRange = useCallback(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    if (period === 'day') return { date: `${y}-${m}-${String(now.getDate()).padStart(2, '0')}` };
    if (period === 'week') return { month: `${y}-${m}` }; // We'll filter client-side
    if (period === 'month') return { month: `${y}-${m}` };
    if (period === 'year') return { year: String(y) };
    return { month: `${y}-${m}` };
  }, [period]);

  // Load individual stats
  const loadIndividual = useCallback(async () => {
    if (!selectedUser) return;
    setLoading(true);
    setError('');
    try {
      const range = getDateRange();

      const [statsRes, histRes, leavesRes, tasksRes] = await Promise.all([
        api.get('/attendance/stats', { params: { userId: selectedUser } }).catch(() => ({ data: { week: { present: 0, total: 0 }, month: { present: 0, total: 0 }, pendingLeaves: 0 } })),
        api.get('/attendance/history', { params: { userId: selectedUser, month: range.month } }).catch(() => ({ data: [] })),
        api.get('/attendance/leaves', { params: { userId: selectedUser } }).catch(() => ({ data: [] })),
        api.get('/tasks', { params: { assignee: selectedUser } }).catch(() => ({ data: { tasks: [], total: 0 } })),
      ]);

      setIndividualStats(statsRes.data);
      setIndividualAttendance(histRes.data);
      setIndividualLeaves(leavesRes.data);
      setIndividualTasks(Array.isArray(tasksRes.data) ? tasksRes.data : (tasksRes.data.tasks || []));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load individual stats.');
    } finally {
      setLoading(false);
    }
  }, [selectedUser, getDateRange]);

  // Load team stats
  const loadTeam = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const range = getDateRange();
      const { data } = await api.get('/attendance/team', { params: { date: range.date } });
      setTeamData(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load team stats. You may lack permission.');
    } finally {
      setLoading(false);
    }
  }, [getDateRange]);

  // Load company stats
  const loadCompany = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [teamRes, usersRes] = await Promise.all([
        api.get('/attendance/team', { params: { date: getDateRange().date } }).catch(() => ({ data: { marked: [], unmarked: [] } })),
        api.get('/users').catch(() => ({ data: [] })),
      ]);

      const totalEmployees = usersRes.data.length;
      const presentToday = teamRes.data.marked?.length || 0;
      const absentToday = teamRes.data.unmarked?.length || 0;

      // Calculate task stats from all users' tasks
      let allTasks = [];
      try {
        const tasksRes = await api.get('/tasks');
        allTasks = Array.isArray(tasksRes.data) ? tasksRes.data : (tasksRes.data.tasks || []);
      } catch { /* ignore */ }

      const completedTasks = allTasks.filter(t => t.status === 'done').length;
      const inProgressTasks = allTasks.filter(t => t.status === 'in_progress').length;
      const totalTasks = allTasks.length;

      setCompanyStats({
        totalEmployees,
        presentToday,
        absentToday,
        totalTasks,
        completedTasks,
        inProgressTasks,
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load company stats.');
    } finally {
      setLoading(false);
    }
  }, [getDateRange]);

  useEffect(() => {
    if (tab === 'individual' && selectedUser) loadIndividual();
    else if (tab === 'team') loadTeam();
    else if (tab === 'company') loadCompany();
  }, [tab, period, selectedUser, loadIndividual, loadTeam, loadCompany]);

  const renderIndividual = () => {
    return (
      <div>
        {/* User picker */}
        <div style={{ marginBottom: 16 }}>
          <div className="form-field" style={{ maxWidth: 340 }}>
            <label>Select Employee</label>
            <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)}>
              <option value="">Choose an employee...</option>
              {users.map(u => <option key={u._id} value={u._id}>{u.name} — {u.email}</option>)}
            </select>
          </div>
        </div>

        {!selectedUser && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
            Select an employee above to view their stats.
          </div>
        )}

        {selectedUser && individualStats && (
          <>
            {/* Attendance stats */}
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 10 }}>Attendance</div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <StatCard
                label="This Week"
                value={individualStats.week?.present || 0}
                total={individualStats.week?.total || 5}
                color="#10B981"
                subtitle="days present"
              />
              <StatCard
                label="This Month"
                value={individualStats.month?.present || 0}
                total={individualStats.month?.total || 22}
                color="#6366F1"
                subtitle="days present"
              />
              <StatCard
                label="Pending Leaves"
                value={individualStats.pendingLeaves || 0}
                color="#F59E0B"
                subtitle="awaiting approval"
              />
            </div>

            {/* Task stats */}
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 10 }}>Tasks</div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <StatCard
                label="Total Tasks"
                value={individualTasks.length}
                color="#475569"
              />
              <StatCard
                label="Completed"
                value={individualTasks.filter(t => t.status === 'done').length}
                total={individualTasks.length || 1}
                color="#10B981"
                subtitle="tasks done"
              />
              <StatCard
                label="In Progress"
                value={individualTasks.filter(t => t.status === 'in_progress').length}
                color="#6366F1"
              />
              <StatCard
                label="Overdue"
                value={individualTasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'done').length}
                color="#EF4444"
              />
            </div>

            {/* Leave history */}
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 10 }}>Leave History</div>
            {individualLeaves.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink-3)', fontSize: 12 }}>No leave records.</div>
            ) : (
              <div className="table-container">
                <div className="table-header" style={{ gridTemplateColumns: '100px 100px 100px 1fr 80px' }}>
                  <div>Type</div>
                  <div>From</div>
                  <div>To</div>
                  <div>Reason</div>
                  <div>Status</div>
                </div>
                {individualLeaves.slice(0, 10).map(l => (
                  <div key={l._id} className="table-row" style={{ gridTemplateColumns: '100px 100px 100px 1fr 80px' }}>
                    <div>
                      <span className="badge-pill" style={{
                        background: l.type === 'half_day' ? 'rgba(245,158,11,0.08)' : 'rgba(99,102,241,0.08)',
                        color: l.type === 'half_day' ? '#F59E0B' : '#6366F1',
                      }}>{l.type === 'half_day' ? 'Half Day' : 'Full Day'}</span>
                    </div>
                    <div style={{ color: 'var(--ink-2)', fontSize: 11 }}>{l.startDate}</div>
                    <div style={{ color: 'var(--ink-2)', fontSize: 11 }}>{l.endDate}</div>
                    <div style={{ color: 'var(--ink-2)', fontSize: 11 }}>{l.reason}</div>
                    <div>
                      <span className="badge-pill" style={{
                        background: l.status === 'approved' ? 'rgba(16,185,129,0.08)' : l.status === 'rejected' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
                        color: l.status === 'approved' ? '#10B981' : l.status === 'rejected' ? '#EF4444' : '#F59E0B',
                      }}>{l.status?.charAt(0).toUpperCase() + l.status?.slice(1)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Attendance records — with edit */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Attendance Records</div>
              <button onClick={() => setEditingAttendance({ userId: selectedUser, date: new Date().toISOString().split('T')[0], entryTime: '', wrapUpTime: '', status: 'present' })}
                style={{ padding: '3px 10px', fontSize: 9, border: '1px solid #6366F1', borderRadius: 4, background: 'rgba(99,102,241,0.06)', color: '#6366F1', cursor: 'pointer', fontFamily: 'Inter' }}>
                + Add / Edit Date
              </button>
            </div>
            {individualAttendance.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink-3)', fontSize: 12 }}>No attendance records for this period.</div>
            ) : (
              <div className="table-container">
                <div className="table-header" style={{ gridTemplateColumns: '100px 100px 100px 80px 80px 50px' }}>
                  <div>Date</div>
                  <div>Entry</div>
                  <div>Wrap Up</div>
                  <div>Hours</div>
                  <div>Status</div>
                  <div>Edit</div>
                </div>
                {individualAttendance.slice(0, 31).map(r => (
                  <div key={r._id || r.date} className="table-row" style={{ gridTemplateColumns: '100px 100px 100px 80px 80px 50px' }}>
                    <div style={{ color: 'var(--ink)', fontWeight: 500, fontSize: 11 }}>{r.date}</div>
                    <div style={{ color: 'var(--ink-2)', fontSize: 11 }}>{r.entryTime ? new Date(r.entryTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</div>
                    <div style={{ color: 'var(--ink-2)', fontSize: 11 }}>{r.wrapUpTime ? new Date(r.wrapUpTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</div>
                    <div style={{ color: 'var(--ink-2)', fontSize: 11 }}>{r.totalHours ? `${r.totalHours}h` : '—'}</div>
                    <div>
                      <span className="badge-pill" style={{
                        background: r.status === 'present' ? 'rgba(16,185,129,0.08)' : r.status === 'leave' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
                        color: r.status === 'present' ? '#10B981' : r.status === 'leave' ? '#EF4444' : '#F59E0B',
                      }}>{r.status?.charAt(0).toUpperCase() + r.status?.slice(1).replace('_', ' ')}</span>
                    </div>
                    <div>
                      <button onClick={() => setEditingAttendance({
                        userId: selectedUser, date: r.date,
                        entryTime: r.entryTime ? new Date(r.entryTime).toTimeString().slice(0, 5) : '',
                        wrapUpTime: r.wrapUpTime ? new Date(r.wrapUpTime).toTimeString().slice(0, 5) : '',
                        status: r.status || 'present'
                      })} style={{ fontSize: 10, color: '#6366F1', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter' }}>Edit</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderTeam = () => {
    if (!teamData) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>Loading team data...</div>;

    const marked = teamData.marked || [];
    const unmarked = teamData.unmarked || [];
    const total = marked.length + unmarked.length;

    return (
      <div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <StatCard label="Present Today" value={marked.length} total={total} color="#10B981" subtitle={`of ${total} employees`} />
          <StatCard label="Not Marked" value={unmarked.length} total={total} color="#EF4444" subtitle={`of ${total} employees`} />
          <StatCard label="Attendance Rate" value={total > 0 ? `${Math.round((marked.length / total) * 100)}%` : '0%'} color="#6366F1" />
        </div>

        {/* Present */}
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 10 }}>Present ({marked.length})</div>
        {marked.length > 0 ? (
          <div className="table-container" style={{ marginBottom: 20 }}>
            <div className="table-header" style={{ gridTemplateColumns: '1fr 1fr 120px' }}>
              <div>Name</div>
              <div>Job Title</div>
              <div>Entry Time</div>
            </div>
            {marked.map(r => (
              <div key={r._id} className="table-row" style={{ gridTemplateColumns: '1fr 1fr 120px' }}>
                <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{r.user?.name || 'Unknown'}</div>
                <div style={{ color: 'var(--ink-2)', fontSize: 11 }}>{r.user?.jobTitle || '—'}</div>
                <div style={{ color: 'var(--ink-2)', fontSize: 11 }}>
                  {r.entryTime ? new Date(r.entryTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--ink-3)', fontSize: 12, marginBottom: 20 }}>No entries marked yet.</div>
        )}

        {/* Not marked */}
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 10 }}>Not Marked ({unmarked.length})</div>
        {unmarked.length > 0 ? (
          <div className="table-container">
            <div className="table-header" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div>Name</div>
              <div>Email</div>
            </div>
            {unmarked.map(u => (
              <div key={u._id} className="table-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{u.name}</div>
                <div style={{ color: 'var(--ink-2)' }}>{u.email}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--ink-3)', fontSize: 12 }}>Everyone has marked entry.</div>
        )}
      </div>
    );
  };

  const renderCompany = () => {
    if (!companyStats) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>Loading company stats...</div>;

    return (
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 10 }}>Workforce Overview</div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <StatCard label="Total Employees" value={companyStats.totalEmployees} color="#6366F1" />
          <StatCard label="Present Today" value={companyStats.presentToday} total={companyStats.totalEmployees} color="#10B981" subtitle={`of ${companyStats.totalEmployees}`} />
          <StatCard label="Absent Today" value={companyStats.absentToday} total={companyStats.totalEmployees} color="#EF4444" subtitle={`of ${companyStats.totalEmployees}`} />
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 10 }}>Task Overview</div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <StatCard label="Total Tasks" value={companyStats.totalTasks} color="#475569" />
          <StatCard label="Completed" value={companyStats.completedTasks} total={companyStats.totalTasks || 1} color="#10B981" subtitle="completion rate" />
          <StatCard label="In Progress" value={companyStats.inProgressTasks} total={companyStats.totalTasks || 1} color="#6366F1" />
        </div>

        {/* Attendance rate visual */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 12 }}>Today's Attendance Rate</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: `conic-gradient(#10B981 ${(companyStats.presentToday / (companyStats.totalEmployees || 1)) * 360}deg, #F1F5F9 0deg)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: 60, height: 60, borderRadius: '50%', background: 'var(--glass)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 800, color: '#10B981',
              }}>
                {companyStats.totalEmployees > 0 ? Math.round((companyStats.presentToday / companyStats.totalEmployees) * 100) : 0}%
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{companyStats.presentToday} of {companyStats.totalEmployees} employees present</div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>{companyStats.absentToday} not yet marked</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Analysis</div>
          <div className="page-subtitle">Attendance, tasks, and performance insights</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, background: 'var(--glass)', padding: 4, borderRadius: 10, width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t.key} style={tabStyle(tab === t.key)} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Period filter — hide on calendar tab (has its own nav) */}
      {tab !== 'calendar' && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {PERIODS.map(p => (
            <button key={p.key} style={periodStyle(period === p.key)} onClick={() => setPeriod(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && <div className="info-box amber" style={{ marginBottom: 12 }}><span>&#9888;&#65039;</span><div>{error}</div></div>}

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-3)' }}>Loading...</div>
      ) : (
        <>
          {tab === 'individual' && renderIndividual()}
          {tab === 'calendar' && <AdminCalendarView users={users} />}
          {tab === 'team' && renderTeam()}
          {tab === 'company' && renderCompany()}
        </>
      )}

      {/* Attendance Edit Modal */}
      {editingAttendance && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999 }} onClick={() => setEditingAttendance(null)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1000, background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 14, width: 380, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Edit Attendance</div>
              <button style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ink-3)' }} onClick={() => setEditingAttendance(null)}>&times;</button>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Date</label>
                <input type="date" value={editingAttendance.date} onChange={e => setEditingAttendance(p => ({ ...p, date: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, fontFamily: 'Inter', background: 'var(--glass)', color: 'var(--ink)', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Entry Time</label>
                  <input type="time" value={editingAttendance.entryTime} onChange={e => setEditingAttendance(p => ({ ...p, entryTime: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, fontFamily: 'Inter', background: 'var(--glass)', color: 'var(--ink)', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Wrap Up Time</label>
                  <input type="time" value={editingAttendance.wrapUpTime} onChange={e => setEditingAttendance(p => ({ ...p, wrapUpTime: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, fontFamily: 'Inter', background: 'var(--glass)', color: 'var(--ink)', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Status</label>
                <select value={editingAttendance.status} onChange={e => setEditingAttendance(p => ({ ...p, status: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, fontFamily: 'Inter', background: 'var(--glass)', color: 'var(--ink)' }}>
                  <option value="present">Present</option>
                  <option value="absent">Absent</option>
                  <option value="half_day">Half Day</option>
                  <option value="leave">Leave</option>
                  <option value="wfh">Work From Home</option>
                </select>
              </div>
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => setEditingAttendance(null)}>Cancel</button>
              <button className="btn btn-primary-sm" onClick={saveAttendanceEdit} disabled={attSaving}>
                {attSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ═══ Admin Calendar View — mirrors CalendarHome exactly ═══
const ADM_EVENT_COLORS = { leave: '#EF4444', half_day: '#F97316', holiday: '#7C3AED', task: '#3B82F6', activity: '#F59E0B', meeting: '#8B5CF6', announcement: '#EC4899', custom: 'var(--ink-2)' };
const ADM_PRIORITY_COLORS = { top: '#EF4444', high: '#F97316', medium: '#F59E0B', low: '#10B981' };
const ADM_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const ADM_EVENT_PRIORITY_RANK = { leave: 1, half_day: 2, holiday: 3, task: 4, activity: 5, meeting: 4, custom: 6 };

function admDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function admIsToday(d) { return d.toDateString() === new Date().toDateString(); }
function admGetWeekDates(date) {
  const d = new Date(date); const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return Array.from({ length: 7 }, (_, i) => { const dt = new Date(monday); dt.setDate(monday.getDate() + i); return dt; });
}

function AdminCalendarView({ users }) {
  const [selectedUser, setSelectedUser] = useState('');
  const [view, setView] = useState('weekly');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(false);

  const weekDates = admGetWeekDates(currentDate);

  const loadCalendar = useCallback(async () => {
    if (!selectedUser) return;
    setLoading(true);
    try {
      let s, e;
      if (view === 'monthly') {
        const y = currentDate.getFullYear(), m = currentDate.getMonth();
        s = admDateStr(new Date(y, m, 1));
        e = admDateStr(new Date(y, m + 1, 0));
      } else {
        const wd = admGetWeekDates(currentDate);
        s = admDateStr(wd[0]);
        e = admDateStr(wd[6]);
      }
      const { data } = await api.get(`/calendar/user/${selectedUser}`, { params: { start: s, end: e } });
      setEvents(data.events || []);
      setAttendance(data.attendance || []);
      setLeaves(data.leaves || []);
      setUserName(data.userName || '');
    } catch {
      setEvents([]); setAttendance([]); setLeaves([]);
    }
    setLoading(false);
  }, [selectedUser, view, currentDate]);

  useEffect(() => { loadCalendar(); }, [loadCalendar]);

  const getEventsForDate = (d) => events.filter(ev => ev.date === admDateStr(d));

  const prevPeriod = () => {
    const d = new Date(currentDate);
    if (view === 'monthly') d.setMonth(d.getMonth() - 1); else d.setDate(d.getDate() - 7);
    setCurrentDate(d);
  };
  const nextPeriod = () => {
    const d = new Date(currentDate);
    if (view === 'monthly') d.setMonth(d.getMonth() + 1); else d.setDate(d.getDate() + 7);
    setCurrentDate(d);
  };
  const goToday = () => setCurrentDate(new Date());

  const monthLabel = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Today's attendance for this user
  const todayStr = admDateStr(new Date());
  const todayAtt = attendance.find(a => a.date === todayStr);

  return (
    <div>
      {/* User selector */}
      <div style={{ marginBottom: 14 }}>
        <select value={selectedUser} onChange={e => { setSelectedUser(e.target.value); setEvents([]); }}
          style={{ width: '100%', maxWidth: 400, padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12, fontFamily: 'Inter', background: 'var(--glass)', color: 'var(--ink)' }}>
          <option value="">Select employee to view calendar...</option>
          {users.map(u => <option key={u._id} value={u._id}>{u.name} — {u.jobTitle || u.email}</option>)}
        </select>
      </div>

      {!selectedUser && <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-3)', fontSize: 13 }}>Select an employee above</div>}

      {selectedUser && (
        <>
          {/* Header — same as CalendarHome */}
          <div className="page-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div>
                <div className="page-title">{userName}'s Calendar</div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{monthLabel}</div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 14 }} onClick={prevPeriod}>←</button>
                <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 10 }} onClick={goToday}>Today</button>
                <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 14 }} onClick={nextPeriod}>→</button>
              </div>
            </div>
            <div className="chip-group">
              {['weekly','monthly'].map(v => (
                <div key={v} className={`chip ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </div>
              ))}
            </div>
          </div>

          {/* Attendance bar — same as CalendarHome */}
          <div className="cal-attendance-bar">
            <div className={`cal-att-item ${todayAtt?.entryTime ? 'done' : 'pending'}`}>
              {todayAtt?.entryTime ? '✓' : '○'} Entry: {todayAtt?.entryTime ? new Date(todayAtt.entryTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'Not marked'}
            </div>
            <div className={`cal-att-item ${todayAtt?.wrapUpTime ? 'done' : 'pending'}`}>
              {todayAtt?.wrapUpTime ? '✓' : '○'} Wrap Up: {todayAtt?.wrapUpTime ? new Date(todayAtt.wrapUpTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'Pending'}
            </div>
            {todayAtt?.totalHours > 0 && (
              <div className="cal-att-item done">Hours: {todayAtt.totalHours}h</div>
            )}
          </div>

          {/* Leave banners */}
          {leaves.map(l => (
            <div key={l._id} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)', color: '#EF4444', marginBottom: 8 }}>
              On Leave: {l.type} — {new Date(l.startDate).toLocaleDateString()} to {new Date(l.endDate).toLocaleDateString()}
            </div>
          ))}

          {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-3)' }}>Loading...</div>}

          {/* Weekly View — uses exact cal-week-grid CSS from CalendarHome */}
          {!loading && view === 'weekly' && (
            <div className="cal-week-grid">
              {weekDates.map(d => {
                const evts = getEventsForDate(d);
                const today = admIsToday(d);
                return (
                  <div key={admDateStr(d)} className={`cal-day ${today ? 'today' : ''}`}>
                    <div className="cal-day-header">
                      <div className="cal-day-name">{ADM_DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1]}</div>
                      <div className="cal-day-number">{d.getDate()}</div>
                      {today && <div className="cal-today-dot" />}
                    </div>
                    {evts.map((ev, i) => {
                      const eventCol = ADM_EVENT_COLORS[ev.type] || '#3B82F6';
                      const priorityCol = ev.priority ? ADM_PRIORITY_COLORS[ev.priority] : null;
                      return (
                        <div key={i} className="cal-event" style={{ background: eventCol + '0D', borderLeft: `2px solid ${eventCol}` }}>
                          <div className="cal-event-title" style={{ color: eventCol }}>
                            {ev.type === 'task' && priorityCol && (
                              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: priorityCol, marginRight: 4, verticalAlign: 'middle' }} />
                            )}
                            {ev._isPrivate ? '🔒 Private Task' : ev.title}
                          </div>
                          {ev.startTime && <div className="cal-event-time" style={{ color: eventCol }}>{ev.startTime}</div>}
                          {!ev.startTime && ev.type && <div className="cal-event-time" style={{ color: eventCol }}>{ev.type}</div>}
                        </div>
                      );
                    })}
                    {evts.length === 0 && today && (
                      <div style={{ fontSize: 10, color: 'var(--ink-4)', textAlign: 'center', marginTop: 20 }}>No events</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Monthly View — uses exact cal-month-grid CSS from CalendarHome */}
          {!loading && view === 'monthly' && (() => {
            const year = currentDate.getFullYear(), month = currentDate.getMonth();
            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);
            const startPad = (firstDay.getDay() + 6) % 7;
            const days = [];
            for (let i = startPad - 1; i >= 0; i--) days.push({ date: new Date(year, month, -i), otherMonth: true });
            for (let i = 1; i <= lastDay.getDate(); i++) days.push({ date: new Date(year, month, i), otherMonth: false });
            while (days.length % 7 !== 0) days.push({ date: new Date(year, month + 1, days.length - startPad - lastDay.getDate() + 1), otherMonth: true });

            return (
              <div className="cal-month-grid">
                {ADM_DAYS.map(d => <div key={d} className="cal-month-header">{d}</div>)}
                {days.map((d, i) => {
                  const ds = admDateStr(d.date);
                  const dayEvents = events.filter(e => e.date === ds);
                  const today = admIsToday(d.date);
                  return (
                    <div key={i} className={`cal-month-day ${today ? 'today' : ''} ${d.otherMonth ? 'other-month' : ''}`}
                      onClick={() => { setCurrentDate(d.date); setView('weekly'); }}>
                      <div className="cal-month-day-num">{d.date.getDate()}</div>
                      {dayEvents.length > 0 && (() => {
                        const sorted = [...dayEvents].sort((a, b) => (ADM_EVENT_PRIORITY_RANK[a.type] || 9) - (ADM_EVENT_PRIORITY_RANK[b.type] || 9));
                        const top = sorted[0];
                        const col = ADM_EVENT_COLORS[top.type] || '#3B82F6';
                        return (
                          <div className="cal-month-event" style={{ background: col + '14', color: col, borderLeft: `2px solid ${col}` }}>
                            {top._isPrivate ? '🔒' : top.title}
                          </div>
                        );
                      })()}
                      {dayEvents.length > 1 && <div className="cal-month-more">+{dayEvents.length - 1}</div>}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
