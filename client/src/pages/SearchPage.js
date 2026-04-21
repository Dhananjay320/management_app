import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
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
  const query = searchParams.get('q') || '';
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(false);
  const [localQuery, setLocalQuery] = useState(query);

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

  const totalResults = Object.values(results).reduce((sum, arr) => sum + (arr?.length || 0), 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Search</div>
          <div className="page-subtitle">{query ? `Results for "${query}"` : 'Search across everything'}</div>
        </div>
      </div>

      <div style={{ marginBottom: 20, display: 'flex', gap: 8 }}>
        <input
          value={localQuery}
          onChange={e => setLocalQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
          placeholder="Search tasks, messages, meetings, workspace, email..."
          style={{ flex: 1, padding: '10px 14px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: 'Inter,sans-serif', outline: 'none' }}
        />
        <button onClick={handleSearch} className="btn btn-primary-sm">Search</button>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8', fontSize: 13 }}>Searching...</div>}

      {!loading && query && totalResults === 0 && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', marginBottom: 4 }}>No results found</div>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>Try different keywords or check your spelling</div>
        </div>
      )}

      {!loading && SCOPES.map(scope => {
        const items = results[scope.key];
        if (!items || items.length === 0) return null;
        return (
          <div key={scope.key} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{scope.icon}</span> {scope.label}
              <span style={{ fontSize: 10, color: '#94A3B8', fontWeight: 400 }}>({items.length})</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {items.map(item => (
                <div
                  key={item.entityId}
                  onClick={() => navigate(`${scope.linkPrefix}${item.entityId}`)}
                  style={{ padding: '10px 14px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, cursor: 'pointer', transition: 'border-color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#6366F1'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#E2E8F0'}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#1E293B', marginBottom: 2 }}>{item.title}</div>
                  {item.snippet && item.snippet !== item.title && (
                    <div style={{ fontSize: 11, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.snippet}</div>
                  )}
                  <div style={{ fontSize: 9, color: '#CBD5E1', marginTop: 2 }}>{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
