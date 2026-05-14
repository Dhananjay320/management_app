import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api';

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

const EMPLOYEE_POWER_GROUPS = [
  { key: 'tasks', label: '✅ Tasks', powers: ['viewMemberTasks','viewTeamTasks','createForOthers'] },
  { key: 'meetings', label: '👥 Meetings', powers: ['createCompanyWide'] },
  { key: 'messaging', label: '💬 Messaging', powers: ['createRooms','createPublicChannels'] },
  { key: 'calendar', label: '📅 Calendar', powers: ['createLocationTeam'] },
  { key: 'email', label: '✉️ Email', powers: ['accessSharedInboxes','sendExternal'] },
  { key: 'workspace', label: '📁 Workspace', powers: ['viewPrivate'] },
];

export default function EditUser() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [teams, setTeams] = useState([]);
  const [offices, setOffices] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [presets, setPresets] = useState([]);

  const [form, setForm] = useState({
    name: '', email: '', phone: '', jobTitle: '',
    role: 'employee', adminTitle: '',
    teams: [], office: '', manager: '',
    admins: { hr: '', tasks: '', salary: '', attendance: '', escalation: '' },
    workType: 'full_office', hybridOfficeDays: [],
    salary: { base: '', tds: '', pf: '', esi: '', fixedBonus: '' },
    powers: {}
  });

  useEffect(() => {
    const loadAll = async () => {
      try {
        const [userRes, usersRes, teamsRes, officesRes, presetsRes] = await Promise.all([
          api.get(`/users/${id}`),
          api.get('/users').catch(() => ({ data: [] })),
          api.get('/teams').catch(() => ({ data: [] })),
          api.get('/teams/offices').catch(() => ({ data: [] })),
          api.get('/users/power-presets/list').catch(() => ({ data: [] })),
        ]);

        setAllUsers(usersRes.data);
        setTeams(teamsRes.data);
        setOffices(officesRes.data);
        setPresets(presetsRes.data || []);

        const u = userRes.data;
        setForm({
          name: u.name || '',
          email: u.email || '',
          phone: u.phone || '',
          jobTitle: u.jobTitle || '',
          role: u.role || 'employee',
          adminTitle: u.adminTitle || '',
          teams: (u.teams || []).map(t => typeof t === 'object' ? t._id : t),
          office: u.office ? (typeof u.office === 'object' ? u.office._id : u.office) : '',
          manager: u.manager ? (typeof u.manager === 'object' ? u.manager._id : u.manager) : '',
          admins: {
            hr: u.admins?.hr ? (typeof u.admins.hr === 'object' ? u.admins.hr._id : u.admins.hr) : '',
            tasks: u.admins?.tasks ? (typeof u.admins.tasks === 'object' ? u.admins.tasks._id : u.admins.tasks) : '',
            salary: u.admins?.salary ? (typeof u.admins.salary === 'object' ? u.admins.salary._id : u.admins.salary) : '',
            attendance: u.admins?.attendance ? (typeof u.admins.attendance === 'object' ? u.admins.attendance._id : u.admins.attendance) : '',
            escalation: u.admins?.escalation ? (typeof u.admins.escalation === 'object' ? u.admins.escalation._id : u.admins.escalation) : '',
          },
          workType: u.workType || 'full_office',
          hybridOfficeDays: u.hybridOfficeDays || [],
          salary: {
            base: u.salary?.base ?? '',
            tds: u.salary?.tds ?? '',
            pf: u.salary?.pf ?? '',
            esi: u.salary?.esi ?? '',
            fixedBonus: u.salary?.fixedBonus ?? '',
          },
          powers: u.powers || {},
        });
      } catch (err) {
        setError('Failed to load user data.');
      } finally {
        setLoading(false);
      }
    };
    loadAll();
  }, [id]);

  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setSuccess('');
  };

  const updateSalary = (field, value) => {
    setForm(prev => ({ ...prev, salary: { ...prev.salary, [field]: value } }));
    setSuccess('');
  };

  const updateAdmin = (field, value) => {
    setForm(prev => ({ ...prev, admins: { ...prev.admins, [field]: value } }));
    setSuccess('');
  };

  const togglePower = (group, power) => {
    setForm(prev => {
      const powers = { ...prev.powers };
      if (!powers[group]) powers[group] = {};
      powers[group] = { ...powers[group], [power]: !powers[group][power] };
      return { ...prev, powers };
    });
    setSuccess('');
  };

  const toggleAllPowers = (group, powers) => {
    setForm(prev => {
      const p = { ...prev.powers };
      const allOn = powers.every(pw => p[group]?.[pw]);
      p[group] = {};
      powers.forEach(pw => { p[group][pw] = !allOn; });
      return { ...prev, powers: p };
    });
    setSuccess('');
  };

  const applyPreset = (presetName) => {
    updateField('adminTitle', presetName);
    const preset = presets.find(p => p.name === presetName);
    if (preset) {
      if (preset.targetRole) updateField('role', preset.targetRole);
      setForm(prev => ({ ...prev, powers: JSON.parse(JSON.stringify(preset.powers || {})) }));
    }
  };

  const toggleHybridDay = (day) => {
    setForm(prev => ({
      ...prev,
      hybridOfficeDays: prev.hybridOfficeDays.includes(day)
        ? prev.hybridOfficeDays.filter(d => d !== day)
        : [...prev.hybridOfficeDays, day]
    }));
    setSuccess('');
  };

  const toggleTeam = (teamId) => {
    setForm(prev => ({
      ...prev,
      teams: prev.teams.includes(teamId)
        ? prev.teams.filter(t => t !== teamId)
        : [...prev.teams, teamId]
    }));
    setSuccess('');
  };

  const handleDeactivate = async () => {
    if (!window.confirm('Are you sure you want to deactivate this employee? This action cannot be easily undone.')) return;
    setDeactivating(true);
    setError('');
    try {
      await api.delete(`/users/${id}`);
      navigate('/admin/users');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to deactivate employee.');
    } finally {
      setDeactivating(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const payload = {
        ...form,
        salary: {
          base: Number(form.salary.base) || 0,
          tds: Number(form.salary.tds) || 0,
          pf: Number(form.salary.pf) || 0,
          esi: Number(form.salary.esi) || 0,
          fixedBonus: Number(form.salary.fixedBonus) || 0,
        }
      };
      await api.put(`/users/${id}`, payload);
      setSuccess('Employee updated successfully.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update employee.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-3)' }}>Loading user...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Edit Employee</div>
          <div className="page-subtitle">{form.name || 'Loading...'}</div>
        </div>
        <button className="btn btn-secondary" onClick={() => navigate('/admin/users')}>← Back to Users</button>
      </div>

      <form onSubmit={handleSubmit}>
        {error && <div className="info-box amber" style={{ marginBottom: 12 }}><span>&#9888;&#65039;</span><div>{error}</div></div>}
        {success && <div className="info-box green" style={{ marginBottom: 12 }}><span>&#9989;</span><div>{success}</div></div>}

        {/* Identity */}
        <div className="form-card" style={{ maxWidth: '100%', marginBottom: 16 }}>
          <div className="form-section-title">Identity</div>
          <div className="form-grid">
            <div className="form-field">
              <label>Full Name *</label>
              <input value={form.name} onChange={e => updateField('name', e.target.value)} placeholder="Full name" required />
            </div>
            <div className="form-field">
              <label>Email *</label>
              <input type="email" value={form.email} onChange={e => updateField('email', e.target.value)} placeholder="name@niyoq.com" required />
            </div>
            <div className="form-field">
              <label>Phone</label>
              <input value={form.phone} onChange={e => updateField('phone', e.target.value)} placeholder="+91 98765 43210" />
            </div>
            <div className="form-field">
              <label>Job Title</label>
              <input value={form.jobTitle} onChange={e => updateField('jobTitle', e.target.value)} placeholder="e.g. Frontend Developer" />
            </div>
          </div>
        </div>

        {/* Team & Location */}
        <div className="form-card" style={{ maxWidth: '100%', marginBottom: 16 }}>
          <div className="form-section-title">Team & Location</div>
          <div className="form-grid-3">
            <div className="form-field">
              <label>Work Type</label>
              <select value={form.workType} onChange={e => updateField('workType', e.target.value)}>
                <option value="full_office">Full Office</option>
                <option value="full_remote">Full Remote</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
            <div className="form-field">
              <label>Manager</label>
              <select value={form.manager} onChange={e => updateField('manager', e.target.value)}>
                <option value="">Select manager...</option>
                {allUsers.filter(u => u.role !== 'employee' && u._id !== id).map(u => (
                  <option key={u._id} value={u._id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Office</label>
              <select value={form.office} onChange={e => updateField('office', e.target.value)}>
                <option value="">Select office...</option>
                {offices.map(o => <option key={o._id} value={o._id}>{o.name}</option>)}
              </select>
            </div>
          </div>

          {/* Admin assignments */}
          <div className="form-grid-3" style={{ marginTop: 12 }}>
            {[['hr','HR Admin'],['tasks','Task Admin'],['salary','Salary Admin'],['attendance','Attendance Admin'],['escalation','Escalation Admin']].map(([key, label]) => (
              <div className="form-field" key={key}>
                <label>{label}</label>
                <select value={form.admins[key]} onChange={e => updateAdmin(key, e.target.value)}>
                  <option value="">Select {label.toLowerCase()}...</option>
                  {allUsers.filter(u => u.role !== 'employee' && u._id !== id).map(u => (
                    <option key={u._id} value={u._id}>{u.name}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* Teams multi-select */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 8 }}>Teams</div>
            <div className="chip-group">
              {teams.map(team => (
                <div
                  key={team._id}
                  className={`chip ${form.teams.includes(team._id) ? 'active' : ''}`}
                  onClick={() => toggleTeam(team._id)}
                >
                  {team.name}
                </div>
              ))}
            </div>
            {teams.length === 0 && <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>No teams available.</div>}
          </div>

          {form.workType === 'hybrid' && (
            <div className="info-box indigo" style={{ marginTop: 12 }}>
              <span>&#128197;</span>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Hybrid Office Days</div>
                <div className="chip-group">
                  {['monday','tuesday','wednesday','thursday','friday'].map(day => (
                    <div
                      key={day}
                      className={`chip ${form.hybridOfficeDays.includes(day) ? 'active' : ''}`}
                      onClick={() => toggleHybridDay(day)}
                    >
                      {day.charAt(0).toUpperCase() + day.slice(1, 3)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Compensation */}
        <div className="form-card" style={{ maxWidth: '100%', marginBottom: 16 }}>
          <div className="form-section-title">Compensation</div>
          <div className="form-grid-3">
            {[['base','Base Salary'],['tds','TDS'],['pf','PF'],['esi','ESI'],['fixedBonus','Fixed Bonus']].map(([key, label]) => (
              <div className="form-field" key={key}>
                <label>{label}</label>
                <input type="number" value={form.salary[key]} onChange={e => updateSalary(key, e.target.value)} placeholder="0" />
              </div>
            ))}
          </div>
        </div>

        {/* Role & Powers */}
        <div className="form-card" style={{ maxWidth: '100%', marginBottom: 16 }}>
          <div className="form-section-title">🛡️ Role & Powers</div>
          <div className="form-grid" style={{ marginBottom: 16 }}>
            <div className="form-field">
              <label>Role</label>
              <select value={form.role} onChange={e => updateField('role', e.target.value)}>
                <option value="employee">Employee</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="form-field">
              <label>Position Preset (auto-applies powers)</label>
              <select value={form.adminTitle} onChange={e => applyPreset(e.target.value)}>
                <option value="">Custom / Manual...</option>
                {presets.filter(p => !p.targetRole || p.targetRole === form.role || p.targetRole === 'admin').map(p => (
                  <option key={p.name} value={p.name}>{p.name}{p.targetRole === 'employee' ? ' (Employee)' : ''}</option>
                ))}
                {presets.length === 0 && <>
                  <option value="HR">HR</option>
                  <option value="Team Lead">Team Lead</option>
                  <option value="Manager">Manager</option>
                </>}
              </select>
            </div>
          </div>

          {/* Power checkboxes — shown for both admin and employee */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 12 }}>
              {form.role === 'admin'
                ? 'Admin powers — tick individually or select a preset above'
                : 'Employee powers — optional extra permissions'}
            </div>
            {(form.role === 'admin' ? POWER_GROUPS : EMPLOYEE_POWER_GROUPS).map(group => (
              <div className="power-group" key={group.key}>
                <div className="power-group-title">
                  <span>{group.label}</span>
                  <label className="power-check" style={{ fontSize: 10, color: '#6366F1' }}>
                    <input
                      type="checkbox"
                      checked={group.powers.every(p => form.powers[group.key]?.[p])}
                      onChange={() => toggleAllPowers(group.key, group.powers)}
                    />
                    All
                  </label>
                </div>
                <div className="power-grid">
                  {group.powers.map(power => (
                    <label className="power-check" key={power}>
                      <input
                        type="checkbox"
                        checked={!!form.powers[group.key]?.[power]}
                        onChange={() => togglePower(group.key, power)}
                      />
                      {power.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Email Configuration */}
        <div className="form-card" style={{ maxWidth: '100%', marginBottom: 16 }}>
          <div className="form-section-title">✉️ Email Configuration</div>
          <div style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 12 }}>
            Set up SMTP (sending) and IMAP (receiving) for this employee's email account.
          </div>
          <EmailConfigInline userId={id} userName={form.name} userEmail={form.email} />
        </div>

        <div className="form-actions" style={{ justifyContent: 'space-between' }}>
          <button type="button" style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #EF4444', background: 'rgba(239,68,68,0.08)', color: '#EF4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }} onClick={handleDeactivate} disabled={deactivating}>
            {deactivating ? 'Deactivating...' : 'Deactivate Employee'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/admin/users')}>Cancel</button>
            <button type="submit" className="btn btn-primary-sm" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function EmailConfigInline({ userId, userName, userEmail }) {
  const [emailForm, setEmailForm] = useState({ address: userEmail || '', smtp: { host: '', port: 587, user: '', pass: '' }, imap: { host: '', port: 993, user: '', pass: '' } });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState('');

  const saveEmailConfig = async () => {
    setSaving(true); setResult('');
    try {
      await api.post('/email/accounts/setup-for-user', {
        userId, address: emailForm.address, displayName: userName,
        smtp: emailForm.smtp.host ? emailForm.smtp : undefined,
        imap: emailForm.imap.host ? emailForm.imap : undefined
      });
      setResult('Email configured!');
    } catch (err) { setResult(err.response?.data?.error || 'Failed.'); }
    setSaving(false);
  };

  const S = { input: { width: '100%', padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 11, fontFamily: 'Inter', background: 'var(--glass)', outline: 'none', color: 'var(--ink)', boxSizing: 'border-box' } };

  return (
    <div>
      <div className="form-field" style={{ marginBottom: 8 }}>
        <label>Email Address</label>
        <input value={emailForm.address} onChange={e => setEmailForm(p => ({ ...p, address: e.target.value }))} placeholder="user@company.com" style={S.input} />
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#6366F1', marginBottom: 4, marginTop: 8 }}>SMTP — Sending</div>
      <div className="form-grid" style={{ marginBottom: 8 }}>
        <div className="form-field"><label>Host</label><input value={emailForm.smtp.host} onChange={e => setEmailForm(p => ({ ...p, smtp: { ...p.smtp, host: e.target.value } }))} placeholder="smtp.gmail.com" style={S.input} /></div>
        <div className="form-field"><label>Port</label><input type="number" value={emailForm.smtp.port} onChange={e => setEmailForm(p => ({ ...p, smtp: { ...p.smtp, port: Number(e.target.value) } }))} style={S.input} /></div>
        <div className="form-field"><label>User</label><input value={emailForm.smtp.user} onChange={e => setEmailForm(p => ({ ...p, smtp: { ...p.smtp, user: e.target.value } }))} placeholder="user@gmail.com" style={S.input} /></div>
        <div className="form-field"><label>Password</label><input type="password" value={emailForm.smtp.pass} onChange={e => setEmailForm(p => ({ ...p, smtp: { ...p.smtp, pass: e.target.value } }))} placeholder="App password" style={S.input} /></div>
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#10B981', marginBottom: 4 }}>IMAP — Receiving</div>
      <div className="form-grid" style={{ marginBottom: 8 }}>
        <div className="form-field"><label>Host</label><input value={emailForm.imap.host} onChange={e => setEmailForm(p => ({ ...p, imap: { ...p.imap, host: e.target.value } }))} placeholder="imap.gmail.com" style={S.input} /></div>
        <div className="form-field"><label>Port</label><input type="number" value={emailForm.imap.port} onChange={e => setEmailForm(p => ({ ...p, imap: { ...p.imap, port: Number(e.target.value) } }))} style={S.input} /></div>
        <div className="form-field"><label>User</label><input value={emailForm.imap.user} onChange={e => setEmailForm(p => ({ ...p, imap: { ...p.imap, user: e.target.value } }))} placeholder="user@gmail.com" style={S.input} /></div>
        <div className="form-field"><label>Password</label><input type="password" value={emailForm.imap.pass} onChange={e => setEmailForm(p => ({ ...p, imap: { ...p.imap, pass: e.target.value } }))} placeholder="App password" style={S.input} /></div>
      </div>
      {result && <div style={{ fontSize: 11, color: result.includes('!') ? '#10B981' : '#EF4444', marginBottom: 8 }}>{result}</div>}
      <button type="button" onClick={saveEmailConfig} disabled={saving} className="btn btn-primary-sm" style={{ fontSize: 10 }}>
        {saving ? 'Saving...' : 'Save Email Config'}
      </button>
      <span style={{ fontSize: 9, color: 'var(--ink-4)', marginLeft: 8 }}>Gmail: smtp.gmail.com:587 / imap.gmail.com:993 with App Password</span>

      {/* Shared Email Accounts — grant access to company common emails */}
      <SharedEmailAccess userId={userId} />
    </div>
  );
}

function SharedEmailAccess({ userId }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/email/accounts/all').then(r => setAccounts(r.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const toggleAccess = async (accountId, hasAccess) => {
    try {
      if (hasAccess) {
        await api.put(`/email/accounts/${accountId}/access`, { removeUsers: [userId] });
      } else {
        await api.put(`/email/accounts/${accountId}/access`, { addUsers: [userId] });
      }
      // Reload
      const { data } = await api.get('/email/accounts/all');
      setAccounts(data);
    } catch (err) {
      window.alert(err.response?.data?.error || 'Failed to update access.');
    }
  };

  const [creating, setCreating] = useState(false);
  const [newAddress, setNewAddress] = useState('');
  const sharedAccounts = accounts.filter(a => a.type === 'shared');
  if (loading) return null;

  const createSharedAccount = async () => {
    if (!newAddress.trim()) return;
    try {
      await api.post('/email/accounts', { address: newAddress.trim(), displayName: newAddress.split('@')[0], type: 'shared', accessList: [userId] });
      setNewAddress('');
      setCreating(false);
      const { data } = await api.get('/email/accounts/all');
      setAccounts(data);
    } catch (err) { window.alert(err.response?.data?.error || 'Failed.'); }
  };

  if (sharedAccounts.length === 0 && !creating) return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 6 }}>No shared email accounts exist yet.</div>
      <button type="button" onClick={() => setCreating(true)} style={{ padding: '4px 12px', fontSize: 10, border: '1px solid #6366F1', borderRadius: 4, background: 'rgba(99,102,241,0.06)', color: '#6366F1', cursor: 'pointer', fontFamily: 'Inter' }}>
        + Create Company Email (e.g. info@company.com)
      </button>
    </div>
  );

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 8, textTransform: 'uppercase' }}>Shared Email Access</div>
      <div style={{ fontSize: 9, color: 'var(--ink-3)', marginBottom: 8 }}>Grant this user access to company shared email accounts (like info@company.com, support@company.com)</div>
      {creating ? (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input value={newAddress} onChange={e => setNewAddress(e.target.value)} placeholder="info@company.com"
            style={{ flex: 1, padding: '5px 8px', border: '1px solid var(--line)', borderRadius: 4, fontSize: 11, fontFamily: 'Inter', background: 'var(--glass)', color: 'var(--ink)', outline: 'none' }} />
          <button type="button" onClick={createSharedAccount} className="btn btn-primary-sm" style={{ fontSize: 9, padding: '4px 10px' }}>Create</button>
          <button type="button" onClick={() => setCreating(false)} style={{ fontSize: 9, padding: '4px 8px', border: '1px solid var(--line)', borderRadius: 4, background: 'var(--glass)', color: 'var(--ink-3)', cursor: 'pointer', fontFamily: 'Inter' }}>X</button>
        </div>
      ) : (
        <button type="button" onClick={() => setCreating(true)} style={{ padding: '3px 10px', fontSize: 9, border: '1px solid #6366F1', borderRadius: 4, background: 'rgba(99,102,241,0.06)', color: '#6366F1', cursor: 'pointer', fontFamily: 'Inter', marginBottom: 8 }}>
          + Create Company Email
        </button>
      )}
      {sharedAccounts.map(acc => {
        const hasAccess = acc.accessList?.some(u => (u._id || u) === userId);
        return (
          <div key={acc._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
            <input type="checkbox" checked={!!hasAccess} onChange={() => toggleAccess(acc._id, hasAccess)} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{acc.address}</div>
              <div style={{ fontSize: 9, color: 'var(--ink-3)' }}>{acc.displayName} — {acc.type}</div>
            </div>
            <span className="badge-pill" style={{ fontSize: 8, background: hasAccess ? 'rgba(16,185,129,0.08)' : 'var(--glass)', color: hasAccess ? '#10B981' : 'var(--ink-4)' }}>
              {hasAccess ? 'Has Access' : 'No Access'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
