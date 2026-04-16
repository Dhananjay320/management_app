const mongoose = require('mongoose');

const attendeeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  response: { type: String, enum: ['pending', 'confirmed', 'declined', 'reschedule_requested'], default: 'pending' },
  declineReason: { type: String },
  isPresent: { type: Boolean, default: false },
  hasSeen: { type: Boolean, default: false }
}, { _id: false });

const meetingSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  agenda: { type: String, required: true },
  type: { type: String, enum: ['online', 'offline'], required: true },
  date: { type: Date, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String },
  duration: { type: Number }, // minutes
  location: { type: String }, // For offline meetings

  // Attendees
  attendees: [attendeeSchema],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Google Meet
  googleMeetLink: { type: String },
  googleEventId: { type: String },

  // Recurring
  isRecurring: { type: Boolean, default: false },
  recurringPattern: { type: String, enum: ['daily', 'weekly', 'monthly', 'custom'] },

  // Attachments
  attachments: [{
    name: String,
    path: String,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],

  // Status
  status: { type: String, enum: ['scheduled', 'in_progress', 'completed', 'cancelled'], default: 'scheduled' },
  endedAt: { type: Date },
  endedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Chat thread
  chatChannel: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel' },

  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

meetingSchema.index({ date: 1, status: 1 });
meetingSchema.index({ 'attendees.user': 1 });

const momSchema = new mongoose.Schema({
  meeting: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting', required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['scratchpad', 'personal', 'team'], default: 'personal' },
  title: { type: String, default: 'Minutes of Meeting' },
  tiptapJSON: { type: Object, default: { type: 'doc', content: [{ type: 'paragraph' }] } },
  plainTextContent: { type: String, default: '' },
  isPublished: { type: Boolean, default: false },
  publishedAt: { type: Date },

  // Tasks created from this MoM
  linkedTasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],

  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

momSchema.index({ meeting: 1, author: 1 });

const Meeting = mongoose.model('Meeting', meetingSchema);
const MoM = mongoose.model('MoM', momSchema);

module.exports = { Meeting, MoM };
