import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const GRADIENTS = [
  'linear-gradient(135deg,#6366F1,#8B5CF6)',
  'linear-gradient(135deg,#10B981,#06B6D4)',
  'linear-gradient(135deg,#F59E0B,#F97316)',
  'linear-gradient(135deg,#EC4899,#8B5CF6)',
];
const getGradient = (str) => {
  const h = (str || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return GRADIENTS[h % GRADIENTS.length];
};
const getInitials = (n) => (n || '??').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
const todayStr = () => new Date().toISOString().split('T')[0];
const formatDate = (s) => new Date(s + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const timeAgo = (iso) => {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
};

export default function ReportsPage() {
  const { user } = useAuth();
  const [date, setDate] = useState(todayStr());
  const [reports, setReports] = useState([]);
  const [myReport, setMyReport] = useState(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  const isToday = date === todayStr();

  const loadAll = useCallback(async () => {
    try {
      const [list, mine] = await Promise.all([
        api.get('/reports', { params: { date } }).then(r => r.data),
        api.get('/reports/me', { params: { date } }).then(r => r.data),
      ]);
      setReports(list);
      setMyReport(mine);
      setDraft(mine?.content || '');
      setEditing(!mine && isToday);
    } catch {}
  }, [date, isToday]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const loadHistory = async () => {
    try {
      const { data } = await api.get('/reports/me/history', { params: { limit: 30 } });
      setHistory(data);
      setShowHistory(true);
    } catch {}
  };

  const save = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await api.post('/reports', { content: draft, date });
      await loadAll();
      setEditing(false);
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to save report.');
    }
    setSaving(false);
  };

  const others = reports.filter(r => r.user?._id !== user?._id);

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Daily Reports</h1>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>🔒 Private — visible only to you and your manager</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            max={todayStr()}
            style={{ padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12, background: 'var(--bg-1)', color: 'var(--ink)', fontFamily: 'Inter, sans-serif' }}
          />
          <button
            onClick={loadHistory}
            style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, border: '1px solid var(--line)', borderRadius: 8, background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
          >
            📜 My History
          </button>
        </div>
      </div>

      {/* My report card */}
      <div style={{ background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: getGradient(user?._id), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12 }}>
            {getInitials(user?.name)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Your report — {formatDate(date)}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
              {myReport ? `Last updated ${timeAgo(myReport.updatedAt)}` : isToday ? 'Not posted yet' : 'No report for this day'}
            </div>
          </div>
          {myReport && !editing && isToday && (
            <button onClick={() => setEditing(true)} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, border: '1px solid var(--line)', borderRadius: 8, background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer' }}>
              ✏️ Edit
            </button>
          )}
        </div>

        {editing ? (
          <>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder={`Today I…\n• Finished the Q2 design draft\n• Reviewed PRs from Ravi\n• Met the client for onboarding`}
              rows={6}
              style={{ width: '100%', padding: 12, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)', color: 'var(--ink)', fontSize: 13, fontFamily: 'Inter, sans-serif', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5 }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
              {myReport && (
                <button onClick={() => { setDraft(myReport.content); setEditing(false); }} style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, border: '1px solid var(--line)', borderRadius: 8, background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer' }}>
                  Cancel
                </button>
              )}
              <button
                onClick={save}
                disabled={saving || !draft.trim()}
                style={{ padding: '8px 16px', fontSize: 12, fontWeight: 700, border: 'none', borderRadius: 8, background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', color: '#fff', cursor: saving ? 'wait' : 'pointer', opacity: !draft.trim() ? 0.5 : 1 }}
              >
                {saving ? 'Saving…' : myReport ? 'Update' : 'Post Report'}
              </button>
            </div>
          </>
        ) : myReport ? (
          <div style={{ fontSize: 13, color: 'var(--ink)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{myReport.content}</div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--ink-3)', fontStyle: 'italic' }}>{isToday ? 'You haven\'t posted today\'s report yet.' : 'No report for this day.'}</div>
        )}
      </div>

      {/* Direct-reports section (only for managers) */}
      {others.length > 0 && (
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-2)', margin: 0 }}>Your Direct Reports ({others.length})</h3>
        </div>
      )}

      {others.length === 0 ? null : (
        others.map(r => (
          <div key={r._id} style={{ background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 12, padding: 14, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: getGradient(r.user?._id), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 11 }}>
                {getInitials(r.user?.name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{r.user?.name}</div>
                <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>
                  {r.team?.name && <span>{r.team.name} · </span>}{timeAgo(r.updatedAt)}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink)', whiteSpace: 'pre-wrap', lineHeight: 1.6, paddingLeft: 42 }}>{r.content}</div>
          </div>
        ))
      )}

      {/* History modal */}
      {showHistory && (
        <>
          <div onClick={() => setShowHistory(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 998 }} />
          <div style={{ position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)', width: 'min(640px, 92vw)', maxHeight: '80vh', overflowY: 'auto', background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 14, boxShadow: '0 12px 48px rgba(0,0,0,0.5)', zIndex: 999, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>My History</h3>
              <button onClick={() => setShowHistory(false)} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--ink-3)', cursor: 'pointer' }}>×</button>
            </div>
            {history.length === 0 ? (
              <div style={{ color: 'var(--ink-3)', fontSize: 12 }}>No past reports.</div>
            ) : history.map(h => (
              <div key={h._id} style={{ borderLeft: '3px solid #6366F1', paddingLeft: 12, marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6366F1' }}>{formatDate(h.date)}</div>
                <div style={{ fontSize: 12, color: 'var(--ink)', whiteSpace: 'pre-wrap', marginTop: 4, lineHeight: 1.5 }}>{h.content}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
