import { useState } from 'react';
import {
  DndContext, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, DragOverlay
} from '@dnd-kit/core';
import api from '../services/api';

// Kanban board view of tasks.
//   - Columns are driven by `statuses` (slug + label + color).
//   - Cards are draggable; dropping on a column patches status via the API
//     and calls onTaskUpdated so the parent list refreshes.
//
// Props:
//   tasks            — array of tasks (already filtered to whatever the parent wants visible)
//   statuses         — [{ slug, label, color }]
//   onTaskUpdated    — (taskId, patch) => void   called optimistically + after server confirms

const PRIORITY_DOT = { top: '#EF4444', high: '#F59E0B', medium: '#6366F1', low: '#94A3B8' };

function TaskCard({ task, onClick }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task._id,
    data: { task }
  });
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.4 : 1
  };
  const due = task.deadline ? new Date(task.deadline) : null;
  const overdue = due && due < new Date() && task.status !== 'done';
  return (
    <div
      ref={setNodeRef} {...attributes} {...listeners}
      onClick={onClick}
      style={{
        ...style,
        padding: 10,
        background: 'var(--bg-1)',
        border: '1px solid var(--line-2)',
        borderRadius: 8,
        cursor: 'grab',
        marginBottom: 8,
        userSelect: 'none'
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: 3, background: PRIORITY_DOT[task.priority] || '#94A3B8' }} />
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--ink-3)' }}>{task.priority}</span>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.35 }}>{task.title}</div>
      {due && (
        <div style={{ fontSize: 10, color: overdue ? 'var(--danger)' : 'var(--ink-3)', marginTop: 6 }}>
          {overdue ? '⚠️ ' : '📅 '}{due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </div>
      )}
    </div>
  );
}

function Column({ status, tasks, onCardClick }) {
  const { setNodeRef, isOver } = useDroppable({ id: status.slug });
  return (
    <div ref={setNodeRef} style={{
      flex: '1 1 0', minWidth: 220, maxWidth: 320,
      background: isOver ? 'rgba(99,102,241,0.06)' : 'var(--glass)',
      border: `1px solid ${isOver ? 'var(--indigo)' : 'var(--line)'}`,
      borderRadius: 12,
      padding: 10,
      transition: 'background 0.15s, border-color 0.15s'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: status.color }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{status.label}</div>
        </div>
        <span style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 700 }}>{tasks.length}</span>
      </div>
      <div style={{ minHeight: 60 }}>
        {tasks.map(t => <TaskCard key={t._id} task={t} onClick={() => onCardClick?.(t._id)} />)}
        {tasks.length === 0 && <div style={{ fontSize: 10, color: 'var(--ink-4)', textAlign: 'center', padding: 16 }}>Drop here</div>}
      </div>
    </div>
  );
}

export default function TaskBoard({ tasks = [], statuses = [], onTaskUpdated, onCardClick }) {
  // Local optimistic copy so cards move instantly on drop
  const [localTasks, setLocalTasks] = useState(tasks);
  const [activeId, setActiveId] = useState(null);

  // Re-sync if parent reloads
  if (tasks !== localTasks && tasks.length !== localTasks.length) {
    // Re-sync only when length changes (avoid loops on minor object diff)
    setLocalTasks(tasks);
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const byStatus = Object.fromEntries(statuses.map(s => [s.slug, []]));
  for (const t of localTasks) {
    const slug = byStatus[t.status] ? t.status : statuses[0]?.slug;
    if (byStatus[slug]) byStatus[slug].push(t);
  }

  const onDragEnd = async (e) => {
    setActiveId(null);
    const taskId = e.active?.id;
    const newStatus = e.over?.id;
    if (!taskId || !newStatus) return;
    const task = localTasks.find(t => t._id === taskId);
    if (!task || task.status === newStatus) return;
    // Optimistic
    setLocalTasks(prev => prev.map(t => t._id === taskId ? { ...t, status: newStatus } : t));
    try {
      await api.put(`/tasks/${taskId}`, { status: newStatus });
      onTaskUpdated?.(taskId, { status: newStatus });
    } catch {
      // Rollback
      setLocalTasks(prev => prev.map(t => t._id === taskId ? { ...t, status: task.status } : t));
    }
  };

  const draggedTask = localTasks.find(t => t._id === activeId);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={e => setActiveId(e.active.id)}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={onDragEnd}>
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
        {statuses.map(s => (
          <Column key={s.slug} status={s} tasks={byStatus[s.slug] || []} onCardClick={onCardClick} />
        ))}
      </div>
      <DragOverlay>
        {draggedTask && (
          <div style={{
            padding: 10, background: 'var(--bg-1)', border: '1px solid var(--indigo)',
            borderRadius: 8, fontSize: 12, fontWeight: 600, color: 'var(--ink)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.4)', cursor: 'grabbing'
          }}>
            {draggedTask.title}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
