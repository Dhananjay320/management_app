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

function startSchedulers(io) {
  startNoEntryAlertScheduler(io);
  startWrapUpReminderScheduler(io);
  console.log('Attendance schedulers started (no-entry alerts + wrap-up reminders)');
}

module.exports = { startSchedulers };
