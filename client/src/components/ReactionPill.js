import { useState, useRef } from 'react';

// Reaction pill with hover popover showing who reacted.
// Props:
//   emoji         — string
//   users         — array of user IDs (strings or objects with _id/name)
//   mine          — bool: current user reacted with this emoji
//   resolveName   — (userId) => string  (called for each user; should return display name)
//   onClick       — () => void
//   className     — extra class for the pill (optional)
//   align         — 'left' | 'right' (popover anchor)
export default function ReactionPill({ emoji, users = [], mine, resolveName, onClick, className = '', align = 'left' }) {
  const [hover, setHover] = useState(false);
  const ref = useRef(null);

  const names = (users || []).map((u) => {
    // Support both plain IDs and populated user objects
    if (typeof u === 'string') return resolveName ? resolveName(u) : 'Someone';
    if (u && typeof u === 'object') return u.name || (resolveName ? resolveName(u._id || u.toString()) : 'Someone');
    return 'Someone';
  });

  return (
    <span
      ref={ref}
      className={`reaction-pill ${mine ? 'mine' : ''} ${className}`.trim()}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{ position: 'relative' }}
    >
      <span style={{ fontSize: 14 }}>{emoji}</span>
      <span style={{ marginLeft: 4, fontSize: 11, fontWeight: 600 }}>{users?.length || 0}</span>

      {hover && names.length > 0 && (
        <span
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            [align]: 0,
            background: 'var(--bg-1)',
            border: '1px solid var(--line-2)',
            borderRadius: 8,
            padding: '6px 10px',
            boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
            zIndex: 50,
            minWidth: 140,
            maxWidth: 240,
            whiteSpace: 'normal',
            pointerEvents: 'auto',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
            Reacted with {emoji}
          </div>
          {names.map((n, i) => (
            <div key={i} style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink)', padding: '2px 0' }}>{n}</div>
          ))}
        </span>
      )}
    </span>
  );
}
