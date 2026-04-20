import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import {
  GlassPanel, PrimaryButton, IconButton, SegmentedControl, Icon,
} from '../../design-system';
import ConfirmDialog from '../../components/ConfirmDialog';
import './AnnouncementManager.css';

/**
 * AnnouncementManager — the admin CRUD screen for announcements.
 *
 * Session 9: makes announcements actually manageable. Previously the audit
 * flagged that create worked but there was no UI to edit, delete, or see the
 * full history. This component fills that gap.
 *
 * Mount at `/admin/announcements`.
 */
export default function AnnouncementManager() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState('active');  // active | all
  const [editing, setEditing] = useState(null);  // null | 'new' | <id>
  const [form, setForm] = useState({ title: '', content: '', audience: 'company', team: '' });
  const [teams, setTeams] = useState([]);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const canManage = user?.role === 'main_admin' ||
    user?.powers?.announcements?.manageAll ||
    user?.powers?.announcements?.sendCompanyWide;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/announcements/all', {
        params: { includeInactive: scope === 'all' ? 'true' : 'false' },
      });
      setItems(data);
    } catch (err) {
      console.error('load announcements failed', err);
    } finally {
      setLoading(false);
    }
  }, [scope]);

  const loadTeams = useCallback(async () => {
    try {
      const { data } = await api.get('/teams');
      setTeams(data || []);
    } catch {
      setTeams([]);
    }
  }, []);

  useEffect(() => { load(); loadTeams(); }, [load, loadTeams]);

  const openNew = () => {
    setForm({ title: '', content: '', audience: 'company', team: '' });
    setEditing('new');
  };

  const openEdit = (ann) => {
    setForm({
      title: ann.title || '',
      content: ann.content || '',
      audience: ann.audience || 'company',
      team: ann.team?._id || ann.team || '',
    });
    setEditing(ann._id);
  };

  const closeForm = () => {
    setEditing(null);
    setForm({ title: '', content: '', audience: 'company', team: '' });
  };

  const save = async () => {
    if (!form.title.trim() || !form.content.trim()) return;
    if (form.audience === 'team' && !form.team) return;
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        audience: form.audience,
        team: form.audience === 'team' ? form.team : undefined,
      };
      if (editing === 'new') {
        await api.post('/announcements', payload);
      } else {
        await api.put(`/announcements/${editing}`, payload);
      }
      await load();
      closeForm();
    } catch (err) {
      console.error('save failed', err);
      alert(err.response?.data?.error || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    try {
      await api.delete(`/announcements/${deletingId}`);
      setDeletingId(null);
      await load();
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed.');
    }
  };

  if (!canManage) {
    return (
      <GlassPanel elevated style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: 'var(--ad-ink-2)' }}>You do not have permission to manage announcements.</p>
      </GlassPanel>
    );
  }

  return (
    <div className="ad-am">
      <header className="ad-am__head ad-enter">
        <div>
          <h1 className="ad-am__title">Announcements</h1>
          <p className="ad-am__sub">Create, edit, and manage company-wide and team announcements.</p>
        </div>
        <div className="ad-am__head-actions">
          <SegmentedControl
            value={scope}
            onChange={setScope}
            options={[
              { key: 'active', label: 'Active' },
              { key: 'all',    label: 'All'    },
            ]}
          />
          <PrimaryButton icon={<Icon.Plus size={14} />} onClick={openNew}>
            New announcement
          </PrimaryButton>
        </div>
      </header>

      {/* List */}
      <section className="ad-am__list">
        {loading ? (
          <GlassPanel elevated className="ad-am__state">Loading…</GlassPanel>
        ) : items.length === 0 ? (
          <GlassPanel elevated className="ad-am__state">
            <div className="ad-am__empty-icon"><Icon.Megaphone size={20} /></div>
            <div className="ad-am__empty-text">No announcements yet.</div>
          </GlassPanel>
        ) : items.map((ann, i) => (
          <GlassPanel
            key={ann._id}
            elevated
            className={`ad-am__row ad-enter ${!ann.isActive ? 'ad-am__row--archived' : ''}`}
            style={{ animationDelay: `${40 + i * 30}ms` }}
          >
            <div className="ad-am__row-icon">
              <Icon.Megaphone size={16} />
            </div>
            <div className="ad-am__row-body">
              <div className="ad-am__row-title">{ann.title}</div>
              <div className="ad-am__row-content">{ann.content}</div>
              <div className="ad-am__row-meta">
                <span className={`ad-am__pill ad-am__pill--${ann.audience}`}>
                  {ann.audience === 'company' ? 'Company' : `Team: ${ann.team?.name || '—'}`}
                </span>
                <span>by {ann.createdBy?.name || 'Unknown'}</span>
                <span>· {new Date(ann.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                {!ann.isActive && <span className="ad-am__archived-badge">Archived</span>}
              </div>
            </div>
            <div className="ad-am__row-actions">
              <IconButton size="sm" variant="ghost" title="Edit" onClick={() => openEdit(ann)}>
                <Icon.Settings size={14} />
              </IconButton>
              {ann.isActive && (
                <IconButton size="sm" variant="ghost" title="Delete" onClick={() => setDeletingId(ann._id)}>
                  <Icon.X size={14} />
                </IconButton>
              )}
            </div>
          </GlassPanel>
        ))}
      </section>

      {/* Form modal */}
      {editing && (
        <div className="ad-am__modal" role="dialog" aria-modal="true">
          <div className="ad-am__backdrop" onClick={closeForm} />
          <GlassPanel variant="strong" elevated className="ad-am__form">
            <header className="ad-am__form-head">
              <h2>{editing === 'new' ? 'New announcement' : 'Edit announcement'}</h2>
              <IconButton size="sm" variant="ghost" title="Close" onClick={closeForm}>
                <Icon.X size={14} />
              </IconButton>
            </header>

            <div className="ad-am__field">
              <label className="ad-label">Title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Quick heading users will see first"
                className="ad-am__input"
                maxLength={140}
              />
            </div>

            <div className="ad-am__field">
              <label className="ad-label">Content</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="The announcement body (plain text)."
                className="ad-am__textarea"
                rows={4}
                maxLength={2000}
              />
            </div>

            <div className="ad-am__field">
              <label className="ad-label">Audience</label>
              <SegmentedControl
                value={form.audience}
                onChange={(v) => setForm({ ...form, audience: v, team: v === 'team' ? form.team : '' })}
                options={[
                  { key: 'company', label: 'Everyone' },
                  { key: 'team',    label: 'One team' },
                ]}
              />
            </div>

            {form.audience === 'team' && (
              <div className="ad-am__field">
                <label className="ad-label">Team</label>
                <select
                  value={form.team}
                  onChange={(e) => setForm({ ...form, team: e.target.value })}
                  className="ad-am__select"
                >
                  <option value="">Select a team…</option>
                  {teams.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                </select>
              </div>
            )}

            <footer className="ad-am__form-foot">
              <button type="button" className="ad-am__cancel ad-focus" onClick={closeForm} disabled={saving}>
                Cancel
              </button>
              <PrimaryButton
                onClick={save}
                loading={saving}
                disabled={saving || !form.title.trim() || !form.content.trim() || (form.audience === 'team' && !form.team)}
              >
                {editing === 'new' ? 'Publish' : 'Save changes'}
              </PrimaryButton>
            </footer>
          </GlassPanel>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deletingId}
        variant="danger"
        title="Delete announcement?"
        message="It will be hidden from all users immediately. This action cannot be undone."
        confirmLabel="Delete"
        onCancel={() => setDeletingId(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
