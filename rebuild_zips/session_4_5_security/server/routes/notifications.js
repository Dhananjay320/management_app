const router = require('express').Router();
const Notification = require('../models/Notification');
const User = require('../models/User');
const { protect, requirePower } = require('../middleware/auth');

// GET /api/v1/notifications — list notifications (with filters)
router.get('/', protect, async (req, res) => {
  try {
    const { type, unreadOnly, limit = 50, before } = req.query;

    let query = { user: req.user._id };
    if (type) query.type = type;
    if (unreadOnly === 'true') query.isRead = false;
    if (before) query.createdAt = { $lt: new Date(before) };

    const notifications = await Notification.find(query)
      .populate('sender', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json(notifications);
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/notifications/unread-count — badge counts
router.get('/unread-count', protect, async (req, res) => {
  try {
    const total = await Notification.countDocuments({ user: req.user._id, isRead: false });

    const grouped = await Notification.aggregate([
      { $match: { user: req.user._id, isRead: false } },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    const emergencyUnacked = await Notification.countDocuments({
      user: req.user._id, isEmergency: true, acknowledgedAt: null
    });

    const byType = {};
    grouped.forEach(g => { byType[g._id] = g.count; });

    res.json({ total, byType, emergencyUnacked });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/notifications/:id/read — mark single as read
router.put('/:id/read', protect, async (req, res) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isRead: true }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/notifications/read-all — mark all as read (optionally by type)
router.put('/read-all', protect, async (req, res) => {
  try {
    const { type } = req.body;
    const filter = { user: req.user._id, isRead: false };
    if (type) filter.type = type;
    await Notification.updateMany(filter, { isRead: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/notifications/:id/dismiss — dismiss (hide from stack)
router.put('/:id/dismiss', protect, async (req, res) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isDismissed: true }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/notifications/:id/acknowledge — acknowledge emergency
router.put('/:id/acknowledge', protect, async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id, user: req.user._id, isEmergency: true
    });
    if (!notification) return res.status(404).json({ error: 'Emergency notification not found.' });

    notification.acknowledgedAt = new Date();
    notification.isRead = true;
    notification.isDismissed = true;
    await notification.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/v1/notifications/clear — clear all (non-emergency)
router.delete('/clear', protect, async (req, res) => {
  try {
    const { type } = req.query;
    const filter = { user: req.user._id, isEmergency: false };
    if (type) filter.type = type;
    await Notification.deleteMany(filter);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/v1/notifications/:id — delete single
router.delete('/:id', protect, async (req, res) => {
  try {
    const notification = await Notification.findOne({ _id: req.params.id, user: req.user._id });
    if (!notification) return res.status(404).json({ error: 'Notification not found.' });
    if (notification.isEmergency && !notification.acknowledgedAt) {
      return res.status(400).json({ error: 'Cannot delete unacknowledged emergency alert.' });
    }
    await Notification.deleteOne({ _id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ══════════════════════════════════════
//  DND (Do Not Disturb) — Spec Section 16
// ══════════════════════════════════════

// GET /api/v1/notifications/dnd — get DND status
router.get('/dnd', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('dnd settings');

    // Check if DND has expired
    if (user.dnd?.active && user.dnd.until && new Date(user.dnd.until) < new Date()) {
      user.dnd.active = false;
      user.dnd.until = null;
      user.dnd.reason = null;
      await user.save();
    }

    res.json({
      active: user.dnd?.active || false,
      until: user.dnd?.until,
      reason: user.dnd?.reason,
      mentionBreaksDND: user.settings?.mentionBreaksDND ?? true,
      autoDND: user.settings?.autoDND ?? true
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/notifications/dnd — toggle DND with optional duration
router.put('/dnd', protect, async (req, res) => {
  try {
    const { active, durationMinutes, reason } = req.body;
    const update = {
      'dnd.active': active,
      'dnd.reason': reason || 'manual'
    };

    if (active && durationMinutes) {
      update['dnd.until'] = new Date(Date.now() + durationMinutes * 60000);
    } else if (!active) {
      update['dnd.until'] = null;
      update['dnd.reason'] = null;
    }

    await User.findByIdAndUpdate(req.user._id, update);
    res.json({ ok: true, active, until: update['dnd.until'] });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ══════════════════════════════════════
//  SEND NOTIFICATIONS (used by admins)
// ══════════════════════════════════════

// POST /api/v1/notifications/send — send notification to user(s)
// S6: Requires 'notifications.sendSystem' power (or main_admin). Without this
// check, any authenticated user could send spoofed "salary", "announcement",
// or "security" notifications to any other user. Audit doc Section 15 bug.
router.post('/send', protect, async (req, res) => {
  try {
    const { userIds, type, title, message, icon, actionType, actionTarget, entityType, entityId, isEmergency } = req.body;

    // S6: power gate
    const isMainAdmin = req.user.role === 'main_admin';
    const hasSendPower = req.user.hasPower && req.user.hasPower('notifications', 'sendSystem');
    if (!isMainAdmin && !hasSendPower) {
      return res.status(403).json({ error: 'You do not have permission to send system notifications.' });
    }

    // Emergency requires power
    if (isEmergency && !req.user.hasPower('emergency', 'sendAlert')) {
      return res.status(403).json({ error: 'No permission to send emergency alerts.' });
    }

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'userIds must be a non-empty array.' });
    }

    const notifications = [];
    const io = req.app.get('io');

    for (const userId of userIds) {
      const notif = await Notification.create({
        user: userId,
        type: type || 'system',
        title, message, icon,
        actionType, actionTarget,
        entityType, entityId,
        isEmergency: isEmergency || false,
        sender: req.user._id
      });

      notifications.push(notif);

      // Check DND before emitting (emergency ignores DND, @mention may break DND)
      const targetUser = await User.findById(userId).select('dnd settings');
      const isDND = targetUser?.dnd?.active && (!targetUser.dnd.until || new Date(targetUser.dnd.until) > new Date());
      const isMention = type === 'mention';
      const mentionBreaksDND = targetUser?.settings?.mentionBreaksDND !== false;

      const shouldEmit = isEmergency || !isDND || (isMention && mentionBreaksDND);

      // Emit via socket (respecting DND)
      if (io && shouldEmit) {
        const eventName = isEmergency ? 'notification:emergency' : 'notification:new';
        io.to(`user:${userId}`).emit(eventName, {
          _id: notif._id,
          type: notif.type,
          title: notif.title,
          message: notif.message,
          icon: notif.icon,
          isEmergency: notif.isEmergency,
          actionType: notif.actionType,
          sender: { _id: req.user._id, name: req.user.name },
          createdAt: notif.createdAt
        });
      }
    }

    res.status(201).json({ sent: notifications.length });
  } catch (err) {
    console.error('Send notification error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/notifications/emergency — send emergency alert (special endpoint)
router.post('/emergency', protect, requirePower('emergency', 'sendAlert'), async (req, res) => {
  try {
    const { title, message, userIds } = req.body;

    // If no specific users, send to all active users
    let targets = userIds;
    if (!targets || targets.length === 0) {
      const allUsers = await User.find({ isActive: true }).select('_id');
      targets = allUsers.map(u => u._id);
    }

    const io = req.app.get('io');

    for (const userId of targets) {
      const notif = await Notification.create({
        user: userId,
        type: 'emergency',
        title: title || 'Emergency Alert',
        message,
        isEmergency: true,
        sender: req.user._id
      });

      if (io) {
        io.to(`user:${userId}`).emit('notification:emergency', {
          _id: notif._id,
          type: 'emergency',
          title: notif.title,
          message: notif.message,
          isEmergency: true,
          sender: { _id: req.user._id, name: req.user.name },
          createdAt: notif.createdAt
        });
      }
    }

    res.status(201).json({ sent: targets.length });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
