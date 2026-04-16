require('dotenv').config();
const mongoose = require('mongoose');
const { Meeting, MoM } = require('./models/Meeting');
const User = require('./models/User');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  await Meeting.deleteMany({});
  await MoM.deleteMany({});

  const admin = await User.findOne({ role: 'main_admin' });
  const priya = await User.findOne({ name: /Priya/ });
  const ravi = await User.findOne({ name: /Ravi/ });
  const meera = await User.findOne({ name: /Meera/ });

  const now = new Date();
  const day = (d, h = 14, m = 0) => { const dt = new Date(now); dt.setDate(dt.getDate() + d); dt.setHours(h, m, 0, 0); return dt; };

  // Upcoming meetings
  const sprint = await Meeting.create({
    title: 'Sprint Planning', agenda: 'Review sprint progress, discuss blockers, plan next week deliverables.',
    type: 'online', date: day(0), startTime: '14:00', endTime: '15:30', duration: 90,
    googleMeetLink: 'https://meet.google.com/abc-defg-hij',
    attendees: [
      { user: admin._id, response: 'confirmed', hasSeen: true },
      { user: priya._id, response: 'confirmed', hasSeen: true },
      { user: ravi._id, response: 'pending', hasSeen: false },
      { user: meera._id, response: 'confirmed', hasSeen: true }
    ],
    createdBy: priya._id, status: 'scheduled'
  });

  await Meeting.create({
    title: 'Design Review', agenda: 'Review new dashboard mockups and mobile responsive designs.',
    type: 'offline', date: day(1, 10), startTime: '10:00', endTime: '11:00', duration: 60,
    location: 'Conference Room A — Hyderabad HQ',
    attendees: [
      { user: priya._id, response: 'confirmed', hasSeen: true },
      { user: meera._id, response: 'confirmed', hasSeen: true },
      { user: ravi._id, response: 'pending', hasSeen: false }
    ],
    createdBy: priya._id, status: 'scheduled'
  });

  await Meeting.create({
    title: 'Client Demo', agenda: 'Demo the Q2 product to Client Alpha. Show calendar, tasks, and messaging modules.',
    type: 'online', date: day(4, 15), startTime: '15:00', endTime: '16:00', duration: 60,
    googleMeetLink: 'https://meet.google.com/xyz-uvwx-yz1',
    attendees: [
      { user: admin._id, response: 'confirmed', hasSeen: true },
      { user: priya._id, response: 'confirmed', hasSeen: true },
      { user: ravi._id, response: 'confirmed', hasSeen: true }
    ],
    createdBy: admin._id, status: 'scheduled'
  });

  // Past meeting with MoM
  const pastMeeting = await Meeting.create({
    title: 'Sprint Retrospective — Sprint 3', agenda: 'What went well, what to improve, action items.',
    type: 'online', date: day(-3, 14), startTime: '14:00', endTime: '15:00', duration: 60,
    googleMeetLink: 'https://meet.google.com/old-meet-123',
    attendees: [
      { user: admin._id, response: 'confirmed', hasSeen: true, isPresent: true },
      { user: priya._id, response: 'confirmed', hasSeen: true, isPresent: true },
      { user: ravi._id, response: 'confirmed', hasSeen: true, isPresent: true },
      { user: meera._id, response: 'declined', hasSeen: true, declineReason: 'On leave' }
    ],
    createdBy: priya._id, status: 'completed', endedAt: day(-3, 15), endedBy: priya._id
  });

  await MoM.create({
    meeting: pastMeeting._id, author: priya._id, type: 'team',
    title: 'Sprint 3 Retrospective — MoM', isPublished: true, publishedAt: day(-3, 16),
    tiptapJSON: { type: 'doc', content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Sprint 3 Retrospective' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '✅ What Went Well' }] },
      { type: 'bulletList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Deployed auth module with zero downtime' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Calendar integration completed ahead of schedule' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Great team collaboration on messaging feature' }] }] },
      ]},
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '🔧 What to Improve' }] },
      { type: 'bulletList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Need better code review process — PRs sitting too long' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Mobile browser testing should start earlier in sprint' }] }] },
      ]},
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '📋 Action Items' }] },
      { type: 'taskList', content: [
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Set up PR review SLA — max 24 hours (Priya)' }] }] },
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Add mobile browser testing to Sprint 4 definition of done (Ravi)' }] }] },
        { type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Deploy monitoring dashboard (Ravi) — DONE' }] }] },
      ]}
    ]}
  });

  console.log('Meetings seeded: 3 upcoming, 1 past with MoM');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
