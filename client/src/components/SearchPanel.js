import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import api from '../services/api';
import '../styles/search.css';

const SCOPE_ICONS = {
  workspace: '📁', tasks: '✅', meetings: '👥',
  email: '✉️', messages: '💬', stickynotes: '📝'
};

const SCOPE_LABELS = {
  workspace: 'Workspace', tasks: 'Tasks', meetings: 'Meetings',
  email: 'Email', messages: 'Messages', stickynotes: 'Sticky Notes'
};

function highlightMatch(text, query) {
  if (!text || !query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.substring(0, idx)}
      <mark>{text.substring(idx, idx + query.length)}</mark>
      {text.substring(idx + query.length)}
    </>
  );
}

export default function SearchPanel({ defaultScope = 'workspace', onResultClick }) {
  const { socket } = useSocket();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState(defaultScope);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Deep search state
  const [deepJob, setDeepJob] = useState(null);
  const [deepProgress, setDeepProgress] = useState(null);
  const [deepResults, setDeepResults] = useState([]);
  const [deepMessage, setDeepMessage] = useState('');

  // Search history (localStorage)
  const historyKey = `search_history_${scope}`;
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem(historyKey)) || []; } catch { return []; }
  });

  const searchTimeout = useRef(null);

  // Normal search (debounced)
  const normalSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const { data } = await api.get('/search/normal', { params: { q, scope } });
      setResults(data);
    } catch {}
    setSearching(false);
  }, [scope]);

  const handleInput = (value) => {
    setQuery(value);
    clearTimeout(searchTimeout.current);
    if (value.trim()) {
      searchTimeout.current = setTimeout(() => normalSearch(value), 300);
    } else {
      setResults([]);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && query.trim()) {
      normalSearch(query);
      saveToHistory(query);
    }
  };

  const saveToHistory = (q) => {
    const updated = [q, ...history.filter(h => h !== q)].slice(0, 10);
    setHistory(updated);
    localStorage.setItem(historyKey, JSON.stringify(updated));
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(historyKey);
  };

  // Deep search
  const startDeepSearch = async () => {
    if (!query.trim()) return;
    saveToHistory(query);
    setDeepResults([]);
    setDeepProgress(null);
    setDeepMessage('');
    try {
      const { data } = await api.post('/search/deep', { query, scope });
      setDeepJob(data.jobId);
    } catch (err) {
      if (err.response?.status === 429) {
        setDeepMessage(err.response.data.error);
      }
    }
  };

  const cancelDeepSearch = async () => {
    if (!deepJob) return;
    try {
      await api.put(`/search/deep/${deepJob}/cancel`);
      setDeepJob(null);
      setDeepProgress(null);
    } catch {}
  };

  // Socket listeners for deep search progress
  useEffect(() => {
    if (!socket) return;

    const handlePartial = (data) => {
      if (data.jobId === deepJob) {
        setDeepResults(prev => [...prev, ...data.newResults]);
      }
    };
    const handleProgress = (data) => {
      if (data.jobId === deepJob) {
        setDeepProgress(data);
      }
    };
    const handleComplete = (data) => {
      if (data.jobId === deepJob) {
        setDeepMessage(data.message);
        setDeepJob(null);
      }
    };
    const handleCancelled = (data) => {
      if (data.jobId === deepJob) {
        setDeepMessage('Search cancelled.');
        setDeepJob(null);
      }
    };

    socket.on('deep_search_partial', handlePartial);
    socket.on('deep_search_progress', handleProgress);
    socket.on('deep_search_complete', handleComplete);
    socket.on('deep_search_cancelled', handleCancelled);

    return () => {
      socket.off('deep_search_partial', handlePartial);
      socket.off('deep_search_progress', handleProgress);
      socket.off('deep_search_complete', handleComplete);
      socket.off('deep_search_cancelled', handleCancelled);
    };
  }, [socket, deepJob]);

  const allResults = [...results, ...deepResults];

  return (
    <div>
      {/* Search Bar */}
      <div className="search-bar">
        <select className="search-scope-select" value={scope} onChange={e => { setScope(e.target.value); setResults([]); setDeepResults([]); }}>
          {Object.entries(SCOPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{SCOPE_ICONS[key]} {label}</option>
          ))}
        </select>
        <div className="search-input-wrap">
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            placeholder={`Search ${SCOPE_LABELS[scope].toLowerCase()}...`}
            value={query}
            onChange={e => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <button
          className="search-deep-btn"
          onClick={startDeepSearch}
          disabled={!query.trim() || !!deepJob}
        >
          {deepJob ? 'Searching...' : 'Deep Search'}
        </button>
      </div>

      {/* Deep Search Progress */}
      {deepJob && deepProgress && (
        <div className="search-progress">
          <div className="search-progress-header">
            <span className="search-progress-title">Deep searching {SCOPE_LABELS[scope]}...</span>
            <button className="search-progress-cancel" onClick={cancelDeepSearch}>Cancel</button>
          </div>
          <div className="search-progress-bar">
            <div
              className="search-progress-fill"
              style={{ width: `${Math.round((deepProgress.processedChunks / deepProgress.totalChunks) * 100)}%` }}
            />
          </div>
          <div className="search-progress-text">
            {deepProgress.processedChunks}/{deepProgress.totalChunks} chunks processed
            {deepProgress.totalFound > 0 && ` — ${deepProgress.totalFound} found`}
          </div>
        </div>
      )}

      {/* Deep Search Complete Message */}
      {deepMessage && !deepJob && (
        <div className="search-progress">
          <div className="search-progress-message">{deepMessage}</div>
        </div>
      )}

      {/* Search History */}
      {!query && history.length > 0 && (
        <div className="search-history">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="search-history-title">Recent Searches</span>
            <button className="search-results-clear" onClick={clearHistory}>Clear</button>
          </div>
          {history.map((h, i) => (
            <div key={i} className="search-history-item" onClick={() => { setQuery(h); normalSearch(h); }}>
              <span className="search-history-icon">🕐</span>
              {h}
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {allResults.length > 0 && (
        <div className="search-results">
          <div className="search-results-header">
            <span className="search-results-title">
              {results.length > 0 && `${results.length} result${results.length !== 1 ? 's' : ''}`}
              {deepResults.length > 0 && results.length > 0 && ' + '}
              {deepResults.length > 0 && `${deepResults.length} deep result${deepResults.length !== 1 ? 's' : ''}`}
            </span>
            <button className="search-results-clear" onClick={() => { setResults([]); setDeepResults([]); setDeepMessage(''); }}>
              Clear
            </button>
          </div>
          {allResults.map((r, i) => (
            <div key={`${r.entityId}-${i}`} className="search-result-item" onClick={() => onResultClick?.(r)}>
              <div className="search-result-icon">
                {SCOPE_ICONS[r.entityType] || SCOPE_ICONS[scope]}
              </div>
              <div className="search-result-content">
                <div className="search-result-title">{highlightMatch(r.title, query)}</div>
                <div className="search-result-snippet">{highlightMatch(r.snippet, query)}</div>
                <div className="search-result-type">{r.entityType}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No Results */}
      {query && !searching && results.length === 0 && deepResults.length === 0 && !deepJob && (
        <div className="search-no-results">
          No results found for "{query}". Try Deep Search for content-level results.
        </div>
      )}
    </div>
  );
}
