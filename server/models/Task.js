const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  descriptionTiptap: { type: Object }, // Rich text JSON
  plainTextDescription: { type: String, default: '' }, // For search

  // Assignment
  assignees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Task type: 'standard' (0-100% progress) or 'counter' (infinite, track count)
  taskType: { type: String, enum: ['standard', 'counter'], default: 'standard' },

  // Priority & Status
  priority: { type: String, enum: ['top', 'high', 'medium', 'low'], default: 'medium' },
  status: { type: String, enum: ['not_started', 'in_progress', 'on_hold', 'done', 'cancelled', 'reopened'], default: 'not_started' },
  progress: { type: Number, default: 0, min: 0, max: 100 },
  statusNote: { type: String, default: '' },

  // Counter task fields (for taskType: 'counter')
  count: { type: Number, default: 0 },
  dailyTarget: { type: Number },
  countUnit: { type: String, default: '' }, // e.g. "calls", "customers", "units"
  countHistory: [{
    date: { type: String },
    count: { type: Number },
    note: { type: String }
  }],

  // Checklist (lightweight inline items, separate from subtasks)
  checklist: [{
    _id: { type: mongoose.Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },
    text: { type: String, required: true },
    done: { type: Boolean, default: false },
    group: { type: String, default: '' },        // group name for grouping items
    order: { type: Number, default: 0 },          // sort order within group
    sequential: { type: Boolean, default: false }, // if true, previous item must be done first
    doneAt: { type: Date }
  }],

  // Dates
  deadline: { type: Date },
  deadlineTime: { type: String }, // optional HH:MM for reminder
  reminderSent: { type: Boolean, default: false },
  startDate: { type: Date },
  estimatedTime: { type: Number }, // minutes
  completedAt: { type: Date },

  // Recurring
  isRecurring: { type: Boolean, default: false },
  recurringPattern: { type: String, enum: ['daily', 'weekly', 'monthly', 'custom'] },
  recurringConfig: { type: Object },

  // Dependencies
  preTasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
  isLocked: { type: Boolean, default: false }, // Locked until preTasks are done

  // Hierarchy
  parentTask: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
  subtaskCount: { type: Number, default: 0 },

  // Labels
  labels: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Label' }],

  // Watchers
  watchers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // Attachments
  attachments: [{
    name: String,
    path: String,
    size: Number,
    mimeType: String,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    uploadedAt: { type: Date, default: Date.now }
  }],

  // Links
  linkedWorkspace: { type: mongoose.Schema.Types.ObjectId },
  linkedChat: { type: mongoose.Schema.Types.ObjectId },
  sourceType: { type: String, enum: ['direct', 'chat', 'meeting', 'mom', 'workspace'] },
  sourceId: { type: mongoose.Schema.Types.ObjectId },

  // Visibility
  isPrivate: { type: Boolean, default: false },

  // Calendar order (within priority group)
  calendarOrder: { type: Number, default: 0 },

  // Activity log
  activity: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: String, // 'created', 'status_changed', 'progress_updated', 'assigned', etc
    detail: String,
    timestamp: { type: Date, default: Date.now }
  }],

  isActive: { type: Boolean, default: true },
  _overdueNotified: { type: Boolean, default: false }
}, {
  timestamps: true
});

taskSchema.index({ assignees: 1, status: 1 });
taskSchema.index({ team: 1, status: 1 });
taskSchema.index({ deadline: 1 });
taskSchema.index({ '$**': 'text' }, { weights: { title: 10, statusNote: 5, plainTextDescription: 3 } });

module.exports = mongoose.model('Task', taskSchema);
