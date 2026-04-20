// ============================================================================
// ContentHubPage.js — browse learning content, guides, tutorials.
// ============================================================================
// Session 29 (N7). Three-pane feel:
//   1. Hero strip — featured items + recent
//   2. Category chip bar
//   3. Grid of content cards with search
// ============================================================================

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  GlassPanel, PrimaryButton, GradientText, Icon,
} from '../design-system';
import ErrorState from '../components/ErrorState';
import { useFetchSafe } from '../hooks/useFetchSafe';
import './ContentHubPage.css';

const TYPE_LABELS = {
  tutorial: 'Tutorial',
  update:   'Product Update',
  insight:  'Insight',
  guide:    'Guide',
  resource: 'Resource',
};

const TYPE_COLORS = {
  tutorial: '#6366F1',
  update:   '#10B981',
  insight:  '#F59E0B',
  guide:    '#8B5CF6',
  resource: '#06B6D4',
};

function canPublish(user) {
  return user?.role === 'main_admin' || user?.powers?.content?.publish;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 86400000;
  if (diff < 1) return 'Today';
  if (diff < 2) return 'Yesterday';
  if (diff < 7) return `${Math.floor(diff)} days ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ContentHubPage() {
  const { user } = useAuth();
  const [category, setCategory] = useState('');  // '' = all
  const [query, setQuery] = useState('');

  const { data: cats, loading: loadingCats } = useFetchSafe(
    async () => (await api.get('/content/categories')).data, []
  );
  const { data: featuredData, loading: loadingFeat, error: errorFeat, refetch: refetchFeat } = useFetchSafe(
    async () => (await api.get('/content/featured')).data, []
  );
  const { data: items = [], loading, error, refetch } = useFetchSafe(
    async () => (await api.get('/content', {
      params: { category: category || undefined, q: query || undefined, limit: 50 }
    })).data,
    [category, query]
  );

  const categories = cats?.categories || [];
  const featured = featuredData?.featured || [];
  const recent = featuredData?.recent || [];

  // Decide what to show in the main grid: if user has searched or filtered,
  // show `items`. Otherwise we show the `recent` list from featured endpoint
  // which already excludes featured dupes.
  const showFilterResults = Boolean(category || query);
  const gridItems = showFilterResults ? items : recent;

  return (
    <div className="ad-hub">
      <header className="ad-hub__head ad-enter">
        <div>
          <h1 className="ad-hub__title">
            <GradientText>Learn</GradientText>
          </h1>
          <p className="ad-hub__sub">
            Tutorials, guides, and product updates to help you get more done.
          </p>
        </div>
        <div className="ad-hub__head-actions">
          {canPublish(user) && (
            <PrimaryButton
              icon={<Icon.Plus size={14} />}
              onClick={() => { window.location.href = '/content/new'; }}
            >
              New article
            </PrimaryButton>
          )}
        </div>
      </header>

      {/* Featured hero — only on the default view */}
      {!showFilterResults && featured.length > 0 && (
        <div className="ad-hub__featured">
          <div className="ad-hub__section-head">
            <Icon.Sparkles size={14} /> <span>Featured</span>
          </div>
          <div className="ad-hub__featured-grid">
            {featured.map(item => (
              <FeaturedCard key={item._id} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* Filter + search */}
      <div className="ad-hub__filters">
        <div className="ad-hub__cat-chips">
          <button
            className={`ad-hub__cat ${!category ? 'ad-hub__cat--active' : ''}`}
            onClick={() => setCategory('')}
          >
            All
          </button>
          {!loadingCats && categories.map(c => (
            <button
              key={c}
              className={`ad-hub__cat ${category === c ? 'ad-hub__cat--active' : ''}`}
              onClick={() => setCategory(c === category ? '' : c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="ad-hub__search">
          <input
            className="ad-hub__search-input"
            placeholder="Search articles…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Main grid */}
      {(error || errorFeat) ? (
        <ErrorState error={error || errorFeat} onRetry={() => { refetch(); refetchFeat(); }} />
      ) : (loading || loadingFeat) ? (
        <GlassPanel elevated className="ad-hub__state">Loading articles…</GlassPanel>
      ) : gridItems.length === 0 ? (
        <GlassPanel elevated className="ad-hub__state">
          <div className="ad-hub__empty-icon">📚</div>
          <div className="ad-hub__empty-title">
            {showFilterResults ? 'No articles match your filter' : 'No content yet'}
          </div>
          <div className="ad-hub__empty-sub">
            {showFilterResults
              ? 'Try clearing the filter or searching a different term.'
              : 'Check back soon — new articles are published regularly.'}
          </div>
        </GlassPanel>
      ) : (
        <>
          <div className="ad-hub__section-head">
            <Icon.Newspaper size={14} />
            <span>{showFilterResults ? 'Results' : 'Latest'}</span>
          </div>
          <div className="ad-hub__grid">
            {gridItems.map(item => (
              <ContentCard key={item._id} item={item} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Featured card ────────────────────────────────────────────────────
function FeaturedCard({ item }) {
  const typeColor = TYPE_COLORS[item.type] || '#6366F1';
  return (
    <Link to={`/content/${item._id}`} className="ad-hub-feat">
      <div className="ad-hub-feat__thumb" style={{ background: `linear-gradient(135deg, ${typeColor}, ${typeColor}AA)` }}>
        {item.thumbnail || '📚'}
      </div>
      <div className="ad-hub-feat__body">
        <div className="ad-hub-feat__kicker" style={{ color: typeColor }}>
          {TYPE_LABELS[item.type]} · {item.category}
        </div>
        <div className="ad-hub-feat__title">{item.title}</div>
        {item.excerpt && <div className="ad-hub-feat__excerpt">{item.excerpt}</div>}
        <div className="ad-hub-feat__meta">
          <span>{item.author?.name}</span>
          <span>·</span>
          <span>{item.readMinutes} min read</span>
          <span>·</span>
          <span>{formatDate(item.publishedAt)}</span>
        </div>
      </div>
    </Link>
  );
}

// ─── Regular card ─────────────────────────────────────────────────────
function ContentCard({ item }) {
  const typeColor = TYPE_COLORS[item.type] || '#6366F1';
  return (
    <Link to={`/content/${item._id}`} className="ad-hub-card">
      <div className="ad-hub-card__thumb" style={{ background: `linear-gradient(135deg, ${typeColor}, ${typeColor}AA)` }}>
        {item.thumbnail || '📚'}
      </div>
      <div className="ad-hub-card__body">
        <div className="ad-hub-card__kicker" style={{ color: typeColor }}>
          {TYPE_LABELS[item.type]}
        </div>
        <div className="ad-hub-card__title">{item.title}</div>
        {item.excerpt && <div className="ad-hub-card__excerpt">{item.excerpt}</div>}
        <div className="ad-hub-card__meta">
          <span>{item.readMinutes}m · {item.views} views</span>
          <span>·</span>
          <span>{formatDate(item.publishedAt)}</span>
        </div>
      </div>
    </Link>
  );
}
