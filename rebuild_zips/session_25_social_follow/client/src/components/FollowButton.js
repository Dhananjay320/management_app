// ============================================================================
// FollowButton.js — follow/unfollow toggle for user profiles.
// ============================================================================
// Session 25 (N4). Drop-in button that reads current follow state, flips
// between "Follow" and "Following" (hover = "Unfollow"), and optionally
// opens a small popover to set a duration + note.
//
// Props:
//   userId          — target user id (required)
//   size            — 'sm' | 'md' (default 'md')
//   onChange(state) — callback fired after state changes, with new { isFollowing }
//   showDurationPicker — if true, clicking Follow opens a small picker
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import './FollowButton.css';

export default function FollowButton({
  userId,
  size = 'md',
  onChange,
  showDurationPicker = false,
}) {
  const [state, setState] = useState({ isFollowing: false, followId: null });
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [hover, setHover] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [note, setNote] = useState('');
  const [endAt, setEndAt] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/follows/is-following/${userId}`);
      setState(data);
    } catch {} finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  const follow = async (opts = {}) => {
    setPending(true);
    try {
      const body = { userId };
      if (opts.endAt) body.endAt = opts.endAt;
      if (opts.note)  body.note  = opts.note;
      await api.post('/follows', body);
      setState({ isFollowing: true });
      onChange?.({ isFollowing: true });
      setPickerOpen(false);
      setNote(''); setEndAt('');
    } catch {} finally { setPending(false); }
  };

  const unfollow = async () => {
    setPending(true);
    try {
      await api.delete(`/follows/by-user/${userId}`);
      setState({ isFollowing: false });
      onChange?.({ isFollowing: false });
    } catch {} finally { setPending(false); }
  };

  if (loading) {
    return <button className={`ad-fb ad-fb--${size} ad-fb--loading`} disabled>…</button>;
  }

  // Already following
  if (state.isFollowing) {
    const label = hover ? 'Unfollow' : 'Following ✓';
    return (
      <button
        className={`ad-fb ad-fb--${size} ${hover ? 'ad-fb--danger' : 'ad-fb--following'}`}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={unfollow}
        disabled={pending}
      >
        {pending ? '…' : label}
      </button>
    );
  }

  // Not following — clicking opens picker if enabled, or follows directly
  if (showDurationPicker && pickerOpen) {
    return (
      <div className="ad-fb-picker">
        <div className="ad-fb-picker__head">Follow this person</div>
        <label className="ad-fb-picker__label">Reason (optional)</label>
        <input
          className="ad-fb-picker__input"
          placeholder="e.g. mentoring, project X"
          value={note}
          onChange={e => setNote(e.target.value)}
          maxLength={200}
        />
        <label className="ad-fb-picker__label">Until (optional)</label>
        <input
          type="date"
          className="ad-fb-picker__input"
          value={endAt}
          onChange={e => setEndAt(e.target.value)}
        />
        <div className="ad-fb-picker__actions">
          <button
            className="ad-fb-picker__btn ad-fb-picker__btn--secondary"
            onClick={() => { setPickerOpen(false); setNote(''); setEndAt(''); }}
          >
            Cancel
          </button>
          <button
            className="ad-fb-picker__btn ad-fb-picker__btn--primary"
            onClick={() => follow({ note: note.trim() || undefined, endAt: endAt || undefined })}
            disabled={pending}
          >
            {pending ? 'Following…' : 'Follow'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      className={`ad-fb ad-fb--${size} ad-fb--primary`}
      onClick={() => {
        if (showDurationPicker) setPickerOpen(true);
        else follow();
      }}
      disabled={pending}
    >
      {pending ? 'Following…' : '+ Follow'}
    </button>
  );
}
