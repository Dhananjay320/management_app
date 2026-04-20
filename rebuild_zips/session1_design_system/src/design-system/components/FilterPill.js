import React from 'react';
import './FilterPill.css';

/**
 * FilterPill — toggleable filter with optional count badge.
 *
 * Props:
 *   - active: boolean
 *   - count: number | string | null
 *   - variant: "default" | "warn"    — warn uses danger gradient (for Overdue, etc.)
 *   - icon: ReactNode
 *   - onClick
 *
 * Usage:
 *   <FilterPill active={tab==='all'} count={47} onClick={() => setTab('all')}>All</FilterPill>
 *   <FilterPill variant="warn" active={tab==='overdue'} count={3}>Overdue</FilterPill>
 */
export default function FilterPill({
  active = false,
  count = null,
  variant = 'default',
  icon,
  onClick,
  className = '',
  children,
  ...rest
}) {
  const classes = [
    'ad-pill',
    active ? 'ad-pill--on' : '',
    variant === 'warn' ? 'ad-pill--warn' : '',
    'ad-focus',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button type="button" className={classes} onClick={onClick} {...rest}>
      {icon && <span className="ad-pill__icon">{icon}</span>}
      <span>{children}</span>
      {count !== null && count !== undefined && (
        <span className="ad-pill__count">{count}</span>
      )}
    </button>
  );
}
