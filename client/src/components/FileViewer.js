import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import './FileViewer.css';

function getMimeCategory(mimeType, name) {
  const mt = (mimeType || '').toLowerCase();
  const ext = (name || '').split('.').pop().toLowerCase();

  if (mt.startsWith('image/') || ['png','jpg','jpeg','gif','webp','svg'].includes(ext)) return 'image';
  if (mt.startsWith('video/') || ['mp4','webm','ogg'].includes(ext)) return 'video';
  if (mt.startsWith('audio/') || ['mp3','wav','ogg','aac'].includes(ext)) return 'audio';
  if (mt === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mt.startsWith('text/') || ['json','csv','md','txt','js','jsx','ts','tsx','css','html','xml','yaml','yml','py','rb','go','rs','sh','sql','log','env','conf','ini','toml'].includes(ext)) return 'text';
  return 'other';
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

export default function FileViewer({ url, name, mimeType, size, onClose }) {
  const [zoomed, setZoomed] = useState(false);
  const [textContent, setTextContent] = useState(null);
  const [textLoading, setTextLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  // Add to Workspace state
  const [showWsDropdown, setShowWsDropdown] = useState(false);
  const [workspaces, setWorkspaces] = useState([]);
  const [wsLoading, setWsLoading] = useState(false);

  const category = getMimeCategory(mimeType, name);

  // Fetch text content for text files
  useEffect(() => {
    if (category === 'text' && url) {
      setTextLoading(true);
      fetch(url)
        .then(r => r.text())
        .then(text => { setTextContent(text); setEditContent(text); })
        .catch(() => setTextContent('Failed to load file content.'))
        .finally(() => setTextLoading(false));
    }
  }, [category, url]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = name || 'download';
    a.click();
  };

  const handleEdit = () => {
    setEditing(true);
    setEditContent(textContent || '');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: editContent
      });
      setTextContent(editContent);
      setEditing(false);
    } catch {
      // Silently fail — PUT may not be supported for all file backends
      setTextContent(editContent);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setEditContent(textContent || '');
  };

  // Add to Workspace
  const loadWorkspaces = useCallback(async () => {
    setWsLoading(true);
    try {
      const { data } = await api.get('/workspace');
      setWorkspaces(data);
    } catch {}
    finally { setWsLoading(false); }
  }, []);

  const toggleWsDropdown = () => {
    if (!showWsDropdown) loadWorkspaces();
    setShowWsDropdown(!showWsDropdown);
  };

  const addToWorkspace = async (wsId) => {
    try {
      await api.post(`/workspace/${wsId}/files/import-from-attachment`, {
        sourceUrl: url,
        fileName: name,
        mimeType: mimeType || 'application/octet-stream',
        size: size || 0
      });
      setShowWsDropdown(false);
      alert('File added to workspace!');
    } catch {
      alert('Failed to add file to workspace.');
    }
  };

  const isTextEditable = category === 'text';

  return (
    <div className="file-viewer-overlay" onClick={onClose}>
      <div className="file-viewer-card" onClick={e => e.stopPropagation()}>
        <div className="file-viewer-header">
          <span className="file-viewer-title">{name || 'File'}</span>
          <div className="file-viewer-actions">
            {isTextEditable && !editing && (
              <button className="file-viewer-btn" onClick={handleEdit}>Edit</button>
            )}
            {editing && (
              <>
                <button className="file-viewer-btn" onClick={handleCancelEdit}>Cancel</button>
                <button className="file-viewer-btn file-viewer-btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </>
            )}
            <button className="file-viewer-btn" onClick={handleDownload}>Download</button>
            <div style={{ position: 'relative' }}>
              <button className="file-viewer-btn" onClick={toggleWsDropdown}>Add to Workspace</button>
              {showWsDropdown && (
                <div className="fv-ws-dropdown">
                  <div className="fv-ws-dropdown-title">Select workspace</div>
                  {wsLoading && <div className="fv-ws-dropdown-empty">Loading...</div>}
                  {!wsLoading && workspaces.length === 0 && <div className="fv-ws-dropdown-empty">No workspaces found</div>}
                  {!wsLoading && workspaces.map(ws => (
                    <div key={ws._id} className="fv-ws-dropdown-item" onClick={() => addToWorkspace(ws._id)}>
                      <span>{ws.icon || '📁'}</span>
                      <span>{ws.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button className="file-viewer-close" onClick={onClose}>&times;</button>
          </div>
        </div>

        <div className="file-viewer-body">
          {category === 'image' && (
            <img
              src={url}
              alt={name}
              className={zoomed ? 'zoomed' : ''}
              onClick={() => setZoomed(!zoomed)}
            />
          )}

          {category === 'video' && (
            <video controls src={url} style={{ width: '100%' }}>
              Your browser does not support video playback.
            </video>
          )}

          {category === 'audio' && (
            <audio controls src={url} style={{ width: '100%' }}>
              Your browser does not support audio playback.
            </audio>
          )}

          {category === 'pdf' && (
            <iframe src={url} title={name} style={{ width: '100%', height: '70vh' }} />
          )}

          {category === 'text' && (
            textLoading ? (
              <div style={{ color: '#94A3B8', fontSize: 12 }}>Loading content...</div>
            ) : editing ? (
              <textarea
                className="file-viewer-edit-area"
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                autoFocus
              />
            ) : (
              <pre className="file-viewer-pre">{textContent}</pre>
            )
          )}

          {category === 'other' && (
            <div className="file-viewer-info">
              <div className="file-viewer-info-icon">📄</div>
              <div className="file-viewer-info-name">{name || 'Unknown file'}</div>
              <div className="file-viewer-info-meta">
                {mimeType && <span>{mimeType}</span>}
                {size ? <span> &middot; {formatSize(size)}</span> : null}
              </div>
              <button className="file-viewer-btn file-viewer-btn-primary" onClick={handleDownload}>
                Download File
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
