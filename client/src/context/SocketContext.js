import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import api from '../services/api';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  // Track which rooms the user is in so we can re-join after a reconnect
  const joinedRooms = useRef(new Set());

  useEffect(() => {
    if (!user) {
      setSocket(null);
      return;
    }

    const origin = process.env.REACT_APP_API_URL?.replace('/api/v1', '');
    const url = origin || window.location.origin;
    const s = io(url, { transports: ['websocket', 'polling'] });

    const onConnect = () => {
      s.emit('user:online', user._id);
      // Re-join any channels the app was subscribed to before the (re)connection
      joinedRooms.current.forEach(channelId => s.emit('channel:join', channelId));
    };

    // REST snapshot first so the UI has the correct list right away
    api.get('/presence/online').then(r => setOnlineUsers(r.data?.onlineUsers || [])).catch(() => {});

    s.on('connect', onConnect);
    s.on('user:online', (data) => setOnlineUsers(data.onlineUsers || []));
    s.on('user:offline', (data) => setOnlineUsers(data.onlineUsers || []));

    // Keepalive ping every 30s — helps keep presence accurate if browser
    // throttles the socket on backgrounded tabs.
    const ping = setInterval(() => { try { s.emit('user:ping'); } catch {} }, 30000);

    s.on('auth:force-logout', () => {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      window.location.href = '/login';
    });

    setSocket(s);

    return () => {
      clearInterval(ping);
      s.off('connect', onConnect);
      s.disconnect();
      setSocket(null);
    };
  }, [user]);

  const joinChannel = (channelId) => {
    if (!channelId) return;
    joinedRooms.current.add(channelId);
    socket?.emit('channel:join', channelId);
  };
  const leaveChannel = (channelId) => {
    if (!channelId) return;
    joinedRooms.current.delete(channelId);
    socket?.emit('channel:leave', channelId);
  };
  const emitTyping = (channelId) => socket?.emit('user:typing', { channelId, userId: user?._id, name: user?.name });
  const emitStopTyping = (channelId) => socket?.emit('user:stop-typing', { channelId, userId: user?._id });

  return (
    <SocketContext.Provider value={{ socket, onlineUsers, joinChannel, leaveChannel, emitTyping, emitStopTyping }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
