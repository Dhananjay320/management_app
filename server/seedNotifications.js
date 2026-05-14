require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Notification = require('./models/Notification');

async function seedNotifications() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  await Notification.deleteMany({});

  const admin = await User.findOne({ email: 'admin@niyoq.com' });
  const priya = await User.findOne({ email: 'priya@niyoq.com' });
  const ravi = await User.findOne({ email: 'ravi@niyoq.com' });
  const meera = await User.findOne({ email: 'meera@niyoq.com' });

  if (!admin || !priya || !ravi || !meera) {
    console.error('Users not found. Run seed.js first.');
    process.exit(1);
  }

  const now = new Date();
  const ago = (mins) => new Date(now.getTime() - mins * 60000);

  // ─── Notifications for Admin ───
  await Notification.create([
    {
      user: admin._id, type: 'task', title: 'New task assigned',
      message: 'Priya assigned you "Review Q2 Dashboard" — High Priority, due Apr 20',
      actionType: 'view_task', sender: priya._id, createdAt: ago(5)
    },
    {
      user: admin._id, type: 'meeting', title: 'Meeting in 10 minutes',
      message: 'Sprint Review at 3:00 PM — 5 attendees confirmed',
      actionType: 'view_meeting', createdAt: ago(10)
    },
    {
      user: admin._id, type: 'message', title: 'New message from Ravi',
      message: 'Hey, can you check the attendance API? Getting 500 errors...',
      actionType: 'reply', sender: ravi._id, createdAt: ago(25)
    },
    {
      user: admin._id, type: 'approval', title: 'Leave request pending',
      message: 'Meera requested leave for Apr 21-22 (family event)',
      actionType: 'view_task', sender: meera._id, createdAt: ago(60)
    },
    {
      user: admin._id, type: 'announcement', title: 'Company announcement',
      message: 'Monthly town hall moved to Friday 4 PM',
      createdAt: ago(120)
    },
    {
      user: admin._id, type: 'salary', title: 'New salary dispute',
      message: 'Ravi raised a dispute for March 2026 — absent days count incorrect',
      sender: ravi._id, createdAt: ago(180)
    },
    {
      user: admin._id, type: 'attendance', title: 'No-entry alert',
      message: 'Meera has not marked entry today (10:30 AM)',
      createdAt: ago(240), isRead: true
    }
  ]);

  // ─── Notifications for Priya ───
  await Notification.create([
    {
      user: priya._id, type: 'task', title: 'Task status update',
      message: 'Ravi marked "API Integration" as Done',
      sender: ravi._id, createdAt: ago(15)
    },
    {
      user: priya._id, type: 'meeting', title: 'New meeting invite',
      message: 'Design Review — Tomorrow at 2:00 PM, created by Meera',
      actionType: 'view_meeting', sender: meera._id, createdAt: ago(45)
    },
    {
      user: priya._id, type: 'message', title: 'Meera mentioned you',
      message: '@Priya can you review the color palette changes?',
      actionType: 'reply', sender: meera._id, createdAt: ago(90)
    },
    {
      user: priya._id, type: 'email', title: 'New email',
      message: 'From contact@clientcorp.com — API Access Request',
      actionType: 'view_task', createdAt: ago(150)
    }
  ]);

  // ─── Notifications for Ravi ───
  await Notification.create([
    {
      user: ravi._id, type: 'task', title: 'Task deadline approaching',
      message: '"Q2 Dashboard - Filter Panel" is due tomorrow',
      createdAt: ago(30)
    },
    {
      user: ravi._id, type: 'message', title: 'New message in #tech-team',
      message: 'Priya: Has anyone tested the new attendance endpoint?',
      sender: priya._id, createdAt: ago(75)
    },
    {
      user: ravi._id, type: 'salary', title: 'Dispute update',
      message: 'Your salary dispute for March 2026 is being reviewed',
      createdAt: ago(200), isRead: true
    }
  ]);

  // ─── Notifications for Meera ───
  await Notification.create([
    {
      user: meera._id, type: 'meeting', title: 'Meeting starting now',
      message: 'Design Sync is starting — join now',
      actionType: 'view_meeting', createdAt: ago(2)
    },
    {
      user: meera._id, type: 'task', title: 'New task from meeting',
      message: 'Priya created "Update Color Palette" from Sprint Review MoM',
      sender: priya._id, createdAt: ago(60)
    },
    {
      user: meera._id, type: 'announcement', title: 'Company announcement',
      message: 'Monthly town hall moved to Friday 4 PM',
      createdAt: ago(120), isRead: true
    }
  ]);

  // ─── Emergency Alert (for all users) ───
  for (const userId of [admin._id, priya._id, ravi._id, meera._id]) {
    await Notification.create({
      user: userId, type: 'emergency',
      title: 'VPS Storage Critical',
      message: 'Storage usage at 92%. Please clean up old files or contact admin for expansion.',
      isEmergency: true,
      sender: admin._id,
      createdAt: ago(300)
    });
  }

  console.log('Notifications created');
  console.log('\n✅ Notifications seed complete!');
  process.exit(0);
}

seedNotifications().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
