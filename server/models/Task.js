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

  // Priority & Status
  priority: { type: String, enum: ['top', 'high', 'medium', 'low'], default: 'medium' },
  status: { type: String, enum: ['not_started', 'in_progress', 'on_hold', 'done', 'cancelled', 'reopened'], default: 'not_started' },
  progress: { type: Number, default: 0, min: 0, max: 100 },
  statusNote: { type: String, default: '' },

  // Dates
  deadline: { type: Date },
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

  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

taskSchema.index({ assignees: 1, status: 1 });
taskSchema.index({ team: 1, status: 1 });
taskSchema.index({ deadline: 1 });
taskSchema.index({ '$**': 'text' }, { weights: { title: 10, statusNote: 5, plainTextDescription: 3 } });

module.exports = mongoose.model('Task', taskSchema);
