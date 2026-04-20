import React, { forwardRef } from 'react';
import './PrimaryButton.css';

/**
 * PrimaryButton — the hero gradient CTA used for primary actions.
 *
 * Props:
 *   - variant: "primary" | "ai" | "danger" | "success"
 *   - size: "sm" | "default" | "lg"
 *   - loading: boolean
 *   - icon: ReactNode (rendered before children)
 *   - trailingIcon: ReactNode
 *   - glowOrbit: boolean — adds the rotating conic-gradient glow halo
 *
 * Usage:
 *   <PrimaryButton icon={<Plus size={16} />} onClick={create}>New task</PrimaryButton>
 *   <PrimaryButton variant="ai" icon={<Sparkles size={14} />}>Summarize</PrimaryButton>
 */
const PrimaryButton = forwardRef(function PrimaryButton(
  {
    variant = 'primary',
    size = 'default',
    loading = false,
    icon,
    trailingIcon,
    glowOrbit = false,
    className = '',
    children,
    disabled,
    ...rest
  },
  ref
) {
  const classes = [
    'ad-btn-primary',
    `ad-btn-primary--${variant}`,
    `ad-btn-primary--${size}`,
    glowOrbit ? 'ad-btn-primary--orbit' : '',
    loading ? 'ad-btn-primary--loading' : '',
    'ad-focus',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      ref={ref}
      type="button"
      className={classes}
      disabled={disabled || loading}
      {...rest}
    >
      {icon && <span className="ad-btn-primary__icon">{icon}</span>}
      <span className="ad-btn-primary__label">{children}</span>
      {trailingIcon && <span className="ad-btn-primary__icon">{trailingIcon}</span>}
      {variant === 'ai' && (
        <>
          <span className="ad-btn-primary__spark ad-btn-primary__spark--1" />
          <span className="ad-btn-primary__spark ad-btn-primary__spark--2" />
          <span className="ad-btn-primary__spark ad-btn-primary__spark--3" />
        </>
      )}
    </button>
  );
});

export default PrimaryButton;
