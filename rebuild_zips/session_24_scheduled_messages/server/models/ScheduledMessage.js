// ============================================================================
// ScheduledMessage.js — messages queued for future delivery.
// ============================================================================
// Session 24 (N3). The user writes a message, picks a send time in the
// future, and the server delivers it when the time arrives. Lifecycle:
//
//   pending   — waiting for sendAt to arrive
//   sent      — successfully created a real Message (reference in `messageId`)
//   cancelled — user cancelled before delivery
//   failed    — worker tried to send but something went wrong (target
//               channel gone, user removed from channel, etc.)
//
// The worker (utils/scheduledMessagesWorker.js) scans for pending records
// where sendAt <= now and processes them.
// ============================================================================

const mongoose = require('mongoose');

const scheduledMessageSchema = new mongoose.Schema({
  channel: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', required: true },
  sender:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },

  content: { type: String, default: '' },
  type:    { type: String, enum: ['text', 'file'], default: 'text' },
  file: {
    name:     String,
    url:      String,
    size:     Number,
    mimetype: String,
  },

  mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  parentMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },

  sendAt: { type: Date, required: true, index: true },
  status: {
    type: String,
    enum: ['pending', 'sent', 'cancelled', 'failed'],
    default: 'pending',
    index: true,
  },

  // Populated after successful delivery.
  messageId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  sentAt:        { type: Date },
  failureReason: { type: String },

  // Optional metadata — user might record why they scheduled this.
  note: { type: String, default: '' },
}, { timestamps: true });

// Compound index: the worker queries on { status, sendAt } every poll,
// so this gives us an O(log n) scan over only the relevant records.
scheduledMessageSchema.index({ status: 1, sendAt: 1 });
// For "list my scheduled messages" — user-scoped queries.
scheduledMessageSchema.index({ sender: 1, status: 1, sendAt: 1 });

module.exports = mongoose.model('ScheduledMessage', scheduledMessageSchema);
