// ============================================================================
// useNotificationCounts — live unread notification count for the topbar badge.
// ============================================================================
// Session 12: fetch initial count, update on incoming socket events, and
// expose a setter so consumers can decrement after marking read.
//
// Usage:
//   const { total, byType, refetch } = useNotificationCounts();
//   <IconButton badge={total > 0 ? total : undefined} />
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';

export function useNotificationCounts() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [total, setTotal] = useState(0);
  const [byType, setByType] = useState({});
  const [emergencyUnacked, setEmergencyUnacked] = useState(0);

  const refetch = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await api.get('/notifications/unread-count');
      setTotal(data.total || 0);
      setByType(data.byType || {});
      setEmergencyUnacked(data.emergencyUnacked || 0);
    } catch {
      // Non-fatal — badge will be stale but nothing else breaks.
    }
  }, [user]);

  // Initial fetch
  useEffect(() => { refetch(); }, [refetch]);

  // Re-fetch on every socket event that could change the count.
  // Lighter approach than maintaining a delta in local state — server is
  // still the source of truth, and the endpoint is cheap.
  useEffect(() => {
    if (!socket) return;
    const onChange = () => refetch();
    socket.on('notification:new', onChange);
    socket.on('notification:emergency', onChange);
    socket.on('notification:dismissed', onChange);
    socket.on('notification:read', onChange);
    return () => {
      socket.off('notification:new', onChange);
      socket.off('notification:emergency', onChange);
      socket.off('notification:dismissed', onChange);
      socket.off('notification:read', onChange);
    };
  }, [socket, refetch]);

  // Periodic refresh every 60s in case a socket event was missed.
  useEffect(() => {
    if (!user) return;
    const id = setInterval(refetch, 60_000);
    return () => clearInterval(id);
  }, [user, refetch]);

  return { total, byType, emergencyUnacked, refetch, setTotal };
}
