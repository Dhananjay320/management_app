const mongoose = require('mongoose');

const channelSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  type: { type: String, enum: ['channel', 'room', 'dm', 'group', 'broadcast'], required: true },
  isDefault: { type: Boolean, default: false }, // #general, #announcements
  isPrivate: { type: Boolean, default: false }, // rooms are private

  // Members
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // For DMs — exactly 2 members
  // For groups — 3+ members, casual
  // For rooms — invite-only, private

  // Team association (auto-created team channels)
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },

  // Pinned messages
  pinnedMessages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],

  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  lastMessageAt: { type: Date },

  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

channelSchema.index({ members: 1 });
channelSchema.index({ type: 1 });

module.exports = mongoose.model('Channel', channelSchema);
