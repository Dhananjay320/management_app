// ============================================================================
// WhiteboardListPage.js — overview of all whiteboards I own or can access.
// ============================================================================
// Session 31 (N2). Simple grid. Each card clicks through to the canvas.
// ============================================================================

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import {
  GlassPanel, PrimaryButton, GradientText, Icon,
} from '../design-system';
import ErrorState from '../components/ErrorState';
import { useFetchSafe } from '../hooks/useFetchSafe';
import './WhiteboardListPage.css';

function formatRelative(iso) {
  if (!iso) return '';
  const d = new Date(iso).getTime();
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function WhiteboardListPage() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  const { data: boards = [], loading, error, refetch } = useFetchSafe(
    async () => (await api.get('/whiteboards')).data, []
  );

  const createBoard = async () => {
    setCreating(true);
    try {
      const { data } = await api.post('/whiteboards', { title: 'Untitled board' });
      navigate(`/whiteboards/${data._id}`);
    } catch {} finally { setCreating(false); }
  };

  return (
    <div className="ad-wb-list">
      <header className="ad-wb-list__head ad-enter">
        <div>
          <h1 className="ad-wb-list__title">
            Your <GradientText>whiteboards</GradientText>
          </h1>
          <p className="ad-wb-list__sub">
            {loading ? 'Loading…' : `${boards.length} board${boards.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <PrimaryButton
          icon={<Icon.Plus size={14} />}
          onClick={createBoard}
          disabled={creating}
        >
          {creating ? 'Creating…' : 'New whiteboard'}
        </PrimaryButton>
      </header>

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : loading ? (
        <GlassPanel elevated className="ad-wb-list__state">Loading…</GlassPanel>
      ) : boards.length === 0 ? (
        <GlassPanel elevated className="ad-wb-list__state">
          <div className="ad-wb-list__empty-icon">🎨</div>
          <div className="ad-wb-list__empty-title">No whiteboards yet</div>
          <div className="ad-wb-list__empty-sub">
            Create one to brainstorm, sketch a flow, or run a retrospective.
          </div>
        </GlassPanel>
      ) : (
        <div className="ad-wb-list__grid">
          {boards.map(b => (
            <Link key={b._id} to={`/whiteboards/${b._id}`} className="ad-wb-card">
              <div className="ad-wb-card__preview">🎨</div>
              <div className="ad-wb-card__body">
                <div className="ad-wb-card__title">{b.title}</div>
                <div className="ad-wb-card__meta">
                  {b.owner?.name ? `by ${b.owner.name}` : ''}
                  {b.members?.length > 0 && ` · ${b.members.length} member${b.members.length === 1 ? '' : 's'}`}
                </div>
                <div className="ad-wb-card__time">Edited {formatRelative(b.updatedAt)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
