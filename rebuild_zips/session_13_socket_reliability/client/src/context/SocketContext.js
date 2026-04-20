import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

/**
 * SocketProvider — reliable socket connection (Session 13, C5).
 *
 * Improvements over the previous version:
 *   • Exposes `isConnected` so the UI can show a "Reconnecting…" banner.
 *   • Uses socket.io's built-in reconnection (enabled by default) but sets
 *     an infinite retry with exponential backoff capped at 10 s.
 *   • On every reconnect, re-emits user:online and requests a catch-up.
 *   • Tracks `lastEventAt` so catch-up can tell the server how far back to go.
 *   • Sends a periodic client heartbeat so the server can reliably detect
 *     silently-dead sockets (wifi drop, laptop sleep) faster than the
 *     default socket.io ping-timeout.
 *   • Auto-stops typing indicators after 4 s so they don't stick.
 *   • force-logout still works as before.
 */
export function SocketProvider({ children }) {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const lastEventAtRef = useRef(Date.now());
  const heartbeatRef = useRef(null);

  const [onlineUsers, setOnlineUsers] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  const onAnyServerEvent = useCallback(() => {
    lastEventAtRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!user) {
      setIsConnected(false);
      return;
    }

    const socketUrl = process.env.REACT_APP_API_URL?.replace('/api/v1', '') || 'http://localhost:3000';

    const socket = io(socketUrl, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
      randomizationFactor: 0.5,
      timeout: 20_000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      setReconnectAttempt(0);
      socket.emit('user:online', user._id);
      socket.emit('sync:catch-up', { since: lastEventAtRef.current });
    });

    socket.on('disconnect', (reason) => {
      setIsConnected(false);
      if (reason === 'io server disconnect') {
        socket.connect();
      }
    });

    socket.io.on('reconnect_attempt', (n) => setReconnectAttempt(n));
    socket.io.on('reconnect', () => setReconnectAttempt(0));

    socket.on('user:online', (data) => {
      setOnlineUsers(data.onlineUsers || []);
      onAnyServerEvent();
    });
    socket.on('user:offline', (data) => {
      setOnlineUsers(data.onlineUsers || []);
      onAnyServerEvent();
    });

    socket.on('notification:new', onAnyServerEvent);
    socket.on('notification:emergency', onAnyServerEvent);
    socket.on('message:new', onAnyServerEvent);
    socket.on('task:updated', onAnyServerEvent);
    socket.on('email:new', onAnyServerEvent);

    socket.on('sync:catch-up', (payload) => {
      console.log('[socket] catch-up', payload?.refetch);
    });

    socket.on('auth:force-logout', (payload) => {
      const adminName = payload?.by;
      const msg = adminName
        ? `You have been logged out by ${adminName}.`
        : 'You have been logged out by an administrator.';
      try { window.alert(msg); } catch {}
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      window.location.href = '/login';
    });

    heartbeatRef.current = setInterval(() => {
      if (!socket.connected) return;
      let ackd = false;
      socket.timeout(10_000).emit('heartbeat', () => { ackd = true; });
      setTimeout(() => {
        if (!ackd && socket.connected) {
          console.warn('[socket] heartbeat timeout — forcing reconnect');
          socket.disconnect();
          socket.connect();
        }
      }, 11_000);
    }, 20_000);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const typingClearRef = useRef(new Map());
  const joinChannel = (channelId) => socketRef.current?.emit('channel:join', channelId);
  const leaveChannel = (channelId) => {
    const clear = typingClearRef.current.get(channelId);
    if (clear) { clearTimeout(clear); typingClearRef.current.delete(channelId); }
    socketRef.current?.emit('user:stop-typing', { channelId, userId: user?._id });
    socketRef.current?.emit('channel:leave', channelId);
  };
  const emitTyping = (channelId) => {
    if (!socketRef.current || !user) return;
    socketRef.current.emit('user:typing', { channelId, userId: user._id, name: user.name });
    const prev = typingClearRef.current.get(channelId);
    if (prev) clearTimeout(prev);
    const handle = setTimeout(() => {
      socketRef.current?.emit('user:stop-typing', { channelId, userId: user._id });
      typingClearRef.current.delete(channelId);
    }, 4000);
    typingClearRef.current.set(channelId, handle);
  };
  const emitStopTyping = (channelId) => {
    const prev = typingClearRef.current.get(channelId);
    if (prev) { clearTimeout(prev); typingClearRef.current.delete(channelId); }
    socketRef.current?.emit('user:stop-typing', { channelId, userId: user?._id });
  };

  return (
    <SocketContext.Provider value={{
      socket: socketRef.current,
      onlineUsers,
      isConnected,
      reconnectAttempt,
      joinChannel,
      leaveChannel,
      emitTyping,
      emitStopTyping,
    }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
