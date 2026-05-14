import { useState, useEffect, useCallback, useMemo } from 'react';
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
  // Office documents — rendered via Microsoft Office Online viewer
  if (['xlsx','xls','xlsm','docx','doc','pptx','ppt','odt','ods','odp','rtf'].includes(ext) ||
      mt.includes('spreadsheet') || mt.includes('wordprocessingml') || mt.includes('presentation') ||
      mt.includes('msword') || mt.includes('ms-excel') || mt.includes('ms-powerpoint')) return 'office';
  return 'other';
}

function getOfficeViewerUrl(fileUrl) {
  // The file URL must be absolute and publicly accessible (no auth).
  // Microsoft's free viewer renders xlsx/docx/pptx in an iframe.
  let absoluteUrl = fileUrl;
  if (!/^https?:\/\//i.test(fileUrl)) {
    absoluteUrl = window.location.origin + (fileUrl.startsWith('/') ? '' : '/') + fileUrl;
  }
  return 'https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent(absoluteUrl);
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function OfficeView({ url, name }) {
  // Try MS viewer first. If iframe doesn't load anything in ~5s
  // (cross-origin so we can't read content), give the user a one-click
  // switch to Google Docs viewer.
  const [provider, setProvider] = useState('ms');
  const [pollFailed, setPollFailed] = useState(false);
  const absoluteUrl = useMemo(() => {
    if (/^https?:\/\//i.test(url)) return url;
    return window.location.origin + (url.startsWith('/') ? '' : '/') + url;
  }, [url]);

  // Stall watcher: if user is on localhost or the URL host isn't reachable
  // by Microsoft (e.g. behind auth), the viewer often shows a blank page.
  useEffect(() => {
    const t = setTimeout(() => setPollFailed(true), 6000);
    return () => clearTimeout(t);
  }, [provider]);

  const viewerUrl =
    provider === 'ms'
      ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(absoluteUrl)}`
      : `https://docs.google.com/gview?url=${encodeURIComponent(absoluteUrl)}&embedded=true`;

  const isLocalhost = /^(http:\/\/)?(localhost|127\.|192\.168\.)/i.test(absoluteUrl);

  return (
    <div style={{ position: 'relative', width: '100%', height: '70vh', background: '#fff' }}>
      {isLocalhost ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📄</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>{name}</div>
          <div style={{ fontSize: 11 }}>Office preview requires a publicly accessible file URL — this server is local. Download to view.</div>
        </div>
      ) : (
        <>
          <iframe
            key={provider}
            src={viewerUrl}
            title={name}
            style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
            onLoad={() => setPollFailed(false)}
          />
          {/* Provider switcher overlay (top-right) */}
          <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4, background: 'rgba(0,0,0,0.55)', borderRadius: 6, padding: 2 }}>
            <button onClick={() => setProvider('ms')}
              style={pillStyle(provider === 'ms')}>Microsoft</button>
            <button onClick={() => setProvider('google')}
              style={pillStyle(provider === 'google')}>Google</button>
          </div>
          {pollFailed && (
            <div style={{ position: 'absolute', bottom: 8, left: 8, background: 'rgba(0,0,0,0.65)', color: '#fff', padding: '6px 10px', borderRadius: 6, fontSize: 10 }}>
              Preview slow? Try the {provider === 'ms' ? 'Google' : 'Microsoft'} renderer →
            </div>
          )}
        </>
      )}
    </div>
  );
}

function pillStyle(active) {
  return {
    padding: '4px 10px', fontSize: 10, fontWeight: 700,
    background: active ? '#fff' : 'transparent',
    color: active ? '#000' : '#fff',
    border: 'none', borderRadius: 4, cursor: 'pointer'
  };
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

  const handleDownload = async () => {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = name || 'download';
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, '_blank');
    }
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
              onError={e => {
                // Try opening directly if embedded preview fails
                e.target.alt = 'Preview failed — use Download button';
                e.target.style.padding = '40px';
                e.target.style.color = 'var(--ink-3)';
                e.target.style.fontSize = '13px';
              }}
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
            <iframe src={url} title={name} style={{ width: '100%', height: '100%', minHeight: '70vh', border: 'none' }} />
          )}

          {category === 'office' && (
            <OfficeView url={url} name={name} />
          )}

          {category === 'text' && (
            textLoading ? (
              <div style={{ color: 'var(--ink-3)', fontSize: 12 }}>Loading content...</div>
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
