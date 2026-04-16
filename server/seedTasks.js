require('dotenv').config();
const mongoose = require('mongoose');
const Task = require('./models/Task');
const Todo = require('./models/Todo');
const Label = require('./models/Label');
const User = require('./models/User');
const Team = require('./models/Team');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  await Task.deleteMany({});
  await Todo.deleteMany({});
  await Label.deleteMany({});

  const admin = await User.findOne({ role: 'main_admin' });
  const priya = await User.findOne({ name: /Priya/ });
  const ravi = await User.findOne({ name: /Ravi/ });
  const meera = await User.findOne({ name: /Meera/ });
  const techTeam = await Team.findOne({ name: 'Tech Team' });

  // Labels
  const labels = await Label.insertMany([
    { name: 'Urgent', color: '#EF4444', type: 'company', createdBy: admin._id },
    { name: 'Bug', color: '#F97316', type: 'company', createdBy: admin._id },
    { name: 'Feature', color: '#6366F1', type: 'company', createdBy: admin._id },
    { name: 'Design', color: '#EC4899', type: 'company', createdBy: admin._id },
    { name: 'Backend', color: '#10B981', type: 'team', team: techTeam._id, createdBy: priya._id },
    { name: 'Frontend', color: '#06B6D4', type: 'team', team: techTeam._id, createdBy: priya._id },
    { name: 'API', color: '#8B5CF6', type: 'team', team: techTeam._id, createdBy: priya._id },
  ]);

  const now = new Date();
  const day = (d) => { const dt = new Date(now); dt.setDate(dt.getDate() + d); return dt; };

  // Tasks
  await Task.insertMany([
    {
      title: 'API Integration — Phase 2', description: 'Integrate new REST API endpoints for user management. Auth, profile updates, permissions.',
      assignees: [ravi._id], team: techTeam._id, createdBy: priya._id,
      priority: 'top', status: 'in_progress', progress: 45, statusNote: 'Waiting for updated API specs from backend',
      deadline: day(2), labels: [labels[6]._id, labels[4]._id],
      activity: [{ user: priya._id, action: 'created', detail: 'Task created' }, { user: ravi._id, action: 'progress_updated', detail: 'Progress → 45%' }]
    },
    {
      title: 'Fix Critical Login Bug', description: 'Users getting logged out randomly on mobile browser. Investigate refresh token flow.',
      assignees: [ravi._id], team: techTeam._id, createdBy: priya._id,
      priority: 'top', status: 'in_progress', progress: 70, statusNote: 'Found the issue — token refresh race condition',
      deadline: day(1), labels: [labels[0]._id, labels[1]._id],
      activity: [{ user: priya._id, action: 'created', detail: 'Task created' }]
    },
    {
      title: 'Dashboard UI Redesign', description: 'Redesign the main dashboard with new calendar-centric layout per spec.',
      assignees: [meera._id], team: techTeam._id, createdBy: priya._id,
      priority: 'high', status: 'not_started', progress: 0,
      deadline: day(6), labels: [labels[3]._id, labels[2]._id],
      activity: [{ user: priya._id, action: 'created', detail: 'Task created' }]
    },
    {
      title: 'Update API Documentation', description: 'Document all new v1 endpoints with request/response examples.',
      assignees: [ravi._id], team: techTeam._id, createdBy: priya._id,
      priority: 'high', status: 'in_progress', progress: 30, statusNote: 'Auth endpoints done, working on users',
      deadline: day(4), labels: [labels[6]._id],
      activity: [{ user: priya._id, action: 'created', detail: 'Task created' }]
    },
    {
      title: 'Client Presentation Deck', description: 'Prepare demo slides for the Q2 client meeting.',
      assignees: [priya._id], team: techTeam._id, createdBy: admin._id,
      priority: 'high', status: 'on_hold', progress: 60, statusNote: 'Waiting for final mockups from design',
      deadline: day(3), labels: [],
      activity: [{ user: admin._id, action: 'created', detail: 'Task created' }]
    },
    {
      title: 'Code Review — Auth Module', description: 'Review the authentication module code for security best practices.',
      assignees: [ravi._id, priya._id], team: techTeam._id, createdBy: priya._id,
      priority: 'medium', status: 'not_started', progress: 0,
      deadline: day(9), labels: [labels[4]._id],
      activity: [{ user: priya._id, action: 'created', detail: 'Task created' }]
    },
    {
      title: 'Onboarding Flow Implementation', description: 'Build the 6-step onboarding flow for new employees.',
      assignees: [meera._id, ravi._id], team: techTeam._id, createdBy: priya._id,
      priority: 'medium', status: 'in_progress', progress: 20,
      deadline: day(12), labels: [labels[2]._id, labels[5]._id],
      activity: [{ user: priya._id, action: 'created', detail: 'Task created' }]
    },
    {
      title: 'Team Wellness Survey', description: 'Create and distribute monthly wellness check survey.',
      assignees: [admin._id], createdBy: admin._id,
      priority: 'low', status: 'not_started', progress: 0,
      deadline: day(14), labels: [],
      activity: [{ user: admin._id, action: 'created', detail: 'Task created' }]
    },
    {
      title: 'Setup Monitoring Dashboard', description: 'Configure Netdata monitoring for VPS — storage, CPU, RAM alerts.',
      assignees: [ravi._id], team: techTeam._id, createdBy: admin._id,
      priority: 'low', status: 'done', progress: 100, completedAt: day(-1),
      deadline: day(-1), labels: [labels[4]._id],
      activity: [{ user: admin._id, action: 'created', detail: 'Task created' }, { user: ravi._id, action: 'status_changed', detail: 'Status → done' }]
    },
  ]);

  // To-dos for admin
  await Todo.insertMany([
    { user: admin._id, title: 'Review PR #142 — auth module', priority: 'high', isDone: true, doneAt: new Date(), order: 0 },
    { user: admin._id, title: 'Update standup notes for tomorrow', priority: 'medium', order: 1 },
    { user: admin._id, title: 'Research WebSocket scaling options', priority: 'low', order: 2 },
    { user: admin._id, title: 'Book meeting room for Friday', priority: 'medium', order: 3 },
    { user: admin._id, title: 'Send weekly report to stakeholders', priority: 'high', deadline: day(1), order: 4 },
  ]);

  console.log('Tasks, labels, and to-dos seeded!');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
