// ============================================================================
// WhiteboardPage.js — infinite canvas whiteboard.
// ============================================================================
// Session 31 (N2). The canvas is an SVG in world coordinates, wrapped
// in a pan/zoom transform. Elements stay in world space; the transform
// maps world→screen.
//
// Tools:
//   select — click to select, drag to move, shift to multi-select (not wired yet)
//   sticky — click anywhere to drop a 180×120 sticky note
//   rect   — click-and-drag to draw a rectangle
//   text   — click to drop a text element (auto-focus for inline edit)
//   draw   — click-and-drag to freehand draw a polyline
//
// Pan: spacebar+drag OR middle-mouse drag OR two-finger trackpad
// Zoom: mouse wheel (zoom to cursor) OR pinch
//
// Save: debounced 1.5s after any change. Viewport saves every 5s.
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import ErrorState from '../components/ErrorState';
import './WhiteboardPage.css';

// ─── Utility: small id generator ────────────────────────────────────────
function uid() {
  return 'el_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

// Available tools with their cursors
const TOOLS = [
  { key: 'select', icon: '↖', label: 'Select' },
  { key: 'sticky', icon: '📝', label: 'Sticky' },
  { key: 'rect',   icon: '▭', label: 'Rectangle' },
  { key: 'text',   icon: 'T', label: 'Text' },
  { key: 'draw',   icon: '✏️', label: 'Draw' },
];

const STICKY_COLORS = ['#FEF3C7', '#FECACA', '#BFDBFE', '#D9F99D', '#E9D5FF', '#FED7AA'];

export default function WhiteboardPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket } = useSocket();
  const [board, setBoard] = useState(null);
  const [elements, setElements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Viewport — pan offset + zoom level. World coordinates.
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });

  // Tool state
  const [tool, setTool] = useState('select');
  const [stickyColor, setStickyColor] = useState(STICKY_COLORS[0]);

  // Session 32: selection is an array for multi-select. `editingId` stays
  // singular because only one element can be in text-edit mode at a time.
  const [selectedIds, setSelectedIds] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [draftShape, setDraftShape] = useState(null);   // in-progress rect or draw
  const [marquee, setMarquee] = useState(null);         // { startX, startY, x, y, w, h } in world coords
  const [isPanning, setIsPanning] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);

  // Session 32: undo/redo history. Each entry is a snapshot of the elements
  // array. Capped at 50 to prevent unbounded memory growth on long sessions.
  // `historyIdx` points at the current state; undo moves it back, redo
  // forward. New changes truncate any "forward" history beyond it.
  const historyRef = useRef({ stack: [], idx: -1 });
  const suppressHistoryRef = useRef(false);  // true during undo/redo + remote patches

  // Session 32: remote cursors keyed by userId.
  const [remoteCursors, setRemoteCursors] = useState({});
  // Map userId → cleanup timer (expire stale cursors after 4s of silence)
  const cursorTimersRef = useRef({});

  const svgRef = useRef(null);
  const saveTimer = useRef(null);
  const viewportSaveTimer = useRef(null);
  const cursorThrottleRef = useRef(0);
  // Compat alias — selectedId is the first selected (for existing single-sel code paths)
  const selectedId = selectedIds[0] || null;

  // ─── Load board ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    api.get(`/whiteboards/${id}`).then(r => {
      if (cancelled) return;
      setBoard(r.data);
      setElements(r.data.elements || []);
      if (r.data.viewport) setViewport(r.data.viewport);
      setLoading(false);
    }).catch(e => {
      if (cancelled) return;
      setError(e);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [id]);

  // ─── Session 32: history (undo/redo) ───────────────────────────────
  // Snapshot before mutation. Called by addElement/updateElement/deleteElement
  // so the "current" state can be walked back to. Respects suppressHistory
  // which undo/redo and remote patches set while they swap state.
  const pushHistory = useCallback((prevElements) => {
    if (suppressHistoryRef.current) return;
    const h = historyRef.current;
    // Drop any forward history past the current index
    h.stack = h.stack.slice(0, h.idx + 1);
    h.stack.push(JSON.parse(JSON.stringify(prevElements)));
    // Cap at 50 so very long sessions don't balloon memory
    if (h.stack.length > 50) {
      h.stack.shift();
    } else {
      h.idx++;
    }
  }, []);

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.idx < 0) return;
    const snapshot = h.stack[h.idx];
    h.idx--;
    suppressHistoryRef.current = true;
    setElements(snapshot);
    scheduleSave(snapshot);
    // Let React commit before re-enabling
    setTimeout(() => { suppressHistoryRef.current = false; }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const redo = useCallback(() => {
    const h = historyRef.current;
    if (h.idx >= h.stack.length - 1) return;
    h.idx++;
    const snapshot = h.stack[h.idx];
    suppressHistoryRef.current = true;
    setElements(snapshot);
    scheduleSave(snapshot);
    setTimeout(() => { suppressHistoryRef.current = false; }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Session 32: socket room + live patches ────────────────────────
  useEffect(() => {
    if (!socket || !id) return;
    socket.emit('whiteboard:join', id);

    // When someone else edits, apply their patch to our local elements.
    // suppressHistory so this doesn't count as an undoable user action.
    const onPatch = (data) => {
      if (!data || String(data.fromUserId) === String(user?._id)) return;
      suppressHistoryRef.current = true;
      setElements(prev => {
        if (data.op === 'upsert' && data.element) {
          const i = prev.findIndex(e => e.id === data.element.id);
          if (i >= 0) {
            const next = prev.slice();
            next[i] = data.element;
            return next;
          }
          return [...prev, data.element];
        }
        if (data.op === 'delete' && data.elementId) {
          return prev.filter(e => e.id !== data.elementId);
        }
        return prev;
      });
      setTimeout(() => { suppressHistoryRef.current = false; }, 0);
    };

    // Cursor ping from another user. Expire the dot if silent 4s.
    const onCursor = (data) => {
      if (!data?.userId || String(data.userId) === String(user?._id)) return;
      setRemoteCursors(prev => ({
        ...prev,
        [data.userId]: { x: data.x, y: data.y, name: data.name },
      }));
      // Reset stale-removal timer
      if (cursorTimersRef.current[data.userId]) clearTimeout(cursorTimersRef.current[data.userId]);
      cursorTimersRef.current[data.userId] = setTimeout(() => {
        setRemoteCursors(prev => {
          const next = { ...prev };
          delete next[data.userId];
          return next;
        });
      }, 4000);
    };

    const onUserLeft = (data) => {
      if (!data?.userId) return;
      setRemoteCursors(prev => {
        const next = { ...prev };
        delete next[data.userId];
        return next;
      });
    };

    socket.on('whiteboard:patch', onPatch);
    socket.on('whiteboard:cursor', onCursor);
    socket.on('whiteboard:user-left', onUserLeft);

    return () => {
      socket.emit('whiteboard:leave', id);
      socket.off('whiteboard:patch', onPatch);
      socket.off('whiteboard:cursor', onCursor);
      socket.off('whiteboard:user-left', onUserLeft);
      // Clear all cursor expire timers
      Object.values(cursorTimersRef.current).forEach(t => clearTimeout(t));
      cursorTimersRef.current = {};
    };
  }, [socket, id, user?._id]);

  // Helper: broadcast a patch. Wrapped so we can no-op when offline.
  const broadcastPatch = useCallback((op, element, elementId) => {
    if (!socket) return;
    socket.emit('whiteboard:patch', { boardId: id, op, element, elementId });
  }, [socket, id]);

  // ─── Save elements — debounced ──────────────────────────────────────
  const scheduleSave = useCallback((nextElements) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.put(`/whiteboards/${id}/elements`, { elements: nextElements })
        .catch(() => {});
    }, 1500);
  }, [id]);

  const scheduleViewportSave = useCallback((vp) => {
    if (viewportSaveTimer.current) clearTimeout(viewportSaveTimer.current);
    viewportSaveTimer.current = setTimeout(() => {
      api.put(`/whiteboards/${id}`, { viewport: vp }).catch(() => {});
    }, 5000);
  }, [id]);

  // Cleanup timers on unmount
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (viewportSaveTimer.current) clearTimeout(viewportSaveTimer.current);
  }, []);

  // ─── Keyboard: spacebar pan, delete, esc, undo/redo ──────────────
  useEffect(() => {
    const down = (e) => {
      if (editingId) return;  // don't intercept when editing text
      // Undo / redo — Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        return undo();
      }
      if (mod && ((e.shiftKey && e.key.toLowerCase() === 'z') || e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        return redo();
      }
      if (e.code === 'Space') { e.preventDefault(); setSpaceDown(true); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length) {
        e.preventDefault();
        deleteElements(selectedIds);
      }
      if (e.key === 'Escape') { setSelectedIds([]); setDraftShape(null); setMarquee(null); }
    };
    const up = (e) => {
      if (e.code === 'Space') setSpaceDown(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
    // eslint-disable-next-line
  }, [selectedIds, editingId, undo, redo]);

  // ─── Coord conversion — screen ↔ world ────────────────────────────
  const screenToWorld = useCallback((sx, sy) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: (sx - rect.left) / viewport.zoom - viewport.x,
      y: (sy - rect.top)  / viewport.zoom - viewport.y,
    };
  }, [viewport]);

  // ─── Element CRUD helpers ─────────────────────────────────────────
  const addElement = (el) => {
    const maxZ = elements.reduce((m, e) => Math.max(m, e.z || 0), 0);
    const newEl = { ...el, z: maxZ + 1 };
    pushHistory(elements);
    const next = [...elements, newEl];
    setElements(next);
    scheduleSave(next);
    broadcastPatch('upsert', newEl);
  };

  const updateElement = (elid, patch) => {
    const target = elements.find(e => e.id === elid);
    if (!target) return;
    pushHistory(elements);
    const updated = { ...target, ...patch };
    const next = elements.map(e => e.id === elid ? updated : e);
    setElements(next);
    scheduleSave(next);
    broadcastPatch('upsert', updated);
  };

  // Move many elements by the same delta — used for multi-select drag.
  // Single history entry for the whole group.
  const moveElements = (ids, dx, dy) => {
    pushHistory(elements);
    const idSet = new Set(ids);
    const next = elements.map(e => {
      if (!idSet.has(e.id)) return e;
      return { ...e, x: e.x + dx, y: e.y + dy };
    });
    setElements(next);
    scheduleSave(next);
    // Broadcast one patch per moved element
    next.forEach(e => { if (idSet.has(e.id)) broadcastPatch('upsert', e); });
  };

  const deleteElement = (elid) => {
    pushHistory(elements);
    const next = elements.filter(e => e.id !== elid);
    setElements(next);
    setSelectedIds([]);
    setEditingId(null);
    scheduleSave(next);
    broadcastPatch('delete', null, elid);
  };

  const deleteElements = (ids) => {
    if (!ids.length) return;
    pushHistory(elements);
    const idSet = new Set(ids);
    const next = elements.filter(e => !idSet.has(e.id));
    setElements(next);
    setSelectedIds([]);
    setEditingId(null);
    scheduleSave(next);
    ids.forEach(id => broadcastPatch('delete', null, id));
  };

  // ─── Canvas interactions ─────────────────────────────────────────
  const onCanvasMouseDown = (e) => {
    // Pan with spacebar or middle-mouse
    if (spaceDown || e.button === 1) {
      e.preventDefault();
      setIsPanning(true);
      const startX = e.clientX;
      const startY = e.clientY;
      const origVx = viewport.x;
      const origVy = viewport.y;
      const onMove = (ev) => {
        const nextVp = {
          ...viewport,
          x: origVx + (ev.clientX - startX) / viewport.zoom,
          y: origVy + (ev.clientY - startY) / viewport.zoom,
        };
        setViewport(nextVp);
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        setIsPanning(false);
        setViewport(curr => { scheduleViewportSave(curr); return curr; });
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      return;
    }

    // Only act on direct canvas clicks (not bubbling from elements)
    if (e.target.closest('.ad-wb-el')) return;

    const world = screenToWorld(e.clientX, e.clientY);

    if (tool === 'sticky') {
      addElement({
        id: uid(), type: 'sticky',
        x: world.x - 90, y: world.y - 60, w: 180, h: 120,
        data: { text: '', color: stickyColor },
      });
      setTool('select');
      return;
    }

    if (tool === 'text') {
      const newId = uid();
      addElement({
        id: newId, type: 'text',
        x: world.x, y: world.y, w: 200, h: 32,
        data: { text: 'Text', fontSize: 18, color: '#1E293B' },
      });
      setTool('select');
      setSelectedIds([newId]);
      setEditingId(newId);
      return;
    }

    if (tool === 'rect') {
      setDraftShape({ id: uid(), type: 'shape', startX: world.x, startY: world.y, x: world.x, y: world.y, w: 0, h: 0 });
      const onMove = (ev) => {
        const w = screenToWorld(ev.clientX, ev.clientY);
        setDraftShape(d => d && ({
          ...d,
          x: Math.min(d.startX, w.x), y: Math.min(d.startY, w.y),
          w: Math.abs(w.x - d.startX), h: Math.abs(w.y - d.startY),
        }));
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        setDraftShape(d => {
          if (d && d.w > 6 && d.h > 6) {
            addElement({
              id: d.id, type: 'shape',
              x: d.x, y: d.y, w: d.w, h: d.h,
              data: { variant: 'rect', fill: '#EDE9FE', stroke: '#6366F1' },
            });
          }
          return null;
        });
        setTool('select');
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      return;
    }

    if (tool === 'draw') {
      const points = [[world.x, world.y]];
      setDraftShape({ id: uid(), type: 'draw', points });
      const onMove = (ev) => {
        const w = screenToWorld(ev.clientX, ev.clientY);
        points.push([w.x, w.y]);
        setDraftShape(d => d && ({ ...d, points: [...points] }));
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        setDraftShape(d => {
          if (d && d.points.length > 2) {
            // compute bounding box
            const xs = d.points.map(p => p[0]);
            const ys = d.points.map(p => p[1]);
            const minX = Math.min(...xs), minY = Math.min(...ys);
            const maxX = Math.max(...xs), maxY = Math.max(...ys);
            addElement({
              id: d.id, type: 'draw',
              x: minX, y: minY, w: maxX - minX + 4, h: maxY - minY + 4,
              data: {
                // Store points relative to element origin for cleaner transforms later
                points: d.points.map(p => [p[0] - minX, p[1] - minY]),
                stroke: '#1E293B', strokeWidth: 2,
              },
            });
          }
          return null;
        });
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      return;
    }

    // Select tool: click on canvas starts marquee, drag to box-select
    if (tool === 'select') {
      const startWorld = screenToWorld(e.clientX, e.clientY);
      setMarquee({
        startX: startWorld.x, startY: startWorld.y,
        x: startWorld.x, y: startWorld.y, w: 0, h: 0,
      });
      let dragged = false;
      const onMove = (ev) => {
        const w = screenToWorld(ev.clientX, ev.clientY);
        const dx = w.x - startWorld.x;
        const dy = w.y - startWorld.y;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragged = true;
        setMarquee({
          startX: startWorld.x, startY: startWorld.y,
          x: Math.min(startWorld.x, w.x), y: Math.min(startWorld.y, w.y),
          w: Math.abs(dx), h: Math.abs(dy),
        });
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        setMarquee(curr => {
          if (dragged && curr) {
            // Find all elements fully inside marquee rect
            const hit = elements
              .filter(el => {
                const ex = el.x, ey = el.y, ew = el.w || 20, eh = el.h || 20;
                return ex >= curr.x && ey >= curr.y
                    && ex + ew <= curr.x + curr.w && ey + eh <= curr.y + curr.h;
              })
              .map(el => el.id);
            setSelectedIds(e.shiftKey ? [...new Set([...selectedIds, ...hit])] : hit);
          } else {
            // Plain click on empty canvas → clear selection
            setSelectedIds([]);
            setEditingId(null);
          }
          return null;
        });
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      return;
    }
  };

  // Session 32: throttled cursor broadcast — ~16fps is plenty smooth.
  const onCanvasMouseMove = (e) => {
    if (!socket) return;
    const now = Date.now();
    if (now - cursorThrottleRef.current < 60) return;
    cursorThrottleRef.current = now;
    const world = screenToWorld(e.clientX, e.clientY);
    socket.emit('whiteboard:cursor', {
      boardId: id,
      x: world.x, y: world.y,
      name: user?.name,
    });
  };

  // ─── Wheel zoom (to cursor) ──────────────────────────────────────
  const onWheel = (e) => {
    e.preventDefault();
    const rect = svgRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const delta = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const nextZoom = Math.max(0.1, Math.min(5, viewport.zoom * delta));
    // Keep the point under the cursor fixed:
    // worldX = sx / oldZoom - oldX; find newX so that worldX = sx / newZoom - newX
    const nextX = sx / nextZoom - (sx / viewport.zoom - viewport.x);
    const nextY = sy / nextZoom - (sy / viewport.zoom - viewport.y);
    const nextVp = { x: nextX, y: nextY, zoom: nextZoom };
    setViewport(nextVp);
    scheduleViewportSave(nextVp);
  };

  // ─── Element drag (select-tool) ─────────────────────────────────
  // Shift-click adds to selection. Clicking an unselected element replaces
  // the current selection with just it. Dragging a selected element moves
  // all selected elements together.
  const onElementMouseDown = (e, el) => {
    if (tool !== 'select') return;
    if (spaceDown) return;  // let the canvas handler pan
    e.stopPropagation();

    // Manage selection state
    const alreadySelected = selectedIds.includes(el.id);
    let groupIds;
    if (e.shiftKey) {
      if (alreadySelected) {
        const next = selectedIds.filter(x => x !== el.id);
        setSelectedIds(next);
        return;  // just toggled off — no drag
      }
      groupIds = [...selectedIds, el.id];
      setSelectedIds(groupIds);
    } else if (alreadySelected) {
      groupIds = selectedIds;
    } else {
      groupIds = [el.id];
      setSelectedIds(groupIds);
    }
    if (editingId && editingId !== el.id) setEditingId(null);

    // Drag whole group
    const startMouse = { x: e.clientX, y: e.clientY };
    // Snapshot positions of all elements in the group at drag start
    const startPositions = new Map();
    elements.forEach(e2 => {
      if (groupIds.includes(e2.id)) startPositions.set(e2.id, { x: e2.x, y: e2.y });
    });
    let dragged = false;

    const onMove = (ev) => {
      const dx = (ev.clientX - startMouse.x) / viewport.zoom;
      const dy = (ev.clientY - startMouse.y) / viewport.zoom;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) dragged = true;
      setElements(prev => prev.map(e2 => {
        const start = startPositions.get(e2.id);
        if (!start) return e2;
        return { ...e2, x: start.x + dx, y: start.y + dy };
      }));
    };
    const onUp = (ev) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (!dragged) return;
      const dx = (ev.clientX - startMouse.x) / viewport.zoom;
      const dy = (ev.clientY - startMouse.y) / viewport.zoom;
      // Push ONE history entry for the whole group move, then persist.
      moveElements(groupIds, dx, dy);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // ─── Title update ────────────────────────────────────────────────
  const saveTitle = (newTitle) => {
    if (!newTitle.trim()) return;
    api.put(`/whiteboards/${id}`, { title: newTitle }).catch(() => {});
    setBoard(b => b && ({ ...b, title: newTitle }));
  };

  // ─── Session 32: Export to SVG / PNG ─────────────────────────────
  // We compute a bounding box over all elements and render a fresh,
  // self-contained SVG string — not a clone of the on-screen SVG, because
  // that includes interactive state (selection outlines, handles, cursors).
  // The PNG path rasterizes via <canvas>.
  const exportAsSvg = () => {
    const svg = buildExportSvg(elements);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    triggerDownload(blob, `${board?.title || 'whiteboard'}.svg`);
  };

  const exportAsPng = async () => {
    const svg = buildExportSvg(elements);
    const svgBlob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(svgBlob);
    try {
      const img = new Image();
      img.src = url;
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      // Opaque white background looks better than transparent for PNG.
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(blob => {
        if (blob) triggerDownload(blob, `${board?.title || 'whiteboard'}.png`);
      }, 'image/png');
    } finally { URL.revokeObjectURL(url); }
  };

  if (loading) return <div className="ad-wb__loading">Loading whiteboard…</div>;
  if (error) return <ErrorState error={error} onRetry={() => window.location.reload()} />;
  if (!board) return null;

  const transform = `translate(${viewport.x * viewport.zoom}, ${viewport.y * viewport.zoom}) scale(${viewport.zoom})`;
  const cursor = isPanning || spaceDown ? 'grabbing' :
                 tool === 'select' ? 'default' :
                 tool === 'draw' ? 'crosshair' :
                 'crosshair';

  return (
    <div className="ad-wb">
      {/* Top bar */}
      <div className="ad-wb__topbar">
        <Link to="/whiteboards" className="ad-wb__back">←</Link>
        <input
          className="ad-wb__title"
          defaultValue={board.title}
          onBlur={e => saveTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
        />
        <div className="ad-wb__topbar-meta">
          Zoom {Math.round(viewport.zoom * 100)}%
          {Object.keys(remoteCursors).length > 0 && (
            <span className="ad-wb__live-badge">
              {Object.keys(remoteCursors).length} live
            </span>
          )}
        </div>
        <button
          className="ad-wb__btn"
          onClick={undo}
          disabled={historyRef.current.idx < 0}
          title="Undo (Ctrl/Cmd+Z)"
        >
          ↶ Undo
        </button>
        <button
          className="ad-wb__btn"
          onClick={redo}
          disabled={historyRef.current.idx >= historyRef.current.stack.length - 1}
          title="Redo (Ctrl/Cmd+Shift+Z)"
        >
          ↷ Redo
        </button>
        <button
          className="ad-wb__btn"
          onClick={() => { setViewport({ x: 0, y: 0, zoom: 1 }); scheduleViewportSave({ x: 0, y: 0, zoom: 1 }); }}
          title="Reset view"
        >
          Reset view
        </button>
        <button
          className="ad-wb__btn"
          onClick={exportAsPng}
          title="Export as PNG"
        >
          ⤓ PNG
        </button>
        <button
          className="ad-wb__btn"
          onClick={exportAsSvg}
          title="Export as SVG"
        >
          ⤓ SVG
        </button>
      </div>

      {/* Tools */}
      <div className="ad-wb__toolbar">
        {TOOLS.map(t => (
          <button
            key={t.key}
            className={`ad-wb__tool ${tool === t.key ? 'ad-wb__tool--active' : ''}`}
            onClick={() => setTool(t.key)}
            title={t.label}
          >
            <span className="ad-wb__tool-icon">{t.icon}</span>
          </button>
        ))}
        {tool === 'sticky' && (
          <>
            <div className="ad-wb__toolbar-sep" />
            {STICKY_COLORS.map(c => (
              <button
                key={c}
                className={`ad-wb__swatch ${stickyColor === c ? 'ad-wb__swatch--active' : ''}`}
                style={{ background: c }}
                onClick={() => setStickyColor(c)}
                title="Color"
              />
            ))}
          </>
        )}
      </div>

      {/* Canvas */}
      <div className="ad-wb__canvas-wrap" style={{ cursor }}>
        <svg
          ref={svgRef}
          className="ad-wb__canvas"
          onMouseDown={onCanvasMouseDown}
          onMouseMove={onCanvasMouseMove}
          onWheel={onWheel}
        >
          {/* Subtle dotted grid for orientation */}
          <defs>
            <pattern id="wb-grid" x={viewport.x * viewport.zoom % (20 * viewport.zoom)}
                              y={viewport.y * viewport.zoom % (20 * viewport.zoom)}
                              width={20 * viewport.zoom} height={20 * viewport.zoom}
                              patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.8" fill="rgba(148, 163, 184, 0.35)" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#wb-grid)" />

          <g transform={transform}>
            {/* Render elements sorted by z then insertion order */}
            {[...elements].sort((a, b) => (a.z || 0) - (b.z || 0)).map(el => (
              <WhiteboardElement
                key={el.id}
                el={el}
                selected={selectedIds.includes(el.id)}
                editing={editingId === el.id}
                onMouseDown={(e) => onElementMouseDown(e, el)}
                onDoubleClick={() => { setSelectedIds([el.id]); setEditingId(el.id); }}
                onBlurEdit={() => setEditingId(null)}
                onUpdate={(patch) => updateElement(el.id, patch)}
              />
            ))}

            {/* In-progress draft rect */}
            {draftShape && draftShape.type === 'shape' && (
              <rect
                x={draftShape.x} y={draftShape.y} width={draftShape.w} height={draftShape.h}
                fill="#EDE9FE" stroke="#6366F1" strokeWidth="2" strokeDasharray="4"
              />
            )}

            {/* In-progress draft draw */}
            {draftShape && draftShape.type === 'draw' && (
              <polyline
                points={draftShape.points.map(p => p.join(',')).join(' ')}
                fill="none" stroke="#1E293B" strokeWidth="2"
              />
            )}

            {/* Session 32: marquee drag-selection rectangle */}
            {marquee && (marquee.w > 2 || marquee.h > 2) && (
              <rect
                x={marquee.x} y={marquee.y}
                width={marquee.w} height={marquee.h}
                fill="rgba(99, 102, 241, 0.08)"
                stroke="#6366F1"
                strokeWidth={1 / viewport.zoom}
                strokeDasharray={`${4 / viewport.zoom} ${4 / viewport.zoom}`}
                pointerEvents="none"
              />
            )}

            {/* Session 32: resize handles — only when exactly one element selected,
                and it's a sticky/shape/text (not a freehand stroke whose bbox is
                tricky to resize meaningfully). */}
            {selectedIds.length === 1 && !editingId && (() => {
              const el = elements.find(e => e.id === selectedIds[0]);
              if (!el || el.type === 'draw') return null;
              return (
                <ResizeHandles
                  el={el}
                  zoom={viewport.zoom}
                  onResize={(patch) => updateElement(el.id, patch)}
                />
              );
            })()}

            {/* Session 32: remote user cursors */}
            {Object.entries(remoteCursors).map(([uid, c]) => (
              <g key={uid} transform={`translate(${c.x}, ${c.y})`} pointerEvents="none">
                <path
                  d="M 0 0 L 0 16 L 5 12 L 9 20 L 12 18 L 8 10 L 15 10 Z"
                  fill="#8B5CF6"
                  stroke="white"
                  strokeWidth={1 / viewport.zoom}
                />
                {c.name && (
                  <g transform={`translate(18, 8) scale(${1 / viewport.zoom})`}>
                    <rect
                      x={0} y={-10} rx={4} ry={4}
                      width={Math.max(40, c.name.length * 7 + 10)} height={18}
                      fill="#8B5CF6"
                    />
                    <text x={5} y={3} fill="white" fontSize={11} fontFamily="Inter, sans-serif" fontWeight={600}>
                      {c.name}
                    </text>
                  </g>
                )}
              </g>
            ))}
          </g>
        </svg>
      </div>

      <div className="ad-wb__hint">
        {tool === 'select' && 'Click an element to select · Hold Space to pan · Wheel to zoom'}
        {tool === 'sticky' && 'Click to drop a sticky note'}
        {tool === 'rect' && 'Drag to draw a rectangle'}
        {tool === 'text' && 'Click to add a text element'}
        {tool === 'draw' && 'Drag to sketch'}
      </div>
    </div>
  );
}

// ─── Element renderer ────────────────────────────────────────────────
// ─── Session 32: Resize handles ──────────────────────────────────────
// Eight handles (four corners + four edges) around a selected element.
// Dragging adjusts x/y/w/h in world coords, respecting the mouse's
// position relative to the anchor corner. Minimum size 20×20 so users
// can't accidentally shrink an element out of existence.
function ResizeHandles({ el, zoom, onResize }) {
  const handle = (hx, hy, cursor, handler) => (
    <circle
      cx={hx} cy={hy}
      r={5 / zoom}
      fill="white"
      stroke="#6366F1"
      strokeWidth={1.5 / zoom}
      style={{ cursor }}
      onMouseDown={handler}
    />
  );

  // Build a drag handler for the given anchor/resize semantics.
  // `axes` is a map of which sides move: { left, right, top, bottom } booleans.
  const startDrag = (axes) => (e) => {
    e.stopPropagation();
    e.preventDefault();
    const start = { mx: e.clientX, my: e.clientY, x: el.x, y: el.y, w: el.w, h: el.h };

    const onMove = (ev) => {
      const dx = (ev.clientX - start.mx) / zoom;
      const dy = (ev.clientY - start.my) / zoom;
      let { x, y, w, h } = start;
      if (axes.right)  w = Math.max(20, start.w + dx);
      if (axes.left)   { w = Math.max(20, start.w - dx); x = start.x + start.w - w; }
      if (axes.bottom) h = Math.max(20, start.h + dy);
      if (axes.top)    { h = Math.max(20, start.h - dy); y = start.y + start.h - h; }
      onResize({ x, y, w, h });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const x1 = el.x, y1 = el.y;
  const x2 = el.x + el.w, y2 = el.y + el.h;
  const cx = x1 + el.w / 2, cy = y1 + el.h / 2;

  return (
    <g pointerEvents="all">
      {/* Selection outline */}
      <rect
        x={x1} y={y1} width={el.w} height={el.h}
        fill="none"
        stroke="#6366F1"
        strokeWidth={1.5 / zoom}
        pointerEvents="none"
      />
      {/* Corners */}
      {handle(x1, y1, 'nwse-resize', startDrag({ left: true, top: true }))}
      {handle(x2, y1, 'nesw-resize', startDrag({ right: true, top: true }))}
      {handle(x1, y2, 'nesw-resize', startDrag({ left: true, bottom: true }))}
      {handle(x2, y2, 'nwse-resize', startDrag({ right: true, bottom: true }))}
      {/* Edges */}
      {handle(cx, y1, 'ns-resize', startDrag({ top: true }))}
      {handle(cx, y2, 'ns-resize', startDrag({ bottom: true }))}
      {handle(x1, cy, 'ew-resize', startDrag({ left: true }))}
      {handle(x2, cy, 'ew-resize', startDrag({ right: true }))}
    </g>
  );
}

function WhiteboardElement({ el, selected, editing, onMouseDown, onDoubleClick, onBlurEdit, onUpdate }) {
  const common = {
    className: `ad-wb-el ad-wb-el--${el.type} ${selected ? 'ad-wb-el--selected' : ''}`,
    onMouseDown,
    onDoubleClick,
  };

  if (el.type === 'sticky') {
    return (
      <g {...common} transform={`translate(${el.x}, ${el.y})`}>
        <rect
          width={el.w} height={el.h}
          rx={8} ry={8}
          fill={el.data?.color || '#FEF3C7'}
          stroke={selected ? '#6366F1' : 'rgba(0,0,0,0.08)'}
          strokeWidth={selected ? 2 : 1}
        />
        <foreignObject x={10} y={10} width={el.w - 20} height={el.h - 20} pointerEvents={editing ? 'auto' : 'none'}>
          {editing ? (
            <textarea
              autoFocus
              defaultValue={el.data?.text || ''}
              onBlur={(e) => { onUpdate({ data: { ...el.data, text: e.target.value } }); onBlurEdit(); }}
              style={{
                width: '100%', height: '100%', border: 'none', background: 'transparent',
                outline: 'none', resize: 'none', fontSize: 14, color: '#1F2937', lineHeight: 1.4,
                fontFamily: 'inherit',
              }}
            />
          ) : (
            <div style={{ width: '100%', height: '100%', fontSize: 14, color: '#1F2937', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
              {el.data?.text || <span style={{ color: 'rgba(31, 41, 55, 0.4)' }}>Double-click to edit</span>}
            </div>
          )}
        </foreignObject>
      </g>
    );
  }

  if (el.type === 'shape') {
    return (
      <g {...common} transform={`translate(${el.x}, ${el.y})`}>
        <rect
          width={el.w} height={el.h}
          rx={4}
          fill={el.data?.fill || '#EDE9FE'}
          stroke={selected ? '#6366F1' : (el.data?.stroke || '#8B5CF6')}
          strokeWidth={selected ? 2.5 : 1.5}
        />
      </g>
    );
  }

  if (el.type === 'text') {
    const fontSize = el.data?.fontSize || 18;
    return (
      <g {...common} transform={`translate(${el.x}, ${el.y})`}>
        <foreignObject width={el.w} height={el.h} pointerEvents={editing ? 'auto' : 'none'}>
          {editing ? (
            <input
              autoFocus
              defaultValue={el.data?.text || ''}
              onBlur={(e) => { onUpdate({ data: { ...el.data, text: e.target.value } }); onBlurEdit(); }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
              style={{
                width: '100%', border: 'none', background: 'transparent',
                outline: 'none', fontSize, color: el.data?.color || '#1E293B',
                fontFamily: 'inherit', fontWeight: 500,
              }}
            />
          ) : (
            <div style={{
              width: '100%', fontSize, color: el.data?.color || '#1E293B',
              fontWeight: 500, outline: selected ? '2px solid #6366F1' : 'none',
              outlineOffset: '2px', borderRadius: '2px', padding: '1px 2px',
            }}>
              {el.data?.text || 'Text'}
            </div>
          )}
        </foreignObject>
      </g>
    );
  }

  if (el.type === 'draw') {
    const points = (el.data?.points || []).map(p => `${el.x + p[0]},${el.y + p[1]}`).join(' ');
    return (
      <g {...common}>
        <polyline
          points={points}
          fill="none"
          stroke={selected ? '#6366F1' : (el.data?.stroke || '#1E293B')}
          strokeWidth={selected ? 3 : (el.data?.strokeWidth || 2)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    );
  }

  return null;
}

// ─── Session 32: SVG/PNG export helpers ────────────────────────────────
// Build a self-contained SVG string from an elements array. Adds an
// 80-px padding around the content bounding box so nothing touches edges.
function buildExportSvg(elements) {
  if (!elements.length) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><text x="20" y="40" font-family="Inter, sans-serif" fill="#94A3B8">Empty board</text></svg>';
  }
  const pad = 80;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + (el.w || 0));
    maxY = Math.max(maxY, el.y + (el.h || 0));
  }
  const vbX = minX - pad, vbY = minY - pad;
  const vbW = (maxX - minX) + pad * 2, vbH = (maxY - minY) + pad * 2;

  const escape = (s) => String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const parts = [];
  for (const el of [...elements].sort((a, b) => (a.z || 0) - (b.z || 0))) {
    if (el.type === 'sticky') {
      const color = el.data?.color || '#FEF3C7';
      const text = escape(el.data?.text || '');
      // Wrap text lines at ~22 chars (crude but fine for export)
      const lines = text.split('\n').flatMap(line => {
        const out = [];
        for (let i = 0; i < line.length; i += 24) out.push(line.slice(i, i + 24));
        return out.length ? out : [''];
      });
      parts.push(`<g transform="translate(${el.x},${el.y})">`);
      parts.push(`<rect width="${el.w}" height="${el.h}" rx="8" fill="${color}" stroke="rgba(0,0,0,0.12)"/>`);
      lines.slice(0, Math.floor((el.h - 20) / 18)).forEach((line, i) => {
        parts.push(`<text x="10" y="${28 + i * 18}" font-family="Inter, sans-serif" font-size="14" fill="#1F2937">${line}</text>`);
      });
      parts.push('</g>');
    } else if (el.type === 'shape') {
      const fill = el.data?.fill || '#EDE9FE';
      const stroke = el.data?.stroke || '#8B5CF6';
      parts.push(`<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`);
    } else if (el.type === 'text') {
      const fs = el.data?.fontSize || 18;
      const color = el.data?.color || '#1E293B';
      parts.push(`<text x="${el.x}" y="${el.y + fs}" font-family="Inter, sans-serif" font-size="${fs}" font-weight="500" fill="${color}">${escape(el.data?.text || 'Text')}</text>`);
    } else if (el.type === 'draw') {
      const pts = (el.data?.points || []).map(p => `${el.x + p[0]},${el.y + p[1]}`).join(' ');
      const stroke = el.data?.stroke || '#1E293B';
      const sw = el.data?.strokeWidth || 2;
      parts.push(`<polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" width="${Math.round(vbW)}" height="${Math.round(vbH)}" style="background:#FFFFFF">${parts.join('')}</svg>`;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
