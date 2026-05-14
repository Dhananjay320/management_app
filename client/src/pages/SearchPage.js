import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import api from '../services/api';

const SCOPES = [
  { key: 'tasks', label: 'Tasks', icon: '\u2705', linkPrefix: '/tasks?id=' },
  { key: 'workspace', label: 'Workspace', icon: '\uD83D\uDCC1', linkPrefix: '/workspace?doc=' },
  { key: 'messages', label: 'Messages', icon: '\uD83D\uDCAC', linkPrefix: '/messages?channel=' },
  { key: 'meetings', label: 'Meetings', icon: '\uD83D\uDC65', linkPrefix: '/meetings?id=' },
  { key: 'email', label: 'Email', icon: '\u2709\uFE0F', linkPrefix: '/email?id=' },
];

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { socket } = useSocket();
  const query = searchParams.get('q') || '';
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(false);
  const [localQuery, setLocalQuery] = useState(query);

  // Type filter
  const [typeFilter, setTypeFilter] = useState('all');

  const TYPE_FILTERS = [
    { key: 'all', label: 'All', icon: '🔎' },
    { key: 'tasks', label: 'Tasks', icon: '✅' },
    { key: 'messages', label: 'Messages', icon: '💬' },
    { key: 'meetings', label: 'Meetings', icon: '👥' },
    { key: 'workspace', label: 'Workspace', icon: '📁' },
    { key: 'email', label: 'Email', icon: '✉️' },
    { key: 'images', label: 'Images', icon: '🖼️' },
    { key: 'documents', label: 'Documents', icon: '📄' },
    { key: 'videos', label: 'Videos', icon: '🎬' },
  ];

  const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|bmp|svg|webp|ico|tiff?)$/i;
  const DOCUMENT_EXTENSIONS = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|rtf|odt|ods|odp)$/i;
  const VIDEO_EXTENSIONS = /\.(mp4|mov|avi|mkv|webm|wmv|flv|m4v|3gp)$/i;

  const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/svg+xml', 'image/webp', 'image/tiff'];
  const DOCUMENT_MIMES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'text/plain', 'text/csv'];
  const VIDEO_MIMES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm', 'video/x-ms-wmv', 'video/x-flv'];

  const matchesMediaFilter = (item, filterKey) => {
    const mime = (item.mimeType || item.mime || '').toLowerCase();
    const title = (item.title || item.fileName || '').toLowerCase();
    if (filterKey === 'images') {
      return IMAGE_MIMES.some(m => mime.includes(m)) || IMAGE_EXTENSIONS.test(title);
    }
    if (filterKey === 'documents') {
      return DOCUMENT_MIMES.some(m => mime.includes(m)) || DOCUMENT_EXTENSIONS.test(title);
    }
    if (filterKey === 'videos') {
      return VIDEO_MIMES.some(m => mime.includes(m)) || VIDEO_EXTENSIONS.test(title);
    }
    return false;
  };

  // Deep research toggle
  const [searchFiles, setSearchFiles] = useState(false);
  const [deepJob, setDeepJob] = useState(null);
  const [deepResults, setDeepResults] = useState([]);
  const [deepProgress, setDeepProgress] = useState(null);
  const [deepMessage, setDeepMessage] = useState('');

  const startDeepFileSearch = async (q) => {
    if (!q.trim() || deepJob) return;
    setDeepResults([]);
    setDeepProgress(null);
    setDeepMessage('');
    try {
      // Search workspace scope with file content
      const { data } = await api.post('/search/deep', { query: q, scope: 'workspace', searchFiles: true });
      setDeepJob(data.jobId);
    } catch (err) {
      setDeepMessage(err.response?.data?.error || 'Failed to start deep search.');
    }
  };

  useEffect(() => {
    if (!socket) return;
    const handlePartial = (data) => { if (data.jobId === deepJob) setDeepResults(prev => [...prev, ...data.newResults]); };
    const handleProgress = (data) => { if (data.jobId === deepJob) setDeepProgress(data); };
    const handleComplete = (data) => { if (data.jobId === deepJob) { setDeepMessage(data.message); setDeepJob(null); } };
    const handleCancelled = (data) => { if (data.jobId === deepJob) { setDeepMessage('Search cancelled.'); setDeepJob(null); } };
    socket.on('deep_search_partial', handlePartial);
    socket.on('deep_search_progress', handleProgress);
    socket.on('deep_search_complete', handleComplete);
    socket.on('deep_search_cancelled', handleCancelled);
    return () => { socket.off('deep_search_partial', handlePartial); socket.off('deep_search_progress', handleProgress); socket.off('deep_search_complete', handleComplete); socket.off('deep_search_cancelled', handleCancelled); };
  }, [socket, deepJob]);

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) return;
    setLoading(true);
    const allResults = {};
    await Promise.all(
      SCOPES.map(async (scope) => {
        try {
          const { data } = await api.get('/search/normal', { params: { q, scope: scope.key, limit: 10 } });
          allResults[scope.key] = data;
        } catch {
          allResults[scope.key] = [];
        }
      })
    );
    setResults(allResults);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (query) {
      setLocalQuery(query);
      doSearch(query);
    }
  }, [query, doSearch]);

  const handleSearch = () => {
    if (localQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(localQuery.trim())}`);
    }
  };

  const isMediaFilter = ['images', 'documents', 'videos'].includes(typeFilter);

  const getFilteredResults = () => {
    if (typeFilter === 'all') return results;
    if (isMediaFilter) {
      // For media filters, scan all scopes for matching items
      const filtered = {};
      for (const scope of SCOPES) {
        const items = results[scope.key];
        if (!items) continue;
        const matched = items.filter(item => matchesMediaFilter(item, typeFilter));
        if (matched.length > 0) filtered[scope.key] = matched;
      }
      return filtered;
    }
    // Standard scope filter — only show matching scope
    const filtered = {};
    if (results[typeFilter]) filtered[typeFilter] = results[typeFilter];
    return filtered;
  };

  const filteredResults = getFilteredResults();
  const totalResults = Object.values(filteredResults).reduce((sum, arr) => sum + (arr?.length || 0), 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Search</div>
          <div className="page-subtitle">{query ? `Results for "${query}"` : 'Search across everything'}</div>
        </div>
      </div>

      <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
        <input
          value={localQuery}
          onChange={e => setLocalQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
          placeholder="Search tasks, messages, meetings, workspace, email..."
          style={{ flex: 1, padding: '10px 14px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, fontFamily: 'Inter,sans-serif', outline: 'none', background: 'var(--glass)', color: 'var(--ink)' }}
        />
        <button onClick={handleSearch} className="btn btn-primary-sm">Search</button>
      </div>

      {/* Type filter chips */}
      <div className="chip-group" style={{ marginBottom: 12 }}>
        {TYPE_FILTERS.map(f => (
          <div
            key={f.key}
            className={`chip${typeFilter === f.key ? ' active' : ''}`}
            onClick={() => setTypeFilter(f.key)}
          >
            {f.icon} {f.label}
          </div>
        ))}
      </div>

      {/* Deep Research toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', marginBottom: 16 }}>
        <div onClick={() => setSearchFiles(!searchFiles)}
          style={{ width: 38, height: 20, borderRadius: 10, background: searchFiles ? '#6366F1' : 'var(--line)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
          <div style={{ width: 16, height: 16, borderRadius: 8, background: '#fff', position: 'absolute', top: 2, left: searchFiles ? 20 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: searchFiles ? '#6366F1' : 'var(--ink-2)' }}>
            Deep Research {searchFiles ? 'ON' : 'OFF'}
          </div>
          <div style={{ fontSize: 9, color: 'var(--ink-3)' }}>
            {searchFiles ? 'Searches inside PDF, DOCX, TXT file contents' : 'Toggle ON to search inside uploaded documents'}
          </div>
        </div>
        {searchFiles && !deepJob && query && (
          <button onClick={() => startDeepFileSearch(query)}
            style={{ padding: '4px 12px', fontSize: 10, fontWeight: 600, border: '1px solid #6366F1', borderRadius: 6, background: 'rgba(99,102,241,0.08)', color: '#6366F1', cursor: 'pointer', fontFamily: 'Inter' }}>
            Scan Files
          </button>
        )}
        {deepJob && (
          <button onClick={async () => { try { await api.put(`/search/deep/${deepJob}/cancel`); setDeepJob(null); } catch {} }}
            style={{ padding: '4px 12px', fontSize: 10, fontWeight: 600, border: '1px solid #EF4444', borderRadius: 6, background: 'rgba(239,68,68,0.08)', color: '#EF4444', cursor: 'pointer', fontFamily: 'Inter' }}>
            Cancel
          </button>
        )}
      </div>

      {/* Deep search progress */}
      {deepJob && deepProgress && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6366F1', marginBottom: 4 }}>
            Scanning file contents... {deepProgress.phase === 'files' ? '(reading documents)' : ''}
          </div>
          <div style={{ height: 4, borderRadius: 2, background: 'var(--line)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.round((deepProgress.processedChunks / Math.max(deepProgress.totalChunks, 1)) * 100)}%`, background: '#6366F1', borderRadius: 2, transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: 9, color: 'var(--ink-3)', marginTop: 3 }}>
            {deepProgress.processedChunks}/{deepProgress.totalChunks} chunks {deepProgress.totalFound > 0 ? `— ${deepProgress.totalFound} found` : ''}
          </div>
        </div>
      )}
      {deepMessage && !deepJob && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 11, color: 'var(--ink-2)' }}>
          {deepMessage}
        </div>
      )}

      {/* Deep file results */}
      {deepResults.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#6366F1', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>📄</span> File Content Results
            <span style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 400 }}>({deepResults.length})</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {deepResults.map((item, i) => (
              <div key={`deep-${i}`}
                style={{ padding: '10px 14px', background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.12)', borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>{item.title}</div>
                {item.snippet && (
                  <div style={{ fontSize: 11, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.snippet}</div>
                )}
                <div style={{ fontSize: 9, color: '#6366F1', marginTop: 2 }}>Found inside document content</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-3)', fontSize: 13 }}>Searching...</div>}

      {!loading && query && totalResults === 0 && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>No results found</div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Try different keywords or check your spelling</div>
        </div>
      )}

      {!loading && SCOPES.map(scope => {
        const items = filteredResults[scope.key];
        if (!items || items.length === 0) return null;
        return (
          <div key={scope.key} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{scope.icon}</span> {scope.label}
              <span style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 400 }}>({items.length})</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {items.map(item => (
                <div
                  key={item.entityId}
                  onClick={() => navigate(`${scope.linkPrefix}${item.entityId}`)}
                  style={{ padding: '10px 14px', background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 8, cursor: 'pointer', transition: 'border-color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#6366F1'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--line)'}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>{item.title}</div>
                  {item.snippet && item.snippet !== item.title && (
                    <div style={{ fontSize: 11, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.snippet}</div>
                  )}
                  <div style={{ fontSize: 9, color: 'var(--ink-4)', marginTop: 2 }}>{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
