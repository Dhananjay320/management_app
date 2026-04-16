import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import '../styles/tasks.css';

const PRIORITY_CONFIG = {
  top: { label: '🔴 Top Priority', color: '#EF4444' },
  high: { label: '🟠 High Priority', color: '#F97316' },
  medium: { label: '🟡 Medium Priority', color: '#F59E0B' },
  low: { label: '🟢 Low Priority', color: '#10B981' }
};
const STATUS_CONFIG = {
  not_started: { label: 'Not Started', color: '#94A3B8' },
  in_progress: { label: 'In Progress', color: '#6366F1' },
  on_hold: { label: 'On Hold', color: '#F59E0B' },
  done: { label: 'Done', color: '#10B981' },
  cancelled: { label: 'Cancelled', color: '#EF4444' },
  reopened: { label: 'Reopened', color: '#F97316' }
};
const GRADIENTS = ['linear-gradient(135deg,#6366F1,#8B5CF6)','linear-gradient(135deg,#10B981,#06B6D4)','linear-gradient(135deg,#F59E0B,#F97316)','linear-gradient(135deg,#EC4899,#8B5CF6)','linear-gradient(135deg,#EF4444,#F97316)'];
function getGrad(id) { return GRADIENTS[((id||'').charCodeAt(0)||0) % GRADIENTS.length]; }
function initials(n) { return (n||'?').split(' ').map(w=>w[0]).join('').slice(0,2); }

export default function Tasks() {
  const { user } = useAuth();
  const [tab, setTab] = useState('tasks'); // tasks, create, detail, todo
  const [view, setView] = useState('my');
  const [tasks, setTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [loading, setLoading] = useState(true);

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

  // Group by priority
  const grouped = { top: [], high: [], medium: [], low: [] };
  tasks.forEach(t => { if (grouped[t.priority]) grouped[t.priority].push(t); });

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
          {tab === 'tasks' && <button className="btn btn-primary-sm" onClick={() => setTab('create')}>+ New Task</button>}
        </div>
      </div>

      {tab === 'tasks' && (
        <>
          <div className="task-filters">
            {[['my','My Tasks'],['all','All Tasks']].map(([k,l]) => (
              <div key={k} className={`task-filter-chip ${view === k ? 'active' : ''}`} onClick={() => setView(k)}>{l}</div>
            ))}
          </div>
          {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8' }}>Loading...</div> : (
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
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B' }}>No tasks yet</div>
              <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>Create a task to get started</div>
            </div>
          )}
        </>
      )}

      {tab === 'detail' && selectedTask && (
        <TaskDetail task={selectedTask} onBack={() => { setTab('tasks'); setSelectedTask(null); }} onUpdate={updateTask} />
      )}

      {tab === 'create' && <CreateTask onBack={() => setTab('tasks')} onCreated={() => { setTab('tasks'); loadTasks(); }} users={[]} />}

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
      </div>
      {task.statusNote && <div style={{ fontSize: 10, color: '#64748B', marginBottom: 4, fontStyle: 'italic' }}>{task.statusNote}</div>}
      <div className="task-card-progress">
        <div className="task-card-progress-bar"><div className="task-card-progress-fill" style={{ width: task.progress + '%', background: pc.color }} /></div>
        <div className="task-card-progress-text">{task.progress}%</div>
      </div>
    </div>
  );
}

function TaskDetail({ task, onBack, onUpdate }) {
  const pc = PRIORITY_CONFIG[task.priority];
  const sc = STATUS_CONFIG[task.status];
  const [progress, setProgress] = useState(task.progress);
  const [statusNote, setStatusNote] = useState(task.statusNote || '');

  return (
    <div>
      <button className="btn btn-secondary" style={{ marginBottom: 16 }} onClick={onBack}>← Back to Tasks</button>
      <div className="task-detail">
        <div className="task-detail-main">
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1E293B', marginBottom: 6 }}>{task.title}</h2>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span className="badge-pill" style={{ background: pc.color + '14', color: pc.color }}>{pc.label}</span>
                  <span className="badge-pill" style={{ background: sc.color + '14', color: sc.color }}>{sc.label}</span>
                  {task.team && <span className="badge-pill" style={{ background: 'rgba(16,185,129,0.08)', color: '#10B981' }}>{task.team.name}</span>}
                </div>
              </div>
              <select style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #E2E8F0', fontSize: 11, color: '#475569' }}
                value={task.status} onChange={e => onUpdate(task._id, { status: e.target.value })}>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>

            {/* Fields grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 10 }}>
                <div className="task-field-label">Assignees</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {task.assignees?.map(a => (
                    <div key={a._id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div className="avatar-sm" style={{ background: getGrad(a._id), width: 20, height: 20, fontSize: 8 }}>{initials(a.name)}</div>
                      <span style={{ fontSize: 10, color: '#1E293B' }}>{a.name.split(' ')[0]}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 10 }}>
                <div className="task-field-label">Deadline</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: task.deadline && new Date(task.deadline) < new Date() ? '#EF4444' : '#1E293B' }}>
                  {task.deadline ? new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                </div>
              </div>
              <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 10 }}>
                <div className="task-field-label">Progress</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="range" min="0" max="100" value={progress} onChange={e => setProgress(Number(e.target.value))}
                    onMouseUp={() => onUpdate(task._id, { progress })}
                    style={{ flex: 1, accentColor: pc.color }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: pc.color }}>{progress}%</span>
                </div>
              </div>
            </div>

            {/* Status note */}
            {task.statusNote && <div className="task-status-note" style={{ marginBottom: 14 }}>{task.statusNote}</div>}
            <div style={{ marginBottom: 14 }}>
              <div className="task-field-label">Update Status Note</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={statusNote} onChange={e => setStatusNote(e.target.value)} placeholder="What's the current status?"
                  style={{ flex: 1, padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 11, background: '#F8FAFC', outline: 'none', fontFamily: 'Inter' }} />
                <button className="btn btn-primary-sm" style={{ padding: '8px 14px' }} onClick={() => onUpdate(task._id, { statusNote })}>Update</button>
              </div>
            </div>

            {/* Description */}
            {task.description && (
              <div className="task-field">
                <div className="task-field-label">Description</div>
                <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.7 }}>{task.description}</div>
              </div>
            )}

            {/* Labels */}
            {task.labels?.length > 0 && (
              <div className="task-field">
                <div className="task-field-label">Labels</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {task.labels.map(l => <span key={l._id} className="badge-pill" style={{ background: l.color + '14', color: l.color }}>{l.name}</span>)}
                </div>
              </div>
            )}
          </div>

          {/* Activity */}
          <div className="card">
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1E293B', marginBottom: 10 }}>Activity Log</div>
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
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1E293B', marginBottom: 10 }}>Subtasks ({task.subtasks?.length || 0})</div>
            {task.subtasks?.map(st => (
              <div key={st._id} className="subtask-item">
                <div className={`subtask-check ${st.status === 'done' ? 'done' : ''}`} onClick={() => onUpdate(st._id, { status: st.status === 'done' ? 'not_started' : 'done' })}>
                  {st.status === 'done' && '✓'}
                </div>
                <span className={`subtask-text ${st.status === 'done' ? 'done' : ''}`}>{st.title}</span>
              </div>
            ))}
            {(!task.subtasks || task.subtasks.length === 0) && <div style={{ fontSize: 11, color: '#CBD5E1' }}>No subtasks</div>}
          </div>

          {/* Dependencies */}
          {task.preTasks?.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1E293B', marginBottom: 10 }}>Dependencies</div>
              {task.preTasks.map(pt => (
                <div key={pt._id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', fontSize: 11 }}>
                  <span style={{ color: pt.status === 'done' ? '#10B981' : '#F59E0B' }}>{pt.status === 'done' ? '✅' : '⏳'}</span>
                  <span style={{ color: '#475569' }}>{pt.title}</span>
                </div>
              ))}
            </div>
          )}

          {/* Created info */}
          <div className="card">
            <div style={{ fontSize: 10, color: '#94A3B8' }}>Created by {task.createdBy?.name}</div>
            <div style={{ fontSize: 10, color: '#CBD5E1' }}>{new Date(task.createdAt).toLocaleDateString()}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateTask({ onBack, onCreated }) {
  const { user } = useAuth();
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', deadline: '', statusNote: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/tasks', { ...form, assignees: [user._id] });
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
          <div className="form-field" style={{ marginBottom: 14 }}>
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

function TodoList() {
  const [todos, setTodos] = useState([]);
  const [input, setInput] = useState('');
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
      await api.post('/tasks/todo', { title: input.trim() });
      setInput('');
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
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTodo()}
            placeholder="Add a new to-do..." style={{ flex: 1, padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12, background: '#F8FAFC', outline: 'none', fontFamily: 'Inter' }} />
          <button className="btn btn-primary-sm" onClick={addTodo}>Add</button>
        </div>
        {loading ? <div style={{ color: '#94A3B8', fontSize: 12 }}>Loading...</div> : (
          todos.map(todo => (
            <div key={todo._id} className={`todo-item ${todo.isDone ? 'done' : ''}`}>
              <div className={`todo-check ${todo.isDone ? 'done' : ''}`} onClick={() => toggleTodo(todo._id, todo.isDone)}>
                {todo.isDone && '✓'}
              </div>
              <div className={`todo-text ${todo.isDone ? 'done' : ''}`}>{todo.title}</div>
              {todo.priority && <div className="todo-priority-dot" style={{ background: priColors[todo.priority] || '#CBD5E1' }} />}
              <div className="todo-actions">
                {!todo.isDone && <span className="todo-action-btn" onClick={() => convertToTask(todo._id)} title="Convert to task">📋</span>}
                <span className="todo-action-btn" onClick={() => deleteTodo(todo._id)} title="Delete">✕</span>
              </div>
            </div>
          ))
        )}
        {!loading && todos.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#CBD5E1', fontSize: 12 }}>No to-dos yet. Add one above!</div>}
      </div>
    </div>
  );
}
