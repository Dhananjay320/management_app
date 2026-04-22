import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const TABS = [
  { key: 'users', icon: '👥', label: 'Users' },
  { key: 'attendance', icon: '⏰', label: 'Attendance' },
  { key: 'offices', icon: '🏢', label: 'Offices' },
  { key: 'aikeys', icon: '🔑', label: 'AI Keys' },
  { key: 'log', icon: '📋', label: 'Activity Log' },
  { key: 'config', icon: '⚙️', label: 'Config' },
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
          {tab === 'attendance' && <AttendanceTab />}
          {tab === 'offices' && <OfficesTab />}
          {tab === 'aikeys' && <AIKeysTab />}
          {tab === 'log' && <LogTab />}
          {tab === 'config' && <ConfigTab />}
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

  const users = (data?.users || []).filter(u => !u._c);
  const filtered = users.filter(u =>
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const viewUser = async (id) => {
    const { data: d } = await api.get(`/sys/u/${id}`);
    setUserDetail(d);
    setSelected(id);
  };

  const forceLogout = async (id) => { await api.post(`/sys/force-logout/${id}`); onRefresh(); };
  const toggleLock = async (id, lock) => { await api.put(`/sys/u/${id}/lock`, { lock }); onRefresh(); };
  const resetPw = async (id) => {
    const pw = prompt('New password (min 8 chars, 1 number, 1 special):');
    if (!pw) return;
    await api.put(`/sys/u/${id}/pw`, { password: pw });
    alert('Password reset. User must change on next login.');
  };

  if (selected && userDetail) return (
    <div>
      <button onClick={() => { setSelected(null); setUserDetail(null); }} style={S.btn}>← Back to Users</button>
      <div style={{ ...S.card, marginTop: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>{userDetail.name}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[['Email', userDetail.email], ['Phone', userDetail.phone], ['Role', userDetail.role],
            ['Title', userDetail.adminTitle || userDetail.jobTitle], ['Work Type', userDetail.workType],
            ['Locked', String(userDetail.isLocked)], ['First Login', String(userDetail.isFirstLogin)],
            ['Office', userDetail.office?.name], ['Manager', userDetail.manager?.name],
            ['Teams', userDetail.teams?.map(t => t.name).join(', ')]
          ].map(([k, v]) => (
            <div key={k} style={S.fieldBox}><div style={S.fieldLabel}>{k}</div><div style={S.fieldVal}>{v || '—'}</div></div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
          <button style={S.btn} onClick={() => forceLogout(userDetail._id)}>🚪 Force Logout</button>
          <button style={S.btn} onClick={() => toggleLock(userDetail._id, !userDetail.isLocked)}>
            {userDetail.isLocked ? '🔓 Unlock' : '🔒 Lock'}
          </button>
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
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users..."
        style={{ ...S.input, maxWidth: 300, marginBottom: 16 }} />
      <div style={S.table}>
        <div style={S.tableHead}>
          <span style={{ flex: 1 }}>Name</span>
          <span style={{ width: 180 }}>Email</span>
          <span style={{ width: 80 }}>Role</span>
          <span style={{ width: 100 }}>Last Login</span>
          <span style={{ width: 200 }}>Actions</span>
        </div>
        {filtered.map(u => (
          <div key={u._id} style={S.tableRow}>
            <span style={{ flex: 1, fontWeight: 600, color: 'var(--ink)' }}>{u.name}</span>
            <span style={{ width: 180, color: 'var(--ink-3)', fontSize: 11 }}>{u.email}</span>
            <span style={{ width: 80 }}>
              <span style={{ ...S.badge, background: u.role === 'main_admin' ? 'rgba(99,102,241,0.15)' : 'rgba(16,185,129,0.15)', color: u.role === 'main_admin' ? 'var(--indigo)' : 'var(--emerald)' }}>{u.role}</span>
            </span>
            <span style={{ width: 100, color: 'var(--ink-4)', fontSize: 10 }}>{u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : '—'}</span>
            <span style={{ width: 200, display: 'flex', gap: 4 }}>
              <button style={S.btnSm} onClick={() => viewUser(u._id)}>View</button>
              <button style={S.btnSm} onClick={() => forceLogout(u._id)}>Logout</button>
              <button style={S.btnSm} onClick={() => toggleLock(u._id, !u.isLocked)}>{u.isLocked ? 'Unlock' : 'Lock'}</button>
              <button style={S.btnSm} onClick={() => api.post(`/sys/bypass-geo/${u._id}`).then(() => alert('✅ Entry marked')).catch(e => alert('❌ ' + (e.response?.data?.error || 'Failed')))}>Mark Entry</button>
              <button style={S.btnSm} onClick={() => api.post(`/sys/wrap-up/${u._id}`).then(() => alert('✅ Wrapped up')).catch(e => alert('❌ ' + (e.response?.data?.error || 'Failed')))}>Wrap Up</button>
            </span>
          </div>
        ))}
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
            <div><div style={S.fieldLabel}>Entry Time</div><input type="time" id="att-entry" style={S.input} /></div>
            <div><div style={S.fieldLabel}>Wrap Up Time</div><input type="time" id="att-wrap" style={S.input} /></div>
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
              const entry = document.getElementById('att-entry').value;
              const wrap = document.getElementById('att-wrap').value;
              const status = document.getElementById('att-status').value;
              if (!d) { alert('Select a date'); return; }
              const body = { status };
              if (entry) body.entryTime = `${d}T${entry}:00`;
              if (wrap) body.wrapUpTime = `${d}T${wrap}:00`;
              try {
                await api.put(`/sys/attendance/${userId}/${d}`, body);
                alert('✅ Attendance updated');
                loadAttendance();
              } catch (e) { alert('❌ ' + (e.response?.data?.error || 'Failed')); }
            }}>💾 Save</button>
          </div>
          <div style={{ fontSize: 10, color: 'var(--ink-4)', marginTop: 6 }}>Leave entry/wrap-up empty to keep existing values. Use this to correct wrong timings.</div>
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

/* ═══ LOG TAB ═══ */
function LogTab() {
  const [log, setLog] = useState([]);
  useEffect(() => { api.get('/sys/log').then(r => setLog(r.data)).catch(() => {}); }, []);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={S.sectionTitle}>Encrypted Activity Log ({log.length} entries)</h3>
        <button style={S.btn} onClick={() => { api.delete('/sys/log'); setLog([]); }}>Clear Log</button>
      </div>
      {log.length === 0 && <div style={{ color: 'var(--ink-4)', fontSize: 12 }}>No log entries.</div>}
      {log.map((e, i) => (
        <div key={i} style={S.listRow}>
          <span style={{ color: 'var(--ink-4)', width: 160, fontSize: 10 }}>{e.ts}</span>
          <span style={{ color: 'var(--indigo)', width: 120, fontWeight: 600 }}>{e.action}</span>
          <span style={{ color: 'var(--ink-2)' }}>{e.detail}</span>
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
    background: 'var(--glass)', color: 'var(--ink-2)', fontSize: 11, fontWeight: 600, cursor: 'pointer'
  },
  btnSm: {
    padding: '3px 8px', border: '1px solid var(--line)', borderRadius: 4,
    background: 'var(--glass)', color: 'var(--ink-2)', fontSize: 9, fontWeight: 600, cursor: 'pointer'
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
