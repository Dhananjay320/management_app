const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  reactions: [{
    emoji: String,
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  }]
}, {
  timestamps: true
});

const teamFeedPostSchema = new mongoose.Schema({
  // Content
  content: { type: String, default: '' },
  contentType: { type: String, enum: ['text', 'image', 'video', 'link', 'file'], default: 'text' },

  // Media
  media: {
    url: { type: String },
    name: { type: String },
    mimeType: { type: String },
    path: { type: String },
    thumbnailUrl: { type: String }
  },

  // Link preview (Open Graph)
  linkPreview: {
    url: { type: String },
    title: { type: String },
    description: { type: String },
    image: { type: String }
  },

  // Audience
  audience: { type: String, enum: ['company', 'team'], default: 'company' },
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },

  // Author
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Reactions
  reactions: [{
    emoji: String,
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  }],

  // Comments
  comments: [commentSchema],

  // Personal pins — each user can pin for themselves only
  pinnedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

teamFeedPostSchema.index({ audience: 1, createdAt: -1 });
teamFeedPostSchema.index({ author: 1 });
teamFeedPostSchema.index({ pinnedBy: 1 });
teamFeedPostSchema.index({ 'author': 'text', content: 'text' });

module.exports = mongoose.model('TeamFeedPost', teamFeedPostSchema);
