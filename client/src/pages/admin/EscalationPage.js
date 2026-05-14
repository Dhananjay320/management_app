import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

const CATEGORY_ICONS = {
  attendance: '⏰', salary: '💰', tasks: '✅', behavior: '🚨',
  performance: '📊', emergency: '🆘', other: '📋'
};

const SEVERITY_COLORS = {
  low: '#10B981', medium: '#F59E0B', high: '#F97316', critical: '#EF4444'
};

const STATUS_CONFIG = {
  open: { label: 'Open', color: '#3B82F6', bg: 'rgba(59,130,246,0.08)' },
  in_progress: { label: 'In Progress', color: '#F59E0B', bg: 'rgba(245,158,11,0.08)' },
  forwarded: { label: 'Forwarded', color: '#8B5CF6', bg: 'rgba(139,92,246,0.08)' },
  resolved: { label: 'Resolved', color: '#10B981', bg: 'rgba(16,185,129,0.08)' },
  dismissed: { label: 'Dismissed', color: 'var(--ink-3)', bg: 'var(--glass)' },
};

const GRADIENTS = [
  'linear-gradient(135deg,#6366F1,#8B5CF6)',
  'linear-gradient(135deg,#10B981,#06B6D4)',
  'linear-gradient(135deg,#F59E0B,#F97316)',
  'linear-gradient(135deg,#EC4899,#8B5CF6)',
  'linear-gradient(135deg,#EF4444,#F97316)',
];

function getGrad(id) {
  const hash = (id || '').toString().split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return GRADIENTS[hash % GRADIENTS.length];
}

function initials(name) {
  return (name || '??').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function EscalationPage() {
  const { user } = useAuth();
  const [escalations, setEscalations] = useState([]);
  const [filter, setFilter] = useState('active'); // 'active', 'resolved', 'all'
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [stats, setStats] = useState({ open: 0, inProgress: 0, forwarded: 0, resolved: 0, total: 0 });
  const [allUsers, setAllUsers] = useState([]);
  const [employees, setEmployees] = useState([]);

  const loadEscalations = useCallback(async () => {
    try {
      const params = {};
      if (filter === 'active') params.status = 'open,in_progress,forwarded';
      else if (filter === 'resolved') params.status = 'resolved,dismissed';
      const { data } = await api.get('/escalations', { params });
      setEscalations(data);
    } catch {}
  }, [filter]);

  const loadStats = useCallback(async () => {
    try {
      const { data } = await api.get('/escalations/stats');
      setStats(data);
    } catch {}
  }, []);

  useEffect(() => { loadEscalations(); loadStats(); }, [loadEscalations, loadStats]);
  useEffect(() => {
    api.get('/users').then(r => {
      setAllUsers(r.data || []);
      setEmployees((r.data || []).filter(u => u.role === 'employee'));
    }).catch(() => {});
  }, []);

  // Create form
  const [createForm, setCreateForm] = useState({ employeeId: '', assignedTo: '', category: 'attendance', severity: 'medium', subject: '', description: '' });

  const handleCreate = async () => {
    if (!createForm.employeeId || !createForm.assignedTo || !createForm.subject.trim()) return;
    try {
      await api.post('/escalations', createForm);
      setShowCreate(false);
      setCreateForm({ employeeId: '', assignedTo: '', category: 'attendance', severity: 'medium', subject: '', description: '' });
      loadEscalations();
      loadStats();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create escalation.');
    }
  };

  // Detail actions
  const [commentInput, setCommentInput] = useState('');
  const [forwardTo, setForwardTo] = useState('');
  const [forwardReason, setForwardReason] = useState('');
  const [resolveNote, setResolveNote] = useState('');

  const addComment = async () => {
    if (!commentInput.trim() || !selected) return;
    try {
      const { data } = await api.post(`/escalations/${selected._id}/comment`, { message: commentInput.trim() });
      setSelected(data);
      setCommentInput('');
      loadEscalations();
    } catch {}
  };

  const forwardEscalation = async () => {
    if (!forwardTo || !selected) return;
    try {
      const { data } = await api.post(`/escalations/${selected._id}/forward`, { toUserId: forwardTo, reason: forwardReason });
      setSelected(data);
      setForwardTo('');
      setForwardReason('');
      loadEscalations();
      loadStats();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to forward.');
    }
  };

  const resolveEscalation = async () => {
    if (!selected) return;
    try {
      const { data } = await api.put(`/escalations/${selected._id}/resolve`, { resolution: resolveNote });
      setSelected(data);
      setResolveNote('');
      loadEscalations();
      loadStats();
    } catch {}
  };

  const dismissEscalation = async () => {
    if (!selected) return;
    try {
      const { data } = await api.put(`/escalations/${selected._id}/dismiss`, { reason: 'Dismissed by admin' });
      setSelected(data);
      loadEscalations();
      loadStats();
    } catch {}
  };

  if (selected) {
    const sc = STATUS_CONFIG[selected.status] || STATUS_CONFIG.open;
    return (
      <div>
        <div className="page-header">
          <div>
            <div className="page-title">{selected.subject}</div>
            <div className="page-subtitle">Escalation Detail</div>
          </div>
          <button className="btn btn-secondary" onClick={() => setSelected(null)}>Back to List</button>
        </div>

        {/* Info bar */}
        <div className="card" style={{ marginBottom: 14, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 18 }}>{CATEGORY_ICONS[selected.category]}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', textTransform: 'capitalize' }}>{selected.category}</span>
          </div>
          <span className="badge-pill" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
          <span className="badge-pill" style={{ background: `${SEVERITY_COLORS[selected.severity]}15`, color: SEVERITY_COLORS[selected.severity] }}>
            {selected.severity.toUpperCase()}
          </span>
          <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
            About: <strong style={{ color: 'var(--ink)' }}>{selected.employee?.name}</strong>
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
            Created by: <strong style={{ color: 'var(--ink)' }}>{selected.createdBy?.name}</strong> {timeAgo(selected.createdAt)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
            Assigned to: <strong style={{ color: '#6366F1' }}>{selected.assignedTo?.name}</strong>
          </div>
        </div>

        {/* Description */}
        {selected.description && (
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 6 }}>Description</div>
            <div style={{ fontSize: 12, color: 'var(--ink)', lineHeight: 1.7 }}>{selected.description}</div>
          </div>
        )}

        {/* Forward chain */}
        {selected.forwardChain?.length > 0 && (
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 8 }}>Forward Chain</div>
            {selected.forwardChain.map((fc, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 11, color: 'var(--ink-2)' }}>
                <span style={{ color: '#8B5CF6' }}>{fc.from?.name}</span>
                <span>→</span>
                <span style={{ color: '#6366F1', fontWeight: 600 }}>{fc.to?.name}</span>
                {fc.reason && <span style={{ color: 'var(--ink-3)', fontStyle: 'italic' }}>"{fc.reason}"</span>}
              </div>
            ))}
          </div>
        )}

        {/* Thread */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 10 }}>Thread ({selected.thread?.length || 0})</div>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {(selected.thread || []).map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 10, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: getGrad(t.user?._id || i), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>
                  {initials(t.user?.name)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink)' }}>{t.user?.name || 'System'}</span>
                    {t.action && t.action !== 'comment' && (
                      <span className="badge-pill" style={{ fontSize: 8, background: 'rgba(139,92,246,0.1)', color: '#8B5CF6' }}>{t.action}</span>
                    )}
                    <span style={{ fontSize: 9, color: 'var(--ink-4)' }}>{timeAgo(t.timestamp)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.6, marginTop: 2 }}>{t.message}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Add comment */}
          {!['resolved', 'dismissed'].includes(selected.status) && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input value={commentInput} onChange={e => setCommentInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addComment(); }}
                placeholder="Add a comment..."
                style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 11, background: 'var(--glass)', outline: 'none', fontFamily: 'Inter, sans-serif' }} />
              <button className="btn btn-primary-sm" style={{ padding: '6px 12px', fontSize: 10 }} onClick={addComment} disabled={!commentInput.trim()}>Send</button>
            </div>
          )}
        </div>

        {/* Actions */}
        {!['resolved', 'dismissed'].includes(selected.status) && (
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 10 }}>Actions</div>

            {/* Forward */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', marginBottom: 4, textTransform: 'uppercase' }}>Forward to another admin</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <select value={forwardTo} onChange={e => setForwardTo(e.target.value)}
                  style={{ flex: 1, minWidth: 140, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 11, background: 'var(--glass)', fontFamily: 'Inter' }}>
                  <option value="">Select admin...</option>
                  {allUsers.filter(u => ['admin', 'main_admin'].includes(u.role) && u._id !== user._id).map(u => (
                    <option key={u._id} value={u._id}>{u.name} ({u.adminTitle || u.role})</option>
                  ))}
                </select>
                <input value={forwardReason} onChange={e => setForwardReason(e.target.value)} placeholder="Reason (optional)"
                  style={{ flex: 1, minWidth: 120, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 11, background: 'var(--glass)', outline: 'none', fontFamily: 'Inter' }} />
                <button className="btn btn-primary-sm" style={{ padding: '6px 12px', fontSize: 10 }} onClick={forwardEscalation} disabled={!forwardTo}>Forward</button>
              </div>
            </div>

            {/* Resolve */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', marginBottom: 4, textTransform: 'uppercase' }}>Resolve</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={resolveNote} onChange={e => setResolveNote(e.target.value)} placeholder="Resolution note..."
                  style={{ flex: 1, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 11, background: 'var(--glass)', outline: 'none', fontFamily: 'Inter' }} />
                <button style={{ padding: '6px 14px', fontSize: 10, fontWeight: 600, border: 'none', borderRadius: 6, background: '#10B981', color: '#fff', cursor: 'pointer', fontFamily: 'Inter' }} onClick={resolveEscalation}>Resolve</button>
                <button style={{ padding: '6px 14px', fontSize: 10, fontWeight: 600, border: '1px solid var(--line)', borderRadius: 6, background: 'var(--glass)', color: 'var(--ink-3)', cursor: 'pointer', fontFamily: 'Inter' }} onClick={dismissEscalation}>Dismiss</button>
              </div>
            </div>
          </div>
        )}

        {/* Resolution info */}
        {selected.status === 'resolved' && (
          <div className="card" style={{ borderLeft: '3px solid #10B981' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#10B981', marginBottom: 4 }}>Resolved</div>
            <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{selected.resolution || 'No resolution note'}</div>
            <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 4 }}>by {selected.resolvedBy?.name} — {new Date(selected.resolvedAt).toLocaleString()}</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Escalations</div>
          <div className="page-subtitle">Forward and manage employee issues between admins</div>
        </div>
        <button className="btn btn-primary-sm" onClick={() => setShowCreate(true)}>+ New Escalation</button>
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card"><div className="stat-card-label">Open</div><div className="stat-card-value" style={{ color: '#3B82F6' }}>{stats.open}</div></div>
        <div className="stat-card"><div className="stat-card-label">In Progress</div><div className="stat-card-value" style={{ color: '#F59E0B' }}>{stats.inProgress}</div></div>
        <div className="stat-card"><div className="stat-card-label">Forwarded</div><div className="stat-card-value" style={{ color: '#8B5CF6' }}>{stats.forwarded}</div></div>
        <div className="stat-card"><div className="stat-card-label">Resolved</div><div className="stat-card-value" style={{ color: '#10B981' }}>{stats.resolved}</div></div>
      </div>

      {/* Filters */}
      <div className="chip-group" style={{ marginBottom: 14 }}>
        {[['active', 'Active'], ['resolved', 'Resolved'], ['all', 'All']].map(([k, l]) => (
          <div key={k} className={`chip ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>{l}</div>
        ))}
      </div>

      {/* List */}
      {escalations.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>No escalations</div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Create one to flag an employee issue to another admin.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {escalations.map(e => {
            const sc = STATUS_CONFIG[e.status] || STATUS_CONFIG.open;
            return (
              <div key={e._id} className="card" style={{ cursor: 'pointer', padding: '12px 16px' }} onClick={() => setSelected(e)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 16 }}>{CATEGORY_ICONS[e.category]}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{e.subject}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                      About <strong>{e.employee?.name}</strong> &middot; by {e.createdBy?.name} &middot; {timeAgo(e.createdAt)}
                    </div>
                  </div>
                  <span className="badge-pill" style={{ background: sc.bg, color: sc.color, fontSize: 10 }}>{sc.label}</span>
                  <span className="badge-pill" style={{ background: `${SEVERITY_COLORS[e.severity]}15`, color: SEVERITY_COLORS[e.severity], fontSize: 10 }}>
                    {e.severity}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 10, color: 'var(--ink-3)' }}>
                  <span>Assigned to: <strong style={{ color: '#6366F1' }}>{e.assignedTo?.name}</strong></span>
                  {e.forwardChain?.length > 0 && <span>Forwarded {e.forwardChain.length}x</span>}
                  <span>{e.thread?.length || 0} messages</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999 }} onClick={() => setShowCreate(false)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1000, background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 14, width: 460, maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>New Escalation</div>
              <button style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ink-3)' }} onClick={() => setShowCreate(false)}>&times;</button>
            </div>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-field">
                <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Employee *</label>
                <select value={createForm.employeeId} onChange={e => setCreateForm(p => ({ ...p, employeeId: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, fontFamily: 'Inter', background: 'var(--glass)', color: 'var(--ink)' }}>
                  <option value="">Select employee...</option>
                  {employees.map(u => <option key={u._id} value={u._id}>{u.name} — {u.jobTitle || u.email}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Assign to Admin *</label>
                <select value={createForm.assignedTo} onChange={e => setCreateForm(p => ({ ...p, assignedTo: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, fontFamily: 'Inter', background: 'var(--glass)', color: 'var(--ink)' }}>
                  <option value="">Select admin...</option>
                  {allUsers.filter(u => ['admin', 'main_admin'].includes(u.role)).map(u => (
                    <option key={u._id} value={u._id}>{u.name} ({u.adminTitle || u.role})</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div className="form-field" style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Category</label>
                  <select value={createForm.category} onChange={e => setCreateForm(p => ({ ...p, category: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, fontFamily: 'Inter', background: 'var(--glass)', color: 'var(--ink)' }}>
                    {Object.entries(CATEGORY_ICONS).map(([k, icon]) => <option key={k} value={k}>{icon} {k.charAt(0).toUpperCase() + k.slice(1)}</option>)}
                  </select>
                </div>
                <div className="form-field" style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Severity</label>
                  <select value={createForm.severity} onChange={e => setCreateForm(p => ({ ...p, severity: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, fontFamily: 'Inter', background: 'var(--glass)', color: 'var(--ink)' }}>
                    {['low', 'medium', 'high', 'critical'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-field">
                <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Subject *</label>
                <input value={createForm.subject} onChange={e => setCreateForm(p => ({ ...p, subject: e.target.value }))}
                  placeholder="Brief summary of the issue"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, fontFamily: 'Inter', background: 'var(--glass)', outline: 'none', color: 'var(--ink)', boxSizing: 'border-box' }} />
              </div>
              <div className="form-field">
                <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Description</label>
                <textarea value={createForm.description} onChange={e => setCreateForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Detailed explanation..." rows={3}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, fontFamily: 'Inter', background: 'var(--glass)', outline: 'none', resize: 'vertical', color: 'var(--ink)', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ padding: '12px 18px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary-sm" onClick={handleCreate}
                disabled={!createForm.employeeId || !createForm.assignedTo || !createForm.subject.trim()}>Create Escalation</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
