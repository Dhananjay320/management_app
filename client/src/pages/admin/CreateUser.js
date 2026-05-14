import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

// Hardcoded fallback if no DB presets exist
const FALLBACK_PRESETS = [
  { name: 'HR', targetRole: 'admin', powers: { attendance: { viewTeam: true, viewIndividual: true, editRecords: true, forwardAlerts: true }, salary: { viewEmployee: true, editStructure: true, resolveDisputes: true, viewDisputes: true }, analysis: { viewIndividual: true } } },
  { name: 'Team Lead', targetRole: 'admin', powers: { attendance: { viewTeam: true }, tasks: { viewMemberTasks: true, viewTeamTasks: true, createForOthers: true }, meetings: { createCompanyWide: true }, analysis: { viewIndividual: true, viewTeam: true } } },
  { name: 'Manager', targetRole: 'admin', powers: { attendance: { viewTeam: true, editRecords: true }, tasks: { viewMemberTasks: true, viewTeamTasks: true, createForOthers: true }, salary: { viewDisputes: true, resolveDisputes: true }, meetings: { createCompanyWide: true }, analysis: { viewIndividual: true, viewTeam: true } } }
];

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

// Powers that employees can also have (subset — no admin-only powers like users.create, security.*)
const EMPLOYEE_POWER_GROUPS = [
  { key: 'tasks', label: '✅ Tasks', powers: ['viewMemberTasks','viewTeamTasks','createForOthers'] },
  { key: 'meetings', label: '👥 Meetings', powers: ['createCompanyWide'] },
  { key: 'messaging', label: '💬 Messaging', powers: ['createRooms','createPublicChannels'] },
  { key: 'calendar', label: '📅 Calendar', powers: ['createLocationTeam'] },
  { key: 'email', label: '✉️ Email', powers: ['accessSharedInboxes','sendExternal'] },
  { key: 'workspace', label: '📁 Workspace', powers: ['viewPrivate'] },
];

export default function CreateUser() {
  const navigate = useNavigate();
  const [, setTeams] = useState([]);
  const [offices, setOffices] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState('');
  const [presets, setPresets] = useState([]);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetName, setPresetName] = useState('');

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
    Promise.all([
      api.get('/users').catch(() => ({ data: [] })),
      api.get('/teams').catch(() => ({ data: [] })),
      api.get('/teams/offices').catch(() => ({ data: [] })),
      api.get('/users/power-presets/list').catch(() => ({ data: [] })),
    ]).then(([usersRes, teamsRes, officesRes, presetsRes]) => {
      setUsers(usersRes.data);
      setTeams(teamsRes.data);
      setOffices(officesRes.data);
      setPresets(presetsRes.data?.length ? presetsRes.data : FALLBACK_PRESETS);
    });
  }, []);

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
  const updateSalary = (field, value) => setForm(prev => ({ ...prev, salary: { ...prev.salary, [field]: value } }));
  const updateAdmin = (field, value) => setForm(prev => ({ ...prev, admins: { ...prev.admins, [field]: value } }));

  const togglePower = (group, power) => {
    setForm(prev => {
      const powers = { ...prev.powers };
      if (!powers[group]) powers[group] = {};
      powers[group] = { ...powers[group], [power]: !powers[group][power] };
      return { ...prev, powers };
    });
  };

  const toggleAllPowers = (group, powers) => {
    setForm(prev => {
      const p = { ...prev.powers };
      const allOn = powers.every(pw => p[group]?.[pw]);
      p[group] = {};
      powers.forEach(pw => { p[group][pw] = !allOn; });
      return { ...prev, powers: p };
    });
  };

  const applyPreset = (presetName) => {
    updateField('adminTitle', presetName);
    const preset = presets.find(p => p.name === presetName);
    if (preset) {
      if (preset.targetRole) updateField('role', preset.targetRole);
      setForm(prev => ({ ...prev, powers: JSON.parse(JSON.stringify(preset.powers || {})) }));
    }
  };

  const saveAsPreset = async () => {
    if (!presetName.trim()) return;
    try {
      await api.post('/users/power-presets', {
        name: presetName.trim(),
        targetRole: form.role,
        powers: form.powers
      });
      const { data } = await api.get('/users/power-presets/list');
      setPresets(data.length ? data : FALLBACK_PRESETS);
      setShowSavePreset(false);
      setPresetName('');
      alert('Preset saved!');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save preset.');
    }
  };

  const toggleHybridDay = (day) => {
    setForm(prev => ({
      ...prev,
      hybridOfficeDays: prev.hybridOfficeDays.includes(day)
        ? prev.hybridOfficeDays.filter(d => d !== day)
        : [...prev.hybridOfficeDays, day]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
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
      const { data } = await api.post('/users', payload);
      setSuccess(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create employee.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={{ maxWidth: 480, margin: '40px auto' }}>
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }}>Employee Created!</h2>
          <p style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 16 }}>{success.name} has been added to the team.</p>
          <div className="info-box green" style={{ textAlign: 'left', marginBottom: 16 }}>
            <span>🔑</span>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Temporary Password</div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 700 }}>{success.tempPassword}</div>
              <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 4 }}>Share this with the employee personally. It disappears after first login.</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button className="btn btn-secondary" onClick={() => navigate('/admin/users')}>View All Users</button>
            <button className="btn btn-primary-sm" onClick={() => { setSuccess(null); setForm({ name:'',email:'',phone:'',jobTitle:'',role:'employee',adminTitle:'',teams:[],office:'',manager:'',admins:{hr:'',tasks:'',salary:''},workType:'full_office',hybridOfficeDays:[],salary:{base:'',tds:'',pf:'',esi:'',fixedBonus:''},powers:{} }); }}>Create Another</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Create Employee</div>
          <div className="page-subtitle">Add a new team member</div>
        </div>
        <button className="btn btn-secondary" onClick={() => navigate('/admin/users')}>← Back to Users</button>
      </div>

      {/* Instructions banner */}
      <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 10, padding: '14px 18px', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#6366F1', marginBottom: 6 }}>How to create an employee</div>
        <ol style={{ fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.8, margin: 0, paddingLeft: 18 }}>
          <li><strong>Identity</strong> — Enter name and email (used for login). A temporary password is generated automatically.</li>
          <li><strong>Team & Location</strong> — Assign a manager and admin for each area (HR, tasks, salary, attendance, escalation).</li>
          <li><strong>Compensation</strong> — Set salary components. These are used for monthly payroll generation.</li>
          <li><strong>Role & Powers</strong> — Choose Employee or Admin. Use a preset or manually tick specific powers.</li>
          <li>After creation, share the <strong>temporary password</strong> with the employee. They must change it on first login.</li>
        </ol>
      </div>

      <form onSubmit={handleSubmit}>
        {error && <div className="info-box amber"><span>⚠️</span><div>{error}</div></div>}

        {/* Identity */}
        <div className="form-card" style={{ maxWidth: '100%', marginBottom: 16 }}>
          <div className="form-section-title">👤 Identity</div>
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
          <div className="form-section-title">🏢 Team & Location</div>
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
                {users.filter(u => u.role !== 'employee').map(u => (
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
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(99,102,241,0.04)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.08)', marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Assign Admins for this Employee</div>
            <div style={{ fontSize: 10, color: 'var(--ink-3)', lineHeight: 1.6 }}>
              Each employee can have different admins managing different aspects. Admins get notified and can manage the assigned area. Leave empty if not applicable — Main Admin handles everything by default.
            </div>
          </div>
          {[
            { key: 'hr', label: 'HR Admin', desc: 'Manages leaves, onboarding, HR processes' },
            { key: 'tasks', label: 'Task Admin', desc: 'Reviews tasks, assigns work, tracks progress' },
            { key: 'salary', label: 'Salary Admin', desc: 'Manages payroll, disputes, bonuses' },
            { key: 'attendance', label: 'Attendance Admin', desc: 'Tracks entry/wrap-up, edits timings, gets alerts' },
            { key: 'escalation', label: 'Escalation Admin', desc: 'Handles emergencies — late, unresponsive, urgent issues' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="form-field" style={{ marginBottom: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {label}
                <span style={{ fontSize: 9, color: 'var(--ink-4)', fontWeight: 400 }}>— {desc}</span>
              </label>
              <select value={form.admins[key]} onChange={e => updateAdmin(key, e.target.value)}>
                <option value="">Not assigned (Main Admin handles)</option>
                {users.filter(u => u.role !== 'employee').map(u => (
                  <option key={u._id} value={u._id}>{u.name} {u.adminTitle ? `(${u.adminTitle})` : ''}</option>
                ))}
              </select>
            </div>
          ))}
          {form.workType === 'hybrid' && (
            <div className="info-box indigo">
              <span>📅</span>
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
          <div className="form-section-title">💰 Compensation</div>
          <div className="form-grid-3">
            {[['base','Base Salary'],['tds','TDS'],['pf','PF'],['esi','ESI'],['fixedBonus','Fixed Bonus']].map(([key, label]) => (
              <div className="form-field" key={key}>
                <label>{label}</label>
                <input type="number" value={form.salary[key]} onChange={e => updateSalary(key, e.target.value)} placeholder="₹0" />
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
              </select>
            </div>
          </div>

          {/* Power checkboxes — shown for BOTH admin and employee */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                {form.role === 'admin'
                  ? 'Admin powers — tick individually or select a preset above'
                  : 'Employee powers — optional extra permissions for this employee'}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {showSavePreset ? (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input value={presetName} onChange={e => setPresetName(e.target.value)} placeholder="Preset name..."
                      style={{ padding: '3px 8px', border: '1px solid var(--line)', borderRadius: 4, fontSize: 10, width: 120, fontFamily: 'Inter', outline: 'none' }} />
                    <button type="button" onClick={saveAsPreset} disabled={!presetName.trim()}
                      style={{ padding: '3px 8px', fontSize: 9, border: 'none', borderRadius: 4, background: '#6366F1', color: '#fff', cursor: 'pointer', fontFamily: 'Inter' }}>Save</button>
                    <button type="button" onClick={() => setShowSavePreset(false)}
                      style={{ padding: '3px 6px', fontSize: 9, border: '1px solid var(--line)', borderRadius: 4, background: 'var(--glass)', color: 'var(--ink-3)', cursor: 'pointer', fontFamily: 'Inter' }}>X</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setShowSavePreset(true)}
                    style={{ padding: '3px 10px', fontSize: 9, border: '1px solid #6366F1', borderRadius: 4, background: 'rgba(99,102,241,0.06)', color: '#6366F1', cursor: 'pointer', fontFamily: 'Inter' }}>
                    Save as Preset
                  </button>
                )}
              </div>
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

        <div className="form-actions" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/admin/users')}>Cancel</button>
          <button type="submit" className="btn btn-primary-sm" disabled={loading}>
            {loading ? 'Creating...' : 'Create Employee'}
          </button>
        </div>
      </form>
    </div>
  );
}
