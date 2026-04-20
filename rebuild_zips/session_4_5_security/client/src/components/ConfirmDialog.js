import React, { useEffect, useRef } from 'react';
import { GlassPanel, PrimaryButton, IconButton, Icon } from '../../design-system';
import './ConfirmDialog.css';

/**
 * ConfirmDialog — reusable confirmation modal for destructive / sensitive actions.
 *
 * Used throughout Security Panel, Task/Meeting delete, etc.
 *
 * Props:
 *   - open: boolean
 *   - title: string             — e.g. "Force logout Priya Mehta?"
 *   - message: ReactNode        — body copy
 *   - variant: "danger" | "warn" | "primary"
 *   - confirmLabel: string      — default "Confirm"
 *   - cancelLabel: string       — default "Cancel"
 *   - requireReason: boolean    — if true, shows a text area; onConfirm receives { reason }
 *   - reasonLabel: string       — label text for the reason field
 *   - reasonPlaceholder: string
 *   - minReasonLength: number   — default 5 if requireReason is true
 *   - loading: boolean
 *   - onConfirm: ({ reason? }) => void
 *   - onCancel: () => void
 *
 * Usage:
 *   <ConfirmDialog
 *     open={confirming}
 *     variant="danger"
 *     title="Force logout Priya?"
 *     message="This will immediately invalidate her current session."
 *     requireReason
 *     reasonPlaceholder="Why are you logging out this user?"
 *     onConfirm={({ reason }) => doLogout(reason)}
 *     onCancel={() => setConfirming(false)}
 *   />
 */
export default function ConfirmDialog({
  open = false,
  title = 'Are you sure?',
  message,
  variant = 'danger',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  requireReason = false,
  reasonLabel = 'Reason (for audit log)',
  reasonPlaceholder = 'Briefly explain why you are doing this…',
  minReasonLength = 5,
  loading = false,
  onConfirm,
  onCancel,
}) {
  const [reason, setReason] = React.useState('');
  const textareaRef = useRef(null);

  // Reset reason when opening
  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  // Focus the reason field on open, or the Confirm button if no reason required
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      if (requireReason && textareaRef.current) textareaRef.current.focus();
    }, 80);
    return () => clearTimeout(t);
  }, [open, requireReason]);

  // Dismiss on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape' && onCancel) onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmDisabled = loading || (requireReason && reason.trim().length < minReasonLength);

  const handleConfirm = () => {
    if (confirmDisabled) return;
    if (requireReason) onConfirm({ reason: reason.trim() });
    else onConfirm({});
  };

  return (
    <div className="ad-confirm" role="dialog" aria-modal="true" aria-labelledby="ad-confirm-title">
      <div className="ad-confirm__backdrop" onClick={onCancel} />
      <GlassPanel variant="strong" elevated className="ad-confirm__panel">
        <header className="ad-confirm__head">
          <div className={`ad-confirm__icon ad-confirm__icon--${variant}`}>
            <Icon.Shield size={20} />
          </div>
          <div className="ad-confirm__head-text">
            <h3 id="ad-confirm-title" className="ad-confirm__title">{title}</h3>
            {message && <p className="ad-confirm__message">{message}</p>}
          </div>
          <IconButton size="sm" variant="ghost" title="Cancel" onClick={onCancel}>
            <Icon.X size={14} />
          </IconButton>
        </header>

        {requireReason && (
          <div className="ad-confirm__reason">
            <label className="ad-label">{reasonLabel}</label>
            <textarea
              ref={textareaRef}
              className="ad-confirm__textarea"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPlaceholder}
              rows={3}
              maxLength={500}
            />
            <div className="ad-confirm__reason-meta">
              {reason.trim().length < minReasonLength
                ? `${minReasonLength - reason.trim().length} more character${minReasonLength - reason.trim().length === 1 ? '' : 's'} required`
                : `${reason.length} / 500`}
            </div>
          </div>
        )}

        <footer className="ad-confirm__foot">
          <button
            type="button"
            className="ad-confirm__cancel ad-focus"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <PrimaryButton
            variant={variant === 'primary' ? 'primary' : variant}
            loading={loading}
            disabled={confirmDisabled}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </PrimaryButton>
        </footer>
      </GlassPanel>
    </div>
  );
}
