// ============================================================================
// ContentEditorPage.js — create or edit a Content Hub article.
// ============================================================================
// Session 29 (N7). Shared form for POST /content (new) and PUT /content/:id
// (edit). Plain textarea for body — a future revision can swap in the
// existing TipTap editor if rich text becomes necessary.
// ============================================================================

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  GlassPanel, PrimaryButton, GradientText,
} from '../design-system';
import './ContentEditorPage.css';

const EMOJI_THUMBS = ['📚', '🎯', '💡', '🚀', '⚡', '🔧', '📊', '🎨', '🌱', '🧠', '🏆', '⭐'];

export default function ContentEditorPage() {
  const { id } = useParams();      // undefined = create mode
  const { user } = useAuth();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [cats, setCats] = useState({ categories: [], types: [] });
  const [form, setForm] = useState({
    title: '',
    excerpt: '',
    body: '',
    type: 'tutorial',
    category: '',
    url: '',
    thumbnail: '📚',
    tags: '',
    featured: false,
  });
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Permission check — prevent non-publishers from even rendering.
  const canPublish = user?.role === 'main_admin' || user?.powers?.content?.publish;
  const isMine = (author) => String(author?._id || author) === String(user?._id);

  useEffect(() => {
    api.get('/content/categories').then(r => setCats(r.data)).catch(() => {});
    if (isEdit) {
      api.get(`/content/${id}`)
        .then(r => {
          const item = r.data;
          // Only author or publisher can edit
          if (!canPublish && !isMine(item.author)) {
            navigate(`/content/${id}`);
            return;
          }
          setForm({
            title: item.title || '',
            excerpt: item.excerpt || '',
            body: item.body || '',
            type: item.type || 'tutorial',
            category: item.category || '',
            url: item.url || '',
            thumbnail: item.thumbnail || '📚',
            tags: (item.tags || []).join(', '),
            featured: item.featured || false,
          });
        })
        .catch(() => setError('Could not load article.'))
        .finally(() => setLoading(false));
    }
    // eslint-disable-next-line
  }, [id]);

  // Create mode permission check
  useEffect(() => {
    if (!isEdit && !canPublish) {
      navigate('/content');
    }
  }, [isEdit, canPublish, navigate]);

  const update = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    setError('');
    if (!form.title.trim()) { setError('Title is required.'); return; }
    if (!form.category) { setError('Category is required.'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      };
      if (isEdit) {
        await api.put(`/content/${id}`, payload);
        navigate(`/content/${id}`);
      } else {
        const { data } = await api.post('/content', payload);
        navigate(`/content/${data._id}`);
      }
    } catch (e) {
      setError(e.response?.data?.error || 'Could not save.');
    } finally { setSaving(false); }
  };

  if (loading) {
    return <GlassPanel elevated className="ad-ce__state">Loading…</GlassPanel>;
  }

  return (
    <div className="ad-ce">
      <header className="ad-ce__head ad-enter">
        <h1 className="ad-ce__title">
          {isEdit ? 'Edit' : 'New'} <GradientText>article</GradientText>
        </h1>
        <p className="ad-ce__sub">
          Share a tutorial, product update, or resource with your team.
        </p>
      </header>

      <GlassPanel elevated className="ad-ce__form">
        {error && <div className="ad-ce__error">{error}</div>}

        <div className="ad-ce__row">
          <label className="ad-ce__label">Title</label>
          <input
            className="ad-ce__input"
            value={form.title}
            onChange={e => update('title', e.target.value)}
            placeholder="A clear, specific title"
            maxLength={200}
          />
        </div>

        <div className="ad-ce__row">
          <label className="ad-ce__label">Excerpt</label>
          <input
            className="ad-ce__input"
            value={form.excerpt}
            onChange={e => update('excerpt', e.target.value)}
            placeholder="One-sentence summary shown in cards"
            maxLength={400}
          />
        </div>

        <div className="ad-ce__row-split">
          <div>
            <label className="ad-ce__label">Type</label>
            <select
              className="ad-ce__input"
              value={form.type}
              onChange={e => update('type', e.target.value)}
            >
              {cats.types.map(t => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="ad-ce__label">Category</label>
            <select
              className="ad-ce__input"
              value={form.category}
              onChange={e => update('category', e.target.value)}
            >
              <option value="">Choose…</option>
              {cats.categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="ad-ce__row">
          <label className="ad-ce__label">Thumbnail</label>
          <div className="ad-ce__emoji-grid">
            {EMOJI_THUMBS.map(em => (
              <button
                key={em}
                type="button"
                className={`ad-ce__emoji ${form.thumbnail === em ? 'ad-ce__emoji--active' : ''}`}
                onClick={() => update('thumbnail', em)}
              >
                {em}
              </button>
            ))}
          </div>
        </div>

        <div className="ad-ce__row">
          <label className="ad-ce__label">Body</label>
          <textarea
            className="ad-ce__input ad-ce__textarea"
            value={form.body}
            onChange={e => update('body', e.target.value)}
            placeholder="Write the article here. Separate paragraphs with blank lines."
            rows={14}
          />
          <div className="ad-ce__hint">
            Plain text — blank lines become paragraph breaks. ~{Math.max(1, Math.round((form.body || '').split(/\s+/).length / 200))} min read.
          </div>
        </div>

        <div className="ad-ce__row">
          <label className="ad-ce__label">External URL (optional)</label>
          <input
            className="ad-ce__input"
            value={form.url}
            onChange={e => update('url', e.target.value)}
            placeholder="https://… (e.g. for link-type resources)"
          />
        </div>

        <div className="ad-ce__row">
          <label className="ad-ce__label">Tags (comma-separated)</label>
          <input
            className="ad-ce__input"
            value={form.tags}
            onChange={e => update('tags', e.target.value)}
            placeholder="e.g. onboarding, remote, productivity"
          />
        </div>

        {canPublish && (
          <div className="ad-ce__row">
            <label className="ad-ce__check">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={e => update('featured', e.target.checked)}
              />
              Feature this article on the hub home
            </label>
          </div>
        )}

        <div className="ad-ce__actions">
          <button
            className="ad-ce__btn"
            onClick={() => navigate(isEdit ? `/content/${id}` : '/content')}
            disabled={saving}
          >
            Cancel
          </button>
          <PrimaryButton onClick={save} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Publish'}
          </PrimaryButton>
        </div>
      </GlassPanel>
    </div>
  );
}
