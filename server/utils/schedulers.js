const Attendance = require('../models/Attendance');
const User = require('../models/User');
const Notification = require('../models/Notification');

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// ─── No-Entry Alert Scheduler ───
// Runs at 10:30 AM — notifies HR about employees who haven't marked entry
function startNoEntryAlertScheduler(io) {
  setInterval(async () => {
    const now = new Date();
    if (now.getHours() !== 10 || now.getMinutes() !== 30) return;

    try {
      const date = todayStr();
      const markedIds = (await Attendance.find({ date, entryTime: { $ne: null } }).select('user')).map(r => r.user.toString());

      const unmarked = await User.find({
        _id: { $nin: markedIds },
        isActive: true,
        workType: { $ne: 'full_remote' }
      }).select('name');

      if (unmarked.length === 0) return;

      // Find HR users (those with attendance.forwardAlerts power)
      const hrUsers = await User.find({
        isActive: true,
        $or: [
          { role: 'main_admin' },
          { 'powers.attendance.forwardAlerts': true }
        ]
      }).select('_id');

      for (const emp of unmarked) {
        for (const hr of hrUsers) {
          await Notification.create({
            user: hr._id,
            type: 'attendance',
            title: 'No-entry alert',
            message: `${emp.name} has not marked entry today.`,
            entityType: 'user',
            entityId: emp._id
          });

          if (io) {
            io.to(`user:${hr._id}`).emit('notification:new', {
              type: 'attendance',
              title: 'No-entry alert',
              message: `${emp.name} has not marked entry today.`
            });
          }
        }
      }
      console.log(`No-entry alerts sent for ${unmarked.length} employees`);
    } catch (err) {
      console.error('No-entry alert scheduler error:', err);
    }
  }, 60000); // Check every minute
}

// ─── Wrap-Up Reminder Scheduler ───
// After 5 PM, every 30 min, remind employees who haven't wrapped up
function startWrapUpReminderScheduler(io) {
  setInterval(async () => {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();

    // Only after 5 PM, at 0 and 30 minute marks
    if (hour < 17 || (minute !== 0 && minute !== 30)) return;

    try {
      const date = todayStr();
      // Find users who marked entry but haven't wrapped up
      const unwrapped = await Attendance.find({
        date,
        entryTime: { $ne: null },
        wrapUpTime: null
      }).populate('user', '_id name');

      for (const record of unwrapped) {
        if (!record.user) continue;

        let title = "Don't forget to wrap up your day.";
        let isAutoWrapUp = false;

        if (hour === 19 && minute === 30) {
          title = 'Stronger reminder: Please wrap up your day now.';
        } else if (hour >= 20) {
          title = 'Auto wrap-up will trigger soon. Wrap up now or it will be done automatically.';
          isAutoWrapUp = true;
        }

        // Create notification
        await Notification.create({
          user: record.user._id,
          type: 'attendance',
          title: 'Wrap-up Reminder',
          message: title,
          actionType: isAutoWrapUp ? 'acknowledge' : undefined
        });

        if (io) {
          io.to(`user:${record.user._id}`).emit('notification:new', {
            type: 'attendance',
            title: 'Wrap-up Reminder',
            message: title
          });
        }
      }
    } catch (err) {
      console.error('Wrap-up reminder scheduler error:', err);
    }
  }, 60000); // Check every minute
}

// ─── Meeting Unseen Alert Scheduler ───
// Per spec Section 9.4: If attendee hasn't seen invite 2 min before start, notify organizer
function startMeetingUnseenAlertScheduler(io) {
  const { Meeting } = require('../models/Meeting');
  setInterval(async () => {
    try {
      const now = new Date();
      const twoMinLater = new Date(now.getTime() + 2 * 60 * 1000);
      const today = now.toISOString().split('T')[0];
      const timeNow = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const timeTarget = `${String(twoMinLater.getHours()).padStart(2, '0')}:${String(twoMinLater.getMinutes()).padStart(2, '0')}`;

      const meetings = await Meeting.find({
        date: { $gte: new Date(today), $lte: new Date(today + 'T23:59:59') },
        startTime: timeTarget,
        status: 'scheduled',
        isActive: true
      }).populate('attendees.user', 'name').populate('createdBy', 'name');

      for (const meeting of meetings) {
        const unseen = meeting.attendees.filter(a => !a.hasSeen && a.user._id.toString() !== meeting.createdBy._id.toString());
        if (unseen.length > 0 && io) {
          const names = unseen.map(a => a.user.name).join(', ');
          io.to(`user:${meeting.createdBy._id}`).emit('notification:new', {
            type: 'meeting',
            title: 'Unseen Meeting Invite',
            message: `Heads up — ${names} hasn't seen the invite for "${meeting.title}" yet. You may want to reach out directly.`
          });
        }
      }
    } catch (err) {
      console.error('Meeting unseen alert error:', err);
    }
  }, 60000);
}

// ─── Notification Retention Cleanup ───
// Per spec: 3 months then auto-deleted
function startNotificationCleanupScheduler() {
  setInterval(async () => {
    try {
      const now = new Date();
      // Run once daily at 3 AM
      if (now.getHours() !== 3 || now.getMinutes() !== 0) return;
      const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const result = await Notification.deleteMany({ createdAt: { $lt: threeMonthsAgo }, type: { $ne: 'emergency' } });
      if (result.deletedCount > 0) console.log(`[Cleanup] Deleted ${result.deletedCount} old notifications`);
    } catch (err) {
      console.error('Notification cleanup error:', err);
    }
  }, 60000);
}

// ─── Deep Search Result Cleanup ───
// Per spec: 24 hours then auto-deleted
function startDeepSearchCleanupScheduler() {
  setInterval(async () => {
    try {
      const now = new Date();
      if (now.getHours() !== 3 || now.getMinutes() !== 5) return;
      const DeepSearchJob = require('../models/DeepSearchJob');
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const result = await DeepSearchJob.deleteMany({ createdAt: { $lt: oneDayAgo }, status: { $in: ['complete', 'cancelled'] } });
      if (result.deletedCount > 0) console.log(`[Cleanup] Deleted ${result.deletedCount} old deep search jobs`);
    } catch (err) {
      console.error('Deep search cleanup error:', err);
    }
  }, 60000);
}

function startSchedulers(io) {
  startNoEntryAlertScheduler(io);
  startWrapUpReminderScheduler(io);
  startMeetingUnseenAlertScheduler(io);
  startNotificationCleanupScheduler();
  startDeepSearchCleanupScheduler();
  console.log('All schedulers started (attendance, meeting alerts, retention cleanup)');
}

module.exports = { startSchedulers };
