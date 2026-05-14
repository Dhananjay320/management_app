const router = require('express').Router();
const TeamFeedPost = require('../models/TeamFeedPost');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { notifyMany } = require('../utils/notify');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Fan out a feed post as DB notifications + push for everyone in the audience.
async function fanoutFeedPost(io, post, authorId, authorName) {
  const filter = { isActive: true, _c: { $ne: true }, _id: { $ne: authorId } };
  if (post.audience === 'team' && post.team) filter.teams = post.team;
  const recipients = await User.find(filter).select('_id');
  const titleSnippet = (post.content || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  await notifyMany(io, recipients.map(r => r._id), {
    type: 'announcement',
    title: `📰 New post from ${authorName}`,
    message: titleSnippet || 'shared an update on Team Feed',
    entityType: 'feed',
    entityId: post._id,
    sender: authorId
  });
}

const feedUploadDir = path.join(__dirname, '..', 'uploads', 'feed');
if (!fs.existsSync(feedUploadDir)) fs.mkdirSync(feedUploadDir, { recursive: true });

const feedStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, feedUploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const feedUpload = multer({ storage: feedStorage, limits: { fileSize: 50 * 1024 * 1024 } });

// GET /api/v1/feed — list posts (with filters)
router.get('/', protect, async (req, res) => {
  try {
    const { audience, pinned, before, limit = 30 } = req.query;

    let query = { isActive: true };

    // Audience: company = all, team = user's teams
    if (audience === 'team') {
      query.audience = 'team';
      query.team = { $in: req.user.teams || [] };
    } else if (pinned === 'true') {
      query.pinnedBy = req.user._id;
    } else {
      query.$or = [
        { audience: 'company' },
        { audience: 'team', team: { $in: req.user.teams || [] } }
      ];
    }

    if (before) query.createdAt = { $lt: new Date(before) };

    const posts = await TeamFeedPost.find(query)
      .populate('author', 'name avatar jobTitle')
      .populate('comments.author', 'name avatar')
      .populate('team', 'name')
      .populate('reactions.users', 'name avatar')
      .populate('comments.reactions.users', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json(posts);
  } catch (err) {
    console.error('List feed error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/feed/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const post = await TeamFeedPost.findById(req.params.id)
      .populate('author', 'name avatar jobTitle')
      .populate('comments.author', 'name avatar')
      .populate('team', 'name')
      .populate('reactions.users', 'name avatar')
      .populate('comments.reactions.users', 'name avatar');
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/feed — create post (anyone can)
router.post('/', protect, async (req, res) => {
  try {
    const { content, contentType, media, linkPreview, audience, team } = req.body;

    const post = await TeamFeedPost.create({
      content: content || '',
      contentType: contentType || 'text',
      media: media || undefined,
      linkPreview: linkPreview || undefined,
      audience: audience || 'company',
      team: audience === 'team' ? team : undefined,
      author: req.user._id
    });

    const populated = await TeamFeedPost.findById(post._id)
      .populate('author', 'name avatar jobTitle')
      .populate('team', 'name');

    // Live socket fanout + DB notification + push for all audience members
    const io = req.app.get('io');
    if (io) io.emit('feed:new', { postId: post._id, author: req.user.name });
    fanoutFeedPost(io, post, req.user._id, req.user.name).catch(e => console.warn('feed fanout failed:', e.message));

    res.status(201).json(populated);
  } catch (err) {
    console.error('Create feed post error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/feed/with-media — create post with file upload (image/video/file)
router.post('/with-media', protect, feedUpload.single('media'), async (req, res) => {
  try {
    const { content, audience, team } = req.body;

    let contentType = 'text';
    let media = undefined;
    if (req.file) {
      const mime = req.file.mimetype;
      if (mime.startsWith('image/')) contentType = 'image';
      else if (mime.startsWith('video/')) contentType = 'video';
      else contentType = 'file';

      media = {
        url: `/uploads/feed/${req.file.filename}`,
        name: req.file.originalname,
        mimeType: req.file.mimetype,
        path: 'uploads/feed/' + req.file.filename
      };
    }

    const post = await TeamFeedPost.create({
      content: content || '',
      contentType,
      media,
      audience: audience || 'company',
      team: audience === 'team' ? team : undefined,
      author: req.user._id
    });

    const populated = await TeamFeedPost.findById(post._id)
      .populate('author', 'name avatar jobTitle');

    const io = req.app.get('io');
    if (io) io.emit('feed:new', { postId: post._id, author: req.user.name });
    fanoutFeedPost(io, post, req.user._id, req.user.name).catch(e => console.warn('feed fanout failed:', e.message));

    res.status(201).json(populated);
  } catch (err) {
    console.error('Feed media post error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/feed/:id — edit post (author only)
router.put('/:id', protect, async (req, res) => {
  try {
    const post = await TeamFeedPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the author can edit.' });
    }

    const { content, contentType, media, linkPreview } = req.body;
    if (content !== undefined) post.content = content;
    if (contentType) post.contentType = contentType;
    if (media !== undefined) post.media = media;
    if (linkPreview !== undefined) post.linkPreview = linkPreview;
    await post.save();

    const populated = await TeamFeedPost.findById(post._id)
      .populate('author', 'name avatar jobTitle');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/feed/:id/react — toggle reaction
router.post('/:id/react', protect, async (req, res) => {
  try {
    const { emoji } = req.body;
    const post = await TeamFeedPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found.' });

    const existing = post.reactions.find(r => r.emoji === emoji);
    if (existing) {
      if (existing.users.includes(req.user._id)) {
        existing.users = existing.users.filter(u => u.toString() !== req.user._id.toString());
        if (existing.users.length === 0) {
          post.reactions = post.reactions.filter(r => r.emoji !== emoji);
        }
      } else {
        existing.users.push(req.user._id);
      }
    } else {
      post.reactions.push({ emoji, users: [req.user._id] });
    }
    await post.save();
    // Return reactions with users populated so the client can show names in
    // the "who reacted" popover
    const populated = await TeamFeedPost.findById(post._id)
      .populate('reactions.users', 'name avatar');
    res.json(populated.reactions);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/feed/:id/comment — add comment
router.post('/:id/comment', protect, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Content required.' });

    const post = await TeamFeedPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found.' });

    post.comments.push({ author: req.user._id, content: content.trim() });
    await post.save();

    const updated = await TeamFeedPost.findById(post._id)
      .populate('comments.author', 'name avatar');
    res.json(updated.comments);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/v1/feed/:id/comment/:commentId — delete own comment
router.delete('/:id/comment/:commentId', protect, async (req, res) => {
  try {
    const post = await TeamFeedPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found.' });

    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ error: 'Comment not found.' });
    if (comment.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Can only delete own comments.' });
    }

    post.comments.pull(req.params.commentId);
    await post.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/feed/:id/pin — toggle personal pin
router.post('/:id/pin', protect, async (req, res) => {
  try {
    const post = await TeamFeedPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found.' });

    const isPinned = post.pinnedBy.some(id => id.toString() === req.user._id.toString());
    if (isPinned) {
      post.pinnedBy = post.pinnedBy.filter(id => id.toString() !== req.user._id.toString());
    } else {
      post.pinnedBy.push(req.user._id);
    }
    await post.save();
    res.json({ pinned: !isPinned });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/v1/feed/:id — delete post (author or admin)
router.delete('/:id', protect, async (req, res) => {
  try {
    const post = await TeamFeedPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found.' });

    if (post.author.toString() !== req.user._id.toString() && !['main_admin', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Cannot delete this post.' });
    }
    post.isActive = false;
    await post.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
