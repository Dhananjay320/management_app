const router = require('express').Router();
const crypto = require('crypto');
const User = require('../models/User');
const { protect, requirePower } = require('../middleware/auth');

// TODO: Avatar upload endpoint pending — needs multer setup for frontend + backend file handling

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
      .populate('admins.hr', 'name email')
      .populate('admins.tasks', 'name email')
      .populate('admins.salary', 'name email')
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

// PUT /api/v1/users/me/settings — update own settings
router.put('/me/settings', protect, async (req, res) => {
  try {
    const { settings } = req.body;
    const allowed = [
      'calendarDefaultView', 'meetingReminder', 'wrapUpFrequency', 'autoWrapUpTime',
      'notificationSound', 'messagePreview', 'autoDND', 'autoStatusMeeting',
      'autoStatusLeave', 'autoStatusWFH', 'mentionBreaksDND', 'broadcastDefault'
    ];

    const update = {};
    allowed.forEach(key => {
      if (settings[key] !== undefined) update[`settings.${key}`] = settings[key];
    });

    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true })
      .select('settings');
    res.json(user.settings);
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
      .populate('manager', 'name email')
      .populate('admins.hr', 'name email')
      .populate('admins.tasks', 'name email')
      .populate('admins.salary', 'name email');

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
      teams, office, manager, admins, workType, hybridOfficeDays,
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
      admins: admins || {},
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

// PUT /api/v1/users/:id/powers — update user powers
router.put('/:id/powers', protect, requirePower('users', 'editPowers'), async (req, res) => {
  try {
    const { powers } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { powers },
      { new: true, runValidators: true }
    ).select('-password -tempPassword -refreshToken -emailConfig');

    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json(user);
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

module.exports = router;
