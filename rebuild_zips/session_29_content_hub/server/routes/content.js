// ============================================================================
// content.js — REST API for the Content Hub.
// ============================================================================
// Session 29 (N7). Endpoints:
//
//   GET    /content                   — browse with filter / search
//   GET    /content/categories        — the static category list (for the UI)
//   GET    /content/featured          — top featured items for hero/home
//   GET    /content/:id               — one item (increments view count)
//   POST   /content                   — create (requires content.publish)
//   PUT    /content/:id               — edit   (author or content.publish)
//   DELETE /content/:id               — soft delete (author or content.publish)
//   POST   /content/:id/like          — toggle like (any authenticated user)
// ============================================================================

const router = require('express').Router();
const ContentItem = require('../models/ContentItem');
const { CATEGORIES, CONTENT_TYPES } = require('../models/ContentItem');
const { protect } = require('../middleware/auth');

// Helper: can this user edit/delete the given item?
function canManage(user, item) {
  if (!user || !item) return false;
  if (user.role === 'main_admin') return true;
  if (user.hasPower?.('content', 'publish')) return true;
  return String(item.author) === String(user._id);
}

// ─── GET /categories — static list, useful for UI filter chips ────────
router.get('/categories', protect, (req, res) => {
  res.json({ categories: CATEGORIES, types: CONTENT_TYPES });
});

// ─── GET /featured — top featured + newest items ──────────────────────
router.get('/featured', protect, async (req, res) => {
  try {
    const [featured, recent] = await Promise.all([
      ContentItem.find({ isActive: true, featured: true })
        .sort({ publishedAt: -1 }).limit(4)
        .populate('author', 'name email avatar')
        .lean(),
      ContentItem.find({ isActive: true })
        .sort({ publishedAt: -1 }).limit(6)
        .populate('author', 'name email avatar')
        .lean(),
    ]);
    // De-dupe: if a featured item is also in recent, keep only featured.
    const featuredIds = new Set(featured.map(f => String(f._id)));
    const recentDeduped = recent.filter(r => !featuredIds.has(String(r._id)));

    res.json({ featured, recent: recentDeduped });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── GET / — list with filters + search ───────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const { category, type, tag, q, limit } = req.query;
    const filter = { isActive: true };
    if (category) filter.category = category;
    if (type) filter.type = type;
    if (tag) filter.tags = tag.toLowerCase();

    let query = ContentItem.find(filter);
    if (q && q.trim()) {
      query = query.find({ $text: { $search: q.trim() } }, { score: { $meta: 'textScore' } })
                   .sort({ score: { $meta: 'textScore' } });
    } else {
      query = query.sort({ publishedAt: -1 });
    }
    query = query.limit(Math.min(100, parseInt(limit, 10) || 50))
                 .populate('author', 'name email avatar');
    const items = await query.lean();
    res.json(items);
  } catch (err) {
    console.error('content list error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── GET /:id — read one, increment view count ─────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const item = await ContentItem.findOneAndUpdate(
      { _id: req.params.id, isActive: true },
      { $inc: { views: 1 } },
      { new: true }
    ).populate('author', 'name email avatar jobTitle');
    if (!item) return res.status(404).json({ error: 'Not found.' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── POST / — create ──────────────────────────────────────────────────
router.post('/', protect, async (req, res) => {
  try {
    // Permission check: must have content.publish OR be main_admin.
    if (!req.user.hasPower?.('content', 'publish') && req.user.role !== 'main_admin') {
      return res.status(403).json({ error: 'You need content publishing permission.' });
    }

    const { title, excerpt, body, type, category, url, thumbnail, tags, featured } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required.' });
    if (!category) return res.status(400).json({ error: 'Category is required.' });
    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Invalid category.' });
    }

    const item = await ContentItem.create({
      title: title.trim(),
      excerpt: excerpt?.trim() || '',
      body: body || '',
      type: type && CONTENT_TYPES.includes(type) ? type : 'tutorial',
      category,
      url: url || '',
      thumbnail: thumbnail || '📚',
      tags: Array.isArray(tags) ? tags.slice(0, 10).map(t => String(t).trim().toLowerCase()).filter(Boolean) : [],
      featured: Boolean(featured) && req.user.hasPower?.('content', 'publish'),
      author: req.user._id,
    });

    const populated = await ContentItem.findById(item._id).populate('author', 'name email avatar');
    res.status(201).json(populated);
  } catch (err) {
    console.error('content create error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── PUT /:id — edit ──────────────────────────────────────────────────
router.put('/:id', protect, async (req, res) => {
  try {
    const item = await ContentItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found.' });
    if (!canManage(req.user, item)) {
      return res.status(403).json({ error: 'Cannot edit this item.' });
    }

    const allowed = ['title', 'excerpt', 'body', 'type', 'category', 'url', 'thumbnail', 'tags'];
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        if (k === 'tags' && Array.isArray(req.body[k])) {
          item.tags = req.body[k].slice(0, 10).map(t => String(t).trim().toLowerCase()).filter(Boolean);
        } else if (k === 'category' && !CATEGORIES.includes(req.body[k])) {
          continue;
        } else if (k === 'type' && !CONTENT_TYPES.includes(req.body[k])) {
          continue;
        } else {
          item[k] = req.body[k];
        }
      }
    }
    // `featured` is admin-only, enforced separately.
    if (req.body.featured !== undefined
        && (req.user.hasPower?.('content', 'publish') || req.user.role === 'main_admin')) {
      item.featured = Boolean(req.body.featured);
    }

    await item.save();
    const populated = await ContentItem.findById(item._id).populate('author', 'name email avatar');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── DELETE /:id — soft delete ────────────────────────────────────────
router.delete('/:id', protect, async (req, res) => {
  try {
    const item = await ContentItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found.' });
    if (!canManage(req.user, item)) {
      return res.status(403).json({ error: 'Cannot delete this item.' });
    }
    item.isActive = false;
    await item.save();
    res.json({ message: 'Deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── POST /:id/like — toggle like ────────────────────────────────────
router.post('/:id/like', protect, async (req, res) => {
  try {
    const item = await ContentItem.findById(req.params.id);
    if (!item || !item.isActive) return res.status(404).json({ error: 'Not found.' });
    const uid = String(req.user._id);
    const idx = item.likes.findIndex(l => String(l) === uid);
    if (idx >= 0) {
      item.likes.splice(idx, 1);
    } else {
      item.likes.push(req.user._id);
    }
    await item.save();
    res.json({ likes: item.likes.length, likedByMe: idx < 0 });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
