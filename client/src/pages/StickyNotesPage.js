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
  const [expandedNote, setExpandedNote] = useState(null);
  const [attachModal, setAttachModal] = useState(null); // noteId to attach
  const [attachType, setAttachType] = useState('task');
  const [attachSearch, setAttachSearch] = useState('');
  const [attachResults, setAttachResults] = useState([]);
  const [attachSearching, setAttachSearching] = useState(false);
  const [shareModal, setShareModal] = useState(null);
  const [allUsers, setAllUsers] = useState([]);

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

  const searchEntities = async (q, type) => {
    if (!q.trim()) { setAttachResults([]); return; }
    setAttachSearching(true);
    try {
      const { data } = await api.get('/search/normal', { params: { q, scope: type, limit: 8 } });
      setAttachResults(data);
    } catch {}
    setAttachSearching(false);
  };

  const attachToEntity = async (noteId, entityType, entityId, entityTitle) => {
    try {
      await api.put(`/sticky-notes/${noteId}/attach`, { entityType, entityId });
      setNotes(prev => prev.map(n => n._id === noteId ? {
        ...n, attachedTo: [...(n.attachedTo || []), { entityType, entityId, _title: entityTitle }]
      } : n));
      setAttachModal(null);
      setAttachSearch('');
      setAttachResults([]);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to attach.');
    }
  };

  const detachFromEntity = async (noteId, entityType, entityId) => {
    try {
      await api.put(`/sticky-notes/${noteId}/detach`, { entityType, entityId });
      setNotes(prev => prev.map(n => n._id === noteId ? {
        ...n, attachedTo: (n.attachedTo || []).filter(a => !(a.entityType === entityType && (a.entityId === entityId || a.entityId?._id === entityId)))
      } : n));
    } catch {}
  };

  const shareNote = async (noteId, userId, canEdit = true) => {
    try {
      await api.put(`/sticky-notes/${noteId}/share`, { userId, canEdit });
      loadNotes();
    } catch {}
  };

  const openShareModal = (noteId) => {
    setShareModal(noteId);
    if (allUsers.length === 0) {
      api.get('/users/directory').then(r => setAllUsers(r.data || [])).catch(() => {});
    }
  };

  return (
    <div className="sn-layout">
      <div className="sn-header">
        <h2>Sticky Notes</h2>
        <button className="sn-create-btn" onClick={createNote}>+ New Note</button>
      </div>

      {notes.length === 0 ? (
        <div className="sn-empty">
          <div className="sn-empty-icon">📝</div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>No sticky notes yet</h3>
          <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>Create a quick note to capture ideas, reminders, or anything you want to remember.</p>
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

              {/* Attached-to badges — clickable to detach */}
              {note.attachedTo?.length > 0 && (
                <div className="sn-attached-badges">
                  {note.attachedTo.map((a, i) => (
                    <span key={i} className="sn-attached-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      {a.entityType === 'task' ? '✅' : a.entityType === 'channel' ? '💬' : a.entityType === 'meeting' ? '👥' : a.entityType === 'workspace' ? '📁' : '📌'} {a.entityType}
                      {isOwner(note) && (
                        <span style={{ cursor: 'pointer', fontSize: 10, marginLeft: 2, color: '#EF4444' }}
                          onClick={() => detachFromEntity(note._id, a.entityType, a.entityId?._id || a.entityId)}
                          title="Detach">&times;</span>
                      )}
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
                  {isOwner(note) && (
                    <button className="sn-card-action" title="Attach to task, meeting, chat..." onClick={() => { setAttachModal(note._id); setAttachType('task'); setAttachSearch(''); setAttachResults([]); }}>
                      📎
                    </button>
                  )}
                  {isOwner(note) && (
                    <button className="sn-card-action" title="Share with others" onClick={() => openShareModal(note._id)}>
                      🔗
                    </button>
                  )}
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
                style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', border: 'none', background: 'transparent', outline: 'none', fontFamily: "'Plus Jakarta Sans', sans-serif", flex: 1 }}
                value={expandedNote.title || ''}
                onChange={e => {
                  const val = e.target.value;
                  setExpandedNote(prev => ({ ...prev, title: val }));
                  setNotes(prev => prev.map(n => n._id === expandedNote._id ? { ...n, title: val } : n));
                }}
                onBlur={e => updateNote(expandedNote._id, { title: e.target.value })}
                placeholder="Note title..."
              />
              <button onClick={() => setExpandedNote(null)} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--ink-2)', cursor: 'pointer' }}>&times;</button>
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
      {/* Attach Modal */}
      {attachModal && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300 }} onClick={() => setAttachModal(null)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 301, background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 14, width: 400, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Attach Note To...</div>
              <button style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ink-3)' }} onClick={() => setAttachModal(null)}>&times;</button>
            </div>
            <div style={{ padding: 16 }}>
              {/* Entity type selector */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
                {[['task','✅ Task'],['meeting','👥 Meeting'],['channel','💬 Chat'],['workspace','📁 Workspace']].map(([k,l]) => (
                  <button key={k} onClick={() => { setAttachType(k); setAttachSearch(''); setAttachResults([]); }}
                    style={{ padding: '5px 12px', fontSize: 10, fontWeight: 600, borderRadius: 6, cursor: 'pointer', fontFamily: 'Inter',
                      border: attachType === k ? '1px solid #6366F1' : '1px solid var(--line)',
                      background: attachType === k ? 'rgba(99,102,241,0.1)' : 'var(--glass)',
                      color: attachType === k ? '#6366F1' : 'var(--ink-2)'
                    }}>{l}</button>
                ))}
              </div>
              {/* Search */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                <input value={attachSearch} onChange={e => setAttachSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') searchEntities(attachSearch, attachType === 'channel' ? 'messages' : attachType === 'task' ? 'tasks' : attachType === 'meeting' ? 'meetings' : 'workspace'); }}
                  placeholder={`Search ${attachType}s...`}
                  style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, fontFamily: 'Inter', background: 'var(--glass)', outline: 'none', color: 'var(--ink)' }} />
                <button onClick={() => searchEntities(attachSearch, attachType === 'channel' ? 'messages' : attachType === 'task' ? 'tasks' : attachType === 'meeting' ? 'meetings' : 'workspace')}
                  style={{ padding: '8px 14px', fontSize: 11, fontWeight: 600, border: 'none', borderRadius: 6, background: '#6366F1', color: '#fff', cursor: 'pointer', fontFamily: 'Inter' }}>Search</button>
              </div>
              {/* Results */}
              {attachSearching && <div style={{ fontSize: 11, color: 'var(--ink-3)', padding: 8 }}>Searching...</div>}
              {attachResults.length > 0 && (
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {attachResults.map(r => (
                    <div key={r.entityId} onClick={() => attachToEntity(attachModal, attachType, r.entityId, r.title)}
                      style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--glass)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <span style={{ fontSize: 14 }}>
                        {attachType === 'task' ? '✅' : attachType === 'meeting' ? '👥' : attachType === 'channel' ? '💬' : '📁'}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                        {r.snippet && r.snippet !== r.title && (
                          <div style={{ fontSize: 9, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.snippet}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!attachSearching && attachResults.length === 0 && attachSearch && (
                <div style={{ fontSize: 11, color: 'var(--ink-3)', padding: 8 }}>No results. Type and press Enter or click Search.</div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Share Modal */}
      {shareModal && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300 }} onClick={() => setShareModal(null)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 301, background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 14, width: 340, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Share Note</div>
              <button style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ink-3)' }} onClick={() => setShareModal(null)}>&times;</button>
            </div>
            <div style={{ padding: 16, maxHeight: 300, overflowY: 'auto' }}>
              {allUsers.filter(u => u._id !== user._id).map(u => {
                const note = notes.find(n => n._id === shareModal);
                const sharedEntry = note?.sharedWith?.find(s => (s.user?._id || s.user) === u._id);
                return (
                  <div key={u._id}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700 }}>
                      {(u.name || '??').split(' ').map(w => w[0]).join('').slice(0,2)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{u.name}</div>
                      <div style={{ fontSize: 9, color: 'var(--ink-3)' }}>{u.email}</div>
                    </div>
                    {sharedEntry ? (
                      <span className="badge-pill" style={{ background: sharedEntry.canEdit ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)', color: sharedEntry.canEdit ? '#10B981' : '#F59E0B', fontSize: 8 }}>
                        {sharedEntry.canEdit ? 'Can Edit' : 'View Only'}
                      </span>
                    ) : (
                      <div style={{ display: 'flex', gap: 3 }}>
                        <button onClick={() => shareNote(shareModal, u._id, true)}
                          style={{ padding: '2px 6px', fontSize: 8, border: '1px solid #10B981', borderRadius: 3, background: 'rgba(16,185,129,0.06)', color: '#10B981', cursor: 'pointer', fontFamily: 'Inter' }}>Editor</button>
                        <button onClick={() => shareNote(shareModal, u._id, false)}
                          style={{ padding: '2px 6px', fontSize: 8, border: '1px solid #F59E0B', borderRadius: 3, background: 'rgba(245,158,11,0.06)', color: '#F59E0B', cursor: 'pointer', fontFamily: 'Inter' }}>Viewer</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
