import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import '../styles/onboarding.css';

const GRADIENTS = [
  'linear-gradient(135deg,#6366F1,#8B5CF6)',
  'linear-gradient(135deg,#10B981,#06B6D4)',
  'linear-gradient(135deg,#F59E0B,#F97316)',
  'linear-gradient(135deg,#EC4899,#8B5CF6)',
];

function getGradient(str) {
  const hash = (str || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return GRADIENTS[hash % GRADIENTS.length];
}

function getInitials(name) {
  return (name || '??').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function ProfilePage() {
  // eslint-disable-next-line no-unused-vars
  const { user: _user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ phone: '', statusMessage: '' });

  const loadProfile = useCallback(async () => {
    try {
      const { data } = await api.get('/onboarding/profile');
      setProfile(data);
      setForm({ phone: data.phone || '', statusMessage: data.statusMessage || '' });
    } catch {}
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const saveProfile = async () => {
    try {
      await api.put('/onboarding/profile', form);
      setEditing(false);
      loadProfile();
    } catch {}
  };

  if (!profile) return <div style={{ padding: 20, color: 'var(--ink-3)' }}>Loading...</div>;

  const roleName = profile.role === 'main_admin' ? 'Main Admin' :
    profile.role === 'admin' ? (profile.adminTitle || 'Admin') : 'Employee';

  return (
    <div className="profile-layout">
      {/* Header */}
      <div className="profile-header">
        <div className="profile-avatar" style={{ background: getGradient(profile._id) }}>
          {getInitials(profile.name)}
        </div>
        <div className="profile-info">
          <h2>{profile.name}</h2>
          <div className="profile-info-sub">{profile.email}</div>
          <span className="profile-role-badge">{roleName}</span>
        </div>
      </div>

      {/* Personal Info */}
      <div className="profile-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3>Personal Information</h3>
          <button className="profile-edit-btn" onClick={() => setEditing(!editing)}>
            {editing ? 'Cancel' : 'Edit'}
          </button>
        </div>
        {editing ? (
          <div>
            <div className="onb-form-group">
              <label>Phone</label>
              <input value={form.phone} onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))} />
            </div>
            <div className="onb-form-group">
              <label>Status message</label>
              <input value={form.statusMessage} onChange={e => setForm(prev => ({ ...prev, statusMessage: e.target.value }))} />
            </div>
            <button
              style={{ padding: '8px 16px', background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', border: 'none', borderRadius: 8, color: 'var(--ink)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
              onClick={saveProfile}
            >
              Save
            </button>
          </div>
        ) : (
          <>
            <div className="profile-row">
              <span className="profile-row-label">Full Name</span>
              <span className="profile-row-value">{profile.name}</span>
            </div>
            <div className="profile-row">
              <span className="profile-row-label">Email</span>
              <span className="profile-row-value">{profile.email}</span>
            </div>
            <div className="profile-row">
              <span className="profile-row-label">Phone</span>
              <span className="profile-row-value">{profile.phone || '—'}</span>
            </div>
            <div className="profile-row">
              <span className="profile-row-label">Job Title</span>
              <span className="profile-row-value">{profile.jobTitle || '—'}</span>
            </div>
            <div className="profile-row">
              <span className="profile-row-label">Status</span>
              <span className="profile-row-value">{profile.statusMessage || '—'}</span>
            </div>
          </>
        )}
      </div>

      {/* Work Info */}
      <div className="profile-section">
        <h3>Work Information</h3>
        <div className="profile-row">
          <span className="profile-row-label">Role</span>
          <span className="profile-row-value">{roleName}</span>
        </div>
        <div className="profile-row">
          <span className="profile-row-label">Team(s)</span>
          <span className="profile-row-value">{profile.teams?.map(t => t.name).join(', ') || '—'}</span>
        </div>
        <div className="profile-row">
          <span className="profile-row-label">Office</span>
          <span className="profile-row-value">{profile.office?.name || '—'}</span>
        </div>
        <div className="profile-row">
          <span className="profile-row-label">Manager</span>
          <span className="profile-row-value">{profile.manager?.name || '—'}</span>
        </div>
        <div className="profile-row">
          <span className="profile-row-label">Work Type</span>
          <span className="profile-row-value">{profile.workType?.replace('_', ' ') || '—'}</span>
        </div>
      </div>

      {/* Settings Summary */}
      <div className="profile-section">
        <h3>Settings</h3>
        <div className="profile-row">
          <span className="profile-row-label">Calendar View</span>
          <span className="profile-row-value">{profile.settings?.calendarDefaultView || 'weekly'}</span>
        </div>
        <div className="profile-row">
          <span className="profile-row-label">Meeting Reminder</span>
          <span className="profile-row-value">{profile.settings?.meetingReminder || 10} min before</span>
        </div>
        <div className="profile-row">
          <span className="profile-row-label">Notification Sound</span>
          <span className="profile-row-value">{profile.settings?.notificationSound ? 'On' : 'Off'}</span>
        </div>
        <div className="profile-row">
          <span className="profile-row-label">Auto DND in Meetings</span>
          <span className="profile-row-value">{profile.settings?.autoDND ? 'On' : 'Off'}</span>
        </div>
      </div>
    </div>
  );
}
