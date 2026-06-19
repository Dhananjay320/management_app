const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const Screenshot = require('../models/Screenshot');
const AppUsageSample = require('../models/AppUsageSample');
const ActivitySample = require('../models/ActivitySample');
const AppCategory = require('../models/AppCategory');
const TeamAppOverride = require('../models/TeamAppOverride');
const Team = require('../models/Team');
const CompanyMonitoring = require('../models/CompanyMonitoring');
const Attendance = require('../models/Attendance');
const APP_DEFAULTS = require('../utils/appDefaults');
const { protect } = require('../middleware/auth');

function isAdmin(user) { return user.role === 'main_admin' || user.role === 'admin' || user._c === true; }

// Default scoring config — used when no CompanyMonitoring doc exists or its
// `scoring` block is missing. Matches the schema defaults so behaviour is
// stable on first run.
const DEFAULT_SCORING = {
  weightProductive:   1.0,
  weightNeutral:      0.5,
  weightUnproductive: 0.0,
  includeIdleInScore: false
};

// Compute the weighted productivity percentage from per-bucket minutes and the
// active scoring config. Returns null when there's nothing to score (so the UI
// can render a dash instead of a misleading 0%).
function computeProductivityPct(buckets, idleMinutes, scoring) {
  const s = { ...DEFAULT_SCORING, ...(scoring || {}) };
  const p = buckets.productive    || 0;
  const n = buckets.neutral       || 0;
  const u = buckets.unproductive  || 0;
  // Numerator: weighted productive minutes (sum of weight × minutes per bucket).
  const numerator = (p * s.weightProductive) + (n * s.weightNeutral) + (u * s.weightUnproductive);
  // Denominator: total counted minutes. Uncategorized is always excluded so
  // unlabelled apps don't drag the score. Idle minutes are optional.
  let denom = p + n + u;
  if (s.includeIdleInScore && idleMinutes > 0) denom += idleMinutes;
  if (denom <= 0) return null;
  return Math.round((numerator / denom) * 100);
}

// Build an app→category map for a user. Global AppCategory rows are the base,
// then any TeamAppOverride rows for the user's teams overwrite (last team wins
// — admin should resolve conflicts by removing one).
async function effectiveCategoriesFor(user) {
  const globals = await AppCategory.find().select('app category').lean();
  const map = Object.fromEntries(globals.map(c => [c.app, c.category]));
  const teamIds = user?.teams || [];
  if (teamIds.length > 0) {
    const overrides = await TeamAppOverride.find({ team: { $in: teamIds } }).select('app category').lean();
    for (const o of overrides) map[o.app] = o.category;
  }
  return map;
}

// Seed default app categories the first time anyone reads them. Cheap insert
// with ordered:false so individual conflicts don't abort the rest.
async function ensureDefaultCategories() {
  const count = await AppCategory.countDocuments();
  if (count > 0) return;
  const docs = [];
  for (const [category, apps] of Object.entries(APP_DEFAULTS)) {
    for (const a of apps) docs.push({ app: a.toLowerCase(), category });
  }
  try { await AppCategory.insertMany(docs, { ordered: false }); } catch {}
}

const _scDir = path.join(__dirname, '..', 'uploads', 'sc');
if (!fs.existsSync(_scDir)) fs.mkdirSync(_scDir, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Image files only'));
    cb(null, true);
  }
});

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// POST /api/v1/usage/screenshot — auto-tracker upload from Electron
//
// Gates:
//   - User must have consented (monitoringConsent.acceptedVersion >= policyVersion)
//   - Company monitoring must have screenshots enabled
//   - User must be clocked in today and not wrapped up
//
// Server reads the company's `screenshots.mode` to decide whether to blur the
// image before saving, and sets `expiresAt` from `retentionDays` so MongoDB's
// TTL index purges automatically.
router.post('/screenshot', protect, upload.single('image'), async (req, res) => {
  try {
    if (req.user._c) return res.status(400).json({ error: 'Sys accounts do not auto-upload.' });
    if (!req.file) return res.status(400).json({ error: 'No image uploaded.' });

    const cfg = await CompanyMonitoring.findOne();
    if (!cfg?.screenshots?.enabled) {
      return res.status(403).json({ error: 'Screenshots are not enabled.', stop: true });
    }

    const accepted = req.user.monitoringConsent?.acceptedVersion || 0;
    if (accepted < cfg.policyVersion) {
      return res.status(403).json({ error: 'Monitoring policy not accepted.', stop: true });
    }

    // Only capture during an active work day. Saves storage + matches privacy spec.
    const att = await Attendance.findOne({ user: req.user._id, date: todayStr() });
    if (!att?.entryTime) return res.status(409).json({ error: 'Not clocked in.', skip: true });
    if (att.wrapUpTime) return res.status(409).json({ error: 'Day already wrapped.', skip: true });

    const blurMode = cfg.screenshots.mode === 'blur';

    // Pipeline: re-encode through sharp so we strip EXIF + (optionally) blur.
    // Output is always JPEG at quality 70 — keeps storage manageable.
    let buffer = req.file.buffer;
    let pipe = sharp(buffer).rotate();
    if (blurMode) pipe = pipe.blur(18);
    buffer = await pipe.jpeg({ quality: 70 }).toBuffer();

    const filename = `${req.user._id}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`;
    fs.writeFileSync(path.join(_scDir, filename), buffer);

    const capturedAt = req.body.capturedAt ? new Date(req.body.capturedAt) : new Date();
    const retentionDays = Math.max(1, Math.min(365, cfg.screenshots.retentionDays || 30));
    const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);

    const doc = await Screenshot.create({
      user: req.user._id,
      capturedAt,
      imageUrl: '/uploads/sc/' + filename,
      blurred: blurMode,
      source: 'auto',
      displayName: (req.body.displayName || '').toString().slice(0, 60),
      _c: false,
      expiresAt
    });

    res.json({ ok: true, id: doc._id, capturedAt: doc.capturedAt });
  } catch (err) {
    console.error('Screenshot upload error:', err.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/usage/screenshots — current user's own auto screenshots
// (used by the Profile "My recorded activity" timeline).
// Excludes _c records so admin-side queries can never see sys-flagged data.
router.get('/screenshots', protect, async (req, res) => {
  try {
    const { from, to, limit = 200 } = req.query;
    const query = { user: req.user._id, _c: { $ne: true } };
    if (from || to) {
      query.capturedAt = {};
      if (from) query.capturedAt.$gte = new Date(from);
      if (to)   query.capturedAt.$lte = new Date(to);
    }
    const items = await Screenshot.find(query)
      .sort({ capturedAt: -1 })
      .limit(Math.min(500, Number(limit)))
      .select('capturedAt imageUrl blurred source displayName');
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/usage/admin/screenshots/:userId — admin drilldown into one user's
// screenshots for a date range. Excludes _c rows. Returns the same shape as
// /screenshots so the client can reuse the renderer.
router.get('/admin/screenshots/:userId', protect, async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admin only.' });
    const { from, to, limit = 200 } = req.query;
    const query = { user: req.params.userId, _c: { $ne: true } };
    if (from || to) {
      query.capturedAt = {};
      if (from) query.capturedAt.$gte = new Date(from);
      if (to)   query.capturedAt.$lte = new Date(to);
    }
    const items = await Screenshot.find(query)
      .sort({ capturedAt: -1 })
      .limit(Math.min(500, Number(limit)))
      .select('capturedAt imageUrl blurred source displayName');
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/usage/app-batch — receive a batch of app-foreground samples
// Body: { samples: [{ ts, app, title, bundleId }, ...] }
router.post('/app-batch', protect, async (req, res) => {
  try {
    if (req.user._c) return res.status(400).json({ error: 'Sys accounts do not auto-upload.' });
    const cfg = await CompanyMonitoring.findOne();
    if (!cfg?.appUsage?.enabled) return res.status(403).json({ error: 'App usage tracking is not enabled.', stop: true });

    const accepted = req.user.monitoringConsent?.acceptedVersion || 0;
    if (accepted < cfg.policyVersion) return res.status(403).json({ error: 'Monitoring policy not accepted.', stop: true });

    const att = await Attendance.findOne({ user: req.user._id, date: todayStr() });
    if (!att?.entryTime) return res.status(409).json({ error: 'Not clocked in.', skip: true });
    if (att.wrapUpTime) return res.status(409).json({ error: 'Day already wrapped.', skip: true });

    const samples = Array.isArray(req.body.samples) ? req.body.samples : [];
    if (samples.length === 0) return res.json({ ok: true, accepted: 0 });

    const retentionDays = Math.max(1, Math.min(365, cfg.appUsage.retentionDays || 30));
    const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);

    // Light input validation — drop rows missing required fields, cap strings
    const docs = samples
      .filter(s => s && s.app)
      .map(s => ({
        user: req.user._id,
        ts: s.ts ? new Date(s.ts) : new Date(),
        app: String(s.app).slice(0, 200),
        title: String(s.title || '').slice(0, 500),
        bundleId: String(s.bundleId || '').slice(0, 200),
        expiresAt
      }));
    if (docs.length === 0) return res.json({ ok: true, accepted: 0 });

    await AppUsageSample.insertMany(docs, { ordered: false });
    res.json({ ok: true, accepted: docs.length });
  } catch (err) {
    console.error('App usage batch error:', err.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/usage/app-summary — aggregate the current user's foreground
// samples in a date range into time-per-app totals. Each sample represents
// `windowSeconds` (default 15 = the tracker's poll interval), so:
//   totalMinutes per app = count * windowSeconds / 60
router.get('/app-summary', protect, async (req, res) => {
  try {
    const windowSeconds = Number(req.query.windowSeconds) || 15;
    const fromISO = req.query.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const toISO = req.query.to || new Date().toISOString();

    const rows = await AppUsageSample.aggregate([
      { $match: { user: req.user._id, ts: { $gte: new Date(fromISO), $lte: new Date(toISO) } } },
      { $group: { _id: '$app', count: { $sum: 1 } } },
      { $project: { app: '$_id', _id: 0, count: 1, minutes: { $multiply: ['$count', windowSeconds / 60] } } },
      { $sort: { count: -1 } },
      { $limit: 30 }
    ]);
    res.json({ from: fromISO, to: toISO, windowSeconds, totals: rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/usage/activity-batch — idle / away / active samples
router.post('/activity-batch', protect, async (req, res) => {
  try {
    if (req.user._c) return res.status(400).json({ error: 'Sys accounts do not auto-upload.' });
    const cfg = await CompanyMonitoring.findOne();
    if (!cfg?.activityLevel?.enabled) return res.status(403).json({ error: 'Activity tracking is not enabled.', stop: true });

    const accepted = req.user.monitoringConsent?.acceptedVersion || 0;
    if (accepted < cfg.policyVersion) return res.status(403).json({ error: 'Monitoring policy not accepted.', stop: true });

    const att = await Attendance.findOne({ user: req.user._id, date: todayStr() });
    if (!att?.entryTime) return res.status(409).json({ error: 'Not clocked in.', skip: true });
    if (att.wrapUpTime) return res.status(409).json({ error: 'Day already wrapped.', skip: true });

    const samples = Array.isArray(req.body.samples) ? req.body.samples : [];
    if (samples.length === 0) return res.json({ ok: true, accepted: 0 });

    const retentionDays = 30;
    const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);
    const docs = samples
      .filter(s => s && ['active','idle','away'].includes(s.state))
      .map(s => ({
        user: req.user._id,
        ts: s.ts ? new Date(s.ts) : new Date(),
        state: s.state,
        idleSeconds: Number(s.idleSeconds) || 0,
        expiresAt
      }));
    if (docs.length === 0) return res.json({ ok: true, accepted: 0 });

    await ActivitySample.insertMany(docs, { ordered: false });
    res.json({ ok: true, accepted: docs.length });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/usage/categories — list every known app + its category
router.get('/categories', protect, async (req, res) => {
  try {
    await ensureDefaultCategories();
    const items = await AppCategory.find().sort({ category: 1, app: 1 }).select('app category');
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/usage/categories — admin batch update (upsert by app name)
router.put('/categories', protect, async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admin only.' });
    const updates = Array.isArray(req.body.updates) ? req.body.updates : [];
    const valid = ['productive','neutral','unproductive','uncategorized'];
    const ops = updates
      .filter(u => u?.app && valid.includes(u.category))
      .map(u => ({
        updateOne: {
          filter: { app: String(u.app).toLowerCase().trim() },
          update: { $set: { category: u.category, updatedBy: req.user._id } },
          upsert: true
        }
      }));
    if (ops.length === 0) return res.json({ ok: true, modified: 0 });
    const r = await AppCategory.bulkWrite(ops);
    res.json({ ok: true, modified: r.modifiedCount + (r.upsertedCount || 0) });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/usage/productivity — productivity score + category breakdown
// for the current user across a date range.
router.get('/productivity', protect, async (req, res) => {
  try {
    await ensureDefaultCategories();
    const windowSeconds = Number(req.query.windowSeconds) || 15;
    const fromISO = req.query.from || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const toISO = req.query.to || new Date().toISOString();

    const rows = await AppUsageSample.aggregate([
      { $match: { user: req.user._id, ts: { $gte: new Date(fromISO), $lte: new Date(toISO) } } },
      { $group: { _id: { $toLower: '$app' }, count: { $sum: 1 } } }
    ]);

    const catByApp = await effectiveCategoriesFor(req.user);

    const buckets = { productive: 0, neutral: 0, unproductive: 0, uncategorized: 0 };
    const apps = [];
    for (const r of rows) {
      const cat = catByApp[r._id] || 'uncategorized';
      const minutes = r.count * windowSeconds / 60;
      buckets[cat] += minutes;
      apps.push({ app: r._id, category: cat, minutes: Math.round(minutes * 10) / 10 });
    }
    apps.sort((a, b) => b.minutes - a.minutes);

    const totalMinutes = Object.values(buckets).reduce((a, b) => a + b, 0);

    // Idle minutes optionally counted toward denominator (per scoring config).
    const idleSamples = await ActivitySample.countDocuments({
      user: req.user._id,
      ts: { $gte: new Date(fromISO), $lte: new Date(toISO) },
      state: { $in: ['idle', 'away'] }
    });
    const idleMinutes = idleSamples * windowSeconds / 60;

    const cfg = await CompanyMonitoring.findOne().select('scoring').lean();
    const productivityPct = computeProductivityPct(buckets, idleMinutes, cfg?.scoring);

    res.json({
      from: fromISO, to: toISO, windowSeconds,
      productivityPct,
      totalMinutes: Math.round(totalMinutes),
      idleMinutes: Math.round(idleMinutes),
      buckets: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, Math.round(v)])),
      apps: apps.slice(0, 20),
      scoring: cfg?.scoring || DEFAULT_SCORING
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/usage/categories/team/:teamId — effective categories for a team
// (global merged with team overrides, with an `override` flag per row).
router.get('/categories/team/:teamId', protect, async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admin only.' });
    await ensureDefaultCategories();
    const globals = await AppCategory.find().select('app category').lean();
    const overrides = await TeamAppOverride.find({ team: req.params.teamId }).select('app category').lean();
    const overrideMap = Object.fromEntries(overrides.map(o => [o.app, o.category]));
    const rows = globals.map(g => ({
      app: g.app,
      globalCategory: g.category,
      effectiveCategory: overrideMap[g.app] || g.category,
      override: overrideMap[g.app] || null
    }));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/usage/categories/team/:teamId — batch upsert / clear overrides.
// Body: { updates: [{ app, category | null }, ...] }   (null clears override)
router.put('/categories/team/:teamId', protect, async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admin only.' });
    const teamId = req.params.teamId;
    const updates = Array.isArray(req.body.updates) ? req.body.updates : [];
    const valid = ['productive', 'neutral', 'unproductive', 'uncategorized'];

    let modified = 0;
    let removed = 0;
    for (const u of updates) {
      if (!u?.app) continue;
      const app = String(u.app).toLowerCase().trim();
      if (u.category === null) {
        const r = await TeamAppOverride.deleteOne({ team: teamId, app });
        removed += r.deletedCount || 0;
      } else if (valid.includes(u.category)) {
        const r = await TeamAppOverride.updateOne(
          { team: teamId, app },
          { $set: { category: u.category, updatedBy: req.user._id } },
          { upsert: true }
        );
        modified += (r.modifiedCount || 0) + (r.upsertedCount || 0);
      }
    }
    res.json({ ok: true, modified, removed });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/usage/team-productivity — one row per active employee with
// productivity score + state breakdown for the given window.
//
// Access: any user with attendance.viewTeam power OR main_admin/admin.
// Sys-flagged data (_c: true) is excluded from all aggregates.
router.get('/team-productivity', protect, async (req, res) => {
  try {
    const canView = isAdmin(req.user) ||
      req.user.hasPower?.('attendance', 'viewTeam') ||
      req.user.powers?.attendance?.viewTeam === true;
    if (!canView) return res.status(403).json({ error: 'No permission to view team productivity.' });

    await ensureDefaultCategories();
    const User = require('../models/User');
    const windowSeconds = Number(req.query.windowSeconds) || 15;
    const fromISO = req.query.from || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const toISO   = req.query.to   || new Date().toISOString();
    const from = new Date(fromISO);
    const to   = new Date(toISO);

    const globals = await AppCategory.find().select('app category').lean();
    const globalMap = Object.fromEntries(globals.map(c => [c.app, c.category]));
    const allOverrides = await TeamAppOverride.find().select('team app category').lean();
    // Map<teamId, Map<app, category>>
    const overridesByTeam = {};
    for (const o of allOverrides) {
      const t = String(o.team);
      (overridesByTeam[t] = overridesByTeam[t] || {})[o.app] = o.category;
    }

    // Load company scoring config once for the whole batch.
    const teamCfg = await CompanyMonitoring.findOne().select('scoring').lean();

    const users = await User.find({ isActive: true, _c: { $ne: true }, role: { $ne: 'main_admin' } })
      .select('_id name email jobTitle avatar workType teams');

    const today = todayStr();
    const rows = await Promise.all(users.map(async (u) => {
      const [appAgg, actAgg, attRec] = await Promise.all([
        AppUsageSample.aggregate([
          { $match: { user: u._id, ts: { $gte: from, $lte: to } } },
          { $group: { _id: { $toLower: '$app' }, count: { $sum: 1 } } }
        ]),
        ActivitySample.aggregate([
          { $match: { user: u._id, ts: { $gte: from, $lte: to } } },
          { $group: { _id: '$state', count: { $sum: 1 } } }
        ]),
        Attendance.findOne({ user: u._id, date: today }).select('entryTime wrapUpTime')
      ]);

      // Build this user's effective category map (global + team overrides)
      const userMap = { ...globalMap };
      for (const tId of (u.teams || [])) {
        const overrides = overridesByTeam[String(tId)];
        if (overrides) Object.assign(userMap, overrides);
      }

      const buckets = { productive: 0, neutral: 0, unproductive: 0, uncategorized: 0 };
      for (const r of appAgg) {
        const cat = userMap[r._id] || 'uncategorized';
        buckets[cat] += r.count * windowSeconds / 60;
      }
      const totalMinutes = Object.values(buckets).reduce((a, b) => a + b, 0);

      const actMap = { active: 0, idle: 0, away: 0 };
      for (const a of actAgg) actMap[a._id] = a.count;
      const actTotal = actMap.active + actMap.idle + actMap.away;
      const idleMinutes = (actMap.idle + actMap.away) * windowSeconds / 60;

      const productivityPct = computeProductivityPct(buckets, idleMinutes, teamCfg?.scoring);

      return {
        user: { _id: u._id, name: u.name, email: u.email, jobTitle: u.jobTitle, avatar: u.avatar, workType: u.workType },
        productivityPct,
        totalMinutes: Math.round(totalMinutes),
        buckets: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, Math.round(v)])),
        activityMix: actTotal > 0
          ? {
              activePct: Math.round((actMap.active / actTotal) * 100),
              idlePct:   Math.round((actMap.idle   / actTotal) * 100),
              awayPct:   Math.round((actMap.away   / actTotal) * 100)
            }
          : null,
        liveStatus: attRec?.wrapUpTime ? 'wrapped' : attRec?.entryTime ? 'on_duty' : 'off'
      };
    }));

    // Sort: live first, then by productivity desc (null at bottom)
    rows.sort((a, b) => {
      const order = { on_duty: 0, wrapped: 1, off: 2 };
      if (order[a.liveStatus] !== order[b.liveStatus]) return order[a.liveStatus] - order[b.liveStatus];
      const ap = a.productivityPct, bp = b.productivityPct;
      if (ap === null && bp === null) return 0;
      if (ap === null) return 1;
      if (bp === null) return -1;
      return bp - ap;
    });

    res.json({ from: fromISO, to: toISO, windowSeconds, rows });
  } catch (err) {
    console.error('Team productivity error:', err.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
