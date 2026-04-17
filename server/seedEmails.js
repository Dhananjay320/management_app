require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const { EmailAccount, Email, EmailDraft, EmailTemplate, EmailCategory } = require('./models/Email');

async function seedEmails() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Clear existing email data
  await EmailAccount.deleteMany({});
  await Email.deleteMany({});
  await EmailDraft.deleteMany({});
  await EmailTemplate.deleteMany({});
  await EmailCategory.deleteMany({});

  // Get existing users
  const admin = await User.findOne({ email: 'admin@avadeti.com' });
  const priya = await User.findOne({ email: 'priya@avadeti.com' });
  const ravi = await User.findOne({ email: 'ravi@avadeti.com' });
  const meera = await User.findOne({ email: 'meera@avadeti.com' });

  if (!admin || !priya || !ravi || !meera) {
    console.error('Users not found. Run seed.js first.');
    process.exit(1);
  }

  // ─── Create Email Accounts ───
  const adminAccount = await EmailAccount.create({
    address: 'admin@avadeti.com',
    displayName: 'Yugara Admin',
    type: 'personal',
    smtp: { host: 'mail.avadeti.com', port: 587, user: 'admin@avadeti.com', pass: 'smtp_pass' },
    imap: { host: 'mail.avadeti.com', port: 993, user: 'admin@avadeti.com', pass: 'imap_pass' },
    owner: admin._id,
    createdBy: admin._id
  });

  const priyaAccount = await EmailAccount.create({
    address: 'priya@avadeti.com',
    displayName: 'Priya Sharma',
    type: 'personal',
    smtp: { host: 'mail.avadeti.com', port: 587, user: 'priya@avadeti.com', pass: 'smtp_pass' },
    imap: { host: 'mail.avadeti.com', port: 993, user: 'priya@avadeti.com', pass: 'imap_pass' },
    owner: priya._id,
    createdBy: admin._id
  });

  const raviAccount = await EmailAccount.create({
    address: 'ravi@avadeti.com',
    displayName: 'Ravi Kumar',
    type: 'personal',
    smtp: { host: 'mail.avadeti.com', port: 587, user: 'ravi@avadeti.com', pass: 'smtp_pass' },
    imap: { host: 'mail.avadeti.com', port: 993, user: 'ravi@avadeti.com', pass: 'imap_pass' },
    owner: ravi._id,
    createdBy: admin._id
  });

  const meeraAccount = await EmailAccount.create({
    address: 'meera@avadeti.com',
    displayName: 'Meera Patel',
    type: 'personal',
    smtp: { host: 'mail.avadeti.com', port: 587, user: 'meera@avadeti.com', pass: 'smtp_pass' },
    imap: { host: 'mail.avadeti.com', port: 993, user: 'meera@avadeti.com', pass: 'imap_pass' },
    owner: meera._id,
    createdBy: admin._id
  });

  // Shared inbox
  const helpAccount = await EmailAccount.create({
    address: 'help@avadeti.com',
    displayName: 'Help Desk',
    type: 'shared',
    smtp: { host: 'mail.avadeti.com', port: 587, user: 'help@avadeti.com', pass: 'smtp_pass' },
    imap: { host: 'mail.avadeti.com', port: 993, user: 'help@avadeti.com', pass: 'imap_pass' },
    accessList: [admin._id, priya._id],
    createdBy: admin._id
  });

  const infoAccount = await EmailAccount.create({
    address: 'info@avadeti.com',
    displayName: 'Company Info',
    type: 'shared',
    smtp: { host: 'mail.avadeti.com', port: 587, user: 'info@avadeti.com', pass: 'smtp_pass' },
    imap: { host: 'mail.avadeti.com', port: 993, user: 'info@avadeti.com', pass: 'imap_pass' },
    accessList: [admin._id, priya._id, ravi._id],
    createdBy: admin._id
  });

  console.log('Email accounts created');

  // ─── Sample Emails ───
  const thread1 = 'thread_welcome';
  const thread2 = 'thread_project';
  const thread3 = 'thread_help';

  // Admin sends welcome email to all
  const welcomeEmails = [
    { account: adminAccount._id, user: admin._id, folder: 'sent' },
    { account: priyaAccount._id, user: priya._id, folder: 'inbox' },
    { account: raviAccount._id, user: ravi._id, folder: 'inbox' },
    { account: meeraAccount._id, user: meera._id, folder: 'inbox' }
  ];

  for (const e of welcomeEmails) {
    await Email.create({
      account: e.account,
      messageId: '<welcome@avadeti.com>',
      from: 'admin@avadeti.com',
      fromName: 'Yugara Admin',
      to: ['priya@avadeti.com', 'ravi@avadeti.com', 'meera@avadeti.com'],
      subject: 'Welcome to Avadeti Team!',
      bodyHtml: '<h2>Welcome aboard!</h2><p>Hi everyone,</p><p>Welcome to <strong>Avadeti Team</strong>. We\'re excited to have you all here. Please take a moment to set up your accounts and explore the platform.</p><p>Key things to do:</p><ul><li>Update your profile photo</li><li>Check your calendar for upcoming meetings</li><li>Say hi in the #general channel</li></ul><p>Best regards,<br/>Yugara Admin</p>',
      bodyText: 'Welcome aboard!\n\nHi everyone,\nWelcome to Avadeti Team. We\'re excited to have you all here. Please take a moment to set up your accounts and explore the platform.\n\nKey things to do:\n- Update your profile photo\n- Check your calendar for upcoming meetings\n- Say hi in the #general channel\n\nBest regards,\nYugara Admin',
      threadId: thread1,
      folder: e.folder,
      isRead: e.folder === 'sent',
      user: e.user,
      receivedAt: new Date('2026-04-15T09:00:00')
    });
  }

  // Priya replies to welcome
  for (const e of [
    { account: priyaAccount._id, user: priya._id, folder: 'sent' },
    { account: adminAccount._id, user: admin._id, folder: 'inbox' }
  ]) {
    await Email.create({
      account: e.account,
      messageId: '<welcome-reply1@avadeti.com>',
      from: 'priya@avadeti.com',
      fromName: 'Priya Sharma',
      to: ['admin@avadeti.com'],
      subject: 'Re: Welcome to Avadeti Team!',
      bodyHtml: '<p>Thanks for the warm welcome! Looking forward to working with everyone.</p><p>Priya</p>',
      bodyText: 'Thanks for the warm welcome! Looking forward to working with everyone.\n\nPriya',
      inReplyTo: '<welcome@avadeti.com>',
      threadId: thread1,
      folder: e.folder,
      isRead: e.folder === 'sent',
      user: e.user,
      receivedAt: new Date('2026-04-15T09:30:00')
    });
  }

  // Ravi sends project update to Priya
  for (const e of [
    { account: raviAccount._id, user: ravi._id, folder: 'sent' },
    { account: priyaAccount._id, user: priya._id, folder: 'inbox' }
  ]) {
    await Email.create({
      account: e.account,
      messageId: '<project-update@avadeti.com>',
      from: 'ravi@avadeti.com',
      fromName: 'Ravi Kumar',
      to: ['priya@avadeti.com'],
      subject: 'Q2 Dashboard - Progress Update',
      bodyHtml: '<p>Hi Priya,</p><p>Quick update on the Q2 dashboard project:</p><ul><li>Chart components are done (line, bar, pie)</li><li>API integration for attendance data is complete</li><li>Working on the filter panel now</li></ul><p>Should be ready for review by Thursday.</p><p>Ravi</p>',
      bodyText: 'Hi Priya,\n\nQuick update on the Q2 dashboard project:\n- Chart components are done (line, bar, pie)\n- API integration for attendance data is complete\n- Working on the filter panel now\n\nShould be ready for review by Thursday.\n\nRavi',
      threadId: thread2,
      folder: e.folder,
      isRead: e.folder === 'sent',
      user: e.user,
      receivedAt: new Date('2026-04-16T14:00:00')
    });
  }

  // Priya replies to Ravi
  for (const e of [
    { account: priyaAccount._id, user: priya._id, folder: 'sent' },
    { account: raviAccount._id, user: ravi._id, folder: 'inbox' }
  ]) {
    await Email.create({
      account: e.account,
      messageId: '<project-reply@avadeti.com>',
      from: 'priya@avadeti.com',
      fromName: 'Priya Sharma',
      to: ['ravi@avadeti.com'],
      subject: 'Re: Q2 Dashboard - Progress Update',
      bodyHtml: '<p>Great progress, Ravi!</p><p>Thursday works perfectly. I\'ll block some time for the review. Please also add a date-range picker if possible.</p><p>Thanks!<br/>Priya</p>',
      bodyText: 'Great progress, Ravi!\n\nThursday works perfectly. I\'ll block some time for the review. Please also add a date-range picker if possible.\n\nThanks!\nPriya',
      inReplyTo: '<project-update@avadeti.com>',
      threadId: thread2,
      folder: e.folder,
      isRead: e.folder === 'sent',
      user: e.user,
      receivedAt: new Date('2026-04-16T15:30:00')
    });
  }

  // External email to help desk
  await Email.create({
    account: helpAccount._id,
    messageId: '<external-help@client.com>',
    from: 'contact@clientcorp.com',
    fromName: 'Client Corp Support',
    to: ['help@avadeti.com'],
    subject: 'API Access Request',
    bodyHtml: '<p>Hello,</p><p>We would like to request API access for our integration project. Could you please share the documentation and credentials?</p><p>Regards,<br/>Client Corp Team</p>',
    bodyText: 'Hello,\n\nWe would like to request API access for our integration project. Could you please share the documentation and credentials?\n\nRegards,\nClient Corp Team',
    threadId: thread3,
    folder: 'inbox',
    isRead: false,
    user: admin._id,
    receivedAt: new Date('2026-04-17T10:00:00')
  });

  // Same for Priya (shared inbox)
  await Email.create({
    account: helpAccount._id,
    messageId: '<external-help@client.com>',
    from: 'contact@clientcorp.com',
    fromName: 'Client Corp Support',
    to: ['help@avadeti.com'],
    subject: 'API Access Request',
    bodyHtml: '<p>Hello,</p><p>We would like to request API access for our integration project. Could you please share the documentation and credentials?</p><p>Regards,<br/>Client Corp Team</p>',
    bodyText: 'Hello,\n\nWe would like to request API access for our integration project. Could you please share the documentation and credentials?\n\nRegards,\nClient Corp Team',
    threadId: thread3,
    folder: 'inbox',
    isRead: false,
    user: priya._id,
    receivedAt: new Date('2026-04-17T10:00:00')
  });

  // Meera sends an email to admin
  for (const e of [
    { account: meeraAccount._id, user: meera._id, folder: 'sent' },
    { account: adminAccount._id, user: admin._id, folder: 'inbox' }
  ]) {
    await Email.create({
      account: e.account,
      messageId: '<meera-leave@avadeti.com>',
      from: 'meera@avadeti.com',
      fromName: 'Meera Patel',
      to: ['admin@avadeti.com'],
      subject: 'Leave Request - April 21-22',
      bodyHtml: '<p>Hi,</p><p>I would like to request leave for April 21st and 22nd for a family event. I\'ve already updated the attendance system as well.</p><p>Thank you,<br/>Meera</p>',
      bodyText: 'Hi,\n\nI would like to request leave for April 21st and 22nd for a family event. I\'ve already updated the attendance system as well.\n\nThank you,\nMeera',
      folder: e.folder,
      threadId: 'thread_leave_meera',
      isRead: e.folder === 'sent',
      user: e.user,
      receivedAt: new Date('2026-04-17T11:30:00')
    });
  }

  console.log('Sample emails created');

  // ─── Email Categories ───
  await EmailCategory.create({ name: 'Client', color: '#6366F1', user: admin._id });
  await EmailCategory.create({ name: 'Internal', color: '#10B981', user: admin._id });
  await EmailCategory.create({ name: 'Urgent', color: '#EF4444', user: admin._id });
  await EmailCategory.create({ name: 'Updates', color: '#F59E0B', user: priya._id });
  await EmailCategory.create({ name: 'Projects', color: '#3B82F6', user: priya._id });
  await EmailCategory.create({ name: 'Personal', color: '#8B5CF6', user: ravi._id });
  console.log('Email categories created');

  // ─── Email Templates ───
  await EmailTemplate.create({
    name: 'Meeting Follow-up',
    subject: 'Follow-up: {{meeting_title}}',
    bodyHtml: '<p>Hi {{name}},</p><p>Thank you for attending the meeting on <strong>{{meeting_title}}</strong>. Here are the key action items:</p><ul><li>{{action_1}}</li><li>{{action_2}}</li></ul><p>Please update your tasks accordingly.</p><p>Best regards</p>',
    bodyText: 'Hi {{name}},\n\nThank you for attending the meeting on {{meeting_title}}. Here are the key action items:\n- {{action_1}}\n- {{action_2}}\n\nPlease update your tasks accordingly.\n\nBest regards',
    scope: 'company',
    createdBy: admin._id
  });

  await EmailTemplate.create({
    name: 'Welcome New Employee',
    subject: 'Welcome to Avadeti Team, {{name}}!',
    bodyHtml: '<h2>Welcome to the team!</h2><p>Hi {{name}},</p><p>We\'re thrilled to welcome you to Avadeti Team. Here\'s what you need to know:</p><ul><li>Your team: {{team}}</li><li>Your manager: {{manager}}</li><li>Office location: {{office}}</li></ul><p>Please complete your onboarding checklist in the app.</p><p>Warm regards,<br/>HR Team</p>',
    bodyText: 'Welcome to the team!\n\nHi {{name}},\nWe\'re thrilled to welcome you to Avadeti Team.\n\nYour team: {{team}}\nYour manager: {{manager}}\nOffice location: {{office}}\n\nPlease complete your onboarding checklist in the app.\n\nWarm regards,\nHR Team',
    scope: 'company',
    createdBy: admin._id
  });

  await EmailTemplate.create({
    name: 'Quick Check-in',
    subject: 'Quick check-in',
    bodyHtml: '<p>Hi,</p><p>Just wanted to check in on the progress of {{topic}}. Any updates?</p><p>Thanks!</p>',
    bodyText: 'Hi,\n\nJust wanted to check in on the progress of {{topic}}. Any updates?\n\nThanks!',
    scope: 'personal',
    createdBy: priya._id
  });

  console.log('Email templates created');

  // ─── Draft ───
  await EmailDraft.create({
    account: raviAccount._id,
    user: ravi._id,
    to: ['priya@avadeti.com'],
    subject: 'Design review feedback',
    bodyHtml: '<p>Hi Priya,</p><p>I reviewed the latest mockups and here are my thoughts...</p>',
    bodyText: 'Hi Priya,\n\nI reviewed the latest mockups and here are my thoughts...'
  });

  console.log('Sample draft created');

  console.log('\n✅ Email seed complete!');
  process.exit(0);
}

seedEmails().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
