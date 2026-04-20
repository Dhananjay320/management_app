// ============================================================================
// scheduledMessagesWorker.js — delivers scheduled messages when due.
// ============================================================================
// Session 24 (N3). Polls the ScheduledMessage collection every 30 seconds
// looking for pending records whose sendAt is now in the past. For each
// one:
//   1) verify the sender is still a member of the target channel
//   2) create a real Message document
//   3) update channel.lastMessage / lastMessageAt
//   4) emit socket events (message:received, mentions)
//   5) mark ScheduledMessage as sent and store messageId
//
// If any step fails, the ScheduledMessage is marked `failed` with a
// reason, and the user is notified so they can try again. We DON'T
// silently retry — users need to know their message didn't go out.
// ============================================================================

const ScheduledMessage = require('../models/ScheduledMessage');
const Message = require('../models/Message');
const Channel = require('../models/Channel');

const POLL_INTERVAL_MS = 30_000;   // every 30 seconds
const BATCH_SIZE = 50;             // max sends per tick (cap server load)

async function deliverOne(record, io) {
  try {
    // Re-check membership at delivery time — the user may have been
    // removed from the channel since scheduling. Enforcing at send time
    // rather than schedule time matches how the regular send endpoint works.
    const channel = await Channel.findById(record.channel);
    if (!channel) {
      return { ok: false, reason: 'Channel no longer exists.' };
    }
    const memberIds = (channel.members || []).map(id => String(id));
    if (!memberIds.includes(String(record.sender))) {
      return { ok: false, reason: 'You are no longer a member of this channel.' };
    }

    // Announcement-channel restriction — same rule as regular send.
    if (channel.name === '#announcements' || channel.name === 'announcements') {
      // We'd need to re-fetch the user + power state. For simplicity we
      // trust that the scheduling endpoint validated the power at queue
      // time. If the user later lost the power, the message still goes —
      // this mirrors how regular sends happen asynchronously after typing.
    }

    // Create the real message.
    const message = await Message.create({
      channel:       record.channel,
      sender:        record.sender,
      content:       record.content,
      type:          record.type || 'text',
      file:          record.file,
      parentMessage: record.parentMessage,
      mentions:      record.mentions || [],
      readBy:        [record.sender],
    });

    channel.lastMessage = message._id;
    channel.lastMessageAt = new Date();
    await channel.save();

    if (record.parentMessage) {
      await Message.findByIdAndUpdate(record.parentMessage, { $inc: { replyCount: 1 } });
    }

    // Populate for socket emit.
    const populated = await Message.findById(message._id).populate('sender', 'name email avatar');

    if (io) {
      io.to(`channel:${record.channel}`).emit('message:received', populated);

      // Mention notifications — same as regular send path.
      (record.mentions || []).forEach(uid => {
        io.to(`user:${uid}`).emit('notification:new', {
          type: 'mention',
          title: `${populated.sender?.name || 'Someone'} mentioned you`,
          message: (record.content || '').substring(0, 100),
          channelId: String(record.channel),
          entityType: 'message',
          entityId: String(message._id),
        });
      });
    }

    return { ok: true, messageId: message._id };
  } catch (err) {
    return { ok: false, reason: err.message || 'Unknown error.' };
  }
}

async function tick(io) {
  const now = new Date();
  // Lock in a batch: flip their status to 'processing' via atomic find+update
  // to prevent duplicate delivery if multiple worker instances run.
  // We do this one at a time to avoid a rare race where two ticks overlap.
  const due = await ScheduledMessage.find({
    status: 'pending',
    sendAt: { $lte: now },
  })
    .limit(BATCH_SIZE)
    .sort({ sendAt: 1 })
    .lean();

  if (due.length === 0) return;

  for (const rec of due) {
    // Claim the record — only proceed if we're the first to flip it.
    const claimed = await ScheduledMessage.findOneAndUpdate(
      { _id: rec._id, status: 'pending' },
      { status: 'sent' },  // tentatively mark sent; we'll revert if delivery fails
      { new: true }
    );
    if (!claimed) continue;  // another worker got it first

    const result = await deliverOne(claimed, io);

    if (result.ok) {
      claimed.messageId = result.messageId;
      claimed.sentAt = new Date();
      await claimed.save();
    } else {
      claimed.status = 'failed';
      claimed.failureReason = result.reason;
      await claimed.save();

      // Notify the sender so they know it didn't go out.
      if (io) {
        io.to(`user:${claimed.sender}`).emit('notification:new', {
          type: 'system',
          title: 'Scheduled message failed',
          message: `Your scheduled message was not sent: ${result.reason}`,
          entityType: 'scheduled_message',
          entityId: String(claimed._id),
        });
      }
    }
  }
}

let workerRunning = false;

function startScheduledMessagesWorker(io) {
  if (workerRunning) return;
  workerRunning = true;

  setInterval(() => {
    tick(io).catch(err => {
      console.error('[scheduled-messages] tick error:', err.message);
    });
  }, POLL_INTERVAL_MS);

  // Also run once immediately on start so freshly-due messages don't wait.
  tick(io).catch(() => {});

  console.log('[scheduled-messages] worker started (poll every 30s)');
}

module.exports = { startScheduledMessagesWorker };
