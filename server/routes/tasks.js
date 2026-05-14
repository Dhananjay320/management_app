const router = require('express').Router();
const Task = require('../models/Task');
const Todo = require('../models/Todo');
const Label = require('../models/Label');
const { protect, requirePower } = require('../middleware/auth');

// Helper: recalculate parent task progress from subtask completion
async function recalcParentProgress(parentId) {
  const subtasks = await Task.find({ parentTask: parentId, isActive: true });
  if (subtasks.length === 0) return;

  const doneCount = subtasks.filter(s => s.status === 'done').length;
  const avgProgress = Math.round(subtasks.reduce((sum, s) => sum + (s.progress || 0), 0) / subtasks.length);

  // Use the higher of: done-ratio or average-progress
  const doneRatio = Math.round((doneCount / subtasks.length) * 100);
  const progress = Math.max(doneRatio, avgProgress);

  await Task.findByIdAndUpdate(parentId, { progress });
}

// Priority numeric ordering (alphabetical sort of strings gives wrong order)
const PRIORITY_ORDER = { top: 0, high: 1, medium: 2, low: 3 };

// ─── TASKS ───

// GET /api/v1/tasks — list tasks
router.get('/', protect, async (req, res) => {
  try {
    const { status, priority, assignee, team, view = 'my' } = req.query;
    let filter = { isActive: true, parentTask: null };

    if (view === 'my') {
      // Show tasks assigned to me OR where I'm a watcher
      filter.$or = [{ assignees: req.user._id }, { watchers: req.user._id }, { createdBy: req.user._id }];
    } else if (view === 'watching') {
      filter.watchers = req.user._id;
    } else if (view === 'team' && team) {
      filter.team = team;
    }

    if (status && status !== 'all') filter.status = status;
    if (priority && priority !== 'all') filter.priority = priority;
    if (assignee) filter.assignees = assignee;

    const tasks = await Task.find(filter)
      .populate('assignees', 'name email avatar')
      .populate('team', 'name')
      .populate('labels', 'name color type')
      .populate('createdBy', 'name')
      .sort({ calendarOrder: 1, deadline: 1 });

    // Sort by numeric priority order instead of alphabetical
    tasks.sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 99;
      const pb = PRIORITY_ORDER[b.priority] ?? 99;
      return pa - pb;
    });

    res.json(tasks);
  } catch (err) {
    console.error('Get tasks error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/tasks/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('assignees', 'name email avatar')
      .populate('team', 'name')
      .populate('labels', 'name color type')
      .populate('createdBy', 'name')
      .populate('preTasks', 'title status')
      .populate('watchers', 'name email')
      .populate('activity.user', 'name');

    if (!task) return res.status(404).json({ error: 'Task not found.' });

    // Private task access check — watchers can also view
    if (task.isPrivate === true) {
      const userId = req.user._id.toString();
      const isAssignee = task.assignees?.some(a => (a._id || a).toString() === userId);
      const isCreator = task.createdBy && (task.createdBy._id || task.createdBy).toString() === userId;
      const isWatcher = task.watchers?.some(w => (w._id || w).toString() === userId);
      const hasViewAny = req.user.role === 'main_admin' || req.user.powers?.tasks?.viewAny === true;
      if (!isAssignee && !isCreator && !isWatcher && !hasViewAny) {
        return res.status(403).json({ error: 'You do not have access to this private task.' });
      }
    }

    // Get subtasks
    const subtasks = await Task.find({ parentTask: task._id, isActive: true })
      .populate('assignees', 'name avatar')
      .sort({ calendarOrder: 1 });

    res.json({ ...task.toObject(), subtasks });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/tasks
router.post('/', protect, async (req, res) => {
  try {
    const taskData = {
      ...req.body,
      createdBy: req.user._id,
      activity: [{ user: req.user._id, action: 'created', detail: 'Task created' }]
    };

    // Ensure creator is in assignees if they assigned themselves
    if (!taskData.assignees?.length) taskData.assignees = [req.user._id];

    // Power check: creating tasks for other people requires tasks.createForOthers
    const assigningOthers = taskData.assignees.some(a => a.toString() !== req.user._id.toString());
    if (assigningOthers && !req.user.hasPower('tasks', 'createForOthers')) {
      return res.status(403).json({ error: 'You do not have permission to assign tasks to others.' });
    }

    // Check pre-task dependencies
    if (taskData.preTasks?.length) {
      const preTasks = await Task.find({ _id: { $in: taskData.preTasks } });
      const allDone = preTasks.every(t => t.status === 'done');
      taskData.isLocked = !allDone;
    }

    const task = await Task.create(taskData);

    // If subtask, update parent
    if (task.parentTask) {
      await Task.findByIdAndUpdate(task.parentTask, { $inc: { subtaskCount: 1 } });
    }

    const populated = await Task.findById(task._id)
      .populate('assignees', 'name email avatar')
      .populate('labels', 'name color type');

    // Notify assignees
    const io = req.app.get('io');
    if (io) {
      task.assignees.forEach(uid => {
        if (uid.toString() !== req.user._id.toString()) {
          io.to(`user:${uid}`).emit('notification:new', {
            type: 'task',
            title: 'New task assigned',
            message: `${req.user.name} assigned you: "${task.title}"`,
            entityType: 'task',
            entityId: task._id
          });
        }
      });
    }

    res.status(201).json(populated);
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/tasks/:id
router.put('/:id', protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found.' });

    const updates = { ...req.body };
    const activities = [];

    // Track changes for activity log
    if (updates.status && updates.status !== task.status) {
      activities.push({ user: req.user._id, action: 'status_changed', detail: `Status → ${updates.status}` });
      if (updates.status === 'done') updates.completedAt = new Date();

      // Unlock dependent tasks when this one is done
      if (updates.status === 'done') {
        await Task.updateMany(
          { preTasks: task._id, isLocked: true },
          { $set: { isLocked: false } }
        );
      }
    }
    if (updates.progress !== undefined && updates.progress !== task.progress) {
      activities.push({ user: req.user._id, action: 'progress_updated', detail: `Progress → ${updates.progress}%` });
    }
    if (updates.statusNote && updates.statusNote !== task.statusNote) {
      activities.push({ user: req.user._id, action: 'note_updated', detail: updates.statusNote });
    }

    if (activities.length) {
      updates.$push = { activity: { $each: activities } };
    }

    const updated = await Task.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
      .populate('assignees', 'name email avatar')
      .populate('labels', 'name color type');

    // If this is a subtask and status changed to done, recalculate parent progress
    if (updated.parentTask && updates.status === 'done') {
      await recalcParentProgress(updated.parentTask);
    }
    // If progress changed on subtask, also recalculate parent
    if (updated.parentTask && updates.progress !== undefined) {
      await recalcParentProgress(updated.parentTask);
    }

    // Notify via socket + DB notification — targeted to assignees, watchers, and creator
    const io = req.app.get('io');
    const recipients = new Set();
    (updated.assignees || []).forEach(a => recipients.add((a._id || a).toString()));
    (updated.watchers || []).forEach(w => recipients.add((w._id || w).toString()));
    if (updated.createdBy) recipients.add((updated.createdBy._id || updated.createdBy).toString());
    recipients.delete(req.user._id.toString()); // Don't notify yourself

    if (updates.status && updates.status !== task.status) {
      // Create DB notifications for watchers on status change
      const Notification = require('../models/Notification');
      for (const uid of recipients) {
        await Notification.create({
          user: uid, type: 'task',
          title: `Task ${updates.status === 'done' ? 'completed' : 'updated'}`,
          message: `"${updated.title}" status changed to ${updates.status}`,
          entityType: 'task', entityId: updated._id, sender: req.user._id
        }).catch(() => {});
      }
    }

    if (io) {
      const payload = { taskId: updated._id, status: updated.status, progress: updated.progress };
      recipients.forEach(uid => io.to(`user:${uid}`).emit('task:updated', payload));
      if (updates.status) {
        recipients.forEach(uid => io.to(`user:${uid}`).emit('notification:new', {
          type: 'task', title: 'Task updated', message: `"${updated.title}" → ${updated.status}`,
          entityType: 'task', entityId: updated._id
        }));
      }
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/tasks/:id/increment — increment counter for counter-type tasks
router.post('/:id/increment', protect, async (req, res) => {
  try {
    const { amount = 1, note } = req.body;
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    if (task.taskType !== 'counter') return res.status(400).json({ error: 'Not a counter task.' });

    task.count += Number(amount);
    const today = new Date().toISOString().split('T')[0];
    const todayEntry = task.countHistory.find(h => h.date === today);
    if (todayEntry) {
      todayEntry.count += Number(amount);
      if (note) todayEntry.note = note;
    } else {
      task.countHistory.push({ date: today, count: Number(amount), note: note || '' });
    }

    task.activity.push({ user: req.user._id, action: 'counter_increment', detail: `+${amount} (total: ${task.count})` });

    if (task.status === 'not_started') task.status = 'in_progress';
    await task.save();

    const populated = await Task.findById(task._id).populate('assignees', 'name email avatar');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ═══ CHECKLIST ROUTES ═══

// POST /api/v1/tasks/:id/checklist — add checklist item(s)
router.post('/:id/checklist', protect, async (req, res) => {
  try {
    const { items } = req.body; // [{ text, group?, sequential? }] or single { text, group?, sequential? }
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found.' });

    const toAdd = Array.isArray(items) ? items : [req.body];
    const maxOrder = task.checklist.length ? Math.max(...task.checklist.map(c => c.order)) : -1;

    toAdd.forEach((item, i) => {
      task.checklist.push({
        text: item.text,
        group: item.group || '',
        sequential: item.sequential || false,
        order: maxOrder + 1 + i,
        done: false
      });
    });

    task.activity.push({ user: req.user._id, action: 'checklist_add', detail: `Added ${toAdd.length} checklist item(s)` });
    await task.save();

    const populated = await Task.findById(task._id).populate('assignees', 'name email avatar').populate('labels', 'name color type');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/tasks/:id/checklist/:itemId — toggle or update a checklist item
router.put('/:id/checklist/:itemId', protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found.' });

    const item = task.checklist.id(req.params.itemId);
    if (!item) return res.status(404).json({ error: 'Checklist item not found.' });

    // If toggling done and this item is sequential, check if previous item in same group is done
    if (req.body.done !== undefined && req.body.done === true && item.sequential) {
      const sameGroup = task.checklist
        .filter(c => c.group === item.group)
        .sort((a, b) => a.order - b.order);
      const idx = sameGroup.findIndex(c => c._id.toString() === item._id.toString());
      if (idx > 0 && !sameGroup[idx - 1].done) {
        return res.status(400).json({ error: `Complete "${sameGroup[idx - 1].text}" first.` });
      }
    }

    if (req.body.done !== undefined) {
      item.done = req.body.done;
      item.doneAt = req.body.done ? new Date() : null;
    }
    if (req.body.text !== undefined) item.text = req.body.text;
    if (req.body.group !== undefined) item.group = req.body.group;
    if (req.body.sequential !== undefined) item.sequential = req.body.sequential;

    // Auto-calculate progress from checklist
    if (task.checklist.length > 0 && task.taskType === 'standard') {
      const doneCount = task.checklist.filter(c => c.done).length;
      task.progress = Math.round((doneCount / task.checklist.length) * 100);
    }

    // Auto-update status
    if (task.status === 'not_started' && task.checklist.some(c => c.done)) {
      task.status = 'in_progress';
    }
    const allDone = task.checklist.length > 0 && task.checklist.every(c => c.done);
    if (allDone && task.status !== 'done') {
      task.status = 'done';
      task.completedAt = new Date();
    }

    await task.save();
    const populated = await Task.findById(task._id).populate('assignees', 'name email avatar').populate('labels', 'name color type');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/tasks/:id/checklist-bulk — check/uncheck all or a group
router.put('/:id/checklist-bulk', protect, async (req, res) => {
  try {
    const { done, group } = req.body; // done: true/false, group: optional filter
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found.' });

    task.checklist.forEach(item => {
      if (group !== undefined && group !== '' && item.group !== group) return;
      item.done = done;
      item.doneAt = done ? new Date() : null;
    });

    // Auto-calculate progress
    if (task.checklist.length > 0 && task.taskType === 'standard') {
      const doneCount = task.checklist.filter(c => c.done).length;
      task.progress = Math.round((doneCount / task.checklist.length) * 100);
    }

    if (task.status === 'not_started' && done) task.status = 'in_progress';
    if (task.checklist.every(c => c.done) && task.status !== 'done') {
      task.status = 'done';
      task.completedAt = new Date();
    }

    task.activity.push({ user: req.user._id, action: 'checklist_bulk', detail: `${done ? 'Checked' : 'Unchecked'} all${group ? ` in "${group}"` : ''}` });
    await task.save();

    const populated = await Task.findById(task._id).populate('assignees', 'name email avatar').populate('labels', 'name color type');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/v1/tasks/:id/checklist/:itemId — remove a checklist item
router.delete('/:id/checklist/:itemId', protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found.' });

    task.checklist = task.checklist.filter(c => c._id.toString() !== req.params.itemId);

    // Recalc progress
    if (task.checklist.length > 0 && task.taskType === 'standard') {
      const doneCount = task.checklist.filter(c => c.done).length;
      task.progress = Math.round((doneCount / task.checklist.length) * 100);
    } else if (task.checklist.length === 0) {
      // Don't reset progress if no checklist items
    }

    await task.save();
    const populated = await Task.findById(task._id).populate('assignees', 'name email avatar').populate('labels', 'name color type');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/v1/tasks/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found.' });

    // Power check: can only delete own tasks unless tasks.deleteAny
    const isCreator = task.createdBy?.toString() === req.user._id.toString();
    const isAssignee = task.assignees?.some(a => a.toString() === req.user._id.toString());
    if (!isCreator && !isAssignee && !req.user.hasPower('tasks', 'deleteAny')) {
      return res.status(403).json({ error: 'You do not have permission to delete this task.' });
    }

    await Task.findByIdAndUpdate(req.params.id, { isActive: false });
    // Also deactivate subtasks
    await Task.updateMany({ parentTask: req.params.id }, { isActive: false });
    res.json({ message: 'Task deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/tasks/:id/attachments — upload file to task
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const taskUploadDir = path.join(__dirname, '..', 'uploads', 'tasks');
if (!fs.existsSync(taskUploadDir)) fs.mkdirSync(taskUploadDir, { recursive: true });

const taskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, taskUploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const taskUpload = multer({ storage: taskStorage, limits: { fileSize: 50 * 1024 * 1024 } });

router.post('/:id/attachments', protect, taskUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file.' });
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found.' });

    task.attachments.push({
      name: req.file.originalname,
      path: 'uploads/tasks/' + req.file.filename,
      size: req.file.size,
      mimeType: req.file.mimetype,
      uploadedBy: req.user._id,
      uploadedAt: new Date()
    });
    await task.save();
    res.json(task.attachments);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── TO-DO ───

router.get('/todo/list', protect, async (req, res) => {
  try {
    const todos = await Todo.find({ user: req.user._id }).sort({ isDone: 1, order: 1, createdAt: -1 });
    res.json(todos);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/todo', protect, async (req, res) => {
  try {
    const todo = await Todo.create({ ...req.body, user: req.user._id });
    res.status(201).json(todo);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.put('/todo/:id', protect, async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.isDone && !updates.doneAt) updates.doneAt = new Date();
    const todo = await Todo.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, updates, { new: true });
    res.json(todo);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.delete('/todo/:id', protect, async (req, res) => {
  try {
    await Todo.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    res.json({ message: 'Deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Convert to-do to task
router.post('/todo/:id/convert', protect, async (req, res) => {
  try {
    const todo = await Todo.findOne({ _id: req.params.id, user: req.user._id });
    if (!todo) return res.status(404).json({ error: 'To-do not found.' });

    const task = await Task.create({
      title: todo.title,
      description: todo.notes,
      assignees: [req.user._id],
      createdBy: req.user._id,
      priority: todo.priority || 'medium',
      deadline: todo.deadline,
      activity: [{ user: req.user._id, action: 'created', detail: 'Converted from to-do' }]
    });

    await Todo.findByIdAndDelete(todo._id);
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── LABELS ───

router.get('/labels/list', protect, async (req, res) => {
  try {
    const labels = await Label.find({
      $or: [
        { type: 'company' },
        { type: 'team', team: { $in: req.user.teams } },
        { type: 'personal', user: req.user._id }
      ]
    }).sort({ type: 1, name: 1 });
    res.json(labels);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/labels', protect, async (req, res) => {
  try {
    // Company labels — admin only
    if (req.body.type === 'company' && !['main_admin', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only admins can create company labels.' });
    }
    const label = await Label.create({ ...req.body, createdBy: req.user._id, user: req.body.type === 'personal' ? req.user._id : undefined });
    res.status(201).json(label);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
