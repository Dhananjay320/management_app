const mongoose = require('mongoose');

// Cross-team invite sub-schema (spec Section 8.2)
const workspaceInviteSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  dmChannel: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel' } // DM where invite was sent
}, { timestamps: true });

// External sharing sub-schema (spec Section 8.5)
const externalShareSchema = new mongoose.Schema({
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkspaceDocument' },
  externalEmail: { type: String, required: true },
  status: { type: String, enum: ['pending_approval', 'approved', 'rejected', 'invited', 'accepted'], default: 'pending_approval' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  shareToken: { type: String } // Unique token for external access
}, { timestamps: true });

const workspaceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  icon: { type: String, default: '📁' },
  color: { type: String, default: '#6366F1' },
  type: { type: String, enum: ['personal', 'team', 'cross_team'], default: 'personal' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['viewer', 'editor'], default: 'editor' }
  }],
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },

  // Cross-team invites
  pendingInvites: [workspaceInviteSchema],

  // External sharing
  externalShares: [externalShareSchema],

  isActive: { type: Boolean, default: true }
}, { timestamps: true });

workspaceSchema.index({ 'members.user': 1 });

const documentSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  title: { type: String, required: true, trim: true },
  tiptapJSON: { type: Object, default: { type: 'doc', content: [{ type: 'paragraph' }] } },
  plainTextContent: { type: String, default: '' },
  classification: { type: String, enum: ['personal', 'company', 'client'], default: 'personal' },
  tags: [{ type: String }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lastEditedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

documentSchema.index({ workspace: 1 });
documentSchema.index({ title: 'text', plainTextContent: 'text' }, { weights: { title: 10, plainTextContent: 3 }, language_override: 'lang' });

const noteSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  title: { type: String, default: 'Untitled Note' },
  content: { type: String, default: '' },
  plainTextContent: { type: String, default: '' },
  color: { type: String, default: '#F8FAFC' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const fileSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  name: { type: String, required: true },
  originalName: { type: String },
  path: { type: String },
  mimeType: { type: String },
  originalSize: { type: Number },
  compressedSize: { type: Number },
  compressionRatio: { type: Number },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

const linkSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  url: { type: String, required: true },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  image: { type: String, default: '' },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const Workspace = mongoose.model('Workspace', workspaceSchema);
const WorkspaceDocument = mongoose.model('WorkspaceDocument', documentSchema);
const WorkspaceNote = mongoose.model('WorkspaceNote', noteSchema);
const WorkspaceFile = mongoose.model('WorkspaceFile', fileSchema);
const WorkspaceLink = mongoose.model('WorkspaceLink', linkSchema);

module.exports = { Workspace, WorkspaceDocument, WorkspaceNote, WorkspaceFile, WorkspaceLink };
