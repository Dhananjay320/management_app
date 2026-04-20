import React from 'react';
import './LiveDot.css';

/**
 * LiveDot — pulsing emerald dot for "live", "active", "online" indicators.
 *
 * Props:
 *   - color: "emerald" | "amber" | "rose" | "indigo"  — default emerald
 *   - size: "xs" | "sm" | "default"                   — default is "default" (8px)
 *   - pulsing: boolean                                — default true
 *
 * Usage:
 *   <LiveDot />                          // green pulse
 *   <LiveDot color="amber" pulsing={false} />  // static amber
 */
export default function LiveDot({
  color = 'emerald',
  size = 'default',
  pulsing = true,
  className = '',
  style = {},
  ...rest
}) {
  const classes = [
    'ad-live-dot',
    `ad-live-dot--${color}`,
    `ad-live-dot--${size}`,
    pulsing ? 'ad-live-dot--pulsing' : '',
    className,
  ].filter(Boolean).join(' ');

  return <span className={classes} style={style} aria-hidden="true" {...rest} />;
}
