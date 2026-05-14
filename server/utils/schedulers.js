const Attendance = require('../models/Attendance');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { isOffDay, getCompanyDefaultOffDays } = require('./workCalendar');
const CalendarEvent = require('../models/CalendarEvent');

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// Cheap pre-check at the top of each scheduler: skip entirely if today is a
// company-wide holiday or matches the company default off-days. (Per-user
// overrides still get applied to specific notifications below.)
async function isCompanyHolidayOrOff(date = new Date()) {
  try {
    const dow = date.getDay();
    const defaults = await getCompanyDefaultOffDays();
    if (defaults.includes(dow)) return true;
    const ev = await CalendarEvent.findOne({
      type: 'holiday',
      date: date.toISOString().split('T')[0],
      isCompanyWide: true
    }).select('_id').lean();
    return !!ev;
  } catch { return false; }
}

// ─── No-Entry Alert Scheduler ───
// Runs at 10:30 AM — notifies HR about employees who haven't marked entry
function startNoEntryAlertScheduler(io) {
  setInterval(async () => {
    const now = new Date();
    if (now.getHours() !== 10 || now.getMinutes() !== 30) return;
    if (await isCompanyHolidayOrOff(now)) return; // skip on company off-days

    try {
      const date = todayStr();
      const markedIds = (await Attendance.find({ date, entryTime: { $ne: null } }).select('user')).map(r => r.user.toString());

      const unmarked = await User.find({
        _id: { $nin: markedIds },
        isActive: true,
        workType: { $ne: 'full_remote' }
      }).select('name teams office weeklyOffDays');

      if (unmarked.length === 0) return;

      // Filter out users whose individual off-day override falls on today
      const filtered = [];
      for (const emp of unmarked) {
        if (await isOffDay(emp, now)) continue;
        filtered.push(emp);
      }
      if (filtered.length === 0) return;

      // Find HR users (those with attendance.forwardAlerts power)
      const hrUsers = await User.find({
        isActive: true,
        $or: [
          { role: 'main_admin' },
          { 'powers.attendance.forwardAlerts': true }
        ]
      }).select('_id');

      for (const emp of filtered) {
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
      console.log(`No-entry alerts sent for ${filtered.length} employees`);
    } catch (err) {
      console.error('No-entry alert scheduler error:', err);
    }
  }, 60000); // Check every minute
}

// ─── Wrap-Up Reminder Scheduler ───
// Admin-configurable: rings the bell at CompanyInfo.wrapUpBellHour (default 6 PM)
// Then every 30 min after, escalating tone.
function startWrapUpReminderScheduler(io) {
  setInterval(async () => {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();

    const CompanyInfo = require('../models/CompanyInfo');
    const cfg = await CompanyInfo.findOne().select('wrapUpBellHour wrapUpBellMinute').catch(() => null);
    const bellHour = cfg?.wrapUpBellHour ?? 17;
    const bellMinute = cfg?.wrapUpBellMinute ?? 50;

    // Bell fires at the exact configured time (any minute)
    const isBellTime = hour === bellHour && minute === bellMinute;
    // Reminders continue at :00 and :30 after the bell
    const isReminderTime = (minute === 0 || minute === 30) &&
      (hour > bellHour || (hour === bellHour && minute > bellMinute));
    if (!isBellTime && !isReminderTime) return;

    if (await isCompanyHolidayOrOff(now)) return;

    try {
      const date = todayStr();
      const unwrapped = await Attendance.find({
        date,
        entryTime: { $ne: null },
        wrapUpTime: null
      }).populate('user', '_id name teams office weeklyOffDays');

      for (const record of unwrapped) {
        if (!record.user) continue;
        if (await isOffDay(record.user, now)) continue;

        let title = "🔔 Don't forget to wrap up your day.";
        let isAutoWrapUp = false;
        let ringBell = isBellTime; // only at the exact bell time

        if (hour === 19 && minute === 30) {
          title = 'Stronger reminder: please wrap up your day now.';
        } else if (hour >= 20) {
          title = 'Auto wrap-up will trigger soon. Wrap up now or it will be done automatically.';
          isAutoWrapUp = true;
        }

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
            message: title,
            // Client uses this to play the bell sound. Suppressed on mobile WebView.
            playSound: ringBell
          });
        }
      }
    } catch (err) {
      console.error('Wrap-up reminder scheduler error:', err);
    }
  }, 60000);
}

// ─── Meeting Unseen Alert Scheduler ───
// Per spec Section 9.4: If attendee hasn't seen invite 2 min before start, notify organizer
function startMeetingUnseenAlertScheduler(io) {
  const { Meeting } = require('../models/Meeting');
  setInterval(async () => {
    try {
      const now = new Date();
      if (await isCompanyHolidayOrOff(now)) return;
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

// ─── Task Deadline Reminder Scheduler ───
function startTaskDeadlineReminderScheduler(io) {
  const Task = require('../models/Task');
  setInterval(async () => {
    try {
      const now = new Date();
      if (await isCompanyHolidayOrOff(now)) return;
      const timeNow = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const today = now.toISOString().split('T')[0];

      // Find tasks with deadline today + matching time + not yet reminded
      const tasks = await Task.find({
        deadline: { $gte: new Date(today), $lt: new Date(today + 'T23:59:59') },
        deadlineTime: timeNow,
        reminderSent: { $ne: true },
        status: { $nin: ['done', 'cancelled'] },
        isActive: true
      }).populate('assignees', '_id name teams office weeklyOffDays');

      for (const task of tasks) {
        task.reminderSent = true;
        await task.save();

        for (const assignee of (task.assignees || [])) {
          if (await isOffDay(assignee, now)) continue;
          if (io) {
            io.to(`user:${assignee._id}`).emit('notification:new', {
              type: 'task',
              title: '⏰ Task Deadline Reminder',
              message: `"${task.title}" is due now!`,
              entityType: 'task',
              entityId: task._id
            });
          }

          try {
            await Notification.create({
              user: assignee._id,
              type: 'task',
              title: '⏰ Task Deadline Reminder',
              message: `"${task.title}" is due now!`,
              entityType: 'task',
              entityId: task._id
            });
          } catch {}
        }
      }

      // Also send reminders for tasks with deadline today but no specific time (send at 9 AM)
      if (timeNow === '09:00') {
        const dayTasks = await Task.find({
          deadline: { $gte: new Date(today), $lt: new Date(today + 'T23:59:59') },
          deadlineTime: { $exists: false },
          reminderSent: { $ne: true },
          status: { $nin: ['done', 'cancelled'] },
          isActive: true
        }).populate('assignees', '_id name teams office weeklyOffDays');

        for (const task of dayTasks) {
          task.reminderSent = true;
          await task.save();

          for (const assignee of (task.assignees || [])) {
            if (await isOffDay(assignee, now)) continue;
            if (io) {
              io.to(`user:${assignee._id}`).emit('notification:new', {
                type: 'task',
                title: '📅 Task Due Today',
                message: `"${task.title}" is due today!`,
                entityType: 'task',
                entityId: task._id
              });
            }
          }
        }
      }
    } catch (err) {
      console.error('Task deadline reminder error:', err);
    }
  }, 60000);
}

// ─── Overdue Task Notification Scheduler ───
// Runs every hour — checks for tasks past their deadline that aren't completed
function startOverdueTaskScheduler(io) {
  setInterval(async () => {
    try {
      const Task = require('../models/Task');
      const now = new Date();
      if (await isCompanyHolidayOrOff(now)) return;

      // Find tasks that are overdue (deadline passed, not done/cancelled, not already notified for overdue)
      const overdueTasks = await Task.find({
        isActive: true,
        deadline: { $lt: now },
        status: { $nin: ['done', 'cancelled'] },
        _overdueNotified: { $ne: true }
      }).populate('assignees', 'name teams office weeklyOffDays').select('title deadline assignees createdBy');

      for (const task of overdueTasks) {
        // Notify all assignees
        for (const assignee of (task.assignees || [])) {
          const uid = assignee._id || assignee;
          if (await isOffDay(assignee, now)) continue;
          await Notification.create({
            user: uid,
            type: 'task',
            title: 'Task Overdue',
            message: `"${task.title}" was due on ${new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} and is not yet completed.`,
            entityType: 'task',
            entityId: task._id,
            isEmergency: false
          }).catch(() => {});

          if (io) {
            io.to(`user:${uid}`).emit('notification:new', {
              type: 'task',
              title: 'Task Overdue',
              message: `"${task.title}" deadline has passed — please complete or update status.`,
              entityType: 'task',
              entityId: task._id
            });
          }
        }

        // Also notify the creator if different from assignees
        if (task.createdBy) {
          const creatorId = task.createdBy.toString();
          const isAssignee = task.assignees?.some(a => (a._id || a).toString() === creatorId);
          if (!isAssignee) {
            await Notification.create({
              user: creatorId, type: 'task', title: 'Task Overdue',
              message: `"${task.title}" assigned to ${task.assignees.map(a => a.name).join(', ')} is overdue.`,
              entityType: 'task', entityId: task._id
            }).catch(() => {});
          }
        }

        // Mark as notified so we don't spam
        await Task.findByIdAndUpdate(task._id, { _overdueNotified: true });
      }
    } catch (err) {
      console.error('Overdue task scheduler error:', err.message);
    }
  }, 60 * 60 * 1000); // Every hour
}

// ─── Monthly Salary Generation ───
// On the 1st of each month at 01:00 (server-local time), auto-generate salary
// records for the PREVIOUS month for every active employee with a base salary.
function startMonthlySalaryScheduler() {
  setInterval(async () => {
    const now = new Date();
    if (now.getDate() !== 1) return;
    if (now.getHours() !== 1 || now.getMinutes() !== 0) return;

    try {
      // Compute previous month
      const ref = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const month = ref.getMonth() + 1;
      const year = ref.getFullYear();

      const { generateForAllUsers } = require('./salaryGenerator');
      const result = await generateForAllUsers(month, year);
      console.log(`[salary] auto-generated ${result.generated}/${result.total} salaries for ${year}-${String(month).padStart(2, '0')} (${result.failed} failed)`);
    } catch (err) {
      console.error('Monthly salary scheduler error:', err);
    }
  }, 60000);
}

function startSchedulers(io) {
  startNoEntryAlertScheduler(io);
  startWrapUpReminderScheduler(io);
  startMeetingUnseenAlertScheduler(io);
  startTaskDeadlineReminderScheduler(io);
  startOverdueTaskScheduler(io);
  startNotificationCleanupScheduler();
  startDeepSearchCleanupScheduler();
  startMonthlySalaryScheduler();
  console.log('All schedulers started (attendance, meeting, task reminders, overdue tasks, retention cleanup, monthly salary)');
}

module.exports = { startSchedulers };
