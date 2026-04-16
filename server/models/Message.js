const mongoose = require('mongoose');

const reactionSchema = new mongoose.Schema({
  emoji: { type: String, required: true },
  users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { _id: false });

const messageSchema = new mongoose.Schema({
  channel: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, default: '' },
  type: { type: String, enum: ['text', 'file', 'system', 'task_card'], default: 'text' },

  // File attachment
  file: {
    name: String,
    originalSize: Number,
    compressedSize: Number,
    mimeType: String,
    path: String
  },

  // Reactions
  reactions: [reactionSchema],

  // Thread
  parentMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  replyCount: { type: Number, default: 0 },

  // Mentions
  mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // Read by
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  isPinned: { type: Boolean, default: false },
  isEdited: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false }
}, {
  timestamps: true
});

messageSchema.index({ channel: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
