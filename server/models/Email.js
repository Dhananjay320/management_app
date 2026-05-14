const mongoose = require('mongoose');

// ─── Email Account (personal or shared inbox) ───
const emailAccountSchema = new mongoose.Schema({
  address: { type: String, required: true, lowercase: true, trim: true }, // e.g. ravi@company.com
  displayName: { type: String, trim: true },
  type: { type: String, enum: ['personal', 'shared'], default: 'personal' },

  // SMTP config for sending
  smtp: {
    host: { type: String },
    port: { type: Number, default: 587 },
    user: { type: String },
    pass: { type: String },
    secure: { type: Boolean, default: false }
  },

  // IMAP config for receiving
  imap: {
    host: { type: String },
    port: { type: Number, default: 993 },
    user: { type: String },
    pass: { type: String },
    tls: { type: Boolean, default: true }
  },

  // Owner (personal) or null (shared)
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // For shared inboxes — which users have access
  accessList: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // Created by admin
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

emailAccountSchema.index({ owner: 1 });
emailAccountSchema.index({ type: 1, accessList: 1 });

// ─── Email Message ───
const emailSchema = new mongoose.Schema({
  account: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailAccount', required: true },

  // Envelope
  messageId: { type: String }, // IMAP Message-ID header
  from: { type: String, required: true },
  fromName: { type: String, default: '' },
  to: [{ type: String }],
  cc: [{ type: String }],
  bcc: [{ type: String }],
  replyTo: { type: String },
  subject: { type: String, default: '(No Subject)' },

  // Body
  bodyHtml: { type: String, default: '' },
  bodyText: { type: String, default: '' }, // Plain text for search

  // Thread
  inReplyTo: { type: String }, // Message-ID of parent
  threadId: { type: String }, // Conversation grouping

  // Attachments
  attachments: [{
    name: { type: String },
    mimeType: { type: String },
    size: { type: Number },
    path: { type: String }
  }],

  // Folder / state
  folder: { type: String, enum: ['inbox', 'sent', 'drafts', 'trash', 'archive'], default: 'inbox' },
  isRead: { type: Boolean, default: false },
  isStarred: { type: Boolean, default: false },
  isFlagged: { type: Boolean, default: false },

  // User-created categories
  categories: [{ type: String }],

  // For shared inboxes — who replied
  repliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  repliedAt: { type: Date },

  // Who owns / fetched this email
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Linked to task or workspace
  linkedTask: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
  linkedWorkspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace' },

  // Whether the email was actually delivered via SMTP
  smtpDelivered: { type: Boolean, default: false },

  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date },

  receivedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

emailSchema.index({ user: 1, folder: 1, receivedAt: -1 });
emailSchema.index({ account: 1, folder: 1, receivedAt: -1 });
emailSchema.index({ threadId: 1 });
emailSchema.index({ subject: 'text', fromName: 'text' });

// ─── Email Draft ───
const emailDraftSchema = new mongoose.Schema({
  account: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailAccount' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  to: [{ type: String }],
  cc: [{ type: String }],
  bcc: [{ type: String }],
  subject: { type: String, default: '' },
  bodyHtml: { type: String, default: '' },
  bodyText: { type: String, default: '' },

  // If replying/forwarding
  inReplyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Email' },
  forwardOf: { type: mongoose.Schema.Types.ObjectId, ref: 'Email' },

  attachments: [{
    name: { type: String },
    mimeType: { type: String },
    size: { type: Number },
    path: { type: String }
  }],

  isDeleted: { type: Boolean, default: false }
}, {
  timestamps: true
});

emailDraftSchema.index({ user: 1, isDeleted: 1 });

// ─── Email Template ───
const emailTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  subject: { type: String, default: '' },
  bodyHtml: { type: String, default: '' },
  bodyText: { type: String, default: '' },

  // Scope: 'company' (admin-created), 'team', or 'personal'
  scope: { type: String, enum: ['company', 'team', 'personal'], default: 'personal' },
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

emailTemplateSchema.index({ scope: 1, createdBy: 1 });

// ─── Email Category (user-created personal categories) ───
const emailCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  color: { type: String, default: '#6366F1' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

emailCategorySchema.index({ user: 1 });

const EmailAccount = mongoose.model('EmailAccount', emailAccountSchema);
const Email = mongoose.model('Email', emailSchema);
const EmailDraft = mongoose.model('EmailDraft', emailDraftSchema);
const EmailTemplate = mongoose.model('EmailTemplate', emailTemplateSchema);
const EmailCategory = mongoose.model('EmailCategory', emailCategorySchema);

module.exports = { EmailAccount, Email, EmailDraft, EmailTemplate, EmailCategory };
