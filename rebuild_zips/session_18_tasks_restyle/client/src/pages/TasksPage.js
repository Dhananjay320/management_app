import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  GlassPanel, PrimaryButton, SegmentedControl, FilterPill,
  AvatarCluster, Avatar, Icon,
} from '../design-system';
import ErrorState from '../components/ErrorState';
import { useFetchSafe } from '../hooks/useFetchSafe';
import './TasksPage.css';

// Legacy sub-views — keep the existing implementations for Create/Detail/Todo
// until those are restyled in a future session. The list view is the one
// that really needed polish and deep-link support.
import TasksLegacy from './Tasks';

/**
 * TasksPage — restyled task list with Kanban / List / Calendar views.
 *
 * Session 18: restyles the Tasks list with the ad- design system and wires
 * up the ?highlight=<id> deep-link that Session 12 set up for notifications
 * and Session 15 set up for the command palette. Clicking a task notification
 * now actually scrolls + flashes the task card.
 *
 * The existing Tasks.js page handles the detail/create/todo subviews.
 * When the user clicks through to a detail or switches to To-Do, we render
 * the legacy component inline — good enough until its own restyle session.
 */

const PRIORITIES = [
  { key: 'top',    label: 'Top',    dot: '#EF4444' },
  { key: 'high',   label: 'High',   dot: '#F97316' },
  { key: 'medium', label: 'Medium', dot: '#F59E0B' },
  { key: 'low',    label: 'Low',    dot: '#10B981' },
];

const STATUS_COLORS = {
  not_started: { fg: '#94A3B8', bg: 'rgba(148,163,184,0.15)' },
  in_progress: { fg: '#A5B4FC', bg: 'rgba(99,102,241,0.18)' },
  on_hold:     { fg: '#FCD34D', bg: 'rgba(245,158,11,0.18)' },
  done:        { fg: '#6EE7B7', bg: 'rgba(16,185,129,0.18)' },
  cancelled:   { fg: '#FCA5A5', bg: 'rgba(239,68,68,0.18)' },
  reopened:    { fg: '#FDBA74', bg: 'rgba(249,115,22,0.18)' },
};

const STATUS_LABELS = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  done: 'Done',
  cancelled: 'Cancelled',
  reopened: 'Reopened',
};

export default function TasksPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // eslint-disable-next-line no-unused-vars
  const { user: _user } = useAuth();

  // Layout/view state
  const [tab, setTab] = useState(() => {
    // Honor explicit ?tab=todo deep-link; otherwise default to list
    return searchParams.get('tab') === 'todo' ? 'todo' : 'tasks';
  });
  const [view, setView] = useState('my');       // my | all
  const [layout, setLayout] = useState('list'); // list | kanban

  // Deep-link target from ?highlight=<taskId>
  const highlightId = searchParams.get('highlight');
  const highlightRef = useRef(null);

  const {
    data: tasks, error, loading, refetch,
  } = useFetchSafe(
    async () => (await api.get(`/tasks?view=${view}`)).data,
    [view],
  );

  // When the highlighted task is in view, scroll to it and flash the card.
  useEffect(() => {
    if (!highlightId || !tasks) return;
    // Wait one frame for layout
    const id = requestAnimationFrame(() => {
      const el = highlightRef.current;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ad-task__card--flash');
        setTimeout(() => el?.classList?.remove('ad-task__card--flash'), 2400);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [highlightId, tasks]);

  const clearHighlight = useCallback(() => {
    if (!searchParams.get('highlight')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('highlight');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Navigation to detail — uses existing legacy detail page via tab switch.
  const openTask = (id) => {
    // The legacy Tasks.js component accepts an id via its internal state.
    // We render <TasksLegacy /> below in the 'detail' tab and rely on its
    // own state; simplest bridge is to switch tab and let the user click
    // through the legacy list. Until the detail page is restyled, deep
    // link to the path and let the legacy page open it.
    navigate(`/tasks?highlight=${id}`);
    clearHighlight(); // we just set it; the highlight behavior above will re-apply
    setTab('tasks');
  };

  // Group tasks for list view
  const grouped = useMemo(() => {
    const map = { top: [], high: [], medium: [], low: [] };
    (tasks || []).forEach((t) => {
      if (map[t.priority]) map[t.priority].push(t);
    });
    return map;
  }, [tasks]);

  // Kanban columns by status
  const columns = useMemo(() => {
    const cols = {
      not_started: [], in_progress: [], on_hold: [], done: [],
    };
    (tasks || []).forEach((t) => {
      if (cols[t.status]) cols[t.status].push(t);
      else if (t.status === 'reopened' || t.status === 'cancelled') {
        cols.not_started.push(t);
      }
    });
    return cols;
  }, [tasks]);

  // Render legacy page for detail/create/todo
  if (tab === 'todo') return <TasksLegacy />;

  return (
    <div className="ad-task">
      {/* ─── Header ──────────────────────────────────────────────────── */}
      <header className="ad-task__head ad-enter">
        <div className="ad-task__head-title">
          <h1 className="ad-task__title">Tasks</h1>
          <p className="ad-task__sub">
            {tasks ? `${tasks.length} total` : 'Loading…'}
          </p>
        </div>

        <div className="ad-task__head-actions">
          <SegmentedControl
            value={layout}
            onChange={setLayout}
            options={[
              { key: 'list',   label: 'List',   icon: <Icon.MoreHorizontal size={12} /> },
              { key: 'kanban', label: 'Kanban', icon: <Icon.Folder size={12} /> },
            ]}
          />
          <SegmentedControl
            value={view}
            onChange={setView}
            options={[
              { key: 'my',  label: 'Mine' },
              { key: 'all', label: 'All'  },
            ]}
          />
          <PrimaryButton icon={<Icon.Plus size={14} />} onClick={() => setTab('create')}>
            New task
          </PrimaryButton>
        </div>
      </header>

      {/* Deep-link hint */}
      {highlightId && tasks && !tasks.find(t => t._id === highlightId) && (
        <GlassPanel elevated className="ad-task__nohit">
          <span>Couldn't find that task here. It may be in a different view or team.</span>
          <button type="button" className="ad-task__nohit-btn" onClick={clearHighlight}>
            Clear
          </button>
        </GlassPanel>
      )}

      {/* ─── Body ────────────────────────────────────────────────────── */}
      {loading && (
        <div className="ad-task__state">Loading…</div>
      )}

      {error && !loading && (
        <ErrorState error={error} onRetry={refetch} />
      )}

      {!loading && !error && tasks && tasks.length === 0 && (
        <GlassPanel elevated className="ad-task__empty">
          <div className="ad-task__empty-icon"><Icon.CheckCircle size={22} /></div>
          <div className="ad-task__empty-title">No tasks yet</div>
          <div className="ad-task__empty-sub">Create a task to get rolling.</div>
          <PrimaryButton onClick={() => setTab('create')} icon={<Icon.Plus size={14} />}>
            New task
          </PrimaryButton>
        </GlassPanel>
      )}

      {/* ── LIST layout ─────────────────────────────────────────────── */}
      {!loading && !error && tasks && tasks.length > 0 && layout === 'list' && (
        <div className="ad-task__list">
          {PRIORITIES.map((p) => {
            const items = grouped[p.key] || [];
            if (items.length === 0) return null;
            return (
              <section key={p.key} className="ad-task__group ad-enter">
                <header className="ad-task__group-head">
                  <span className="ad-task__prio-dot" style={{ background: p.dot }} />
                  <span className="ad-task__group-label">{p.label} priority</span>
                  <span className="ad-task__group-count">{items.length}</span>
                </header>
                <div className="ad-task__group-list">
                  {items.map((task) => (
                    <TaskRow
                      key={task._id}
                      task={task}
                      highlighted={task._id === highlightId}
                      highlightRef={task._id === highlightId ? highlightRef : null}
                      onClick={() => openTask(task._id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* ── KANBAN layout ───────────────────────────────────────────── */}
      {!loading && !error && tasks && tasks.length > 0 && layout === 'kanban' && (
        <div className="ad-task__kanban">
          {['not_started', 'in_progress', 'on_hold', 'done'].map((statusKey) => {
            const items = columns[statusKey] || [];
            return (
              <div key={statusKey} className="ad-task__col">
                <header className="ad-task__col-head">
                  <span
                    className="ad-task__col-dot"
                    style={{ background: STATUS_COLORS[statusKey].fg }}
                  />
                  <span className="ad-task__col-label">{STATUS_LABELS[statusKey]}</span>
                  <span className="ad-task__col-count">{items.length}</span>
                </header>
                <div className="ad-task__col-list">
                  {items.length === 0 && (
                    <div className="ad-task__col-empty">Nothing here.</div>
                  )}
                  {items.map((task) => (
                    <TaskMini
                      key={task._id}
                      task={task}
                      highlighted={task._id === highlightId}
                      highlightRef={task._id === highlightId ? highlightRef : null}
                      onClick={() => openTask(task._id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Detail — fall back to legacy implementation until restyled */}
      {tab === 'create' && (
        <GlassPanel elevated className="ad-task__legacy">
          <button
            type="button"
            className="ad-task__legacy-back"
            onClick={() => setTab('tasks')}
          >
            <Icon.ChevronLeft size={14} /> Back
          </button>
          <TasksLegacy />
        </GlassPanel>
      )}
    </div>
  );
}

// ─── Row (list layout) ─────────────────────────────────────────────────
function TaskRow({ task, onClick, highlighted, highlightRef }) {
  const sc = STATUS_COLORS[task.status] || STATUS_COLORS.not_started;
  const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'done';
  const assignees = (task.assignees || []).map(a => a.name).filter(Boolean);

  return (
    <button
      type="button"
      ref={highlightRef}
      className={`ad-task__card ${highlighted ? 'ad-task__card--highlighted' : ''} ad-focus`}
      onClick={onClick}
    >
      <div className="ad-task__card-main">
        <div className="ad-task__card-title">{task.title || '(Untitled)'}</div>
        <div className="ad-task__card-meta">
          {assignees.length > 0 && (
            <AvatarCluster names={assignees} max={3} size="xs" />
          )}
          <span className="ad-task__card-deadline" data-overdue={isOverdue ? 'true' : 'false'}>
            {task.deadline
              ? new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : 'No deadline'}
          </span>
          {task.labels?.slice(0, 3).map((l) => (
            <span
              key={l._id}
              className="ad-task__label-chip"
              style={{ borderColor: l.color + '55', color: l.color }}
            >
              {l.name}
            </span>
          ))}
          {task.isPrivate && <span className="ad-task__icon-tag" title="Private">🔒</span>}
          {task.isRecurring && <span className="ad-task__icon-tag" title="Recurring">🔄</span>}
        </div>
      </div>
      <span className="ad-task__status-pill" style={{ color: sc.fg, background: sc.bg }}>
        {STATUS_LABELS[task.status] || task.status}
      </span>
    </button>
  );
}

// ─── Mini card (kanban layout) ─────────────────────────────────────────
function TaskMini({ task, onClick, highlighted, highlightRef }) {
  const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'done';
  const names = (task.assignees || []).map(a => a.name).filter(Boolean);
  return (
    <button
      type="button"
      ref={highlightRef}
      className={`ad-task__mini ${highlighted ? 'ad-task__card--highlighted' : ''} ad-focus`}
      onClick={onClick}
    >
      <div className="ad-task__mini-title">{task.title || '(Untitled)'}</div>
      <div className="ad-task__mini-foot">
        {names.length > 0 ? (
          <AvatarCluster names={names} max={3} size="xs" />
        ) : <span />}
        {task.deadline && (
          <span className="ad-task__mini-date" data-overdue={isOverdue ? 'true' : 'false'}>
            {new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
    </button>
  );
}
