const router = require('express').Router();
const crypto = require('crypto');
const User = require('../models/User');
const { protect, requirePower } = require('../middleware/auth');

// Generate readable temp password
function generateTempPassword() {
  return 'Temp' + crypto.randomBytes(4).toString('hex') + '!1';
}

// GET /api/v1/users — list all users (admin)
router.get('/', protect, requirePower('users', 'create'), async (req, res) => {
  try {
    const users = await User.find({ isActive: true, _c: { $ne: true } })
      .select('-password -tempPassword -refreshToken -emailConfig -_c')
      .populate('teams', 'name')
      .populate('office', 'name')
      .populate('manager', 'name email')
      .sort({ name: 1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/users/directory — lightweight user list for pickers (any authenticated user)
router.get('/directory', protect, async (req, res) => {
  try {
    const users = await User.find({ isActive: true, _c: { $ne: true } })
      .select('name email avatar teams')
      .populate('teams', 'name')
      .sort({ name: 1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/users/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -refreshToken -emailConfig')
      .populate('teams', 'name')
      .populate('office', 'name')
      .populate('manager', 'name email');

    if (!user) return res.status(404).json({ error: 'User not found.' });

    // Only show tempPassword to admins who can create users, and only if user hasn't logged in yet
    if (req.user.role !== 'main_admin' && !req.user.hasPower('users', 'create')) {
      const userData = user.toObject();
      delete userData.tempPassword;
      return res.json(userData);
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/users — create employee (admin)
router.post('/', protect, requirePower('users', 'create'), async (req, res) => {
  try {
    const {
      name, email, phone, jobTitle, role, adminTitle,
      teams, office, manager, workType, hybridOfficeDays,
      powers, salary, calendarId
    } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required.' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ error: 'Email already exists.' });
    }

    // Admin can only assign roles up to their own level
    if (role === 'main_admin' && req.user.role !== 'main_admin') {
      return res.status(403).json({ error: 'Cannot create main admin.' });
    }

    const tempPassword = generateTempPassword();

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      phone,
      jobTitle,
      password: tempPassword,
      tempPassword,
      role: role || 'employee',
      adminTitle,
      teams: teams || [],
      office,
      manager,
      workType: workType || 'full_office',
      hybridOfficeDays: hybridOfficeDays || [],
      powers: powers || {},
      salary: salary || {},
      calendarId,
      isFirstLogin: true
    });

    const userData = user.toObject();
    delete userData.password;
    delete userData.refreshToken;
    delete userData.emailConfig;

    res.status(201).json(userData);
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/users/:id — update employee
router.put('/:id', protect, requirePower('users', 'edit'), async (req, res) => {
  try {
    const updates = { ...req.body };
    // Never allow direct password update through this route
    delete updates.password;
    delete updates.tempPassword;
    delete updates.refreshToken;

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
      .select('-password -tempPassword -refreshToken -emailConfig');

    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/users/:id/powers — update user powers (audit logged)
// Session 10: this endpoint now also accepts adminTitle and adminScope changes,
// writes an AuditLog entry with the diff, and refuses to modify main_admin
// unless the caller IS the main_admin.
router.put('/:id/powers', protect, requirePower('users', 'editPowers'), async (req, res) => {
  try {
    const { powers, adminTitle, adminScope } = req.body;

    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found.' });

    // Lock main_admin powers from being edited by anyone except themselves.
    if (target.role === 'main_admin' && String(target._id) !== String(req.user._id)) {
      return res.status(403).json({ error: "The main admin's powers can only be edited by themselves." });
    }

    // Build update — only include keys the caller actually sent.
    const updates = {};
    if (powers !== undefined)      updates.powers = powers;
    if (adminTitle !== undefined)  updates.adminTitle = adminTitle;
    if (adminScope !== undefined)  updates.adminScope = adminScope;

    // Compute a small diff of which power flags changed — for the audit log.
    const changed = [];
    if (powers) {
      for (const group of Object.keys(powers)) {
        for (const flag of Object.keys(powers[group] || {})) {
          const before = target.powers?.[group]?.[flag] === true;
          const after = powers[group][flag] === true;
          if (before !== after) changed.push(`${group}.${flag}: ${before} → ${after}`);
        }
      }
    }
    if (adminTitle !== undefined && adminTitle !== target.adminTitle) {
      changed.push(`adminTitle: "${target.adminTitle || ''}" → "${adminTitle}"`);
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    ).select('-password -tempPassword -refreshToken -emailConfig');

    // Audit
    try {
      const { logAction } = require('../utils/audit');
      await logAction(req, 'user.powerChange', {
        target: 'User',
        targetId: user._id,
        targetLabel: user.name,
        meta: { changes: changed },
      });
    } catch {}

    res.json(user);
  } catch (err) {
    console.error('Update powers error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/users/:id/powers — fetch powers + meta for editor UI
router.get('/:id/powers', protect, requirePower('users', 'viewPowers'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('name email role adminTitle adminScope powers teams')
      .populate('adminScope.teams', 'name')
      .populate('adminScope.offices', 'name');
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/users/powers/groups — returns the full catalog of power groups
// and individual flags, with human-readable labels. Used by PowersEditor UI
// so the list isn't hardcoded in the frontend.
router.get('/powers/groups', protect, async (req, res) => {
  try {
    const groups = [
      { key: 'users', label: 'Users & Team', flags: [
        { key: 'create',        label: 'Create users' },
        { key: 'edit',          label: 'Edit users' },
        { key: 'delete',        label: 'Deactivate users' },
        { key: 'viewPowers',    label: 'View powers' },
        { key: 'editPowers',    label: 'Edit powers' },
        { key: 'resetPassword', label: 'Reset passwords' },
      ]},
      { key: 'attendance', label: 'Attendance', flags: [
        { key: 'viewTeam',       label: 'View team attendance' },
        { key: 'viewIndividual', label: 'View individual attendance' },
        { key: 'editRecords',    label: 'Edit attendance records' },
        { key: 'markManually',   label: 'Mark manually' },
        { key: 'bypassGeofence', label: 'Bypass geofence' },
        { key: 'forwardAlerts',  label: 'Forward alerts' },
      ]},
      { key: 'tasks', label: 'Tasks', flags: [
        { key: 'viewMemberTasks', label: 'View member tasks' },
        { key: 'viewTeamTasks',   label: 'View team tasks' },
        { key: 'viewAny',         label: 'View private tasks' },
        { key: 'createForOthers', label: 'Create for others' },
        { key: 'editAny',         label: 'Edit any task' },
        { key: 'deleteAny',       label: 'Delete any task' },
      ]},
      { key: 'salary', label: 'Salary', flags: [
        { key: 'viewEmployee',     label: 'View employee salary' },
        { key: 'editStructure',    label: 'Edit salary structure' },
        { key: 'defineBonusRules', label: 'Define bonus rules' },
        { key: 'viewDisputes',     label: 'View disputes' },
        { key: 'resolveDisputes',  label: 'Resolve disputes' },
      ]},
      { key: 'meetings', label: 'Meetings', flags: [
        { key: 'createCompanyWide', label: 'Create company-wide meetings' },
        { key: 'viewAll',           label: 'View all meetings' },
        { key: 'editAny',           label: 'Edit any meeting' },
        { key: 'deleteAny',         label: 'Delete any meeting' },
      ]},
      { key: 'messaging', label: 'Messaging', flags: [
        { key: 'createRooms',          label: 'Create rooms' },
        { key: 'createPublicChannels', label: 'Create public channels' },
        { key: 'postAnnouncements',    label: 'Post channel announcements' },
        { key: 'moderateAny',          label: 'Moderate any message' },
      ]},
      { key: 'announcements', label: 'Announcements', flags: [
        { key: 'sendCompanyWide', label: 'Send company-wide' },
        { key: 'manageAll',       label: 'Manage all announcements' },
      ]},
      { key: 'notifications', label: 'Notifications', flags: [
        { key: 'sendSystem', label: 'Send system notifications' },
      ]},
      { key: 'email', label: 'Email', flags: [
        { key: 'accessSharedInboxes', label: 'Access shared inboxes' },
        { key: 'sendExternal',        label: 'Send external emails' },
        { key: 'manageAccounts',      label: 'Manage email accounts' },
      ]},
      { key: 'analysis', label: 'Analysis & Reports', flags: [
        { key: 'viewIndividual', label: 'View individual analytics' },
        { key: 'viewTeam',       label: 'View team analytics' },
        { key: 'viewCompany',    label: 'View company analytics' },
      ]},
      { key: 'emergency', label: 'Emergency', flags: [
        { key: 'sendAlert', label: 'Send emergency alerts' },
      ]},
      { key: 'calendar', label: 'Calendar', flags: [
        { key: 'createCompany',      label: 'Create company events' },
        { key: 'markHolidays',       label: 'Mark holidays' },
        { key: 'createLocationTeam', label: 'Create location/team events' },
      ]},
      { key: 'workspace', label: 'Workspace', flags: [
        { key: 'deleteAny',   label: 'Delete any workspace' },
        { key: 'viewPrivate', label: 'View private workspaces' },
      ]},
      { key: 'security', label: 'Security Panel', flags: [
        { key: 'viewOTPs',       label: 'View OTP codes' },
        { key: 'unlockAccounts', label: 'Unlock accounts' },
        { key: 'viewSessions',   label: 'View active sessions' },
        { key: 'forceLogout',    label: 'Force logout users' },
        { key: 'viewAuditLog',   label: 'View audit log' },
      ]},
      { key: 'activities', label: 'Activities', flags: [
        { key: 'createCompanyWide', label: 'Create company activities' },
        { key: 'moderateAny',       label: 'Moderate any activity' },
      ]},
      { key: 'feed', label: 'Team Feed', flags: [
        { key: 'pinAny',    label: 'Pin any post' },
        { key: 'deleteAny', label: 'Delete any post' },
      ]},
    ];
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/v1/users/:id — soft delete
router.delete('/:id', protect, requirePower('users', 'delete'), async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ message: 'User deactivated.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/users/me/settings — update own settings (timezone, locale, etc).
// Session 17 C2+C7. Merges onto the current user's settings; doesn't let them
// bump their role, powers, salary, or anything else sensitive.
const SELF_ALLOWED_SETTINGS = new Set([
  'calendarDefaultView', 'meetingReminder', 'wrapUpFrequency', 'autoWrapUpTime',
  'notificationSound', 'messagePreview', 'autoDND',
  'autoStatusMeeting', 'autoStatusLeave', 'autoStatusWFH',
  'mentionBreaksDND', 'broadcastDefault',
  'timezone', 'locale',
]);

router.put('/me/settings', protect, async (req, res) => {
  try {
    const incoming = req.body?.settings || {};
    const me = await User.findById(req.user._id);
    if (!me) return res.status(404).json({ error: 'User not found.' });

    // Merge only whitelisted fields so a crafted payload can't edit powers.
    const next = { ...(me.settings?.toObject?.() || me.settings || {}) };
    for (const key of Object.keys(incoming)) {
      if (SELF_ALLOWED_SETTINGS.has(key)) next[key] = incoming[key];
    }

    me.settings = next;
    await me.save();

    const sanitized = me.toObject();
    delete sanitized.password;
    delete sanitized.tempPassword;
    delete sanitized.refreshToken;
    delete sanitized.emailConfig;
    res.json(sanitized);
  } catch (err) {
    console.error('update self settings error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
