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
  const [board, setBoard] = useState(null);
  const [elements, setElements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Viewport — pan offset + zoom level. World coordinates.
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });

  // Tool state
  const [tool, setTool] = useState('select');
  const [stickyColor, setStickyColor] = useState(STICKY_COLORS[0]);

  // Interaction state
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [draftShape, setDraftShape] = useState(null);   // in-progress rect or draw
  const [isPanning, setIsPanning] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);

  const svgRef = useRef(null);
  const saveTimer = useRef(null);
  const viewportSaveTimer = useRef(null);

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

  // ─── Keyboard: spacebar pan, delete, esc ──────────────────────────
  useEffect(() => {
    const down = (e) => {
      if (editingId) return;  // don't intercept when editing text
      if (e.code === 'Space') { e.preventDefault(); setSpaceDown(true); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        deleteElement(selectedId);
      }
      if (e.key === 'Escape') { setSelectedId(null); setDraftShape(null); }
    };
    const up = (e) => {
      if (e.code === 'Space') setSpaceDown(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
    // eslint-disable-next-line
  }, [selectedId, editingId]);

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
    const next = [...elements, { ...el, z: maxZ + 1 }];
    setElements(next);
    scheduleSave(next);
  };

  const updateElement = (elid, patch) => {
    const next = elements.map(e => e.id === elid ? { ...e, ...patch } : e);
    setElements(next);
    scheduleSave(next);
  };

  const deleteElement = (elid) => {
    const next = elements.filter(e => e.id !== elid);
    setElements(next);
    setSelectedId(null);
    setEditingId(null);
    scheduleSave(next);
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
      setSelectedId(newId);
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

    // Select tool: click on canvas deselects
    setSelectedId(null);
    setEditingId(null);
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
  const onElementMouseDown = (e, el) => {
    if (tool !== 'select') return;
    if (spaceDown) return;  // let the canvas handler pan
    e.stopPropagation();
    setSelectedId(el.id);
    if (editingId && editingId !== el.id) setEditingId(null);

    const startMouse = { x: e.clientX, y: e.clientY };
    const startPos = { x: el.x, y: el.y };
    const onMove = (ev) => {
      const dx = (ev.clientX - startMouse.x) / viewport.zoom;
      const dy = (ev.clientY - startMouse.y) / viewport.zoom;
      updateElement(el.id, { x: startPos.x + dx, y: startPos.y + dy });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
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
        </div>
        <button
          className="ad-wb__btn"
          onClick={() => { setViewport({ x: 0, y: 0, zoom: 1 }); scheduleViewportSave({ x: 0, y: 0, zoom: 1 }); }}
          title="Reset view"
        >
          Reset view
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
                selected={selectedId === el.id}
                editing={editingId === el.id}
                onMouseDown={(e) => onElementMouseDown(e, el)}
                onDoubleClick={() => { setSelectedId(el.id); setEditingId(el.id); }}
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
