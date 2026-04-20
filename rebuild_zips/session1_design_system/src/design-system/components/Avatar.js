import React from 'react';
import './Avatar.css';

/**
 * Avatar — user avatar with optional status dot and gradient background.
 *
 * Props:
 *   - name: string              — display name (for initials + aria)
 *   - src: string | null        — optional image URL
 *   - size: "xs" | "sm" | "default" | "lg"  — 18 / 22 / 28 / 36
 *   - status: "online" | "away" | "offline" | null
 *   - gradient: number | string — 0-4 (auto-assigned by hash) or CSS gradient string
 *
 * Usage:
 *   <Avatar name="Priya M" status="online" />
 *   <Avatar name="Ravi" size="sm" gradient={1} />
 */
const GRADIENTS = [
  'linear-gradient(135deg, #6366F1, #8B5CF6)',  // indigo → violet
  'linear-gradient(135deg, #10B981, #06B6D4)',  // emerald → cyan
  'linear-gradient(135deg, #EC4899, #F472B6)',  // rose
  'linear-gradient(135deg, #F59E0B, #FBBF24)',  // amber → gold
  'linear-gradient(135deg, #06B6D4, #6366F1)',  // cyan → indigo
];

function initialsFrom(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function hashGradient(name) {
  if (!name) return GRADIENTS[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

function resolveGradient(g, name) {
  if (typeof g === 'number') return GRADIENTS[((g % GRADIENTS.length) + GRADIENTS.length) % GRADIENTS.length];
  if (typeof g === 'string' && g.trim()) return g;
  return hashGradient(name);
}

export default function Avatar({
  name = '',
  src = null,
  size = 'default',
  status = null,
  gradient,
  className = '',
  style = {},
  ...rest
}) {
  const bg = resolveGradient(gradient, name);
  const classes = [
    'ad-avatar',
    `ad-avatar--${size}`,
    className,
  ].filter(Boolean).join(' ');

  return (
    <span
      className={classes}
      style={{ background: src ? undefined : bg, ...style }}
      aria-label={name}
      {...rest}
    >
      {src ? (
        <img src={src} alt={name} className="ad-avatar__img" />
      ) : (
        <span className="ad-avatar__initials">{initialsFrom(name)}</span>
      )}
      {status && <span className={`ad-avatar__status ad-avatar__status--${status}`} />}
    </span>
  );
}

/**
 * AvatarCluster — overlapping avatars (for assignee groups, etc.)
 * Usage: <AvatarCluster names={['Priya M', 'Ravi K', 'Aisha S']} max={3} />
 */
export function AvatarCluster({ names = [], max = 4, size = 'sm', className = '' }) {
  const shown = names.slice(0, max);
  const overflow = Math.max(0, names.length - max);

  return (
    <span className={`ad-avatar-cluster ${className}`}>
      {shown.map((name, i) => (
        <Avatar key={`${name}-${i}`} name={name} size={size} />
      ))}
      {overflow > 0 && (
        <span
          className={`ad-avatar ad-avatar--${size} ad-avatar--overflow`}
          aria-label={`${overflow} more`}
        >
          <span className="ad-avatar__initials">+{overflow}</span>
        </span>
      )}
    </span>
  );
}
