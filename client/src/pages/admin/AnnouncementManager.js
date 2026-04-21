import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';

export default function AnnouncementManager() {
  const [announcements, setAnnouncements] = useState([]);
  const [teams, setTeams] = useState([]);
  const [form, setForm] = useState({ title: '', content: '', audience: 'company', team: '' });
  const [creating, setCreating] = useState(false);

  const loadAnnouncements = useCallback(async () => {
    try {
      const { data } = await api.get('/announcements');
      setAnnouncements(data);
    } catch {}
  }, []);

  useEffect(() => { loadAnnouncements(); }, [loadAnnouncements]);

  useEffect(() => {
    api.get('/teams').then(res => setTeams(res.data)).catch(() => {});
  }, []);

  const createAnnouncement = async () => {
    if (!form.title.trim() || !form.content.trim()) return;
    try {
      await api.post('/announcements', {
        title: form.title,
        content: form.content,
        audience: form.audience,
        team: form.audience === 'team' ? form.team : undefined,
      });
      setForm({ title: '', content: '', audience: 'company', team: '' });
      setCreating(false);
      loadAnnouncements();
    } catch {}
  };

  const deleteAnnouncement = async (id) => {
    if (!window.confirm('Delete this announcement?')) return;
    try {
      await api.delete(`/announcements/${id}`);
      setAnnouncements(prev => prev.filter(a => a._id !== id));
    } catch {}
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Announcements</div>
          <div className="page-subtitle">Create and manage company announcements</div>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)} style={{
          padding: '8px 18px', fontSize: 13, fontWeight: 600, background: '#6366F1', color: '#fff',
          border: 'none', borderRadius: 8, cursor: 'pointer'
        }}>
          + New Announcement
        </button>
      </div>

      {creating && (
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Title *</label>
            <input
              value={form.title}
              onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Announcement title"
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13 }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Content *</label>
            <textarea
              value={form.content}
              onChange={e => setForm(prev => ({ ...prev, content: e.target.value }))}
              placeholder="Announcement content..."
              rows={4}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, resize: 'vertical' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Audience *</label>
              <select
                value={form.audience}
                onChange={e => setForm(prev => ({ ...prev, audience: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13 }}
              >
                <option value="company">Company</option>
                <option value="team">Team</option>
              </select>
            </div>
            {form.audience === 'team' && (
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Team *</label>
                <select
                  value={form.team}
                  onChange={e => setForm(prev => ({ ...prev, team: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13 }}
                >
                  <option value="">Select team...</option>
                  {teams.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setCreating(false)} style={{
              padding: '8px 16px', fontSize: 12, background: '#F1F5F9', color: '#475569',
              border: 'none', borderRadius: 8, cursor: 'pointer'
            }}>Cancel</button>
            <button onClick={createAnnouncement} disabled={!form.title.trim() || !form.content.trim()} style={{
              padding: '8px 16px', fontSize: 12, background: '#6366F1', color: '#fff',
              border: 'none', borderRadius: 8, cursor: 'pointer', opacity: (!form.title.trim() || !form.content.trim()) ? 0.5 : 1
            }}>Create</button>
          </div>
        </div>
      )}

      {announcements.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8', fontSize: 13 }}>
          No announcements yet. Create one to get started.
        </div>
      ) : (
        announcements.map(a => (
          <div key={a._id} className="card" style={{ padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', marginBottom: 4 }}>{a.title}</div>
                <div style={{ fontSize: 12, color: '#64748B', marginBottom: 8 }}>{a.content}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                    background: a.audience === 'company' ? 'rgba(99,102,241,0.08)' : 'rgba(16,185,129,0.08)',
                    color: a.audience === 'company' ? '#6366F1' : '#10B981',
                  }}>
                    {a.audience === 'company' ? 'Company' : a.team?.name || 'Team'}
                  </span>
                  <span style={{ fontSize: 10, color: '#94A3B8' }}>
                    {a.createdBy?.name} - {new Date(a.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <button onClick={() => deleteAnnouncement(a._id)} style={{
                padding: '4px 10px', fontSize: 11, background: 'rgba(239,68,68,0.08)', color: '#EF4444',
                border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600
              }}>Delete</button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
