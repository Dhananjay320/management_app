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
  isDeleted: { type: Boolean, default: false },

  // Forwarded from another message (preserves chain of origin)
  forwardedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },

  // Broadcast
  isBroadcast: { type: Boolean, default: false },
  broadcastVisibility: { type: String, enum: ['visible', 'hidden'], default: 'hidden' },

  // Auto-unfurled link preview (Open Graph) — populated async after send
  linkPreview: {
    url: { type: String },
    title: { type: String },
    description: { type: String },
    image: { type: String },
    siteName: { type: String },
    // For video providers (YouTube/Vimeo): embed URL for inline player
    videoEmbedUrl: { type: String },
    // For Twitter/X: media gallery (multi-image)
    gallery: [{ url: String, type: { type: String } }]
  }
}, {
  timestamps: true
});

messageSchema.index({ channel: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
