// ============================================================================
// ContentDetailPage.js — reader view of a single Content Hub article.
// ============================================================================
// Session 29 (N7). Simple reader layout with: author avatar + meta,
// title hero, body (rendered as plain paragraphs for now — no markdown
// dependency), like button, and an edit/delete menu for authors/publishers.
// ============================================================================

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  GlassPanel, GradientText, Icon,
} from '../design-system';
import ErrorState from '../components/ErrorState';
import { useFetchSafe } from '../hooks/useFetchSafe';
import './ContentDetailPage.css';

function canManage(user, item) {
  if (!user || !item) return false;
  if (user.role === 'main_admin') return true;
  if (user.powers?.content?.publish) return true;
  return String(item.author?._id || item.author) === String(user._id);
}

const TYPE_LABELS = {
  tutorial: 'Tutorial',
  update:   'Product Update',
  insight:  'Insight',
  guide:    'Guide',
  resource: 'Resource',
};

function renderBody(body) {
  // Split by blank lines → paragraphs. Preserves simple line-break friendliness
  // without pulling in a markdown parser for what is essentially long-form text.
  if (!body) return null;
  return body.trim().split(/\n\s*\n/).map((para, i) => (
    <p key={i} className="ad-cd__para">{para}</p>
  ));
}

export default function ContentDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: item, loading, error, refetch } = useFetchSafe(
    async () => (await api.get(`/content/${id}`)).data,
    [id]
  );

  const [likedByMe, setLikedByMe] = useState(false);
  const [likes, setLikes] = useState(0);

  useEffect(() => {
    if (item) {
      setLikes(item.likes?.length || 0);
      setLikedByMe((item.likes || []).some(l => String(l) === String(user?._id)));
    }
  }, [item, user]);

  const toggleLike = async () => {
    try {
      const { data } = await api.post(`/content/${id}/like`);
      setLikes(data.likes);
      setLikedByMe(data.likedByMe);
    } catch {}
  };

  const deleteItem = async () => {
    if (!window.confirm('Delete this article? This cannot be undone.')) return;
    try {
      await api.delete(`/content/${id}`);
      navigate('/content');
    } catch {}
  };

  if (loading) return <GlassPanel elevated className="ad-cd__state">Loading…</GlassPanel>;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!item) return null;

  return (
    <article className="ad-cd">
      <Link to="/content" className="ad-cd__back">← Back to Learn</Link>

      <header className="ad-cd__head ad-enter">
        <div className="ad-cd__type">
          {item.thumbnail} · {TYPE_LABELS[item.type]} · {item.category}
        </div>
        <h1 className="ad-cd__title">
          <GradientText>{item.title}</GradientText>
        </h1>
        {item.excerpt && <p className="ad-cd__excerpt">{item.excerpt}</p>}
        <div className="ad-cd__meta">
          <span className="ad-cd__author">
            {item.author?.name || 'Unknown'}
            {item.author?.jobTitle && <span className="ad-cd__author-title"> · {item.author.jobTitle}</span>}
          </span>
          <span className="ad-cd__meta-sep">·</span>
          <span>{new Date(item.publishedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          <span className="ad-cd__meta-sep">·</span>
          <span>{item.readMinutes} min read</span>
          <span className="ad-cd__meta-sep">·</span>
          <span>{item.views} views</span>
        </div>

        {canManage(user, item) && (
          <div className="ad-cd__actions">
            <button className="ad-cd__btn" onClick={() => navigate(`/content/${id}/edit`)}>
              Edit
            </button>
            <button className="ad-cd__btn ad-cd__btn--danger" onClick={deleteItem}>
              Delete
            </button>
          </div>
        )}
      </header>

      {item.url && (
        <GlassPanel elevated className="ad-cd__link-card">
          <Icon.ArrowRight size={14} />
          <div className="ad-cd__link-text">
            <div className="ad-cd__link-label">External resource</div>
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="ad-cd__link-url">
              {item.url}
            </a>
          </div>
        </GlassPanel>
      )}

      <div className="ad-cd__body">
        {renderBody(item.body) || <p className="ad-cd__para ad-cd__para--empty">No content yet.</p>}
      </div>

      {item.tags && item.tags.length > 0 && (
        <div className="ad-cd__tags">
          {item.tags.map(t => (
            <span key={t} className="ad-cd__tag">#{t}</span>
          ))}
        </div>
      )}

      <footer className="ad-cd__foot">
        <button
          className={`ad-cd__like ${likedByMe ? 'ad-cd__like--active' : ''}`}
          onClick={toggleLike}
        >
          {likedByMe ? '❤️' : '🤍'} {likes} {likes === 1 ? 'like' : 'likes'}
        </button>
      </footer>
    </article>
  );
}
