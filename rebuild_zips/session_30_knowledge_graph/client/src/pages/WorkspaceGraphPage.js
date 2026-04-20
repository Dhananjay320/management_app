// ============================================================================
// WorkspaceGraphPage.js — visual graph of document backlinks in a workspace.
// ============================================================================
// Session 30 (N5). Fetches /workspace/:id/graph and renders the returned
// {nodes, edges} as an SVG. We use a simple deterministic layout: nodes
// placed on a circle, edges drawn as straight lines, with a quick
// weight-based radial arrangement so well-connected docs sit near the
// center. This keeps the component dependency-free (no d3, no vis.js).
//
// For workspaces with >60 documents the layout gets busy — in that case
// we show a compact list below the graph and hint the user to open
// specific docs directly.
// ============================================================================

import { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import {
  GlassPanel, GradientText,
} from '../design-system';
import ErrorState from '../components/ErrorState';
import { useFetchSafe } from '../hooks/useFetchSafe';
import './WorkspaceGraphPage.css';

const MAX_VIEW = 900;           // SVG viewBox width/height
const MAX_VISUAL_NODES = 60;    // above this, fall back to compact list

function layout(nodes, edges) {
  // Count incoming+outgoing connections per node — used to place well-connected
  // docs nearer the center, loose ones further out. Deterministic given input.
  const deg = new Map();
  for (const n of nodes) deg.set(n.id, 0);
  for (const e of edges) {
    deg.set(e.source, (deg.get(e.source) || 0) + 1);
    deg.set(e.target, (deg.get(e.target) || 0) + 1);
  }

  // Sort nodes by degree descending; place them in concentric rings.
  const sorted = [...nodes].sort((a, b) => (deg.get(b.id) || 0) - (deg.get(a.id) || 0));
  const cx = MAX_VIEW / 2;
  const cy = MAX_VIEW / 2;

  const positions = new Map();
  const RINGS = 3;
  const ringSizes = [Math.ceil(sorted.length * 0.2), Math.ceil(sorted.length * 0.3), sorted.length];
  let ring = 0;
  let placed = 0;

  sorted.forEach((node, idx) => {
    while (ring < RINGS - 1 && placed >= ringSizes[ring]) { ring++; }
    const ringRadius = 120 + ring * 150;
    const nodesInRing = ringSizes[ring] - (ring > 0 ? ringSizes[ring - 1] : 0);
    const indexInRing = placed - (ring > 0 ? ringSizes[ring - 1] : 0);
    const angle = (indexInRing / Math.max(1, nodesInRing)) * 2 * Math.PI - Math.PI / 2;
    positions.set(node.id, {
      x: cx + ringRadius * Math.cos(angle),
      y: cy + ringRadius * Math.sin(angle),
      degree: deg.get(node.id) || 0,
    });
    placed++;
  });

  return positions;
}

function truncate(s, n) {
  if (!s) return '';
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

export default function WorkspaceGraphPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [hover, setHover] = useState(null);

  const { data, loading, error, refetch } = useFetchSafe(
    async () => (await api.get(`/workspace/${id}/graph`)).data,
    [id]
  );

  const positions = useMemo(() => {
    if (!data) return new Map();
    return layout(data.nodes, data.edges);
  }, [data]);

  if (loading) {
    return <GlassPanel elevated className="ad-graph__state">Building graph…</GlassPanel>;
  }
  if (error) {
    return <ErrorState error={error} onRetry={refetch} />;
  }
  if (!data) return null;

  const { nodes, edges } = data;
  const showVisual = nodes.length > 0 && nodes.length <= MAX_VISUAL_NODES;

  return (
    <div className="ad-graph">
      <header className="ad-graph__head ad-enter">
        <div>
          <h1 className="ad-graph__title">
            <GradientText>Knowledge graph</GradientText>
          </h1>
          <p className="ad-graph__sub">
            {nodes.length} document{nodes.length === 1 ? '' : 's'} · {edges.length} connection{edges.length === 1 ? '' : 's'}
          </p>
        </div>
        <Link to={`/workspace?ws=${id}`} className="ad-graph__back">← Back to workspace</Link>
      </header>

      {nodes.length === 0 ? (
        <GlassPanel elevated className="ad-graph__state">
          <div className="ad-graph__empty-icon">🌐</div>
          <div className="ad-graph__empty-title">No documents yet</div>
          <div className="ad-graph__empty-sub">
            Create documents, link them with [[Title]] syntax, and come back to see the connections.
          </div>
        </GlassPanel>
      ) : showVisual ? (
        <GlassPanel elevated className="ad-graph__canvas-wrap">
          <svg className="ad-graph__canvas" viewBox={`0 0 ${MAX_VIEW} ${MAX_VIEW}`} role="img" aria-label="Document graph">
            {/* Edges first so nodes render on top */}
            {edges.map((e, i) => {
              const s = positions.get(e.source);
              const t = positions.get(e.target);
              if (!s || !t) return null;
              const highlighted = hover && (hover === e.source || hover === e.target);
              return (
                <line
                  key={i}
                  x1={s.x} y1={s.y}
                  x2={t.x} y2={t.y}
                  className={`ad-graph__edge ${highlighted ? 'ad-graph__edge--hi' : ''}`}
                />
              );
            })}
            {/* Nodes */}
            {nodes.map(n => {
              const p = positions.get(n.id);
              if (!p) return null;
              const r = Math.min(22, 10 + Math.sqrt(p.degree) * 3);
              const isHover = hover === n.id;
              return (
                <g
                  key={n.id}
                  className={`ad-graph__node ${isHover ? 'ad-graph__node--hi' : ''}`}
                  transform={`translate(${p.x}, ${p.y})`}
                  onMouseEnter={() => setHover(n.id)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => navigate(`/workspace?ws=${id}&doc=${n.id}`)}
                >
                  <circle r={r} className="ad-graph__node-circle" />
                  <text
                    y={r + 14}
                    textAnchor="middle"
                    className="ad-graph__node-label"
                  >
                    {truncate(n.title, 22)}
                  </text>
                </g>
              );
            })}
          </svg>
        </GlassPanel>
      ) : (
        <GlassPanel elevated className="ad-graph__list-wrap">
          <div className="ad-graph__list-note">
            {nodes.length} documents — too many for a readable graph. Below is a list with connection counts.
          </div>
          <div className="ad-graph__list">
            {[...nodes]
              .map(n => ({ ...n, degree: (positions.get(n.id)?.degree) || 0 }))
              .sort((a, b) => b.degree - a.degree)
              .map(n => (
                <button
                  key={n.id}
                  className="ad-graph__list-item"
                  onClick={() => navigate(`/workspace?ws=${id}&doc=${n.id}`)}
                >
                  <span className="ad-graph__list-title">{n.title}</span>
                  <span className="ad-graph__list-deg">
                    {n.degree} connection{n.degree === 1 ? '' : 's'}
                  </span>
                </button>
              ))}
          </div>
        </GlassPanel>
      )}
    </div>
  );
}
