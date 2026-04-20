import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [onlineUsers, setOnlineUsers] = useState([]);

  useEffect(() => {
    if (!user) return;

    const socket = io(process.env.REACT_APP_API_URL?.replace('/api/v1', '') || 'http://localhost:3000');
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('user:online', user._id);
    });

    socket.on('user:online', (data) => setOnlineUsers(data.onlineUsers || []));
    socket.on('user:offline', (data) => setOnlineUsers(data.onlineUsers || []));

    socket.on('auth:force-logout', (payload) => {
      // Session 5 (S11 frontend): show a brief explanation before redirect,
      // so the user isn't confused why they were kicked out.
      const adminName = payload?.by;
      const msg = adminName
        ? `You have been logged out by ${adminName}.`
        : 'You have been logged out by an administrator.';
      try { window.alert(msg); } catch {}
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      window.location.href = '/login';
    });

    return () => { socket.disconnect(); };
  }, [user]);

  const joinChannel = (channelId) => socketRef.current?.emit('channel:join', channelId);
  const leaveChannel = (channelId) => socketRef.current?.emit('channel:leave', channelId);
  const emitTyping = (channelId) => socketRef.current?.emit('user:typing', { channelId, userId: user?._id, name: user?.name });
  const emitStopTyping = (channelId) => socketRef.current?.emit('user:stop-typing', { channelId, userId: user?._id });

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, onlineUsers, joinChannel, leaveChannel, emitTyping, emitStopTyping }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
