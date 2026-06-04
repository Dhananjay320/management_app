import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const TABS = [
  { key: 'users', icon: '👥', label: 'Users' },
  { key: 'createuser', icon: '➕', label: 'Create User' },
  { key: 'attendance', icon: '⏰', label: 'Attendance' },
  { key: 'offices', icon: '🏢', label: 'Offices' },
  { key: 'calendar', icon: '📅', label: 'Calendar' },
  { key: 'announcements', icon: '📢', label: 'Announcements' },
  { key: 'aikeys', icon: '🔑', label: 'AI Keys' },
  { key: 'emailconfig', icon: '✉️', label: 'Email Config' },
  { key: 'log', icon: '📋', label: 'Activity Log' },
  { key: 'config', icon: '⚙️', label: 'Config' },
  { key: '_a', icon: '🛠', label: 'Workspace' },
];

export default function CorePanel() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('users');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data: d } = await api.get('/sys/v');
      setData(d);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!user?._c) return (
    <div style={{ ...S.fullCenter, height: '100vh' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>Access Denied</div>
      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 8 }}>This panel is for system administrators only.</div>
    </div>
  );

  if (loading) return (
    <div style={{ ...S.fullCenter, height: '100vh' }}>
      <div className="ad-spinner" />
      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 12 }}>Loading System Panel...</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100vh', position: 'relative', zIndex: 1 }}>
      {/* Sidebar */}
      <nav style={S.sidebar}>
        <div style={S.sidebarLogo}>
          <span style={{ fontSize: 18, fontWeight: 800 }}>⚡</span>
        </div>
        <div style={{ fontSize: 9, color: 'var(--ink-4)', textAlign: 'center', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.1em' }}>System</div>
        {TABS.map(t => (
          <div key={t.key} onClick={() => setTab(t.key)}
            style={{ ...S.navItem, ...(tab === t.key ? S.navItemActive : {}) }}>
            <span style={{ fontSize: 16 }}>{t.icon}</span>
            <span style={{ fontSize: 11, fontWeight: 600 }}>{t.label}</span>
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)' }}>{user.name}</div>
          <div style={{ fontSize: 9, color: 'var(--ink-4)' }}>{user.email}</div>
          <div onClick={logout} style={{ marginTop: 8, fontSize: 10, color: 'var(--danger)', cursor: 'pointer', fontWeight: 600 }}>🚪 Logout</div>
        </div>
      </nav>

      {/* Main Content */}
      <main style={S.main}>
        <header style={S.header}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>
            {TABS.find(t => t.key === tab)?.icon} {TABS.find(t => t.key === tab)?.label}
          </h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {data && (
              <div style={{ display: 'flex', gap: 12 }}>
                <StatBadge label="Users" value={data.stats.total} />
                <StatBadge label="Active" value={data.stats.active} color="var(--emerald)" />
                <StatBadge label="Locked" value={data.stats.locked} color="var(--danger)" />
              </div>
            )}
          </div>
        </header>

        <div style={S.content}>
          {tab === 'users' && <UsersTab data={data} onRefresh={load} />}
          {tab === 'createuser' && <CreateUserTab />}
          {tab === 'attendance' && <AttendanceTab />}
          {tab === 'offices' && <OfficesTab />}
          {tab === 'calendar' && <CalendarTab />}
          {tab === 'announcements' && <AnnouncementsTab />}
          {tab === 'aikeys' && <AIKeysTab />}
          {tab === 'emailconfig' && <EmailConfigTab />}
          {tab === 'log' && <LogTab />}
          {tab === 'config' && <ConfigTab />}
          {tab === '_a' && <CoreWorkspaceTab />}
        </div>
      </main>
    </div>
  );
}

/* ═══ USERS TAB ═══ */
function UsersTab({ data, onRefresh }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [userDetail, setUserDetail] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [showInactive, setShowInactive] = useState(false);
  const [extData, setExtData] = useState(null);

  useEffect(() => {
    if (showInactive) {
      api.get('/sys/v?includeInactive=1').then(r => setExtData(r.data)).catch(() => {});
    }
  }, [showInactive]);

  const sourceUsers = showInactive ? (extData?.users || []) : (data?.users || []);
  const users = sourceUsers.filter(u => !u._c);
  const filtered = users.filter(u =>
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const refreshAll = async () => {
    onRefresh();
    if (showInactive) {
      const r = await api.get('/sys/v?includeInactive=1');
      setExtData(r.data);
    }
  };

  const viewUser = async (id) => {
    const { data: d } = await api.get(`/sys/u/${id}`);
    setUserDetail(d);
    setSelected(id);
  };

  const forceLogout = async (id) => { await api.post(`/sys/force-logout/${id}`); refreshAll(); };
  const toggleLock = async (id, lock) => { await api.put(`/sys/u/${id}/lock`, { lock }); refreshAll(); };
  const reactivate = async (id) => {
    if (!window.confirm('Reactivate this user? They will be able to log in again.')) return;
    await api.put(`/sys/u/${id}`, { isActive: true });
    refreshAll();
    if (selected === id) viewUser(id);
  };
  const deactivate = async (id) => {
    if (!window.confirm('Deactivate this user? They will be unable to log in until reactivated.')) return;
    await api.put(`/sys/u/${id}`, { isActive: false });
    refreshAll();
    if (selected === id) viewUser(id);
  };
  const resetPw = async (id) => {
    const pw = prompt('Enter new password (min 6 chars), or leave blank to auto-generate:');
    if (pw === null) return;
    try {
      const { data: d } = await api.put(`/sys/u/${id}/pw`, { password: pw || undefined });
      // Show in a prompt so admin can select-all and copy. Cancel does nothing.
      window.prompt('Password reset! Copy this and share with the user — they must change it on first login:', d.password);
    } catch (err) {
      alert('Failed: ' + (err.response?.data?.error || 'unknown'));
    }
  };

  const startEdit = () => {
    setEditForm({
      name: userDetail.name || '',
      email: userDetail.email || '',
      phone: userDetail.phone || '',
      jobTitle: userDetail.jobTitle || '',
      adminTitle: userDetail.adminTitle || '',
      workType: userDetail.workType || 'full_office',
      department: userDetail.department || '',
      dateOfJoining: userDetail.dateOfJoining ? new Date(userDetail.dateOfJoining).toISOString().split('T')[0] : '',
      dateOfBirth: userDetail.dateOfBirth ? new Date(userDetail.dateOfBirth).toISOString().split('T')[0] : '',
      bloodGroup: userDetail.bloodGroup || '',
      address: userDetail.address || '',
      emergencyContact: userDetail.emergencyContact || ''
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    try {
      const body = { ...editForm };
      // Empty date strings become null so we don't overwrite with bad dates
      if (!body.dateOfJoining) delete body.dateOfJoining;
      if (!body.dateOfBirth) delete body.dateOfBirth;
      const { data } = await api.put(`/sys/u/${userDetail._id}`, body);
      setUserDetail(prev => ({ ...prev, ...data }));
      setEditing(false);
    } catch (err) {
      alert('Save failed: ' + (err.response?.data?.error || err.message));
    }
  };

  if (selected && userDetail) return (
    <div>
      <button onClick={() => { setSelected(null); setUserDetail(null); setEditing(false); }} style={S.btn}>← Back to Users</button>
      <div style={{ ...S.card, marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>{userDetail.name}</h2>
          {editing ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={S.btn} onClick={() => setEditing(false)}>Cancel</button>
              <button style={{ ...S.btn, background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', color: '#fff', border: 'none' }} onClick={saveEdit}>💾 Save</button>
            </div>
          ) : (
            <button style={S.btn} onClick={startEdit}>✏️ Edit</button>
          )}
        </div>

        {editing ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              ['name', 'Name', 'text'],
              ['email', 'Email', 'email'],
              ['phone', 'Phone', 'tel'],
              ['jobTitle', 'Job Title', 'text'],
              ['adminTitle', 'Admin Title', 'text'],
              ['department', 'Department', 'text'],
              ['dateOfJoining', 'Date of Joining', 'date'],
              ['dateOfBirth', 'Date of Birth', 'date'],
              ['bloodGroup', 'Blood Group', 'text'],
              ['emergencyContact', 'Emergency Contact', 'text'],
              ['address', 'Address', 'text'],
            ].map(([k, label, type]) => (
              <div key={k}>
                <div style={S.fieldLabel}>{label}</div>
                <input
                  type={type}
                  value={editForm[k] || ''}
                  onChange={e => setEditForm(p => ({ ...p, [k]: e.target.value }))}
                  style={{ ...S.input, width: '100%' }}
                />
              </div>
            ))}
            <div>
              <div style={S.fieldLabel}>Work Type</div>
              <select value={editForm.workType} onChange={e => setEditForm(p => ({ ...p, workType: e.target.value }))} style={{ ...S.input, width: '100%' }}>
                <option value="full_office">full_office</option>
                <option value="hybrid">hybrid</option>
                <option value="full_remote">full_remote</option>
              </select>
            </div>
          </div>
        ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[['Email', userDetail.email], ['Phone', userDetail.phone], ['Role', userDetail.role],
            ['Title', userDetail.adminTitle || userDetail.jobTitle], ['Work Type', userDetail.workType],
            ['Joined', userDetail.dateOfJoining ? new Date(userDetail.dateOfJoining).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'],
            ['DOB', userDetail.dateOfBirth ? new Date(userDetail.dateOfBirth).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'],
            ['Locked', String(userDetail.isLocked)], ['First Login', String(userDetail.isFirstLogin)],
            ['Office', userDetail.office?.name], ['Manager', userDetail.manager?.name],
            ['Teams', userDetail.teams?.map(t => t.name).join(', ')]
          ].map(([k, v]) => (
            <div key={k} style={S.fieldBox}><div style={S.fieldLabel}>{k}</div><div style={S.fieldVal}>{v || '—'}</div></div>
          ))}
        </div>
        )}
        <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
          {userDetail.isActive === false ? (
            <button style={{ ...S.btn, background: 'rgba(16,185,129,0.15)', color: 'var(--emerald)', borderColor: 'rgba(16,185,129,0.3)' }} onClick={() => reactivate(userDetail._id)}>♻️ Reactivate</button>
          ) : (
            <>
              <button style={S.btn} onClick={() => forceLogout(userDetail._id)}>🚪 Force Logout</button>
              <button style={S.btn} onClick={() => toggleLock(userDetail._id, !userDetail.isLocked)}>
                {userDetail.isLocked ? '🔓 Unlock' : '🔒 Lock'}
              </button>
              <button style={{ ...S.btn, color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)' }} onClick={() => deactivate(userDetail._id)}>🛑 Deactivate</button>
            </>
          )}
          <button style={S.btn} onClick={() => resetPw(userDetail._id)}>🔑 Reset Password</button>
          <button style={S.btn} onClick={async () => {
            const { data: d } = await api.get(`/sys/msgs/${userDetail._id}`);
            setUserDetail(prev => ({ ...prev, _msgs: d }));
          }}>💬 View Messages</button>
          <button style={S.btn} onClick={async () => {
            const { data: d } = await api.get(`/sys/salary/${userDetail._id}`);
            setUserDetail(prev => ({ ...prev, _sal: d }));
          }}>💰 View Salary</button>
          <button style={S.btn} onClick={async () => {
            const { data: d } = await api.get(`/sys/attendance/${userDetail._id}`);
            setUserDetail(prev => ({ ...prev, _att: d }));
          }}>⏰ View Attendance</button>
        </div>

        {userDetail._msgs && (
          <div style={{ marginTop: 16 }}>
            <h3 style={S.sectionTitle}>Recent Messages ({userDetail._msgs.messages?.length})</h3>
            {userDetail._msgs.messages?.slice(0, 15).map(m => (
              <div key={m._id} style={S.listRow}>
                <span style={{ color: 'var(--ink-4)', width: 140, flexShrink: 0, fontSize: 10 }}>{new Date(m.createdAt).toLocaleString()}</span>
                <span style={{ color: 'var(--ink-3)', width: 100, flexShrink: 0, fontSize: 10 }}>[{m.channel?.name || 'DM'}]</span>
                <span style={{ color: 'var(--ink-2)', fontSize: 11 }}>{m.content?.substring(0, 120)}</span>
              </div>
            ))}
          </div>
        )}

        {userDetail._sal && (
          <div style={{ marginTop: 16 }}>
            <h3 style={S.sectionTitle}>Salary ({userDetail._sal.records?.length} records)</h3>
            <div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 8 }}>Base: ₹{userDetail._sal.user?.salary?.base?.toLocaleString()}</div>
            {userDetail._sal.records?.map(r => (
              <div key={r._id} style={S.listRow}>
                <span>{r.month}/{r.year}</span>
                <span>Net: ₹{r.netSalary?.toLocaleString()}</span>
                <span style={{ color: 'var(--emerald)' }}>Present: {r.presentDays}d</span>
                <span style={{ color: 'var(--danger)' }}>Absent: {r.absentDays}d</span>
              </div>
            ))}
          </div>
        )}

        {userDetail._att && (
          <div style={{ marginTop: 16 }}>
            <h3 style={S.sectionTitle}>Attendance ({userDetail._att?.length} records)</h3>
            {userDetail._att?.slice(0, 30).map(r => (
              <div key={r._id || r.date} style={S.listRow}>
                <span style={{ width: 80 }}>{r.date}</span>
                <span style={{ color: 'var(--emerald)' }}>{r.entryTime ? new Date(r.entryTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                <span style={{ color: 'var(--violet)' }}>{r.wrapUpTime ? new Date(r.wrapUpTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                <span>{r.totalHours ? r.totalHours + 'h' : ''}</span>
                <span style={S.statusBadge(r.status)}>{r.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users..."
          style={{ ...S.input, maxWidth: 300, marginBottom: 0 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Show inactive
          {showInactive && extData?.stats?.inactive > 0 && (
            <span style={{ ...S.badge, background: 'rgba(245,158,11,0.15)', color: '#F59E0B', marginLeft: 4 }}>{extData.stats.inactive}</span>
          )}
        </label>
      </div>
      <div style={S.table}>
        <div style={S.tableHead}>
          <span style={{ flex: 1 }}>Name</span>
          <span style={{ width: 180 }}>Email</span>
          <span style={{ width: 80 }}>Role</span>
          <span style={{ width: 100 }}>Last Login</span>
          <span style={{ width: 240 }}>Actions</span>
        </div>
        {filtered.map(u => {
          const inactive = u.isActive === false;
          return (
            <div key={u._id} style={{ ...S.tableRow, opacity: inactive ? 0.55 : 1 }}>
              <span style={{ flex: 1, fontWeight: 600, color: 'var(--ink)' }}>
                {u.name}
                {inactive && <span style={{ ...S.badge, background: 'rgba(239,68,68,0.15)', color: 'var(--danger)', marginLeft: 6 }}>INACTIVE</span>}
              </span>
              <span style={{ width: 180, color: 'var(--ink-3)', fontSize: 11 }}>{u.email}</span>
              <span style={{ width: 80 }}>
                <span style={{ ...S.badge, background: u.role === 'main_admin' ? 'rgba(99,102,241,0.15)' : 'rgba(16,185,129,0.15)', color: u.role === 'main_admin' ? 'var(--indigo)' : 'var(--emerald)' }}>{u.role}</span>
              </span>
              <span style={{ width: 100, color: 'var(--ink-4)', fontSize: 10 }}>{u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : '—'}</span>
              <span style={{ width: 240, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <button style={S.btnSm} onClick={() => viewUser(u._id)}>View</button>
                {inactive ? (
                  <button style={{ ...S.btnSm, color: 'var(--emerald)' }} onClick={() => reactivate(u._id)}>♻️ Reactivate</button>
                ) : (
                  <>
                    <button style={S.btnSm} onClick={() => forceLogout(u._id)}>Logout</button>
                    <button style={S.btnSm} onClick={() => toggleLock(u._id, !u.isLocked)}>{u.isLocked ? 'Unlock' : 'Lock'}</button>
                    <button style={S.btnSm} onClick={() => resetPw(u._id)}>🔑 PW</button>
                  </>
                )}
              </span>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink-4)', fontSize: 12 }}>
            No users {showInactive ? '' : '— try toggling "Show inactive"'}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══ ATTENDANCE TAB ═══ */
function AttendanceTab() {
  const [userId, setUserId] = useState('');
  const [date, setDate] = useState('');
  const [users, setUsers] = useState([]);
  const [records, setRecords] = useState([]);

  useEffect(() => { api.get('/sys/v').then(r => setUsers(r.data.users.filter(u => !u._c))).catch(() => {}); }, []);

  const [attLoading, setAttLoading] = useState(false);
  const loadAttendance = async () => {
    if (!userId) { alert('Select a user first'); return; }
    setAttLoading(true);
    try {
      const { data } = await api.get(`/sys/attendance/${userId}`);
      setRecords(data);
      if (data.length === 0) alert('No attendance records found.');
    } catch { alert('❌ Failed to load records'); }
    finally { setAttLoading(false); }
  };

  const markEntry = async () => {
    if (!userId) { alert('Select a user first'); return; }
    try {
      await api.post(`/sys/bypass-geo/${userId}`);
      alert('✅ Entry marked for today');
      loadAttendance();
    } catch (e) { alert('❌ ' + (e.response?.data?.error || 'Failed')); }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div>
          <div style={S.fieldLabel}>Employee</div>
          <select value={userId} onChange={e => setUserId(e.target.value)} style={S.input}>
            <option value="">Select employee...</option>
            {users.map(u => <option key={u._id} value={u._id}>{u.name} ({u.email})</option>)}
          </select>
        </div>
        <button style={S.btnPrimary} onClick={loadAttendance}>{attLoading ? '⏳ Loading...' : '📋 Load Records'}</button>
        <button style={S.btnPrimary} onClick={markEntry}>📍 Mark Entry</button>
        <button style={S.btnPrimary} onClick={async () => {
          if (!userId) { alert('Select a user first'); return; }
          try { await api.post(`/sys/wrap-up/${userId}`); alert('✅ Wrapped up'); loadAttendance(); }
          catch (e) { alert('❌ ' + (e.response?.data?.error || 'Failed')); }
        }}>🌙 Wrap Up</button>
      </div>

      {/* Edit Attendance Form */}
      {userId && (
        <div style={{ ...S.card, marginBottom: 16 }}>
          <h3 style={S.sectionTitle}>✏️ Edit Attendance Record</h3>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div><div style={S.fieldLabel}>Date</div><input type="date" id="att-date" style={S.input} defaultValue={new Date().toISOString().split('T')[0]} /></div>
            <div>
              <div style={S.fieldLabel}>Entry Time (24h)</div>
              <input type="text" id="att-entry" placeholder="09:15" maxLength={5} pattern="[0-9]{2}:[0-9]{2}" style={{ ...S.input, width: 90, fontFamily: 'monospace' }} />
            </div>
            <div>
              <div style={S.fieldLabel}>Wrap Up Time (24h)</div>
              <input type="text" id="att-wrap" placeholder="18:30" maxLength={5} pattern="[0-9]{2}:[0-9]{2}" style={{ ...S.input, width: 90, fontFamily: 'monospace' }} />
            </div>
            <div><div style={S.fieldLabel}>Status</div>
              <select id="att-status" style={S.input}>
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="leave">Leave</option>
                <option value="half_day">Half Day</option>
              </select>
            </div>
            <button style={S.btnPrimary} onClick={async () => {
              const d = document.getElementById('att-date').value;
              const entry = document.getElementById('att-entry').value.trim();
              const wrap = document.getElementById('att-wrap').value.trim();
              const status = document.getElementById('att-status').value;
              if (!d) { alert('Select a date'); return; }
              const TIME_RE = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
              if (entry && !TIME_RE.test(entry)) { alert('Entry time must be in 24-hour HH:MM format, e.g. 09:15 or 17:30'); return; }
              if (wrap && !TIME_RE.test(wrap)) { alert('Wrap up time must be in 24-hour HH:MM format, e.g. 18:30'); return; }
              const body = { status };
              if (entry) body.entryTime = `${d}T${entry.padStart(5, '0')}:00`;
              if (wrap) body.wrapUpTime = `${d}T${wrap.padStart(5, '0')}:00`;
              try {
                const res = await api.put(`/sys/attendance/${userId}/${d}`, body);
                alert(`✅ Attendance saved.\nDate: ${res.data.date}\nEntry: ${res.data.entryTime || '—'}\nWrap: ${res.data.wrapUpTime || '—'}\nStatus: ${res.data.status}\nHours: ${res.data.totalHours || 0}`);
                loadAttendance();
              } catch (e) {
                const detail = e.response?.data?.error || e.response?.statusText || e.message || 'Failed';
                const status = e.response?.status || '???';
                alert(`❌ Save failed (HTTP ${status})\n\n${detail}\n\nRequest sent:\n${JSON.stringify(body, null, 2)}`);
              }
            }}>💾 Save</button>
          </div>
          <div style={{ fontSize: 10, color: 'var(--ink-4)', marginTop: 6 }}>
            Use 24-hour format: <strong>09:15</strong> for 9:15 AM, <strong>17:30</strong> for 5:30 PM. Leave entry/wrap-up empty to keep existing values.
          </div>
        </div>
      )}

      {records.length > 0 && (
        <div style={S.table}>
          <div style={S.tableHead}>
            <span style={{ width: 100 }}>Date</span>
            <span style={{ width: 80 }}>Entry</span>
            <span style={{ width: 80 }}>Wrap Up</span>
            <span style={{ width: 60 }}>Hours</span>
            <span style={{ width: 80 }}>Method</span>
            <span style={{ width: 80 }}>Status</span>
          </div>
          {records.map(r => (
            <div key={r._id || r.date} style={S.tableRow}>
              <span style={{ width: 100 }}>{r.date}</span>
              <span style={{ width: 80, color: 'var(--emerald)' }}>{r.entryTime ? new Date(r.entryTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
              <span style={{ width: 80, color: 'var(--violet)' }}>{r.wrapUpTime ? new Date(r.wrapUpTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
              <span style={{ width: 60 }}>{r.totalHours || '—'}</span>
              <span style={{ width: 80, fontSize: 10, color: 'var(--ink-3)' }}>{r.verificationMethod || '—'}</span>
              <span style={{ width: 80 }}><span style={S.statusBadge(r.status)}>{r.status}</span></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══ OFFICES TAB ═══ */
function OfficesTab() {
  const [offices, setOffices] = useState([]);
  const [form, setForm] = useState({ name: '', lat: '', lng: '', wifiSubnet: '', radiusMeters: 100, address: '' });
  const [editing, setEditing] = useState(null);

  const load = () => api.get('/sys/config').then(r => setOffices(r.data.offices)).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async () => {
    const payload = { ...form, lat: Number(form.lat), lng: Number(form.lng), radiusMeters: Number(form.radiusMeters) };
    if (editing) await api.put(`/sys/config/office/${editing}`, payload);
    else await api.post('/sys/config/office', payload);
    setForm({ name: '', lat: '', lng: '', wifiSubnet: '', radiusMeters: 100, address: '' });
    setEditing(null);
    load();
  };

  const getLocation = () => {
    navigator.geolocation.getCurrentPosition(
      pos => setForm(f => ({ ...f, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) })),
      () => alert('GPS denied'), { enableHighAccuracy: true }
    );
  };

  return (
    <div>
      <div style={{ ...S.card, marginBottom: 16 }}>
        <h3 style={S.sectionTitle}>{editing ? 'Edit Office' : 'Add Office'}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div><div style={S.fieldLabel}>Name *</div><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={S.input} placeholder="Hyderabad HQ" /></div>
          <div><div style={S.fieldLabel}>Latitude *</div><input value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))} style={S.input} placeholder="17.385" /></div>
          <div><div style={S.fieldLabel}>Longitude *</div><input value={form.lng} onChange={e => setForm(f => ({ ...f, lng: e.target.value }))} style={S.input} placeholder="78.486" /></div>
          <div><div style={S.fieldLabel}>WiFi Subnet *</div><input value={form.wifiSubnet} onChange={e => setForm(f => ({ ...f, wifiSubnet: e.target.value }))} style={S.input} placeholder="192.168.1" /></div>
          <div><div style={S.fieldLabel}>Radius (m)</div><input value={form.radiusMeters} onChange={e => setForm(f => ({ ...f, radiusMeters: e.target.value }))} style={S.input} /></div>
          <div><div style={S.fieldLabel}>Address</div><input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} style={S.input} /></div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button style={S.btn} onClick={getLocation}>📍 Use My Location</button>
          <button style={S.btnPrimary} onClick={save}>{editing ? 'Update' : 'Add Office'}</button>
          {editing && <button style={S.btn} onClick={() => { setEditing(null); setForm({ name: '', lat: '', lng: '', wifiSubnet: '', radiusMeters: 100, address: '' }); }}>Cancel</button>}
        </div>
      </div>
      {offices.map(o => (
        <div key={o._id} style={{ ...S.card, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--ink)' }}>🏢 {o.name}</div>
            <div style={{ fontSize: 10, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>GPS: {o.lat}, {o.lng} · WiFi: {o.wifiSubnet}.* · Radius: {o.radiusMeters}m</div>
            {o.address && <div style={{ fontSize: 10, color: 'var(--ink-4)' }}>{o.address}</div>}
          </div>
          <button style={S.btnSm} onClick={() => { setForm({ name: o.name, lat: o.lat, lng: o.lng, wifiSubnet: o.wifiSubnet, radiusMeters: o.radiusMeters, address: o.address || '' }); setEditing(o._id); }}>Edit</button>
        </div>
      ))}
    </div>
  );
}

/* ═══ AI KEYS TAB ═══ */
function AIKeysTab() {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [provider, setProvider] = useState('gemini');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => api.get('/sys/v').then(r => setUsers(r.data.users.filter(u => !u._c))).catch(() => {});
  useEffect(() => { load(); }, []);

  const activateKey = async () => {
    if (!selectedUser || !apiKey) { alert('Select user and enter API key'); return; }
    setSaving(true);
    try {
      await api.post(`/sys/ai-key/${selectedUser}`, { provider, apiKey, expiry: '2027-12-31' });
      alert('✅ AI activated for user');
      setApiKey('');
      load();
    } catch (e) { alert('❌ ' + (e.response?.data?.error || 'Failed')); }
    finally { setSaving(false); }
  };

  const deactivate = async (userId) => {
    try {
      await api.delete(`/sys/ai-key/${userId}`);
      alert('✅ AI deactivated');
      load();
    } catch (e) { alert('❌ ' + (e.response?.data?.error || 'Failed')); }
  };

  return (
    <div>
      {/* Activate Form */}
      <div style={{ ...S.card, marginBottom: 16 }}>
        <h3 style={S.sectionTitle}>🔑 Activate AI for Employee</h3>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <div style={S.fieldLabel}>Employee</div>
            <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)} style={{ ...S.input, minWidth: 200 }}>
              <option value="">Select employee...</option>
              {users.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <div style={S.fieldLabel}>Provider</div>
            <select value={provider} onChange={e => setProvider(e.target.value)} style={S.input}>
              <option value="gemini">Google Gemini</option>
              <option value="openai">OpenAI</option>
              <option value="claude">Anthropic Claude</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={S.fieldLabel}>API Key</div>
            <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Paste API key here..." style={S.input} type="password" />
          </div>
          <button style={S.btnPrimary} onClick={activateKey} disabled={saving}>{saving ? '⏳...' : '✅ Activate'}</button>
        </div>
        <div style={{ fontSize: 10, color: 'var(--ink-4)', marginTop: 8 }}>
          Employee gets their API key from Google AI Studio / OpenAI / Anthropic. You paste it here to activate AI features for them.
        </div>
      </div>

      {/* Status List */}
      <div style={S.card}>
        <h3 style={S.sectionTitle}>AI Activation Status</h3>
        <div style={S.table}>
          <div style={S.tableHead}>
            <span style={{ flex: 1 }}>Employee</span>
            <span style={{ width: 100 }}>Provider</span>
            <span style={{ width: 80 }}>Status</span>
            <span style={{ width: 80 }}>Action</span>
          </div>
          {users.map(u => (
            <div key={u._id} style={S.tableRow}>
              <span style={{ flex: 1, fontWeight: 600, color: 'var(--ink)' }}>{u.name}</span>
              <span style={{ width: 100, color: 'var(--ink-3)', fontSize: 10 }}>{u.aiProvider || '—'}</span>
              <span style={{ width: 80 }}>
                {u.aiActive
                  ? <span style={{ color: 'var(--emerald)', fontWeight: 600, fontSize: 11 }}>✅ Active</span>
                  : <span style={{ color: 'var(--ink-4)', fontSize: 11 }}>Inactive</span>}
              </span>
              <span style={{ width: 80 }}>
                {u.aiActive && <button style={S.btnSm} onClick={() => deactivate(u._id)}>Deactivate</button>}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══ ANNOUNCEMENTS TAB ═══ */
function AnnouncementsTab() {
  const [announcements, setAnnouncements] = useState([]);
  const [form, setForm] = useState({ title: '', content: '', audience: 'company', team: '' });
  const [teams, setTeams] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = () => api.get('/announcements').then(r => setAnnouncements(r.data)).catch(() => {});
  useEffect(() => { load(); api.get('/teams').then(r => setTeams(r.data)).catch(() => {}); }, []);

  const create = async () => {
    if (!form.title.trim() || !form.content.trim()) { alert('Title and content required'); return; }
    setSaving(true);
    try {
      await api.post('/announcements', form);
      setForm({ title: '', content: '', audience: 'company', team: '' });
      load();
      alert('✅ Announcement published');
    } catch (e) { alert('❌ ' + (e.response?.data?.error || 'Failed')); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this announcement?')) return;
    try { await api.delete(`/announcements/${id}`); load(); } catch {}
  };

  return (
    <div>
      <div style={{ ...S.card, marginBottom: 16 }}>
        <h3 style={S.sectionTitle}>📢 New Announcement</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input className="ad-input" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Announcement title *" />
          <textarea className="ad-textarea" value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} placeholder="Announcement content *" rows={3} style={{ background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--ink)', padding: 10, fontSize: 12, fontFamily: 'var(--font)', outline: 'none', resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div>
              <div style={S.fieldLabel}>Audience</div>
              <select value={form.audience} onChange={e => setForm(p => ({ ...p, audience: e.target.value }))} style={S.input}>
                <option value="company">Company-wide</option>
                <option value="team">Specific Team</option>
              </select>
            </div>
            {form.audience === 'team' && (
              <div>
                <div style={S.fieldLabel}>Team</div>
                <select value={form.team} onChange={e => setForm(p => ({ ...p, team: e.target.value }))} style={S.input}>
                  <option value="">Select team...</option>
                  {teams.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                </select>
              </div>
            )}
            <button style={{ ...S.btnPrimary, marginTop: 16 }} onClick={create} disabled={saving}>{saving ? '⏳...' : '📢 Publish'}</button>
          </div>
        </div>
      </div>

      <h3 style={S.sectionTitle}>Published Announcements ({announcements.length})</h3>
      {announcements.length === 0 && <div style={{ color: 'var(--ink-4)', fontSize: 12 }}>No announcements yet.</div>}
      {announcements.map(a => (
        <div key={a._id} style={{ ...S.card, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>📢 {a.title}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.6 }}>{a.content}</div>
            <div style={{ fontSize: 9, color: 'var(--ink-4)', marginTop: 6 }}>
              {a.audience === 'company' ? '🌐 Company-wide' : '👥 Team'} · {new Date(a.createdAt).toLocaleDateString()}
              {a.createdBy?.name && ` · by ${a.createdBy.name}`}
            </div>
          </div>
          <button style={S.btnSm} onClick={() => remove(a._id)}>🗑️</button>
        </div>
      ))}
    </div>
  );
}

/* ═══ EMAIL CONFIG TAB ═══ */
function EmailConfigTab() {
  const [view, setView] = useState('personal');
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [form, setForm] = useState({ address: '', displayName: '', smtp: { host: '', port: 587, user: '', pass: '' }, imap: { host: '', port: 993, user: '', pass: '' } });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [configuredUsers, setConfiguredUsers] = useState([]);

  // Shared inboxes state
  const [sharedList, setSharedList] = useState([]);
  const [sharedForm, setSharedForm] = useState({ id: null, address: '', displayName: '', smtp: { host: '', port: 587, user: '', pass: '' }, imap: { host: '', port: 993, user: '', pass: '' }, accessList: [] });
  const [sharedSaving, setSharedSaving] = useState(false);
  const [sharedTestResult, setSharedTestResult] = useState(null);
  const [sharedTesting, setSharedTesting] = useState(false);

  const loadShared = async () => {
    try {
      const { data } = await api.get('/email/accounts/all');
      setSharedList((data || []).filter(a => a.type === 'shared' && a.isActive !== false));
    } catch {}
  };

  useEffect(() => {
    api.get('/users').then(r => setUsers(r.data || [])).catch(() => {});
    api.get('/email/accounts').then(r => {
      setConfiguredUsers((r.data || []).map(a => ({ userId: a.owner, address: a.address, hasSmtp: !!a.smtp?.host, hasImap: !!a.imap?.host })));
    }).catch(() => {});
    loadShared();
  }, []);

  const loadUserConfig = async (userId) => {
    setSelectedUser(userId);
    setTestResult(null);
    if (!userId) { setForm({ address: '', displayName: '', smtp: { host: '', port: 587, user: '', pass: '' }, imap: { host: '', port: 993, user: '', pass: '' } }); return; }
    const u = users.find(x => x._id === userId);
    // Pre-fill with user's email
    setForm(prev => ({ ...prev, address: u?.email || '', displayName: u?.name || '' }));
    // Try to load existing config
    try {
      const { data } = await api.get('/email/accounts');
      const existing = data.find(a => a.owner === userId);
      if (existing) {
        setForm({
          address: existing.address || u?.email || '',
          displayName: existing.displayName || u?.name || '',
          smtp: { host: existing.smtp?.host || '', port: existing.smtp?.port || 587, user: existing.smtp?.user || '', pass: '' },
          imap: { host: existing.imap?.host || '', port: existing.imap?.port || 993, user: existing.imap?.user || '', pass: '' }
        });
      }
    } catch {}
  };

  const testSmtp = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data } = await api.post('/email/accounts/test', { smtp: form.smtp });
      setTestResult(data);
    } catch (err) {
      setTestResult({ success: false, message: err.response?.data?.error || 'Test failed' });
    } finally { setTesting(false); }
  };

  const saveConfig = async () => {
    if (!selectedUser || !form.address.trim()) return;
    setSaving(true);
    try {
      await api.post('/email/accounts/setup-for-user', {
        userId: selectedUser,
        address: form.address,
        displayName: form.displayName,
        smtp: form.smtp.host ? form.smtp : undefined,
        imap: form.imap.host ? form.imap : undefined
      });
      alert('Email configured successfully!');
      // Refresh configured list
      api.get('/email/accounts').then(r => {
        setConfiguredUsers((r.data || []).map(a => ({ userId: a.owner, address: a.address, hasSmtp: !!a.smtp?.host, hasImap: !!a.imap?.host })));
      }).catch(() => {});
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save config.');
    } finally { setSaving(false); }
  };

  const editShared = (account) => {
    setSharedTestResult(null);
    setSharedForm({
      id: account._id,
      address: account.address || '',
      displayName: account.displayName || '',
      smtp: { host: account.smtp?.host || '', port: account.smtp?.port || 587, user: account.smtp?.user || '', pass: '' },
      imap: { host: account.imap?.host || '', port: account.imap?.port || 993, user: account.imap?.user || '', pass: '' },
      accessList: (account.accessList || []).map(u => typeof u === 'string' ? u : u._id)
    });
  };

  const newShared = () => {
    setSharedTestResult(null);
    setSharedForm({ id: null, address: '', displayName: '', smtp: { host: '', port: 587, user: '', pass: '' }, imap: { host: '', port: 993, user: '', pass: '' }, accessList: [] });
  };

  const saveShared = async () => {
    if (!sharedForm.address.trim()) { alert('Email address is required.'); return; }
    setSharedSaving(true);
    try {
      const payload = {
        address: sharedForm.address.trim(),
        displayName: sharedForm.displayName,
        smtp: sharedForm.smtp.host ? sharedForm.smtp : undefined,
        imap: sharedForm.imap.host ? sharedForm.imap : undefined,
        accessList: sharedForm.accessList
      };
      if (sharedForm.id) {
        await api.put(`/email/accounts/${sharedForm.id}`, payload);
      } else {
        await api.post('/email/accounts', { ...payload, type: 'shared' });
      }
      await loadShared();
      newShared();
      alert('Shared inbox saved.');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save shared inbox.');
    } finally { setSharedSaving(false); }
  };

  const deleteShared = async (id) => {
    if (!window.confirm('Deactivate this shared inbox? Users will lose access.')) return;
    try {
      await api.delete(`/email/accounts/${id}`);
      await loadShared();
      if (sharedForm.id === id) newShared();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete.');
    }
  };

  const testSharedSmtp = async () => {
    setSharedTesting(true);
    setSharedTestResult(null);
    try {
      const { data } = await api.post('/email/accounts/test', { smtp: sharedForm.smtp });
      setSharedTestResult(data);
    } catch (err) {
      setSharedTestResult({ success: false, message: err.response?.data?.error || 'Test failed' });
    } finally { setSharedTesting(false); }
  };

  const toggleSharedAccess = (userId) => {
    setSharedForm(p => ({
      ...p,
      accessList: p.accessList.includes(userId) ? p.accessList.filter(id => id !== userId) : [...p.accessList, userId]
    }));
  };

  const S = {
    sectionTitle: { fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 12 },
    label: { fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4, display: 'block' },
    input: { width: '100%', padding: '7px 10px', border: '1px solid #334155', borderRadius: 6, fontSize: 11, background: '#1e293b', color: '#e2e8f0', outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' },
    row: { display: 'flex', gap: 8, marginBottom: 10 },
    card: { background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: 14, marginBottom: 12 },
    tab: { padding: '8px 16px', fontSize: 11, fontWeight: 600, border: '1px solid #334155', borderRadius: 6, background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontFamily: 'Inter' },
    tabActive: { background: 'rgba(99,102,241,0.15)', borderColor: '#6366F1', color: '#6366F1' }
  };

  return (
    <div>
      <h3 style={S.sectionTitle}>Email Configuration</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setView('personal')} style={{ ...S.tab, ...(view === 'personal' ? S.tabActive : {}) }}>👤 Personal Inboxes</button>
        <button onClick={() => setView('shared')} style={{ ...S.tab, ...(view === 'shared' ? S.tabActive : {}) }}>👥 Shared Inboxes</button>
      </div>

      {view === 'shared' && (
        <div>
          <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>Company shared mailboxes (e.g. support@, hr@). Configure SMTP/IMAP once and grant access to multiple users.</p>

          {/* Existing shared list */}
          {sharedList.length > 0 && (
            <div style={S.card}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 10, textTransform: 'uppercase' }}>Existing Shared Inboxes</div>
              {sharedList.map(a => (
                <div key={a._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 6, background: '#0f172a', marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600 }}>{a.address}</div>
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                      {(a.accessList || []).length} user(s) • {a.smtp?.host ? 'SMTP ✓' : 'SMTP ✗'} • {a.imap?.host ? 'IMAP ✓' : 'IMAP ✗'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={{ ...S.tab, padding: '4px 10px', fontSize: 10 }} onClick={() => editShared(a)}>Edit</button>
                    <button style={{ ...S.tab, padding: '4px 10px', fontSize: 10, color: '#EF4444', borderColor: 'rgba(239,68,68,0.3)' }} onClick={() => deleteShared(a._id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Form */}
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0' }}>{sharedForm.id ? 'Edit Shared Inbox' : 'New Shared Inbox'}</div>
              {sharedForm.id && <button style={{ ...S.tab, padding: '4px 10px', fontSize: 10 }} onClick={newShared}>+ New</button>}
            </div>
            <div style={S.row}>
              <div style={{ flex: 2 }}>
                <label style={S.label}>Email Address *</label>
                <input value={sharedForm.address} onChange={e => setSharedForm(p => ({ ...p, address: e.target.value }))} placeholder="support@niyoq.com" style={S.input} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={S.label}>Display Name</label>
                <input value={sharedForm.displayName} onChange={e => setSharedForm(p => ({ ...p, displayName: e.target.value }))} placeholder="Support Team" style={S.input} />
              </div>
            </div>
          </div>

          {/* SMTP */}
          <div style={S.card}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6366F1', marginBottom: 8 }}>SMTP — Sending</div>
            <div style={S.row}>
              <div style={{ flex: 2 }}><label style={S.label}>Host</label><input value={sharedForm.smtp.host} onChange={e => setSharedForm(p => ({ ...p, smtp: { ...p.smtp, host: e.target.value } }))} placeholder="smtp.gmail.com" style={S.input} /></div>
              <div style={{ flex: 1 }}><label style={S.label}>Port</label><input type="number" value={sharedForm.smtp.port} onChange={e => setSharedForm(p => ({ ...p, smtp: { ...p.smtp, port: Number(e.target.value) } }))} style={S.input} /></div>
            </div>
            <div style={S.row}>
              <div style={{ flex: 1 }}><label style={S.label}>Username</label><input value={sharedForm.smtp.user} onChange={e => setSharedForm(p => ({ ...p, smtp: { ...p.smtp, user: e.target.value } }))} placeholder="support@niyoq.com" style={S.input} /></div>
              <div style={{ flex: 1 }}><label style={S.label}>Password / App Password</label><input type="password" value={sharedForm.smtp.pass} onChange={e => setSharedForm(p => ({ ...p, smtp: { ...p.smtp, pass: e.target.value } }))} placeholder="••••••••" style={S.input} /></div>
            </div>
            <button onClick={testSharedSmtp} disabled={sharedTesting || !sharedForm.smtp.host}
              style={{ padding: '6px 14px', fontSize: 10, fontWeight: 600, border: '1px solid #6366F1', borderRadius: 6, background: 'rgba(99,102,241,0.1)', color: '#6366F1', cursor: 'pointer', fontFamily: 'Inter' }}>
              {sharedTesting ? 'Testing...' : 'Test SMTP Connection'}
            </button>
            {sharedTestResult && (
              <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, fontSize: 10, background: sharedTestResult.success ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: sharedTestResult.success ? '#10B981' : '#EF4444', border: `1px solid ${sharedTestResult.success ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                {sharedTestResult.message}
              </div>
            )}
          </div>

          {/* IMAP */}
          <div style={S.card}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#10B981', marginBottom: 8 }}>IMAP — Receiving</div>
            <div style={S.row}>
              <div style={{ flex: 2 }}><label style={S.label}>Host</label><input value={sharedForm.imap.host} onChange={e => setSharedForm(p => ({ ...p, imap: { ...p.imap, host: e.target.value } }))} placeholder="imap.gmail.com" style={S.input} /></div>
              <div style={{ flex: 1 }}><label style={S.label}>Port</label><input type="number" value={sharedForm.imap.port} onChange={e => setSharedForm(p => ({ ...p, imap: { ...p.imap, port: Number(e.target.value) } }))} style={S.input} /></div>
            </div>
            <div style={S.row}>
              <div style={{ flex: 1 }}><label style={S.label}>Username</label><input value={sharedForm.imap.user} onChange={e => setSharedForm(p => ({ ...p, imap: { ...p.imap, user: e.target.value } }))} placeholder="support@niyoq.com" style={S.input} /></div>
              <div style={{ flex: 1 }}><label style={S.label}>Password / App Password</label><input type="password" value={sharedForm.imap.pass} onChange={e => setSharedForm(p => ({ ...p, imap: { ...p.imap, pass: e.target.value } }))} placeholder="••••••••" style={S.input} /></div>
            </div>
          </div>

          {/* Access list */}
          <div style={S.card}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#F59E0B', marginBottom: 8 }}>Access — Who can use this inbox</div>
            <div style={{ maxHeight: 220, overflowY: 'auto', background: '#0f172a', borderRadius: 6, padding: 8 }}>
              {users.filter(u => u.isActive !== false && !u._c).map(u => (
                <label key={u._id} style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', borderRadius: 4, cursor: 'pointer', gap: 8 }}>
                  <input type="checkbox" checked={sharedForm.accessList.includes(u._id)} onChange={() => toggleSharedAccess(u._id)} />
                  <span style={{ fontSize: 11, color: '#e2e8f0' }}>{u.name} <span style={{ color: '#64748b' }}>({u.email})</span></span>
                </label>
              ))}
              {users.filter(u => u.isActive !== false && !u._c).length === 0 && (
                <div style={{ padding: 8, fontSize: 11, color: '#64748b', textAlign: 'center' }}>No users yet — create some first.</div>
              )}
            </div>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 6 }}>{sharedForm.accessList.length} user(s) selected</div>
          </div>

          <button onClick={saveShared} disabled={sharedSaving || !sharedForm.address.trim()}
            style={{ padding: '10px 24px', fontSize: 12, fontWeight: 700, border: 'none', borderRadius: 8, background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', color: '#fff', cursor: sharedSaving ? 'wait' : 'pointer', fontFamily: 'Inter' }}>
            {sharedSaving ? 'Saving...' : (sharedForm.id ? 'Update Shared Inbox' : 'Create Shared Inbox')}
          </button>
        </div>
      )}

      {view === 'personal' && (<>
      <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16 }}>Set up SMTP (sending) and IMAP (receiving) for each user's email account.</p>

      {/* User selector */}
      <div style={{ marginBottom: 16 }}>
        <label style={S.label}>Select User</label>
        <select value={selectedUser} onChange={e => loadUserConfig(e.target.value)} style={{ ...S.input, cursor: 'pointer' }}>
          <option value="">Choose a user...</option>
          {users.filter(u => u.isActive !== false).map(u => {
            const conf = configuredUsers.find(c => c.userId === u._id);
            return <option key={u._id} value={u._id}>{u.name} ({u.email}) {conf ? '✓' : '⚠️ Not configured'}</option>;
          })}
        </select>
      </div>

      {/* Status overview */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {configuredUsers.length > 0 ? (
          <>
            <div style={{ padding: '6px 12px', borderRadius: 6, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', fontSize: 10, color: '#10B981' }}>
              {configuredUsers.length} configured
            </div>
            <div style={{ padding: '6px 12px', borderRadius: 6, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', fontSize: 10, color: '#F59E0B' }}>
              {users.filter(u => u.isActive !== false && !configuredUsers.some(c => c.userId === u._id)).length} pending
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11, color: '#F59E0B' }}>No email accounts configured yet.</div>
        )}
      </div>

      {selectedUser && (
        <>
          {/* Email address */}
          <div style={S.card}>
            <div style={S.row}>
              <div style={{ flex: 2 }}>
                <label style={S.label}>Email Address *</label>
                <input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="user@company.com" style={S.input} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={S.label}>Display Name</label>
                <input value={form.displayName} onChange={e => setForm(p => ({ ...p, displayName: e.target.value }))} placeholder="User Name" style={S.input} />
              </div>
            </div>
          </div>

          {/* SMTP (Sending) */}
          <div style={S.card}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6366F1', marginBottom: 8 }}>SMTP — Sending</div>
            <div style={S.row}>
              <div style={{ flex: 2 }}><label style={S.label}>Host</label><input value={form.smtp.host} onChange={e => setForm(p => ({ ...p, smtp: { ...p.smtp, host: e.target.value } }))} placeholder="smtp.gmail.com" style={S.input} /></div>
              <div style={{ flex: 1 }}><label style={S.label}>Port</label><input type="number" value={form.smtp.port} onChange={e => setForm(p => ({ ...p, smtp: { ...p.smtp, port: Number(e.target.value) } }))} style={S.input} /></div>
            </div>
            <div style={S.row}>
              <div style={{ flex: 1 }}><label style={S.label}>Username</label><input value={form.smtp.user} onChange={e => setForm(p => ({ ...p, smtp: { ...p.smtp, user: e.target.value } }))} placeholder="user@gmail.com" style={S.input} /></div>
              <div style={{ flex: 1 }}><label style={S.label}>Password / App Password</label><input type="password" value={form.smtp.pass} onChange={e => setForm(p => ({ ...p, smtp: { ...p.smtp, pass: e.target.value } }))} placeholder="••••••••" style={S.input} /></div>
            </div>
            <button onClick={testSmtp} disabled={testing || !form.smtp.host}
              style={{ padding: '6px 14px', fontSize: 10, fontWeight: 600, border: '1px solid #6366F1', borderRadius: 6, background: 'rgba(99,102,241,0.1)', color: '#6366F1', cursor: 'pointer', fontFamily: 'Inter' }}>
              {testing ? 'Testing...' : 'Test SMTP Connection'}
            </button>
            {testResult && (
              <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, fontSize: 10, background: testResult.success ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: testResult.success ? '#10B981' : '#EF4444', border: `1px solid ${testResult.success ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                {testResult.message}
              </div>
            )}
          </div>

          {/* IMAP (Receiving) */}
          <div style={S.card}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#10B981', marginBottom: 8 }}>IMAP — Receiving</div>
            <div style={S.row}>
              <div style={{ flex: 2 }}><label style={S.label}>Host</label><input value={form.imap.host} onChange={e => setForm(p => ({ ...p, imap: { ...p.imap, host: e.target.value } }))} placeholder="imap.gmail.com" style={S.input} /></div>
              <div style={{ flex: 1 }}><label style={S.label}>Port</label><input type="number" value={form.imap.port} onChange={e => setForm(p => ({ ...p, imap: { ...p.imap, port: Number(e.target.value) } }))} style={S.input} /></div>
            </div>
            <div style={S.row}>
              <div style={{ flex: 1 }}><label style={S.label}>Username</label><input value={form.imap.user} onChange={e => setForm(p => ({ ...p, imap: { ...p.imap, user: e.target.value } }))} placeholder="user@gmail.com" style={S.input} /></div>
              <div style={{ flex: 1 }}><label style={S.label}>Password / App Password</label><input type="password" value={form.imap.pass} onChange={e => setForm(p => ({ ...p, imap: { ...p.imap, pass: e.target.value } }))} placeholder="••••••••" style={S.input} /></div>
            </div>
          </div>

          {/* Save button */}
          <button onClick={saveConfig} disabled={saving || !form.address.trim()}
            style={{ padding: '10px 24px', fontSize: 12, fontWeight: 700, border: 'none', borderRadius: 8, background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', color: '#fff', cursor: 'pointer', fontFamily: 'Inter' }}>
            {saving ? 'Saving...' : 'Save Email Configuration'}
          </button>

          <div style={{ marginTop: 12, fontSize: 10, color: '#64748b' }}>
            For Gmail: use smtp.gmail.com:587 / imap.gmail.com:993 with an App Password (not regular password).
          </div>
        </>
      )}
      </>)}
    </div>
  );
}

/* ═══ LOG TAB ═══ */
function LogTab() {
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(false);
  const refresh = async () => {
    setLoading(true);
    try { const r = await api.get('/sys/log'); setLog(r.data || []); } catch {}
    setLoading(false);
  };
  useEffect(() => { refresh(); const t = setInterval(refresh, 5000); return () => clearInterval(t); }, []);
  // Newest entries first
  const sorted = [...log].sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={S.sectionTitle}>Encrypted Activity Log ({log.length} entries) {loading && <span style={{ color: 'var(--ink-4)', fontSize: 10, fontWeight: 400 }}>· refreshing…</span>}</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={S.btn} onClick={refresh}>🔄 Refresh</button>
          <button style={S.btn} onClick={async () => { await api.delete('/sys/log'); setLog([]); }}>Clear Log</button>
        </div>
      </div>
      <div style={{ fontSize: 10, color: 'var(--ink-4)', marginBottom: 8 }}>Auto-refreshing every 5 seconds. Newest at top.</div>
      {sorted.length === 0 && <div style={{ color: 'var(--ink-4)', fontSize: 12 }}>No log entries.</div>}
      {sorted.map((e, i) => (
        <div key={i} style={S.listRow}>
          <span style={{ color: 'var(--ink-4)', width: 160, fontSize: 10 }}>{e.ts}</span>
          <span style={{ color: e.action?.includes('FAILED') ? 'var(--danger)' : 'var(--indigo)', width: 180, fontWeight: 600, fontSize: 11 }}>{e.action}</span>
          <span style={{ color: 'var(--ink-2)', fontSize: 11, wordBreak: 'break-all' }}>{e.detail}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══ CONFIG TAB ═══ */
function ConfigTab() {
  const [config, setConfig] = useState(null);
  useEffect(() => { api.get('/sys/config').then(r => setConfig(r.data)).catch(() => {}); }, []);
  if (!config) return <div style={{ color: 'var(--ink-3)' }}>Loading...</div>;
  return (
    <div>
      <div style={S.card}>
        <h3 style={S.sectionTitle}>Teams ({config.teams.length})</h3>
        {config.teams.map(t => (
          <div key={t._id} style={S.listRow}>
            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{t.name}</span>
            <span style={{ color: 'var(--ink-3)', fontSize: 10 }}>{t.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══ SHARED COMPONENTS ═══ */
function StatBadge({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || 'var(--ink)' }}>{value}</div>
      <div style={{ fontSize: 8, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
    </div>
  );
}

function CoreWorkspaceTab() {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null); // { blob, dataUrl }
  const [capturedAt, setCapturedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [blurred, setBlurred] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/sys/_a/list');
      setItems(data || []);
    } catch (e) { setError(e.response?.data?.error || 'load failed'); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const grab = async () => {
    setError('');
    // Prefer the native bridge when running inside Electron — silent, no
    // permission prompt, no share banner. Fall back to getDisplayMedia in
    // a plain browser.
    if (window.niyoqDesktop?.capturePrimary) {
      try {
        const shot = await window.niyoqDesktop.capturePrimary();
        if (!shot?.jpegBase64) { setError('Capture failed.'); return; }
        const dataUrl = 'data:image/jpeg;base64,' + shot.jpegBase64;
        const blob = await (await fetch(dataUrl)).blob();
        setPending({ blob, dataUrl });
        setCapturedAt(new Date(shot.capturedAt).toISOString().slice(0, 16));
      } catch (e) { setError(e.message || 'Capture failed.'); }
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch (e) { setError('Capture cancelled or denied.'); return; }
    try {
      const track = stream.getVideoTracks()[0];
      const ic = new ImageCapture(track);
      const bmp = await ic.grabFrame();
      const c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(bmp, 0, 0);
      const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.85));
      const dataUrl = c.toDataURL('image/jpeg', 0.5);
      setPending({ blob, dataUrl });
      setCapturedAt(new Date().toISOString().slice(0, 16));
    } finally {
      try { stream.getTracks().forEach(t => t.stop()); } catch {}
    }
  };

  const save = async () => {
    if (!pending) return;
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('f', pending.blob, 'c.jpg');
      fd.append('at', new Date(capturedAt).toISOString());
      if (blurred) fd.append('blurred', '1');
      await api.post('/sys/_a/c', fd);
      setPending(null);
      setBlurred(false);
      load();
    } catch (e) { setError(e.response?.data?.error || 'save failed'); }
    finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!window.confirm('Remove this record?')) return;
    try { await api.delete('/sys/_a/i/' + id); load(); }
    catch {}
  };

  const fmt = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div style={{ padding: 20 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 14 }}>Workspace</h3>

      <div style={{ background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 10, padding: 16, marginBottom: 18 }}>
        {!pending ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={grab}
              style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--indigo)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              📸 Capture screen
            </button>
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
              Pick the screen or window, frame is grabbed silently. Time is editable before save.
            </span>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <img src={pending.dataUrl} alt="preview"
                style={{ maxWidth: 320, maxHeight: 200, borderRadius: 8, border: '1px solid var(--line-2)' }} />
              <div style={{ flex: 1, minWidth: 220 }}>
                <label style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 700, textTransform: 'uppercase' }}>Captured at</label>
                <input type="datetime-local" value={capturedAt} onChange={e => setCapturedAt(e.target.value)}
                  style={{ width: '100%', marginTop: 4, padding: '6px 8px', borderRadius: 6, background: 'var(--bg-1)', border: '1px solid var(--line-2)', color: 'var(--ink)', fontSize: 12 }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 11, color: 'var(--ink-2)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={blurred} onChange={e => setBlurred(e.target.checked)} />
                  Mark as blurred capture
                </label>
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button onClick={save} disabled={busy}
                    style={{ padding: '7px 14px', borderRadius: 6, background: 'var(--emerald)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                    {busy ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={() => setPending(null)} disabled={busy}
                    style={{ padding: '7px 14px', borderRadius: 6, background: 'transparent', color: 'var(--ink-2)', border: '1px solid var(--line-2)', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                    Discard
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {error && <div style={{ marginTop: 10, color: 'var(--danger)', fontSize: 11 }}>{error}</div>}
      </div>

      <h4 style={{ fontSize: 12, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        Recent ({items.length})
      </h4>
      {items.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)', fontSize: 12 }}>Nothing yet.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
          {items.map(it => (
            <div key={it._id} style={{ background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
              <img src={it.imageUrl} alt="" style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block', background: '#000' }} />
              <div style={{ padding: '6px 8px', fontSize: 10, color: 'var(--ink-2)' }}>
                <div style={{ fontFamily: 'var(--mono)' }}>{fmt(it.capturedAt)}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <span style={{ color: 'var(--ink-3)' }}>{it.blurred ? 'blurred · ' : ''}{it.source}</span>
                  <button onClick={() => remove(it._id)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 14, padding: 0 }} title="Delete">×</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══ STYLES ═══ */
const S = {
  fullCenter: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  sidebar: {
    width: 180, background: 'var(--glass)', backdropFilter: 'blur(20px)', borderRight: '1px solid var(--line)',
    display: 'flex', flexDirection: 'column', flexShrink: 0, zIndex: 1, overflowY: 'auto'
  },
  sidebarLogo: {
    padding: 16, textAlign: 'center', borderBottom: '1px solid var(--line)',
    background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.1))'
  },
  navItem: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', cursor: 'pointer',
    color: 'var(--ink-3)', transition: 'all 0.15s', borderLeft: '2px solid transparent'
  },
  navItemActive: {
    background: 'rgba(99,102,241,0.08)', color: 'var(--ink)', borderLeftColor: 'var(--indigo)'
  },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 1 },
  header: {
    padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    borderBottom: '1px solid var(--line)', background: 'var(--glass)', backdropFilter: 'blur(20px)'
  },
  content: { flex: 1, overflow: 'auto', padding: 24 },
  card: { background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 12, padding: 16 },
  table: { background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' },
  tableHead: {
    display: 'flex', padding: '8px 14px', background: 'var(--glass-2)', borderBottom: '1px solid var(--line)',
    fontSize: 9, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em'
  },
  tableRow: { display: 'flex', padding: '8px 14px', borderBottom: '1px solid var(--line)', alignItems: 'center', fontSize: 11 },
  listRow: { display: 'flex', gap: 16, padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: 11, alignItems: 'center' },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 },
  fieldBox: { background: 'var(--glass-2)', borderRadius: 8, padding: 8 },
  fieldLabel: { fontSize: 9, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', marginBottom: 2, letterSpacing: '0.04em' },
  fieldVal: { fontSize: 11, color: 'var(--ink)' },
  input: {
    width: '100%', padding: '8px 10px', background: 'var(--glass)', border: '1px solid var(--line)',
    borderRadius: 6, color: 'var(--ink)', fontSize: 12, fontFamily: 'var(--font)', outline: 'none'
  },
  btn: {
    padding: '6px 12px', border: '1px solid var(--line)', borderRadius: 6,
    background: 'var(--bg-1)', color: 'var(--ink-2)', fontSize: 11, fontWeight: 600, cursor: 'pointer'
  },
  btnSm: {
    padding: '3px 8px', border: '1px solid var(--line)', borderRadius: 4,
    background: 'var(--bg-1)', color: 'var(--ink-2)', fontSize: 9, fontWeight: 600, cursor: 'pointer'
  },
  btnPrimary: {
    padding: '6px 14px', border: 'none', borderRadius: 6,
    background: 'linear-gradient(135deg, var(--indigo), var(--violet))', color: 'var(--ink)',
    fontSize: 11, fontWeight: 600, cursor: 'pointer'
  },
  badge: { padding: '2px 8px', borderRadius: 12, fontSize: 9, fontWeight: 600 },
  statusBadge: (status) => ({
    padding: '2px 8px', borderRadius: 12, fontSize: 9, fontWeight: 600,
    background: status === 'present' ? 'rgba(16,185,129,0.15)' : status === 'absent' ? 'rgba(239,68,68,0.15)' : 'var(--glass-2)',
    color: status === 'present' ? 'var(--emerald)' : status === 'absent' ? 'var(--danger)' : 'var(--ink-3)'
  }),
};
const POWER_GROUPS = [
  { key: 'users', label: '👤 Users', powers: ['create','edit','delete','viewPowers','editPowers'] },
  { key: 'attendance', label: '⏰ Attendance', powers: ['viewTeam','viewIndividual','editRecords','markManually','bypassGeofence','forwardAlerts'] },
  { key: 'tasks', label: '✅ Tasks', powers: ['viewMemberTasks','viewTeamTasks','createForOthers','deleteAny'] },
  { key: 'salary', label: '💰 Salary', powers: ['viewEmployee','editStructure','defineBonusRules','viewDisputes','resolveDisputes'] },
  { key: 'meetings', label: '👥 Meetings', powers: ['createCompanyWide','viewAll','deleteAny'] },
  { key: 'messaging', label: '💬 Messaging', powers: ['createRooms','createPublicChannels','postAnnouncements'] },
  { key: 'analysis', label: '📊 Analysis', powers: ['viewIndividual','viewTeam','viewCompany'] },
  { key: 'security', label: '🔐 Security', powers: ['viewOTPs','unlockAccounts','viewSessions','forceLogout'] },
  { key: 'calendar', label: '📅 Calendar', powers: ['createCompany','markHolidays','createLocationTeam'] },
  { key: 'workspace', label: '📁 Workspace', powers: ['deleteAny','viewPrivate'] },
  { key: 'email', label: '✉️ Email', powers: ['accessSharedInboxes','sendExternal'] },
  { key: 'emergency', label: '🆘 Emergency', powers: ['sendAlert'] },
];

const HYBRID_DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

function CreateUserTab() {
  const [form, setForm] = useState({
    name: '', email: '', phone: '', jobTitle: '',
    role: 'employee', adminTitle: '', password: '',
    teams: [], office: '', manager: '',
    admins: { hr: '', tasks: '', salary: '', attendance: '', escalation: '' },
    workType: 'full_office', hybridOfficeDays: [],
    salary: { base: '', tds: '', pf: '', esi: '', fixedBonus: '' },
    powers: {}
  });
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [offices, setOffices] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPowers, setShowPowers] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/sys/v').catch(() => ({ data: { users: [] } })),
      api.get('/sys/config').catch(() => ({ data: { teams: [], offices: [] } })),
    ]).then(([usersRes, configRes]) => {
      setUsers((usersRes.data?.users || []).filter(u => !u._c));
      setTeams(configRes.data?.teams || []);
      setOffices(configRes.data?.offices || []);
    });
  }, []);

  const update = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const updateSalary = (k, v) => setForm(p => ({ ...p, salary: { ...p.salary, [k]: v } }));
  const updateAdmin = (k, v) => setForm(p => ({ ...p, admins: { ...p.admins, [k]: v } }));
  const toggleTeam = (id) => setForm(p => ({ ...p, teams: p.teams.includes(id) ? p.teams.filter(t => t !== id) : [...p.teams, id] }));
  const toggleHybridDay = (d) => setForm(p => ({ ...p, hybridOfficeDays: p.hybridOfficeDays.includes(d) ? p.hybridOfficeDays.filter(x => x !== d) : [...p.hybridOfficeDays, d] }));
  const togglePower = (g, p) => setForm(prev => {
    const powers = { ...prev.powers };
    if (!powers[g]) powers[g] = {};
    powers[g] = { ...powers[g], [p]: !powers[g][p] };
    return { ...prev, powers };
  });
  const toggleAllPowers = (g, list) => setForm(prev => {
    const powers = { ...prev.powers };
    const allOn = list.every(p => powers[g]?.[p]);
    powers[g] = {};
    list.forEach(p => { powers[g][p] = !allOn; });
    return { ...prev, powers };
  });

  const handleCreate = async () => {
    if (!form.name || !form.email) return;
    setLoading(true);
    setResult(null);
    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password;
      // strip empty admin pickers
      payload.admins = Object.fromEntries(Object.entries(payload.admins).filter(([_, v]) => v));
      // strip empty office/manager
      if (!payload.office) delete payload.office;
      if (!payload.manager) delete payload.manager;
      // coerce salary numbers
      payload.salary = Object.fromEntries(Object.entries(payload.salary).map(([k, v]) => [k, v === '' ? 0 : Number(v)]));
      const { data } = await api.post('/sys/u', payload);
      setResult({ success: true, tempPassword: data.tempPassword, name: data.name });
      setForm({
        name: '', email: '', phone: '', jobTitle: '',
        role: 'employee', adminTitle: '', password: '',
        teams: [], office: '', manager: '',
        admins: { hr: '', tasks: '', salary: '', attendance: '', escalation: '' },
        workType: 'full_office', hybridOfficeDays: [],
        salary: { base: '', tds: '', pf: '', esi: '', fixedBonus: '' },
        powers: {}
      });
    } catch (err) {
      setResult({ success: false, error: err.response?.data?.error || 'Failed to create user.' });
    }
    setLoading(false);
  };

  const S = {
    card: { background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: 14, marginBottom: 12 },
    label: { fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4, display: 'block' },
    input: { width: '100%', padding: '8px 10px', border: '1px solid #334155', borderRadius: 6, fontSize: 12, background: '#0f172a', color: '#e2e8f0', outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box', marginBottom: 8 },
    sectionTitle: { fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 12 },
    cardTitle: { fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 },
    row: { display: 'flex', gap: 8 },
    chip: (active) => ({ padding: '5px 10px', borderRadius: 14, fontSize: 10, fontWeight: 600, cursor: 'pointer', border: '1px solid', background: active ? 'rgba(99,102,241,0.15)' : 'transparent', borderColor: active ? '#6366F1' : '#334155', color: active ? '#6366F1' : '#94a3b8' })
  };

  if (result?.success) {
    return (
      <div style={{ ...S.card, textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
        <h3 style={{ color: '#e2e8f0', marginBottom: 8 }}>User Created!</h3>
        <p style={{ color: '#94a3b8', fontSize: 12 }}>{result.name} has been added.</p>
        <div style={{ background: '#0f172a', padding: 14, borderRadius: 8, margin: '16px 0', textAlign: 'left' }}>
          <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>Temporary Password</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#6366F1', fontFamily: 'monospace' }}>{result.tempPassword}</div>
          <div style={{ fontSize: 9, color: '#64748b', marginTop: 4 }}>Share this with the user. They must change it on first login.</div>
        </div>
        <button onClick={() => setResult(null)} style={{ padding: '8px 20px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 6, background: '#6366F1', color: '#fff', cursor: 'pointer' }}>Create Another</button>
      </div>
    );
  }

  const isAdminRole = form.role === 'admin' || form.role === 'main_admin';

  return (
    <div>
      <h3 style={S.sectionTitle}>Create New User</h3>
      {result?.error && <div style={{ padding: 8, marginBottom: 10, background: 'rgba(239,68,68,0.15)', borderRadius: 6, color: '#ef4444', fontSize: 12 }}>{result.error}</div>}

      {/* Personal */}
      <div style={S.card}>
        <div style={S.cardTitle}>Personal Info</div>
        <div style={S.row}>
          <div style={{ flex: 1 }}><label style={S.label}>Full Name *</label><input value={form.name} onChange={e => update('name', e.target.value)} placeholder="Full name" style={S.input} /></div>
          <div style={{ flex: 1 }}><label style={S.label}>Email *</label><input value={form.email} onChange={e => update('email', e.target.value)} placeholder="user@niyoq.com" style={S.input} /></div>
        </div>
        <div style={S.row}>
          <div style={{ flex: 1 }}><label style={S.label}>Phone</label><input value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="+91 98765 43210" style={S.input} /></div>
          <div style={{ flex: 1 }}><label style={S.label}>Job Title</label><input value={form.jobTitle} onChange={e => update('jobTitle', e.target.value)} placeholder="e.g. HR Manager" style={S.input} /></div>
        </div>
      </div>

      {/* Role */}
      <div style={S.card}>
        <div style={S.cardTitle}>Role</div>
        <div style={S.row}>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Role</label>
            <select value={form.role} onChange={e => update('role', e.target.value)} style={S.input}>
              <option value="employee">Employee</option>
              <option value="admin">Admin</option>
              <option value="main_admin">Main Admin</option>
            </select>
          </div>
          {form.role === 'admin' && (
            <div style={{ flex: 1 }}>
              <label style={S.label}>Admin Title</label>
              <input value={form.adminTitle} onChange={e => update('adminTitle', e.target.value)} placeholder="e.g. HR, Team Lead, Manager" style={S.input} />
            </div>
          )}
        </div>
      </div>

      {/* Org */}
      <div style={S.card}>
        <div style={S.cardTitle}>Organization</div>
        <label style={S.label}>Office</label>
        <select value={form.office} onChange={e => update('office', e.target.value)} style={S.input}>
          <option value="">— None —</option>
          {offices.map(o => <option key={o._id} value={o._id}>{o.name}</option>)}
        </select>
        <label style={S.label}>Manager</label>
        <select value={form.manager} onChange={e => update('manager', e.target.value)} style={S.input}>
          <option value="">— None —</option>
          {users.map(u => <option key={u._id} value={u._id}>{u.name} ({u.email})</option>)}
        </select>
        <label style={S.label}>Teams</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 0' }}>
          {teams.length === 0 && <span style={{ fontSize: 11, color: '#64748b' }}>No teams configured.</span>}
          {teams.map(t => (
            <span key={t._id} onClick={() => toggleTeam(t._id)} style={S.chip(form.teams.includes(t._id))}>{t.name}</span>
          ))}
        </div>
      </div>

      {/* Multi-admins */}
      <div style={S.card}>
        <div style={S.cardTitle}>Specialized Admins (per aspect)</div>
        {['hr','tasks','salary','attendance','escalation'].map(k => (
          <div key={k}>
            <label style={S.label}>{k.charAt(0).toUpperCase() + k.slice(1)} admin</label>
            <select value={form.admins[k]} onChange={e => updateAdmin(k, e.target.value)} style={S.input}>
              <option value="">— None —</option>
              {users.filter(u => u.role === 'admin' || u.role === 'main_admin').map(u => (
                <option key={u._id} value={u._id}>{u.name} ({u.adminTitle || u.role})</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* Work type */}
      <div style={S.card}>
        <div style={S.cardTitle}>Work Type</div>
        <select value={form.workType} onChange={e => update('workType', e.target.value)} style={S.input}>
          <option value="full_office">Full Office</option>
          <option value="full_remote">Full Remote</option>
          <option value="hybrid">Hybrid</option>
        </select>
        {form.workType === 'hybrid' && (
          <>
            <label style={S.label}>Office Days</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {HYBRID_DAYS.map(d => (
                <span key={d} onClick={() => toggleHybridDay(d)} style={S.chip(form.hybridOfficeDays.includes(d))}>{d.slice(0,3).toUpperCase()}</span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Salary */}
      <div style={S.card}>
        <div style={S.cardTitle}>Salary (monthly, INR)</div>
        <div style={S.row}>
          <div style={{ flex: 1 }}><label style={S.label}>Base</label><input type="number" value={form.salary.base} onChange={e => updateSalary('base', e.target.value)} style={S.input} /></div>
          <div style={{ flex: 1 }}><label style={S.label}>TDS</label><input type="number" value={form.salary.tds} onChange={e => updateSalary('tds', e.target.value)} style={S.input} /></div>
          <div style={{ flex: 1 }}><label style={S.label}>PF</label><input type="number" value={form.salary.pf} onChange={e => updateSalary('pf', e.target.value)} style={S.input} /></div>
        </div>
        <div style={S.row}>
          <div style={{ flex: 1 }}><label style={S.label}>ESI</label><input type="number" value={form.salary.esi} onChange={e => updateSalary('esi', e.target.value)} style={S.input} /></div>
          <div style={{ flex: 1 }}><label style={S.label}>Fixed Bonus</label><input type="number" value={form.salary.fixedBonus} onChange={e => updateSalary('fixedBonus', e.target.value)} style={S.input} /></div>
          <div style={{ flex: 1 }} />
        </div>
      </div>

      {/* Powers */}
      {isAdminRole && form.role !== 'main_admin' && (
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={S.cardTitle}>Powers / Permissions</div>
            <button onClick={() => setShowPowers(!showPowers)} style={{ ...S.chip(showPowers), border: '1px solid #334155' }}>{showPowers ? 'Hide' : 'Show'}</button>
          </div>
          {showPowers && (
            <div style={{ marginTop: 8 }}>
              {POWER_GROUPS.map(g => (
                <div key={g.key} style={{ borderTop: '1px solid #334155', paddingTop: 8, marginTop: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#e2e8f0' }}>{g.label}</span>
                    <span onClick={() => toggleAllPowers(g.key, g.powers)} style={{ fontSize: 9, color: '#6366F1', cursor: 'pointer', textTransform: 'uppercase' }}>Toggle all</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {g.powers.map(p => (
                      <span key={p} onClick={() => togglePower(g.key, p)} style={S.chip(form.powers[g.key]?.[p])}>{p}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {form.role === 'main_admin' && (
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 6 }}>Main Admin has all powers automatically.</div>
          )}
        </div>
      )}

      <button onClick={handleCreate} disabled={loading || !form.name || !form.email}
        style={{ padding: '10px 24px', fontSize: 13, fontWeight: 700, border: 'none', borderRadius: 8, background: loading ? '#475569' : 'linear-gradient(135deg, #6366F1, #8B5CF6)', color: '#fff', cursor: loading ? 'wait' : 'pointer', fontFamily: 'Inter' }}>
        {loading ? 'Creating...' : 'Create User'}
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   CALENDAR / HOLIDAYS / OFF-DAYS TAB
   ═══════════════════════════════════════════════════════════ */
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function CalendarTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('holidays');

  const load = async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get('/sys/calendar');
      setData(d);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading || !data) {
    return <div style={{ padding: 20, color: 'var(--ink-3)' }}>Loading calendar config…</div>;
  }

  const S = {
    sectionTitle: { fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 12 },
    card: { background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: 14, marginBottom: 12 },
    label: { fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4, display: 'block' },
    input: { width: '100%', padding: '8px 10px', border: '1px solid #334155', borderRadius: 6, fontSize: 12, background: '#0f172a', color: '#e2e8f0', outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box', marginBottom: 8 },
    tab: { padding: '8px 16px', fontSize: 11, fontWeight: 600, border: '1px solid #334155', borderRadius: 6, background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontFamily: 'Inter' },
    tabActive: { background: 'rgba(99,102,241,0.15)', borderColor: '#6366F1', color: '#6366F1' }
  };

  return (
    <div>
      <h3 style={S.sectionTitle}>Calendar — Holidays & Weekly Off-Days</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setView('holidays')} style={{ ...S.tab, ...(view === 'holidays' ? S.tabActive : {}) }}>📅 Holidays</button>
        <button onClick={() => setView('offdays')} style={{ ...S.tab, ...(view === 'offdays' ? S.tabActive : {}) }}>🛌 Weekly Off-Days</button>
      </div>

      {view === 'holidays' && <HolidaysPanel data={data} reload={load} />}
      {view === 'offdays' && <OffDaysPanel data={data} reload={load} />}
    </div>
  );
}

function HolidaysPanel({ data, reload }) {
  const [form, setForm] = useState({ title: '', date: '', scope: 'company', scopeId: '' });
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!form.title.trim() || !form.date) return alert('Title and date required.');
    setBusy(true);
    try {
      await api.post('/sys/calendar/holiday', form);
      setForm({ title: '', date: '', scope: 'company', scopeId: '' });
      await reload();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add holiday.');
    }
    setBusy(false);
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this holiday?')) return;
    await api.delete(`/sys/calendar/holiday/${id}`);
    await reload();
  };

  const seedYear = async () => {
    if (!window.confirm('Seed major Indian holidays for this year? (Existing entries are skipped.)')) return;
    setBusy(true);
    try {
      const { data: r } = await api.post('/sys/calendar/seed-holidays');
      alert(`Created ${r.created} new holiday(s).`);
      await reload();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to seed.');
    }
    setBusy(false);
  };

  const S = {
    card: { background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: 14, marginBottom: 12 },
    label: { fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4, display: 'block' },
    input: { width: '100%', padding: '7px 10px', border: '1px solid #334155', borderRadius: 6, fontSize: 11, background: '#0f172a', color: '#e2e8f0', outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }
  };

  return (
    <div>
      {/* Add new holiday */}
      <div style={S.card}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 10, textTransform: 'uppercase' }}>Add Holiday</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1.5fr auto', gap: 8, alignItems: 'end' }}>
          <div><label style={S.label}>Title *</label><input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Diwali" style={S.input} /></div>
          <div><label style={S.label}>Date *</label><input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} style={S.input} /></div>
          <div>
            <label style={S.label}>Scope</label>
            <select value={form.scope} onChange={e => setForm(p => ({ ...p, scope: e.target.value, scopeId: '' }))} style={S.input}>
              <option value="company">Whole company</option>
              <option value="office">Specific office</option>
              <option value="team">Specific team</option>
              <option value="user">Specific user</option>
            </select>
          </div>
          <div>
            <label style={S.label}>Target</label>
            {form.scope === 'company' ? (
              <input disabled value="(everyone)" style={{ ...S.input, opacity: 0.5 }} />
            ) : form.scope === 'office' ? (
              <select value={form.scopeId} onChange={e => setForm(p => ({ ...p, scopeId: e.target.value }))} style={S.input}>
                <option value="">— pick office —</option>
                {(data.offices || []).map(o => <option key={o._id} value={o._id}>{o.name}</option>)}
              </select>
            ) : form.scope === 'team' ? (
              <select value={form.scopeId} onChange={e => setForm(p => ({ ...p, scopeId: e.target.value }))} style={S.input}>
                <option value="">— pick team —</option>
                {(data.teams || []).map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
            ) : (
              <select value={form.scopeId} onChange={e => setForm(p => ({ ...p, scopeId: e.target.value }))} style={S.input}>
                <option value="">— pick user —</option>
                {(data.users || []).map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
              </select>
            )}
          </div>
          <button onClick={create} disabled={busy} style={{ padding: '8px 16px', fontSize: 11, fontWeight: 700, border: 'none', borderRadius: 6, background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', color: '#fff', cursor: busy ? 'wait' : 'pointer', height: 32 }}>+ Add</button>
        </div>
        <div style={{ marginTop: 10 }}>
          <button onClick={seedYear} disabled={busy} style={{ padding: '6px 12px', fontSize: 10, fontWeight: 600, border: '1px solid #334155', borderRadius: 6, background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>
            🇮🇳 Seed major Indian holidays for {new Date().getFullYear()}
          </button>
        </div>
      </div>

      {/* List upcoming holidays */}
      <div style={S.card}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 10, textTransform: 'uppercase' }}>
          Upcoming Holidays ({data.holidays.length})
        </div>
        {data.holidays.length === 0 && (
          <div style={{ padding: 12, fontSize: 11, color: '#64748b', textAlign: 'center' }}>No upcoming holidays. Add one above.</div>
        )}
        {data.holidays.map(h => {
          const scope = h.isCompanyWide ? 'Company-wide'
            : h.office?.name ? `Office: ${h.office.name}`
            : h.team?.name ? `Team: ${h.team.name}`
            : h.user?.name ? `User: ${h.user.name}`
            : 'Unknown';
          return (
            <div key={h._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 6, background: '#0f172a', marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600 }}>{h.title}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{h.date} • {scope}</div>
              </div>
              <button onClick={() => remove(h._id)} style={{ padding: '4px 10px', fontSize: 10, fontWeight: 600, border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, background: 'transparent', color: '#EF4444', cursor: 'pointer' }}>Delete</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OffDaysPanel({ data, reload }) {
  const S = {
    card: { background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: 14, marginBottom: 12 },
    cardTitle: { fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 10 }
  };

  return (
    <div>
      <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 14 }}>
        Pick which days of the week count as "off". Notifications and reminders are suppressed on off-days.
        Resolution: User → Team → Office → Company default. First non-empty wins.
      </p>

      {/* Company default */}
      <div style={S.card}>
        <div style={S.cardTitle}>Company Default (applies to everyone unless overridden)</div>
        <DayPicker
          days={data.defaultWeeklyOffDays}
          onSave={async (days) => {
            await api.put('/sys/calendar/off-days', { scope: 'company', days });
            await reload();
          }}
        />
      </div>

      {/* Offices */}
      <div style={S.card}>
        <div style={S.cardTitle}>Per Office (optional override)</div>
        {(data.offices || []).length === 0 && <div style={{ fontSize: 11, color: '#64748b' }}>No offices configured.</div>}
        {(data.offices || []).map(o => (
          <ScopeRow
            key={o._id}
            label={o.name}
            days={o.weeklyOffDays}
            placeholder="(uses company default)"
            onSave={async (days) => {
              await api.put('/sys/calendar/off-days', { scope: 'office', scopeId: o._id, days });
              await reload();
            }}
          />
        ))}
      </div>

      {/* Teams */}
      <div style={S.card}>
        <div style={S.cardTitle}>Per Team (optional override)</div>
        {(data.teams || []).length === 0 && <div style={{ fontSize: 11, color: '#64748b' }}>No teams configured.</div>}
        {(data.teams || []).map(t => (
          <ScopeRow
            key={t._id}
            label={t.name}
            days={t.weeklyOffDays}
            placeholder="(uses office or company default)"
            onSave={async (days) => {
              await api.put('/sys/calendar/off-days', { scope: 'team', scopeId: t._id, days });
              await reload();
            }}
          />
        ))}
      </div>

      {/* Users */}
      <div style={S.card}>
        <div style={S.cardTitle}>Per User (optional override)</div>
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {(data.users || []).length === 0 && <div style={{ fontSize: 11, color: '#64748b' }}>No users yet.</div>}
          {(data.users || []).map(u => (
            <ScopeRow
              key={u._id}
              label={u.name}
              sublabel={u.email}
              days={u.weeklyOffDays}
              placeholder="(uses team/office/company default)"
              onSave={async (days) => {
                await api.put('/sys/calendar/off-days', { scope: 'user', scopeId: u._id, days });
                await reload();
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ScopeRow({ label, sublabel, days, placeholder, onSave }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <div style={{ padding: '8px 10px', borderRadius: 6, background: '#0f172a', marginBottom: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600 }}>{label}</div>
            {sublabel && <div style={{ fontSize: 10, color: '#64748b' }}>{sublabel}</div>}
          </div>
          <button onClick={() => setEditing(false)} style={{ padding: '4px 10px', fontSize: 10, border: '1px solid #334155', borderRadius: 6, background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>Cancel</button>
        </div>
        <DayPicker
          days={days || []}
          allowEmpty
          onSave={async (newDays) => {
            await onSave(newDays);
            setEditing(false);
          }}
        />
      </div>
    );
  }
  const display = days && days.length > 0
    ? days.sort((a, b) => a - b).map(d => DAY_NAMES[d]).join(', ')
    : placeholder;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 6, background: '#0f172a', marginBottom: 6 }}>
      <div>
        <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 10, color: days && days.length > 0 ? '#10B981' : '#64748b', marginTop: 2 }}>
          {display}
        </div>
        {sublabel && <div style={{ fontSize: 9, color: '#64748b', marginTop: 1 }}>{sublabel}</div>}
      </div>
      <button onClick={() => setEditing(true)} style={{ padding: '4px 10px', fontSize: 10, fontWeight: 600, border: '1px solid #334155', borderRadius: 6, background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>Edit</button>
    </div>
  );
}

function DayPicker({ days, allowEmpty, onSave }) {
  const [selected, setSelected] = useState(new Set(days || []));
  const [busy, setBusy] = useState(false);

  const toggle = (d) => {
    const next = new Set(selected);
    if (next.has(d)) next.delete(d); else next.add(d);
    setSelected(next);
  };

  const save = async () => {
    setBusy(true);
    try {
      await onSave(Array.from(selected).sort((a, b) => a - b));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save.');
    }
    setBusy(false);
  };

  const clearOverride = async () => {
    setBusy(true);
    try {
      await onSave([]);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed.');
    }
    setBusy(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {DAY_NAMES.map((name, idx) => (
          <button
            key={idx}
            onClick={() => toggle(idx)}
            style={{
              padding: '6px 14px',
              fontSize: 11,
              fontWeight: 600,
              border: '1px solid',
              borderColor: selected.has(idx) ? '#6366F1' : '#334155',
              borderRadius: 14,
              background: selected.has(idx) ? 'rgba(99,102,241,0.15)' : 'transparent',
              color: selected.has(idx) ? '#6366F1' : '#94a3b8',
              cursor: 'pointer'
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={save} disabled={busy} style={{ padding: '6px 16px', fontSize: 11, fontWeight: 700, border: 'none', borderRadius: 6, background: busy ? '#475569' : 'linear-gradient(135deg, #6366F1, #8B5CF6)', color: '#fff', cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {allowEmpty && (
          <button onClick={clearOverride} disabled={busy} style={{ padding: '6px 12px', fontSize: 10, fontWeight: 600, border: '1px solid #334155', borderRadius: 6, background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>
            Clear override (use parent default)
          </button>
        )}
      </div>
    </div>
  );
}