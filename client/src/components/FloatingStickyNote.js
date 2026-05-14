import { useState, useRef, useEffect, useCallback } from 'react';
import './FloatingStickyNote.css';

const NOTE_COLORS = [
  '#FEF3C7', // yellow
  '#DBEAFE', // blue
  '#D1FAE5', // green
  '#FCE7F3', // pink
  '#EDE9FE', // purple
  '#FFEDD5', // orange
];

function getStoredPosition(noteId) {
  try {
    const stored = localStorage.getItem(`floating-note-pos-${noteId}`);
    if (stored) return JSON.parse(stored);
  } catch {}
  return null;
}

function storePosition(noteId, pos) {
  try {
    localStorage.setItem(`floating-note-pos-${noteId}`, JSON.stringify(pos));
  } catch {}
}

export default function FloatingStickyNote({ note, onClose, onSave }) {
  const storedPos = getStoredPosition(note.id);
  const [pos, setPos] = useState({ x: storedPos?.x ?? 100 + Math.random() * 200, y: storedPos?.y ?? 100 + Math.random() * 200 });
  const [title, setTitle] = useState(note.title || '');
  const [content, setContent] = useState(note.content || '');
  const [color, setColor] = useState(note.color || NOTE_COLORS[0]);
  const [minimized, setMinimized] = useState(false);
  const isLocal = !!note.screenPath;
  const dragRef = useRef(null);
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Save position to localStorage when it changes
  useEffect(() => {
    storePosition(note.id, pos);
  }, [note.id, pos]);

  // Auto-save on changes (debounced)
  const saveTimeout = useRef(null);
  const handleChange = useCallback((newTitle, newContent, newColor) => {
    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      onSave({ ...note, title: newTitle, content: newContent, color: newColor });
    }, 500);
  }, [note, onSave]);

  const handleTitleChange = (e) => {
    const val = e.target.value;
    setTitle(val);
    handleChange(val, content, color);
  };

  const handleContentChange = (e) => {
    const val = e.target.value;
    setContent(val);
    handleChange(title, val, color);
  };

  const handleColorChange = (c) => {
    setColor(c);
    handleChange(title, content, c);
  };

  // Drag handlers — start (mouse + touch)
  const startDrag = (clientX, clientY, target) => {
    if (target && (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.tagName === 'TEXTAREA')) return false;
    dragging.current = true;
    dragOffset.current = { x: clientX - pos.x, y: clientY - pos.y };
    document.body.style.userSelect = 'none';
    return true;
  };

  const onMouseDown = (e) => { startDrag(e.clientX, e.clientY, e.target); };
  const onTouchStart = (e) => {
    const t = e.touches[0];
    if (startDrag(t.clientX, t.clientY, e.target)) {
      // prevent page scroll while dragging the note
      try { e.preventDefault(); } catch (_) {}
    }
  };

  useEffect(() => {
    // Pick a reasonable note width based on viewport — mobile-aware clamp
    const noteWidth = () => Math.min(220, window.innerWidth - 16);

    const handleMove = (clientX, clientY) => {
      if (!dragging.current) return;
      const w = noteWidth();
      const newX = Math.max(0, Math.min(window.innerWidth - w, clientX - dragOffset.current.x));
      const newY = Math.max(0, Math.min(window.innerHeight - 50, clientY - dragOffset.current.y));
      setPos({ x: newX, y: newY });
    };

    const onMouseMove = (e) => handleMove(e.clientX, e.clientY);
    const onTouchMove = (e) => {
      if (!dragging.current) return;
      const t = e.touches[0];
      handleMove(t.clientX, t.clientY);
      try { e.preventDefault(); } catch (_) {}
    };
    const stop = () => {
      dragging.current = false;
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', stop);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', stop);
    window.addEventListener('touchcancel', stop);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', stop);
      window.removeEventListener('touchcancel', stop);
    };
  }, []);

  // If viewport shrinks (rotate, resize), nudge the note back into bounds.
  useEffect(() => {
    const reclamp = () => {
      setPos(p => {
        const w = Math.min(220, window.innerWidth - 16);
        return {
          x: Math.max(0, Math.min(window.innerWidth - w, p.x)),
          y: Math.max(0, Math.min(window.innerHeight - 50, p.y))
        };
      });
    };
    window.addEventListener('resize', reclamp);
    window.addEventListener('orientationchange', reclamp);
    reclamp();
    return () => {
      window.removeEventListener('resize', reclamp);
      window.removeEventListener('orientationchange', reclamp);
    };
  }, []);

  return (
    <div
      ref={dragRef}
      className={`floating-sticky-note ${minimized ? 'minimized' : ''}`}
      style={{ left: pos.x, top: pos.y, background: color }}
    >
      <div className="floating-sticky-header" onMouseDown={onMouseDown} onTouchStart={onTouchStart}>
        <span className="floating-sticky-drag-handle">:::</span>
        {/* Scope indicator */}
        <span
          onClick={() => {
            const newPath = note.screenPath ? null : (window.location.pathname + window.location.search);
            onSave({ ...note, title, content, color, screenPath: newPath, noteScope: newPath ? 'local' : 'global' });
          }}
          title={isLocal ? 'Local note — click to make global' : 'Global note — click to pin to this screen'}
          style={{ cursor: 'pointer', fontSize: 11, flexShrink: 0, marginRight: 2 }}
        >
          {isLocal ? '📌' : '🌐'}
        </span>
        <input
          className="floating-sticky-title-input"
          value={title}
          onChange={handleTitleChange}
          placeholder="Note title..."
        />
        <div className="floating-sticky-header-actions">
          <button className="floating-sticky-header-btn" onClick={() => setMinimized(!minimized)} title={minimized ? 'Expand' : 'Minimize'}>
            {minimized ? '+' : '\u2013'}
          </button>
          <button className="floating-sticky-header-btn" onClick={() => onClose(note.id)} title="Close">
            &times;
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          <div className="floating-sticky-body">
            <div
              className="floating-sticky-textarea"
              contentEditable
              suppressContentEditableWarning
              dangerouslySetInnerHTML={{ __html: content }}
              onBlur={e => {
                const val = e.currentTarget.innerHTML;
                setContent(val);
                handleChange(title, val, color);
              }}
              onKeyDown={e => {
                if (e.ctrlKey || e.metaKey) {
                  if (e.key === 'b') { e.preventDefault(); document.execCommand('bold'); }
                  if (e.key === 'i') { e.preventDefault(); document.execCommand('italic'); }
                }
              }}
              style={{ minHeight: 60, outline: 'none', whiteSpace: 'pre-wrap', cursor: 'text' }}
              data-placeholder="Write something..."
            />
          </div>
          <div className="floating-sticky-footer">
            {NOTE_COLORS.map(c => (
              <div
                key={c}
                className={`floating-sticky-color-dot ${color === c ? 'active' : ''}`}
                style={{ background: c }}
                onClick={() => handleColorChange(c)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
