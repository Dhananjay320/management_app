// ============================================================================
// useNotificationDeepLink — map a notification to a route path.
// ============================================================================
// Session 12 (C3): clicking a notification should take you somewhere.
//
// This hook centralizes the mapping from notification type/entity/action to
// a route path, so any component (toast, notifications page, bell dropdown)
// can use the same logic.
//
// Usage:
//   const followNotification = useNotificationDeepLink();
//   ...
//   onClick={() => followNotification(notification)}
//
// A single source of truth also means when modules move (e.g. /tasks/:id
// becomes /tasks/detail/:id in the future) we only update one file.
// ============================================================================

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

/**
 * Returns the deep-link path for a notification, or null if no path applies.
 * Pure function — exported for tests + cases where you want to know the path
 * WITHOUT triggering navigation (e.g. rendering a right-click "Copy link").
 */
export function pathForNotification(n) {
  if (!n) return null;

  // actionType (explicit) wins when present.
  // These string values match the current Notification schema's documented
  // actionType enum (view_task, view_meeting, reply, acknowledge, add_to_calendar).
  switch (n.actionType) {
    case 'view_task':
      return n.entityId ? `/tasks?highlight=${n.entityId}` : '/tasks';
    case 'view_meeting':
      return n.entityId ? `/meetings?highlight=${n.entityId}` : '/meetings';
    case 'reply':
      if (n.entityType === 'message' || n.entityType === 'channel') {
        return n.entityId ? `/messages?channel=${n.entityId}` : '/messages';
      }
      if (n.entityType === 'email') return n.entityId ? `/email?highlight=${n.entityId}` : '/email';
      return '/messages';
    case 'acknowledge':
      // Emergency ack stays on current page — caller dismisses locally.
      return null;
    case 'add_to_calendar':
      return '/';  // home calendar
    default:
      break;
  }

  // Fall back to entityType. Many older notifications only have entityType set.
  switch (n.entityType) {
    case 'task':     return n.entityId ? `/tasks?highlight=${n.entityId}`    : '/tasks';
    case 'meeting':  return n.entityId ? `/meetings?highlight=${n.entityId}` : '/meetings';
    case 'channel':  return n.entityId ? `/messages?channel=${n.entityId}`   : '/messages';
    case 'message':  return n.entityId ? `/messages?highlight=${n.entityId}` : '/messages';
    case 'email':    return n.entityId ? `/email?highlight=${n.entityId}`    : '/email';
    case 'leave':    return '/attendance';
    case 'dispute':  return '/salary';
    case 'announcement': return '/';  // banner shown on calendar home
    default: break;
  }

  // Fall back to type (broadest bucket).
  switch (n.type) {
    case 'task':         return '/tasks';
    case 'meeting':      return '/meetings';
    case 'message':      return '/messages';
    case 'email':        return '/email';
    case 'salary':       return '/salary';
    case 'attendance':   return '/attendance';
    case 'approval':     return '/attendance';  // leave approvals live in Attendance
    case 'announcement': return '/';
    case 'system':       return '/notifications';
    case 'emergency':    return null;  // emergencies don't navigate — user must ack
    default: return '/notifications';
  }
}

/**
 * Hook that returns a click handler. Given a notification object it:
 *   1. Marks it read (best-effort, doesn't block)
 *   2. Navigates to the mapped path (if any)
 *   3. Returns a boolean indicating whether navigation occurred
 */
export function useNotificationDeepLink() {
  const navigate = useNavigate();

  return useCallback(async (notification, opts = {}) => {
    if (!notification) return false;

    // Best-effort mark read (fire-and-forget; failure doesn't block navigation)
    if (notification._id && !notification.isRead && !opts.skipMarkRead) {
      api.put(`/notifications/${notification._id}/read`).catch(() => {});
    }

    const path = pathForNotification(notification);
    if (!path) return false;
    navigate(path);
    return true;
  }, [navigate]);
}
