require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Team = require('./models/Team');
const StickyNote = require('./models/StickyNote');
const Activity = require('./models/Activity');
const TeamFeedPost = require('./models/TeamFeedPost');

async function seedPhase9() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Clear
  await StickyNote.deleteMany({});
  await Activity.deleteMany({});
  await TeamFeedPost.deleteMany({});

  // Get users and teams
  const admin = await User.findOne({ email: 'admin@niyoq.com' });
  const priya = await User.findOne({ email: 'priya@niyoq.com' });
  const ravi = await User.findOne({ email: 'ravi@niyoq.com' });
  const meera = await User.findOne({ email: 'meera@niyoq.com' });
  const techTeam = await Team.findOne({ name: 'Tech Team' });
  const designTeam = await Team.findOne({ name: 'Design Team' });

  if (!admin || !priya || !ravi || !meera) {
    console.error('Users not found. Run seed.js first.');
    process.exit(1);
  }

  // ─── Sticky Notes ───
  await StickyNote.create({
    title: 'Sprint Goals',
    content: '- Finish dashboard charts\n- API integration tests\n- Code review for auth module',
    color: '#FEF3C7',
    creator: ravi._id,
    order: 0
  });

  await StickyNote.create({
    title: 'Design Review Notes',
    content: 'Check color contrast on mobile views. Font size needs to be 14px minimum for accessibility.',
    color: '#DBEAFE',
    creator: meera._id,
    order: 0
  });

  await StickyNote.create({
    title: 'Meeting Prep',
    content: 'Prepare Q2 metrics\nPull attendance summary\nUpdate team progress board',
    color: '#D1FAE5',
    creator: priya._id,
    order: 0,
    isShared: true,
    sharedWith: [{ user: admin._id, canEdit: false }]
  });

  await StickyNote.create({
    title: 'Quick Reminders',
    content: 'Update VPS SSL cert by April 25\nReview new hire onboarding docs',
    color: '#FEE2E2',
    creator: admin._id,
    order: 0
  });

  await StickyNote.create({
    title: 'API Endpoints to Test',
    content: '/api/v1/email/send\n/api/v1/email/messages\n/api/v1/email/drafts',
    color: '#EDE9FE',
    creator: ravi._id,
    order: 1
  });

  console.log('Sticky notes created');

  // ─── Activities ───
  await Activity.create({
    title: 'Team Book Club: Atomic Habits',
    type: 'reading',
    description: 'Discussing chapters 5-8 of Atomic Habits by James Clear. Everyone share one key takeaway.',
    audience: 'company',
    date: new Date('2026-04-18T16:00:00'),
    endTime: new Date('2026-04-18T17:00:00'),
    isRecurring: true,
    recurringPattern: 'weekly',
    rsvpJoin: [priya._id, ravi._id, meera._id],
    createdBy: priya._id
  });

  await Activity.create({
    title: 'Friday Fun Quiz',
    type: 'fun',
    description: 'Weekly trivia quiz! This week: Tech history and pop culture. Prizes for top 3!',
    audience: 'company',
    date: new Date('2026-04-18T17:30:00'),
    rsvpJoin: [admin._id, ravi._id, meera._id],
    rsvpSkip: [priya._id],
    createdBy: admin._id
  });

  await Activity.create({
    title: 'Desk Yoga & Stretch Break',
    type: 'wellness',
    description: '15-minute guided stretching session. Good for posture and focus!',
    audience: 'company',
    date: new Date('2026-04-21T15:00:00'),
    isRecurring: true,
    recurringPattern: 'daily',
    rsvpJoin: [meera._id],
    createdBy: meera._id
  });

  await Activity.create({
    title: 'TED Talk Watch: The Power of Vulnerability',
    type: 'video',
    description: 'Let\'s watch and discuss Brene Brown\'s famous TED talk together.',
    attachment: { type: 'link', url: 'https://www.ted.com/talks/brene_brown_the_power_of_vulnerability' },
    audience: 'team',
    team: techTeam._id,
    date: new Date('2026-04-22T16:00:00'),
    createdBy: ravi._id
  });

  await Activity.create({
    title: 'Meera\'s Work Anniversary!',
    type: 'celebration',
    description: 'Celebrating 2 years of Meera being part of the team! Virtual cake cutting at 4 PM.',
    audience: 'company',
    date: new Date('2026-04-23T16:00:00'),
    rsvpJoin: [admin._id, priya._id, ravi._id],
    createdBy: admin._id
  });

  await Activity.create({
    title: 'UI/UX Skill Share',
    type: 'learning',
    description: 'Meera will share tips on creating accessible color palettes and responsive layouts.',
    audience: 'company',
    date: new Date('2026-04-24T14:00:00'),
    rsvpJoin: [ravi._id, priya._id],
    createdBy: meera._id
  });

  await Activity.create({
    title: 'Product Ideas Brainstorm',
    type: 'brainstorm',
    description: 'Open brainstorming session for Q3 product features. Bring your wildest ideas!',
    audience: 'company',
    date: new Date('2026-04-25T11:00:00'),
    createdBy: priya._id
  });

  await Activity.create({
    title: 'Team Lunch at Taj Kitchen',
    type: 'social',
    description: 'Casual team lunch at Taj Kitchen, Banjara Hills. RSVP so we can book a table!',
    audience: 'company',
    date: new Date('2026-04-26T12:30:00'),
    rsvpJoin: [admin._id, priya._id, ravi._id, meera._id],
    createdBy: admin._id
  });

  console.log('Activities created');

  // ─── Team Feed Posts ───
  const post1 = await TeamFeedPost.create({
    content: 'Just discovered this amazing VS Code extension for MongoDB visualization. Game changer for debugging! Check out MongoDB for VS Code.',
    contentType: 'text',
    audience: 'company',
    author: ravi._id,
    reactions: [
      { emoji: '🔥', users: [priya._id, meera._id] },
      { emoji: '👍', users: [admin._id] }
    ],
    comments: [
      { author: priya._id, content: 'Oh nice! I\'ve been using Compass but this looks way more convenient.' },
      { author: meera._id, content: 'Installing it right now, thanks Ravi!' }
    ]
  });

  await TeamFeedPost.create({
    content: 'Sharing an interesting article about designing for accessibility. Really changed how I think about color choices.',
    contentType: 'link',
    linkPreview: {
      url: 'https://example.com/accessibility-design',
      title: 'Designing for Everyone: A Guide to Accessible Design',
      description: 'Learn the principles of accessible design and how to make your products usable by everyone.',
      image: ''
    },
    audience: 'company',
    author: meera._id,
    reactions: [
      { emoji: '❤️', users: [priya._id, ravi._id, admin._id] }
    ],
    comments: [
      { author: admin._id, content: 'Great share! We should make this required reading for the team.' }
    ]
  });

  await TeamFeedPost.create({
    content: 'Huge shoutout to @Ravi for fixing that critical attendance bug at 11 PM last night. True team player! 🎉',
    contentType: 'text',
    audience: 'company',
    author: priya._id,
    reactions: [
      { emoji: '🎉', users: [admin._id, meera._id] },
      { emoji: '💪', users: [meera._id] },
      { emoji: '❤️', users: [admin._id] }
    ],
    pinnedBy: [ravi._id]
  });

  await TeamFeedPost.create({
    content: 'Fun fact: Our codebase just crossed 10,000 lines of code this week! 🚀 Here\'s to building something amazing together.',
    contentType: 'text',
    audience: 'company',
    author: admin._id,
    reactions: [
      { emoji: '🚀', users: [priya._id, ravi._id, meera._id] }
    ]
  });

  await TeamFeedPost.create({
    content: 'Just finished the new component library documentation. Check it out in the Workspace under "Design System" 📚',
    contentType: 'text',
    audience: 'team',
    team: designTeam._id,
    author: meera._id,
    reactions: [
      { emoji: '👍', users: [priya._id] }
    ]
  });

  await TeamFeedPost.create({
    content: 'Weekend hiking trip photos from Nandi Hills! The sunrise was absolutely incredible. Who\'s joining next time? 🏔️',
    contentType: 'text',
    audience: 'company',
    author: ravi._id,
    reactions: [
      { emoji: '😍', users: [meera._id, priya._id] },
      { emoji: '🏔️', users: [admin._id] }
    ],
    comments: [
      { author: meera._id, content: 'Count me in for the next one!' },
      { author: priya._id, content: 'The sunrise shot is beautiful! How early did you wake up?' },
      { author: ravi._id, content: '@Priya we started at 4 AM. Worth every minute of sleep lost 😄' }
    ]
  });

  console.log('Team feed posts created');

  console.log('\n✅ Phase 9 seed complete!');
  process.exit(0);
}

seedPhase9().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
