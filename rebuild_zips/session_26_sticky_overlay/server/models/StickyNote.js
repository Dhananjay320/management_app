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

  // Session 26 (N1): overlay / floating sticky note state.
  // When a user "pins to screen", the note appears as a draggable overlay
  // fixed on top of every page in the app. Position + size are per-user
  // (the note may be shared), so we store them here as this user's own
  // private view state — another user pinning the same shared note gets
  // their own position by falling back to the defaults.
  overlayPinned: { type: Boolean, default: false },
  overlayX:      { type: Number, default: 120 },   // px from viewport left
  overlayY:      { type: Number, default: 120 },   // px from viewport top
  overlayWidth:  { type: Number, default: 220 },
  overlayHeight: { type: Number, default: 160 },

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
