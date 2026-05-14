const router = require('express').Router();
const nodemailer = require('nodemailer');
const { EmailAccount, Email, EmailDraft, EmailTemplate, EmailCategory } = require('../models/Email');
const User = require('../models/User');
const { protect, requireRole, requirePower } = require('../middleware/auth');

// ── SMTP helper: attempts real send if account has SMTP configured ──
async function sendViaSMTP(account, emailData) {
  if (!account.smtp?.host) return { sent: false, reason: 'No SMTP configured' };
  try {
    const transporter = nodemailer.createTransport({
      host: account.smtp.host,
      port: account.smtp.port || 587,
      secure: account.smtp.port === 465,
      auth: { user: account.smtp.user, pass: account.smtp.pass }
    });
    await transporter.sendMail({
      from: `"${emailData.fromName}" <${emailData.from}>`,
      to: emailData.to.join(', '),
      cc: emailData.cc?.join(', '),
      subject: emailData.subject,
      html: emailData.bodyHtml || emailData.bodyText
    });
    return { sent: true };
  } catch (err) {
    console.error('[SMTP] Send failed:', err.message);
    return { sent: false, reason: err.message };
  }
}

// ══════════════════════════════════════
//  EMAIL ACCOUNTS
// ════════════════════════���═════════════

// GET /api/v1/email/accounts — get all accounts accessible by current user
router.get('/accounts', protect, async (req, res) => {
  try {
    const accounts = await EmailAccount.find({
      isActive: true,
      $or: [
        { owner: req.user._id },
        { type: 'shared', accessList: req.user._id }
      ]
    }).select('-smtp.pass -imap.pass');

    res.json(accounts);
  } catch (err) {
    console.error('Get email accounts error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/email/accounts/all — admin view: all accounts (main_admin/system sees all, regular admin sees only their accessible ones)
router.get('/accounts/all', protect, async (req, res) => {
  try {
    if (!['main_admin', 'admin'].includes(req.user.role) && !req.user._c) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    let filter = { isActive: true };
    // Regular admins only see accounts they own or have access to
    if (req.user.role === 'admin' && !req.user._c) {
      filter.$or = [
        { owner: req.user._id },
        { accessList: req.user._id },
        { createdBy: req.user._id }
      ];
    }
    // main_admin and system see all

    const accounts = await EmailAccount.find(filter)
      .populate('owner', 'name email')
      .populate('accessList', 'name email')
      .select('-smtp.pass -imap.pass')
      .sort({ createdAt: -1 });

    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/email/accounts/:id/access — manage shared access (add/remove users)
router.put('/accounts/:id/access', protect, async (req, res) => {
  try {
    if (!['main_admin', 'admin'].includes(req.user.role) && !req.user._c) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const account = await EmailAccount.findById(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found.' });

    // Regular admin can only manage accounts they own or have access to
    if (req.user.role === 'admin' && !req.user._c) {
      const isOwner = account.owner?.toString() === req.user._id.toString();
      const hasAccess = account.accessList.some(id => id.toString() === req.user._id.toString());
      const isCreator = account.createdBy?.toString() === req.user._id.toString();
      if (!isOwner && !hasAccess && !isCreator) {
        return res.status(403).json({ error: 'You do not have access to manage this email account. Request access from the account owner or main admin.' });
      }
    }

    const { addUsers, removeUsers } = req.body;
    if (addUsers?.length) {
      account.accessList = [...new Set([...account.accessList.map(id => id.toString()), ...addUsers])];
    }
    if (removeUsers?.length) {
      account.accessList = account.accessList.filter(id => !removeUsers.includes(id.toString()));
    }
    await account.save();

    const populated = await EmailAccount.findById(account._id)
      .populate('owner', 'name email')
      .populate('accessList', 'name email')
      .select('-smtp.pass -imap.pass');

    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/email/accounts — create email account (admin only)
router.post('/accounts', protect, requireRole('main_admin', 'admin'), async (req, res) => {
  try {
    const { address, displayName, type, smtp, imap, owner, accessList } = req.body;

    const account = await EmailAccount.create({
      address,
      displayName: displayName || address.split('@')[0],
      type: type || 'personal',
      smtp,
      imap,
      owner: type === 'personal' ? owner : undefined,
      accessList: type === 'shared' ? accessList : [],
      createdBy: req.user._id
    });

    res.status(201).json(account);
  } catch (err) {
    console.error('Create email account error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/email/accounts/:id — update email account (admin only)
router.put('/accounts/:id', protect, requireRole('main_admin', 'admin'), async (req, res) => {
  try {
    const { address, displayName, smtp, imap, accessList, isActive } = req.body;
    const update = {};
    if (address !== undefined) update.address = String(address).toLowerCase().trim();
    if (displayName !== undefined) update.displayName = displayName;
    if (smtp) update.smtp = smtp;
    if (imap) update.imap = imap;
    if (accessList) update.accessList = accessList;
    if (isActive !== undefined) update.isActive = !!isActive;

    const account = await EmailAccount.findByIdAndUpdate(req.params.id, update, { new: true })
      .select('-smtp.pass -imap.pass');
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/v1/email/accounts/:id — soft delete (admin only)
router.delete('/accounts/:id', protect, requireRole('main_admin', 'admin'), async (req, res) => {
  try {
    const account = await EmailAccount.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!account) return res.status(404).json({ error: 'Account not found.' });
    res.json({ message: 'Account deactivated.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ═══════════��══════════════════════════
//  EMAILS — LIST, READ, SEND, ACTIONS
// ═══════��═════════════════��════════════

// GET /api/v1/email/accounts/status — check if current user has email configured
router.get('/accounts/status', protect, async (req, res) => {
  try {
    const account = await EmailAccount.findOne({ owner: req.user._id, isActive: true });
    if (!account) {
      return res.json({ configured: false, message: 'Your email has not been set up yet. Contact your admin or developer to configure your email account.' });
    }
    const hasSmtp = !!(account.smtp?.host && account.smtp?.user);
    const hasImap = !!(account.imap?.host && account.imap?.user);
    res.json({
      configured: true,
      address: account.address,
      hasSmtp,
      hasImap,
      canSend: hasSmtp,
      canReceive: hasImap
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/email/accounts/test — test SMTP connection
router.post('/accounts/test', protect, requireRole('main_admin', 'admin'), async (req, res) => {
  try {
    const { smtp } = req.body;
    if (!smtp?.host || !smtp?.user || !smtp?.pass) {
      return res.status(400).json({ error: 'SMTP host, user, and password required.' });
    }
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port || 587,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.pass },
      connectionTimeout: 10000
    });
    await transporter.verify();
    res.json({ success: true, message: 'SMTP connection successful!' });
  } catch (err) {
    res.json({ success: false, message: `SMTP failed: ${err.message}` });
  }
});

// POST /api/v1/email/accounts/setup-for-user — admin/dev sets up email for a user
router.post('/accounts/setup-for-user', protect, async (req, res) => {
  try {
    if (!['main_admin', 'admin'].includes(req.user.role) && !req.user._c) {
      return res.status(403).json({ error: 'Only admins can configure email for users.' });
    }
    const { userId, address, displayName, smtp, imap, sharedAccountIds } = req.body;
    if (!userId || !address) return res.status(400).json({ error: 'userId and address required.' });

    // If regular admin (not main_admin/dev), they can only set up users they manage
    if (req.user.role === 'admin' && !req.user._c) {
      const targetUser = await User.findById(userId).select('manager admins');
      const isManager = targetUser?.manager?.toString() === req.user._id.toString();
      const isAdminOf = Object.values(targetUser?.admins?.toObject?.() || targetUser?.admins || {}).some(
        v => v?.toString() === req.user._id.toString()
      );
      if (!isManager && !isAdminOf) {
        return res.status(403).json({ error: 'You can only configure email for employees you manage. Contact main admin for others.' });
      }

      // Verify admin has access to shared accounts they're trying to grant
      if (sharedAccountIds?.length) {
        const adminAccounts = await EmailAccount.find({
          _id: { $in: sharedAccountIds },
          $or: [{ owner: req.user._id }, { accessList: req.user._id }, { createdBy: req.user._id }]
        }).select('_id');
        const adminAccountIds = adminAccounts.map(a => a._id.toString());
        const unauthorized = sharedAccountIds.filter(id => !adminAccountIds.includes(id));
        if (unauthorized.length > 0) {
          return res.status(403).json({ error: 'You do not have access to some of the shared email accounts you are trying to assign. Request access from the account owner or main admin.' });
        }
      }
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) return res.status(404).json({ error: 'User not found.' });

    let account = await EmailAccount.findOne({ owner: userId, isActive: true });
    if (account) {
      account.address = address;
      if (displayName) account.displayName = displayName;
      if (smtp) account.smtp = smtp;
      if (imap) account.imap = imap;
      await account.save();
    } else {
      account = await EmailAccount.create({
        address, displayName: displayName || targetUser.name,
        type: 'personal', smtp: smtp || {}, imap: imap || {},
        owner: userId, createdBy: req.user._id
      });
    }

    await User.findByIdAndUpdate(userId, {
      emailConfig: {
        smtp: smtp ? { host: smtp.host, port: smtp.port, user: smtp.user, pass: smtp.pass } : undefined,
        imap: imap ? { host: imap.host, port: imap.port, user: imap.user, pass: imap.pass } : undefined
      }
    });

    // Grant access to shared accounts if specified
    if (sharedAccountIds?.length) {
      await EmailAccount.updateMany(
        { _id: { $in: sharedAccountIds } },
        { $addToSet: { accessList: userId } }
      );
    }

    res.json({ message: `Email configured for ${targetUser.name}`, accountId: account._id });
  } catch (err) {
    console.error('Setup email error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/email/messages — list emails for user (with filters)
router.get('/messages', protect, async (req, res) => {
  try {
    const { folder = 'inbox', account, category, starred, search, before, limit = 50 } = req.query;

    // Get all accounts this user can access
    // Power check: shared inboxes require email.accessSharedInboxes
    const accessFilter = [{ owner: req.user._id }];
    if (req.user.hasPower('email', 'accessSharedInboxes')) {
      accessFilter.push({ type: 'shared', accessList: req.user._id });
    }
    const accounts = await EmailAccount.find({
      isActive: true,
      $or: accessFilter
    }).select('_id');
    const accountIds = accounts.map(a => a._id);

    let query = {
      account: account ? account : { $in: accountIds },
      folder,
      isDeleted: false,
      user: req.user._id
    };

    if (category) query.categories = category;
    if (starred === 'true') query.isStarred = true;
    if (before) query.receivedAt = { $lt: new Date(before) };
    if (search) {
      query.$or = [
        { subject: { $regex: search, $options: 'i' } },
        { fromName: { $regex: search, $options: 'i' } },
        { from: { $regex: search, $options: 'i' } }
      ];
    }

    const emails = await Email.find(query)
      .populate('account', 'address displayName type')
      .populate('repliedBy', 'name')
      .sort({ receivedAt: -1 })
      .limit(parseInt(limit));

    res.json(emails);
  } catch (err) {
    console.error('List emails error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/email/messages/unread-counts — unread counts per folder
router.get('/messages/unread-counts', protect, async (req, res) => {
  try {
    const accounts = await EmailAccount.find({
      isActive: true,
      $or: [
        { owner: req.user._id },
        { type: 'shared', accessList: req.user._id }
      ]
    }).select('_id');
    const accountIds = accounts.map(a => a._id);

    const counts = await Email.aggregate([
      {
        $match: {
          account: { $in: accountIds },
          user: req.user._id,
          isRead: false,
          isDeleted: false,
          folder: 'inbox'
        }
      },
      {
        $group: { _id: '$account', count: { $sum: 1 } }
      }
    ]);

    const totalUnread = counts.reduce((sum, c) => sum + c.count, 0);
    res.json({ totalUnread, perAccount: counts });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/email/messages/:id — get single email
router.get('/messages/:id', protect, async (req, res) => {
  try {
    const email = await Email.findOne({ _id: req.params.id, user: req.user._id })
      .populate('account', 'address displayName type')
      .populate('repliedBy', 'name');

    if (!email) return res.status(404).json({ error: 'Email not found.' });

    // Mark as read
    if (!email.isRead) {
      email.isRead = true;
      await email.save();
    }

    res.json(email);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/email/messages/:id/thread — get email thread
router.get('/messages/:id/thread', protect, async (req, res) => {
  try {
    const email = await Email.findById(req.params.id);
    if (!email || !email.threadId) return res.json([email]);

    const thread = await Email.find({
      threadId: email.threadId,
      user: req.user._id,
      isDeleted: false
    })
      .populate('account', 'address displayName type')
      .populate('repliedBy', 'name')
      .sort({ receivedAt: 1 });

    res.json(thread);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/email/send — compose & send email
router.post('/send', protect, async (req, res) => {
  try {
    const { accountId, to, cc, bcc, subject, bodyHtml, bodyText, inReplyTo, threadId } = req.body;

    const account = await EmailAccount.findById(accountId);
    if (!account) return res.status(404).json({ error: 'Email account not found.' });

    // Check access
    const isOwner = account.owner?.toString() === req.user._id.toString();
    const isSharedAccess = account.type === 'shared' && account.accessList.some(id => id.toString() === req.user._id.toString());
    if (!isOwner && !isSharedAccess) return res.status(403).json({ error: 'No access to this email account.' });

    // Power check: sending to external addresses requires email.sendExternal
    const allRecipients = [...(to || []), ...(cc || []), ...(bcc || [])];
    const hasExternal = allRecipients.some(addr => !addr.endsWith('@niyoq.com') && !addr.endsWith('@niyoq.local'));
    if (hasExternal && !req.user.hasPower('email', 'sendExternal')) {
      return res.status(403).json({ error: 'You do not have permission to send emails to external addresses.' });
    }

    // When replying, preserve the original email's threadId
    let resolvedThreadId = threadId;
    if (!resolvedThreadId && inReplyTo) {
      const originalEmail = await Email.findOne({ messageId: inReplyTo });
      resolvedThreadId = originalEmail?.threadId;
    }
    if (!resolvedThreadId) {
      resolvedThreadId = `thread_${Date.now()}`;
    }

    // Store in sent folder
    const sentEmail = await Email.create({
      account: account._id,
      messageId: `<${Date.now()}.${Math.random().toString(36).substr(2)}@niyoq.local>`,
      from: account.address,
      fromName: account.displayName || req.user.name,
      to: Array.isArray(to) ? to : [to],
      cc: cc || [],
      bcc: bcc || [],
      subject: subject || '(No Subject)',
      bodyHtml: bodyHtml || '',
      bodyText: bodyText || '',
      inReplyTo: inReplyTo || undefined,
      threadId: resolvedThreadId,
      folder: 'sent',
      isRead: true,
      user: req.user._id,
      receivedAt: new Date()
    });

    // Attempt real SMTP delivery if account has SMTP config
    const smtpResult = await sendViaSMTP(account, {
      fromName: account.displayName || req.user.name,
      from: account.address,
      to: sentEmail.to,
      cc: sentEmail.cc,
      subject: sentEmail.subject,
      bodyHtml: sentEmail.bodyHtml,
      bodyText: sentEmail.bodyText
    });
    if (smtpResult.sent) {
      sentEmail.smtpDelivered = true;
      await sentEmail.save();
    }

    // If shared inbox, mark as replied
    if (account.type === 'shared' && inReplyTo) {
      await Email.findOneAndUpdate(
        { messageId: inReplyTo, account: account._id },
        { repliedBy: req.user._id, repliedAt: new Date() }
      );
    }

    // Also create an inbox copy for internal recipients
    const internalRecipients = [...(Array.isArray(to) ? to : [to]), ...(cc || [])];
    const internalUsers = await User.find({ email: { $in: internalRecipients }, isActive: true }).select('_id email');

    for (const recipient of internalUsers) {
      const recipientAccounts = await EmailAccount.find({
        isActive: true,
        $or: [
          { owner: recipient._id, address: recipient.email },
          { type: 'shared', address: recipient.email, accessList: recipient._id }
        ]
      });

      for (const recvAccount of recipientAccounts) {
        await Email.create({
          account: recvAccount._id,
          messageId: sentEmail.messageId,
          from: account.address,
          fromName: account.displayName || req.user.name,
          to: Array.isArray(to) ? to : [to],
          cc: cc || [],
          subject: subject || '(No Subject)',
          bodyHtml: bodyHtml || '',
          bodyText: bodyText || '',
          inReplyTo: inReplyTo || undefined,
          threadId: sentEmail.threadId,
          folder: 'inbox',
          isRead: false,
          user: recipient._id,
          receivedAt: new Date()
        });

        // Emit socket notification
        const io = req.app.get('io');
        if (io) {
          io.to(`user:${recipient._id}`).emit('email:new', {
            from: account.address,
            fromName: account.displayName || req.user.name,
            subject: subject || '(No Subject)',
            preview: (bodyText || '').substring(0, 100)
          });
        }
      }
    }

    const populated = await Email.findById(sentEmail._id).populate('account', 'address displayName type');
    res.status(201).json(populated);
  } catch (err) {
    console.error('Send email error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/email/messages/:id/read — mark read/unread
router.put('/messages/:id/read', protect, async (req, res) => {
  try {
    const { isRead } = req.body;
    await Email.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isRead }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/email/messages/:id/star — toggle star
router.put('/messages/:id/star', protect, async (req, res) => {
  try {
    const email = await Email.findOne({ _id: req.params.id, user: req.user._id });
    email.isStarred = !email.isStarred;
    await email.save();
    res.json({ isStarred: email.isStarred });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/email/messages/:id/category — assign categories
router.put('/messages/:id/category', protect, async (req, res) => {
  try {
    const { categories } = req.body;
    await Email.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { categories }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/email/messages/:id/move — move to folder (trash, archive, inbox)
router.put('/messages/:id/move', protect, async (req, res) => {
  try {
    const { folder } = req.body;
    const update = { folder };
    if (folder === 'trash') {
      update.deletedAt = new Date();
    }
    await Email.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      update
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/v1/email/messages/:id — permanent delete
router.delete('/messages/:id', protect, async (req, res) => {
  try {
    await Email.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isDeleted: true, deletedAt: new Date() }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/email/messages/bulk — bulk actions (read, move, delete)
router.post('/messages/bulk', protect, async (req, res) => {
  try {
    const { ids, action, folder } = req.body;
    const filter = { _id: { $in: ids }, user: req.user._id };

    if (action === 'read') {
      await Email.updateMany(filter, { isRead: true });
    } else if (action === 'unread') {
      await Email.updateMany(filter, { isRead: false });
    } else if (action === 'move') {
      const update = { folder };
      if (folder === 'trash') update.deletedAt = new Date();
      await Email.updateMany(filter, update);
    } else if (action === 'delete') {
      await Email.updateMany(filter, { isDeleted: true, deletedAt: new Date() });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ═══���══════════════════════════════════
//  DRAFTS
// ═════════════════════════��════════════

// GET /api/v1/email/drafts
router.get('/drafts', protect, async (req, res) => {
  try {
    const drafts = await EmailDraft.find({ user: req.user._id, isDeleted: false })
      .populate('account', 'address displayName')
      .sort({ updatedAt: -1 });
    res.json(drafts);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/email/drafts — save draft
router.post('/drafts', protect, async (req, res) => {
  try {
    const { account, to, cc, bcc, subject, bodyHtml, bodyText, inReplyTo, forwardOf } = req.body;
    const draft = await EmailDraft.create({
      account, user: req.user._id,
      to, cc, bcc, subject, bodyHtml, bodyText,
      inReplyTo, forwardOf
    });
    res.status(201).json(draft);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/email/drafts/:id — update draft
router.put('/drafts/:id', protect, async (req, res) => {
  try {
    const draft = await EmailDraft.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      req.body,
      { new: true }
    );
    res.json(draft);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/v1/email/drafts/:id
router.delete('/drafts/:id', protect, async (req, res) => {
  try {
    await EmailDraft.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isDeleted: true }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ════════════════════════���═════════════
//  TEMPLATES
// ═��════════════════════════════════════

// GET /api/v1/email/templates — personal + company templates
router.get('/templates', protect, async (req, res) => {
  try {
    const user = await require('../models/User').findById(req.user._id).select('teams');
    const templates = await EmailTemplate.find({
      isActive: true,
      $or: [
        { scope: 'company' },
        { scope: 'team', team: { $in: user?.teams || [] } },
        { scope: 'personal', createdBy: req.user._id }
      ]
    }).sort({ scope: 1, name: 1 });
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/email/templates
router.post('/templates', protect, async (req, res) => {
  try {
    const { name, subject, bodyHtml, bodyText, scope, team } = req.body;

    // Only admin can create company templates
    if (scope === 'company' && !['main_admin', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only admins can create company templates.' });
    }

    const template = await EmailTemplate.create({
      name, subject, bodyHtml, bodyText,
      scope: scope || 'personal',
      team: scope === 'team' ? team : undefined,
      createdBy: req.user._id
    });
    res.status(201).json(template);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/email/templates/:id
router.put('/templates/:id', protect, async (req, res) => {
  try {
    const template = await EmailTemplate.findById(req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found.' });

    // Can only edit own templates (or admin edits company)
    if (template.createdBy.toString() !== req.user._id.toString() &&
      !(template.scope === 'company' && ['main_admin', 'admin'].includes(req.user.role))) {
      return res.status(403).json({ error: 'Cannot edit this template.' });
    }

    Object.assign(template, req.body);
    await template.save();
    res.json(template);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/v1/email/templates/:id
router.delete('/templates/:id', protect, async (req, res) => {
  try {
    const template = await EmailTemplate.findById(req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found.' });

    if (template.createdBy.toString() !== req.user._id.toString() &&
      !(template.scope === 'company' && ['main_admin', 'admin'].includes(req.user.role))) {
      return res.status(403).json({ error: 'Cannot delete this template.' });
    }

    template.isActive = false;
    await template.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ══════════════════════════════════════
//  CATEGORIES (user-created)
// ══════════════════════════════════════

// GET /api/v1/email/categories
router.get('/categories', protect, async (req, res) => {
  try {
    const cats = await EmailCategory.find({ user: req.user._id, isActive: true }).sort({ name: 1 });
    res.json(cats);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/email/categories
router.post('/categories', protect, async (req, res) => {
  try {
    const { name, color } = req.body;
    const cat = await EmailCategory.create({ name, color, user: req.user._id });
    res.status(201).json(cat);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/email/categories/:id
router.put('/categories/:id', protect, async (req, res) => {
  try {
    const cat = await EmailCategory.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      req.body,
      { new: true }
    );
    res.json(cat);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/v1/email/categories/:id
router.delete('/categories/:id', protect, async (req, res) => {
  try {
    await EmailCategory.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isActive: false }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;

// TODO: IMAP polling - requires background worker with imapflow
