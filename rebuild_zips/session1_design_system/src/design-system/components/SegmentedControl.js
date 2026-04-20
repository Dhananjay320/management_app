import React from 'react';
import './SegmentedControl.css';

/**
 * SegmentedControl — used for view switchers (Day/Week/Month, List/Board, etc.)
 *
 * Props:
 *   - options: Array<{ key: string, label: ReactNode, icon?: ReactNode }>
 *   - value: string (currently active key)
 *   - onChange: (key) => void
 *   - size: "sm" | "default"
 *
 * Usage:
 *   <SegmentedControl
 *     value={view}
 *     onChange={setView}
 *     options={[
 *       { key: 'day', label: 'Day' },
 *       { key: 'week', label: 'Week' },
 *       { key: 'month', label: 'Month' },
 *     ]}
 *   />
 */
export default function SegmentedControl({
  options = [],
  value,
  onChange,
  size = 'default',
  className = '',
}) {
  return (
    <div
      className={`ad-seg ad-seg--${size} ${className}`}
      role="tablist"
    >
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <button
            key={opt.key}
            type="button"
            role="tab"
            aria-selected={active}
            className={`ad-seg__btn ${active ? 'ad-seg__btn--on' : ''} ad-focus`}
            onClick={() => onChange && onChange(opt.key)}
          >
            {opt.icon && <span className="ad-seg__icon">{opt.icon}</span>}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
