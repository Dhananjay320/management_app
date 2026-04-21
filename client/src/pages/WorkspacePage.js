import { useState, useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import api from '../services/api';
import FileViewer from '../components/FileViewer';
import '../styles/workspace.css';

export default function WorkspacePage() {
  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWs, setSelectedWs] = useState(null);
  const [wsDetail, setWsDetail] = useState(null);
  const [activeTab, setActiveTab] = useState('documents');
  const [editingDoc, setEditingDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [viewingFile, setViewingFile] = useState(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberUsers, setMemberUsers] = useState([]);
  const [memberSearch, setMemberSearch] = useState('');

  const loadWorkspaces = useCallback(async () => {
    try { const { data } = await api.get('/workspace'); setWorkspaces(data); } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadWorkspaces(); }, [loadWorkspaces]);

  const openWorkspace = async (id) => {
    try {
      const { data } = await api.get(`/workspace/${id}`);
      setWsDetail(data);
      setSelectedWs(id);
      setActiveTab('documents');
      setEditingDoc(null);
    } catch {}
  };

  const openDocument = async (docId) => {
    try {
      const { data } = await api.get(`/workspace/documents/${docId}`);
      setEditingDoc(data);
    } catch {}
  };

  const createDocument = async () => {
    try {
      const { data } = await api.post(`/workspace/${selectedWs}/documents`, { title: 'Untitled Document' });
      setEditingDoc(data);
      openWorkspace(selectedWs);
    } catch {}
  };

  const createNote = async () => {
    try {
      await api.post(`/workspace/${selectedWs}/notes`, { title: 'New Note', content: '' });
      openWorkspace(selectedWs);
    } catch {}
  };

  const loadMemberUsers = async () => {
    try { const { data } = await api.get('/users/directory'); setMemberUsers(data); } catch {}
  };

  const addMember = async (userId) => {
    try {
      await api.post(`/workspace/${selectedWs}/members`, { userId });
      openWorkspace(selectedWs);
      setShowAddMember(false);
      setMemberSearch('');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add member.');
    }
  };

  const addLink = async () => {
    const url = prompt('Enter URL:');
    if (!url) return;
    const title = prompt('Link title (optional):', url);
    try {
      await api.post(`/workspace/${selectedWs}/links`, { url, title: title || url });
      openWorkspace(selectedWs);
    } catch {}
  };

  // Workspace list view
  if (!selectedWs) {
    return (
      <div>
        <div className="page-header">
          <div><div className="page-title">Workspace</div><div className="page-subtitle">{workspaces.length} workspaces</div></div>
          <button className="btn btn-primary-sm" onClick={() => setShowCreate(true)}>+ New Workspace</button>
        </div>

        {showCreate && <CreateWorkspaceForm onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); loadWorkspaces(); }} />}

        {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-3)' }}>Loading...</div> : (
          <div className="ws-grid">
            {workspaces.map(ws => (
              <div key={ws._id} className="ws-card" onClick={() => openWorkspace(ws._id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div className="ws-card-icon" style={{ background: ws.color + '14' }}>{ws.icon}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{ws.name}</div>
                    <span className="badge-pill" style={{ background: ws.color + '14', color: ws.color }}>{ws.type.replace('_', ' ')}</span>
                  </div>
                </div>
                {ws.description && <div style={{ fontSize: 11, color: 'var(--ink-2)', marginBottom: 8 }}>{ws.description}</div>}
                <div className="ws-card-stats">
                  <span>📄 {ws.docCount} docs</span>
                  <span>📝 {ws.noteCount} notes</span>
                  <span>📎 {ws.fileCount} files</span>
                  <span>🔗 {ws.linkCount} links</span>
                </div>
              </div>
            ))}
            {workspaces.length === 0 && (
              <div className="card" style={{ textAlign: 'center', padding: 40, gridColumn: '1/-1' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📁</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>No workspaces yet</div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Create one to organize your documents, files, and notes</div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Document editor view
  if (editingDoc) {
    return (
      <div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button className="btn btn-secondary" onClick={() => setEditingDoc(null)}>← Back to {wsDetail?.name}</button>
        </div>
        <DocumentEditor doc={editingDoc} onSave={() => openWorkspace(selectedWs)} />
      </div>
    );
  }

  // Workspace detail view
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className="btn btn-secondary" onClick={() => { setSelectedWs(null); setWsDetail(null); }}>← All Workspaces</button>
      </div>

      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="ws-card-icon" style={{ background: (wsDetail?.color || '#6366F1') + '14', fontSize: 24 }}>{wsDetail?.icon}</div>
          <div>
            <div className="page-title">{wsDetail?.name}</div>
            <div className="page-subtitle">{wsDetail?.description}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', position: 'relative' }}>
          <span className="badge-pill" style={{ background: (wsDetail?.color || '#6366F1') + '14', color: wsDetail?.color }}>{wsDetail?.type?.replace('_', ' ')}</span>
          <span className="badge-pill" style={{ background: 'var(--glass-2)', color: 'var(--ink-2)' }}>{wsDetail?.members?.length} members</span>
          <button className="btn btn-primary-sm" style={{ padding: '5px 10px', fontSize: 10 }} onClick={() => { setShowAddMember(!showAddMember); if (!showAddMember) loadMemberUsers(); }}>+ Add Member</button>
          {showAddMember && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 10, padding: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', width: 260, zIndex: 20 }}>
              <input
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                placeholder="Search users..."
                style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 11, marginBottom: 6, outline: 'none', fontFamily: 'Inter, sans-serif' }}
                autoFocus
              />
              <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                {memberUsers
                  .filter(u => !wsDetail?.members?.some(m => (m._id || m) === u._id))
                  .filter(u => u.name.toLowerCase().includes(memberSearch.toLowerCase()) || u.email.toLowerCase().includes(memberSearch.toLowerCase()))
                  .map(u => (
                    <div key={u._id} onClick={() => addMember(u._id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 11, color: 'var(--ink)' }}
                      onMouseOver={e => e.currentTarget.style.background = '#F8FAFC'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                      <span style={{ fontWeight: 600 }}>{u.name}</span>
                      <span style={{ color: 'var(--ink-3)', fontSize: 10, marginLeft: 'auto' }}>{u.email}</span>
                    </div>
                  ))}
                {memberUsers.filter(u => !wsDetail?.members?.some(m => (m._id || m) === u._id)).length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', textAlign: 'center', padding: 8 }}>No users to add</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="ws-tab-bar">
        {[['documents','📄 Documents'],['notes','📝 Notes'],['links','🔗 Links'],['files','📎 Files']].map(([k,l]) => (
          <div key={k} className={`ws-tab ${activeTab === k ? 'active' : ''}`} onClick={() => setActiveTab(k)}>{l}</div>
        ))}
      </div>

      {activeTab === 'documents' && (
        <div>
          <div style={{ marginBottom: 12 }}><button className="btn btn-primary-sm" onClick={createDocument}>+ New Document</button></div>
          {wsDetail?.documents?.map(doc => (
            <div key={doc._id} className="ws-doc-item" onClick={() => openDocument(doc._id)}>
              <div className="ws-doc-icon">📄</div>
              <div style={{ flex: 1 }}>
                <div className="ws-doc-title">{doc.title}</div>
                <div className="ws-doc-meta">
                  {doc.lastEditedBy?.name && `Edited by ${doc.lastEditedBy.name} · `}
                  {new Date(doc.updatedAt).toLocaleDateString()}
                  {doc.classification !== 'personal' && <span className="badge-pill" style={{ marginLeft: 6, background: doc.classification === 'company' ? 'rgba(99,102,241,0.08)' : 'rgba(16,185,129,0.08)', color: doc.classification === 'company' ? '#6366F1' : '#10B981' }}>{doc.classification}</span>}
                  {doc.tags?.map((tag, ti) => (
                    <span key={ti} className="badge-pill" style={{ marginLeft: 4, background: 'rgba(139,92,246,0.08)', color: '#8B5CF6', fontSize: 9 }}>{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
          {(!wsDetail?.documents || wsDetail.documents.length === 0) && <div style={{ color: 'var(--ink-4)', fontSize: 12, padding: 20, textAlign: 'center' }}>No documents yet</div>}
        </div>
      )}

      {activeTab === 'notes' && (
        <div>
          <div style={{ marginBottom: 12 }}><button className="btn btn-primary-sm" onClick={createNote}>+ New Note</button></div>
          <div className="ws-notes-grid">
            {wsDetail?.notes?.map(note => (
              <div key={note._id} className="ws-note-card" style={{ background: note.color || '#F8FAFC' }}>
                <div className="ws-note-title">{note.title}</div>
                <div className="ws-note-text">{note.content || 'Empty note'}</div>
              </div>
            ))}
          </div>
          {(!wsDetail?.notes || wsDetail.notes.length === 0) && <div style={{ color: 'var(--ink-4)', fontSize: 12, padding: 20, textAlign: 'center' }}>No notes yet</div>}
        </div>
      )}

      {activeTab === 'links' && (
        <div>
          <div style={{ marginBottom: 12 }}><button className="btn btn-primary-sm" onClick={addLink}>+ Add Link</button></div>
          {wsDetail?.links?.map(link => (
            <div key={link._id} className="ws-link-card" onClick={() => window.open(link.url, '_blank')}>
              <div className="ws-link-icon">🔗</div>
              <div>
                <div className="ws-link-title">{link.title}</div>
                {link.description && <div className="ws-link-desc">{link.description}</div>}
                <div className="ws-link-url">{link.url}</div>
              </div>
            </div>
          ))}
          {(!wsDetail?.links || wsDetail.links.length === 0) && <div style={{ color: 'var(--ink-4)', fontSize: 12, padding: 20, textAlign: 'center' }}>No links yet</div>}
        </div>
      )}

      {activeTab === 'files' && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <label className="btn btn-primary-sm" style={{ cursor: 'pointer' }}>
              📎 Upload File
              <input type="file" style={{ display: 'none' }} onChange={async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const formData = new FormData();
                formData.append('file', file);
                try {
                  await api.post(`/workspace/${selectedWs}/files`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                  });
                  openWorkspace(selectedWs);
                } catch {}
                e.target.value = '';
              }} />
            </label>
          </div>
          {wsDetail?.files?.map(file => (
            <div key={file._id} className="ws-doc-item" style={{ cursor: 'pointer' }} onClick={() => setViewingFile({ url: file.path || file.url, name: file.originalName || file.name, mimeType: file.mimeType, size: file.originalSize })}>
              <div className="ws-doc-icon">📎</div>
              <div style={{ flex: 1 }}>
                <div className="ws-doc-title">{file.originalName || file.name}</div>
                <div className="ws-doc-meta">
                  {file.uploadedBy?.name && `Uploaded by ${file.uploadedBy.name} · `}
                  {file.originalSize ? `${(file.originalSize / 1024).toFixed(1)} KB` : ''}
                </div>
              </div>
            </div>
          ))}
          {(!wsDetail?.files || wsDetail.files.length === 0) && <div style={{ color: 'var(--ink-4)', fontSize: 12, padding: 20, textAlign: 'center' }}>No files yet</div>}
        </div>
      )}

      {/* FileViewer modal */}
      {viewingFile && (
        <FileViewer
          url={viewingFile.url}
          name={viewingFile.name}
          mimeType={viewingFile.mimeType}
          size={viewingFile.size}
          onClose={() => setViewingFile(null)}
        />
      )}
    </div>
  );
}

function DocumentEditor({ doc, onSave }) {
  const [title, setTitle] = useState(doc.title);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [tags, setTags] = useState(doc.tags || []);
  const [tagInput, setTagInput] = useState('');

  const editor = useEditor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Start writing...' }),
      Underline,
      Highlight,
    ],
    content: doc.tiptapJSON || { type: 'doc', content: [{ type: 'paragraph' }] },
  });

  const save = async () => {
    if (!editor) return;
    setSaving(true);
    try {
      await api.put(`/workspace/documents/${doc._id}`, {
        title,
        tiptapJSON: editor.getJSON(),
        tags
      });
      setLastSaved(new Date());
      onSave();
    } catch {} finally { setSaving(false); }
  };

  // Auto-save every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => { if (editor) save(); }, 30000);
    return () => clearInterval(interval);
  });

  if (!editor) return null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <input value={title} onChange={e => setTitle(e.target.value)} onBlur={save}
          style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', border: 'none', outline: 'none', background: 'transparent', fontFamily: "'Plus Jakarta Sans', sans-serif", flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {lastSaved && <span style={{ fontSize: 10, color: '#10B981' }}>✓ Saved {lastSaved.toLocaleTimeString()}</span>}
          <button className="btn btn-primary-sm" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {tags.map((tag, i) => (
          <span key={i} className="badge-pill" style={{ background: 'rgba(139,92,246,0.08)', color: '#8B5CF6', display: 'flex', alignItems: 'center', gap: 4 }}>
            {tag}
            <span style={{ cursor: 'pointer', fontSize: 10 }} onClick={() => setTags(prev => prev.filter((_, idx) => idx !== i))}>&times;</span>
          </span>
        ))}
        <input value={tagInput} onChange={e => setTagInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && tagInput.trim()) { e.preventDefault(); setTags(prev => [...prev, tagInput.trim()]); setTagInput(''); }
          }}
          placeholder="Add tag..."
          style={{ padding: '4px 8px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 11, background: 'var(--glass)', outline: 'none', fontFamily: 'Inter, sans-serif', width: 100 }} />
      </div>

      <div className="ws-editor-wrap">
        <div className="ws-editor-toolbar">
          <ToolbarBtn label="B" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
          <ToolbarBtn label="I" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} style={{ fontStyle: 'italic' }} />
          <ToolbarBtn label="U" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} style={{ textDecoration: 'underline' }} />
          <ToolbarBtn label="S" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} style={{ textDecoration: 'line-through' }} />
          <div className="ws-toolbar-sep" />
          <ToolbarBtn label="H1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
          <ToolbarBtn label="H2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
          <ToolbarBtn label="H3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
          <div className="ws-toolbar-sep" />
          <ToolbarBtn label="•" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
          <ToolbarBtn label="1." active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
          <ToolbarBtn label="☑" active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()} />
          <div className="ws-toolbar-sep" />
          <ToolbarBtn label="❝" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
          <ToolbarBtn label="<>" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
          <ToolbarBtn label="—" onClick={() => editor.chain().focus().setHorizontalRule().run()} />
        </div>
        <div className="ws-editor-content">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}

function ToolbarBtn({ label, active, onClick, style }) {
  return (
    <button className={`ws-toolbar-btn ${active ? 'active' : ''}`} onClick={onClick} type="button" style={style}>
      {label}
    </button>
  );
}

function CreateWorkspaceForm({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', description: '', icon: '📁', type: 'personal' });
  const [loading, setLoading] = useState(false);

  const icons = ['📁','🚀','🎯','🎨','💡','📊','🔬','📚','🏗️','💼'];
  // eslint-disable-next-line no-unused-vars
  const _colors = ['#6366F1','#10B981','#F59E0B','#EC4899','#8B5CF6','#EF4444','#06B6D4','#F97316'];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/workspace', form);
      onCreated();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed.');
    } finally { setLoading(false); }
  };

  return (
    <div className="card" style={{ marginBottom: 16, maxWidth: 480 }}>
      <form onSubmit={handleSubmit}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Create Workspace</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {icons.map(i => (
            <div key={i} onClick={() => setForm(p => ({ ...p, icon: i }))}
              style={{ width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, cursor: 'pointer', border: form.icon === i ? '2px solid #6366F1' : '1px solid #E2E8F0', background: form.icon === i ? 'rgba(99,102,241,0.08)' : '#F8FAFC' }}>{i}</div>
          ))}
        </div>
        <div className="form-field" style={{ marginBottom: 12 }}>
          <label>Name *</label>
          <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Workspace name" required />
        </div>
        <div className="form-field" style={{ marginBottom: 12 }}>
          <label>Description</label>
          <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="What's this workspace for?" />
        </div>
        <div className="form-field" style={{ marginBottom: 14 }}>
          <label>Type</label>
          <div className="chip-group">
            {[['personal','Personal'],['team','Team'],['cross_team','Cross-team']].map(([k,l]) => (
              <div key={k} className={`chip ${form.type === k ? 'active' : ''}`} onClick={() => setForm(p => ({ ...p, type: k }))}>{l}</div>
            ))}
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary-sm" disabled={loading}>{loading ? 'Creating...' : 'Create'}</button>
        </div>
      </form>
    </div>
  );
}
