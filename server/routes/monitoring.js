const router = require('express').Router();
const CompanyMonitoring = require('../models/CompanyMonitoring');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// Get-or-create the singleton company monitoring doc
async function loadConfig() {
  let cfg = await CompanyMonitoring.findOne();
  if (!cfg) cfg = await CompanyMonitoring.create({});
  return cfg;
}

// Returns true for admins / main_admin / sys
function isAdmin(user) {
  return user.role === 'main_admin' || user.role === 'admin' || user._c === true;
}

// GET /api/v1/monitoring/config — the raw config doc. Admin only.
router.get('/config', protect, async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admin only.' });
    const cfg = await loadConfig();
    res.json(cfg);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/monitoring/config — partial update. Admin only. Pass any subset of
// the top-level feature blocks; we merge field-by-field.
router.put('/config', protect, async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admin only.' });
    const cfg = await loadConfig();
    const incoming = req.body || {};
    const blocks = ['screenshots', 'appUsage', 'activityLevel', 'selfieAtEntry', 'idleAutoPause'];
    let policyChanged = false;
    blocks.forEach(b => {
      if (incoming[b] && typeof incoming[b] === 'object') {
        Object.keys(incoming[b]).forEach(k => {
          if (cfg[b][k] !== incoming[b][k]) {
            cfg[b][k] = incoming[b][k];
            // Toggling `enabled` on any feature counts as a policy change
            if (k === 'enabled') policyChanged = true;
          }
        });
      }
    });
    if (policyChanged) cfg.policyVersion += 1;
    cfg.updatedBy = req.user._id;
    await cfg.save();
    res.json(cfg);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// GET /api/v1/monitoring/my-status — what the current employee should see:
//   - effective config (only features they would experience),
//   - whether they need to accept (re-accept on version bump),
//   - their last acceptance details.
// Sys users (_c) are always exempt — returns `bypass: true`.
router.get('/my-status', protect, async (req, res) => {
  try {
    if (req.user._c) return res.json({ bypass: true, config: null, needsAcceptance: false });
    const cfg = await loadConfig();
    const acceptedVersion = req.user.monitoringConsent?.acceptedVersion || 0;
    const anyEnabled = ['screenshots','appUsage','activityLevel','selfieAtEntry','idleAutoPause']
      .some(b => cfg[b]?.enabled);
    res.json({
      bypass: false,
      config: cfg,
      needsAcceptance: anyEnabled && acceptedVersion < cfg.policyVersion,
      acceptedAt: req.user.monitoringConsent?.acceptedAt || null,
      acceptedVersion
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/monitoring/accept — record the employee's acceptance of the
// current policy version.
router.post('/accept', protect, async (req, res) => {
  try {
    if (req.user._c) return res.json({ ok: true, bypass: true });
    const cfg = await loadConfig();
    await User.findByIdAndUpdate(req.user._id, {
      monitoringConsent: {
        acceptedAt: new Date(),
        acceptedVersion: cfg.policyVersion,
        ipAtAccept: req.ip,
        userAgentAtAccept: req.headers['user-agent']?.slice(0, 300) || ''
      }
    });
    res.json({ ok: true, acceptedVersion: cfg.policyVersion });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
