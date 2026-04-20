import React, { forwardRef } from 'react';
import './IconButton.css';

/**
 * IconButton — square icon-only button used throughout the app.
 *
 * Props:
 *   - size: "sm" | "default" | "lg"    — 28 | 36 | 44
 *   - variant: "default" | "ghost" | "primary"
 *   - badge: string | number | null    — optional badge text (shows pulsing pill)
 *   - title: string                    — tooltip / aria-label (required for accessibility)
 *   - children: icon element (recommended: lucide-react icon)
 *   - ...rest: normal <button> props (onClick, etc.)
 *
 * Usage:
 *   <IconButton title="Notifications" badge="4" onClick={openNotifs}>
 *     <Bell size={16} />
 *   </IconButton>
 */
const IconButton = forwardRef(function IconButton(
  { size = 'default', variant = 'default', badge = null, title, className = '', children, ...rest },
  ref
) {
  const classes = [
    'ad-icon-btn',
    `ad-icon-btn--${size}`,
    `ad-icon-btn--${variant}`,
    'ad-focus',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      ref={ref}
      type="button"
      className={classes}
      title={title}
      aria-label={title}
      {...rest}
    >
      {children}
      {badge !== null && badge !== undefined && (
        <span className="ad-icon-btn__badge">{badge}</span>
      )}
    </button>
  );
});

export default IconButton;
