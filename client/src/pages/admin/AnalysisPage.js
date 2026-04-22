import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';

const TABS = [
  { key: 'individual', label: 'Individual' },
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

            {/* Attendance records */}
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 10, marginTop: 20 }}>Attendance Records</div>
            {individualAttendance.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink-3)', fontSize: 12 }}>No attendance records for this period.</div>
            ) : (
              <div className="table-container">
                <div className="table-header" style={{ gridTemplateColumns: '100px 100px 100px 80px 80px' }}>
                  <div>Date</div>
                  <div>Entry</div>
                  <div>Wrap Up</div>
                  <div>Hours</div>
                  <div>Status</div>
                </div>
                {individualAttendance.slice(0, 31).map(r => (
                  <div key={r._id || r.date} className="table-row" style={{ gridTemplateColumns: '100px 100px 100px 80px 80px' }}>
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

      {/* Period filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {PERIODS.map(p => (
          <button key={p.key} style={periodStyle(period === p.key)} onClick={() => setPeriod(p.key)}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && <div className="info-box amber" style={{ marginBottom: 12 }}><span>&#9888;&#65039;</span><div>{error}</div></div>}

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-3)' }}>Loading...</div>
      ) : (
        <>
          {tab === 'individual' && renderIndividual()}
          {tab === 'team' && renderTeam()}
          {tab === 'company' && renderCompany()}
        </>
      )}
    </div>
  );
}
