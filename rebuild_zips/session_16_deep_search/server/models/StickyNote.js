const mongoose = require('mongoose');

const stickyNoteSchema = new mongoose.Schema({
  title: { type: String, default: '' },
  content: { type: String, default: '' },
  color: { type: String, default: '#FEF3C7' }, // Warm yellow default

  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Attachments to entities — one note can attach to multiple things
  attachedTo: [{
    entityType: { type: String, enum: ['task', 'channel', 'meeting', 'user', 'workspace', 'email'] },
    entityId: { type: mongoose.Schema.Types.ObjectId }
  }],

  // Sharing
  isShared: { type: Boolean, default: false },
  sharedWith: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    canEdit: { type: Boolean, default: false }
  }],

  // Display
  isExpanded: { type: Boolean, default: false },
  order: { type: Number, default: 0 },

  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

stickyNoteSchema.index({ creator: 1, isActive: 1 });
stickyNoteSchema.index({ 'attachedTo.entityType': 1, 'attachedTo.entityId': 1 });
stickyNoteSchema.index({ 'sharedWith.user': 1 });
// Session 16 (C6): index content along with title for deep search.
stickyNoteSchema.index({ title: 'text', content: 'text' }, { weights: { title: 10, content: 3 } });

module.exports = mongoose.model('StickyNote', stickyNoteSchema);
