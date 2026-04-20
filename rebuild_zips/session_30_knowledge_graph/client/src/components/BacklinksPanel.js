// ============================================================================
// BacklinksPanel.js — show inbound + outbound document links.
// ============================================================================
// Session 30 (N5). Appears in the workspace document editor below the
// body. Has two collapsible sections:
//
//   1. Linked mentions of this doc   — reverse query: who [[links]] to me
//   2. Links going out from this doc — resolved backlinksOut with broken-link detection
//
// Uses the [[Title]] convention documented at the top of WorkspacePage.
// ============================================================================

import { useEffect, useState } from 'react';
import api from '../services/api';
import './BacklinksPanel.css';

export default function BacklinksPanel({ docId, onOpenDoc }) {
  const [incoming, setIncoming] = useState(null);
  const [outgoing, setOutgoing] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get(`/workspace/documents/${docId}/backlinks-in`).then(r => r.data).catch(() => []),
      api.get(`/workspace/documents/${docId}/backlinks-out`).then(r => r.data).catch(() => []),
    ]).then(([inbound, outbound]) => {
      if (cancelled) return;
      setIncoming(inbound);
      setOutgoing(outbound);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [docId]);

  if (loading) return null;
  // No point showing the panel at all if both are empty — keeps the editor clean
  if (!incoming?.length && !outgoing?.length) return null;

  return (
    <div className="ad-bl">
      {incoming && incoming.length > 0 && (
        <section className="ad-bl__section">
          <h3 className="ad-bl__title">
            <span>🔗</span> Linked mentions ({incoming.length})
          </h3>
          <div className="ad-bl__list">
            {incoming.map(d => (
              <button
                key={d._id}
                className="ad-bl__item"
                onClick={() => onOpenDoc?.(d._id)}
              >
                <span className="ad-bl__item-title">{d.title}</span>
                {d.lastEditedBy?.name && (
                  <span className="ad-bl__item-sub">
                    · edited by {d.lastEditedBy.name}
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {outgoing && outgoing.length > 0 && (
        <section className="ad-bl__section">
          <h3 className="ad-bl__title">
            <span>↗️</span> Outgoing links ({outgoing.length})
          </h3>
          <div className="ad-bl__list">
            {outgoing.map((b, i) => (
              <button
                key={i}
                className={`ad-bl__item ${b.broken ? 'ad-bl__item--broken' : ''}`}
                onClick={() => b.targetId && !b.broken && onOpenDoc?.(b.targetId)}
                disabled={b.broken}
                title={b.broken ? 'Target document not found' : 'Open'}
              >
                <span className="ad-bl__item-title">
                  {b.titleLive || b.title}
                </span>
                {b.broken && <span className="ad-bl__item-sub">· broken</span>}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
