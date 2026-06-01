import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import ProfilePhotoCropper from '../components/ProfilePhotoCropper';
import MyRecordedActivity from '../components/MyRecordedActivity';
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
  const [form, setForm] = useState({ phone: '', statusMessage: '', address: '', bloodGroup: '', emergencyContact: '', dateOfBirth: '' });
  const fileInputRef = useRef(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [cropFile, setCropFile] = useState(null);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);

  const loadProfile = useCallback(async () => {
    try {
      const { data } = await api.get('/onboarding/profile');
      setProfile(data);
      setForm({
        phone: data.phone || '',
        statusMessage: data.statusMessage || '',
        address: data.address || '',
        bloodGroup: data.bloodGroup || '',
        emergencyContact: data.emergencyContact || '',
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth).toISOString().split('T')[0] : ''
      });
    } catch {}
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const saveProfile = async () => {
    try {
      await api.put('/onboarding/profile', form);
      setEditing(false);
      loadProfile();
    } catch (e) {
      alert('Save failed: ' + (e.response?.data?.error || e.message));
    }
  };

  // Step 1: file picked → open cropper
  const pickAvatar = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { alert('Max 8 MB'); return; }
    setCropFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Step 2: cropper returns final 512×512 JPEG → upload
  const uploadCropped = async (cropped) => {
    setCropFile(null);
    setAvatarBusy(true);
    try {
      const fd = new FormData();
      fd.append('avatar', cropped);
      await api.post('/onboarding/profile/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      loadProfile();
    } catch (err) {
      alert('Upload failed: ' + (err.response?.data?.error || err.message));
    }
    setAvatarBusy(false);
  };

  const changePassword = async () => {
    setPwMsg(null);
    if (!pwForm.currentPassword || !pwForm.newPassword) {
      setPwMsg({ type: 'error', text: 'Fill both current and new password.' });
      return;
    }
    if (pwForm.newPassword !== pwForm.confirm) {
      setPwMsg({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }
    setPwBusy(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword
      });
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' });
      setPwMsg({ type: 'success', text: 'Password changed successfully.' });
    } catch (err) {
      setPwMsg({ type: 'error', text: err.response?.data?.error || 'Failed to change password.' });
    }
    setPwBusy(false);
  };

  if (!profile) return <div style={{ padding: 20, color: 'var(--ink-3)' }}>Loading...</div>;

  const roleName = profile.role === 'main_admin' ? 'Main Admin' :
    profile.role === 'admin' ? (profile.adminTitle || 'Admin') : 'Employee';

  return (
    <div className="profile-layout">
      {/* Header */}
      <div className="profile-header">
        <div className="profile-avatar" style={{
          background: profile.avatar ? `center/cover url(${profile.avatar})` : getGradient(profile._id),
          position: 'relative', cursor: 'pointer', overflow: 'hidden'
        }} onClick={() => fileInputRef.current?.click()}
           title="Click to change photo">
          {!profile.avatar && getInitials(profile.name)}
          {/* Always-visible camera button bottom-right */}
          <div style={{
            position: 'absolute', bottom: -2, right: -2,
            width: 28, height: 28, borderRadius: '50%',
            background: 'var(--indigo-deep, #4F46E5)', color: '#fff',
            border: '2px solid var(--bg-1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700,
            boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
            pointerEvents: 'none'
          }}>
            {avatarBusy ? '⏳' : '📷'}
          </div>
        </div>
        <input type="file" ref={fileInputRef} accept="image/*" style={{ display: 'none' }} onChange={pickAvatar} />
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
            <div className="onb-form-group">
              <label>Address</label>
              <input value={form.address} onChange={e => setForm(prev => ({ ...prev, address: e.target.value }))} placeholder="House, street, city, PIN" />
            </div>
            <div className="onb-form-group">
              <label>Date of Birth</label>
              <input type="date" value={form.dateOfBirth} onChange={e => setForm(prev => ({ ...prev, dateOfBirth: e.target.value }))} />
            </div>
            <div className="onb-form-group">
              <label>Blood Group</label>
              <select value={form.bloodGroup} onChange={e => setForm(prev => ({ ...prev, bloodGroup: e.target.value }))}>
                <option value="">— Select —</option>
                {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="onb-form-group">
              <label>Emergency Contact</label>
              <input value={form.emergencyContact} onChange={e => setForm(prev => ({ ...prev, emergencyContact: e.target.value }))} placeholder="Name + phone" />
            </div>
            <button
              style={{ padding: '8px 16px', background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
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
            <div className="profile-row">
              <span className="profile-row-label">Address</span>
              <span className="profile-row-value">{profile.address || '—'}</span>
            </div>
            <div className="profile-row">
              <span className="profile-row-label">Date of Birth</span>
              <span className="profile-row-value">{profile.dateOfBirth ? new Date(profile.dateOfBirth).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span>
            </div>
            <div className="profile-row">
              <span className="profile-row-label">Blood Group</span>
              <span className="profile-row-value">{profile.bloodGroup || '—'}</span>
            </div>
            <div className="profile-row">
              <span className="profile-row-label">Emergency Contact</span>
              <span className="profile-row-value">{profile.emergencyContact || '—'}</span>
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

      {/* Change Password */}
      <div className="profile-section">
        <h3>Change Password</h3>
        <div className="onb-form-group">
          <label>Current password</label>
          <input
            type="password"
            autoComplete="current-password"
            value={pwForm.currentPassword}
            onChange={e => setPwForm(p => ({ ...p, currentPassword: e.target.value }))}
          />
        </div>
        <div className="onb-form-group">
          <label>New password</label>
          <input
            type="password"
            autoComplete="new-password"
            value={pwForm.newPassword}
            onChange={e => setPwForm(p => ({ ...p, newPassword: e.target.value }))}
          />
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
            Min 8 chars, must include a number and a special character.
          </div>
        </div>
        <div className="onb-form-group">
          <label>Confirm new password</label>
          <input
            type="password"
            autoComplete="new-password"
            value={pwForm.confirm}
            onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
          />
        </div>
        {pwMsg && (
          <div style={{
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 12,
            marginBottom: 10,
            background: pwMsg.type === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
            color: pwMsg.type === 'success' ? '#10B981' : '#ef4444'
          }}>{pwMsg.text}</div>
        )}
        <button
          disabled={pwBusy}
          onClick={changePassword}
          style={{
            padding: '8px 16px',
            background: pwBusy ? '#475569' : 'linear-gradient(135deg,#6366F1,#8B5CF6)',
            border: 'none',
            borderRadius: 8,
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            cursor: pwBusy ? 'wait' : 'pointer',
            fontFamily: 'Inter, sans-serif'
          }}
        >
          {pwBusy ? 'Changing...' : 'Change Password'}
        </button>
      </div>

      {/* My recorded activity (monitoring transparency) */}
      <MyRecordedActivity />

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

      {/* Profile photo cropper modal */}
      {cropFile && (
        <ProfilePhotoCropper
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onSave={uploadCropped}
        />
      )}
    </div>
  );
}
