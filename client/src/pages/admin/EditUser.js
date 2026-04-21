import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api';

const TITLE_TEMPLATES = {
  'HR': {
    attendance: { viewTeam: true, viewIndividual: true, editRecords: true, forwardAlerts: true },
    salary: { viewEmployee: true, editStructure: true, resolveDisputes: true, viewDisputes: true },
    analysis: { viewIndividual: true }
  },
  'Team Lead': {
    attendance: { viewTeam: true },
    tasks: { viewMemberTasks: true, viewTeamTasks: true, createForOthers: true },
    meetings: { createCompanyWide: true },
    analysis: { viewIndividual: true, viewTeam: true }
  },
  'Manager': {
    attendance: { viewTeam: true, editRecords: true },
    tasks: { viewMemberTasks: true, viewTeamTasks: true, createForOthers: true },
    salary: { viewDisputes: true, resolveDisputes: true },
    meetings: { createCompanyWide: true },
    analysis: { viewIndividual: true, viewTeam: true }
  }
};

const POWER_GROUPS = [
  { key: 'users', label: 'Users', powers: ['create','edit','delete','viewPowers','editPowers'] },
  { key: 'attendance', label: 'Attendance', powers: ['viewTeam','viewIndividual','editRecords','markManually','bypassGeofence','forwardAlerts'] },
  { key: 'tasks', label: 'Tasks', powers: ['viewMemberTasks','viewTeamTasks','createForOthers','deleteAny'] },
  { key: 'salary', label: 'Salary', powers: ['viewEmployee','editStructure','defineBonusRules','viewDisputes','resolveDisputes'] },
  { key: 'meetings', label: 'Meetings', powers: ['createCompanyWide','viewAll','deleteAny'] },
  { key: 'messaging', label: 'Messaging', powers: ['createRooms','createPublicChannels','postAnnouncements'] },
  { key: 'analysis', label: 'Analysis', powers: ['viewIndividual','viewTeam','viewCompany'] },
  { key: 'security', label: 'Security', powers: ['viewOTPs','unlockAccounts','viewSessions','forceLogout'] },
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

  const [form, setForm] = useState({
    name: '', email: '', phone: '', jobTitle: '',
    role: 'employee', adminTitle: '',
    teams: [], office: '', manager: '',
    workType: 'full_office', hybridOfficeDays: [],
    salary: { base: '', tds: '', pf: '', esi: '', fixedBonus: '' },
    powers: {}
  });

  useEffect(() => {
    const loadAll = async () => {
      try {
        const [userRes, usersRes, teamsRes, officesRes] = await Promise.all([
          api.get(`/users/${id}`),
          api.get('/users').catch(() => ({ data: [] })),
          api.get('/teams').catch(() => ({ data: [] })),
          api.get('/teams/offices').catch(() => ({ data: [] })),
        ]);

        setAllUsers(usersRes.data);
        setTeams(teamsRes.data);
        setOffices(officesRes.data);

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

  const applyTitle = (title) => {
    updateField('adminTitle', title);
    updateField('role', 'admin');
    if (TITLE_TEMPLATES[title]) {
      setForm(prev => ({ ...prev, powers: JSON.parse(JSON.stringify(TITLE_TEMPLATES[title])) }));
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
              <input type="email" value={form.email} onChange={e => updateField('email', e.target.value)} placeholder="name@avadeti.com" required />
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
          <div className="form-section-title">Role & Powers</div>
          <div className="form-grid" style={{ marginBottom: 16 }}>
            <div className="form-field">
              <label>Role</label>
              <select value={form.role} onChange={e => updateField('role', e.target.value)}>
                <option value="employee">Employee</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            {form.role === 'admin' && (
              <div className="form-field">
                <label>Admin Title (auto-applies powers)</label>
                <select value={form.adminTitle} onChange={e => applyTitle(e.target.value)}>
                  <option value="">Custom...</option>
                  <option value="HR">HR</option>
                  <option value="Team Lead">Team Lead</option>
                  <option value="Manager">Manager</option>
                  <option value="Department Head">Department Head</option>
                </select>
              </div>
            )}
          </div>

          {/* Power checkboxes — shown for both admin and employee roles */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 12 }}>
              {form.role === 'admin'
                ? 'Tick individual powers or select a title template above'
                : 'Additional powers for this employee (optional)'}
            </div>
            {POWER_GROUPS.map(group => (
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
