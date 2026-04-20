import React from 'react';
import './AmbientBackground.css';

/**
 * AmbientBackground — the 3 drifting gradient orbs that give every page its
 * "alive" feel. Mount once at the app root.
 *
 * Props:
 *   - suppressed: boolean — render nothing (for login screens, print view, etc.)
 *   - intensity: "default" | "quiet"   — quiet reduces opacity ~40%
 */
export default function AmbientBackground({ suppressed = false, intensity = 'default' }) {
  if (suppressed) return null;
  return (
    <div className={`ad-ambient ad-ambient--${intensity}`} aria-hidden="true">
      <span className="ad-orb ad-orb--a" />
      <span className="ad-orb ad-orb--b" />
      <span className="ad-orb ad-orb--c" />
    </div>
  );
}
