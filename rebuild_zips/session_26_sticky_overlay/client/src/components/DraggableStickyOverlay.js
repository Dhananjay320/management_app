// ============================================================================
// DraggableStickyOverlay.js — floating pinned sticky notes on top of the app.
// ============================================================================
// Session 26 (N1). Each pinned sticky note renders as a small draggable
// + resizable glass panel positioned anywhere on the viewport. Position
// and size are persisted per-note via PUT /sticky-notes/:id/overlay so
// they stick across page navigation and browser sessions.
//
// Mounted once in AppLayout so notes stay visible while the user
// navigates between pages (that's the whole point of pinning them).
//
// Keyboard: once focused, arrow keys nudge the note by 10px for
// fine-tune positioning. Escape unpins.
//
// Debounced writes: dragging fires many mousemove events — we throttle
// the API call to every ~250ms plus a final flush on drop.
// ============================================================================

import { useEffect, useState, useRef, useCallback } from 'react';
import api from '../services/api';
import './DraggableStickyOverlay.css';

const MIN_W = 160;
const MIN_H = 120;
const MAX_W = 600;
const MAX_H = 600;
const SAVE_DEBOUNCE_MS = 250;

export default function DraggableStickyOverlay() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/sticky-notes/pinned');
      setNotes(data);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();

    // Refresh when a note is pinned/unpinned from the main page. We
    // broadcast via a custom event rather than socket to keep this
    // simple — pin state changes are rare and user-triggered.
    const handler = () => load();
    window.addEventListener('stickynote:pin-changed', handler);
    return () => window.removeEventListener('stickynote:pin-changed', handler);
  }, [load]);

  if (loading || notes.length === 0) return null;

  return (
    <div className="ad-sticky-overlay" aria-hidden={false}>
      {notes.map(note => (
        <OverlayNote
          key={note._id}
          note={note}
          onChange={(patch) => setNotes(prev => prev.map(n => n._id === note._id ? { ...n, ...patch } : n))}
          onUnpin={() => setNotes(prev => prev.filter(n => n._id !== note._id))}
        />
      ))}
    </div>
  );
}

function OverlayNote({ note, onChange, onUnpin }) {
  const ref = useRef(null);
  const [pos, setPos]     = useState({ x: note.overlayX,      y: note.overlayY });
  const [size, setSize]   = useState({ w: note.overlayWidth,  h: note.overlayHeight });
  const [content, setContent] = useState(note.content || '');
  const [editing, setEditing] = useState(false);
  const saveTimer = useRef(null);

  // Throttled save of position/size — call during drag, final flush on drop.
  const savePosition = useCallback((x, y, w, h) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.put(`/sticky-notes/${note._id}/overlay`, { x, y, width: w, height: h })
        .catch(() => {});
    }, SAVE_DEBOUNCE_MS);
  }, [note._id]);

  const saveContent = useCallback((c) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.put(`/sticky-notes/${note._id}`, { content: c }).catch(() => {});
    }, 800);
  }, [note._id]);

  const unpin = async () => {
    try {
      await api.put(`/sticky-notes/${note._id}/pin`, { pinned: false });
      onUnpin();
    } catch {}
  };

  // ─── Dragging ────────────────────────────────────────────────────────
  const onDragStart = (e) => {
    // Don't drag if the target is the textarea or a button
    if (e.target.closest('textarea') || e.target.closest('button') || e.target.closest('.ad-sticky-note__resize')) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = pos.x;
    const origY = pos.y;

    const onMove = (ev) => {
      const nx = Math.max(0, Math.min(window.innerWidth - 40,  origX + (ev.clientX - startX)));
      const ny = Math.max(0, Math.min(window.innerHeight - 40, origY + (ev.clientY - startY)));
      setPos({ x: nx, y: ny });
      savePosition(nx, ny, size.w, size.h);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      // Final flush
      setPos(curr => {
        onChange({ overlayX: curr.x, overlayY: curr.y });
        return curr;
      });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // ─── Resizing ────────────────────────────────────────────────────────
  const onResizeStart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const origW = size.w;
    const origH = size.h;

    const onMove = (ev) => {
      const nw = Math.max(MIN_W, Math.min(MAX_W, origW + (ev.clientX - startX)));
      const nh = Math.max(MIN_H, Math.min(MAX_H, origH + (ev.clientY - startY)));
      setSize({ w: nw, h: nh });
      savePosition(pos.x, pos.y, nw, nh);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setSize(curr => {
        onChange({ overlayWidth: curr.w, overlayHeight: curr.h });
        return curr;
      });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // ─── Keyboard nudge / unpin ─────────────────────────────────────────
  const onKeyDown = (e) => {
    if (editing) return; // let textarea handle keys
    const nudge = (dx, dy) => {
      const nx = Math.max(0, Math.min(window.innerWidth - 40, pos.x + dx));
      const ny = Math.max(0, Math.min(window.innerHeight - 40, pos.y + dy));
      setPos({ x: nx, y: ny });
      savePosition(nx, ny, size.w, size.h);
      onChange({ overlayX: nx, overlayY: ny });
      e.preventDefault();
    };
    switch (e.key) {
      case 'ArrowLeft':  return nudge(-10, 0);
      case 'ArrowRight': return nudge(10,  0);
      case 'ArrowUp':    return nudge(0,  -10);
      case 'ArrowDown':  return nudge(0,   10);
      case 'Escape':     return unpin();
      default:           return;
    }
  };

  return (
    <div
      ref={ref}
      className="ad-sticky-note"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseDown={onDragStart}
      style={{
        left: pos.x,
        top:  pos.y,
        width:  size.w,
        height: size.h,
        background: note.color || '#FEF3C7',
      }}
      role="note"
      aria-label={note.title || 'Sticky note'}
    >
      <div className="ad-sticky-note__head">
        <div className="ad-sticky-note__title">{note.title || 'Untitled'}</div>
        <button
          className="ad-sticky-note__unpin"
          onClick={unpin}
          title="Unpin from screen (Esc)"
          aria-label="Unpin"
        >
          ✕
        </button>
      </div>

      <textarea
        className="ad-sticky-note__body"
        value={content}
        onChange={(e) => { setContent(e.target.value); saveContent(e.target.value); }}
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
        onMouseDown={(e) => e.stopPropagation()}
        placeholder="Quick note…"
      />

      <div
        className="ad-sticky-note__resize"
        onMouseDown={onResizeStart}
        title="Drag to resize"
        aria-hidden="true"
      />
    </div>
  );
}
