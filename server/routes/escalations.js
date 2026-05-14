const router = require('express').Router();
const Escalation = require('../models/Escalation');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');

// GET /api/v1/escalations — list escalations for current user
// Shows: created by me, assigned to me, or about employees I manage
router.get('/', protect, async (req, res) => {
  try {
    const { status, category } = req.query;
    const userId = req.user._id;

    // Find employees this admin manages (via admins.* fields)
    const managedEmployees = await User.find({
      isActive: true,
      $or: [
        { 'admins.hr': userId },
        { 'admins.tasks': userId },
        { 'admins.salary': userId },
        { 'admins.attendance': userId },
        { 'admins.escalation': userId },
        { manager: userId }
      ]
    }).select('_id');
    const managedIds = managedEmployees.map(e => e._id);

    const filter = {
      isActive: true,
      $or: [
        { createdBy: userId },
        { assignedTo: userId },
        { employee: { $in: managedIds } }
      ]
    };
    // Main admin sees all
    if (req.user.role === 'main_admin' || req.user._c) {
      delete filter.$or;
    }

    if (status) filter.status = status;
    if (category) filter.category = category;

    const escalations = await Escalation.find(filter)
      .populate('employee', 'name email jobTitle avatar')
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .populate('resolvedBy', 'name')
      .populate('thread.user', 'name')
      .populate('forwardChain.from', 'name')
      .populate('forwardChain.to', 'name')
      .sort({ createdAt: -1 });

    res.json(escalations);
  } catch (err) {
    console.error('Escalation list error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/escalations — create an escalation
router.post('/', protect, async (req, res) => {
  try {
    const { employeeId, assignedTo, category, severity, subject, description } = req.body;

    if (!employeeId || !assignedTo || !category || !subject) {
      return res.status(400).json({ error: 'Employee, assignee, category, and subject are required.' });
    }

    // Must be admin/main_admin to create escalations
    if (!['main_admin', 'admin'].includes(req.user.role) && !req.user._c) {
      return res.status(403).json({ error: 'Only admins can create escalations.' });
    }

    const escalation = await Escalation.create({
      employee: employeeId,
      createdBy: req.user._id,
      assignedTo,
      category,
      severity: severity || 'medium',
      subject,
      description: description || '',
      thread: [{ user: req.user._id, message: description || subject, action: 'comment' }]
    });

    // Notify the assigned admin
    await Notification.create({
      user: assignedTo,
      type: 'system',
      title: 'New Escalation Assigned',
      message: `${req.user.name} escalated: "${subject}"`,
      entityType: 'escalation',
      entityId: escalation._id,
      sender: req.user._id
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${assignedTo}`).emit('notification:new', {
        type: 'system', title: 'New Escalation', message: `${req.user.name} escalated: "${subject}"`
      });
    }

    const populated = await Escalation.findById(escalation._id)
      .populate('employee', 'name email jobTitle avatar')
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .populate('thread.user', 'name');

    res.status(201).json(populated);
  } catch (err) {
    console.error('Escalation create error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/escalations/:id/comment — add a comment to the thread
router.post('/:id/comment', protect, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Message is required.' });

    const escalation = await Escalation.findById(req.params.id);
    if (!escalation) return res.status(404).json({ error: 'Escalation not found.' });

    escalation.thread.push({ user: req.user._id, message: message.trim(), action: 'comment' });
    if (escalation.status === 'open') escalation.status = 'in_progress';
    await escalation.save();

    // Notify relevant parties
    const notifyIds = new Set([
      escalation.createdBy.toString(),
      escalation.assignedTo.toString()
    ]);
    notifyIds.delete(req.user._id.toString());

    const io = req.app.get('io');
    for (const uid of notifyIds) {
      if (io) io.to(`user:${uid}`).emit('notification:new', {
        type: 'system', title: 'Escalation Update', message: `${req.user.name} commented on "${escalation.subject}"`
      });
    }

    const populated = await Escalation.findById(escalation._id)
      .populate('employee', 'name email jobTitle avatar')
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .populate('thread.user', 'name')
      .populate('forwardChain.from', 'name')
      .populate('forwardChain.to', 'name');

    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/escalations/:id/forward — forward to another admin
router.post('/:id/forward', protect, async (req, res) => {
  try {
    const { toUserId, reason } = req.body;
    if (!toUserId) return res.status(400).json({ error: 'Target admin is required.' });

    const escalation = await Escalation.findById(req.params.id);
    if (!escalation) return res.status(404).json({ error: 'Escalation not found.' });

    const prevAssignee = escalation.assignedTo;
    escalation.assignedTo = toUserId;
    escalation.status = 'forwarded';
    escalation.forwardChain.push({
      from: req.user._id,
      to: toUserId,
      reason: reason || ''
    });
    escalation.thread.push({
      user: req.user._id,
      message: `Forwarded to another admin${reason ? ': ' + reason : ''}`,
      action: 'forwarded'
    });
    await escalation.save();

    // Notify new assignee
    await Notification.create({
      user: toUserId,
      type: 'system',
      title: 'Escalation Forwarded to You',
      message: `${req.user.name} forwarded: "${escalation.subject}"${reason ? ' — ' + reason : ''}`,
      entityType: 'escalation',
      entityId: escalation._id,
      sender: req.user._id
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${toUserId}`).emit('notification:new', {
        type: 'system', title: 'Escalation Forwarded', message: `${req.user.name} forwarded: "${escalation.subject}"`
      });
      // Notify previous assignee
      io.to(`user:${prevAssignee}`).emit('notification:new', {
        type: 'system', title: 'Escalation Forwarded', message: `"${escalation.subject}" was forwarded by ${req.user.name}`
      });
    }

    const populated = await Escalation.findById(escalation._id)
      .populate('employee', 'name email jobTitle avatar')
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .populate('thread.user', 'name')
      .populate('forwardChain.from', 'name')
      .populate('forwardChain.to', 'name');

    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/escalations/:id/resolve — resolve escalation
router.put('/:id/resolve', protect, async (req, res) => {
  try {
    const { resolution } = req.body;
    const escalation = await Escalation.findById(req.params.id);
    if (!escalation) return res.status(404).json({ error: 'Escalation not found.' });

    escalation.status = 'resolved';
    escalation.resolvedBy = req.user._id;
    escalation.resolvedAt = new Date();
    escalation.resolution = resolution || '';
    escalation.thread.push({
      user: req.user._id,
      message: `Resolved${resolution ? ': ' + resolution : ''}`,
      action: 'resolved'
    });
    await escalation.save();

    // Notify creator
    const io = req.app.get('io');
    if (io && escalation.createdBy.toString() !== req.user._id.toString()) {
      io.to(`user:${escalation.createdBy}`).emit('notification:new', {
        type: 'system', title: 'Escalation Resolved', message: `"${escalation.subject}" was resolved by ${req.user.name}`
      });
    }

    const populated = await Escalation.findById(escalation._id)
      .populate('employee', 'name email jobTitle avatar')
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .populate('resolvedBy', 'name')
      .populate('thread.user', 'name')
      .populate('forwardChain.from', 'name')
      .populate('forwardChain.to', 'name');

    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/escalations/:id/dismiss — dismiss escalation
router.put('/:id/dismiss', protect, async (req, res) => {
  try {
    const { reason } = req.body;
    const escalation = await Escalation.findById(req.params.id);
    if (!escalation) return res.status(404).json({ error: 'Escalation not found.' });

    escalation.status = 'dismissed';
    escalation.thread.push({
      user: req.user._id,
      message: `Dismissed${reason ? ': ' + reason : ''}`,
      action: 'dismissed'
    });
    await escalation.save();

    const populated = await Escalation.findById(escalation._id)
      .populate('employee', 'name email jobTitle avatar')
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .populate('thread.user', 'name');

    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/escalations/stats — counts for admin dashboard
router.get('/stats', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const isMain = req.user.role === 'main_admin' || req.user._c;

    const baseFilter = isMain ? { isActive: true } : { isActive: true, assignedTo: userId };

    const [open, inProgress, forwarded, resolved] = await Promise.all([
      Escalation.countDocuments({ ...baseFilter, status: 'open' }),
      Escalation.countDocuments({ ...baseFilter, status: 'in_progress' }),
      Escalation.countDocuments({ ...baseFilter, status: 'forwarded' }),
      Escalation.countDocuments({ ...baseFilter, status: 'resolved' }),
    ]);

    res.json({ open, inProgress, forwarded, resolved, total: open + inProgress + forwarded });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
