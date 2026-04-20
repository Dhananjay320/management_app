import React from 'react';

/**
 * GradientText — animated shimmer gradient text fill.
 *
 * Props:
 *   - variant: "primary" | "warn"       — primary = indigo-violet-pink, warn = amber
 *   - as: element or component          — default "span"
 *
 * Usage:
 *   <h1>Hi <GradientText>Ravi</GradientText> 👋</h1>
 *   <GradientText variant="warn">Today!</GradientText>
 *
 * Note: These animated gradients use CSS from animations.css (.ad-grad-text /
 *       .ad-grad-text-warn). GradientText is a thin wrapper that also works
 *       with arbitrary element types via the `as` prop.
 */
export default function GradientText({
  variant = 'primary',
  as: Component = 'span',
  className = '',
  children,
  ...rest
}) {
  const cls = variant === 'warn' ? 'ad-grad-text-warn' : 'ad-grad-text';
  return (
    <Component className={`${cls} ${className}`} {...rest}>
      {children}
    </Component>
  );
}
