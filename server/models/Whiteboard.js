const mongoose = require('mongoose');
const whiteboardSchema = new mongoose.Schema({
  title: { type: String, default: 'Untitled Board' },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['editor', 'viewer'], default: 'editor' }
  }],
  isShared: { type: Boolean, default: false },
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace' },
  meeting: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting' },
  shapes: [{ type: Object }],
  viewport: { x: Number, y: Number, zoom: Number },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

whiteboardSchema.index({ owner: 1 });
whiteboardSchema.index({ members: 1 });

module.exports = mongoose.model('Whiteboard', whiteboardSchema);
