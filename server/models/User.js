const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const powerSchema = new mongoose.Schema({
  users: {
    create: { type: Boolean, default: false },
    edit: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
    viewPowers: { type: Boolean, default: false },
    editPowers: { type: Boolean, default: false }
  },
  attendance: {
    viewTeam: { type: Boolean, default: false },
    viewIndividual: { type: Boolean, default: false },
    editRecords: { type: Boolean, default: false },
    markManually: { type: Boolean, default: false },
    bypassGeofence: { type: Boolean, default: false },
    forwardAlerts: { type: Boolean, default: false }
  },
  tasks: {
    viewMemberTasks: { type: Boolean, default: false },
    viewTeamTasks: { type: Boolean, default: false },
    createForOthers: { type: Boolean, default: false },
    deleteAny: { type: Boolean, default: false }
  },
  salary: {
    viewEmployee: { type: Boolean, default: false },
    editStructure: { type: Boolean, default: false },
    defineBonusRules: { type: Boolean, default: false },
    viewDisputes: { type: Boolean, default: false },
    resolveDisputes: { type: Boolean, default: false }
  },
  meetings: {
    createCompanyWide: { type: Boolean, default: false },
    viewAll: { type: Boolean, default: false },
    deleteAny: { type: Boolean, default: false }
  },
  messaging: {
    createRooms: { type: Boolean, default: false },
    createPublicChannels: { type: Boolean, default: false },
    postAnnouncements: { type: Boolean, default: false }
  },
  announcements: {
    sendCompanyWide: { type: Boolean, default: false }
  },
  email: {
    accessSharedInboxes: { type: Boolean, default: false },
    sendExternal: { type: Boolean, default: false }
  },
  analysis: {
    viewIndividual: { type: Boolean, default: false },
    viewTeam: { type: Boolean, default: false },
    viewCompany: { type: Boolean, default: false }
  },
  emergency: {
    sendAlert: { type: Boolean, default: false }
  },
  calendar: {
    createCompany: { type: Boolean, default: false },
    markHolidays: { type: Boolean, default: false },
    createLocationTeam: { type: Boolean, default: false }
  },
  workspace: {
    deleteAny: { type: Boolean, default: false },
    viewPrivate: { type: Boolean, default: false }
  },
  security: {
    viewOTPs: { type: Boolean, default: false },
    unlockAccounts: { type: Boolean, default: false },
    viewSessions: { type: Boolean, default: false },
    forceLogout: { type: Boolean, default: false }
  }
}, { _id: false });

const userSchema = new mongoose.Schema({
  employeeId: { type: String, unique: true, sparse: true }, // e.g. AVD-001
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  password: { type: String, required: true },
  avatar: { type: String },
  avatarThumb: { type: String },
  jobTitle: { type: String, trim: true },
  statusMessage: { type: String, default: '' },
  dateOfJoining: { type: Date },
  department: { type: String, default: '' },
  bloodGroup: { type: String, default: '' },
  emergencyContact: { type: String, default: '' },
  address: { type: String, default: '' },
  dateOfBirth: { type: Date },

  role: { type: String, enum: ['main_admin', 'admin', 'employee', 'system'], default: 'employee' },
  _c: { type: Boolean, default: false },

  // Admin title: HR, Team Lead, Manager, Department Head, or custom
  adminTitle: { type: String, default: '' },

  // Granular powers
  powers: { type: powerSchema, default: () => ({}) },

  // Team and office
  teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
  office: { type: mongoose.Schema.Types.ObjectId, ref: 'Office' },
  manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Multi-admin assignment per employee — each aspect managed by a different admin
  admins: {
    hr: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },           // HR processes, leaves, onboarding
    tasks: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },        // Task assignment, reviews
    salary: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },       // Salary, payroll, disputes
    attendance: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },   // Attendance, late tracking, geofence
    escalation: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },   // Emergency escalation handler
  },

  // Work type
  workType: { type: String, enum: ['full_office', 'full_remote', 'hybrid'], default: 'full_office' },
  hybridOfficeDays: [{ type: String, enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] }],
  // Personal weekly off days override (0=Sun..6=Sat). Empty = use team/office/company default.
  weeklyOffDays: { type: [Number], default: undefined },

  // Auth state
  tempPassword: { type: String },
  isFirstLogin: { type: Boolean, default: true },
  mustResetPassword: { type: Boolean, default: false },
  // One entry per active session (laptop, phone, etc.). Capped to MAX_SESSIONS in auth route.
  refreshTokens: [{
    token: { type: String, required: true },
    device: { type: String, default: '' },          // user-agent string
    createdAt: { type: Date, default: Date.now },
    lastUsed: { type: Date, default: Date.now }
  }],
  failedLoginAttempts: { type: Number, default: 0 },
  isLocked: { type: Boolean, default: false },
  lockedAt: { type: Date },
  lastLogin: { type: Date },

  // Settings
  canEditOwnName: { type: Boolean, default: false },
  canEditOwnEmail: { type: Boolean, default: false },
  settings: {
    calendarDefaultView: { type: String, default: 'weekly' },
    meetingReminder: { type: Number, default: 10 },
    wrapUpFrequency: { type: Number, default: 30 },
    autoWrapUpTime: { type: String, default: '20:00' },
    notificationSound: { type: Boolean, default: true },
    messagePreview: { type: Boolean, default: true },
    autoDND: { type: Boolean, default: true },
    autoStatusMeeting: { type: Boolean, default: true },
    autoStatusLeave: { type: Boolean, default: true },
    autoStatusWFH: { type: Boolean, default: true },
    mentionBreaksDND: { type: Boolean, default: true },
    broadcastDefault: { type: String, default: 'hidden' }
  },

  // Salary
  salary: {
    base: { type: Number, default: 0 },
    tds: { type: Number, default: 0 },
    pf: { type: Number, default: 0 },
    esi: { type: Number, default: 0 },
    fixedBonus: { type: Number, default: 0 }
  },

  // Email config
  emailConfig: {
    smtp: { host: String, port: Number, user: String, pass: String },
    imap: { host: String, port: Number, user: String, pass: String }
  },
  sharedInboxes: [{ type: String }],

  // AI config
  aiProvider: { type: String },
  aiKeyExpiry: { type: Date },
  aiActive: { type: Boolean, default: false },

  // Calendar assignment
  calendarId: { type: mongoose.Schema.Types.ObjectId, ref: 'Calendar' },

  // DND (Do Not Disturb)
  dnd: {
    active: { type: Boolean, default: false },
    until: { type: Date },           // DND expires at this time
    reason: { type: String }          // 'manual', 'meeting', 'focus'
  },

  // User status (rich, per spec Section 6.5)
  currentStatus: {
    type: { type: String, enum: ['online', 'in_meeting', 'on_leave', 'wfh', 'in_office', 'custom'], default: 'online' },
    text: { type: String, default: '' },
    expiresAt: { type: Date }
  },

  // Onboarding
  onboardingComplete: { type: Boolean, default: false },

  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Check if user has any admin power
userSchema.methods.hasAnyAdminPower = function () {
  if (this.role === 'main_admin') return true;
  const powers = this.powers;
  if (!powers) return false;
  for (const group of Object.values(powers.toObject())) {
    if (typeof group === 'object' && group !== null) {
      for (const val of Object.values(group)) {
        if (val === true) return true;
      }
    }
  }
  return false;
};

// Check specific power
userSchema.methods.hasPower = function (group, power) {
  if (this._c || this.role === 'main_admin') return true;
  return this.powers?.[group]?.[power] === true;
};

module.exports = mongoose.model('User', userSchema);
