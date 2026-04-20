import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import api from '../services/api';
import {
  GlassPanel, PrimaryButton, SegmentedControl, GradientText, Icon,
} from '../design-system';
import ErrorState from '../components/ErrorState';
import { useFetchSafe } from '../hooks/useFetchSafe';
import '../styles/workspace.css';
import './WorkspacePage.restyle.css';

// ─── Breadcrumbs ──────────────────────────────────────────────────────────
// Shows the navigation path as clickable crumbs so users can jump levels
// without multiple Back presses. The third level (doc title) is rendered as
// plain text (not clickable) since you're already on it.
function Breadcrumbs({ trail }) {
  return (
    <nav className="ad-ws-crumbs" aria-label="Breadcrumb">
      {trail.map((crumb, i) => {
        const isLast = i === trail.length - 1;
        return (
          <span key={i} className="ad-ws-crumbs__item">
            {crumb.onClick && !isLast ? (
              <button
                type="button"
                className="ad-ws-crumbs__link"
                onClick={crumb.onClick}
              >
                {crumb.icon && <span className="ad-ws-crumbs__icon">{crumb.icon}</span>}
                <span>{crumb.label}</span>
              </button>
            ) : (
              <span className={`ad-ws-crumbs__current ${isLast ? 'ad-ws-crumbs__current--active' : ''}`}>
                {crumb.icon && <span className="ad-ws-crumbs__icon">{crumb.icon}</span>}
                <span>{crumb.label}</span>
              </span>
            )}
            {!isLast && <span className="ad-ws-crumbs__sep" aria-hidden="true">›</span>}
          </span>
        );
      })}
    </nav>
  );
}

export default function WorkspacePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedWs, setSelectedWs] = useState(null);
  const [wsDetail, setWsDetail] = useState(null);
  const [activeTab, setActiveTab] = useState('documents');
  const [editingDoc, setEditingDoc] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  // Session 14+22: useFetchSafe for top-level workspace list.
  const { data: workspaces = [], loading, error, refetch: loadWorkspaces } = useFetchSafe(
    async () => (await api.get('/workspace')).data,
    []
  );

  const openWorkspace = useCallback(async (id) => {
    try {
      const { data } = await api.get(`/workspace/${id}`);
      setWsDetail(data);
      setSelectedWs(id);
      setActiveTab('documents');
      setEditingDoc(null);
    } catch {}
  }, []);

  const openDocument = useCallback(async (docId) => {
    try {
      const { data } = await api.get(`/workspace/documents/${docId}`);
      setEditingDoc(data);
    } catch {}
  }, []);

  // Session 22 deep-link: ?ws=<id> opens a workspace, ?ws=<id>&doc=<id> also
  // opens a document. Used by command palette (Session 15) results.
  const wsParam = searchParams.get('ws');
  const docParam = searchParams.get('doc');
  useEffect(() => {
    if (wsParam && wsParam !== selectedWs) openWorkspace(wsParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsParam]);
  useEffect(() => {
    if (docParam && wsDetail && (!editingDoc || editingDoc._id !== docParam)) {
      openDocument(docParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docParam, wsDetail]);
  // Clean URL once we've handled both params
  useEffect(() => {
    if ((wsParam || docParam) && selectedWs) {
      const timer = setTimeout(() => {
        const next = new URLSearchParams(searchParams);
        next.delete('ws');
        next.delete('doc');
        setSearchParams(next, { replace: true });
      }, 300);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWs, editingDoc]);

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

  const addLink = async () => {
    const url = prompt('Enter URL:');
    if (!url) return;
    const title = prompt('Link title (optional):', url);
    try {
      await api.post(`/workspace/${selectedWs}/links`, { url, title: title || url });
      openWorkspace(selectedWs);
    } catch {}
  };

  // ─── Level 1: Workspace list ───────────────────────────────────────────
  if (!selectedWs) {
    return (
      <div className="ad-ws">
        <header className="ad-ws__head ad-enter">
          <div className="ad-ws__head-left">
            <h1 className="ad-ws__title">Your <GradientText>workspaces</GradientText></h1>
            <p className="ad-ws__sub">
              {loading ? 'Loading…'
                : workspaces.length === 0 ? 'Create your first workspace to organize docs, notes, and files.'
                : `${workspaces.length} workspace${workspaces.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <div className="ad-ws__head-right">
            <PrimaryButton icon={<Icon.Plus size={14} />} onClick={() => setShowCreate(true)}>
              New workspace
            </PrimaryButton>
          </div>
        </header>

        {showCreate && <CreateWorkspaceForm onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); loadWorkspaces(); }} />}

        {loading ? (
          <GlassPanel elevated className="ad-ws__state">Loading…</GlassPanel>
        ) : error ? (
          <ErrorState error={error} onRetry={loadWorkspaces} />
        ) : workspaces.length === 0 ? (
          <GlassPanel elevated className="ad-ws__state">
            <div className="ad-ws__empty-icon">📁</div>
            <div className="ad-ws__empty-title">No workspaces yet</div>
            <div className="ad-ws__empty-sub">Create one to organize your documents, files, and notes.</div>
          </GlassPanel>
        ) : (
          <div className="ws-grid ad-ws-grid">
            {workspaces.map(ws => (
              <div
                key={ws._id}
                className="ws-card ad-ws-card"
                onClick={() => openWorkspace(ws._id)}
              >
                <div className="ad-ws-card__head">
                  <div
                    className="ws-card-icon ad-ws-card__icon"
                    style={{ background: ws.color ? `linear-gradient(135deg, ${ws.color}, ${ws.color}AA)` : 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}
                  >
                    {ws.icon}
                  </div>
                  <div className="ad-ws-card__head-text">
                    <div className="ad-ws-card__name">{ws.name}</div>
                    <span className="badge-pill" style={{ background: (ws.color || '#6366F1') + '22', color: ws.color || '#A5B4FC' }}>
                      {ws.type.replace('_', ' ')}
                    </span>
                  </div>
                </div>
                {ws.description && <div className="ad-ws-card__desc">{ws.description}</div>}
                <div className="ws-card-stats ad-ws-card__stats">
                  <span>📄 {ws.docCount}</span>
                  <span>📝 {ws.noteCount}</span>
                  <span>📎 {ws.fileCount}</span>
                  <span>🔗 {ws.linkCount}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── Level 3: Document editor ──────────────────────────────────────────
  if (editingDoc) {
    return (
      <div className="ad-ws">
        <Breadcrumbs trail={[
          { icon: '📁', label: 'Workspaces', onClick: () => { setSelectedWs(null); setWsDetail(null); setEditingDoc(null); } },
          { icon: wsDetail?.icon, label: wsDetail?.name || '…', onClick: () => setEditingDoc(null) },
          { icon: '📄', label: editingDoc.title || 'Untitled' },
        ]} />
        <DocumentEditor doc={editingDoc} onSave={() => openWorkspace(selectedWs)} />
      </div>
    );
  }

  // ─── Level 2: Workspace detail ────────────────────────────────────────
  return (
    <div className="ad-ws">
      <Breadcrumbs trail={[
        { icon: '📁', label: 'Workspaces', onClick: () => { setSelectedWs(null); setWsDetail(null); } },
        { icon: wsDetail?.icon, label: wsDetail?.name || '…' },
      ]} />

      <header className="ad-ws__head ad-enter" style={{ marginTop: 8 }}>
        <div className="ad-ws__head-left" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            className="ws-card-icon ad-ws-card__icon"
            style={{
              width: 52, height: 52, fontSize: 24,
              background: wsDetail?.color ? `linear-gradient(135deg, ${wsDetail.color}, ${wsDetail.color}AA)` : 'linear-gradient(135deg, #6366F1, #8B5CF6)',
            }}
          >
            {wsDetail?.icon}
          </div>
          <div>
            <h1 className="ad-ws__title" style={{ fontSize: 'var(--ad-fs-24, 24px)' }}>{wsDetail?.name}</h1>
            {wsDetail?.description && <p className="ad-ws__sub">{wsDetail.description}</p>}
          </div>
        </div>
        <div className="ad-ws__head-right">
          <span className="badge-pill" style={{ background: (wsDetail?.color || '#6366F1') + '22', color: wsDetail?.color || '#A5B4FC' }}>
            {wsDetail?.type?.replace('_', ' ')}
          </span>
          <span className="badge-pill" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--ad-ink-2, #94A3B8)' }}>
            {wsDetail?.members?.length} members
          </span>
        </div>
      </header>

      <div className="ad-ws__tabs">
        <SegmentedControl
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { key: 'documents', label: 'Documents' },
            { key: 'notes',     label: 'Notes' },
            { key: 'links',     label: 'Links' },
            { key: 'files',     label: 'Files' },
          ]}
        />
      </div>

      {activeTab === 'documents' && (
        <div className="ad-ws__tab-content">
          <div style={{ marginBottom: 12 }}>
            <PrimaryButton icon={<Icon.Plus size={14} />} onClick={createDocument}>New document</PrimaryButton>
          </div>
          {wsDetail?.documents?.map(doc => (
            <div key={doc._id} className="ws-doc-item ad-ws-doc" onClick={() => openDocument(doc._id)}>
              <div className="ws-doc-icon">📄</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ws-doc-title">{doc.title}</div>
                <div className="ws-doc-meta">
                  {doc.lastEditedBy?.name && `Edited by ${doc.lastEditedBy.name} · `}
                  {new Date(doc.updatedAt).toLocaleDateString()}
                  {doc.classification !== 'personal' && <span className="badge-pill" style={{ marginLeft: 6, background: doc.classification === 'company' ? 'rgba(99,102,241,0.14)' : 'rgba(16,185,129,0.14)', color: doc.classification === 'company' ? '#A5B4FC' : '#6EE7B7' }}>{doc.classification}</span>}
                </div>
              </div>
            </div>
          ))}
          {(!wsDetail?.documents || wsDetail.documents.length === 0) && <div className="ad-ws__empty-inline">No documents yet</div>}
        </div>
      )}

      {activeTab === 'notes' && (
        <div className="ad-ws__tab-content">
          <div style={{ marginBottom: 12 }}>
            <PrimaryButton icon={<Icon.Plus size={14} />} onClick={createNote}>New note</PrimaryButton>
          </div>
          <div className="ws-notes-grid">
            {wsDetail?.notes?.map(note => (
              <div key={note._id} className="ws-note-card ad-ws-note" style={{ background: note.color || '#F8FAFC' }}>
                <div className="ws-note-title">{note.title}</div>
                <div className="ws-note-text">{note.content || 'Empty note'}</div>
              </div>
            ))}
          </div>
          {(!wsDetail?.notes || wsDetail.notes.length === 0) && <div className="ad-ws__empty-inline">No notes yet</div>}
        </div>
      )}

      {activeTab === 'links' && (
        <div className="ad-ws__tab-content">
          <div style={{ marginBottom: 12 }}>
            <PrimaryButton icon={<Icon.Plus size={14} />} onClick={addLink}>Add link</PrimaryButton>
          </div>
          {wsDetail?.links?.map(link => (
            <div key={link._id} className="ws-link-card ad-ws-link" onClick={() => window.open(link.url, '_blank')}>
              <div className="ws-link-icon">🔗</div>
              <div>
                <div className="ws-link-title">{link.title}</div>
                {link.description && <div className="ws-link-desc">{link.description}</div>}
                <div className="ws-link-url">{link.url}</div>
              </div>
            </div>
          ))}
          {(!wsDetail?.links || wsDetail.links.length === 0) && <div className="ad-ws__empty-inline">No links yet</div>}
        </div>
      )}

      {activeTab === 'files' && (
        <div className="ad-ws__tab-content">
          <div style={{ marginBottom: 12 }}>
            <label className="ad-ws__upload">
              <Icon.Plus size={14} /> Upload file
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
            <div key={file._id} className="ws-doc-item ad-ws-doc">
              <div className="ws-doc-icon">📎</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ws-doc-title">{file.originalName || file.name}</div>
                <div className="ws-doc-meta">
                  {file.uploadedBy?.name && `Uploaded by ${file.uploadedBy.name} · `}
                  {file.originalSize ? `${(file.originalSize / 1024).toFixed(1)} KB` : ''}
                </div>
              </div>
            </div>
          ))}
          {(!wsDetail?.files || wsDetail.files.length === 0) && <div className="ad-ws__empty-inline">No files yet</div>}
        </div>
      )}
    </div>
  );
}

function DocumentEditor({ doc, onSave }) {
  const [title, setTitle] = useState(doc.title);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(doc.updatedAt || null);
  const autosaveTimer = useRef(null);

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
    // Session 22: debounced autosave — 1.5s after typing stops.
    // Replaces the old 30-second polling interval which wasted traffic
    // and risked losing recent edits if the user closed the tab mid-cycle.
    onUpdate: ({ editor: ed }) => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(async () => {
        try {
          setSaving(true);
          await api.put(`/workspace/documents/${doc._id}`, {
            title,
            tiptapJSON: ed.getJSON(),
          });
          setLastSaved(new Date().toISOString());
        } catch {} finally { setSaving(false); }
      }, 1500);
    },
  });

  // Clean up autosave timer on unmount so we don't save after navigation.
  useEffect(() => () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); }, []);

  const save = async () => {
    if (!editor) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    setSaving(true);
    try {
      await api.put(`/workspace/documents/${doc._id}`, {
        title,
        tiptapJSON: editor.getJSON()
      });
      setLastSaved(new Date().toISOString());
      onSave();
    } catch {} finally { setSaving(false); }
  };

  const formatSaved = (iso) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const now = Date.now();
      const diff = (now - d.getTime()) / 1000;
      if (diff < 5) return 'just now';
      if (diff < 60) return `${Math.floor(diff)}s ago`;
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  if (!editor) return null;

  return (
    <div className="ad-ws-doc-edit">
      <div className="ad-ws-doc-edit__bar">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={save}
          className="ad-ws-doc-edit__title"
          placeholder="Untitled document"
        />
        <div className="ad-ws-doc-edit__status">
          <span className="ad-ws-doc-edit__saved">
            {saving ? 'Saving…' : lastSaved ? `Saved ${formatSaved(lastSaved)}` : 'Not saved yet'}
          </span>
          <button className="ad-ws-doc-edit__save-btn" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
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
