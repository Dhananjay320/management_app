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
      .select('-password -tempPassword -refreshTokens -emailConfig -_c')
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
      .select('-password -refreshTokens -emailConfig')
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

    if (role === 'main_admin' && req.user.role !== 'main_admin' && !req.user._c) {
      return res.status(403).json({ error: 'Cannot create main admin.' });
    }

    const tempPassword = generateTempPassword();

    const lastUser = await User.findOne({ employeeId: { $exists: true, $ne: null } }).sort({ employeeId: -1 }).select('employeeId');
    let nextNum = 1;
    if (lastUser?.employeeId) {
      const match = lastUser.employeeId.match(/(\d+)$/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }
    const employeeId = `AVD-${String(nextNum).padStart(3, '0')}`;

    // Strip empty-string ObjectId-like values so Mongoose doesn't CastError
    const cleanAdmins = {};
    if (admins && typeof admins === 'object') {
      for (const k of Object.keys(admins)) {
        if (admins[k]) cleanAdmins[k] = admins[k];
      }
    }
    const doc = {
      employeeId,
      name,
      email: email.toLowerCase(),
      phone,
      jobTitle,
      password: tempPassword,
      tempPassword,
      role: role || 'employee',
      adminTitle,
      teams: (teams || []).filter(Boolean),
      admins: cleanAdmins,
      workType: workType || 'full_office',
      hybridOfficeDays: hybridOfficeDays || [],
      powers: powers || {},
      salary: salary || {},
      dateOfJoining: new Date(),
      isFirstLogin: true
    };
    if (office) doc.office = office;
    if (manager) doc.manager = manager;
    if (calendarId) doc.calendarId = calendarId;

    const user = await User.create(doc);

    const userData = user.toObject();
    delete userData.password;
    delete userData.refreshTokens;
    delete userData.emailConfig;

    res.status(201).json(userData);
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// PUT /api/v1/users/:id — update employee
router.put('/:id', protect, requirePower('users', 'edit'), async (req, res) => {
  try {
    const updates = { ...req.body };
    delete updates.password;
    delete updates.tempPassword;
    delete updates.refreshTokens;

    // Strip empty-string ObjectId fields so Mongoose doesn't CastError
    ['office', 'manager', 'calendarId'].forEach(k => {
      if (updates[k] === '' || updates[k] === null) delete updates[k];
    });
    if (updates.admins && typeof updates.admins === 'object') {
      const clean = {};
      for (const k of Object.keys(updates.admins)) {
        if (updates.admins[k]) clean[k] = updates.admins[k];
      }
      updates.admins = clean;
    }
    if (Array.isArray(updates.teams)) {
      updates.teams = updates.teams.filter(Boolean);
    }

    const isSelf = String(req.user._id) === String(req.params.id);
    const isElevated = req.user._c === true || req.user.role === 'main_admin';

    if (isSelf && !isElevated) {
      // Regular admins editing themselves cannot touch sensitive fields
      const blocked = ['salary', 'role', 'adminTitle', 'powers', 'admins', 'isLocked', 'isActive', '_c', 'employeeId'];
      const attempted = blocked.filter(f => f in updates);
      if (attempted.length > 0) {
        return res.status(403).json({
          error: `You cannot edit your own ${attempted.join(', ')}. Ask the Main Admin.`
        });
      }
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
      .select('-password -tempPassword -refreshTokens -emailConfig');

    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/users/:id/powers — update user powers
router.put('/:id/powers', protect, requirePower('users', 'editPowers'), async (req, res) => {
  try {
    const isSelf = String(req.user._id) === String(req.params.id);
    const isElevated = req.user._c === true || req.user.role === 'main_admin';
    if (isSelf && !isElevated) {
      return res.status(403).json({ error: 'You cannot edit your own powers. Ask the Main Admin.' });
    }

    const { powers } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { powers },
      { new: true, runValidators: true }
    ).select('-password -tempPassword -refreshTokens -emailConfig');

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

// GET /api/v1/users/me/id-card — get current user's ID card data + company
router.get('/me/id-card', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('employeeId name email phone jobTitle avatar role adminTitle office teams dateOfJoining department bloodGroup emergencyContact address dateOfBirth workType')
      .populate('office', 'name address')
      .populate('teams', 'name');
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const CompanyInfo = require('../models/CompanyInfo');
    const company = await CompanyInfo.findOne();
    res.json({ ...user.toObject(), company: company ? {
      name: company.name || company.companyName || 'Avadeti Media',
      address: company.address || '',
      logo: company.logo || null
    } : null });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ═══ POWER PRESETS (saveable position templates) ═══
const PowerPreset = require('../models/PowerPreset');

// GET /api/v1/users/power-presets — list all presets
router.get('/power-presets/list', protect, async (req, res) => {
  try {
    const presets = await PowerPreset.find({ isActive: true }).sort({ targetRole: 1, name: 1 });
    res.json(presets);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/users/power-presets — create a preset
router.post('/power-presets', protect, requirePower('users', 'editPowers'), async (req, res) => {
  try {
    const { name, description, targetRole, powers } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name required.' });

    const preset = await PowerPreset.create({
      name: name.trim(),
      description: description || '',
      targetRole: targetRole || 'admin',
      powers: powers || {},
      createdBy: req.user._id
    });
    res.status(201).json(preset);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'A preset with that name already exists.' });
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/users/power-presets/:id — update a preset
router.put('/power-presets/:id', protect, requirePower('users', 'editPowers'), async (req, res) => {
  try {
    const updated = await PowerPreset.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ error: 'Preset not found.' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/v1/users/power-presets/:id — delete a preset
router.delete('/power-presets/:id', protect, requirePower('users', 'editPowers'), async (req, res) => {
  try {
    await PowerPreset.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'Preset deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
