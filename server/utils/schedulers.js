const Attendance = require('../models/Attendance');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { isOffDay, getCompanyDefaultOffDays } = require('./workCalendar');
const CalendarEvent = require('../models/CalendarEvent');
const AppUsageSample = require('../models/AppUsageSample');
const AppCategory = require('../models/AppCategory');
const TeamAppOverride = require('../models/TeamAppOverride');
const CompanyMonitoring = require('../models/CompanyMonitoring');

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
  // Date string (YYYY-MM-DD) of the last day we fired the bell. Prevents a
  // mid-bell-minute server restart from re-ringing everyone after the natural
  // tick already fired. Lives in memory; reset on restart, which is fine —
  // we'd rather miss a "duplicate" fire than re-ring users.
  let lastBellFiredDate = null;

  const tick = async () => {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();

    const CompanyInfo = require('../models/CompanyInfo');
    const cfg = await CompanyInfo.findOne().select('wrapUpBellHour wrapUpBellMinute').catch(() => null);
    const bellHour = cfg?.wrapUpBellHour ?? 17;
    const bellMinute = cfg?.wrapUpBellMinute ?? 50;

    const todayKey = todayStr();
    const isBellTime = hour === bellHour && minute === bellMinute && lastBellFiredDate !== todayKey;
    // Reminders fire only in the 2 hours after the bell, at each :00 and :30
    // tick. Without this bound the previous code fired reminders all the way
    // until midnight (22:30, 23:00, 23:30 etc.) — which felt like spam.
    const minutesSinceBell = (hour - bellHour) * 60 + (minute - bellMinute);
    const isReminderTime = (minute === 0 || minute === 30) &&
      minutesSinceBell > 0 &&
      minutesSinceBell <= 120;
    if (!isBellTime && !isReminderTime) return;

    if (await isCompanyHolidayOrOff(now)) return;

    try {
      // Bell time: ring ALL active users (regardless of attendance state).
      // Reminders after bell: only nudge unwrapped attendees.
      let targets = [];
      if (isBellTime) {
        const User = require('../models/User');
        const users = await User.find({ isActive: true, _c: { $ne: true } })
          .select('_id name teams office weeklyOffDays');
        targets = users.map(u => ({ user: u }));
      } else {
        const date = todayStr();
        const unwrapped = await Attendance.find({
          date,
          entryTime: { $ne: null },
          wrapUpTime: null
        }).populate('user', '_id name teams office weeklyOffDays');
        targets = unwrapped;
      }

      for (const record of targets) {
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
          const payload = {
            type: 'attendance',
            title: ringBell ? '🔔 Wrap-up Bell' : 'Wrap-up Reminder',
            message: title,
            // Stable ID for client-side dedupe — one bell per calendar day.
            bellId: ringBell ? `wrapup-${todayKey}` : undefined
          };
          io.to(`user:${record.user._id}`).emit('notification:new', { ...payload, playSound: ringBell });
        }
      }
      // Mark today as fired AFTER we've finished emitting so we don't double-fire
      if (isBellTime) lastBellFiredDate = todayKey;
    } catch (err) {
      console.error('Wrap-up reminder scheduler error:', err);
    }
  };
  // Align to the top of each minute so a deploy mid-minute doesn't skip
  // the bell window. Fire immediately too in case we just crossed it.
  tick();
  const msToNextMinute = 60000 - (Date.now() % 60000);
  setTimeout(() => {
    tick();
    setInterval(tick, 60000);
  }, msToNextMinute);
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

// ─── Auto Wrap-Up Scheduler ───
// Per-user: each user has `settings.autoWrapUpTime` (default 20:00, HH:MM 24h).
// When their local-clock time hits that value, if they marked entry today but
// haven't wrapped up, the server wraps them up automatically. This is the
// safety net for people who forget — runs entirely on the backend so it works
// regardless of whether the app is open.
function startAutoWrapUpScheduler(io) {
  const tick = async () => {
    try {
      const date = todayStr();
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const CompanyInfo = require('../models/CompanyInfo');
      const cfg = await CompanyInfo.findOne().select('autoWrapUpTime').catch(() => null);
      const companyDefault = cfg?.autoWrapUpTime || '20:00';

      // Pull all attendance records that still need wrap-up today
      const open = await Attendance.find({
        date,
        entryTime: { $ne: null },
        wrapUpTime: null
      }).populate('user', '_id name settings admins manager weeklyOffDays');

      const Notification = require('../models/Notification');

      for (const record of open) {
        if (!record.user) continue;
        // Skip if user is off today (shouldn't normally have attendance row, but
        // belt-and-suspenders).
        if (await isOffDay(record.user, now)) continue;

        // Per-user setting overrides company default
        const target = record.user.settings?.autoWrapUpTime || companyDefault;
        // Trigger when current time >= target. Compare HH:MM strings lexically —
        // works because both are zero-padded 24h.
        if (hhmm < target) continue;

        // Do the wrap-up
        record.wrapUpTime = now;
        record.wrapUpMethod = 'auto';
        record.totalHours = Math.round((now - record.entryTime) / (1000 * 60 * 60) * 100) / 100;
        await record.save();

        const localTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        // Notify the user
        await Notification.create({
          user: record.user._id,
          type: 'attendance',
          title: 'Auto wrap-up',
          message: `You forgot to wrap up — we did it for you at ${localTime}. Total ${record.totalHours}h.`
        });
        if (io) {
          io.to(`user:${record.user._id}`).emit('notification:new', {
            type: 'attendance',
            title: 'Auto wrap-up',
            message: `You forgot to wrap up — we did it for you at ${localTime}.`
          });
        }

        // Notify the user's attendance admin + manager (same fan-out as manual wrap-up)
        const notifyIds = new Set();
        if (record.user.admins?.attendance) notifyIds.add(String(record.user.admins.attendance));
        if (record.user.manager) notifyIds.add(String(record.user.manager._id || record.user.manager));
        notifyIds.delete(String(record.user._id));
        for (const uid of notifyIds) {
          await Notification.create({
            user: uid,
            type: 'attendance',
            title: 'Auto wrap-up',
            message: `${record.user.name} was auto-wrapped at ${localTime} (no manual wrap-up).`
          });
          if (io) {
            io.to(`user:${uid}`).emit('notification:new', {
              type: 'attendance',
              title: 'Auto wrap-up',
              message: `${record.user.name} was auto-wrapped at ${localTime}.`
            });
          }
        }
      }
    } catch (err) {
      console.error('Auto wrap-up scheduler error:', err);
    }
  };
  // Aligned tick so a deploy mid-minute doesn't skip the trigger window.
  tick();
  const msToNextMinute = 60000 - (Date.now() % 60000);
  setTimeout(() => {
    tick();
    setInterval(tick, 60000);
  }, msToNextMinute);
}

// ─── Productivity Digest Scheduler ───
// Runs every minute. At 19:00 local time (configurable) it sends each active
// employee a notification summarising their day:
//   - Hours worked (entry → wrap-up or now)
//   - Top 3 productive apps (minutes each)
//   - Productivity % (productive / (total - uncategorized))
// Skipped if app-usage tracking is disabled company-wide, or if today is a
// holiday/off-day, or if the user has no data.
function startProductivityDigestScheduler(io) {
  const targetHour = 19; // 7 PM local
  const targetMinute = 0;

  const tick = async () => {
    try {
      const now = new Date();
      if (now.getHours() !== targetHour || now.getMinutes() !== targetMinute) return;
      if (await isCompanyHolidayOrOff(now)) return;

      const cfg = await CompanyMonitoring.findOne();
      if (!cfg?.appUsage?.enabled) return;

      const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);

      // Build app category map (global)
      const globals = await AppCategory.find().select('app category').lean();
      const globalMap = Object.fromEntries(globals.map(c => [c.app, c.category]));

      const users = await User.find({ isActive: true, _c: { $ne: true } }).select('_id name teams').lean();
      for (const u of users) {
        try {
          // Apply team overrides for this user
          let appMap = { ...globalMap };
          if (u.teams && u.teams.length) {
            const ovs = await TeamAppOverride.find({ team: { $in: u.teams } }).select('app category').lean();
            for (const o of ovs) appMap[o.app] = o.category;
          }

          const rows = await AppUsageSample.aggregate([
            { $match: { user: u._id, ts: { $gte: startOfDay, $lte: now } } },
            { $group: { _id: { $toLower: '$app' }, count: { $sum: 1 } } }
          ]);
          if (rows.length === 0) continue; // No data — skip notification entirely

          const windowSeconds = 30;
          const buckets = { productive: 0, neutral: 0, unproductive: 0, uncategorized: 0 };
          const apps = [];
          for (const r of rows) {
            const cat = appMap[r._id] || 'uncategorized';
            const minutes = r.count * windowSeconds / 60;
            buckets[cat] += minutes;
            apps.push({ app: r._id, minutes, cat });
          }
          const total = Object.values(buckets).reduce((a, b) => a + b, 0);
          const denom = total - buckets.uncategorized;
          const pct = denom > 0 ? Math.round((buckets.productive / denom) * 100) : null;

          const productiveApps = apps
            .filter(a => a.cat === 'productive')
            .sort((a, b) => b.minutes - a.minutes)
            .slice(0, 3)
            .map(a => `${a.app} (${Math.round(a.minutes)}m)`);

          // Hours worked from Attendance
          const att = await Attendance.findOne({ user: u._id, date: todayStr() }).lean();
          let hoursMsg = '';
          if (att?.entryTime) {
            const end = att.wrapUpTime ? new Date(att.wrapUpTime) : now;
            const breakMs = (att.breaks || []).reduce((s, b) => {
              const bs = new Date(b.startedAt).getTime();
              const be = b.endedAt ? new Date(b.endedAt).getTime() : end.getTime();
              return s + Math.max(0, be - bs);
            }, 0);
            const hours = (end.getTime() - new Date(att.entryTime).getTime() - breakMs) / 3_600_000;
            const h = Math.floor(hours);
            const m = Math.round((hours - h) * 60);
            hoursMsg = `${h}h ${m}m worked. `;
          }

          const pctMsg = pct !== null ? `Productivity ${pct}%. ` : '';
          const appsMsg = productiveApps.length > 0
            ? `Top apps: ${productiveApps.join(', ')}.`
            : 'No productive app time logged.';

          const notif = await Notification.create({
            user: u._id,
            type: 'productivity',
            title: 'Your day in review',
            message: `${hoursMsg}${pctMsg}${appsMsg}`,
            priority: 'low',
            link: '/profile?tab=activity'
          });
          io?.to(`user:${u._id}`).emit('notification:new', notif);
        } catch (e) {
          // Single user failure shouldn't kill the whole batch
          console.warn(`[ProductivityDigest] user ${u._id} failed:`, e.message);
        }
      }
    } catch (err) {
      console.warn('[ProductivityDigest] tick failed:', err.message);
    }
  };

  // Run on the minute, sync to system clock
  const now = new Date();
  const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
  setTimeout(() => {
    tick();
    setInterval(tick, 60000);
  }, msToNextMinute);
}

function startSchedulers(io) {
  startNoEntryAlertScheduler(io);
  startWrapUpReminderScheduler(io);
  startAutoWrapUpScheduler(io);
  startMeetingUnseenAlertScheduler(io);
  startTaskDeadlineReminderScheduler(io);
  startOverdueTaskScheduler(io);
  startNotificationCleanupScheduler();
  startDeepSearchCleanupScheduler();
  startMonthlySalaryScheduler();
  startProductivityDigestScheduler(io);
  console.log('All schedulers started (attendance, wrap-up, auto-wrap-up, meeting, task reminders, overdue tasks, retention cleanup, monthly salary, productivity digest)');
}

module.exports = { startSchedulers };
