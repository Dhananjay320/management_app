// Single canonical helper for sending a notification to a user.
// Always creates a DB row (so it shows in the notification center AND triggers
// the post-save hook that pushes to all active devices) AND emits the live
// socket event for users currently in-session.
const Notification = require('../models/Notification');

async function notifyUser(io, userId, payload) {
  if (!userId) return null;
  try {
    const notif = await Notification.create({
      user: userId,
      type: payload.type || 'system',
      title: payload.title,
      message: payload.message || '',
      entityType: payload.entityType,
      entityId: payload.entityId,
      sender: payload.sender,
      isEmergency: !!payload.isEmergency,
      actionType: payload.actionType,
      actionTarget: payload.actionTarget
    });
    if (io) {
      const event = payload.isEmergency ? 'notification:emergency' : 'notification:new';
      io.to(`user:${userId}`).emit(event, {
        _id: notif._id,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        entityType: notif.entityType,
        entityId: notif.entityId,
        isEmergency: notif.isEmergency
      });
    }
    return notif;
  } catch (err) {
    console.error('[notify] failed for user', userId, err.message);
    return null;
  }
}

async function notifyMany(io, userIds, payload) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(id => String(id)))];
  return Promise.all(ids.map(id => notifyUser(io, id, payload)));
}

module.exports = { notifyUser, notifyMany };
