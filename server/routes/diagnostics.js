const router = require('express').Router();
const CrashReport = require('../models/CrashReport');
const { protect } = require('../middleware/auth');

function isAdmin(user) {
  return user?.role === 'main_admin' || user?.role === 'admin' || user?._c === true;
}

// Cheap in-memory rate limit so a misbehaving client can't flood us.
// Per-IP bucket: 30 crashes per 5 minutes; drops oldest first.
const buckets = new Map(); // ip -> [{ts}]
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 5 * 60 * 1000;

function withinRateLimit(ip) {
  const now = Date.now();
  const arr = (buckets.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  arr.push(now);
  buckets.set(ip, arr);
  return arr.length <= RATE_LIMIT;
}

// POST /api/v1/diagnostics/crash — UNAUTHENTICATED on purpose.
// Crashes happen before login too (auth boot errors, network failure, etc).
// We attach the user only if a valid token is passed; otherwise still accept.
//
// Body shape (all optional except `message`):
//   { type, message, stack, url, userAgent, platform, appVersion, context }
router.post('/crash', async (req, res) => {
  try {
    const ip = (req.ip || '').slice(0, 60);
    if (!withinRateLimit(ip)) {
      return res.status(429).json({ ok: false, error: 'Rate limit.' });
    }

    const b = req.body || {};
    const message = String(b.message || '').slice(0, 1000);
    if (!message) return res.status(400).json({ ok: false, error: 'message required.' });

    // Try to identify the user from the Bearer token if present — best effort,
    // failures are silent (we still accept the crash).
    let userId = null;
    try {
      const auth = req.headers.authorization;
      if (auth?.startsWith('Bearer ')) {
        const jwt = require('jsonwebtoken');
        const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
        if (payload?.id) userId = payload.id;
      }
    } catch {}

    const doc = await CrashReport.create({
      user: userId || undefined,
      type: ['js_error', 'unhandled_promise', 'react_error', 'native_hint'].includes(b.type) ? b.type : 'js_error',
      message,
      stack: String(b.stack || '').slice(0, 8000),
      url: String(b.url || '').slice(0, 500),
      userAgent: String(b.userAgent || req.headers['user-agent'] || '').slice(0, 500),
      platform: String(b.platform || '').slice(0, 50),
      appVersion: String(b.appVersion || '').slice(0, 50),
      context: (typeof b.context === 'object' && b.context) ? b.context : {},
      ip,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });

    res.json({ ok: true, id: doc._id });
  } catch (err) {
    // Even our own logging swallows errors — we never want this endpoint to
    // throw and add to the user's pain.
    console.warn('[Diagnostics] crash report write failed:', err.message);
    res.status(200).json({ ok: false }); // 200 so retries don't pile up
  }
});

// GET /api/v1/diagnostics/crashes — admin/sys only
// Query: ?limit=50&type=js_error&platform=mobile-webview&unresolved=1
router.get('/crashes', protect, async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admin only.' });
    const limit = Math.min(500, Number(req.query.limit) || 100);
    const q = {};
    if (req.query.type) q.type = req.query.type;
    if (req.query.platform) q.platform = req.query.platform;
    if (req.query.unresolved === '1') q.resolved = false;
    const items = await CrashReport.find(q)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('user', 'name email')
      .lean();
    // Aggregate counts for the sidebar / filter chips
    const counts = await CrashReport.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);
    res.json({ items, counts });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/diagnostics/crashes/:id/resolve — toggle resolved flag
router.put('/crashes/:id/resolve', protect, async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admin only.' });
    const doc = await CrashReport.findByIdAndUpdate(
      req.params.id,
      { resolved: !!req.body?.resolved },
      { new: true }
    );
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/v1/diagnostics/crashes/:id — explicit purge (admin only)
router.delete('/crashes/:id', protect, async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admin only.' });
    await CrashReport.deleteOne({ _id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
