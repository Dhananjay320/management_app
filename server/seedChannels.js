require('dotenv').config();
const mongoose = require('mongoose');
const Channel = require('./models/Channel');
const Message = require('./models/Message');
const User = require('./models/User');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected');

  await Channel.deleteMany({});
  await Message.deleteMany({});

  const users = await User.find({ isActive: true });
  const allIds = users.map(u => u._id);
  const admin = users.find(u => u.role === 'main_admin');
  const priya = users.find(u => u.name.includes('Priya'));
  const ravi = users.find(u => u.name.includes('Ravi'));
  const meera = users.find(u => u.name.includes('Meera'));

  // Channels
  const general = await Channel.create({ name: '#general', type: 'channel', description: 'Company-wide conversations', members: allIds, createdBy: admin._id, isDefault: true });
  const announcements = await Channel.create({ name: '#announcements', type: 'channel', description: 'Official announcements', members: allIds, createdBy: admin._id, isDefault: true });
  const techTeam = await Channel.create({ name: '#tech-team', type: 'channel', description: 'Tech team discussions', members: [admin._id, priya._id, ravi._id], createdBy: admin._id });
  const teamFeed = await Channel.create({ name: '#team-feed', type: 'channel', description: 'Fun & learning posts', members: allIds, createdBy: admin._id, isDefault: true });

  // Room
  const room = await Channel.create({ name: 'Project Alpha', type: 'room', description: 'Confidential project discussions', members: [admin._id, priya._id, ravi._id], createdBy: priya._id, isPrivate: true });

  // DM
  const dm = await Channel.create({ name: `DM: ${admin.name} & ${priya.name}`, type: 'dm', members: [admin._id, priya._id], createdBy: admin._id });

  // Group
  const group = await Channel.create({ name: 'Lunch Squad 🍕', type: 'group', members: [admin._id, priya._id, ravi._id, meera._id], createdBy: ravi._id });

  // Seed messages in #general
  const msgs = [
    { sender: priya._id, content: 'Good morning everyone! 👋 Quick update: the client meeting has been moved to 3 PM today.' },
    { sender: ravi._id, content: 'Thanks for the heads up! I\'ll update the deck before then. @Priya can you share the latest API docs?' },
    { sender: priya._id, content: 'Sure! Here\'s the updated documentation. Let me know if you have questions.' },
    { sender: meera._id, content: 'Sprint planning at 2 PM — don\'t forget to update your task status before the meeting! 🎯' },
    { sender: admin._id, content: 'Great work on the release yesterday team! 🚀 Very smooth deployment.' },
    { sender: ravi._id, content: 'Thanks! The new CI pipeline made it much easier. Zero downtime this time.' },
    { sender: priya._id, content: 'Agreed! Let\'s keep this momentum going. I\'ve created tasks for the next sprint in the Tasks section.' },
  ];

  for (const msg of msgs) {
    const m = await Message.create({ channel: general._id, ...msg, readBy: [msg.sender] });
    general.lastMessage = m._id;
    general.lastMessageAt = m.createdAt;
  }
  await general.save();

  // Add reactions to first message
  const firstMsg = await Message.findOne({ channel: general._id }).sort({ createdAt: 1 });
  firstMsg.reactions = [
    { emoji: '👍', users: [ravi._id, meera._id, admin._id] },
    { emoji: '✅', users: [ravi._id, admin._id] }
  ];
  await firstMsg.save();

  // Seed some messages in DM
  await Message.create({ channel: dm._id, sender: admin._id, content: 'Hey Priya, how\'s the project timeline looking?', readBy: [admin._id] });
  await Message.create({ channel: dm._id, sender: priya._id, content: 'We\'re on track! Should be able to deliver by end of next week. The team has been great.', readBy: [priya._id] });
  await Message.create({ channel: dm._id, sender: admin._id, content: 'Perfect. Let me know if you need any resources.', readBy: [admin._id] });

  // Room messages
  await Message.create({ channel: room._id, sender: priya._id, content: 'Welcome to Project Alpha! This room is for all confidential discussions. 🚀', type: 'system', readBy: [priya._id] });
  await Message.create({ channel: room._id, sender: ravi._id, content: 'I\'ve started the technical feasibility assessment. Will share findings by Thursday.', readBy: [ravi._id] });

  console.log('Channels and messages seeded!');
  console.log(`  ${general.name}, ${announcements.name}, ${techTeam.name}, ${teamFeed.name}`);
  console.log(`  Room: ${room.name}, DM created, Group: ${group.name}`);
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
