const router = require('express').Router();
const CompanyMonitoring = require('../models/CompanyMonitoring');
const MonitoringOverride = require('../models/MonitoringOverride');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const BLOCKS = ['screenshots', 'appUsage', 'activityLevel', 'selfieAtEntry', 'idleAutoPause'];

// Get-or-create the singleton company monitoring doc
async function loadConfig() {
  let cfg = await CompanyMonitoring.findOne();
  if (!cfg) cfg = await CompanyMonitoring.create({});
  return cfg;
}

// Merge a partial override block into a full block. Override field-by-field.
// Only fields explicitly set in `override` are applied; everything else falls
// through to `base`.
function mergeBlock(base, override) {
  if (!override) return { ...base };
  const out = { ...base };
  Object.keys(override).forEach(k => {
    if (override[k] !== undefined && override[k] !== null) out[k] = override[k];
  });
  return out;
}

// Build the effective monitoring config for one user. Layers (low → high):
//   company → team override → user override.
async function resolveEffectiveConfig(user) {
  const company = await loadConfig();
  // Plain JS objects from .lean() so spread/merge is clean
  const base = company.toObject();
  delete base._id;
  delete base.__v;

  // Team override (if user is on a team)
  let teamOv = null;
  if (user.team) {
    teamOv = await MonitoringOverride.findOne({ scope: 'team', target: user.team }).lean();
  }
  // User override
  const userOv = await MonitoringOverride.findOne({ scope: 'user', target: user._id }).lean();

  const effective = { policyVersion: base.policyVersion };
  for (const b of BLOCKS) {
    let merged = base[b] || {};
    if (teamOv && teamOv[b]) merged = mergeBlock(merged, teamOv[b]);
    if (userOv && userOv[b]) merged = mergeBlock(merged, userOv[b]);
    effective[b] = merged;
  }
  return { effective, company: base, teamOverride: teamOv, userOverride: userOv };
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
    let policyChanged = false;
    BLOCKS.forEach(b => {
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
    // Scoring block is non-policy — admin can tune weights without forcing
    // employees to re-accept. Just apply field-by-field.
    if (incoming.scoring && typeof incoming.scoring === 'object') {
      if (!cfg.scoring) cfg.scoring = {};
      Object.keys(incoming.scoring).forEach(k => {
        cfg.scoring[k] = incoming.scoring[k];
      });
    }
    // EntryBypass is also non-policy — it's an operational escape hatch.
    // The toggle's time-gate is enforced server-side at mark-entry, not here.
    if (incoming.entryBypass && typeof incoming.entryBypass === 'object') {
      if (!cfg.entryBypass) cfg.entryBypass = {};
      Object.keys(incoming.entryBypass).forEach(k => {
        cfg.entryBypass[k] = incoming.entryBypass[k];
      });
    }
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
    const { effective } = await resolveEffectiveConfig(req.user);
    const acceptedVersion = req.user.monitoringConsent?.acceptedVersion || 0;
    const anyEnabled = BLOCKS.some(b => effective[b]?.enabled);
    res.json({
      bypass: false,
      config: effective,
      needsAcceptance: anyEnabled && acceptedVersion < effective.policyVersion,
      acceptedAt: req.user.monitoringConsent?.acceptedAt || null,
      acceptedVersion
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ════════════════════════════════════════════════════════════════════════
// Per-team / per-user override CRUD (admin/sys only)
// ════════════════════════════════════════════════════════════════════════

// List all overrides — for the /sys panel to render side-by-side.
router.get('/overrides', protect, async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admin only.' });
    const overrides = await MonitoringOverride.find().lean();
    res.json(overrides);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Upsert an override. Body: { scope: 'team'|'user', target: id, ...blocks }
// Pass `null` (or omit) a block to clear that override; resolver will fall
// through. Pass an empty object {} to override "I want this block but with
// only company defaults" — unusual, normally not needed.
router.put('/overrides', protect, async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admin only.' });
    const { scope, target } = req.body || {};
    if (!['team', 'user'].includes(scope)) return res.status(400).json({ error: 'Invalid scope.' });
    if (!target) return res.status(400).json({ error: 'target required.' });

    // Build $set / $unset based on which blocks the caller included.
    const $set = { scope, target, updatedBy: req.user._id };
    const $unset = {};
    for (const b of BLOCKS) {
      if (b in req.body) {
        if (req.body[b] === null) $unset[b] = '';
        else $set[b] = req.body[b];
      }
    }

    const update = { $set };
    if (Object.keys($unset).length > 0) update.$unset = $unset;

    const ov = await MonitoringOverride.findOneAndUpdate(
      { scope, target },
      update,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json(ov);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// Delete an override entirely (back to company defaults for that scope+target).
router.delete('/overrides/:scope/:target', protect, async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admin only.' });
    const { scope, target } = req.params;
    if (!['team', 'user'].includes(scope)) return res.status(400).json({ error: 'Invalid scope.' });
    await MonitoringOverride.deleteOne({ scope, target });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Resolve the effective config for any user (admin only — for previewing what
// a given employee will experience).
router.get('/effective/:userId', protect, async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admin only.' });
    const target = await User.findById(req.params.userId).select('name email team');
    if (!target) return res.status(404).json({ error: 'User not found.' });
    const result = await resolveEffectiveConfig(target);
    res.json({ user: target, ...result });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/monitoring/bump-policy — admin-only. Force every employee to
// re-accept the policy on next page load, without otherwise changing the
// config. Used from the sys panel.
router.post('/bump-policy', protect, async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admin only.' });
    const cfg = await loadConfig();
    cfg.policyVersion += 1;
    cfg.updatedBy = req.user._id;
    await cfg.save();
    res.json({ ok: true, policyVersion: cfg.policyVersion });
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
