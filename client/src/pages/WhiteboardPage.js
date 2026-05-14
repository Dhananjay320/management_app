import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import api from '../services/api';
import './WhiteboardPage.css';

// First color is the "default pen" — must be visible on white whiteboard background.
// Using a dark slate instead of the theme's --ink (which is white in dark mode).
const COLORS = ['#1f2937', '#6366F1', '#EF4444', '#10B981', '#F59E0B', '#EC4899'];
const TOOLS = [
  { key: 'select', icon: '\u2B9C', label: 'Select' },
  { key: 'rectangle', icon: '\u25AD', label: 'Rectangle' },
  { key: 'circle', icon: '\u25CB', label: 'Circle' },
  { key: 'text', icon: 'T', label: 'Text' },
  { key: 'freehand', icon: '\u270E', label: 'Draw' },
  { key: 'eraser', icon: '\u232B', label: 'Eraser' },
  { key: 'sticky', icon: '\u25A3', label: 'Sticky Note' },
];
const BRUSH_SIZES = [1, 2, 4, 8, 16];

let shapeIdCounter = Date.now();
function genId() { return 's-' + (++shapeIdCounter); }

export default function WhiteboardPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket } = useSocket();

  const [board, setBoard] = useState(null);
  const [shapes, setShapes] = useState([]);
  const [title, setTitle] = useState('');
  const [tool, setTool] = useState('select');
  const [color, setColor] = useState(COLORS[0]);
  const [brushSize, setBrushSize] = useState(2);
  const [selectedId, setSelectedId] = useState(null);
  // History for undo/redo — array of full shape snapshots
  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);

  const pushHistory = useCallback((nextShapes) => {
    // Trim any "future" if we undid then made a new change
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(JSON.parse(JSON.stringify(nextShapes)));
    // Cap history to last 50 states
    if (historyRef.current.length > 50) historyRef.current.shift();
    historyIndexRef.current = historyRef.current.length - 1;
  }, []);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [canEdit, setCanEdit] = useState(true);

  // Viewport for pan and zoom
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState(null);
  const [currentDraw, setCurrentDraw] = useState(null);
  const [freehandPoints, setFreehandPoints] = useState([]);

  // Dragging shapes
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Remote cursors
  const [remoteCursors, setRemoteCursors] = useState({});

  // Editing text
  const [editingTextId, setEditingTextId] = useState(null);
  const [editingTextValue, setEditingTextValue] = useState('');

  const svgRef = useRef(null);
  const containerRef = useRef(null);

  // Load board
  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get(`/whiteboards/${id}`);
        setBoard(data);
        setShapes(data.shapes || []);
        setTitle(data.title || 'Untitled Board');
        if (data.viewport) setViewport(data.viewport);
        // _userRole is set by the backend: 'owner', 'editor', or 'viewer'
        setCanEdit(data._userRole === 'owner' || data._userRole === 'editor');
      } catch {
        navigate('/whiteboards');
      }
      setLoading(false);
    }
    load();
  }, [id, navigate]);

  // Socket: join board room
  useEffect(() => {
    if (!socket || !id) return;
    socket.emit('whiteboard:join', id);
    return () => { socket.emit('whiteboard:leave', id); };
  }, [socket, id]);

  // Socket: listen for remote shape updates
  useEffect(() => {
    if (!socket) return;
    const handleShapeUpdate = (data) => {
      if (data.userId === user?._id) return;
      if (data.action === 'add') {
        setShapes(prev => [...prev.filter(s => s.id !== data.shape.id), data.shape]);
      } else if (data.action === 'update') {
        setShapes(prev => prev.map(s => s.id === data.shape.id ? data.shape : s));
      } else if (data.action === 'delete') {
        setShapes(prev => prev.filter(s => s.id !== (data.shapeId || data.shape?.id)));
      } else if (data.action === 'replace') {
        setShapes(Array.isArray(data.shape?.shapes) ? data.shape.shapes : []);
      }
    };
    const handleCursor = (data) => {
      if (data.userId === user?._id) return;
      setRemoteCursors(prev => ({ ...prev, [data.userId]: data }));
    };

    socket.on('whiteboard:shape-update', handleShapeUpdate);
    socket.on('whiteboard:cursor', handleCursor);
    return () => {
      socket.off('whiteboard:shape-update', handleShapeUpdate);
      socket.off('whiteboard:cursor', handleCursor);
    };
  }, [socket, user?._id]);

  // Convert screen coords to SVG coords
  const screenToSvg = useCallback((clientX, clientY) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - viewport.x) / viewport.zoom,
      y: (clientY - rect.top - viewport.y) / viewport.zoom
    };
  }, [viewport]);

  // Emit cursor position
  const emitCursor = useCallback((clientX, clientY) => {
    if (!socket || !id) return;
    const pos = screenToSvg(clientX, clientY);
    socket.emit('whiteboard:cursor', { boardId: id, userId: user?._id, name: user?.name, x: pos.x, y: pos.y });
  }, [socket, id, user, screenToSvg]);

  // Emit shape update
  const emitShapeUpdate = useCallback((action, shape, shapeId) => {
    if (!socket || !id) return;
    socket.emit('whiteboard:shape-update', { boardId: id, userId: user?._id, action, shape, shapeId });
  }, [socket, id, user]);

  // Mouse down
  const handleMouseDown = useCallback((e) => {
    if (e.button === 1 || (e.button === 0 && tool === 'select' && e.target === svgRef.current)) {
      // Pan
      setIsPanning(true);
      setPanStart({ x: e.clientX - viewport.x, y: e.clientY - viewport.y });
      setSelectedId(null);
      return;
    }

    // Select and eraser tools don't start a draw — they only act on shape clicks
    if (tool === 'select' || tool === 'eraser') return;

    const pos = screenToSvg(e.clientX, e.clientY);
    setIsDrawing(true);
    setDrawStart(pos);

    if (tool === 'freehand') {
      setFreehandPoints([pos]);
    }
  }, [tool, viewport, screenToSvg]);

  // Mouse move
  const handleMouseMove = useCallback((e) => {
    emitCursor(e.clientX, e.clientY);

    if (isPanning) {
      setViewport(v => ({ ...v, x: e.clientX - panStart.x, y: e.clientY - panStart.y }));
      return;
    }

    if (isDragging && selectedId) {
      const pos = screenToSvg(e.clientX, e.clientY);
      setShapes(prev => prev.map(s => {
        if (s.id !== selectedId) return s;
        const updated = { ...s, x: pos.x - dragOffset.x, y: pos.y - dragOffset.y };
        return updated;
      }));
      return;
    }

    if (isDrawing && drawStart) {
      const pos = screenToSvg(e.clientX, e.clientY);
      if (tool === 'freehand') {
        setFreehandPoints(prev => [...prev, pos]);
      } else {
        setCurrentDraw(pos);
      }
    }
  }, [isPanning, panStart, isDragging, selectedId, dragOffset, isDrawing, drawStart, tool, screenToSvg, emitCursor]);

  // Mouse up
  const handleMouseUp = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (isDragging && selectedId) {
      setIsDragging(false);
      const shape = shapes.find(s => s.id === selectedId);
      if (shape) emitShapeUpdate('update', shape);
      return;
    }

    if (isDrawing && drawStart) {
      const newShape = { id: genId(), color };

      if (tool === 'rectangle') {
        const end = currentDraw || drawStart;
        newShape.type = 'rectangle';
        newShape.x = Math.min(drawStart.x, end.x);
        newShape.y = Math.min(drawStart.y, end.y);
        newShape.w = Math.abs(end.x - drawStart.x) || 80;
        newShape.h = Math.abs(end.y - drawStart.y) || 60;
      } else if (tool === 'circle') {
        const end = currentDraw || drawStart;
        newShape.type = 'circle';
        newShape.x = (drawStart.x + end.x) / 2;
        newShape.y = (drawStart.y + end.y) / 2;
        newShape.w = Math.abs(end.x - drawStart.x) || 80;
        newShape.h = Math.abs(end.y - drawStart.y) || 80;
      } else if (tool === 'text') {
        newShape.type = 'text';
        newShape.x = drawStart.x;
        newShape.y = drawStart.y;
        newShape.text = 'Text';
        newShape.w = 100;
        newShape.h = 24;
      } else if (tool === 'freehand') {
        if (freehandPoints.length < 2) {
          setIsDrawing(false);
          setDrawStart(null);
          setCurrentDraw(null);
          setFreehandPoints([]);
          return;
        }
        newShape.type = 'freehand';
        newShape.points = freehandPoints;
        newShape.strokeWidth = brushSize;
        newShape.x = 0;
        newShape.y = 0;
      } else if (tool === 'sticky') {
        newShape.type = 'sticky';
        newShape.x = drawStart.x;
        newShape.y = drawStart.y;
        newShape.w = 140;
        newShape.h = 100;
        newShape.text = 'Note...';
        newShape.color = '#FEF3C7';
      }

      setShapes(prev => {
        const next = [...prev, newShape];
        pushHistory(next);
        return next;
      });
      emitShapeUpdate('add', newShape);
      setIsDrawing(false);
      setDrawStart(null);
      setCurrentDraw(null);
      setFreehandPoints([]);
    }
  }, [isPanning, isDragging, isDrawing, drawStart, currentDraw, tool, color, shapes, selectedId, freehandPoints, emitShapeUpdate, pushHistory]);

  // Undo / Redo
  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    const snapshot = historyRef.current[historyIndexRef.current] || [];
    setShapes(JSON.parse(JSON.stringify(snapshot)));
    emitShapeUpdate('replace', { shapes: snapshot });
  }, [emitShapeUpdate]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    const snapshot = historyRef.current[historyIndexRef.current] || [];
    setShapes(JSON.parse(JSON.stringify(snapshot)));
    emitShapeUpdate('replace', { shapes: snapshot });
  }, [emitShapeUpdate]);

  const clearAll = useCallback(() => {
    if (!window.confirm('Clear the entire whiteboard? Use Undo (Cmd/Ctrl+Z) to recover.')) return;
    pushHistory([]);
    setShapes([]);
    emitShapeUpdate('replace', { shapes: [] });
    setSelectedId(null);
  }, [pushHistory, emitShapeUpdate]);

  // Keyboard shortcuts: Cmd/Ctrl+Z = undo, Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y = redo
  useEffect(() => {
    const onKey = (e) => {
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      if (e.key === 'z' || e.key === 'Z') {
        if (e.shiftKey) { e.preventDefault(); redo(); }
        else { e.preventDefault(); undo(); }
      } else if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // Wheel to zoom
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setViewport(v => {
      const newZoom = Math.max(0.1, Math.min(5, v.zoom * delta));
      // Zoom toward cursor
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { ...v, zoom: newZoom };
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      return {
        x: mx - (mx - v.x) * (newZoom / v.zoom),
        y: my - (my - v.y) * (newZoom / v.zoom),
        zoom: newZoom
      };
    });
  }, []);

  // Shape click (select)
  const handleShapeClick = useCallback((e, shapeId) => {
    e.stopPropagation();
    if (tool === 'eraser') {
      const next = shapes.filter(s => s.id !== shapeId);
      pushHistory(next);
      setShapes(next);
      emitShapeUpdate('delete', { id: shapeId });
      if (selectedId === shapeId) setSelectedId(null);
      return;
    }
    if (tool === 'select') {
      setSelectedId(shapeId);
      const shape = shapes.find(s => s.id === shapeId);
      if (shape) {
        const pos = screenToSvg(e.clientX, e.clientY);
        setDragOffset({ x: pos.x - shape.x, y: pos.y - shape.y });
        setIsDragging(true);
      }
    }
  }, [tool, shapes, screenToSvg, pushHistory, selectedId]);

  // Double-click on text/sticky to edit
  const handleShapeDblClick = useCallback((e, shapeId) => {
    e.stopPropagation();
    const shape = shapes.find(s => s.id === shapeId);
    if (shape && (shape.type === 'text' || shape.type === 'sticky')) {
      setEditingTextId(shapeId);
      setEditingTextValue(shape.text || '');
    }
  }, [shapes]);

  const finishTextEdit = useCallback(() => {
    if (!editingTextId) return;
    setShapes(prev => prev.map(s => {
      if (s.id !== editingTextId) return s;
      const updated = { ...s, text: editingTextValue };
      emitShapeUpdate('update', updated);
      return updated;
    }));
    setEditingTextId(null);
    setEditingTextValue('');
  }, [editingTextId, editingTextValue, emitShapeUpdate]);

  // Delete selected
  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    emitShapeUpdate('delete', null, selectedId);
    setShapes(prev => prev.filter(s => s.id !== selectedId));
    setSelectedId(null);
  }, [selectedId, emitShapeUpdate]);

  // Key handler
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (editingTextId) return;
        deleteSelected();
      }
      if (e.key === 'Escape') {
        setSelectedId(null);
        setTool('select');
        if (editingTextId) finishTextEdit();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [deleteSelected, editingTextId, finishTextEdit]);

  // Save
  const saveBoard = async () => {
    setSaving(true);
    try {
      await api.put(`/whiteboards/${id}`, { title, shapes, viewport });
    } catch {}
    setSaving(false);
  };

  // Auto-save when shapes change (debounced 2s)
  const autoSaveRef = useRef(null);
  useEffect(() => {
    if (!id || shapes.length === 0) return;
    clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      api.put(`/whiteboards/${id}`, { shapes, viewport }).catch(() => {});
    }, 2000);
    return () => clearTimeout(autoSaveRef.current);
  }, [shapes, id, viewport]);

  // Render shape
  const renderShape = (shape) => {
    const isSelected = shape.id === selectedId;
    const strokeWidth = isSelected ? 2 : 0;
    const selectionStroke = isSelected ? '#6366F1' : 'none';

    if (shape.type === 'rectangle') {
      return (
        <g key={shape.id} onMouseDown={(e) => handleShapeClick(e, shape.id)}>
          <rect
            x={shape.x} y={shape.y} width={shape.w} height={shape.h}
            fill={shape.color || '#6366F1'} fillOpacity={0.15}
            stroke={isSelected ? selectionStroke : (shape.color || '#6366F1')}
            strokeWidth={isSelected ? strokeWidth : 1.5}
            rx={4}
          />
          {isSelected && (
            <rect
              x={shape.x - 3} y={shape.y - 3} width={shape.w + 6} height={shape.h + 6}
              fill="none" stroke="#6366F1" strokeWidth={1.5} strokeDasharray="4 2" rx={6}
            />
          )}
        </g>
      );
    }

    if (shape.type === 'circle') {
      return (
        <g key={shape.id} onMouseDown={(e) => handleShapeClick(e, shape.id)}>
          <ellipse
            cx={shape.x} cy={shape.y} rx={shape.w / 2} ry={shape.h / 2}
            fill={shape.color || '#6366F1'} fillOpacity={0.15}
            stroke={isSelected ? selectionStroke : (shape.color || '#6366F1')}
            strokeWidth={isSelected ? strokeWidth : 1.5}
          />
          {isSelected && (
            <ellipse
              cx={shape.x} cy={shape.y} rx={shape.w / 2 + 4} ry={shape.h / 2 + 4}
              fill="none" stroke="#6366F1" strokeWidth={1.5} strokeDasharray="4 2"
            />
          )}
        </g>
      );
    }

    if (shape.type === 'text') {
      return (
        <g key={shape.id}
          onMouseDown={(e) => handleShapeClick(e, shape.id)}
          onDoubleClick={(e) => handleShapeDblClick(e, shape.id)}
        >
          {isSelected && (
            <rect
              x={shape.x - 4} y={shape.y - 16} width={(shape.text?.length || 4) * 8 + 8} height={24}
              fill="none" stroke="#6366F1" strokeWidth={1.5} strokeDasharray="4 2" rx={4}
            />
          )}
          {editingTextId === shape.id ? (
            <foreignObject x={shape.x - 2} y={shape.y - 16} width={200} height={30}>
              <input
                autoFocus
                value={editingTextValue}
                onChange={e => setEditingTextValue(e.target.value)}
                onBlur={finishTextEdit}
                onKeyDown={e => { if (e.key === 'Enter') finishTextEdit(); }}
                style={{ fontSize: 14, border: '1px solid #6366F1', borderRadius: 4, padding: '2px 4px', width: '100%', outline: 'none', fontFamily: 'Inter, sans-serif', background: 'var(--glass)' }}
              />
            </foreignObject>
          ) : (
            <text
              x={shape.x} y={shape.y}
              fill={shape.color || 'var(--ink)'}
              fontSize={14} fontFamily="Inter, sans-serif" fontWeight={500}
            >
              {shape.text || 'Text'}
            </text>
          )}
        </g>
      );
    }

    if (shape.type === 'freehand' && shape.points?.length > 1) {
      const d = shape.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
      const sw = shape.strokeWidth || 2;
      // Hit-area path is at least 14px wide so eraser/select clicks register easily
      const hitWidth = Math.max(sw + 12, 14);
      return (
        <g key={shape.id} onMouseDown={(e) => handleShapeClick(e, shape.id)} style={{ cursor: tool === 'eraser' ? 'cell' : 'pointer' }}>
          {/* Invisible thick stroke for click hit-testing */}
          <path
            d={d} fill="none" stroke="transparent"
            strokeWidth={hitWidth} strokeLinecap="round" strokeLinejoin="round"
            pointerEvents="stroke"
          />
          <path
            d={d} fill="none" stroke={shape.color || '#1f2937'}
            strokeWidth={isSelected ? sw + 1 : sw} strokeLinecap="round" strokeLinejoin="round"
            pointerEvents="none"
          />
          {isSelected && (
            <path d={d} fill="none" stroke="#6366F1" strokeWidth={1} strokeDasharray="4 2" />
          )}
        </g>
      );
    }

    if (shape.type === 'sticky') {
      return (
        <g key={shape.id}
          className="wb-sticky-shape"
          onMouseDown={(e) => handleShapeClick(e, shape.id)}
          onDoubleClick={(e) => handleShapeDblClick(e, shape.id)}
        >
          <rect
            x={shape.x} y={shape.y} width={shape.w} height={shape.h}
            fill={shape.color || '#FEF3C7'} stroke={isSelected ? '#6366F1' : '#F59E0B'}
            strokeWidth={isSelected ? 2 : 0.5} rx={4}
          />
          {editingTextId === shape.id ? (
            <foreignObject x={shape.x + 6} y={shape.y + 6} width={shape.w - 12} height={shape.h - 12}>
              <textarea
                autoFocus
                value={editingTextValue}
                onChange={e => setEditingTextValue(e.target.value)}
                onBlur={finishTextEdit}
                style={{ fontSize: 11, border: 'none', borderRadius: 2, padding: 2, width: '100%', height: '100%', outline: 'none', fontFamily: 'Inter, sans-serif', background: 'transparent', resize: 'none', color: 'var(--amber)' }}
              />
            </foreignObject>
          ) : (
            <text x={shape.x + 8} y={shape.y + 20} fill="#92400E" fontSize={11} fontFamily="Inter, sans-serif">
              {(shape.text || '').substring(0, 60)}
            </text>
          )}
        </g>
      );
    }

    return null;
  };

  // Render drawing preview
  const renderPreview = () => {
    if (!isDrawing || !drawStart) return null;

    if (tool === 'rectangle' && currentDraw) {
      const x = Math.min(drawStart.x, currentDraw.x);
      const y = Math.min(drawStart.y, currentDraw.y);
      const w = Math.abs(currentDraw.x - drawStart.x);
      const h = Math.abs(currentDraw.y - drawStart.y);
      return <rect x={x} y={y} width={w} height={h} fill={color} fillOpacity={0.1} stroke={color} strokeWidth={1.5} strokeDasharray="4 2" rx={4} />;
    }

    if (tool === 'circle' && currentDraw) {
      const cx = (drawStart.x + currentDraw.x) / 2;
      const cy = (drawStart.y + currentDraw.y) / 2;
      const rx = Math.abs(currentDraw.x - drawStart.x) / 2;
      const ry = Math.abs(currentDraw.y - drawStart.y) / 2;
      return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={color} fillOpacity={0.1} stroke={color} strokeWidth={1.5} strokeDasharray="4 2" />;
    }

    if (tool === 'freehand' && freehandPoints.length > 1) {
      const d = freehandPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
      return <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" opacity={0.6} />;
    }

    return null;
  };

  if (loading) return <div style={{ padding: 20, color: 'var(--ink-3)' }}>Loading whiteboard...</div>;

  const toolClass = tool === 'select' ? 'tool-select' : tool === 'eraser' ? 'tool-eraser' : '';

  return (
    <div className="wb-container">
      {/* View-only banner */}
      {!canEdit && (
        <div style={{ padding: '6px 16px', background: 'rgba(245,158,11,0.1)', borderBottom: '1px solid rgba(245,158,11,0.2)', fontSize: 11, color: '#F59E0B', fontWeight: 600, textAlign: 'center' }}>
          View Only — you can see this board but cannot edit it
        </div>
      )}

      {/* Toolbar */}
      <div className="wb-toolbar">
        <button className="wb-back-btn" onClick={() => navigate('/whiteboards')}>Back</button>
        <input
          className="wb-title-input"
          value={title}
          onChange={e => canEdit && setTitle(e.target.value)}
          placeholder="Board title..."
          readOnly={!canEdit}
        />

        <div className="wb-tool-group" style={!canEdit ? { opacity: 0.3, pointerEvents: 'none' } : {}}>
          {TOOLS.map(t => (
            <button
              key={t.key}
              className={`wb-tool-btn ${tool === t.key ? 'active' : ''}`}
              onClick={() => setTool(t.key)}
              title={t.label}
            >
              {t.icon}
            </button>
          ))}
        </div>

        <div className="wb-color-group">
          {COLORS.map(c => (
            <div
              key={c}
              className={`wb-color-swatch ${color === c ? 'active' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>

        {/* Brush size — only visible while pen is active */}
        {tool === 'freehand' && (
          <div className="wb-tool-group" style={{ marginLeft: 8 }} title="Brush size">
            {BRUSH_SIZES.map(s => (
              <button
                key={s}
                className={`wb-tool-btn ${brushSize === s ? 'active' : ''}`}
                onClick={() => setBrushSize(s)}
                title={`${s}px`}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <span style={{ display: 'inline-block', width: Math.min(s + 2, 16), height: Math.min(s + 2, 16), borderRadius: '50%', background: 'currentColor' }} />
              </button>
            ))}
          </div>
        )}

        <div className="wb-actions">
          <button className="wb-back-btn" onClick={undo} title="Undo (Cmd/Ctrl+Z)">↶</button>
          <button className="wb-back-btn" onClick={redo} title="Redo (Cmd/Ctrl+Shift+Z)">↷</button>
          <button className="wb-back-btn" onClick={clearAll} title="Clear all" style={{ color: '#EF4444', borderColor: 'rgba(239,68,68,0.3)' }}>Clear</button>
          {selectedId && (
            <button className="wb-back-btn" onClick={deleteSelected} style={{ color: '#EF4444', borderColor: 'rgba(239,68,68,0.3)' }}>
              Delete
            </button>
          )}
          <button className="wb-save-btn" onClick={saveBoard} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className={`wb-canvas-area ${toolClass}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <svg ref={svgRef} className="wb-svg">
          {/* Grid pattern */}
          <defs>
            <pattern id="wb-grid" width={20 * viewport.zoom} height={20 * viewport.zoom} patternUnits="userSpaceOnUse"
              x={viewport.x % (20 * viewport.zoom)} y={viewport.y % (20 * viewport.zoom)}>
              <circle cx={1} cy={1} r={0.5} fill="#CBD5E1" fillOpacity={0.5} />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#wb-grid)" />

          {/* Shapes group with transform */}
          <g transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`}>
            {shapes.map(renderShape)}
            {renderPreview()}
          </g>
        </svg>

        {/* Remote cursors */}
        {Object.values(remoteCursors).map(c => (
          <div
            key={c.userId}
            className="wb-remote-cursor"
            style={{ left: c.x * viewport.zoom + viewport.x, top: c.y * viewport.zoom + viewport.y }}
          >
            <div className="wb-remote-cursor-dot" />
            <div className="wb-remote-cursor-name">{c.name}</div>
          </div>
        ))}

        {/* Zoom indicator */}
        <div className="wb-zoom-indicator">{Math.round(viewport.zoom * 100)}%</div>
      </div>
    </div>
  );
}
