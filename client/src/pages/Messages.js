import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import api from '../services/api';
import '../styles/messaging.css';

const GRADIENTS = [
  'linear-gradient(135deg,#6366F1,#8B5CF6)',
  'linear-gradient(135deg,#10B981,#06B6D4)',
  'linear-gradient(135deg,#F59E0B,#F97316)',
  'linear-gradient(135deg,#EC4899,#8B5CF6)',
  'linear-gradient(135deg,#EF4444,#F97316)',
  'linear-gradient(135deg,#06B6D4,#10B981)',
];

function getGradient(id) {
  const hash = (id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return GRADIENTS[hash % GRADIENTS.length];
}

function getInitials(name) {
  return (name || '??').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function Messages() {
  const { user } = useAuth();
  const { socket, onlineUsers, joinChannel, leaveChannel, emitTyping, emitStopTyping } = useSocket();
  const [channels, setChannels] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(null);
  const [search, setSearch] = useState('');
  const chatEndRef = useRef(null);
  const typingTimeout = useRef(null);
  const prevChannelRef = useRef(null);

  const loadChannels = useCallback(async () => {
    try {
      const { data } = await api.get('/messages/channels');
      setChannels(data);
    } catch {}
  }, []);

  useEffect(() => { loadChannels(); }, [loadChannels]);

  const loadMessages = useCallback(async (channelId) => {
    try {
      const { data } = await api.get(`/messages/${channelId}`);
      setMessages(data);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch {}
  }, []);

  const selectChannel = useCallback((channel) => {
    if (prevChannelRef.current) leaveChannel(prevChannelRef.current);
    setActiveChannel(channel);
    prevChannelRef.current = channel._id;
    joinChannel(channel._id);
    loadMessages(channel._id);
    setTyping(null);
  }, [joinChannel, leaveChannel, loadMessages]);

  // Socket listeners
  useEffect(() => {
    if (!socket) return;

    const handleMessage = (msg) => {
      if (msg.channel === activeChannel?._id) {
        setMessages(prev => [...prev, msg]);
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      }
      loadChannels();
    };

    const handleTyping = (data) => {
      if (data.channelId === activeChannel?._id && data.userId !== user._id) {
        setTyping(data.name);
        clearTimeout(typingTimeout.current);
        typingTimeout.current = setTimeout(() => setTyping(null), 3000);
      }
    };

    const handleStopTyping = (data) => {
      if (data.channelId === activeChannel?._id) setTyping(null);
    };

    const handleReaction = (data) => {
      setMessages(prev => prev.map(m => m._id === data.messageId ? { ...m, reactions: data.reactions } : m));
    };

    socket.on('message:received', handleMessage);
    socket.on('user:typing', handleTyping);
    socket.on('user:stop-typing', handleStopTyping);
    socket.on('message:reaction', handleReaction);

    return () => {
      socket.off('message:received', handleMessage);
      socket.off('user:typing', handleTyping);
      socket.off('user:stop-typing', handleStopTyping);
      socket.off('message:reaction', handleReaction);
    };
  }, [socket, activeChannel, user._id, loadChannels]);

  const sendMessage = async () => {
    if (!input.trim() || !activeChannel) return;
    try {
      await api.post(`/messages/${activeChannel._id}`, { content: input.trim() });
      setInput('');
      emitStopTyping(activeChannel._id);
    } catch {}
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    if (activeChannel) emitTyping(activeChannel._id);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const react = async (messageId, emoji) => {
    try {
      await api.post(`/messages/${activeChannel._id}/${messageId}/react`, { emoji });
    } catch {}
  };

  // Group channels by type
  const grouped = { channel: [], dm: [], group: [], room: [] };
  channels.forEach(ch => {
    const filtered = search ? ch.name.toLowerCase().includes(search.toLowerCase()) : true;
    if (filtered && grouped[ch.type]) grouped[ch.type].push(ch);
  });

  const getChannelDisplayName = (ch) => {
    if (ch.type === 'dm') {
      const other = ch.members?.find(m => m._id !== user._id);
      return other?.name || ch.name;
    }
    return ch.name;
  };

  const getOtherDMUser = (ch) => ch.members?.find(m => m._id !== user._id);

  return (
    <div className="msg-layout">
      {/* Conversation Sidebar */}
      <div className="msg-sidebar">
        <div className="msg-sidebar-search">
          <input placeholder="Search conversations..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="msg-sidebar-list">
          {/* Channels */}
          <div className="msg-section-title"><span>Channels</span><span className="msg-section-add">+</span></div>
          {grouped.channel.map(ch => (
            <div key={ch._id} className={`msg-conv-item ${activeChannel?._id === ch._id ? 'active' : ''} ${ch.unreadCount > 0 ? 'unread' : ''}`} onClick={() => selectChannel(ch)}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#94A3B8', width: 20, textAlign: 'center' }}>#</span>
              <span className="msg-conv-name">{ch.name.replace('#', '')}</span>
              {ch.unreadCount > 0 && <span className="msg-unread-badge">{ch.unreadCount}</span>}
            </div>
          ))}

          {/* Direct Messages */}
          <div className="msg-section-title"><span>Direct Messages</span><span className="msg-section-add">+</span></div>
          {grouped.dm.map(ch => {
            const other = getOtherDMUser(ch);
            const isOnline = onlineUsers.includes(other?._id);
            return (
              <div key={ch._id} className={`msg-conv-item ${activeChannel?._id === ch._id ? 'active' : ''} ${ch.unreadCount > 0 ? 'unread' : ''}`} onClick={() => selectChannel(ch)}>
                <div className="msg-avatar-wrap">
                  <div className="avatar-sm" style={{ background: getGradient(other?._id), width: 24, height: 24, fontSize: 9 }}>{getInitials(other?.name)}</div>
                  <div className="msg-status-dot" style={{ background: isOnline ? '#10B981' : '#CBD5E1' }} />
                </div>
                <span className="msg-conv-name">{other?.name || 'Unknown'}</span>
                {ch.unreadCount > 0 && <span className="msg-unread-badge">{ch.unreadCount}</span>}
              </div>
            );
          })}

          {/* Groups */}
          {grouped.group.length > 0 && <>
            <div className="msg-section-title"><span>Groups</span><span className="msg-section-add">+</span></div>
            {grouped.group.map(ch => (
              <div key={ch._id} className={`msg-conv-item ${activeChannel?._id === ch._id ? 'active' : ''} ${ch.unreadCount > 0 ? 'unread' : ''}`} onClick={() => selectChannel(ch)}>
                <span style={{ fontSize: 13 }}>👥</span>
                <span className="msg-conv-name">{ch.name}</span>
                {ch.unreadCount > 0 && <span className="msg-unread-badge">{ch.unreadCount}</span>}
              </div>
            ))}
          </>}

          {/* Rooms */}
          {grouped.room.length > 0 && <>
            <div className="msg-section-title"><span>Rooms</span><span className="msg-section-add">+</span></div>
            {grouped.room.map(ch => (
              <div key={ch._id} className={`msg-conv-item ${activeChannel?._id === ch._id ? 'active' : ''} ${ch.unreadCount > 0 ? 'unread' : ''}`} onClick={() => selectChannel(ch)}>
                <span style={{ fontSize: 13 }}>🔒</span>
                <span className="msg-conv-name">{ch.name}</span>
                {ch.unreadCount > 0 && <span className="msg-unread-badge">{ch.unreadCount}</span>}
              </div>
            ))}
          </>}
        </div>
      </div>

      {/* Chat Area */}
      {activeChannel ? (
        <div className="msg-chat">
          <div className="msg-chat-header">
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span className="msg-chat-title">
                {activeChannel.type === 'room' ? '🔒 ' : ''}{getChannelDisplayName(activeChannel)}
              </span>
              <span className="msg-chat-sub">
                {activeChannel.type === 'dm' ? (onlineUsers.includes(getOtherDMUser(activeChannel)?._id) ? '🟢 Online' : 'Offline') :
                  `${activeChannel.members?.length || 0} members`}
              </span>
            </div>
          </div>

          <div className="msg-chat-body">
            {messages.map((msg, i) => {
              if (msg.type === 'system') return <div key={msg._id} className="msg-system">{msg.content}</div>;
              const sender = msg.sender;
              const isMe = sender?._id === user._id;
              return (
                <div key={msg._id} className="msg-bubble">
                  <div className="msg-bubble-avatar" style={{ background: getGradient(sender?._id) }}>
                    {getInitials(sender?.name)}
                  </div>
                  <div className="msg-bubble-content">
                    <div className="msg-bubble-header">
                      <span className="msg-bubble-name">{sender?.name || 'Unknown'}</span>
                      <span className="msg-bubble-time">{new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="msg-bubble-text">{msg.content}</div>
                    {msg.file && (
                      <div className="msg-file">
                        <span>📎</span>
                        <div>
                          <div className="msg-file-name">{msg.file.name}</div>
                          {msg.file.originalSize && <div className="msg-file-size">{(msg.file.originalSize / 1024 / 1024).toFixed(1)}MB</div>}
                        </div>
                      </div>
                    )}
                    {msg.reactions?.length > 0 && (
                      <div className="msg-reactions">
                        {msg.reactions.map((r, ri) => (
                          <span key={ri} className={`msg-reaction ${r.users.includes(user._id) ? 'mine' : ''}`} onClick={() => react(msg._id, r.emoji)}>
                            {r.emoji} {r.users.length}
                          </span>
                        ))}
                        <span className="msg-reaction" onClick={() => react(msg._id, '👍')}>+</span>
                      </div>
                    )}
                    {!msg.reactions?.length && (
                      <div className="msg-reactions" style={{ opacity: 0, transition: 'opacity 0.15s' }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0}>
                        {['👍','❤️','😂','🎉','✅'].map(em => (
                          <span key={em} className="msg-reaction" onClick={() => react(msg._id, em)}>{em}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>

          <div className="msg-typing">{typing ? `${typing} is typing...` : ''}</div>

          <div className="msg-input-bar">
            <div className="msg-input-actions">
              {['😊','📎','📋'].map(icon => (
                <div key={icon} className="msg-input-action">{icon}</div>
              ))}
            </div>
            <input
              className="msg-input-field"
              placeholder="Type a message..."
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
            />
            <button className="msg-send-btn" onClick={sendMessage} disabled={!input.trim()}>Send</button>
          </div>
        </div>
      ) : (
        <div className="msg-empty">
          <div className="msg-empty-inner">
            <div className="msg-empty-icon">💬</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', marginBottom: 6 }}>Select a conversation</h3>
            <p style={{ fontSize: 12, color: '#94A3B8' }}>Choose a channel, DM, or room from the sidebar</p>
          </div>
        </div>
      )}
    </div>
  );
}
