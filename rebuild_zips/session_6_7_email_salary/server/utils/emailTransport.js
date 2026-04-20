// ============================================================================
// emailTransport.js — real SMTP sending + IMAP polling.
// ============================================================================
// Session 6 backend module.
//
// Responsibilities:
//   1. sendEmail(account, message)     — send via SMTP (nodemailer)
//   2. fetchNewEmails(account, cb)     — poll IMAP, yield new messages
//   3. startImapPoller()               — background loop that polls all accounts
//                                        every N minutes and writes new emails
//                                        to the Email collection
//
// Graceful degradation: if nodemailer/imapflow aren't installed yet, the module
// still loads; sendEmail and the poller log a clear warning and behave as
// no-ops. This lets developers run the app without mail infra during dev.
//
// IMPORTANT — SMTP/IMAP passwords:
// The EmailAccount schema stores smtp.pass and imap.pass in plaintext today
// (pre-Session-6 state). This module reads them as-is for compatibility but
// Session 6 also ships a migration helper that encrypts existing passwords
// with the AES helpers from aiAdapters.js. See encryptCredentials() below.
// Any NEW credentials written via the admin endpoint should use the helper.
// ============================================================================

const crypto = require('crypto');
const Email = require('../models/Email').Email;
const EmailAccount = require('../models/Email').EmailAccount;

// ─── Lazy-load mail deps (graceful degradation) ──────────────────────────────
let nodemailer = null;
let ImapFlow = null;
let mailDepsAvailable = true;
let mailDepsReason = '';
try {
  // eslint-disable-next-line global-require, import/no-unresolved
  nodemailer = require('nodemailer');
} catch (e) {
  mailDepsAvailable = false;
  mailDepsReason = 'nodemailer not installed';
}
try {
  // eslint-disable-next-line global-require, import/no-unresolved
  const imapflow = require('imapflow');
  ImapFlow = imapflow.ImapFlow;
} catch (e) {
  mailDepsAvailable = false;
  mailDepsReason = mailDepsReason || 'imapflow not installed';
}

if (!mailDepsAvailable) {
  console.warn(`[email] ${mailDepsReason}. Run "npm install nodemailer imapflow" in server/ to enable real email.`);
  console.warn('[email] SMTP send and IMAP poll are no-ops until installed.');
}

// ─── Credential encryption (uses AI master secret — shared) ─────────────────
// Note: we reuse AI_MASTER_SECRET here because the project only has one master
// secret concept. In a hardened deployment you'd have a dedicated EMAIL secret.
const MASTER_SECRET = process.env.AI_MASTER_SECRET;
const PREFIX = 'enc:';  // marker so we can tell encrypted from plaintext

function encryptCredential(plaintext) {
  if (!plaintext || String(plaintext).startsWith(PREFIX)) return plaintext;
  if (!MASTER_SECRET) return plaintext;  // no-op if not configured; warned on boot

  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(MASTER_SECRET, 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(String(plaintext), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return PREFIX + iv.toString('hex') + ':' + encrypted;
}

function decryptCredential(stored) {
  if (!stored) return '';
  if (!String(stored).startsWith(PREFIX)) return stored;  // plaintext (legacy)
  if (!MASTER_SECRET) {
    throw new Error('Cannot decrypt email credential: AI_MASTER_SECRET not configured.');
  }

  const body = String(stored).slice(PREFIX.length);
  const [ivHex, encrypted] = body.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const key = crypto.scryptSync(MASTER_SECRET, 'salt', 32);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Helper — build the auth object for nodemailer/imapflow from a stored account
function resolveAuth(credentials) {
  return {
    user: credentials.user,
    pass: decryptCredential(credentials.pass),
  };
}

// ─── SMTP send ──────────────────────────────────────────────────────────────

/**
 * Send a single email via the account's SMTP config.
 * Returns { accepted, rejected, messageId } on success or throws.
 */
async function sendEmail(account, { to, cc, bcc, subject, html, text, inReplyTo, references, attachments }) {
  if (!mailDepsAvailable || !nodemailer) {
    throw new Error(`Email sending unavailable: ${mailDepsReason}`);
  }
  if (!account?.smtp?.host) {
    throw new Error('Account has no SMTP configuration.');
  }

  const transport = nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port || 587,
    secure: !!account.smtp.secure,
    auth: resolveAuth(account.smtp),
    // Sensible timeouts so a stuck SMTP server doesn't hang the request
    connectionTimeout: 15_000,
    socketTimeout: 30_000,
  });

  const info = await transport.sendMail({
    from: `"${account.displayName || ''}" <${account.address}>`,
    to: Array.isArray(to) ? to.join(', ') : to,
    cc: cc && cc.length ? (Array.isArray(cc) ? cc.join(', ') : cc) : undefined,
    bcc: bcc && bcc.length ? (Array.isArray(bcc) ? bcc.join(', ') : bcc) : undefined,
    subject,
    html,
    text,
    inReplyTo,
    references,
    attachments,
  });

  transport.close();
  return info;
}

// ─── IMAP poll ──────────────────────────────────────────────────────────────

/**
 * Connect to IMAP, fetch unseen messages since the last poll, and invoke
 * `onMessage(msg, account)` for each. Marks them seen on the server.
 */
async function fetchNewEmails(account, onMessage) {
  if (!mailDepsAvailable || !ImapFlow) {
    console.warn('[email] IMAP poll skipped:', mailDepsReason);
    return 0;
  }
  if (!account?.imap?.host) return 0;

  const client = new ImapFlow({
    host: account.imap.host,
    port: account.imap.port || 993,
    secure: account.imap.tls !== false,
    auth: resolveAuth(account.imap),
    logger: false,
  });

  try {
    await client.connect();
    await client.mailboxOpen('INBOX');

    let count = 0;
    // Fetch UNSEEN messages only — minimizes load, avoids reprocessing
    for await (const msg of client.fetch({ seen: false }, {
      uid: true, envelope: true, source: true, flags: true,
    })) {
      try {
        await onMessage(msg, account);
        count++;
        // Mark seen on the IMAP server so we don't re-download next poll
        await client.messageFlagsAdd(msg.uid, ['\\Seen'], { uid: true });
      } catch (err) {
        console.error('[email] failed to process incoming message', msg.uid, err.message);
      }
    }
    return count;
  } finally {
    try { await client.logout(); } catch {}
  }
}

// ─── Ingest helper: turn an IMAP message into an Email document ─────────────

async function ingestImapMessage(msg, account) {
  // imapflow gives envelope (headers) + raw source
  const env = msg.envelope || {};
  const messageId = env.messageId || `<${Date.now()}.${msg.uid}@imap.local>`;

  // Dedup check — don't import the same message twice
  const existing = await Email.findOne({ account: account._id, messageId });
  if (existing) return null;

  // Parse the raw source for body (simple approach — full MIME parsing is
  // another package like mailparser; for now extract text/html sections).
  let bodyText = '';
  let bodyHtml = '';
  if (msg.source) {
    const src = msg.source.toString('utf8');
    // Very small heuristic: look for html-part, otherwise use the whole source
    const htmlMatch = src.match(/Content-Type:\s*text\/html[\s\S]*?\r?\n\r?\n([\s\S]+?)(?=\r?\n--|\r?\n$)/i);
    const textMatch = src.match(/Content-Type:\s*text\/plain[\s\S]*?\r?\n\r?\n([\s\S]+?)(?=\r?\n--|\r?\n$)/i);
    if (htmlMatch) bodyHtml = htmlMatch[1].trim();
    if (textMatch) bodyText = textMatch[1].trim();
    if (!bodyText && !bodyHtml) bodyText = src;
  }

  // threadId — use References header if present, else fall back to messageId
  let threadId = messageId;
  if (msg.source) {
    const refMatch = String(msg.source).match(/^References:\s*(.+?)(?=\r?\n[A-Z])/mi);
    if (refMatch) {
      // First msg-id in the references chain = thread root
      const first = refMatch[1].match(/<[^>]+>/);
      if (first) threadId = first[0];
    }
  }

  const fromObj = env.from?.[0] || {};
  const fromAddr = fromObj.address || '';
  const fromName = fromObj.name || '';

  // Resolve the local user — personal account owner, or each shared-access user
  // For shared accounts we create one Email doc per access user so each user's
  // inbox reflects the arrival.
  const targetUsers = account.type === 'shared'
    ? (account.accessList || [])
    : (account.owner ? [account.owner] : []);

  const created = [];
  for (const userId of targetUsers) {
    const e = await Email.create({
      account: account._id,
      messageId,
      threadId,
      inReplyTo: env.inReplyTo,
      from: fromAddr,
      fromName,
      to: (env.to || []).map(a => a.address).filter(Boolean),
      cc: (env.cc || []).map(a => a.address).filter(Boolean),
      subject: env.subject || '(No Subject)',
      bodyText,
      bodyHtml,
      folder: 'inbox',
      isRead: false,
      user: userId,
      receivedAt: env.date || new Date(),
    });
    created.push(e);
  }

  return created;
}

// ─── Background poller ──────────────────────────────────────────────────────

let pollerHandle = null;

function startImapPoller({ intervalMs = 5 * 60 * 1000, io } = {}) {
  if (!mailDepsAvailable) {
    console.warn('[email] IMAP poller not started:', mailDepsReason);
    return;
  }
  if (pollerHandle) return;  // idempotent

  const tick = async () => {
    try {
      const accounts = await EmailAccount.find({ isActive: true, 'imap.host': { $exists: true, $ne: '' } });
      for (const account of accounts) {
        try {
          await fetchNewEmails(account, async (msg) => {
            const created = await ingestImapMessage(msg, account);
            if (created && io) {
              for (const e of created) {
                io.to(`user:${e.user}`).emit('email:new', {
                  emailId: e._id,
                  from: e.from, fromName: e.fromName,
                  subject: e.subject,
                  preview: (e.bodyText || '').substring(0, 100),
                });
              }
            }
          });
        } catch (err) {
          console.error(`[email] IMAP poll failed for ${account.address}:`, err.message);
        }
      }
    } catch (err) {
      console.error('[email] IMAP poller tick failed:', err.message);
    }
  };

  pollerHandle = setInterval(tick, intervalMs);
  // Kick off first poll ~10s after boot
  setTimeout(tick, 10_000);
  console.log(`[email] IMAP poller started (every ${Math.round(intervalMs / 1000)}s).`);
}

function stopImapPoller() {
  if (pollerHandle) { clearInterval(pollerHandle); pollerHandle = null; }
}

module.exports = {
  sendEmail,
  fetchNewEmails,
  ingestImapMessage,
  startImapPoller,
  stopImapPoller,
  encryptCredential,
  decryptCredential,
  mailDepsAvailable,
};
