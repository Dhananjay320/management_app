import { useState } from 'react';

const GRADIENTS = [
  'linear-gradient(135deg,#4F46E5,#6366F1)',
  'linear-gradient(135deg,#059669,#10B981)',
  'linear-gradient(135deg,#D97706,#F59E0B)',
  'linear-gradient(135deg,#7C3AED,#8B5CF6)',
  'linear-gradient(135deg,#0891B2,#06B6D4)',
  'linear-gradient(135deg,#DB2777,#EC4899)',
];

function pickGradient(seed) {
  const s = String(seed || '');
  const h = s.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return GRADIENTS[h % GRADIENTS.length];
}

function getInitials(name) {
  return (name || '??').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

/**
 * Avatar — accepts either a user object or explicit props.
 * Shows the user's photo when `avatar` is set, otherwise initials over a
 * gradient seeded from the user's _id (so the color is stable).
 *
 * Props:
 *   user        — { _id, name, avatar }   (preferred)
 *   src         — string                  (manual override)
 *   name        — string                  (when not passing user)
 *   id          — string                  (gradient seed when not passing user)
 *   size        — number  (default 32)
 *   style       — extra style overrides
 */
export default function Avatar({ user, src, name, id, size = 32, style = {} }) {
  const url = src || user?.avatar || null;
  const label = name ?? user?.name ?? '';
  const seed = id ?? user?._id ?? label;
  const [failed, setFailed] = useState(false);

  const baseStyle = {
    width: size,
    height: size,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: Math.max(9, Math.round(size * 0.36)),
    fontWeight: 700,
    flexShrink: 0,
    overflow: 'hidden',
    background: pickGradient(seed),
    letterSpacing: 0.3,
    ...style,
  };

  if (url && !failed) {
    return (
      <div style={baseStyle}>
        <img
          src={url}
          alt={label}
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    );
  }
  return <div style={baseStyle}>{getInitials(label)}</div>;
}
