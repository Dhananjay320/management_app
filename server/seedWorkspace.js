require('dotenv').config();
const mongoose = require('mongoose');
const { Workspace, WorkspaceDocument, WorkspaceNote, WorkspaceLink } = require('./models/Workspace');
const User = require('./models/User');
const Team = require('./models/Team');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  await Workspace.deleteMany({});
  await WorkspaceDocument.deleteMany({});
  await WorkspaceNote.deleteMany({});
  await WorkspaceLink.deleteMany({});

  const admin = await User.findOne({ role: 'main_admin' });
  const priya = await User.findOne({ name: /Priya/ });
  const ravi = await User.findOne({ name: /Ravi/ });
  const meera = await User.findOne({ name: /Meera/ });
  const techTeam = await Team.findOne({ name: 'Tech Team' });
  const allIds = [admin._id, priya._id, ravi._id, meera._id];

  // Workspaces
  const ws1 = await Workspace.create({ name: 'Product Launch 2026', description: 'Everything for the Q2 product launch', icon: '🚀', color: '#6366F1', type: 'team', team: techTeam._id, members: [admin._id, priya._id, ravi._id], createdBy: priya._id });
  const ws2 = await Workspace.create({ name: 'My Notes', description: 'Personal workspace', icon: '📝', color: '#8B5CF6', type: 'personal', members: [admin._id], createdBy: admin._id });
  const ws3 = await Workspace.create({ name: 'Client Project Alpha', description: 'All deliverables for Client Alpha', icon: '🎯', color: '#10B981', type: 'cross_team', members: allIds, createdBy: admin._id });
  const ws4 = await Workspace.create({ name: 'Design System', description: 'UI components and style guide', icon: '🎨', color: '#EC4899', type: 'team', team: techTeam._id, members: [priya._id, meera._id, ravi._id], createdBy: meera._id });

  // Documents
  await WorkspaceDocument.create({
    workspace: ws1._id, title: 'Product Launch Plan 2026', createdBy: priya._id, lastEditedBy: priya._id,
    classification: 'company', tags: ['launch', 'Q2', 'strategy'],
    tiptapJSON: { type: 'doc', content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Product Launch Plan 2026' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'This document outlines our complete product launch strategy for Q2 2026. We aim to deliver a seamless experience across all platforms with zero downtime.' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '🎯 Key Milestones' }] },
      { type: 'taskList', content: [
        { type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alpha Release — Internal Testing (Apr 20)' }] }] },
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Beta Launch — Limited Users (May 1)' }] }] },
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Public Launch (May 15)' }] }] },
      ]},
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '📋 Team Responsibilities' }] },
      { type: 'bulletList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Priya — Project management, client communication' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ravi — Backend APIs, database, deployment' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Meera — UI/UX design, frontend implementation' }] }] },
      ]},
      { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Note: All team leads should submit their module status by April 18th.' }] }] },
    ]},
    plainTextContent: 'Product Launch Plan 2026\nThis document outlines our complete product launch strategy for Q2 2026.\nKey Milestones\nAlpha Release Internal Testing\nBeta Launch Limited Users\nPublic Launch\nTeam Responsibilities\nPriya Project management\nRavi Backend APIs\nMeera UI/UX design'
  });

  await WorkspaceDocument.create({
    workspace: ws1._id, title: 'API Architecture Notes', createdBy: ravi._id, lastEditedBy: ravi._id,
    classification: 'company', tags: ['api', 'architecture'],
    tiptapJSON: { type: 'doc', content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'API Architecture' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'All REST endpoints use /api/v1/ prefix. Socket.io for real-time events.' }] },
      { type: 'codeBlock', attrs: { language: 'javascript' }, content: [{ type: 'text', text: 'GET  /api/v1/auth/me\nPOST /api/v1/auth/login\nPOST /api/v1/auth/refresh\nGET  /api/v1/tasks\nPOST /api/v1/messages/:channelId' }] },
    ]}
  });

  await WorkspaceDocument.create({
    workspace: ws2._id, title: 'Meeting Prep — Q2 Review', createdBy: admin._id, lastEditedBy: admin._id,
    classification: 'personal',
    tiptapJSON: { type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Q2 Review Meeting — Agenda' }] },
      { type: 'orderedList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Team performance overview' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Revenue targets vs actuals' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Product launch timeline review' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hiring plan for Q3' }] }] },
      ]},
    ]}
  });

  // Notes
  await WorkspaceNote.create({ workspace: ws1._id, title: 'Sprint ideas', content: 'Consider adding dark mode in sprint 5. Also look into PWA support.', color: '#FFE66D', createdBy: ravi._id });
  await WorkspaceNote.create({ workspace: ws1._id, title: 'Client feedback', content: 'Sarah wants faster dashboard loads — check caching.', color: '#A8E6CF', createdBy: priya._id });

  // Links
  await WorkspaceLink.create({ workspace: ws1._id, url: 'https://react.dev', title: 'React Documentation', description: 'Official React docs', addedBy: ravi._id });
  await WorkspaceLink.create({ workspace: ws1._id, url: 'https://tiptap.dev', title: 'TipTap Editor', description: 'Headless editor framework', addedBy: meera._id });
  await WorkspaceLink.create({ workspace: ws3._id, url: 'https://figma.com', title: 'Figma — Design Tool', description: 'Collaborative design platform', addedBy: meera._id });

  console.log('Workspaces seeded: 4 workspaces, 3 documents, 2 notes, 3 links');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
