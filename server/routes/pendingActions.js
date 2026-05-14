// Aggregated "Pending Actions" feed for the home dashboard.
// Returns a single list of things the current user needs to act on, across:
//  - Leave requests waiting for admin approval (if they are HR/manager/main_admin)
//  - Meeting invites the user hasn't responded to
//  - Salary disputes the user owns (open) — or assigned to them as approver
//  - Tasks assigned to them with deadline today/overdue
//  - Sent broadcasts / announcements that need acknowledgement (recent only)
const router = require('express').Router();
const { protect } = require('../middleware/auth');
const Leave = require('../models/Leave');
const User = require('../models/User');
const { Meeting } = require('../models/Meeting');
const Task = require('../models/Task');

router.get('/', protect, async (req, res) => {
  try {
    const me = req.user;
    const isMainAdmin = me.role === 'main_admin' || me._c;
    const isAdmin = isMainAdmin || me.role === 'admin';

    // 1) Leave approvals — admins see leaves where they're HR/manager
    let leaveItems = [];
    if (isAdmin) {
      // direct reports
      const directReportIds = (await User.find({ manager: me._id }).select('_id')).map(u => u._id);
      const hrTargetIds = (await User.find({ 'admins.hr': me._id }).select('_id')).map(u => u._id);
      const allTargetIds = isMainAdmin ? null : [me._id, ...directReportIds, ...hrTargetIds];
      const leaveFilter = { status: 'pending' };
      if (allTargetIds) leaveFilter.user = { $in: allTargetIds };
      const leaves = await Leave.find(leaveFilter).populate('user', 'name avatar').sort({ createdAt: -1 }).limit(10);
      leaveItems = leaves.map(l => ({
        kind: 'leave_approval',
        id: l._id,
        title: `${l.user?.name} requested ${l.type === 'half_day' ? 'half-day' : l.type} leave`,
        subtitle: `${l.startDate}${l.endDate !== l.startDate ? ` → ${l.endDate}` : ''}${l.reason ? ` · ${String(l.reason).slice(0, 60)}` : ''}`,
        ts: l.createdAt,
        link: '/admin/leaves',
        actor: l.user?.name,
        icon: '🛌'
      }));
    }

    // 2) Pending meeting invites (user is invited but hasn't accepted/declined)
    let meetingItems = [];
    try {
      const upcoming = await Meeting.find({
        'attendees.user': me._id,
        'attendees.response': { $in: ['pending', 'none', null, undefined] },
        date: { $gte: new Date(new Date().toISOString().split('T')[0]) },
        status: 'scheduled',
        isActive: true
      }).sort({ date: 1, startTime: 1 }).limit(10);

      meetingItems = upcoming
        .filter(mtg => {
          const myAtt = mtg.attendees.find(a => String(a.user) === String(me._id));
          return myAtt && (!myAtt.response || myAtt.response === 'pending');
        })
        .map(mtg => ({
          kind: 'meeting_invite',
          id: mtg._id,
          title: `Meeting: ${mtg.title}`,
          subtitle: `${mtg.date.toISOString().split('T')[0]} ${mtg.startTime}${mtg.endTime ? ` – ${mtg.endTime}` : ''}`,
          ts: mtg.createdAt,
          link: `/meetings?id=${mtg._id}`,
          icon: '👥'
        }));
    } catch (e) { /* meetings module may not exist */ }

    // 3) Tasks assigned to me, due today/overdue, not done
    let taskItems = [];
    try {
      const today = new Date(); today.setHours(23, 59, 59, 999);
      const tasks = await Task.find({
        assignees: me._id,
        status: { $nin: ['done', 'completed', 'cancelled'] },
        deadline: { $lte: today }
      }).sort({ deadline: 1 }).limit(10);
      taskItems = tasks.map(t => ({
        kind: 'task_due',
        id: t._id,
        title: t.title,
        subtitle: t.deadline ? (new Date(t.deadline) < new Date() ? '⚠️ Overdue' : 'Due today') + (t.priority ? ` · ${t.priority}` : '') : '',
        ts: t.createdAt,
        link: `/tasks?id=${t._id}`,
        icon: '✅'
      }));
    } catch (e) {}

    // 4) Salary disputes assigned to me as resolver / open ones I created
    let disputeItems = [];
    try {
      const { SalaryDispute } = require('../models/Salary');
      if (SalaryDispute) {
        const orFilter = [{ assignedTo: me._id }];
        if (isAdmin) orFilter.push({ status: 'open', assignedTo: null }); // unassigned + admin sees them
        const open = await SalaryDispute.find({ status: 'open', $or: orFilter })
          .populate('user', 'name')
          .sort({ createdAt: -1 }).limit(8);
        disputeItems = open.map(d => ({
          kind: 'salary_dispute',
          id: d._id,
          title: `💰 Salary dispute — ${d.user?.name || 'employee'}`,
          subtitle: `${d.month}/${d.year} · ${(d.reason || d.description || '').slice(0, 60)}`,
          ts: d.createdAt,
          link: '/salary',
          icon: '💰'
        }));
      }
    } catch (e) {}

    // 5) Today's reports from direct reports (manager view) or my missing report
    let reportItems = [];
    try {
      const Report = require('../models/Report');
      const todayStr = new Date().toISOString().split('T')[0];
      // If I have direct reports, show theirs that exist for today
      const directReportIds = (await User.find({ manager: me._id }).select('_id name')).map(u => u._id);
      if (directReportIds.length > 0) {
        const reports = await Report.find({ user: { $in: directReportIds }, date: todayStr })
          .populate('user', 'name')
          .sort({ updatedAt: -1 });
        // Map: who reported, who didn't
        const reportedIds = new Set(reports.map(r => String(r.user._id)));
        const missingNames = directReportIds.filter(id => !reportedIds.has(String(id)));
        const missingUsers = await User.find({ _id: { $in: missingNames } }).select('name');
        reports.forEach(r => {
          reportItems.push({
            kind: 'report',
            id: r._id,
            title: `📋 ${r.user?.name}'s daily report`,
            subtitle: (r.content || '').replace(/\s+/g, ' ').slice(0, 80),
            ts: r.updatedAt,
            link: '/reports',
            icon: '📋'
          });
        });
        if (missingUsers.length > 0) {
          reportItems.push({
            kind: 'report',
            id: 'missing-' + todayStr,
            title: `📋 Missing reports today (${missingUsers.length})`,
            subtitle: missingUsers.map(u => u.name).join(', ').slice(0, 100),
            ts: new Date(),
            link: '/reports',
            icon: '⚠️'
          });
        }
      } else {
        // Plain employee: nudge if I haven't posted today
        const mine = await Report.findOne({ user: me._id, date: todayStr });
        if (!mine) {
          reportItems.push({
            kind: 'report',
            id: 'me-missing-' + todayStr,
            title: '📋 Post your daily report',
            subtitle: 'You haven\'t shared today\'s update yet',
            ts: new Date(),
            link: '/reports',
            icon: '📋'
          });
        }
      }
    } catch (e) {}

    // 6) Recent announcements I haven't dismissed (last 7 days)
    let announcementItems = [];
    try {
      const Announcement = require('../models/Announcement');
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const list = await Announcement.find({
        isActive: true,
        createdAt: { $gte: weekAgo },
        dismissedBy: { $ne: me._id },
        $or: [
          { audience: 'company' },
          { audience: 'team', team: { $in: me.teams || [] } }
        ]
      }).populate('createdBy', 'name').sort({ createdAt: -1 }).limit(5);
      announcementItems = list.map(a => ({
        kind: 'announcement',
        id: a._id,
        title: `📢 ${a.title}`,
        subtitle: `From ${a.createdBy?.name || 'Admin'} · ${(a.content || '').slice(0, 80)}`,
        ts: a.createdAt,
        link: '/notifications',
        icon: '📢'
      }));
    } catch (e) {}

    // Merge + sort by ts desc, cap at 30
    const all = [...leaveItems, ...meetingItems, ...taskItems, ...disputeItems, ...reportItems, ...announcementItems];
    all.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    res.json({
      total: all.length,
      counts: {
        leave_approval: leaveItems.length,
        meeting_invite: meetingItems.length,
        task_due: taskItems.length,
        salary_dispute: disputeItems.length,
        report: reportItems.length,
        announcement: announcementItems.length
      },
      items: all.slice(0, 30)
    });
  } catch (e) {
    console.error('Pending actions error:', e);
    res.status(500).json({ error: e.message || 'Server error.' });
  }
});

module.exports = router;
