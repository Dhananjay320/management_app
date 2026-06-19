import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

// Persistent topbar pill — visible whenever today's entry hasn't been marked yet.
// Complements `useAutoMarkEntry` by giving users a manual fallback that survives
// failures the auto-mark hook can't recover from (GPS hangs, geofence blocks,
// flaky network on first load). Disappears as soon as entry exists.
//
// States:
//   loading  → silent placeholder while we check /attendance/today on mount
//   marked   → render nothing (sibling WorkTimer takes over)
//   idle     → "Mark Entry" — primary button, GPS not yet attempted
//   working  → "Marking…" — disabled, spinner
//   failed   → "⚠ Try again" + reason on hover — clickable
//   blocked  → "⚠ Out of office" — clickable, but routes to /attendance for details
export default function MarkEntryPill() {
  const [state, setState] = useState('loading'); // loading | marked | idle | working | failed | blocked
  const [reason, setReason] = useState('');
  const navigate = useNavigate();

  const checkStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/attendance/today');
      if (data?.entryTime) {
        setState('marked');
        return true;
      }
      // No entry yet — go to idle unless an attempt is in-flight
      setState(s => (s === 'working' ? s : 'idle'));
      return false;
    } catch {
      setState(s => (s === 'working' ? s : 'idle'));
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    checkStatus();

    // Re-check whenever the auto-mark hook reports success/failure
    const onMarked = () => { if (!cancelled) setState('marked'); };
    const onFailed = (e) => {
      if (cancelled) return;
      setReason(e.detail?.reason || '');
      setState(e.detail?.blocked ? 'blocked' : 'failed');
    };
    const onVis = () => { if (document.visibilityState === 'visible') checkStatus(); };

    window.addEventListener('auto-entry-marked', onMarked);
    window.addEventListener('auto-entry-failed', onFailed);
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      window.removeEventListener('auto-entry-marked', onMarked);
      window.removeEventListener('auto-entry-failed', onFailed);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [checkStatus]);

  const getCoords = () => new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    const t = setTimeout(() => resolve(null), 12000);
    navigator.geolocation.getCurrentPosition(
      p => { clearTimeout(t); resolve({ lat: p.coords.latitude, lng: p.coords.longitude }); },
      () => { clearTimeout(t); resolve(null); },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  });

  const handleClick = async () => {
    if (state === 'working' || state === 'marked' || state === 'loading') return;
    setState('working');
    setReason('');
    try {
      const coordinates = await getCoords();
      const { data } = await api.post('/attendance/mark-entry', { coordinates });
      if (data?.entryTime) {
        setState('marked');
        window.dispatchEvent(new CustomEvent('auto-entry-marked', {
          detail: { time: data.entryTime, method: data.verificationMethod }
        }));
      } else {
        await checkStatus();
      }
    } catch (err) {
      const blocked = !!err?.response?.data?.blocked;
      const detail = err?.response?.data?.error || err?.message || 'unknown error';
      setReason(detail);
      // Treat 400 "already marked" as success
      if (err?.response?.status === 400 && /already/i.test(detail)) {
        setState('marked');
        return;
      }
      // 409 off-day / holiday → render nothing (handled by 'marked' which hides the pill)
      if (err?.response?.status === 409 && err?.response?.data?.offDay) {
        setState('marked');
        return;
      }
      setState(blocked ? 'blocked' : 'failed');
    }
  };

  if (state === 'loading' || state === 'marked') return null;

  const palette = {
    idle:    { bg: 'rgba(99,102,241,0.12)',  border: 'rgba(99,102,241,0.40)',  color: '#6366F1', dot: '#6366F1', label: 'Mark Entry' },
    working: { bg: 'rgba(99,102,241,0.10)',  border: 'rgba(99,102,241,0.30)',  color: '#818CF8', dot: '#818CF8', label: 'Marking…' },
    failed:  { bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.35)',   color: '#EF4444', dot: '#EF4444', label: '⚠ Try Again' },
    blocked: { bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.35)',  color: '#D97706', dot: '#F59E0B', label: '⚠ Out of Office' }
  }[state];

  const title = state === 'failed'
    ? `Auto-entry failed: ${reason || 'unknown'}. Click to retry.`
    : state === 'blocked'
      ? `${reason || 'Not in office range'}. Click to open Attendance page.`
      : state === 'working' ? 'Getting GPS and submitting…' : 'Click to mark your entry';

  const onClick = state === 'blocked' ? () => navigate('/attendance') : handleClick;

  return (
    <button
      onClick={onClick}
      disabled={state === 'working'}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 10px', borderRadius: 8,
        fontSize: 11, fontWeight: 700,
        background: palette.bg,
        color: palette.color,
        border: `1px solid ${palette.border}`,
        cursor: state === 'working' ? 'wait' : 'pointer',
        marginRight: 8,
        whiteSpace: 'nowrap'
      }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: '50%', background: palette.dot,
        animation: state === 'working' ? 'pulse 1.4s ease-in-out infinite' : 'none'
      }} />
      {palette.label}
    </button>
  );
}
