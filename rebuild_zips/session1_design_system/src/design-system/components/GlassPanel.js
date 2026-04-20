import React from 'react';
import './GlassPanel.css';

/**
 * GlassPanel — the base glass surface used for cards, toolbars, panels.
 *
 * Props:
 *   - variant: "default" | "strong"  — strong is topbar/modal/drawer usage
 *   - elevated: boolean              — adds shadow-soft
 *   - glowing: boolean               — adds indigo glow (for CTAs, featured)
 *   - as: element or component       — default "div"
 *   - className, style, children, ...rest
 *
 * Usage:
 *   <GlassPanel elevated style={{ padding: 20 }}>...</GlassPanel>
 *   <GlassPanel variant="strong" as="header">...</GlassPanel>
 */
export default function GlassPanel({
  variant = 'default',
  elevated = false,
  glowing = false,
  as: Component = 'div',
  className = '',
  children,
  ...rest
}) {
  const classes = [
    'ad-glass',
    variant === 'strong' ? 'ad-glass--strong' : '',
    elevated ? 'ad-glass--elevated' : '',
    glowing ? 'ad-glass--glow' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <Component className={classes} {...rest}>
      {children}
    </Component>
  );
}
