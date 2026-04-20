// ============================================================================
// ContentItem.js — learning hub articles, tutorials, and resources.
// ============================================================================
// Session 29 (N7). The Content Hub is a read-mostly feed where admins and
// editors publish internal learning materials: onboarding tutorials,
// product updates, industry context, best-practice guides, and team
// spotlights. Any authenticated user can browse and read; only users with
// the `content.publish` power (or main_admin) can create/edit/delete.
//
// Fields kept intentionally simple — this is a feature for sharing knowledge
// not a full CMS. If someone needs versioning, drafts, or scheduling later,
// those can be added without breaking anything here.
// ============================================================================

const mongoose = require('mongoose');

const CONTENT_TYPES = ['tutorial', 'update', 'insight', 'guide', 'resource'];
const CATEGORIES = [
  'Getting Started',
  'Product Updates',
  'Industry Insights',
  'How-to Guides',
  'Best Practices',
  'Team Spotlights',
];

const contentItemSchema = new mongoose.Schema({
  title:     { type: String, required: true, trim: true, maxlength: 200 },
  excerpt:   { type: String, default: '', maxlength: 400 },    // summary shown in cards / feeds
  body:      { type: String, default: '' },                    // main content — markdown-ish plain text
  type:      { type: String, enum: CONTENT_TYPES, default: 'tutorial' },
  category:  { type: String, enum: CATEGORIES, required: true },

  // Optional external URL (for link-type resources)
  url:       { type: String, default: '' },

  // Optional thumbnail URL or emoji
  thumbnail: { type: String, default: '📚' },

  // Light tagging for search/filter
  tags:      [{ type: String, trim: true, lowercase: true, maxlength: 40 }],

  author:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Editorial controls
  featured:    { type: Boolean, default: false },
  publishedAt: { type: Date, default: Date.now, index: true },

  // Engagement
  views:     { type: Number, default: 0 },
  likes:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // Lightweight estimated read time in minutes (auto-calc on save).
  readMinutes: { type: Number, default: 3 },

  // Soft delete
  isActive:  { type: Boolean, default: true, index: true },
}, { timestamps: true });

// Indexes
contentItemSchema.index({ category: 1, publishedAt: -1 });
contentItemSchema.index({ featured: 1, publishedAt: -1 });
contentItemSchema.index({ tags: 1 });
// Text search on title + excerpt + body (Session 16 deep-search style)
contentItemSchema.index(
  { title: 'text', excerpt: 'text', body: 'text' },
  { weights: { title: 10, excerpt: 5, body: 1 } }
);

// Auto-compute read time pre-save based on body word count.
// Average adult reading speed ~200 wpm; we clamp to [1, 30] min.
contentItemSchema.pre('save', function (next) {
  if (this.isModified('body')) {
    const wordCount = (this.body || '').trim().split(/\s+/).filter(Boolean).length;
    this.readMinutes = Math.max(1, Math.min(30, Math.round(wordCount / 200)));
  }
  next();
});

module.exports = mongoose.model('ContentItem', contentItemSchema);
module.exports.CONTENT_TYPES = CONTENT_TYPES;
module.exports.CATEGORIES = CATEGORIES;
