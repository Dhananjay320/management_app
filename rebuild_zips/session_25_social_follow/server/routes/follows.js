// ============================================================================
// follows.js — REST API for user-to-user follows.
// ============================================================================
// Session 25 (N4). Endpoints:
//
//   POST   /follows                    — follow a user (or unfollow-then-refollow)
//   DELETE /follows/:id                — unfollow
//   GET    /follows/followers          — who follows me
//   GET    /follows/following          — who I follow
//   GET    /follows/count/:userId      — public counts for anyone's profile
//   GET    /follows/is-following/:userId — am I currently following :userId?
// ============================================================================

const router = require('express').Router();
const Follow = require('../models/Follow');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');

// Helper: is a follow currently effective? (active + not expired)
function isCurrent(follow) {
  if (!follow?.isActive) return false;
  if (!follow.endAt) return true;
  return new Date(follow.endAt).getTime() > Date.now();
}

// ─── POST / — follow a user ─────────────────────────────────────────────
router.post('/', protect, async (req, res) => {
  try {
    const { userId, endAt, note } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    if (String(userId) === String(req.user._id)) {
      return res.status(400).json({ error: 'You cannot follow yourself.' });
    }

    // Ensure target exists and is active.
    const target = await User.findById(userId);
    if (!target || !target.isActive) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Is there already an active follow? If so, just update it (refollow
    // after cancel is common). Otherwise create a new record.
    const existing = await Follow.findOne({
      follower: req.user._id,
      following: userId,
      isActive: true,
    });

    let follow;
    if (existing) {
      if (endAt !== undefined) existing.endAt = endAt ? new Date(endAt) : null;
      if (note !== undefined) existing.note = note;
      await existing.save();
      follow = existing;
    } else {
      follow = await Follow.create({
        follower: req.user._id,
        following: userId,
        endAt: endAt ? new Date(endAt) : null,
        note: note || '',
      });
    }

    // Notify the followed user — best-effort, never blocks primary action.
    // Dedupe: don't re-notify if we already notified for this record.
    if (!follow.notifiedAt) {
      try {
        await Notification.create({
          user: userId,
          type: 'follow',
          title: `${req.user.name} is following you`,
          message: note ? `Reason: ${note}` : 'You now appear on their Following feed.',
          entityType: 'user',
          entityId: req.user._id,
        });
        follow.notifiedAt = new Date();
        await follow.save();

        // Socket push if online
        const io = req.app.get('io');
        if (io) {
          io.to(`user:${userId}`).emit('notification:new', {
            type: 'follow',
            title: `${req.user.name} is following you`,
            message: note ? `Reason: ${note}` : '',
            entityType: 'user',
            entityId: String(req.user._id),
          });
        }
      } catch (e) {
        // Silently continue; notification failure must not block the follow
        console.warn('follow-notify failed:', e.message);
      }
    }

    const populated = await Follow.findById(follow._id)
      .populate('following', 'name email avatar jobTitle')
      .populate('follower',  'name email avatar jobTitle');

    res.status(201).json(populated);
  } catch (err) {
    console.error('follow error:', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// ─── DELETE /:id — unfollow ────────────────────────────────────────────
router.delete('/:id', protect, async (req, res) => {
  try {
    const follow = await Follow.findOne({
      _id: req.params.id,
      follower: req.user._id,
    });
    if (!follow) return res.status(404).json({ error: 'Not found.' });

    follow.isActive = false;
    await follow.save();
    res.json({ message: 'Unfollowed.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Shortcut: unfollow by target userId (convenient for "Unfollow" button on profile)
router.delete('/by-user/:userId', protect, async (req, res) => {
  try {
    const result = await Follow.updateMany(
      { follower: req.user._id, following: req.params.userId, isActive: true },
      { $set: { isActive: false } }
    );
    res.json({ message: 'Unfollowed.', count: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── GET /followers — users who follow me ──────────────────────────────
router.get('/followers', protect, async (req, res) => {
  try {
    const follows = await Follow.find({ following: req.user._id, isActive: true })
      .populate('follower', 'name email avatar jobTitle')
      .sort({ createdAt: -1 });
    // Filter out expired bounded follows
    res.json(follows.filter(isCurrent));
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── GET /following — users I follow ───────────────────────────────────
router.get('/following', protect, async (req, res) => {
  try {
    const follows = await Follow.find({ follower: req.user._id, isActive: true })
      .populate('following', 'name email avatar jobTitle')
      .sort({ createdAt: -1 });
    res.json(follows.filter(isCurrent));
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── GET /count/:userId — public counts for any user's profile ────────
router.get('/count/:userId', protect, async (req, res) => {
  try {
    const [followers, following] = await Promise.all([
      Follow.countDocuments({ following: req.params.userId, isActive: true }),
      Follow.countDocuments({ follower:  req.params.userId, isActive: true }),
    ]);
    res.json({ followers, following });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── GET /is-following/:userId — am I currently following X? ──────────
// Returns { isFollowing: boolean, followId?: string, endAt?: Date }
// Useful for the profile page to decide whether to show Follow or Unfollow.
router.get('/is-following/:userId', protect, async (req, res) => {
  try {
    const follow = await Follow.findOne({
      follower: req.user._id,
      following: req.params.userId,
      isActive: true,
    });
    if (!follow || !isCurrent(follow)) {
      return res.json({ isFollowing: false });
    }
    res.json({
      isFollowing: true,
      followId: follow._id,
      endAt: follow.endAt,
      note: follow.note,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
