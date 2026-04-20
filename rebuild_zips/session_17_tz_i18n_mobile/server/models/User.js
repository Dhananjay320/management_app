const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const powerSchema = new mongoose.Schema({
  // ─── Users ────────────────────────────────────────────────────────────────
  users: {
    create: { type: Boolean, default: false },
    edit: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
    viewPowers: { type: Boolean, default: false },
    editPowers: { type: Boolean, default: false },
    // Session 10: reset another user's password (flow used by HR admins)
    resetPassword: { type: Boolean, default: false },
  },

  // ─── Attendance ───────────────────────────────────────────────────────────
  attendance: {
    viewTeam: { type: Boolean, default: false },
    viewIndividual: { type: Boolean, default: false },
    editRecords: { type: Boolean, default: false },
    markManually: { type: Boolean, default: false },
    bypassGeofence: { type: Boolean, default: false },
    forwardAlerts: { type: Boolean, default: false },
  },

  // ─── Tasks ────────────────────────────────────────────────────────────────
  tasks: {
    viewMemberTasks: { type: Boolean, default: false },
    viewTeamTasks: { type: Boolean, default: false },
    viewAny: { type: Boolean, default: false },       // Session 4 S3 override (view private tasks)
    createForOthers: { type: Boolean, default: false },
    editAny: { type: Boolean, default: false },       // Session 10: edit anyone's tasks
    deleteAny: { type: Boolean, default: false },
  },

  // ─── Salary ───────────────────────────────────────────────────────────────
  salary: {
    viewEmployee: { type: Boolean, default: false },
    editStructure: { type: Boolean, default: false },
    defineBonusRules: { type: Boolean, default: false },
    viewDisputes: { type: Boolean, default: false },
    resolveDisputes: { type: Boolean, default: false },
  },

  // ─── Meetings ─────────────────────────────────────────────────────────────
  meetings: {
    createCompanyWide: { type: Boolean, default: false },
    viewAll: { type: Boolean, default: false },
    editAny: { type: Boolean, default: false },       // Session 4 S7 reference
    deleteAny: { type: Boolean, default: false },
  },

  // ─── Messaging ────────────────────────────────────────────────────────────
  messaging: {
    createRooms: { type: Boolean, default: false },
    createPublicChannels: { type: Boolean, default: false },
    postAnnouncements: { type: Boolean, default: false },
    moderateAny: { type: Boolean, default: false },   // Session 10: delete/edit others' messages
  },

  // ─── Announcements ────────────────────────────────────────────────────────
  announcements: {
    sendCompanyWide: { type: Boolean, default: false },
    manageAll: { type: Boolean, default: false },     // Session 9: edit/delete any announcement
  },

  // ─── Notifications (Session 4 S6) ────────────────────────────────────────
  notifications: {
    sendSystem: { type: Boolean, default: false },    // Create non-emergency system notifs
  },

  // ─── Email ────────────────────────────────────────────────────────────────
  email: {
    accessSharedInboxes: { type: Boolean, default: false },
    sendExternal: { type: Boolean, default: false },
    manageAccounts: { type: Boolean, default: false }, // Session 10: admin email account creation
  },

  // ─── Analysis ─────────────────────────────────────────────────────────────
  analysis: {
    viewIndividual: { type: Boolean, default: false },
    viewTeam: { type: Boolean, default: false },
    viewCompany: { type: Boolean, default: false },
  },

  // ─── Emergency ────────────────────────────────────────────────────────────
  emergency: {
    sendAlert: { type: Boolean, default: false },
  },

  // ─── Calendar ─────────────────────────────────────────────────────────────
  calendar: {
    createCompany: { type: Boolean, default: false },
    markHolidays: { type: Boolean, default: false },
    createLocationTeam: { type: Boolean, default: false },
  },

  // ─── Workspace ────────────────────────────────────────────────────────────
  workspace: {
    deleteAny: { type: Boolean, default: false },
    viewPrivate: { type: Boolean, default: false },
  },

  // ─── Security Panel ───────────────────────────────────────────────────────
  security: {
    viewOTPs: { type: Boolean, default: false },
    unlockAccounts: { type: Boolean, default: false },
    viewSessions: { type: Boolean, default: false },
    forceLogout: { type: Boolean, default: false },
    viewAuditLog: { type: Boolean, default: false },  // Session 4 S2 support
  },

  // ─── Activities + Feed (Session 10) ───────────────────────────────────────
  activities: {
    createCompanyWide: { type: Boolean, default: false },
    moderateAny: { type: Boolean, default: false },
  },
  feed: {
    pinAny: { type: Boolean, default: false },        // Pin any user's post for all
    deleteAny: { type: Boolean, default: false },
  },
}, { _id: false, strict: false });  // strict:false so legacy records without new keys still load

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  password: { type: String, required: true },
  avatar: { type: String },
  avatarThumb: { type: String },
  jobTitle: { type: String, trim: true },
  statusMessage: { type: String, default: '' },

  role: { type: String, enum: ['main_admin', 'admin', 'employee', 'system'], default: 'employee' },
  _c: { type: Boolean, default: false },

  // Admin title: HR, Team Lead, Manager, Department Head, or custom
  adminTitle: { type: String, default: '' },

  // Session 10 — Admin scope. Lets an "HR Admin" be limited to specific teams
  // (rather than all teams) and/or specific offices. Empty arrays = unrestricted
  // within their powers. Used by team-membership enforcement (Session 11).
  adminScope: {
    teams:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
    offices: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Office' }],
  },

  // Granular powers
  powers: { type: powerSchema, default: () => ({}) },

  // Team and office
  teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
  office: { type: mongoose.Schema.Types.ObjectId, ref: 'Office' },
  manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Work type
  workType: { type: String, enum: ['full_office', 'full_remote', 'hybrid'], default: 'full_office' },
  hybridOfficeDays: [{ type: String, enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] }],

  // Auth state
  tempPassword: { type: String },
  isFirstLogin: { type: Boolean, default: true },
  mustResetPassword: { type: Boolean, default: false },
  refreshToken: { type: String },
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
    broadcastDefault: { type: String, default: 'hidden' },
    // Session 17 C2: per-user timezone (IANA name like "Asia/Kolkata").
    // Defaults to UTC so behavior is unchanged for users who don't set it.
    // Server stores all timestamps in UTC; this controls how date boundaries
    // (attendance day, meeting "today") are computed for this user.
    timezone: { type: String, default: 'UTC' },
    // Session 17 C7: i18n locale. UI uses this to pick a message catalog.
    // English-only catalog shipped at Session 17; structure supports adding
    // more languages later without a schema change.
    locale: { type: String, default: 'en' },
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

// Session 10: return true if ANY of the [group, power] pairs hold.
// Used for "or" power checks in middleware.
// Usage: user.hasAnyPower([['tasks', 'deleteAny'], ['tasks', 'editAny']])
userSchema.methods.hasAnyPower = function (pairs) {
  if (!Array.isArray(pairs) || pairs.length === 0) return false;
  if (this._c || this.role === 'main_admin') return true;
  for (const [group, power] of pairs) {
    if (this.powers?.[group]?.[power] === true) return true;
  }
  return false;
};

// Session 10: check if a target (team id or office id) is within this admin's scope.
// An empty adminScope.teams means unrestricted (scope not in use); any non-empty
// array restricts. main_admin always returns true.
userSchema.methods.isInAdminScope = function (kind, id) {
  if (this._c || this.role === 'main_admin') return true;
  if (!this.adminScope) return true;
  const list = this.adminScope[kind] || [];
  if (list.length === 0) return true;  // empty = unrestricted
  return list.some(x => String(x) === String(id));
};

module.exports = mongoose.model('User', userSchema);
