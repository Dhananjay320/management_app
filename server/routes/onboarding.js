const router = require('express').Router();
const User = require('../models/User');
const CompanyInfo = require('../models/CompanyInfo');
const { protect, requireRole } = require('../middleware/auth');

// ══════════════════════════════════════
//  COMPANY INFO
// ══════════════════════════════════════

// GET /api/v1/onboarding/company — get company info (anyone)
router.get('/company', protect, async (req, res) => {
  try {
    let info = await CompanyInfo.findOne({});
    if (!info) info = await CompanyInfo.create({});
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/onboarding/company — update company info (admin only)
router.put('/company', protect, requireRole('main_admin', 'admin'), async (req, res) => {
  try {
    const fields = ['name', 'about', 'logo', 'tagline', 'email', 'phone', 'address', 'website', 'social', 'welcomeMessage', 'defaultWeeklyOffDays', 'wrapUpEarliestHour', 'wrapUpBellHour', 'wrapUpBellMinute'];
    let info = await CompanyInfo.findOne({});
    if (!info) info = new CompanyInfo({});

    fields.forEach(f => {
      if (req.body[f] !== undefined) info[f] = req.body[f];
    });
    info.updatedBy = req.user._id;
    await info.save();
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ══════════════════════════════════════
//  ONBOARDING STATE
// ══════════════════════════════════════

// GET /api/v1/onboarding/status — get onboarding progress
router.get('/status', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('name email avatar phone jobTitle role teams office manager onboardingComplete settings statusMessage')
      .populate('teams', 'name')
      .populate('office', 'name')
      .populate('manager', 'name');
    res.json({
      onboardingComplete: user.onboardingComplete,
      user
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/onboarding/complete — mark onboarding as done
router.put('/complete', protect, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { onboardingComplete: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/onboarding/settings — update user default settings
router.put('/settings', protect, async (req, res) => {
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

    await User.findByIdAndUpdate(req.user._id, update);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/onboarding/profile — update profile during onboarding
router.put('/profile', protect, async (req, res) => {
  try {
    const { phone, statusMessage, avatar, address, bloodGroup, emergencyContact, dateOfBirth } = req.body;
    const update = {};
    if (phone !== undefined) update.phone = phone;
    if (statusMessage !== undefined) update.statusMessage = statusMessage;
    if (avatar !== undefined) update.avatar = avatar;
    if (address !== undefined) update.address = address;
    if (bloodGroup !== undefined) update.bloodGroup = bloodGroup;
    if (emergencyContact !== undefined) update.emergencyContact = emergencyContact;
    if (dateOfBirth !== undefined) update.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;

    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true })
      .select('name email avatar phone statusMessage address bloodGroup emergencyContact dateOfBirth');
    res.json(user);
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// POST /api/v1/onboarding/profile/avatar — upload profile photo
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const avatarDir = path.join(__dirname, '..', 'uploads', 'avatars');
if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, avatarDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `avatar-${req.user._id}-${Date.now()}${ext}`);
  }
});
const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files allowed'));
    cb(null, true);
  }
});
router.post('/profile/avatar', protect, avatarUpload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const avatarUrl = '/uploads/avatars/' + req.file.filename;
    const user = await User.findByIdAndUpdate(req.user._id, { avatar: avatarUrl }, { new: true })
      .select('name email avatar');
    res.json(user);
  } catch (err) {
    console.error('Avatar upload error:', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// ══════════════════════════════════════
//  PROFILE (general use, not just onboarding)
// ══════════════════════════════════════

// GET /api/v1/onboarding/profile — get my profile
router.get('/profile', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password -tempPassword -refreshTokens -emailConfig')
      .populate('teams', 'name')
      .populate('office', 'name address')
      .populate('manager', 'name email');
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
