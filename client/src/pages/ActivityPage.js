import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import '../styles/activity.css';

const ACTIVITY_ICONS = {
  reading: '📖', video: '🎬', fun: '🎮', wellness: '🧘',
  learning: '🎓', celebration: '🎉', brainstorm: '💡', social: '☕'
};

const ACTIVITY_TYPES = ['all', 'reading', 'video', 'fun', 'wellness', 'learning', 'celebration', 'brainstorm', 'social'];

const GRADIENTS = [
  'linear-gradient(135deg,#6366F1,#8B5CF6)',
  'linear-gradient(135deg,#10B981,#06B6D4)',
  'linear-gradient(135deg,#F59E0B,#F97316)',
  'linear-gradient(135deg,#EC4899,#8B5CF6)',
  'linear-gradient(135deg,#EF4444,#F97316)',
  'linear-gradient(135deg,#06B6D4,#10B981)',
];

function getGradient(str) {
  const hash = (str || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return GRADIENTS[hash % GRADIENTS.length];
}

function getInitials(name) {
  return (name || '??').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export default function ActivityPage() {
  const { user } = useAuth();
  const [activities, setActivities] = useState([]);
  const [filter, setFilter] = useState('all');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: '', type: 'reading', description: '', audience: 'company', team: '', date: '', time: '', attachment: ''
  });
  const [teams, setTeams] = useState([]);
  const [activityTab, setActivityTab] = useState('upcoming');
  const [pastActivities, setPastActivities] = useState([]);

  const loadActivities = useCallback(async () => {
    try {
      const params = { upcoming: 'true' };
      if (filter !== 'all') params.type = filter;
      const { data } = await api.get('/activities', { params });
      setActivities(data);
    } catch {}
  }, [filter]);

  useEffect(() => { loadActivities(); }, [loadActivities]);

  // Load teams for team picker
  useEffect(() => {
    api.get('/teams').then(res => setTeams(res.data)).catch(() => {});
  }, []);

  const loadPastActivities = useCallback(async () => {
    try {
      const params = { past: 'true' };
      if (filter !== 'all') params.type = filter;
      const { data } = await api.get('/activities', { params });
      setPastActivities(data);
    } catch {}
  }, [filter]);

  useEffect(() => { if (activityTab === 'past') loadPastActivities(); }, [activityTab, loadPastActivities]);

  const createActivity = async () => {
    if (!form.title.trim() || !form.date) return;
    try {
      const dateTime = new Date(`${form.date}T${form.time || '09:00'}`);
      await api.post('/activities', {
        title: form.title,
        type: form.type,
        description: form.description,
        audience: form.audience,
        team: form.audience === 'team' ? form.team : undefined,
        date: dateTime.toISOString(),
        attachment: form.attachment || undefined
      });
      setCreating(false);
      setForm({ title: '', type: 'reading', description: '', audience: 'company', team: '', date: '', time: '', attachment: '' });
      loadActivities();
    } catch {}
  };

  const rsvp = async (activityId, response) => {
    try {
      await api.post(`/activities/${activityId}/rsvp`, { response });
      setActivities(prev => prev.map(a => {
        if (a._id !== activityId) return a;
        const updated = { ...a };
        if (response === 'join') {
          updated.rsvpJoin = [...(a.rsvpJoin || []).filter(u => (u._id || u) !== user._id), { _id: user._id, name: user.name }];
          updated.rsvpSkip = (a.rsvpSkip || []).filter(u => (u._id || u) !== user._id);
        } else {
          updated.rsvpSkip = [...(a.rsvpSkip || []).filter(u => (u._id || u) !== user._id), { _id: user._id, name: user.name }];
          updated.rsvpJoin = (a.rsvpJoin || []).filter(u => (u._id || u) !== user._id);
        }
        return updated;
      }));
    } catch {}
  };

  const hasJoined = (activity) => (activity.rsvpJoin || []).some(u => (u._id || u) === user._id);
  const hasSkipped = (activity) => (activity.rsvpSkip || []).some(u => (u._id || u) === user._id);

  return (
    <div className="act-layout">
      <div className="act-header">
        <h2>Daily Activity</h2>
        <button className="act-create-btn" onClick={() => setCreating(true)}>+ Create Activity</button>
      </div>

      {/* Filters */}
      <div className="act-filters">
        {ACTIVITY_TYPES.map(t => (
          <button key={t} className={`act-filter ${filter === t ? 'active' : ''}`} onClick={() => setFilter(t)}>
            {t === 'all' ? 'All' : `${ACTIVITY_ICONS[t]} ${t.charAt(0).toUpperCase() + t.slice(1)}`}
          </button>
        ))}
      </div>

      {/* Upcoming / Past toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {[['upcoming', 'Upcoming'], ['past', 'Past']].map(([k, l]) => (
          <button key={k} className={`act-filter ${activityTab === k ? 'active' : ''}`} onClick={() => setActivityTab(k)}>{l}</button>
        ))}
      </div>

      {/* Activity List */}
      {activityTab === 'past' && (
        pastActivities.length === 0 ? (
          <div className="act-empty">
            <div className="act-empty-icon">📋</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>No past activities</h3>
          </div>
        ) : (
          <div className="act-list">
            {pastActivities.map(act => (
              <div key={act._id} className="act-card" style={{ opacity: 0.7 }}>
                <div className={`act-icon act-icon-${act.type}`}>{ACTIVITY_ICONS[act.type] || '\uD83C\uDFAF'}</div>
                <div className="act-content">
                  <div className="act-title">{act.title}</div>
                  {act.description && <div className="act-description">{act.description}</div>}
                  <div className="act-meta">
                    <span className="act-meta-item">{'\uD83D\uDCC5'} {formatDate(act.date)}</span>
                    <span className="act-meta-item">{'\uD83D\uDD50'} {formatTime(act.date)}</span>
                    <span className="act-meta-item">by {act.createdBy?.name}</span>
                  </div>
                  {act.attachment && (
                    <div style={{ marginTop: 4 }}>
                      <a href={act.attachment} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: '#6366F1' }}>{'\uD83D\uDD17'} Attachment</a>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {activityTab === 'upcoming' && (activities.length === 0 ? (
        <div className="act-empty">
          <div className="act-empty-icon">🎯</div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>No upcoming activities</h3>
          <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>Create an activity for reading, fun, wellness, learning, or team bonding.</p>
        </div>
      ) : (
        <div className="act-list">
          {activities.map(act => (
            <div key={act._id} className="act-card">
              <div className={`act-icon act-icon-${act.type}`}>
                {ACTIVITY_ICONS[act.type] || '🎯'}
              </div>
              <div className="act-content">
                <div className="act-title">{act.title}</div>
                {act.description && <div className="act-description">{act.description}</div>}
                <div className="act-meta">
                  <span className="act-meta-item">📅 {formatDate(act.date)}</span>
                  <span className="act-meta-item">🕐 {formatTime(act.date)}</span>
                  <span className="act-audience-badge">
                    {act.audience === 'company' ? 'Company' : act.team?.name || 'Team'}
                  </span>
                  {act.isRecurring && (
                    <span className="act-recurring-badge">🔄 {act.recurringPattern}</span>
                  )}
                  <span className="act-meta-item">by {act.createdBy?.name}</span>
                </div>
                {/* Joined avatars */}
                {act.rsvpJoin?.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <div className="act-avatars">
                      {act.rsvpJoin.slice(0, 5).map((u, i) => (
                        <div key={u._id || i} className="act-avatar" style={{ background: getGradient(u._id || u) }} title={u.name}>
                          {getInitials(u.name)}
                        </div>
                      ))}
                    </div>
                    <span className="act-rsvp-count">
                      {act.rsvpJoin.length} joining
                    </span>
                  </div>
                )}
              </div>
              <div className="act-rsvp">
                <button
                  className={`act-rsvp-btn ${hasJoined(act) ? 'active-join' : 'join'}`}
                  onClick={() => rsvp(act._id, 'join')}
                >
                  {hasJoined(act) ? '✓ Joined' : 'Join'}
                </button>
                <button
                  className={`act-rsvp-btn ${hasSkipped(act) ? 'active-skip' : 'skip'}`}
                  onClick={() => rsvp(act._id, 'skip')}
                >
                  {hasSkipped(act) ? 'Skipped' : 'Skip'}
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* Create Modal */}
      {creating && (
        <div className="act-modal-overlay" onClick={() => setCreating(false)}>
          <div className="act-modal" onClick={e => e.stopPropagation()}>
            <div className="act-modal-header">
              <h3>Create Activity</h3>
              <button className="act-modal-close" onClick={() => setCreating(false)}>&times;</button>
            </div>
            <div className="act-modal-body">
              <div className="act-form-group">
                <label>Title *</label>
                <input value={form.title} onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))} placeholder="Activity title" />
              </div>
              <div className="act-form-group">
                <label>Type *</label>
                <select value={form.type} onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))}>
                  {Object.entries(ACTIVITY_ICONS).map(([key, icon]) => (
                    <option key={key} value={key}>{icon} {key.charAt(0).toUpperCase() + key.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div className="act-form-group">
                <label>Description</label>
                <textarea value={form.description} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))} placeholder="What's this about?" />
              </div>
              <div className="act-form-group">
                <label>Audience *</label>
                <select value={form.audience} onChange={e => setForm(prev => ({ ...prev, audience: e.target.value }))}>
                  <option value="company">Company</option>
                  <option value="team">Team</option>
                </select>
              </div>
              {form.audience === 'team' && (
                <div className="act-form-group">
                  <label>Team *</label>
                  <select value={form.team} onChange={e => setForm(prev => ({ ...prev, team: e.target.value }))}>
                    <option value="">Select a team...</option>
                    {teams.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                  </select>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="act-form-group" style={{ flex: 1 }}>
                  <label>Date *</label>
                  <input type="date" value={form.date} onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))} />
                </div>
                <div className="act-form-group" style={{ flex: 1 }}>
                  <label>Time</label>
                  <input type="time" value={form.time} onChange={e => setForm(prev => ({ ...prev, time: e.target.value }))} />
                </div>
              </div>
              <div className="act-form-group">
                <label>Attachment (Link URL)</label>
                <input value={form.attachment} onChange={e => setForm(prev => ({ ...prev, attachment: e.target.value }))} placeholder="https://..." />
              </div>
            </div>
            <div className="act-modal-footer">
              <button className="act-modal-cancel" onClick={() => setCreating(false)}>Cancel</button>
              <button className="act-modal-submit" onClick={createActivity} disabled={!form.title.trim() || !form.date}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
