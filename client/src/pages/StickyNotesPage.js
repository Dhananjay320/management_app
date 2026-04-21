import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import '../styles/stickynotes.css';

const NOTE_COLORS = [
  { name: 'Yellow', value: '#FEF3C7' },
  { name: 'Blue', value: '#DBEAFE' },
  { name: 'Green', value: '#D1FAE5' },
  { name: 'Pink', value: '#FCE7F3' },
  { name: 'Purple', value: '#EDE9FE' },
  { name: 'Red', value: '#FEE2E2' },
  { name: 'Orange', value: '#FFEDD5' },
  { name: 'Teal', value: '#CCFBF1' },
];

function formatTime(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function StickyNotesPage() {
  const { user } = useAuth();
  const [notes, setNotes] = useState([]);
  const [, setEditingId] = useState(null);
  const [colorPickerId, setColorPickerId] = useState(null);
  const [expandedNote, setExpandedNote] = useState(null); // Full-window view

  const loadNotes = useCallback(async () => {
    try {
      const { data } = await api.get('/sticky-notes');
      setNotes(data);
    } catch {}
  }, []);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  const createNote = async () => {
    try {
      const { data } = await api.post('/sticky-notes', {
        title: '', content: '', color: '#FEF3C7'
      });
      setNotes(prev => [data, ...prev]);
      setEditingId(data._id);
    } catch {}
  };

  const updateNote = async (id, updates) => {
    try {
      await api.put(`/sticky-notes/${id}`, updates);
      setNotes(prev => prev.map(n => n._id === id ? { ...n, ...updates } : n));
    } catch {}
  };

  const deleteNote = async (id) => {
    try {
      await api.delete(`/sticky-notes/${id}`);
      setNotes(prev => prev.filter(n => n._id !== id));
    } catch {}
  };

  const isOwner = (note) => note.creator?._id === user._id || note.creator === user._id;

  return (
    <div className="sn-layout">
      <div className="sn-header">
        <h2>Sticky Notes</h2>
        <button className="sn-create-btn" onClick={createNote}>+ New Note</button>
      </div>

      {notes.length === 0 ? (
        <div className="sn-empty">
          <div className="sn-empty-icon">📝</div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', marginBottom: 6 }}>No sticky notes yet</h3>
          <p style={{ fontSize: 12, color: '#94A3B8' }}>Create a quick note to capture ideas, reminders, or anything you want to remember.</p>
        </div>
      ) : (
        <div className="sn-grid">
          {notes.map(note => (
            <div
              key={note._id}
              className="sn-card"
              style={{ background: note.color || '#FEF3C7' }}
            >
              <input
                className="sn-card-title"
                placeholder="Note title..."
                value={note.title || ''}
                onChange={e => {
                  const val = e.target.value;
                  setNotes(prev => prev.map(n => n._id === note._id ? { ...n, title: val } : n));
                }}
                onBlur={e => updateNote(note._id, { title: e.target.value })}
                readOnly={!isOwner(note) && !note.sharedWith?.find(s => s.user?._id === user._id)?.canEdit}
              />
              <div
                className="sn-card-body"
                contentEditable={isOwner(note) || !!note.sharedWith?.find(s => s.user?._id === user._id)?.canEdit}
                suppressContentEditableWarning
                dangerouslySetInnerHTML={{ __html: note.content || '' }}
                onBlur={e => updateNote(note._id, { content: e.currentTarget.innerHTML })}
                onKeyDown={e => {
                  if (e.ctrlKey || e.metaKey) {
                    if (e.key === 'b') { e.preventDefault(); document.execCommand('bold'); }
                    if (e.key === 'i') { e.preventDefault(); document.execCommand('italic'); }
                  }
                }}
                style={{ minHeight: 60, outline: 'none', whiteSpace: 'pre-wrap', cursor: 'text' }}
                data-placeholder="Write something..."
              />

              {/* Attached-to badges */}
              {note.attachedTo?.length > 0 && (
                <div className="sn-attached-badges">
                  {note.attachedTo.map((a, i) => (
                    <span key={i} className="sn-attached-badge">
                      {a.entityType === 'task' ? '✅' : a.entityType === 'channel' ? '💬' : a.entityType === 'meeting' ? '👥' : '📌'} {a.entityType}
                    </span>
                  ))}
                </div>
              )}

              <div className="sn-card-footer">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="sn-card-time">{formatTime(note.updatedAt)}</span>
                  {note.isShared && <span className="sn-shared-badge">Shared</span>}
                  {!isOwner(note) && (
                    <span className="sn-shared-badge">From {note.creator?.name}</span>
                  )}
                </div>
                <div className="sn-card-actions">
                  <button className="sn-card-action" title="Expand" onClick={() => setExpandedNote(note)}>
                    🔲
                  </button>
                  {isOwner(note) && (
                    <>
                      <button
                        className="sn-card-action"
                        title="Change color"
                        onClick={() => setColorPickerId(colorPickerId === note._id ? null : note._id)}
                      >
                        🎨
                      </button>
                      <button className="sn-card-action" title="Delete" onClick={() => deleteNote(note._id)}>
                        🗑️
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Color Picker */}
              {colorPickerId === note._id && (
                <div className="sn-colors">
                  {NOTE_COLORS.map(c => (
                    <div
                      key={c.value}
                      className={`sn-color-dot ${note.color === c.value ? 'active' : ''}`}
                      style={{ background: c.value }}
                      title={c.name}
                      onClick={() => {
                        updateNote(note._id, { color: c.value });
                        setColorPickerId(null);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Full-window expanded note — per spec Section 11 "expand button for full window" */}
      {expandedNote && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setExpandedNote(null)}>
          <div style={{
            width: '80%', maxWidth: 640, maxHeight: '80vh', background: expandedNote.color || '#FEF3C7',
            borderRadius: 16, padding: 24, boxShadow: '0 8px 40px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', overflow: 'hidden'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <input
                style={{ fontSize: 18, fontWeight: 800, color: '#1E293B', border: 'none', background: 'transparent', outline: 'none', fontFamily: "'Plus Jakarta Sans', sans-serif", flex: 1 }}
                value={expandedNote.title || ''}
                onChange={e => {
                  const val = e.target.value;
                  setExpandedNote(prev => ({ ...prev, title: val }));
                  setNotes(prev => prev.map(n => n._id === expandedNote._id ? { ...n, title: val } : n));
                }}
                onBlur={e => updateNote(expandedNote._id, { title: e.target.value })}
                placeholder="Note title..."
              />
              <button onClick={() => setExpandedNote(null)} style={{ background: 'none', border: 'none', fontSize: 20, color: '#64748B', cursor: 'pointer' }}>&times;</button>
            </div>
            <div
              contentEditable
              suppressContentEditableWarning
              dangerouslySetInnerHTML={{ __html: expandedNote.content || '' }}
              onBlur={e => {
                const val = e.currentTarget.innerHTML;
                setExpandedNote(prev => ({ ...prev, content: val }));
                setNotes(prev => prev.map(n => n._id === expandedNote._id ? { ...n, content: val } : n));
                updateNote(expandedNote._id, { content: val });
              }}
              onKeyDown={e => {
                if (e.ctrlKey || e.metaKey) {
                  if (e.key === 'b') { e.preventDefault(); document.execCommand('bold'); }
                  if (e.key === 'i') { e.preventDefault(); document.execCommand('italic'); }
                }
              }}
              style={{
                flex: 1, minHeight: 300, border: 'none', background: 'transparent', outline: 'none',
                fontSize: 14, lineHeight: 1.8, color: '#334155', fontFamily: 'Inter, sans-serif', whiteSpace: 'pre-wrap', cursor: 'text'
              }}
              data-placeholder="Write something..."
            />
          </div>
        </div>
      )}
    </div>
  );
}
