import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import '../styles/tasks.css';
// TODO: Add FormatSwitcher from '../components/FormatSwitcher' to allow switching task comments/activity between chat/email/table/calendar/document views

const PRIORITY_CONFIG = {
  top: { label: '🔴 Top Priority', color: '#EF4444' },
  high: { label: '🟠 High Priority', color: '#F97316' },
  medium: { label: '🟡 Medium Priority', color: '#F59E0B' },
  low: { label: '🟢 Low Priority', color: '#10B981' }
};
const STATUS_CONFIG = {
  not_started: { label: 'Not Started', color: 'var(--ink-3)' },
  in_progress: { label: 'In Progress', color: '#6366F1' },
  on_hold: { label: 'On Hold', color: '#F59E0B' },
  done: { label: 'Done', color: '#10B981' },
  cancelled: { label: 'Cancelled', color: '#EF4444' },
  reopened: { label: 'Reopened', color: '#F97316' }
};
const GRADIENTS = ['linear-gradient(135deg,#6366F1,#8B5CF6)','linear-gradient(135deg,#10B981,#06B6D4)','linear-gradient(135deg,#F59E0B,#F97316)','linear-gradient(135deg,#EC4899,#8B5CF6)','linear-gradient(135deg,#EF4444,#F97316)'];
function getGrad(id) { return GRADIENTS[((id||'').charCodeAt(0)||0) % GRADIENTS.length]; }
function initials(n) { return (n||'?').split(' ').map(w=>w[0]).join('').slice(0,2); }

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatMinutes(mins) {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export default function Tasks() {
  // eslint-disable-next-line no-unused-vars
  const { user: _user } = useAuth();
  const [tab, setTab] = useState('tasks'); // tasks, create, detail, todo
  const [view, setView] = useState('my');
  const [tasks, setTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [showLabelsModal, setShowLabelsModal] = useState(false);

  const loadTasks = useCallback(async () => {
    try {
      const { data } = await api.get(`/tasks?view=${view}`);
      setTasks(data);
    } catch {} finally { setLoading(false); }
  }, [view]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const openTask = async (id) => {
    try {
      const { data } = await api.get(`/tasks/${id}`);
      setSelectedTask(data);
      setTab('detail');
    } catch {}
  };

  const updateTask = async (id, updates) => {
    try {
      await api.put(`/tasks/${id}`, updates);
      loadTasks();
      if (selectedTask?._id === id) openTask(id);
    } catch {}
  };

  // Apply filters then group by priority
  const filteredTasks = tasks.filter(t => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
    return true;
  });
  const grouped = { top: [], high: [], medium: [], low: [] };
  filteredTasks.forEach(t => { if (grouped[t.priority]) grouped[t.priority].push(t); });

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{tab === 'todo' ? 'To-Do List' : tab === 'create' ? 'Create Task' : tab === 'detail' ? 'Task Detail' : 'Tasks'}</div>
          {tab === 'tasks' && <div className="page-subtitle">{tasks.length} tasks</div>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="chip-group">
            {[['tasks','Tasks'],['todo','To-Do']].map(([k,l]) => (
              <div key={k} className={`chip ${tab === k ? 'active' : ''}`} onClick={() => { setTab(k); setSelectedTask(null); }}>{l}</div>
            ))}
          </div>
          {tab === 'tasks' && <>
            <button className="btn btn-secondary" style={{ fontSize: 10, padding: '5px 10px' }} onClick={() => setShowLabelsModal(true)}>Manage Labels</button>
            <button className="btn btn-primary-sm" onClick={() => setTab('create')}>+ New Task</button>
          </>}
        </div>
      </div>

      {tab === 'tasks' && (
        <>
          <div className="task-filters" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            {[['my','My Tasks'],['all','All Tasks']].map(([k,l]) => (
              <div key={k} className={`task-filter-chip ${view === k ? 'active' : ''}`} onClick={() => setView(k)}>{l}</div>
            ))}
            <div style={{ width: 1, height: 20, background: 'var(--line)', margin: '0 4px' }} />
            {[['all','All Status'],['not_started','Not Started'],['in_progress','In Progress'],['done','Done']].map(([k,l]) => (
              <div key={k} className={`task-filter-chip ${filterStatus === k ? 'active' : ''}`}
                style={filterStatus === k ? { background: (STATUS_CONFIG[k]?.color || '#6366F1') + '14', color: STATUS_CONFIG[k]?.color || '#6366F1', borderColor: (STATUS_CONFIG[k]?.color || '#6366F1') + '33' } : {}}
                onClick={() => setFilterStatus(k)}>{l}</div>
            ))}
            <div style={{ width: 1, height: 20, background: 'var(--line)', margin: '0 4px' }} />
            {[['all','All Priority'],['top','Top'],['high','High'],['medium','Medium'],['low','Low']].map(([k,l]) => (
              <div key={k} className={`task-filter-chip ${filterPriority === k ? 'active' : ''}`}
                style={filterPriority === k ? { background: (PRIORITY_CONFIG[k]?.color || '#6366F1') + '14', color: PRIORITY_CONFIG[k]?.color || '#6366F1', borderColor: (PRIORITY_CONFIG[k]?.color || '#6366F1') + '33' } : {}}
                onClick={() => setFilterPriority(k)}>{l}</div>
            ))}
          </div>
          {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-3)' }}>Loading...</div> : (
            Object.entries(grouped).map(([pri, items]) => items.length > 0 && (
              <div key={pri} className="task-priority-section">
                <div className="task-priority-header">
                  <span>{PRIORITY_CONFIG[pri].label}</span>
                  <span className="task-priority-count">{items.length} tasks</span>
                </div>
                {items.map(task => (
                  <TaskCard key={task._id} task={task} onClick={() => openTask(task._id)} />
                ))}
              </div>
            ))
          )}
          {!loading && tasks.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>No tasks yet</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>Create a task to get started</div>
            </div>
          )}
        </>
      )}

      {showLabelsModal && <LabelsModal onClose={() => setShowLabelsModal(false)} />}

      {tab === 'detail' && selectedTask && (
        <TaskDetail task={selectedTask} onBack={() => { setTab('tasks'); setSelectedTask(null); }} onUpdate={updateTask} onReload={() => openTask(selectedTask._id)} />
      )}

      {tab === 'create' && <CreateTask onBack={() => setTab('tasks')} onCreated={() => { setTab('tasks'); loadTasks(); }} />}

      {tab === 'todo' && <TodoList />}
    </div>
  );
}

function TaskCard({ task, onClick }) {
  const pc = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  const sc = STATUS_CONFIG[task.status] || STATUS_CONFIG.not_started;
  const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'done';

  return (
    <div className="task-card" style={{ borderLeftColor: pc.color }} onClick={onClick}>
      <div className="task-card-header">
        <div className="task-card-title">{task.title}</div>
        <span className="badge-pill" style={{ background: sc.color + '14', color: sc.color }}>{sc.label}</span>
      </div>
      <div className="task-card-meta">
        <div style={{ display: 'flex', gap: -4 }}>
          {task.assignees?.slice(0, 3).map((a, i) => (
            <div key={a._id} className="avatar-sm" style={{ background: getGrad(a._id), width: 22, height: 22, fontSize: 8, marginLeft: i ? -4 : 0, border: '2px solid #fff' }}>{initials(a.name)}</div>
          ))}
        </div>
        <span className={`task-card-deadline ${isOverdue ? 'overdue' : ''}`}>
          {task.deadline ? new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No deadline'}
          {isOverdue && ' ⚠️'}
        </span>
        {task.labels?.slice(0, 2).map(l => (
          <span key={l._id} className="badge-pill" style={{ background: l.color + '14', color: l.color, fontSize: 9 }}>{l.name}</span>
        ))}
        {task.isPrivate && <span style={{ fontSize: 9, color: 'var(--ink-3)' }}>🔒</span>}
        {task.isRecurring && <span style={{ fontSize: 9, color: '#6366F1' }}>🔄</span>}
      </div>
      {task.statusNote && <div style={{ fontSize: 10, color: 'var(--ink-2)', marginBottom: 4, fontStyle: 'italic' }}>{task.statusNote}</div>}
      <div className="task-card-progress">
        <div className="task-card-progress-bar"><div className="task-card-progress-fill" style={{ width: task.progress + '%', background: pc.color }} /></div>
        <div className="task-card-progress-text">{task.progress}%</div>
      </div>
    </div>
  );
}

function TaskDetail({ task, onBack, onUpdate, onReload }) {
  const pc = PRIORITY_CONFIG[task.priority];
  const sc = STATUS_CONFIG[task.status];
  const [progress, setProgress] = useState(task.progress);
  const [statusNote, setStatusNote] = useState(task.statusNote || '');
  const [estHours, setEstHours] = useState(task.estimatedTime ? Math.floor(task.estimatedTime / 60) : 0);
  const [estMins, setEstMins] = useState(task.estimatedTime ? task.estimatedTime % 60 : 0);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const [showWatcherPicker, setShowWatcherPicker] = useState(false);
  const [watcherUsers, setWatcherUsers] = useState([]);

  const handleEstTimeUpdate = () => {
    const totalMins = (parseInt(estHours) || 0) * 60 + (parseInt(estMins) || 0);
    onUpdate(task._id, { estimatedTime: totalMins });
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.post(`/tasks/${task._id}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      onReload();
    } catch (err) {
      alert('Failed to upload file.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePrivateToggle = () => {
    onUpdate(task._id, { isPrivate: !task.isPrivate });
  };

  const loadWatcherUsers = async () => {
    try { const { data } = await api.get('/users/directory'); setWatcherUsers(data); } catch {}
  };

  const addWatcher = (userId) => {
    const currentIds = (task.watchers || []).map(w => w._id || w);
    if (!currentIds.includes(userId)) {
      onUpdate(task._id, { watchers: [...currentIds, userId] });
    }
    setShowWatcherPicker(false);
  };

  const removeWatcher = (userId) => {
    const currentIds = (task.watchers || []).map(w => w._id || w).filter(id => id !== userId);
    onUpdate(task._id, { watchers: currentIds });
  };

  return (
    <div>
      <button className="btn btn-secondary" style={{ marginBottom: 16 }} onClick={onBack}>← Back to Tasks</button>
      <div className="task-detail">
        <div className="task-detail-main">
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
                  {task.title}
                  {task.isPrivate && <span style={{ fontSize: 12, marginLeft: 8, color: 'var(--ink-3)' }}>🔒 Private</span>}
                  {task.isRecurring && <span style={{ fontSize: 12, marginLeft: 8, color: '#6366F1' }}>🔄 Recurring</span>}
                </h2>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span className="badge-pill" style={{ background: pc.color + '14', color: pc.color }}>{pc.label}</span>
                  <span className="badge-pill" style={{ background: sc.color + '14', color: sc.color }}>{sc.label}</span>
                  {task.team && <span className="badge-pill" style={{ background: 'rgba(16,185,129,0.08)', color: '#10B981' }}>{task.team.name}</span>}
                </div>
              </div>
              <select style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--line)', fontSize: 11, color: 'var(--ink-2)' }}
                value={task.status} onChange={e => onUpdate(task._id, { status: e.target.value })}>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>

            {/* Fields grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div style={{ background: 'var(--glass)', borderRadius: 8, padding: 10 }}>
                <div className="task-field-label">Assignees</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {task.assignees?.map(a => (
                    <div key={a._id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div className="avatar-sm" style={{ background: getGrad(a._id), width: 20, height: 20, fontSize: 8 }}>{initials(a.name)}</div>
                      <span style={{ fontSize: 10, color: 'var(--ink)' }}>{a.name.split(' ')[0]}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ background: 'var(--glass)', borderRadius: 8, padding: 10 }}>
                <div className="task-field-label">Deadline</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: task.deadline && new Date(task.deadline) < new Date() ? '#EF4444' : 'var(--ink)' }}>
                  {task.deadline ? new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                </div>
              </div>
              <div style={{ background: 'var(--glass)', borderRadius: 8, padding: 10 }}>
                <div className="task-field-label">Progress</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="range" min="0" max="100" value={progress} onChange={e => setProgress(Number(e.target.value))}
                    onMouseUp={() => onUpdate(task._id, { progress })}
                    style={{ flex: 1, accentColor: pc.color }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: pc.color }}>{progress}%</span>
                </div>
              </div>
            </div>

            {/* More fields row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div style={{ background: 'var(--glass)', borderRadius: 8, padding: 10 }}>
                <div className="task-field-label">Estimated Time</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="number" min="0" max="999" value={estHours} onChange={e => setEstHours(e.target.value)}
                    style={{ width: 40, padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 11, textAlign: 'center', background: 'var(--glass)' }} />
                  <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>h</span>
                  <input type="number" min="0" max="59" value={estMins} onChange={e => setEstMins(e.target.value)}
                    style={{ width: 40, padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 11, textAlign: 'center', background: 'var(--glass)' }} />
                  <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>m</span>
                  <button className="btn btn-primary-sm" style={{ padding: '3px 8px', fontSize: 9 }} onClick={handleEstTimeUpdate}>Set</button>
                </div>
              </div>
              <div style={{ background: 'var(--glass)', borderRadius: 8, padding: 10 }}>
                <div className="task-field-label">Visibility</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div className="task-toggle" onClick={handlePrivateToggle}
                    style={{ width: 36, height: 20, borderRadius: 10, background: task.isPrivate ? '#6366F1' : 'var(--line)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
                    <div style={{ width: 16, height: 16, borderRadius: 8, background: 'var(--glass)', position: 'absolute', top: 2, left: task.isPrivate ? 18 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--ink-2)' }}>{task.isPrivate ? '🔒 Private' : '🌐 Public'}</span>
                </div>
              </div>
              <div style={{ background: 'var(--glass)', borderRadius: 8, padding: 10 }}>
                <div className="task-field-label">Recurring</div>
                <div style={{ fontSize: 12, color: 'var(--ink)' }}>
                  {task.isRecurring ? (
                    <span className="badge-pill" style={{ background: 'rgba(99,102,241,0.08)', color: '#6366F1' }}>
                      🔄 {task.recurringPattern ? task.recurringPattern.charAt(0).toUpperCase() + task.recurringPattern.slice(1) : 'Yes'}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>Not recurring</span>
                  )}
                </div>
              </div>
            </div>

            {/* Status note */}
            {task.statusNote && <div className="task-status-note" style={{ marginBottom: 14 }}>{task.statusNote}</div>}
            <div style={{ marginBottom: 14 }}>
              <div className="task-field-label">Update Status Note</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={statusNote} onChange={e => setStatusNote(e.target.value)} placeholder="What's the current status?"
                  style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 11, background: 'var(--glass)', outline: 'none', fontFamily: 'Inter' }} />
                <button className="btn btn-primary-sm" style={{ padding: '8px 14px' }} onClick={() => onUpdate(task._id, { statusNote })}>Update</button>
              </div>
            </div>

            {/* Description */}
            {task.description && (
              <div className="task-field">
                <div className="task-field-label">Description</div>
                <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.7 }}>{task.description}</div>
              </div>
            )}

            {/* Labels */}
            {task.labels?.length > 0 && (
              <div className="task-field">
                <div className="task-field-label">Labels</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {task.labels.map(l => <span key={l._id} className="badge-pill" style={{ background: l.color + '14', color: l.color }}>{l.name}</span>)}
                </div>
              </div>
            )}

            {/* Linked Workspace */}
            {task.linkedWorkspace && (
              <div className="task-field">
                <div className="task-field-label">Linked Workspace</div>
                <div style={{ fontSize: 12, color: '#6366F1', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  📁 <span style={{ textDecoration: 'underline' }}>Open linked workspace</span>
                </div>
              </div>
            )}

            {/* Linked Chat */}
            {task.linkedChat && (
              <div className="task-field">
                <div className="task-field-label">Linked Chat</div>
                <div style={{ fontSize: 12, color: '#6366F1', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  💬 <span style={{ textDecoration: 'underline' }}>Open linked chat</span>
                </div>
              </div>
            )}
          </div>

          {/* Attachments */}
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>Attachments ({task.attachments?.length || 0})</div>
              <label className="btn btn-primary-sm" style={{ padding: '4px 10px', fontSize: 10, cursor: 'pointer', margin: 0 }}>
                {uploading ? 'Uploading...' : '+ Upload'}
                <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileUpload} disabled={uploading} />
              </label>
            </div>
            {task.attachments?.length > 0 ? task.attachments.map((att, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: 11 }}>
                <span style={{ fontSize: 14 }}>
                  {att.mimeType?.startsWith('image/') ? '🖼️' : att.mimeType === 'application/pdf' ? '📄' : '📎'}
                </span>
                <span style={{ flex: 1, color: 'var(--ink)', fontWeight: 500 }}>{att.name}</span>
                <span style={{ color: 'var(--ink-4)', fontSize: 10 }}>{formatFileSize(att.size)}</span>
              </div>
            )) : (
              <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>No attachments</div>
            )}
          </div>

          {/* Activity */}
          <div className="card">
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>Activity Log</div>
            {task.activity?.slice().reverse().map((a, i) => (
              <div key={i} className="task-activity-item">
                <div className="task-activity-text">{a.user?.name || 'System'} — {a.detail}</div>
                <div className="task-activity-time">{new Date(a.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div className="task-detail-side">
          {/* Subtasks */}
          <SubtaskSection task={task} onUpdate={onUpdate} onReload={onReload} />


          {/* Dependencies */}
          {task.preTasks?.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>Dependencies</div>
              {task.preTasks.map(pt => (
                <div key={pt._id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', fontSize: 11 }}>
                  <span style={{ color: pt.status === 'done' ? '#10B981' : '#F59E0B' }}>{pt.status === 'done' ? '✅' : '⏳'}</span>
                  <span style={{ color: 'var(--ink-2)' }}>{pt.title}</span>
                </div>
              ))}
            </div>
          )}

          {/* Watchers */}
          <div className="card" style={{ marginBottom: 12, position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>Watchers ({task.watchers?.length || 0})</div>
              <button className="btn btn-primary-sm" style={{ padding: '3px 8px', fontSize: 9 }}
                onClick={() => { setShowWatcherPicker(!showWatcherPicker); if (!showWatcherPicker) loadWatcherUsers(); }}>+ Add Watcher</button>
            </div>
            {showWatcherPicker && (
              <div style={{ background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 8, padding: 8, marginBottom: 8, maxHeight: 160, overflowY: 'auto' }}>
                {watcherUsers.filter(u => !(task.watchers || []).some(w => (w._id || w) === u._id)).map(u => (
                  <div key={u._id} onClick={() => addWatcher(u._id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 6, cursor: 'pointer', fontSize: 11, color: 'var(--ink)' }}
                    onMouseOver={e => e.currentTarget.style.background = '#EEF2FF'}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                    <div className="avatar-sm" style={{ background: getGrad(u._id), width: 18, height: 18, fontSize: 7 }}>{initials(u.name)}</div>
                    {u.name}
                  </div>
                ))}
                {watcherUsers.filter(u => !(task.watchers || []).some(w => (w._id || w) === u._id)).length === 0 && (
                  <div style={{ fontSize: 10, color: 'var(--ink-3)', textAlign: 'center', padding: 6 }}>No users to add</div>
                )}
              </div>
            )}
            {task.watchers?.length > 0 ? task.watchers.map(w => (
              <div key={w._id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', fontSize: 11 }}>
                <div className="avatar-sm" style={{ background: getGrad(w._id), width: 18, height: 18, fontSize: 7 }}>{initials(w.name)}</div>
                <span style={{ color: 'var(--ink-2)', flex: 1 }}>{w.name}</span>
                <span style={{ cursor: 'pointer', fontSize: 10, color: 'var(--ink-3)' }} onClick={() => removeWatcher(w._id)} title="Remove watcher">&times;</span>
              </div>
            )) : (
              <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>No watchers</div>
            )}
          </div>

          {/* Created info */}
          <div className="card">
            <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>Created by {task.createdBy?.name}</div>
            <div style={{ fontSize: 10, color: 'var(--ink-4)' }}>{new Date(task.createdAt).toLocaleDateString()}</div>
            {task.estimatedTime > 0 && (
              <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 6 }}>Est. time: {formatMinutes(task.estimatedTime)}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SubtaskSection({ task, onUpdate, onReload }) {
  const [newSubtask, setNewSubtask] = useState('');
  const [adding, setAdding] = useState(false);

  const addSubtask = async () => {
    if (!newSubtask.trim()) return;
    setAdding(true);
    try {
      await api.post('/tasks', { title: newSubtask.trim(), parentTask: task._id, priority: task.priority || 'medium' });
      setNewSubtask('');
      onReload();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add subtask.');
    } finally { setAdding(false); }
  };

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>Subtasks ({task.subtasks?.length || 0})</div>
      {task.subtasks?.map(st => (
        <div key={st._id} className="subtask-item">
          <div className={`subtask-check ${st.status === 'done' ? 'done' : ''}`} onClick={() => onUpdate(st._id, { status: st.status === 'done' ? 'not_started' : 'done' })}>
            {st.status === 'done' && '✓'}
          </div>
          <span className={`subtask-text ${st.status === 'done' ? 'done' : ''}`}>{st.title}</span>
        </div>
      ))}
      {(!task.subtasks || task.subtasks.length === 0) && <div style={{ fontSize: 11, color: 'var(--ink-4)', marginBottom: 8 }}>No subtasks</div>}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input
          value={newSubtask}
          onChange={e => setNewSubtask(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addSubtask(); }}
          placeholder="Add a subtask..."
          style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 11, background: 'var(--glass)', outline: 'none', fontFamily: 'Inter, sans-serif' }}
        />
        <button className="btn btn-primary-sm" style={{ padding: '6px 12px', fontSize: 10 }} onClick={addSubtask} disabled={adding || !newSubtask.trim()}>
          {adding ? '...' : '+ Add'}
        </button>
      </div>
    </div>
  );
}

function CreateTask({ onBack, onCreated }) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    title: '', description: '', priority: 'medium', deadline: '', statusNote: '',
    assignees: [user._id],
    team: '',
    labels: [],
    isRecurring: false,
    recurringPattern: 'daily',
    isPrivate: false
  });
  const [loading, setLoading] = useState(false);

  // Data for pickers
  const [allUsers, setAllUsers] = useState([]);
  const [allTeams, setAllTeams] = useState([]);
  const [allLabels, setAllLabels] = useState([]);
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);

  useEffect(() => {
    // Fetch users, teams, labels in parallel
    const fetchData = async () => {
      try {
        const [usersRes, teamsRes, labelsRes] = await Promise.allSettled([
          api.get('/users/directory'),
          api.get('/teams'),
          api.get('/tasks/labels/list')
        ]);
        if (usersRes.status === 'fulfilled') setAllUsers(usersRes.value.data);
        if (teamsRes.status === 'fulfilled') setAllTeams(teamsRes.value.data);
        if (labelsRes.status === 'fulfilled') setAllLabels(labelsRes.value.data);
      } catch {}
    };
    fetchData();
  }, []);

  const toggleAssignee = (uid) => {
    setForm(p => {
      const has = p.assignees.includes(uid);
      return { ...p, assignees: has ? p.assignees.filter(id => id !== uid) : [...p.assignees, uid] };
    });
  };

  const toggleLabel = (lid) => {
    setForm(p => {
      const has = p.labels.includes(lid);
      return { ...p, labels: has ? p.labels.filter(id => id !== lid) : [...p.labels, lid] };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...form,
        assignees: form.assignees.length > 0 ? form.assignees : [user._id],
        team: form.team || undefined,
        labels: form.labels.length > 0 ? form.labels : undefined,
        recurringPattern: form.isRecurring ? form.recurringPattern : undefined
      };
      if (!payload.isRecurring) {
        delete payload.recurringPattern;
      }
      await api.post('/tasks', payload);
      onCreated();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed.');
    } finally { setLoading(false); }
  };

  return (
    <div>
      <button className="btn btn-secondary" style={{ marginBottom: 16 }} onClick={onBack}>← Back to Tasks</button>
      <div className="form-card" style={{ maxWidth: '100%' }}>
        <form onSubmit={handleSubmit}>
          <div className="form-field" style={{ marginBottom: 14 }}>
            <label>Task Title *</label>
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="What needs to be done?" required />
          </div>
          <div className="form-grid">
            <div className="form-field">
              <label>Priority</label>
              <div className="chip-group">
                {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                  <div key={k} className={`chip ${form.priority === k ? 'active' : ''}`} style={form.priority === k ? { background: v.color + '14', color: v.color, borderColor: v.color + '33' } : {}}
                    onClick={() => setForm(p => ({ ...p, priority: k }))}>{v.label.split(' ').slice(0, 2).join(' ')}</div>
                ))}
              </div>
            </div>
            <div className="form-field">
              <label>Deadline</label>
              <input type="date" value={form.deadline} onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))} />
            </div>
          </div>

          {/* Assignees picker */}
          <div className="form-field" style={{ marginBottom: 14 }}>
            <label>Assignees</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              {form.assignees.map(uid => {
                const u = allUsers.find(u => u._id === uid);
                return (
                  <div key={uid} className="badge-pill" style={{ background: 'rgba(99,102,241,0.08)', color: '#6366F1', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div className="avatar-sm" style={{ background: getGrad(uid), width: 16, height: 16, fontSize: 7 }}>{initials(u?.name || 'You')}</div>
                    {u?.name || 'You'}
                    <span style={{ cursor: 'pointer', marginLeft: 2, fontSize: 10 }} onClick={() => toggleAssignee(uid)}>✕</span>
                  </div>
                );
              })}
              <button type="button" className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: 10 }}
                onClick={() => setShowAssigneePicker(!showAssigneePicker)}>
                {showAssigneePicker ? 'Close' : '+ Add'}
              </button>
            </div>
            {showAssigneePicker && (
              <div style={{ background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 8, padding: 8, maxHeight: 180, overflowY: 'auto' }}>
                {allUsers.length > 0 ? allUsers.map(u => (
                  <label key={u._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer', fontSize: 11, color: 'var(--ink)' }}>
                    <input type="checkbox" checked={form.assignees.includes(u._id)} onChange={() => toggleAssignee(u._id)}
                      style={{ accentColor: '#6366F1' }} />
                    <div className="avatar-sm" style={{ background: getGrad(u._id), width: 18, height: 18, fontSize: 7 }}>{initials(u.name)}</div>
                    {u.name}
                    <span style={{ color: 'var(--ink-4)', fontSize: 9, marginLeft: 'auto' }}>{u.email}</span>
                  </label>
                )) : (
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', textAlign: 'center', padding: 8 }}>No users available</div>
                )}
              </div>
            )}
          </div>

          {/* Team selector */}
          <div className="form-grid">
            <div className="form-field">
              <label>Team</label>
              <select value={form.team} onChange={e => setForm(p => ({ ...p, team: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12, background: 'var(--glass)', color: 'var(--ink-2)', fontFamily: 'Inter' }}>
                <option value="">No team</option>
                {allTeams.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Labels</label>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {allLabels.map(l => (
                  <div key={l._id}
                    className={`chip ${form.labels.includes(l._id) ? 'active' : ''}`}
                    style={form.labels.includes(l._id) ? { background: l.color + '14', color: l.color, borderColor: l.color + '33' } : {}}
                    onClick={() => toggleLabel(l._id)}>
                    <span style={{ width: 6, height: 6, borderRadius: 3, background: l.color, display: 'inline-block', marginRight: 4 }} />
                    {l.name}
                  </div>
                ))}
                {allLabels.length === 0 && <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>No labels available</span>}
              </div>
            </div>
          </div>

          {/* Recurring + Private toggles */}
          <div className="form-grid" style={{ marginTop: 14 }}>
            <div className="form-field">
              <label>Recurring Task</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div onClick={() => setForm(p => ({ ...p, isRecurring: !p.isRecurring }))}
                  style={{ width: 36, height: 20, borderRadius: 10, background: form.isRecurring ? '#6366F1' : 'var(--line)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                  <div style={{ width: 16, height: 16, borderRadius: 8, background: 'var(--glass)', position: 'absolute', top: 2, left: form.isRecurring ? 18 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }} />
                </div>
                {form.isRecurring && (
                  <select value={form.recurringPattern} onChange={e => setForm(p => ({ ...p, recurringPattern: e.target.value }))}
                    style={{ padding: '4px 8px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 11, color: 'var(--ink-2)', background: 'var(--glass)' }}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                )}
                {!form.isRecurring && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>Off</span>}
              </div>
            </div>
            <div className="form-field">
              <label>Visibility</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div onClick={() => setForm(p => ({ ...p, isPrivate: !p.isPrivate }))}
                  style={{ width: 36, height: 20, borderRadius: 10, background: form.isPrivate ? '#6366F1' : 'var(--line)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                  <div style={{ width: 16, height: 16, borderRadius: 8, background: 'var(--glass)', position: 'absolute', top: 2, left: form.isPrivate ? 18 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }} />
                </div>
                <span style={{ fontSize: 11, color: 'var(--ink-2)' }}>{form.isPrivate ? '🔒 Private' : '🌐 Public'}</span>
              </div>
            </div>
          </div>

          <div className="form-field" style={{ marginBottom: 14, marginTop: 14 }}>
            <label>Description</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={4} placeholder="Details about this task..." />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onBack}>Cancel</button>
            <button type="submit" className="btn btn-primary-sm" disabled={loading}>{loading ? 'Creating...' : 'Create Task'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LabelsModal({ onClose }) {
  const [labels, setLabels] = useState([]);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6366F1');

  useEffect(() => {
    api.get('/tasks/labels/list').then(res => setLabels(res.data)).catch(() => {});
  }, []);

  const createLabel = async () => {
    if (!newName.trim()) return;
    try {
      const { data } = await api.post('/tasks/labels', { name: newName.trim(), color: newColor });
      setLabels(prev => [...prev, data]);
      setNewName('');
      setNewColor('#6366F1');
    } catch {}
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.3)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ background: 'var(--glass)', borderRadius: 12, padding: 20, width: 380, maxHeight: '70vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Manage Labels</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, color: 'var(--ink-3)', cursor: 'pointer' }}>&times;</button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, alignItems: 'center' }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Label name..."
            onKeyDown={e => { if (e.key === 'Enter') createLabel(); }}
            style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 11, background: 'var(--glass)', outline: 'none', fontFamily: 'Inter, sans-serif' }} />
          <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
            style={{ width: 32, height: 32, border: '1px solid var(--line)', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
          <button className="btn btn-primary-sm" style={{ padding: '7px 12px', fontSize: 10 }} onClick={createLabel}>Add</button>
        </div>
        {labels.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--ink-4)', textAlign: 'center', padding: 16 }}>No labels yet</div>
        ) : labels.map(l => (
          <div key={l._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 5, background: l.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 500 }}>{l.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TodoList() {
  const [todos, setTodos] = useState([]);
  const [input, setInput] = useState('');
  const [todoDeadline, setTodoDeadline] = useState('');
  const [todoPriority, setTodoPriority] = useState('');
  const [todoNotes, setTodoNotes] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/tasks/todo/list');
      setTodos(data);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addTodo = async () => {
    if (!input.trim()) return;
    try {
      const payload = { title: input.trim() };
      if (todoPriority) payload.priority = todoPriority;
      if (todoDeadline) payload.deadline = todoDeadline;
      if (todoNotes.trim()) payload.notes = todoNotes.trim();
      await api.post('/tasks/todo', payload);
      setInput('');
      setTodoDeadline('');
      setTodoPriority('');
      setTodoNotes('');
      setShowMore(false);
      load();
    } catch {}
  };

  const toggleTodo = async (id, isDone) => {
    await api.put(`/tasks/todo/${id}`, { isDone: !isDone });
    load();
  };

  const deleteTodo = async (id) => {
    await api.delete(`/tasks/todo/${id}`);
    load();
  };

  const convertToTask = async (id) => {
    await api.post(`/tasks/todo/${id}/convert`);
    load();
  };

  const priColors = { high: '#F97316', medium: '#F59E0B', low: '#10B981' };

  return (
    <div style={{ maxWidth: 560 }}>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="todo-input-row">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !showMore && addTodo()}
            placeholder="Add a new to-do..." style={{ flex: 1, padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12, background: 'var(--glass)', outline: 'none', fontFamily: 'Inter' }} />
          <button type="button" className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: 10 }}
            onClick={() => setShowMore(!showMore)} title="More options">
            {showMore ? '▲' : '▼'}
          </button>
          <button className="btn btn-primary-sm" onClick={addTodo}>Add</button>
        </div>

        {/* Expanded form fields */}
        {showMore && (
          <div style={{ background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 8, padding: 10, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Deadline</div>
                <input type="date" value={todoDeadline} onChange={e => setTodoDeadline(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 11, background: 'var(--glass)', fontFamily: 'Inter' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Priority</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[['high', '🟠 High'], ['medium', '🟡 Med'], ['low', '🟢 Low']].map(([k, l]) => (
                    <div key={k} className={`chip ${todoPriority === k ? 'active' : ''}`}
                      style={todoPriority === k ? { background: priColors[k] + '14', color: priColors[k], borderColor: priColors[k] + '33', fontSize: 10, padding: '3px 8px' } : { fontSize: 10, padding: '3px 8px' }}
                      onClick={() => setTodoPriority(todoPriority === k ? '' : k)}>
                      {l}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Notes</div>
              <textarea value={todoNotes} onChange={e => setTodoNotes(e.target.value)} rows={2} placeholder="Additional notes..."
                style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 11, background: 'var(--glass)', fontFamily: 'Inter', resize: 'vertical', outline: 'none' }} />
            </div>
          </div>
        )}

        {loading ? <div style={{ color: 'var(--ink-3)', fontSize: 12 }}>Loading...</div> : (
          todos.map(todo => (
            <div key={todo._id} className={`todo-item ${todo.isDone ? 'done' : ''}`}>
              <div className={`todo-check ${todo.isDone ? 'done' : ''}`} onClick={() => toggleTodo(todo._id, todo.isDone)}>
                {todo.isDone && '✓'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className={`todo-text ${todo.isDone ? 'done' : ''}`}>{todo.title}</div>
                {(todo.deadline || todo.notes) && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                    {todo.deadline && (
                      <span style={{ fontSize: 9, color: new Date(todo.deadline) < new Date() && !todo.isDone ? '#EF4444' : 'var(--ink-3)' }}>
                        📅 {new Date(todo.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    {todo.notes && <span style={{ fontSize: 9, color: 'var(--ink-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📝 {todo.notes}</span>}
                  </div>
                )}
              </div>
              {todo.priority && <div className="todo-priority-dot" style={{ background: priColors[todo.priority] || 'var(--ink-4)' }} />}
              <div className="todo-actions">
                {!todo.isDone && <span className="todo-action-btn" onClick={() => convertToTask(todo._id)} title="Convert to task">📋</span>}
                <span className="todo-action-btn" onClick={() => deleteTodo(todo._id)} title="Delete">✕</span>
              </div>
            </div>
          ))
        )}
        {!loading && todos.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: 'var(--ink-4)', fontSize: 12 }}>No to-dos yet. Add one above!</div>}
      </div>
    </div>
  );
}
