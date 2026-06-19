import { useEffect, useState, useCallback } from 'react';
import api from '../services/api';

// Admin drilldown: pick a user, pick a date range, see their screenshots in a
// grid with click-to-zoom. Reuses the /usage/admin/screenshots endpoint that
// already excludes _c-flagged rows.
//
// Usage:
//   <AdminScreenshotViewer userId="..." userName="..." onClose={() => ...} />
// Renders as a fullscreen modal.
export default function AdminScreenshotViewer({ userId, userName, onClose }) {
  const [shots, setShots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => new Date(Date.now() - 24 * 3600_000).toISOString().slice(0, 16));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 16));
  const [zoom, setZoom] = useState(null); // currently zoomed shot

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/usage/admin/screenshots/${userId}`, {
        params: { from: new Date(from).toISOString(), to: new Date(to).toISOString(), limit: 500 }
      });
      setShots(data || []);
    } catch {
      setShots([]);
    } finally {
      setLoading(false);
    }
  }, [userId, from, to]);

  useEffect(() => { load(); }, [load]);

  // Esc to close
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (zoom) setZoom(null);
        else onClose?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom, onClose]);

  return (
    <div
      onClick={() => onClose?.()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,17,28,0.85)', backdropFilter: 'blur(8px)',
        zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(1100px, 95vw)', height: 'min(85vh, 800px)', background: 'var(--bg-1)',
        border: '1px solid var(--line)', borderRadius: 14, display: 'flex', flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 22 }}>📸</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Screenshots — {userName}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{shots.length} shot{shots.length === 1 ? '' : 's'} in range</div>
          </div>
          <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
            style={{ background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 6, padding: '4px 8px', color: 'var(--ink)', fontSize: 11 }} />
          <span style={{ color: 'var(--ink-3)', fontSize: 11 }}>→</span>
          <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
            style={{ background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 6, padding: '4px 8px', color: 'var(--ink)', fontSize: 11 }} />
          <button onClick={load}
            style={{ background: 'var(--indigo)', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            Reload
          </button>
          <button onClick={onClose}
            style={{ background: 'transparent', color: 'var(--ink-3)', border: '1px solid var(--line)', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            ✕ Close
          </button>
        </div>

        {/* Grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 40, fontSize: 12 }}>Loading…</div>
          ) : shots.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 40, fontSize: 12 }}>
              No screenshots in this range. Try widening the date window or check that the desktop tracker is running for this user.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {shots.map(s => (
                <div key={s._id} onClick={() => setZoom(s)} style={{
                  cursor: 'zoom-in', borderRadius: 8, overflow: 'hidden',
                  border: '1px solid var(--line)', background: 'var(--glass)',
                  transition: 'transform 0.12s'
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
                  <img src={s.imageUrl} alt="" style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block', filter: s.blurred ? 'blur(8px)' : 'none' }} />
                  <div style={{ padding: '6px 8px', fontSize: 10, color: 'var(--ink-3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                    <span>{new Date(s.capturedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                    <span style={{ display: 'flex', gap: 4 }}>
                      {s.displayName && <span style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--indigo)', padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 700 }}>{s.displayName}</span>}
                      {s.blurred && <span style={{ color: 'var(--amber)' }}>blur</span>}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Zoom overlay */}
      {zoom && (
        <div onClick={() => setZoom(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 10000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out'
        }}>
          <img src={zoom.imageUrl} alt="" style={{ maxWidth: '95vw', maxHeight: '92vh', filter: zoom.blurred ? 'blur(12px)' : 'none' }} />
          <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '6px 14px', borderRadius: 6, fontSize: 11 }}>
            {new Date(zoom.capturedAt).toLocaleString()} — Esc / click to close
          </div>
        </div>
      )}
    </div>
  );
}
