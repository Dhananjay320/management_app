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

  // Drag handlers
  const onMouseDown = (e) => {
    // Only drag from header, not inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'TEXTAREA') return;
    dragging.current = true;
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!dragging.current) return;
      const newX = Math.max(0, Math.min(window.innerWidth - 220, e.clientX - dragOffset.current.x));
      const newY = Math.max(0, Math.min(window.innerHeight - 50, e.clientY - dragOffset.current.y));
      setPos({ x: newX, y: newY });
    };
    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return (
    <div
      ref={dragRef}
      className={`floating-sticky-note ${minimized ? 'minimized' : ''}`}
      style={{ left: pos.x, top: pos.y, background: color }}
    >
      <div className="floating-sticky-header" onMouseDown={onMouseDown}>
        <span className="floating-sticky-drag-handle">:::</span>
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
            <textarea
              className="floating-sticky-textarea"
              value={content}
              onChange={handleContentChange}
              placeholder="Write something..."
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
