import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api, { getFileUrl } from '../services/api';
import { useAlert } from '../components/AlertModal';
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
  const dialog = useAlert();
  const [searchParams, setSearchParams] = useSearchParams();
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

  // Auto-open task from URL param ?id=<taskId>
  const taskIdParam = searchParams.get('id');
  useEffect(() => {
    if (taskIdParam && !loading) {
      openTask(taskIdParam);
      const next = new URLSearchParams(searchParams);
      next.delete('id');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskIdParam, loading]);

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
        <TaskDetail task={selectedTask} onBack={() => { setTab('tasks'); setSelectedTask(null); loadTasks(); }} onUpdate={updateTask} onReload={() => openTask(selectedTask._id)} />
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
      {task.taskType === 'counter' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: (() => {
            if (!task.dailyTarget) return '#6366F1';
            const ratio = (task.count || 0) / task.dailyTarget;
            return ratio >= 1 ? '#10B981' : ratio >= 0.5 ? '#F59E0B' : '#EF4444';
          })() }}>
            {task.count || 0}
          </span>
          <span style={{ fontSize: 11, color: 'var(--ink-2)' }}>
            {task.dailyTarget ? `/ ${task.dailyTarget} ${task.countUnit || ''} today` : `${task.countUnit || ''}`}
          </span>
        </div>
      ) : (
        <div className="task-card-progress">
          <div className="task-card-progress-bar"><div className="task-card-progress-fill" style={{ width: task.progress + '%', background: pc.color }} /></div>
          <div className="task-card-progress-text">{task.progress}%</div>
        </div>
      )}
    </div>
  );
}

function TaskDetail({ task, onBack, onUpdate, onReload }) {
  const { user } = useAuth();
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
  const [customIncrement, setCustomIncrement] = useState('');

  // Task discussion thread
  const [showDiscussion, setShowDiscussion] = useState(false);
  const [threadMessages, setThreadMessages] = useState([]);
  const [threadInput, setThreadInput] = useState('');
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadSummary, setThreadSummary] = useState(null);
  const [summarizing, setSummarizing] = useState(false);

  const openDiscussion = async () => {
    setShowDiscussion(true);
    setThreadLoading(true);
    try {
      // If task has a linked chat, load messages from it
      if (task.linkedChat) {
        const { data } = await api.get(`/messages/${task.linkedChat}`);
        setThreadMessages(data);
      } else {
        // Create a task thread channel
        const { data: channel } = await api.post('/messages/channels', {
          name: `Task: ${task.title}`, type: 'channel', isPrivate: true,
          members: task.assignees?.map(a => a._id) || []
        });
        await onUpdate(task._id, { linkedChat: channel._id });
        setThreadMessages([]);
      }
    } catch {} finally { setThreadLoading(false); }
  };

  const sendThreadMessage = async () => {
    if (!threadInput.trim() || !task.linkedChat) return;
    try {
      await api.post(`/messages/${task.linkedChat}`, { content: threadInput.trim() });
      setThreadInput('');
      const { data } = await api.get(`/messages/${task.linkedChat}`);
      setThreadMessages(data);
    } catch {}
  };

  const summarizeThread = async () => {
    if (threadMessages.length === 0) { alert('No messages to summarize'); return; }
    setSummarizing(true);
    try {
      const { data } = await api.post('/ai/summarize', {
        messages: threadMessages.map(m => ({ sender: m.sender?.name, content: m.content }))
      });
      setThreadSummary(data.summary || data.result || 'No summary generated.');
    } catch { setThreadSummary('AI not available. Activate in Settings.'); }
    finally { setSummarizing(false); }
  };

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

  const handleIncrement = async (amount) => {
    try {
      await api.post(`/tasks/${task._id}/increment`, { amount });
      onReload();
    } catch {}
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/tasks/${task._id}`);
      onBack();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete task.');
    }
  };

  const isCreator = task.createdBy === user?._id || task.createdBy?._id === user?._id;
  const canDelete = isCreator || user?.role === 'main_admin' || user?.powers?.tasks?.deleteAny === true;

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
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <select style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--line)', fontSize: 11, color: 'var(--ink-2)', background: 'var(--bg-1)', fontFamily: 'var(--font)' }}
                  value={task.status} onChange={e => onUpdate(task._id, { status: e.target.value })}>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                {canDelete && (
                  <button onClick={handleDelete}
                    title="Delete task"
                    style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, background: 'rgba(239,68,68,0.06)', color: '#EF4444', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                    🗑 Delete
                  </button>
                )}
              </div>
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
                  {task.deadline ? (
                    new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    + (task.deadlineTime ? ` at ${new Date('2000-01-01T' + task.deadlineTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : '')
                  ) : '—'}
                </div>
              </div>
              {task.taskType === 'counter' ? (
                <div style={{ background: 'var(--glass)', borderRadius: 8, padding: 10 }}>
                  <div className="task-field-label">Counter</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 28, fontWeight: 800, color: (() => {
                      if (!task.dailyTarget) return '#6366F1';
                      const ratio = (task.count || 0) / task.dailyTarget;
                      return ratio >= 1 ? '#10B981' : ratio >= 0.5 ? '#F59E0B' : '#EF4444';
                    })() }}>{task.count || 0}</span>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--ink-2)', fontWeight: 600 }}>{task.countUnit || 'count'}</div>
                      {task.dailyTarget > 0 && <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>Target: {task.dailyTarget}</div>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                    {[1, 5, 10].map(n => (
                      <button key={n} className="btn btn-primary-sm" style={{ padding: '4px 10px', fontSize: 10 }}
                        onClick={() => handleIncrement(n)}>+{n}</button>
                    ))}
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input type="number" min="1" value={customIncrement} onChange={e => setCustomIncrement(e.target.value)}
                        placeholder="#" style={{ width: 48, padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 10, textAlign: 'center', background: 'var(--glass)' }} />
                      <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: 10 }}
                        onClick={() => { if (customIncrement && Number(customIncrement) > 0) { handleIncrement(Number(customIncrement)); setCustomIncrement(''); } }}>Add</button>
                    </div>
                  </div>
                  {task.countHistory && task.countHistory.length > 0 && (
                    <div style={{ marginTop: 6, borderTop: '1px solid var(--line)', paddingTop: 6 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', marginBottom: 4 }}>Last 7 days</div>
                      {task.countHistory.slice(-7).map((entry, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--ink-2)', padding: '1px 0' }}>
                          <span>{new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                          <span style={{ fontWeight: 600 }}>{entry.count} {task.countUnit || ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ background: 'var(--glass)', borderRadius: 8, padding: 10 }}>
                  <div className="task-field-label">Progress</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="range" min="0" max="100" value={progress} onChange={e => setProgress(Number(e.target.value))}
                      onMouseUp={() => onUpdate(task._id, { progress })}
                      style={{ flex: 1, accentColor: pc.color }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: pc.color }}>{progress}%</span>
                  </div>
                </div>
              )}
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
                <div onClick={() => window.location.href = `/messages?channel=${task.linkedChat}`} style={{ fontSize: 12, color: 'var(--indigo)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
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
            {task.attachments?.length > 0 ? task.attachments.map((att, i) => {
              const fileUrl = getFileUrl(att.path);
              const isImage = att.mimeType?.startsWith('image/');
              return (
                <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                  {isImage && (
                    <img src={fileUrl} alt={att.name}
                      style={{ maxWidth: '100%', maxHeight: 120, borderRadius: 6, objectFit: 'cover', display: 'block', marginBottom: 4, cursor: 'pointer' }}
                      onClick={() => window.open(fileUrl, '_blank')}
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                    <span style={{ fontSize: 14 }}>
                      {isImage ? '🖼️' : att.mimeType === 'application/pdf' ? '📕' : att.mimeType?.startsWith('video/') ? '🎬' : '📎'}
                    </span>
                    <a href={fileUrl} target="_blank" rel="noreferrer" style={{ flex: 1, color: '#6366F1', fontWeight: 500, textDecoration: 'none' }}
                      title="Click to view / right-click to download">{att.name}</a>
                    <span style={{ color: 'var(--ink-4)', fontSize: 10 }}>{formatFileSize(att.size)}</span>
                    <button onClick={async () => {
                      try { const r = await fetch(fileUrl); const b = await r.blob(); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = att.name; a.click(); URL.revokeObjectURL(u); } catch { window.open(fileUrl, '_blank'); }
                    }} style={{ fontSize: 9, color: '#6366F1', padding: '2px 6px', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 4, background: 'transparent', cursor: 'pointer', fontFamily: 'Inter' }}>DL</button>
                  </div>
                </div>
              );
            }) : (
              <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>No attachments</div>
            )}
          </div>

          {/* Discussion Thread */}
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>💬 Discussion</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {showDiscussion && threadMessages.length > 0 && (
                  <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 10 }} onClick={summarizeThread} disabled={summarizing}>
                    {summarizing ? '⏳ Summarizing...' : '✨ Summarize Thread'}
                  </button>
                )}
                <button className="btn btn-primary-sm" style={{ padding: '4px 10px', fontSize: 10 }} onClick={showDiscussion ? () => setShowDiscussion(false) : openDiscussion}>
                  {showDiscussion ? 'Close' : '💬 Discuss'}
                </button>
              </div>
            </div>

            {threadSummary && (
              <div style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.7 }}>
                <div style={{ fontWeight: 700, color: 'var(--violet)', marginBottom: 4 }}>✨ AI Summary</div>
                {threadSummary}
              </div>
            )}

            {showDiscussion && (
              <div>
                {threadLoading ? (
                  <div style={{ textAlign: 'center', padding: 16, color: 'var(--ink-3)', fontSize: 11 }}>Loading discussion...</div>
                ) : (
                  <>
                    <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 10 }}>
                      {threadMessages.length === 0 && (
                        <div style={{ textAlign: 'center', padding: 16, color: 'var(--ink-4)', fontSize: 11 }}>No messages yet. Start the discussion!</div>
                      )}
                      {threadMessages.filter(m => m.type !== 'system').map(m => (
                        <div key={m._id} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: getGrad(m.sender?._id), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>
                            {initials(m.sender?.name)}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink)' }}>{m.sender?.name}</span>
                              <span style={{ fontSize: 9, color: 'var(--ink-4)' }}>{new Date(m.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.6 }}>{m.content}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input className="ad-input" value={threadInput} onChange={e => setThreadInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') sendThreadMessage(); }}
                        placeholder="Type a message..." style={{ flex: 1, fontSize: 11 }} />
                      <button className="btn btn-primary-sm" style={{ padding: '6px 12px', fontSize: 10 }} onClick={sendThreadMessage} disabled={!threadInput.trim()}>Send</button>
                    </div>
                  </>
                )}
              </div>
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
          {/* Checklist */}
          <ChecklistSection task={task} onReload={onReload} />

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

          {/* Quick Note — attached to this task */}
          <QuickNoteButton entityType="task" entityId={task._id} entityTitle={task.title} />

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

function ChecklistSection({ task, onReload }) {
  const [newItem, setNewItem] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [isSequential, setIsSequential] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const checklist = task.checklist || [];
  const doneCount = checklist.filter(c => c.done).length;
  const total = checklist.length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  // Group items
  const groups = {};
  checklist.forEach(item => {
    const g = item.group || '';
    if (!groups[g]) groups[g] = [];
    groups[g].push(item);
  });
  // Sort items within each group by order
  Object.values(groups).forEach(arr => arr.sort((a, b) => a.order - b.order));
  const groupNames = Object.keys(groups).sort((a, b) => {
    if (a === '' && b !== '') return 1;
    if (b === '' && a !== '') return -1;
    return a.localeCompare(b);
  });

  const addItem = async () => {
    if (!newItem.trim()) return;
    setAdding(true);
    try {
      await api.post(`/tasks/${task._id}/checklist`, { text: newItem.trim(), group: newGroup.trim(), sequential: isSequential });
      setNewItem('');
      onReload();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add item');
    } finally { setAdding(false); }
  };

  const toggleItem = async (itemId, currentDone) => {
    try {
      await api.put(`/tasks/${task._id}/checklist/${itemId}`, { done: !currentDone });
      onReload();
    } catch (err) {
      alert(err.response?.data?.error || 'Cannot check this item yet');
    }
  };

  const deleteItem = async (itemId) => {
    try {
      await api.delete(`/tasks/${task._id}/checklist/${itemId}`);
      onReload();
    } catch {}
  };

  const checkAll = async (group, done) => {
    try {
      await api.put(`/tasks/${task._id}/checklist-bulk`, { done, group: group || undefined });
      onReload();
    } catch {}
  };

  const isItemLocked = (item, groupItems) => {
    if (!item.sequential) return false;
    const idx = groupItems.findIndex(c => c._id === item._id);
    return idx > 0 && !groupItems[idx - 1].done;
  };

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>Checklist ({doneCount}/{total})</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {total > 0 && (
            <button className="btn btn-primary-sm" style={{ padding: '3px 8px', fontSize: 9 }}
              onClick={() => checkAll('', doneCount < total)}>
              {doneCount < total ? '✓ All' : '✗ Uncheck'}
            </button>
          )}
          <button className="btn btn-primary-sm" style={{ padding: '3px 8px', fontSize: 9 }}
            onClick={() => setShowAddForm(!showAddForm)}>+ Add</button>
        </div>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: pct + '%', background: pct === 100 ? '#10B981' : '#6366F1', borderRadius: 3, transition: 'width 0.3s ease' }} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 3, textAlign: 'right' }}>{pct}%</div>
        </div>
      )}

      {/* Grouped checklist items */}
      {groupNames.map(groupName => {
        const items = groups[groupName];
        const groupDone = items.filter(i => i.done).length;
        return (
          <div key={groupName} style={{ marginBottom: groupNames.length > 1 ? 10 : 0 }}>
            {groupName && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#6366F1', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {groupName} ({groupDone}/{items.length})
                </div>
                <button style={{ fontSize: 8, color: 'var(--ink-3)', cursor: 'pointer', border: 'none', background: 'none', padding: '2px 4px' }}
                  onClick={() => checkAll(groupName, groupDone < items.length)}>
                  {groupDone < items.length ? 'Check all' : 'Uncheck all'}
                </button>
              </div>
            )}
            {items.map(item => {
              const locked = isItemLocked(item, items);
              return (
                <div key={item._id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '5px 4px',
                  opacity: locked ? 0.5 : 1, borderRadius: 4,
                  borderLeft: item.sequential ? '2px solid #8B5CF6' : 'none'
                }}>
                  <div onClick={() => !locked && toggleItem(item._id, item.done)}
                    style={{
                      width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                      border: item.done ? 'none' : '2px solid var(--line)',
                      background: item.done ? '#10B981' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: locked ? 'not-allowed' : 'pointer', transition: 'all 0.15s'
                    }}>
                    {item.done && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                  </div>
                  <span style={{
                    flex: 1, fontSize: 11, color: item.done ? 'var(--ink-4)' : 'var(--ink)',
                    textDecoration: item.done ? 'line-through' : 'none'
                  }}>
                    {item.text}
                  </span>
                  {locked && <span style={{ fontSize: 9, color: '#F59E0B' }} title="Complete previous item first">🔒</span>}
                  <span style={{ cursor: 'pointer', fontSize: 12, color: 'var(--ink-4)' }} onClick={() => deleteItem(item._id)}>&times;</span>
                </div>
              );
            })}
          </div>
        );
      })}

      {total === 0 && !showAddForm && (
        <div style={{ fontSize: 11, color: 'var(--ink-4)', padding: '4px 0' }}>No checklist items. Click + Add to create one.</div>
      )}

      {/* Add form */}
      {showAddForm && (
        <div style={{ marginTop: 8, padding: 8, background: 'var(--glass)', borderRadius: 6, border: '1px solid var(--line)' }}>
          <input value={newItem} onChange={e => setNewItem(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addItem(); }}
            placeholder="What needs to be done?"
            style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 11, background: 'var(--bg-1)', outline: 'none', fontFamily: 'Inter, sans-serif', marginBottom: 6, boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={newGroup} onChange={e => setNewGroup(e.target.value)} placeholder="Group (optional)"
              style={{ flex: 1, minWidth: 80, padding: '4px 8px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 10, background: 'var(--bg-1)', outline: 'none', fontFamily: 'Inter, sans-serif' }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--ink-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={isSequential} onChange={e => setIsSequential(e.target.checked)} />
              Sequential
            </label>
            <button className="btn btn-primary-sm" style={{ padding: '4px 10px', fontSize: 10 }} onClick={addItem} disabled={adding || !newItem.trim()}>
              {adding ? '...' : 'Add'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function QuickNoteButton({ entityType, entityId, entityTitle }) {
  const [showForm, setShowForm] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [notes, setNotes] = useState([]);
  const [saving, setSaving] = useState(false);

  const loadNotes = useCallback(async () => {
    try {
      const { data } = await api.get(`/sticky-notes/context/${entityType}/${entityId}`);
      setNotes(data);
    } catch {}
  }, [entityType, entityId]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  const createNote = async () => {
    if (!noteText.trim()) return;
    setSaving(true);
    try {
      await api.post('/sticky-notes', {
        title: `Note on: ${entityTitle}`,
        content: noteText.trim(),
        color: '#FEF3C7',
        attachedTo: [{ entityType, entityId }]
      });
      setNoteText('');
      setShowForm(false);
      loadNotes();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save note.');
    } finally { setSaving(false); }
  };

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: notes.length || showForm ? 8 : 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>Notes ({notes.length})</div>
        <button className="btn btn-primary-sm" style={{ padding: '3px 8px', fontSize: 9 }}
          onClick={() => setShowForm(!showForm)}>+ Quick Note</button>
      </div>
      {notes.map(n => (
        <div key={n._id} style={{ padding: '6px 8px', marginBottom: 4, borderRadius: 6, background: n.color || '#FEF3C7', fontSize: 11, color: '#1E293B', lineHeight: 1.5 }}>
          {n.title && <div style={{ fontWeight: 700, fontSize: 10, marginBottom: 2 }}>{n.title}</div>}
          <div>{n.content}</div>
        </div>
      ))}
      {showForm && (
        <div style={{ marginTop: 4 }}>
          <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
            placeholder="Write a quick note about this..."
            rows={3}
            style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 11, fontFamily: 'Inter', background: 'var(--glass)', outline: 'none', resize: 'vertical', color: 'var(--ink)', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 4, marginTop: 4, justifyContent: 'flex-end' }}>
            <button style={{ padding: '3px 8px', fontSize: 9, border: '1px solid var(--line)', borderRadius: 4, background: 'var(--glass)', color: 'var(--ink-3)', cursor: 'pointer', fontFamily: 'Inter' }} onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary-sm" style={{ padding: '3px 10px', fontSize: 9 }} onClick={createNote} disabled={saving || !noteText.trim()}>
              {saving ? '...' : 'Save Note'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateTask({ onBack, onCreated }) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    title: '', description: '', priority: 'medium', startDate: '', deadline: '', deadlineTime: '', statusNote: '',
    assignees: [user._id],
    team: '',
    labels: [],
    isRecurring: false,
    recurringPattern: 'daily',
    isPrivate: false,
    taskType: 'standard',
    dailyTarget: '',
    countUnit: ''
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
        recurringPattern: form.isRecurring ? form.recurringPattern : undefined,
        deadlineTime: form.deadlineTime || undefined,
        taskType: form.taskType,
        dailyTarget: form.taskType === 'counter' && form.dailyTarget ? Number(form.dailyTarget) : undefined,
        countUnit: form.taskType === 'counter' && form.countUnit ? form.countUnit : undefined
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
            <label>Task Type</label>
            <div className="chip-group">
              {[['standard', 'Standard (progress 0-100%)'], ['counter', 'Counter (track count)']].map(([k, l]) => (
                <div key={k} className={`chip ${form.taskType === k ? 'active' : ''}`}
                  style={form.taskType === k ? { background: '#6366F1' + '14', color: '#6366F1', borderColor: '#6366F1' + '33' } : {}}
                  onClick={() => setForm(p => ({ ...p, taskType: k }))}>{l}</div>
              ))}
            </div>
          </div>
          {form.taskType === 'counter' && (
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="form-field">
                <label>Daily Target</label>
                <input type="number" min="0" value={form.dailyTarget} onChange={e => setForm(p => ({ ...p, dailyTarget: e.target.value }))} placeholder="e.g. 50" />
              </div>
              <div className="form-field">
                <label>Unit</label>
                <input value={form.countUnit} onChange={e => setForm(p => ({ ...p, countUnit: e.target.value }))} placeholder='e.g. "calls", "customers"' />
              </div>
            </div>
          )}
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
              <label>Start Date — Deadline</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="date" value={form.startDate || ''} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} style={{ flex: 1 }} title="Start date" />
                <span style={{ alignSelf: 'center', color: 'var(--ink-3)', fontSize: 11 }}>→</span>
                <input type="date" value={form.deadline} onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))} style={{ flex: 1 }} title="Deadline" />
                <input type="time" value={form.deadlineTime} onChange={e => setForm(p => ({ ...p, deadlineTime: e.target.value }))} placeholder="Time" style={{ width: 90 }} title="Deadline time" />
              </div>
              <div style={{ fontSize: 9, color: 'var(--ink-4)', marginTop: 2 }}>Task shows on calendar for all days between start and deadline</div>
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
              <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 8, padding: 8, maxHeight: 200, overflowY: 'auto' }}>
                {allUsers.length > 0 ? allUsers.map(u => (
                  <div key={u._id} onClick={() => toggleAssignee(u._id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', cursor: 'pointer', fontSize: 11, color: 'var(--ink)', borderRadius: 6, background: form.assignees.includes(u._id) ? 'rgba(99,102,241,0.1)' : 'transparent', marginBottom: 2 }}>
                    <div style={{ width: 16, height: 16, borderRadius: 4, border: form.assignees.includes(u._id) ? '2px solid var(--indigo)' : '2px solid var(--line-2)', background: form.assignees.includes(u._id) ? 'var(--indigo)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, flexShrink: 0 }}>
                      {form.assignees.includes(u._id) && '✓'}
                    </div>
                    <div className="avatar-sm" style={{ background: getGrad(u._id), width: 22, height: 22, fontSize: 8 }}>{initials(u.name)}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{u.name}</div>
                      <div style={{ fontSize: 9, color: 'var(--ink-4)' }}>{u.email}</div>
                    </div>
                  </div>
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
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12, background: 'var(--bg-1)', color: 'var(--ink-2)', fontFamily: 'Inter' }}>
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
    if (!newName.trim()) { alert('Enter a label name'); return; }
    try {
      const { data } = await api.post('/tasks/labels', { name: newName.trim(), color: newColor, type: 'company' });
      setLabels(prev => [...prev, data]);
      setNewName('');
      setNewColor('#6366F1');
    } catch (e) { alert('❌ ' + (e.response?.data?.error || 'Failed to create label')); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.3)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ background: 'var(--bg-1)', backdropFilter: 'blur(20px)', border: '1px solid var(--line-2)', borderRadius: 12, padding: 20, width: 380, maxHeight: '70vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
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
