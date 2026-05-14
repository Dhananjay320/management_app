import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

export default function HolidaysPage() {
  const { user } = useAuth();
  const canManage = user?.role === 'main_admin' || user?.powers?.calendar?.markHolidays === true;

  const [holidays, setHolidays] = useState([]);
  const [teams, setTeams] = useState([]);
  const [offices, setOffices] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: '', date: '', scope: 'company', scopeId: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [hRes, tRes, oRes, uRes] = await Promise.all([
        api.get('/calendar/events/holidays?upcoming=1').catch(() => ({ data: [] })),
        api.get('/teams').catch(() => ({ data: [] })),
        api.get('/teams/offices').catch(() => ({ data: [] })),
        api.get('/users/directory').catch(() => ({ data: [] })),
      ]);
      setHolidays(hRes.data);
      setTeams(tRes.data);
      setOffices(oRes.data);
      setUsers(uRes.data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { if (canManage) load(); }, [canManage, load]);

  if (!canManage) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
        <h2 style={{ color: 'var(--ink)' }}>Permission required</h2>
        <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>You need the <strong>Calendar &rsaquo; Mark Holidays</strong> power to access this page.</p>
      </div>
    );
  }

  const create = async () => {
    if (!form.title.trim() || !form.date) return alert('Title and date are required.');
    setBusy(true);
    try {
      const payload = {
        title: form.title.trim(),
        date: form.date,
        type: 'holiday',
        allDay: true
      };
      if (form.scope === 'company') payload.isCompanyWide = true;
      else if (form.scope === 'office' && form.scopeId) payload.office = form.scopeId;
      else if (form.scope === 'team' && form.scopeId) payload.team = form.scopeId;
      else if (form.scope === 'user' && form.scopeId) payload.user = form.scopeId;

      await api.post('/calendar/events', payload);
      setForm({ title: '', date: '', scope: 'company', scopeId: '' });
      setShowAdd(false);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add holiday.');
    }
    setBusy(false);
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this holiday?')) return;
    try {
      await api.delete(`/calendar/events/${id}`);
      setHolidays(prev => prev.filter(h => h._id !== id));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete.');
    }
  };

  const seedYear = async () => {
    if (!window.confirm(`Seed major Indian public holidays for ${new Date().getFullYear()}? Existing entries are skipped.`)) return;
    setBusy(true);
    try {
      const { data } = await api.post('/calendar/seed-holidays');
      alert(`${data.holidays?.length || 0} holidays seeded.`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to seed.');
    }
    setBusy(false);
  };

  const scopeLabel = (h) => {
    if (h.isCompanyWide) return 'Company-wide';
    if (h.office?.name) return `Office: ${h.office.name}`;
    if (h.team?.name) return `Team: ${h.team.name}`;
    if (h.user?.name) return `User: ${h.user.name}`;
    return 'Unknown';
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Holidays</div>
          <div className="page-subtitle">Mark days off so reminders &amp; alerts skip these dates</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={seedYear} disabled={busy} style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, border: '1px solid var(--line)', borderRadius: 8, background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
            🇮🇳 Seed Indian Holidays
          </button>
          <button onClick={() => setShowAdd(!showAdd)} style={{ padding: '8px 18px', fontSize: 13, fontWeight: 600, background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            {showAdd ? 'Cancel' : '+ Add Holiday'}
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="card" style={{ marginBottom: 16, padding: 18 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>Add a Holiday</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.5fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={S.label}>Title *</label>
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Diwali" style={S.input} />
            </div>
            <div>
              <label style={S.label}>Date *</label>
              <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} style={S.input} />
            </div>
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
                  {offices.map(o => <option key={o._id} value={o._id}>{o.name}</option>)}
                </select>
              ) : form.scope === 'team' ? (
                <select value={form.scopeId} onChange={e => setForm(p => ({ ...p, scopeId: e.target.value }))} style={S.input}>
                  <option value="">— pick team —</option>
                  {teams.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                </select>
              ) : (
                <select value={form.scopeId} onChange={e => setForm(p => ({ ...p, scopeId: e.target.value }))} style={S.input}>
                  <option value="">— pick user —</option>
                  {users.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
                </select>
              )}
            </div>
          </div>
          <button onClick={create} disabled={busy || !form.title.trim() || !form.date} style={{ padding: '8px 20px', fontSize: 13, fontWeight: 700, border: 'none', borderRadius: 8, background: busy ? '#475569' : 'linear-gradient(135deg,#6366F1,#8B5CF6)', color: '#fff', cursor: busy ? 'wait' : 'pointer' }}>
            {busy ? 'Saving…' : 'Add Holiday'}
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--ink-3)' }}>Loading…</div>
      ) : holidays.length === 0 ? (
        <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--ink-3)' }}>
          No upcoming holidays. Click "+ Add Holiday" or "🇮🇳 Seed Indian Holidays" above.
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {holidays.map((h, i) => (
            <div key={h._id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 18px',
              borderBottom: i < holidays.length - 1 ? '1px solid var(--line)' : 'none'
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{h.title}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                  {new Date(h.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} • {scopeLabel(h)}
                </div>
              </div>
              <button onClick={() => remove(h._id)} style={{ padding: '6px 14px', fontSize: 11, fontWeight: 600, border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, background: 'transparent', color: '#EF4444', cursor: 'pointer' }}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const S = {
  label: { fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', marginBottom: 4, display: 'block' },
  input: { width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, background: 'var(--bg-1)', color: 'var(--ink)', outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }
};
