import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import api from '../services/api';
import FileViewer from '../components/FileViewer';
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
  const fileInputRef = useRef(null);

  // Right panel state
  const [rightPanel, setRightPanel] = useState(null); // null | 'pinned' | 'files' | 'members' | 'search'
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [channelFiles, setChannelFiles] = useState([]);
  const [channelMembers, setChannelMembers] = useState([]);

  // Thread state
  const [threadParent, setThreadParent] = useState(null);
  const [threadReplies, setThreadReplies] = useState([]);
  const [threadInput, setThreadInput] = useState('');

  // Edit state
  const [editingMsg, setEditingMsg] = useState(null);
  const [editContent, setEditContent] = useState('');

  // Task from chat state
  const [taskMsg, setTaskMsg] = useState(null);
  const [taskForm, setTaskForm] = useState({ title: '', priority: 'medium', deadline: '' });

  // Message search
  const [msgSearch, setMsgSearch] = useState('');
  const [msgSearchResults, setMsgSearchResults] = useState([]);

  // Emoji picker
  const [emojiPickerMsg, setEmojiPickerMsg] = useState(null);

  // FileViewer state
  const [viewingFile, setViewingFile] = useState(null);

  // @mention state
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionResults, setMentionResults] = useState([]);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentions, setMentions] = useState([]);

  // Format switching per spec Section 6.4.1
  const [displayFormat, setDisplayFormat] = useState('chat'); // chat | email | table | calendar | document
  const [aiSummary, setAiSummary] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

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
    setThreadParent(null);
    setRightPanel(null);
    setEditingMsg(null);
    setTaskMsg(null);
    setMsgSearch('');
    setMsgSearchResults([]);
  }, [joinChannel, leaveChannel, loadMessages]);

  // Socket listeners
  useEffect(() => {
    if (!socket) return;

    const handleMessage = (msg) => {
      if (msg.channel === activeChannel?._id) {
        if (msg.parentMessage) {
          // It's a thread reply
          if (threadParent && msg.parentMessage === threadParent._id) {
            setThreadReplies(prev => [...prev, msg]);
          }
          // Update reply count on parent
          setMessages(prev => prev.map(m => m._id === msg.parentMessage ? { ...m, replyCount: (m.replyCount || 0) + 1 } : m));
        } else {
          setMessages(prev => [...prev, msg]);
          setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        }
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
      setThreadReplies(prev => prev.map(m => m._id === data.messageId ? { ...m, reactions: data.reactions } : m));
    };

    const handleEdited = (msg) => {
      setMessages(prev => prev.map(m => m._id === msg._id ? { ...m, content: msg.content, isEdited: true } : m));
      setThreadReplies(prev => prev.map(m => m._id === msg._id ? { ...m, content: msg.content, isEdited: true } : m));
    };

    const handleDeleted = (data) => {
      setMessages(prev => prev.map(m => m._id === data.messageId ? { ...m, isDeleted: true, content: 'This message has been deleted.' } : m));
      setThreadReplies(prev => prev.map(m => m._id === data.messageId ? { ...m, isDeleted: true, content: 'This message has been deleted.' } : m));
    };

    socket.on('message:received', handleMessage);
    socket.on('user:typing', handleTyping);
    socket.on('user:stop-typing', handleStopTyping);
    socket.on('message:reaction', handleReaction);
    socket.on('message:edited', handleEdited);
    socket.on('message:deleted', handleDeleted);

    return () => {
      socket.off('message:received', handleMessage);
      socket.off('user:typing', handleTyping);
      socket.off('user:stop-typing', handleStopTyping);
      socket.off('message:reaction', handleReaction);
      socket.off('message:edited', handleEdited);
      socket.off('message:deleted', handleDeleted);
    };
  }, [socket, activeChannel, user._id, loadChannels, threadParent]);

  const sendMessage = async () => {
    if (!input.trim() || !activeChannel) return;
    try {
      await api.post(`/messages/${activeChannel._id}`, { content: input.trim(), mentions: mentions.length > 0 ? mentions : undefined });
      setInput('');
      setMentions([]);
      emitStopTyping(activeChannel._id);
    } catch {}
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInput(val);
    if (activeChannel) emitTyping(activeChannel._id);

    // Detect @mention
    const atMatch = val.match(/@(\w*)$/);
    if (atMatch) {
      const q = atMatch[1].toLowerCase();
      setMentionQuery(q);
      const members = channelMembers.length > 0 ? channelMembers : (activeChannel?.members || []);
      const filtered = members.filter(m => m.name?.toLowerCase().includes(q) && m._id !== user._id).slice(0, 6);
      setMentionResults(filtered);
      setShowMentionDropdown(filtered.length > 0);
    } else {
      setShowMentionDropdown(false);
    }
  };

  const selectMention = (member) => {
    const newInput = input.replace(/@\w*$/, `@${member.name} `);
    setInput(newInput);
    if (!mentions.includes(member._id)) setMentions(prev => [...prev, member._id]);
    setShowMentionDropdown(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const react = async (messageId, emoji) => {
    try {
      await api.post(`/messages/${activeChannel._id}/${messageId}/react`, { emoji });
      setEmojiPickerMsg(null);
    } catch {}
  };

  // Pin / Unpin
  const togglePin = async (messageId) => {
    try {
      await api.post(`/messages/${activeChannel._id}/${messageId}/pin`);
      setMessages(prev => prev.map(m => m._id === messageId ? { ...m, isPinned: !m.isPinned } : m));
    } catch {}
  };

  // Edit message
  const startEdit = (msg) => {
    setEditingMsg(msg._id);
    setEditContent(msg.content);
  };

  const saveEdit = async () => {
    if (!editContent.trim() || !editingMsg) return;
    try {
      await api.put(`/messages/${activeChannel._id}/${editingMsg}`, { content: editContent.trim() });
      setEditingMsg(null);
      setEditContent('');
    } catch {}
  };

  const cancelEdit = () => {
    setEditingMsg(null);
    setEditContent('');
  };

  // Delete message
  const deleteMessage = async (messageId) => {
    if (!window.confirm('Delete this message?')) return;
    try {
      await api.delete(`/messages/${activeChannel._id}/${messageId}`);
    } catch {}
  };

  // File upload
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeChannel) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('content', '');
    try {
      await api.post(`/messages/${activeChannel._id}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    } catch {}
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Task from chat
  const openTaskForm = (msg) => {
    setTaskMsg(msg);
    setTaskForm({ title: msg.content.substring(0, 80), priority: 'medium', deadline: '' });
  };

  const createTaskFromChat = async () => {
    if (!taskForm.title.trim() || !activeChannel) return;
    try {
      await api.post(`/messages/${activeChannel._id}/task`, {
        title: taskForm.title.trim(),
        priority: taskForm.priority,
        deadline: taskForm.deadline || undefined,
        messageId: taskMsg?._id
      });
      setTaskMsg(null);
      setTaskForm({ title: '', priority: 'medium', deadline: '' });
      loadMessages(activeChannel._id);
    } catch {}
  };

  // Message search
  const searchMessages = async () => {
    if (!msgSearch.trim() || !activeChannel) return;
    try {
      const { data } = await api.get(`/messages/${activeChannel._id}/search?q=${encodeURIComponent(msgSearch.trim())}`);
      setMsgSearchResults(data);
      setRightPanel('search');
    } catch {}
  };

  // Right panel loaders
  const openRightPanel = async (tab) => {
    if (rightPanel === tab) { setRightPanel(null); return; }
    setRightPanel(tab);
    if (!activeChannel) return;
    try {
      if (tab === 'pinned') {
        const { data } = await api.get(`/messages/${activeChannel._id}/pinned`);
        setPinnedMessages(data);
      } else if (tab === 'files') {
        const { data } = await api.get(`/messages/${activeChannel._id}/files`);
        setChannelFiles(data);
      } else if (tab === 'members') {
        const { data } = await api.get(`/messages/${activeChannel._id}/members`);
        setChannelMembers(data);
      }
    } catch {}
  };

  // Thread
  const openThread = async (msg) => {
    setThreadParent(msg);
    try {
      const { data } = await api.get(`/messages/${activeChannel._id}/${msg._id}/replies`);
      setThreadReplies(data);
    } catch {}
  };

  const closeThread = () => {
    setThreadParent(null);
    setThreadReplies([]);
    setThreadInput('');
  };

  const sendThreadReply = async () => {
    if (!threadInput.trim() || !threadParent || !activeChannel) return;
    try {
      await api.post(`/messages/${activeChannel._id}`, {
        content: threadInput.trim(),
        parentMessage: threadParent._id
      });
      setThreadInput('');
    } catch {}
  };

  const handleThreadKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendThreadReply(); }
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

  const handleAiSummarize = async () => {
    if (!user.aiActive || !activeChannel) return;
    setAiLoading(true);
    try {
      const { data } = await api.post('/ai/summarize', { messages: messages.map(m => ({ sender: m.sender?.name, content: m.content })) });
      setAiSummary(data.summary || data.result || 'No summary generated.');
    } catch { setAiSummary('Failed to generate summary.'); }
    finally { setAiLoading(false); }
  };

  const isAdmin = ['main_admin', 'admin'].includes(user.role);

  const renderMessageBubble = (msg, isThread = false) => {
    if (msg.type === 'system') return <div key={msg._id} className="msg-system">{msg.content}</div>;
    const sender = msg.sender;
    const isMe = sender?._id === user._id;
    const isEditing = editingMsg === msg._id;
    const canDelete = isMe || isAdmin;

    return (
      <div key={msg._id} className={`msg-bubble ${msg.isDeleted ? 'deleted' : ''}`}>
        <div className="msg-bubble-avatar" style={{ background: getGradient(sender?._id) }}>
          {getInitials(sender?.name)}
        </div>
        <div className="msg-bubble-content">
          <div className="msg-bubble-header">
            <span className="msg-bubble-name">{sender?.name || 'Unknown'}</span>
            <span className="msg-bubble-time">
              {new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
            {msg.isEdited && !msg.isDeleted && <span className="msg-edited-tag">(edited)</span>}
            {msg.isPinned && !msg.isDeleted && <span className="msg-pinned-tag">pinned</span>}
          </div>

          {isEditing ? (
            <div className="msg-edit-form">
              <input
                className="msg-edit-input"
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                autoFocus
              />
              <div className="msg-edit-actions">
                <button className="msg-edit-save" onClick={saveEdit}>Save</button>
                <button className="msg-edit-cancel" onClick={cancelEdit}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="msg-bubble-text">{msg.content?.split(/(@\w[\w\s]*?)(?=\s|$)/g).map((part, i) =>
              part.startsWith('@') ? <span key={i} style={{ color: '#6366F1', fontWeight: 600 }}>{part}</span> : part
            )}</div>
          )}

          {msg.file && (
            <div className="msg-file" style={{ cursor: 'pointer' }} onClick={() => setViewingFile({ url: msg.file.path || msg.file.url, name: msg.file.name, mimeType: msg.file.mimeType, size: msg.file.originalSize })}>
              <span>📎</span>
              <div>
                <div className="msg-file-name">{msg.file.name}</div>
                {msg.file.originalSize && <div className="msg-file-size">{(msg.file.originalSize / 1024 / 1024).toFixed(1)}MB</div>}
              </div>
            </div>
          )}

          {/* Message hover actions */}
          {!msg.isDeleted && !isEditing && (
            <div className="msg-hover-actions">
              {!isThread && (
                <button className="msg-action-btn" onClick={() => openThread(msg)} title="Reply in thread">
                  💬{msg.replyCount > 0 ? ` ${msg.replyCount}` : ''}
                </button>
              )}
              <button className="msg-action-btn" onClick={() => togglePin(msg._id)} title={msg.isPinned ? 'Unpin' : 'Pin'}>
                📌
              </button>
              <button className="msg-action-btn" onClick={() => setEmojiPickerMsg(emojiPickerMsg === msg._id ? null : msg._id)} title="React">
                😊
              </button>
              {!isThread && (
                <button className="msg-action-btn" onClick={() => openTaskForm(msg)} title="Create task">
                  📋
                </button>
              )}
              {isMe && (
                <button className="msg-action-btn" onClick={() => startEdit(msg)} title="Edit">
                  ✏️
                </button>
              )}
              {canDelete && (
                <button className="msg-action-btn msg-action-danger" onClick={() => deleteMessage(msg._id)} title="Delete">
                  🗑️
                </button>
              )}
            </div>
          )}

          {/* Emoji quick picker */}
          {emojiPickerMsg === msg._id && (
            <div className="msg-emoji-picker">
              {['👍','❤️','😂','🎉','✅','👀','🔥','💯'].map(em => (
                <span key={em} className="msg-emoji-option" onClick={() => react(msg._id, em)}>{em}</span>
              ))}
            </div>
          )}

          {/* Reactions display */}
          {msg.reactions?.length > 0 && (
            <div className="msg-reactions">
              {msg.reactions.map((r, ri) => (
                <span key={ri} className={`msg-reaction ${r.users.includes(user._id) ? 'mine' : ''}`} onClick={() => react(msg._id, r.emoji)}>
                  {r.emoji} {r.users.length}
                </span>
              ))}
            </div>
          )}

          {/* Thread reply count indicator */}
          {!isThread && msg.replyCount > 0 && (
            <div className="msg-thread-indicator" onClick={() => openThread(msg)}>
              💬 {msg.replyCount} {msg.replyCount === 1 ? 'reply' : 'replies'}
            </div>
          )}
        </div>
      </div>
    );
  };

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
            <div className="msg-header-actions">
              <div className="msg-header-search">
                <input
                  className="msg-header-search-input"
                  placeholder="Search messages..."
                  value={msgSearch}
                  onChange={e => setMsgSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') searchMessages(); }}
                />
                <button className="msg-header-search-btn" onClick={searchMessages} title="Search">🔍</button>
              </div>
              <button
                disabled={!user.aiActive}
                title={user.aiActive ? 'Summarize conversation with AI' : 'AI not activated \u2014 go to Settings'}
                onClick={() => user.aiActive ? handleAiSummarize() : void 0}
                style={{ padding: '4px 10px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 10, background: user.aiActive ? 'rgba(99,102,241,0.08)' : '#F8FAFC', color: user.aiActive ? '#6366F1' : '#94A3B8', cursor: user.aiActive ? 'pointer' : 'not-allowed', opacity: user.aiActive ? 1 : 0.4, fontFamily: 'Inter,sans-serif' }}
              >
                {aiLoading ? 'Summarizing...' : '\u2728 Summarize'}
              </button>
              {/* Format switching per spec Section 6.4.1 */}
              <select
                value={displayFormat}
                onChange={e => setDisplayFormat(e.target.value)}
                style={{ padding: '4px 8px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 10, color: '#475569', background: '#F8FAFC', fontFamily: 'Inter,sans-serif', cursor: 'pointer' }}
                title="Switch display format"
              >
                <option value="chat">💬 Chat</option>
                <option value="email">✉️ Email</option>
                <option value="table">📊 Table</option>
                <option value="calendar">📅 Calendar</option>
                <option value="document">📄 Document</option>
              </select>
              <button className={`msg-header-btn ${rightPanel === 'pinned' ? 'active' : ''}`} onClick={() => openRightPanel('pinned')} title="Pinned messages">📌</button>
              <button className={`msg-header-btn ${rightPanel === 'files' ? 'active' : ''}`} onClick={() => openRightPanel('files')} title="Files">📁</button>
              <button className={`msg-header-btn ${rightPanel === 'members' ? 'active' : ''}`} onClick={() => openRightPanel('members')} title="Members">👥</button>
            </div>
          </div>

          <div className="msg-chat-main">
            <div className="msg-chat-body-wrap">
              <div className="msg-chat-body">
                {displayFormat === 'chat' && messages.map(msg => renderMessageBubble(msg, false))}

                {displayFormat === 'email' && messages.filter(m => m.type !== 'system').map(msg => (
                  <div key={msg._id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, borderBottom: '1px solid #F0F2F7', paddingBottom: 6 }}>
                      <div><span style={{ fontSize: 11, fontWeight: 700, color: '#1E293B' }}>{msg.sender?.name}</span><span style={{ fontSize: 10, color: '#94A3B8', marginLeft: 8 }}>&lt;{msg.sender?.email}&gt;</span></div>
                      <span style={{ fontSize: 10, color: '#CBD5E1' }}>{new Date(msg.createdAt).toLocaleString()}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                  </div>
                ))}

                {displayFormat === 'table' && (
                  <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '120px 100px 1fr 120px', padding: '8px 12px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: 9, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>
                      <div>Sender</div><div>Time</div><div>Message</div><div>Attachments</div>
                    </div>
                    {messages.filter(m => m.type !== 'system').map(msg => (
                      <div key={msg._id} style={{ display: 'grid', gridTemplateColumns: '120px 100px 1fr 120px', padding: '8px 12px', borderBottom: '1px solid #F0F2F7', fontSize: 11, alignItems: 'center' }}>
                        <div style={{ fontWeight: 600, color: '#1E293B' }}>{msg.sender?.name}</div>
                        <div style={{ color: '#94A3B8', fontSize: 10 }}>{new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
                        <div style={{ color: '#475569' }}>{msg.content}</div>
                        <div>{msg.file ? '📎 ' + msg.file.name : '—'}</div>
                      </div>
                    ))}
                  </div>
                )}

                {displayFormat === 'calendar' && (() => {
                  const byDate = {};
                  messages.filter(m => m.type !== 'system').forEach(msg => {
                    const d = new Date(msg.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                    if (!byDate[d]) byDate[d] = [];
                    byDate[d].push(msg);
                  });
                  return Object.entries(byDate).map(([date, msgs]) => (
                    <div key={date} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#6366F1', background: 'rgba(99,102,241,0.06)', padding: '6px 12px', borderRadius: 6, marginBottom: 6 }}>{date}</div>
                      {msgs.map(msg => (
                        <div key={msg._id} style={{ display: 'flex', gap: 8, padding: '4px 12px', fontSize: 11 }}>
                          <span style={{ color: '#94A3B8', width: 60, flexShrink: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>{new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                          <span style={{ fontWeight: 600, color: '#1E293B', width: 100, flexShrink: 0 }}>{msg.sender?.name}</span>
                          <span style={{ color: '#475569' }}>{msg.content}</span>
                        </div>
                      ))}
                    </div>
                  ));
                })()}

                {displayFormat === 'document' && (
                  <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #E2E8F0', padding: '24px 32px', maxWidth: 640, margin: '0 auto' }}>
                    <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1E293B', marginBottom: 4, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                      {activeChannel?.name || 'Conversation'}
                    </h2>
                    <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #F0F2F7' }}>
                      {messages.length} messages · {activeChannel?.members?.length} members
                    </div>
                    {messages.filter(m => m.type !== 'system').map(msg => (
                      <div key={msg._id} style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#1E293B' }}>
                          {msg.sender?.name} <span style={{ fontWeight: 400, color: '#CBD5E1' }}>— {new Date(msg.createdAt).toLocaleString()}</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.7, paddingLeft: 0, marginTop: 2 }}>{msg.content}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Read receipt on last message */}
                {displayFormat === 'chat' && messages.length > 0 && (() => {
                  const lastMsg = messages[messages.length - 1];
                  const memberCount = activeChannel?.members?.length || 0;
                  if (lastMsg && lastMsg.readBy && memberCount > 0 && lastMsg.readBy.length >= memberCount) {
                    return <div style={{ textAlign: 'right', fontSize: 10, color: '#10B981', padding: '0 8px 4px' }}>{'\u2713\u2713'} Seen</div>;
                  }
                  return null;
                })()}

                {aiSummary && (
                  <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 8, padding: 14, margin: '8px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#6366F1' }}>AI Summary</span>
                      <button onClick={() => setAiSummary(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#94A3B8' }}>&times;</button>
                    </div>
                    <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{aiSummary}</div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="msg-typing">{typing ? `${typing} is typing...` : ''}</div>

              <div className="msg-input-bar">
                <div className="msg-input-actions">
                  <div className="msg-input-action" onClick={() => setEmojiPickerMsg(emojiPickerMsg === 'input' ? null : 'input')}>😊</div>
                  <div className="msg-input-action" onClick={() => fileInputRef.current?.click()}>📎</div>
                </div>
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
                <input
                  className="msg-input-field"
                  placeholder="Type a message..."
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                />
                <button className="msg-send-btn" onClick={sendMessage} disabled={!input.trim()}>Send</button>
              </div>

              {/* @mention dropdown */}
              {showMentionDropdown && (
                <div style={{ position: 'absolute', bottom: '100%', left: 60, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', maxHeight: 180, overflowY: 'auto', zIndex: 20, minWidth: 180 }}>
                  {mentionResults.map(m => (
                    <div key={m._id} onClick={() => selectMention(m)}
                      style={{ padding: '8px 12px', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #F0F2F7' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.06)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: getGradient(m._id), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff', fontWeight: 700 }}>
                        {getInitials(m.name)}
                      </div>
                      <span style={{ fontWeight: 600, color: '#1E293B' }}>{m.name}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Emoji picker for input */}
              {emojiPickerMsg === 'input' && (
                <div className="msg-input-emoji-picker">
                  {['👍','❤️','😂','🎉','✅','👀','🔥','💯','😊','🙏','💪','👏'].map(em => (
                    <span key={em} className="msg-emoji-option" onClick={() => { setInput(prev => prev + em); setEmojiPickerMsg(null); }}>{em}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Thread Panel */}
            {threadParent && (
              <div className="msg-thread-panel">
                <div className="msg-thread-header">
                  <span className="msg-thread-title">Thread</span>
                  <button className="msg-thread-close" onClick={closeThread}>✕</button>
                </div>
                <div className="msg-thread-parent">
                  {renderMessageBubble(threadParent, true)}
                </div>
                <div className="msg-thread-divider">
                  <span>{threadReplies.length} {threadReplies.length === 1 ? 'reply' : 'replies'}</span>
                </div>
                <div className="msg-thread-replies">
                  {threadReplies.map(msg => renderMessageBubble(msg, true))}
                </div>
                <div className="msg-thread-input-bar">
                  <input
                    className="msg-input-field"
                    placeholder="Reply in thread..."
                    value={threadInput}
                    onChange={e => setThreadInput(e.target.value)}
                    onKeyDown={handleThreadKeyDown}
                  />
                  <button className="msg-send-btn" onClick={sendThreadReply} disabled={!threadInput.trim()}>Reply</button>
                </div>
              </div>
            )}

            {/* Right Panel */}
            {rightPanel && (
              <div className="msg-right-panel">
                <div className="msg-right-panel-header">
                  <span className="msg-right-panel-title">
                    {rightPanel === 'pinned' && 'Pinned Messages'}
                    {rightPanel === 'files' && 'Shared Files'}
                    {rightPanel === 'members' && 'Members'}
                    {rightPanel === 'search' && 'Search Results'}
                  </span>
                  <button className="msg-right-panel-close" onClick={() => setRightPanel(null)}>✕</button>
                </div>
                <div className="msg-right-panel-body">
                  {/* Pinned */}
                  {rightPanel === 'pinned' && (
                    pinnedMessages.length === 0 ? (
                      <div className="msg-right-panel-empty">No pinned messages</div>
                    ) : (
                      pinnedMessages.map(msg => (
                        <div key={msg._id} className="msg-right-panel-item">
                          <div className="msg-right-panel-item-header">
                            <span className="msg-bubble-name">{msg.sender?.name || 'Unknown'}</span>
                            <span className="msg-bubble-time">{new Date(msg.createdAt).toLocaleDateString()}</span>
                          </div>
                          <div className="msg-right-panel-item-text">{msg.content}</div>
                        </div>
                      ))
                    )
                  )}

                  {/* Files */}
                  {rightPanel === 'files' && (
                    channelFiles.length === 0 ? (
                      <div className="msg-right-panel-empty">No files shared</div>
                    ) : (
                      channelFiles.map(msg => (
                        <div key={msg._id} className="msg-right-panel-file-item" style={{ cursor: 'pointer' }} onClick={() => msg.file && setViewingFile({ url: msg.file.path || msg.file.url, name: msg.file.name, mimeType: msg.file.mimeType, size: msg.file.originalSize })}>
                          <div className="msg-file">
                            <span>📎</span>
                            <div>
                              <div className="msg-file-name">{msg.file?.name || 'File'}</div>
                              <div className="msg-file-size">
                                {msg.file?.originalSize ? `${(msg.file.originalSize / 1024 / 1024).toFixed(1)}MB` : ''}
                                {' — '}{msg.sender?.name} — {new Date(msg.createdAt).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )
                  )}

                  {/* Members */}
                  {rightPanel === 'members' && (
                    channelMembers.length === 0 ? (
                      <div className="msg-right-panel-empty">No members</div>
                    ) : (
                      channelMembers.map(member => (
                        <div key={member._id} className="msg-right-panel-member">
                          <div className="msg-bubble-avatar" style={{ background: getGradient(member._id), width: 28, height: 28, fontSize: 10 }}>
                            {getInitials(member.name)}
                          </div>
                          <div className="msg-right-panel-member-info">
                            <div className="msg-right-panel-member-name">{member.name}</div>
                            <div className="msg-right-panel-member-title">{member.jobTitle || member.email}</div>
                          </div>
                          <div className="msg-status-indicator" style={{ background: onlineUsers.includes(member._id) ? '#10B981' : '#CBD5E1' }} />
                        </div>
                      ))
                    )
                  )}

                  {/* Search Results */}
                  {rightPanel === 'search' && (
                    msgSearchResults.length === 0 ? (
                      <div className="msg-right-panel-empty">No results found</div>
                    ) : (
                      msgSearchResults.map(msg => (
                        <div key={msg._id} className="msg-right-panel-item">
                          <div className="msg-right-panel-item-header">
                            <span className="msg-bubble-name">{msg.sender?.name || 'Unknown'}</span>
                            <span className="msg-bubble-time">{new Date(msg.createdAt).toLocaleDateString()}</span>
                          </div>
                          <div className="msg-right-panel-item-text">{msg.content}</div>
                        </div>
                      ))
                    )
                  )}
                </div>
              </div>
            )}
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

      {/* Task from Chat Modal */}
      {taskMsg && (
        <div className="msg-task-overlay" onClick={() => setTaskMsg(null)}>
          <div className="msg-task-modal" onClick={e => e.stopPropagation()}>
            <div className="msg-task-modal-header">
              <span>Create Task from Message</span>
              <button className="msg-task-modal-close" onClick={() => setTaskMsg(null)}>✕</button>
            </div>
            <div className="msg-task-modal-body">
              <div className="msg-task-field">
                <label>Title</label>
                <input
                  value={taskForm.title}
                  onChange={e => setTaskForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Task title"
                />
              </div>
              <div className="msg-task-field">
                <label>Priority</label>
                <select value={taskForm.priority} onChange={e => setTaskForm(prev => ({ ...prev, priority: e.target.value }))}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div className="msg-task-field">
                <label>Deadline</label>
                <input
                  type="date"
                  value={taskForm.deadline}
                  onChange={e => setTaskForm(prev => ({ ...prev, deadline: e.target.value }))}
                />
              </div>
              <div className="msg-task-source">
                <span className="msg-task-source-label">From message:</span>
                <span className="msg-task-source-text">"{taskMsg.content?.substring(0, 120)}{taskMsg.content?.length > 120 ? '...' : ''}"</span>
              </div>
            </div>
            <div className="msg-task-modal-footer">
              <button className="msg-edit-cancel" onClick={() => setTaskMsg(null)}>Cancel</button>
              <button className="msg-send-btn" onClick={createTaskFromChat} disabled={!taskForm.title.trim()}>Create Task</button>
            </div>
          </div>
        </div>
      )}

      {/* FileViewer modal */}
      {viewingFile && (
        <FileViewer
          url={viewingFile.url}
          name={viewingFile.name}
          mimeType={viewingFile.mimeType}
          size={viewingFile.size}
          onClose={() => setViewingFile(null)}
        />
      )}
    </div>
  );
}
