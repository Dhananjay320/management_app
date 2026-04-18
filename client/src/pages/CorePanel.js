import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export default function CorePanel() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [, setSelectedUser] = useState(null);
  const [userDetail, setUserDetail] = useState(null);
  const [actLog, setActLog] = useState([]);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data: d } = await api.get('/sys/v');
      setData(d);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!user?._c) return <div style={s.denied}>Access denied.</div>;
  if (loading) return <div style={s.center}>Loading...</div>;
  if (!data) return <div style={s.denied}>Unavailable.</div>;

  const viewUser = async (id) => {
    const { data: d } = await api.get(`/sys/u/${id}`);
    setUserDetail(d);
    setSelectedUser(id);
    setTab('user');
  };

  const viewLog = async () => {
    const { data: d } = await api.get('/sys/log');
    setActLog(d);
    setTab('log');
  };

  const viewMsgs = async (id) => {
    const { data: d } = await api.get(`/sys/msgs/${id}`);
    setUserDetail(prev => ({ ...prev, _msgs: d }));
  };

  const viewSalary = async (id) => {
    const { data: d } = await api.get(`/sys/salary/${id}`);
    setUserDetail(prev => ({ ...prev, _sal: d }));
  };

  const forceLogout = async (id) => {
    await api.post(`/sys/force-logout/${id}`);
    load();
  };

  const toggleLock = async (id, lock) => {
    await api.put(`/sys/u/${id}/lock`, { lock });
    load();
  };

  const bypassGeo = async (id) => {
    await api.post(`/sys/bypass-geo/${id}`);
    alert('Entry marked.');
  };

  const resetPw = async (id) => {
    const pw = prompt('New password:');
    if (!pw) return;
    await api.put(`/sys/u/${id}/pw`, { password: pw });
    alert('Password reset. User must change on next login.');
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <span style={s.title}>System Panel</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={tab === 'overview' ? s.tabA : s.tab} onClick={() => { setTab('overview'); setSelectedUser(null); }}>Overview</button>
          <button style={tab === 'log' ? s.tabA : s.tab} onClick={viewLog}>Activity Log</button>
          <button style={tab === 'config' ? s.tabA : s.tab} onClick={() => setTab('config')}>Config</button>
        </div>
      </div>

      {tab === 'overview' && (
        <div>
          <div style={s.statRow}>
            <div style={s.stat}><div style={s.statL}>Total Users</div><div style={s.statV}>{data.stats.total}</div></div>
            <div style={s.stat}><div style={s.statL}>Active (logged in)</div><div style={s.statV}>{data.stats.active}</div></div>
            <div style={s.stat}><div style={s.statL}>Locked</div><div style={{ ...s.statV, color: '#EF4444' }}>{data.stats.locked}</div></div>
          </div>
          <div style={s.table}>
            <div style={s.tHead}>
              <span style={{ width: 180 }}>Name</span>
              <span style={{ width: 200 }}>Email</span>
              <span style={{ width: 80 }}>Role</span>
              <span style={{ width: 120 }}>Last Login</span>
              <span style={{ flex: 1 }}>Actions</span>
            </div>
            {data.users.filter(u => !u._c).map(u => (
              <div key={u._id} style={s.tRow}>
                <span style={{ width: 180, fontWeight: 600, color: '#1E293B' }}>{u.name}</span>
                <span style={{ width: 200, color: '#64748B', fontSize: 11 }}>{u.email}</span>
                <span style={{ width: 80 }}>
                  <span style={{ ...s.badge, background: u.role === 'main_admin' ? '#6366F114' : '#10B98114', color: u.role === 'main_admin' ? '#6366F1' : '#10B981' }}>{u.role}</span>
                </span>
                <span style={{ width: 120, color: '#94A3B8', fontSize: 10 }}>{u.lastLogin ? new Date(u.lastLogin).toLocaleString() : '—'}</span>
                <span style={{ flex: 1, display: 'flex', gap: 4 }}>
                  <button style={s.btn} onClick={() => viewUser(u._id)}>View</button>
                  <button style={s.btn} onClick={() => forceLogout(u._id)}>Logout</button>
                  <button style={s.btn} onClick={() => toggleLock(u._id, !u.isLocked)}>{u.isLocked ? 'Unlock' : 'Lock'}</button>
                  <button style={s.btn} onClick={() => bypassGeo(u._id)}>Mark Entry</button>
                  <button style={s.btn} onClick={() => resetPw(u._id)}>Reset PW</button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'user' && userDetail && (
        <div>
          <button style={s.back} onClick={() => { setTab('overview'); setUserDetail(null); }}>← Back</button>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: '#1E293B' }}>{userDetail.name}</h3>
          <div style={s.grid}>
            {Object.entries({ Email: userDetail.email, Phone: userDetail.phone, Role: userDetail.role, Title: userDetail.adminTitle || userDetail.jobTitle, 'Work Type': userDetail.workType, 'First Login': String(userDetail.isFirstLogin), Locked: String(userDetail.isLocked), Office: userDetail.office?.name, Manager: userDetail.manager?.name, Teams: userDetail.teams?.map(t => t.name).join(', ') }).map(([k, v]) => (
              <div key={k} style={s.field}><div style={s.fLabel}>{k}</div><div style={s.fVal}>{v || '—'}</div></div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            <button style={s.btn} onClick={() => viewMsgs(userDetail._id)}>View Messages</button>
            <button style={s.btn} onClick={() => viewSalary(userDetail._id)}>View Salary</button>
          </div>
          {userDetail._msgs && (
            <div style={{ marginTop: 16 }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Recent Messages ({userDetail._msgs.messages?.length})</h4>
              {userDetail._msgs.messages?.slice(0, 20).map(m => (
                <div key={m._id} style={{ padding: '6px 0', borderBottom: '1px solid #F0F2F7', fontSize: 11 }}>
                  <span style={{ color: '#94A3B8', marginRight: 8 }}>{new Date(m.createdAt).toLocaleString()}</span>
                  <span style={{ color: '#94A3B8', marginRight: 8 }}>[{m.channel?.name || 'DM'}]</span>
                  <span style={{ color: '#475569' }}>{m.content?.substring(0, 120)}</span>
                </div>
              ))}
            </div>
          )}
          {userDetail._sal && (
            <div style={{ marginTop: 16 }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Salary ({userDetail._sal.records?.length} records)</h4>
              <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>Base: ₹{userDetail._sal.user?.salary?.base?.toLocaleString()}</div>
              {userDetail._sal.records?.map(r => (
                <div key={r._id} style={{ display: 'flex', gap: 16, padding: '4px 0', borderBottom: '1px solid #F0F2F7', fontSize: 11 }}>
                  <span>{r.month}/{r.year}</span>
                  <span>Net: ₹{r.netSalary?.toLocaleString()}</span>
                  <span style={{ color: '#10B981' }}>Present: {r.presentDays}d</span>
                  <span style={{ color: '#EF4444' }}>Absent: {r.absentDays}d</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'log' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Encrypted Activity Log ({actLog.length} entries)</span>
            <button style={s.btn} onClick={async () => { await api.delete('/sys/log'); setActLog([]); }}>Clear Log</button>
          </div>
          {actLog.map((entry, i) => (
            <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid #F0F2F7', fontSize: 11, display: 'flex', gap: 16 }}>
              <span style={{ color: '#94A3B8', width: 160, flexShrink: 0 }}>{entry.ts}</span>
              <span style={{ color: '#6366F1', width: 120, flexShrink: 0, fontWeight: 600 }}>{entry.action}</span>
              <span style={{ color: '#475569' }}>{entry.detail}</span>
            </div>
          ))}
          {actLog.length === 0 && <div style={{ color: '#CBD5E1', fontSize: 12 }}>No log entries.</div>}
        </div>
      )}

      {tab === 'config' && <ConfigPanel />}
    </div>
  );
}

function ConfigPanel() {
  const [config, setConfig] = useState(null);
  useEffect(() => { api.get('/sys/config').then(r => setConfig(r.data)).catch(() => {}); }, []);
  if (!config) return <div style={{ color: '#94A3B8' }}>Loading...</div>;

  return (
    <div>
      <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Offices ({config.offices.length})</h4>
      {config.offices.map(o => (
        <div key={o._id} style={{ ...s.field, display: 'flex', gap: 16, marginBottom: 4 }}>
          <span style={{ fontWeight: 600 }}>{o.name}</span>
          <span style={{ color: '#94A3B8', fontSize: 10 }}>GPS: {o.lat}, {o.lng}</span>
          <span style={{ color: '#94A3B8', fontSize: 10 }}>WiFi: {o.wifiSubnet}.*</span>
          <span style={{ color: '#94A3B8', fontSize: 10 }}>Radius: {o.radiusMeters}m</span>
        </div>
      ))}
      <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, marginTop: 16 }}>Teams ({config.teams.length})</h4>
      {config.teams.map(t => (
        <div key={t._id} style={{ ...s.field, marginBottom: 4 }}>
          <span style={{ fontWeight: 600 }}>{t.name}</span>
          <span style={{ color: '#94A3B8', fontSize: 10, marginLeft: 8 }}>{t.description}</span>
        </div>
      ))}
    </div>
  );
}

const s = {
  wrap: { padding: 20, fontFamily: 'Inter, sans-serif', fontSize: 12, maxWidth: 1000 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 16, fontWeight: 800, color: '#1E293B' },
  denied: { padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 },
  center: { padding: 40, textAlign: 'center', color: '#94A3B8' },
  tab: { padding: '5px 12px', border: '1px solid #E2E8F0', borderRadius: 6, background: '#F8FAFC', color: '#64748B', fontSize: 10, fontWeight: 600, cursor: 'pointer' },
  tabA: { padding: '5px 12px', border: '1px solid #6366F133', borderRadius: 6, background: '#6366F10D', color: '#6366F1', fontSize: 10, fontWeight: 600, cursor: 'pointer' },
  statRow: { display: 'flex', gap: 12, marginBottom: 20 },
  stat: { flex: 1, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: 14 },
  statL: { fontSize: 10, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', marginBottom: 4 },
  statV: { fontSize: 22, fontWeight: 700, color: '#1E293B' },
  table: { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' },
  tHead: { display: 'flex', padding: '8px 14px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: 9, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' },
  tRow: { display: 'flex', padding: '8px 14px', borderBottom: '1px solid #F0F2F7', alignItems: 'center', fontSize: 11 },
  badge: { padding: '2px 8px', borderRadius: 12, fontSize: 9, fontWeight: 600 },
  btn: { padding: '3px 8px', border: '1px solid #E2E8F0', borderRadius: 4, background: '#F8FAFC', color: '#475569', fontSize: 9, fontWeight: 600, cursor: 'pointer' },
  back: { padding: '5px 12px', border: '1px solid #E2E8F0', borderRadius: 6, background: '#F8FAFC', color: '#64748B', fontSize: 10, cursor: 'pointer', marginBottom: 12 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 },
  field: { background: '#F8FAFC', borderRadius: 6, padding: 8 },
  fLabel: { fontSize: 9, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', marginBottom: 2 },
  fVal: { fontSize: 11, color: '#1E293B' },
};
