import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import api, { getFileUrl } from '../services/api';
import FileViewer from '../components/FileViewer';
import { useAlert } from '../components/AlertModal';
import EmojiPicker, { pushRecentEmoji } from '../components/EmojiPicker';
import ReactionPill from '../components/ReactionPill';
import InlineVideoPlayer from '../components/InlineVideoPlayer';
import Avatar from '../components/Avatar';
import { MessageCircle, Pin, SmilePlus, ListPlus, Forward, Pencil, Trash2, Copy } from 'lucide-react';
import { autocorrectAtCaret } from '../utils/autocorrect';
import '../styles/messaging.css';

const GRADIENTS = [
  'linear-gradient(135deg,#4F46E5,#6366F1)',
  'linear-gradient(135deg,#059669,#10B981)',
  'linear-gradient(135deg,#D97706,#F59E0B)',
  'linear-gradient(135deg,#7C3AED,#8B5CF6)',
  'linear-gradient(135deg,#0891B2,#06B6D4)',
  'linear-gradient(135deg,#DB2777,#EC4899)',
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
  const dialog = useAlert();
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
  const messageInputRef = useRef(null);

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

  // Compose formats: text (default), task, table, email, checklist, code, poll
  const [composeMode, setComposeMode] = useState(null); // null | 'task' | 'table' | 'email' | 'checklist' | 'code' | 'poll'
  const [showComposePicker, setShowComposePicker] = useState(false);
  const [composeTask, setComposeTask] = useState({ title: '', assignee: '', priority: 'medium', deadline: '', description: '' });
  const [composeTable, setComposeTable] = useState({ headers: ['Column 1', 'Column 2'], rows: [['', '']] });
  const [composeEmail, setComposeEmail] = useState({ subject: '', body: '' });
  const [composeChecklist, setComposeChecklist] = useState([{ text: '', done: false }]);
  const [composeCode, setComposeCode] = useState({ language: 'javascript', code: '' });
  const [composePoll, setComposePoll] = useState({ question: '', options: ['', ''] });

  // Mobile sidebar toggle
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [showMemberPicker, setShowMemberPicker] = useState(false);

  // Create channel/DM/group/room/broadcast modals
  const [createModal, setCreateModal] = useState(null); // null | 'channel' | 'dm' | 'group' | 'room' | 'broadcast'
  const [createForm, setCreateForm] = useState({ name: '', description: '', members: [], message: '' });
  const [allUsers, setAllUsers] = useState([]);

  useEffect(() => {
    api.get('/users/directory').then(r => setAllUsers(r.data || [])).catch(() => {});
  }, []);

  const toggleMember = (uid) => {
    setCreateForm(p => ({
      ...p,
      members: p.members.includes(uid) ? p.members.filter(id => id !== uid) : [...p.members, uid]
    }));
  };

  const handleCreate = async () => {
    try {
      if (createModal === 'channel') {
        const { data } = await api.post('/messages/channels', { name: '#' + createForm.name.replace(/^#/, '').replace(/\s+/g, '-').toLowerCase(), type: 'channel', description: createForm.description, members: createForm.members });
        selectChannel(data);
      } else if (createModal === 'dm') {
        if (createForm.members.length !== 1) { dialog.alert('Select exactly one person for DM'); return; }
        const { data } = await api.post('/messages/dm', { userId: createForm.members[0] });
        selectChannel(data);
      } else if (createModal === 'group') {
        if (createForm.members.length < 2) { dialog.alert('Select at least 2 people for group'); return; }
        const { data } = await api.post('/messages/channels', { name: createForm.name || 'Group Chat', type: 'group', members: createForm.members });
        selectChannel(data);
      } else if (createModal === 'room') {
        const { data } = await api.post('/messages/channels', { name: createForm.name, type: 'room', description: createForm.description, members: createForm.members, isPrivate: true });
        selectChannel(data);
      } else if (createModal === 'broadcast') {
        if (createForm.members.length === 0 || !createForm.message.trim()) { dialog.alert('Select recipients and type a message'); return; }
        await api.post('/messages/broadcast/send', { content: createForm.message, recipientIds: createForm.members, visibility: 'hidden' });
        dialog.alert('Broadcast sent to ' + createForm.members.length + ' people');
      }
      setCreateModal(null);
      setCreateForm({ name: '', description: '', members: [], message: '' });
      loadChannels();
    } catch (e) { dialog.alert(e.response?.data?.error || 'Failed'); }
  };
  const [channelUsers, setChannelUsers] = useState([]);

  // Load channel members for task assignee picker
  useEffect(() => {
    if (activeChannel) {
      api.get(`/messages/${activeChannel._id}/members`).then(r => setChannelUsers(r.data || [])).catch(() => {});
    }
  }, [activeChannel]);

  const sendStructured = async (type, content) => {
    if (!activeChannel) return;
    try {
      await api.post(`/messages/${activeChannel._id}`, { content, type: 'text' });
      setComposeMode(null);
      resetComposeState();
    } catch {}
  };

  const resetComposeState = () => {
    setComposeTask({ title: '', assignee: '', priority: 'medium', deadline: '', description: '' });
    setComposeTable({ headers: ['Column 1', 'Column 2'], rows: [['', '']] });
    setComposeEmail({ subject: '', body: '' });
    setComposeChecklist([{ text: '', done: false }]);
    setComposeCode({ language: 'javascript', code: '' });
    setComposePoll({ question: '', options: ['', ''] });
  };

  const sendTaskCard = async () => {
    if (!composeTask.title.trim()) return;
    const content = `📋 **Task Assignment**\n━━━━━━━━━━━━━━━━━━\n📌 Title: ${composeTask.title}\n👤 Assignee: ${composeTask.assignee || 'Unassigned'}\n🔴 Priority: ${composeTask.priority.toUpperCase()}\n📅 Deadline: ${composeTask.deadline || 'No deadline'}\n📝 ${composeTask.description || 'No description'}`;
    await sendStructured('task_card', content);
    // Also create actual task
    try {
      const assigneeUser = channelUsers.find(u => u.name === composeTask.assignee);
      await api.post('/tasks', {
        title: composeTask.title,
        description: composeTask.description,
        priority: composeTask.priority,
        deadline: composeTask.deadline || undefined,
        assignees: assigneeUser ? [assigneeUser._id] : [user._id],
        sourceType: 'chat',
        linkedChat: activeChannel._id
      });
    } catch {}
  };

  const sendTable = () => {
    const headerLine = '| ' + composeTable.headers.join(' | ') + ' |';
    const sepLine = '| ' + composeTable.headers.map(() => '---').join(' | ') + ' |';
    const rowLines = composeTable.rows.map(r => '| ' + r.join(' | ') + ' |').join('\n');
    const content = `📊 **Table**\n${headerLine}\n${sepLine}\n${rowLines}`;
    sendStructured('table', content);
  };

  const sendEmailFormat = () => {
    if (!composeEmail.subject.trim()) return;
    const content = `✉️ **${composeEmail.subject}**\n━━━━━━━━━━━━━━━━━━\n${composeEmail.body}`;
    sendStructured('email', content);
  };

  const sendChecklist = () => {
    const items = composeChecklist.filter(i => i.text.trim());
    if (items.length === 0) return;
    const content = `☑️ **Checklist**\n${items.map(i => `${i.done ? '✅' : '⬜'} ${i.text}`).join('\n')}`;
    sendStructured('checklist', content);
  };

  const sendCodeBlock = () => {
    if (!composeCode.code.trim()) return;
    const content = `💻 **Code** (${composeCode.language})\n\`\`\`${composeCode.language}\n${composeCode.code}\n\`\`\``;
    sendStructured('code', content);
  };

  const sendPoll = () => {
    if (!composePoll.question.trim()) return;
    const opts = composePoll.options.filter(o => o.trim());
    if (opts.length < 2) return;
    const content = `📊 **Poll: ${composePoll.question}**\n${opts.map((o, i) => `${['🅰️','🅱️','🅲️','🅳️','🅴️'][i] || '⭕'} ${o}`).join('\n')}\n\n_React with the emoji to vote!_`;
    sendStructured('poll', content);
  };

  // FileViewer state
  const [viewingFile, setViewingFile] = useState(null);

  // @mention state
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionResults, setMentionResults] = useState([]);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);

  // Seen-by popover state — opened when user clicks "Seen by N" pill on own message
  const [seenByMsg, setSeenByMsg] = useState(null);

  // Forward modal — `forwardMsg` is a single message OR `{ bulk: true, ids: [...] }`
  // when the user forwards a batch from select mode.
  const [forwardMsg, setForwardMsg] = useState(null);
  const [forwardTargets, setForwardTargets] = useState([]);
  const [forwardNote, setForwardNote] = useState('');
  const [forwardBusy, setForwardBusy] = useState(false);
  const sendForward = async () => {
    if (forwardTargets.length === 0) return;
    setForwardBusy(true);
    try {
      // Bulk path — forwarding many messages from select mode. We call the
      // single-message endpoint once per message; backend already handles the
      // N-target fan-out. Errors per-message are surfaced together at the end.
      if (forwardMsg?.bulk && Array.isArray(forwardMsg.ids)) {
        const ids = forwardMsg.ids;
        const results = await Promise.allSettled(ids.map(id =>
          api.post('/messages/forward', {
            messageId: id,
            targetChannelIds: forwardTargets,
            note: forwardNote
          })
        ));
        const failed = results.filter(r => r.status === 'rejected').length;
        const okCount = ids.length - failed;
        setForwardMsg(null);
        setForwardTargets([]);
        setForwardNote('');
        setSelectMode(false);
        setSelectedMsgIds(new Set());
        if (failed > 0) {
          dialog.alert(`Forwarded ${okCount} of ${ids.length} message${ids.length === 1 ? '' : 's'} to ${forwardTargets.length} chat${forwardTargets.length === 1 ? '' : 's'}. ${failed} failed.`);
        } else {
          dialog.alert(`✓ Forwarded ${okCount} message${okCount === 1 ? '' : 's'} to ${forwardTargets.length} chat${forwardTargets.length === 1 ? '' : 's'}`);
        }
      } else {
        const r = await api.post('/messages/forward', {
          messageId: forwardMsg._id,
          targetChannelIds: forwardTargets,
          note: forwardNote
        });
        setForwardMsg(null);
        setForwardTargets([]);
        setForwardNote('');
        dialog.alert(`✓ Forwarded to ${r.data.forwarded} ${r.data.forwarded === 1 ? 'chat' : 'chats'}`);
      }
    } catch (e) {
      dialog.alert('Forward failed: ' + (e.response?.data?.error || e.message), 'Error');
    }
    setForwardBusy(false);
  };

  // Bulk-delete handler called from the select-mode toolbar. Loops the existing
  // per-message endpoint; backend authorisation runs per-message (only your own
  // messages, or any if admin).
  const bulkDeleteMessages = async () => {
    if (selectedMsgIds.size === 0 || !activeChannel) return;
    const ok = await dialog.confirm(
      `Delete ${selectedMsgIds.size} message${selectedMsgIds.size === 1 ? '' : 's'}? This cannot be undone.`,
      'Delete messages?'
    );
    if (!ok) return;
    const ids = [...selectedMsgIds];
    const results = await Promise.allSettled(ids.map(id =>
      api.delete(`/messages/${activeChannel._id}/${id}`)
    ));
    const failed = results.filter(r => r.status === 'rejected').length;
    setSelectMode(false);
    setSelectedMsgIds(new Set());
    if (failed > 0) {
      dialog.alert(`Deleted ${ids.length - failed} of ${ids.length}. ${failed} couldn't be deleted (you can only delete your own messages).`);
    }
  };

  // Close inline dropdowns (mention, emoji, compose picker) on any outside click.
  // The EmojiPicker itself stops propagation on its own mousedown, so clicks
  // inside it never bubble here. Clicks on the toggle buttons (😊 / 😀 / +)
  // are handled by their own onClick after this fires — they re-open as needed.
  useEffect(() => {
    const onDoc = (e) => {
      const inInputBar = !!e.target.closest?.('.msg-input-bar');
      const inActionBtn = !!e.target.closest?.('.msg-action-btn');
      // Always close mention + compose picker outside input bar
      if (!inInputBar) {
        setShowMentionDropdown(false);
        setShowComposePicker(false);
      }
      // Close ANY emoji picker (input or per-message reaction) on any outside
      // click — except clicks on the action button itself (it toggles)
      if (!inActionBtn && !inInputBar) {
        setEmojiPickerMsg(null);
      } else if (inInputBar && !e.target.closest?.('.msg-input-action')) {
        // Click inside input bar but not on the 😊 toggle — close input picker
        setEmojiPickerMsg(prev => prev === 'input' ? null : prev);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const [mentions, setMentions] = useState([]);

  // Format switching per spec Section 6.4.1
  const [displayFormat, setDisplayFormat] = useState('chat'); // chat | email | table | calendar | document
  const [aiSummary, setAiSummary] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState(new Set());

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
    // Optimistically zero out the unread badge for this channel — gives instant
    // feedback even before the loadMessages mark-read round-trip completes.
    setChannels(prev => prev.map(c => c._id === channel._id ? { ...c, unreadCount: 0 } : c));
    // Load messages (which also marks them as read on the server), then refresh
    // the channel list so the sidebar's unread counters reflect server truth.
    loadMessages(channel._id).then(() => loadChannels());
    // Pre-load channel members so @mentions work without opening the side panel
    api.get(`/messages/${channel._id}/members`)
      .then(r => setChannelMembers(r.data || []))
      .catch(() => setChannelMembers([]));
    setTyping(null);
    setThreadParent(null);
    setRightPanel(null);
    setEditingMsg(null);
    setTaskMsg(null);
    setMsgSearch('');
    setMsgSearchResults([]);
    setMobileSidebar(false);
  }, [joinChannel, leaveChannel, loadMessages, loadChannels]);

  // Socket listeners
  useEffect(() => {
    if (!socket) return;

    const handleMessage = async (msg) => {
      const isForActive = String(msg.channel) === String(activeChannel?._id);
      if (isForActive) {
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
        // Auto mark-read since the user is actively viewing this channel.
        // AWAIT the mark-read before refreshing channels so the sidebar count
        // doesn't show a stale "1 unread" on a message the user just saw.
        if (msg.sender?._id !== user._id && document.visibilityState === 'visible') {
          try { await api.post(`/messages/${activeChannel._id}/read`); } catch {}
          // Optimistically zero out the unread badge for this channel
          setChannels(prev => prev.map(c => c._id === activeChannel._id ? { ...c, unreadCount: 0 } : c));
        }
      } else if (msg.sender?._id !== user._id) {
        // Message for a non-active channel — bump that channel's unread count
        // optimistically so the badge appears instantly, then reconcile via loadChannels.
        setChannels(prev => prev.map(c =>
          String(c._id) === String(msg.channel)
            ? { ...c, unreadCount: (c.unreadCount || 0) + 1, lastMessage: msg, lastMessageAt: msg.createdAt }
            : c
        ));
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

    // Server emits this when async work patches a message (e.g. link preview)
    const handleUpdated = (msg) => {
      setMessages(prev => prev.map(m => m._id === msg._id ? { ...m, ...msg } : m));
      setThreadReplies(prev => prev.map(m => m._id === msg._id ? { ...m, ...msg } : m));
    };

    // Belt-and-suspenders refresh of the active channel. Socket events are the
    // primary path, but browsers throttle setInterval/sockets on backgrounded
    // tabs and the socket can be briefly disconnected on flaky office WiFi —
    // both cases can swallow a new message. We refresh on:
    //   - socket reconnect (fills the gap during disconnect)
    //   - tab becomes visible (catches throttled-tab missed events)
    //   - every 25s while the tab is visible (cheap fallback)
    const refreshActive = () => {
      if (activeChannel?._id) loadMessages(activeChannel._id);
      loadChannels();
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') refreshActive(); };
    const onReconnect = () => refreshActive();
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') refreshActive();
    }, 25000);

    socket.on('message:received', handleMessage);
    socket.on('user:typing', handleTyping);
    socket.on('user:stop-typing', handleStopTyping);
    socket.on('message:reaction', handleReaction);
    socket.on('message:edited', handleEdited);
    socket.on('message:deleted', handleDeleted);
    socket.on('message:updated', handleUpdated);
    socket.on('connect', onReconnect);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      socket.off('message:received', handleMessage);
      socket.off('user:typing', handleTyping);
      socket.off('user:stop-typing', handleStopTyping);
      socket.off('message:reaction', handleReaction);
      socket.off('message:edited', handleEdited);
      socket.off('message:deleted', handleDeleted);
      socket.off('message:updated', handleUpdated);
      socket.off('connect', onReconnect);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(poll);
    };
  }, [socket, activeChannel, user._id, loadChannels, loadMessages, threadParent]);

  const sendMessage = async () => {
    if (!activeChannel) return;
    const text = input.trim();
    const filesToSend = pendingFiles;
    if (!text && filesToSend.length === 0) return;
    // Optimistic clear (both React state AND DOM) — avoids flash of stale text
    setInput('');
    setMentions([]);
    setPendingFiles([]);
    if (messageInputRef.current) {
      messageInputRef.current.value = '';
      messageInputRef.current.style.height = 'auto';
    }
    emitStopTyping(activeChannel._id);
    try {
      if (filesToSend.length > 0) {
        // First file carries the caption; rest are bare uploads
        for (let i = 0; i < filesToSend.length; i++) {
          const caption = i === 0 ? text : '';
          await uploadFile(filesToSend[i], caption);
        }
      } else {
        await api.post(`/messages/${activeChannel._id}`, { content: text, mentions: mentions.length > 0 ? mentions : undefined });
      }
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
      const hydrated = channelMembers.filter(m => m && m.name);
      console.log('[@mention] @ detected. q=', q, 'hydrated=', hydrated.length, 'activeChannel=', activeChannel?._id);

      const showFiltered = (list, source) => {
        const filtered = list.filter(m => m.name?.toLowerCase().includes(q) && m._id !== user._id).slice(0, 8);
        console.log('[@mention]', source, '→', filtered.length, 'matches');
        setMentionResults(filtered);
        setShowMentionDropdown(filtered.length > 0);
      };

      // Always show what we already have immediately so the dropdown never lags
      if (hydrated.length > 0) showFiltered(hydrated, 'cached');

      // And fetch fresh in the background if cache empty or stale
      if (activeChannel?._id) {
        api.get(`/messages/${activeChannel._id}/members`)
          .then(r => {
            const list = r.data || [];
            console.log('[@mention] fetched members:', list.length);
            setChannelMembers(list);
            showFiltered(list, 'fetched');
          })
          .catch(err => console.warn('[@mention] members fetch failed:', err?.response?.status, err?.message));
      }
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
    if (!(await dialog.confirm('Delete this message?'))) return;
    try {
      await api.delete(`/messages/${activeChannel._id}/${messageId}`);
    } catch {}
  };

  // File upload — also called by drag-and-drop
  const uploadFile = async (file, caption = '') => {
    if (!file || !activeChannel) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('content', caption || '');
    try {
      await api.post(`/messages/${activeChannel._id}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to upload file.');
    }
  };

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    // Stage the files — user reviews preview + hits Send (consistent with drop/paste)
    setPendingFiles(prev => [...prev, ...files]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Drag-and-drop file handlers
  const [isDragOver, setIsDragOver] = useState(false);
  const handleDragOver = (e) => {
    if (!activeChannel) return;
    if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      if (!isDragOver) setIsDragOver(true);
    }
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };
  // Staged files: shown above the input as previews; only upload when user hits Send
  const [pendingFiles, setPendingFiles] = useState([]);
  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (!activeChannel) return;
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length === 0) return;
    setPendingFiles(prev => [...prev, ...files]);
  };
  const sendPendingFiles = async () => {
    if (pendingFiles.length === 0) return;
    const files = pendingFiles;
    setPendingFiles([]);
    for (const f of files) { try { await uploadFile(f); } catch (_) {} }
  };
  const removePendingFile = (idx) => setPendingFiles(prev => prev.filter((_, i) => i !== idx));

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
      // Self-DM (only one member = you) → friendly label
      const isSelf = ch.members?.length === 1 && (ch.members[0]._id || ch.members[0]) === user._id;
      if (isSelf) return `📌 Saved · ${user.name}`;
      const other = ch.members?.find(m => (m._id || m) !== user._id);
      return other?.name || ch.name;
    }
    return ch.name;
  };

  // For a normal 2-person DM, return the OTHER member.
  // For a self-DM (1 member = you), return yourself so the UI shows your name
  // (e.g. "📌 Saved — Yourself"), not "Unknown".
  const getOtherDMUser = (ch) => {
    if (!ch?.members) return null;
    if (ch.members.length === 1) return ch.members[0];
    return ch.members.find(m => (m._id || m) !== user._id) || ch.members[0];
  };

  const handleAiSummarize = async (specificMsgIds) => {
    if (!user.aiActive || !activeChannel) return;
    setAiLoading(true);
    try {
      let msgsToSummarize;
      if (specificMsgIds?.size > 0) {
        msgsToSummarize = messages.filter(m => specificMsgIds.has(m._id));
      } else {
        msgsToSummarize = messages;
      }

      // Sort by timestamp to ensure chronological order
      msgsToSummarize.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

      // Build text with timestamps and sequence numbers
      const isTaskThread = activeChannel.name?.startsWith('Task:');
      const maxWords = isTaskThread ? null : 2000;
      let text = msgsToSummarize.map((m, i) => {
        const time = new Date(m.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        return `[${i + 1}] ${m.sender?.name || 'Unknown'} (${time}): ${m.content}`;
      }).join('\n');
      if (maxWords) {
        const words = text.split(/\s+/);
        if (words.length > maxWords) text = words.slice(0, maxWords).join(' ') + '...';
      }

      const { data } = await api.post('/ai/summarize', { text });
      setAiSummary(data.summary || data.result || 'No summary generated.');
      setSelectMode(false);
      setSelectedMsgIds(new Set());
    } catch (err) { setAiSummary(err.response?.data?.error || 'Failed to generate summary. Check AI configuration in Settings.'); }
    finally { setAiLoading(false); }
  };

  const isAdmin = ['main_admin', 'admin'].includes(user.role);

  // Rich content renderer — formats task cards, tables, code blocks, checklists, polls
  const renderRichContent = (content) => {
    if (!content) return null;

    // Task card
    if (content.startsWith('📋 **Task Assignment**')) {
      const lines = content.split('\n').filter(l => l.trim());
      return (
        <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: 12, borderLeft: '3px solid var(--indigo)' }}>
          {lines.map((l, i) => {
            const clean = l.replace(/\*\*/g, '').replace(/━+/g, '');
            if (i === 0) return <div key={i} style={{ fontWeight: 700, color: 'var(--indigo)', marginBottom: 6 }}>{clean}</div>;
            if (!clean.trim()) return null;
            return <div key={i} style={{ fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.8 }}>{clean}</div>;
          })}
        </div>
      );
    }

    // Table
    if (content.startsWith('📊 **Table**')) {
      const lines = content.split('\n').filter(l => l.trim() && l.includes('|'));
      if (lines.length >= 2) {
        const headers = lines[0].split('|').map(h => h.trim()).filter(Boolean);
        const rows = lines.slice(2).map(r => r.split('|').map(c => c.trim()).filter(Boolean));
        return (
          <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', background: 'var(--glass-2)', padding: '6px 0' }}>
              {headers.map((h, i) => <div key={i} style={{ flex: 1, padding: '0 10px', fontSize: 10, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase' }}>{h}</div>)}
            </div>
            {rows.map((r, ri) => (
              <div key={ri} style={{ display: 'flex', borderTop: '1px solid var(--line)', padding: '4px 0' }}>
                {r.map((c, ci) => <div key={ci} style={{ flex: 1, padding: '2px 10px', fontSize: 11, color: 'var(--ink-2)' }}>{c}</div>)}
              </div>
            ))}
          </div>
        );
      }
    }

    // Email format
    if (content.startsWith('✉️ **')) {
      const subjectMatch = content.match(/✉️ \*\*(.*?)\*\*/);
      const body = content.replace(/✉️ \*\*.*?\*\*\n━+\n?/, '');
      return (
        <div style={{ background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}>
          <div style={{ fontWeight: 700, color: 'var(--ink)', marginBottom: 6, borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>✉️ {subjectMatch?.[1]}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{body}</div>
        </div>
      );
    }

    // Checklist
    if (content.startsWith('☑️ **Checklist**')) {
      const items = content.split('\n').slice(1).filter(l => l.trim());
      return (
        <div style={{ background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}>
          <div style={{ fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>☑️ Checklist</div>
          {items.map((item, i) => {
            const isDone = item.startsWith('✅');
            const text = item.replace(/^[✅⬜]\s*/, '');
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 12, color: isDone ? 'var(--ink-3)' : 'var(--ink-2)', textDecoration: isDone ? 'line-through' : 'none' }}>
                <span>{isDone ? '✅' : '⬜'}</span>{text}
              </div>
            );
          })}
        </div>
      );
    }

    // Code block
    if (content.includes('```')) {
      const match = content.match(/💻 \*\*Code\*\* \((\w+)\)\n```\w*\n([\s\S]*?)```/);
      if (match) {
        return (
          <div>
            <div style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 4 }}>💻 {match[1]}</div>
            <pre style={{ background: 'var(--bg-0)', border: '1px solid var(--line)', borderRadius: 8, padding: 12, fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink)', overflow: 'auto', whiteSpace: 'pre-wrap' }}>{match[2]}</pre>
          </div>
        );
      }
    }

    // Poll
    if (content.startsWith('📊 **Poll:')) {
      const lines = content.split('\n').filter(l => l.trim());
      const question = lines[0].replace(/📊 \*\*Poll: /, '').replace(/\*\*$/, '');
      const options = lines.slice(1).filter(l => !l.startsWith('_'));
      return (
        <div style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 10, padding: 12 }}>
          <div style={{ fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>📊 {question}</div>
          {options.map((opt, i) => (
            <div key={i} style={{ padding: '6px 10px', marginBottom: 4, background: 'var(--glass)', borderRadius: 6, fontSize: 12, color: 'var(--ink-2)', cursor: 'pointer', border: '1px solid var(--line)' }}>{opt}</div>
          ))}
          <div style={{ fontSize: 10, color: 'var(--ink-4)', marginTop: 6, fontStyle: 'italic' }}>React with the emoji to vote!</div>
        </div>
      );
    }

    // Default — plain text with @mention + URL highlighting.
    // Tokenize by mentions first, then linkify each non-mention chunk.
    const URL_RE = /(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+)/gi;
    const linkify = (text, keyPrefix) => {
      if (!text) return text;
      const parts = text.split(URL_RE);
      return parts.map((p, i) => {
        if (URL_RE.test(p)) {
          // Reset regex state — split() doesn't but test() does
          URL_RE.lastIndex = 0;
          // Trim trailing punctuation that often gets caught at sentence end
          const trailing = p.match(/[.,!?;)]+$/);
          const url = trailing ? p.slice(0, -trailing[0].length) : p;
          const tail = trailing ? trailing[0] : '';
          const href = url.startsWith('http') ? url : `https://${url}`;
          return (
            <span key={`${keyPrefix}-${i}`}>
              <a href={href} target="_blank" rel="noopener noreferrer"
                 onClick={e => e.stopPropagation()}
                 style={{ color: 'var(--indigo)', textDecoration: 'underline', wordBreak: 'break-all' }}>
                {url}
              </a>
              {tail}
            </span>
          );
        }
        return p;
      });
    };

    // WhatsApp-style inline formatting: **bold** *italic* ~strike~ `code`
    const renderInline = (text, keyPrefix) => {
      if (!text) return text;
      // Tokenize: each formatting type alternates with plain text
      const tokens = [];
      let cursor = 0;
      const RE = /\*\*([^*\n]+?)\*\*|__([^_\n]+?)__|\*([^*\n]+?)\*|_([^_\n]+?)_|~([^~\n]+?)~|`([^`\n]+?)`/g;
      let m;
      while ((m = RE.exec(text))) {
        if (m.index > cursor) tokens.push({ t: 'plain', v: text.slice(cursor, m.index) });
        if (m[1] || m[2]) tokens.push({ t: 'b', v: m[1] || m[2] });
        else if (m[3] || m[4]) tokens.push({ t: 'i', v: m[3] || m[4] });
        else if (m[5]) tokens.push({ t: 's', v: m[5] });
        else if (m[6]) tokens.push({ t: 'c', v: m[6] });
        cursor = m.index + m[0].length;
      }
      if (cursor < text.length) tokens.push({ t: 'plain', v: text.slice(cursor) });
      return tokens.map((tk, i) => {
        const k = `${keyPrefix}-i-${i}`;
        if (tk.t === 'b') return <strong key={k}>{tk.v}</strong>;
        if (tk.t === 'i') return <em key={k}>{tk.v}</em>;
        if (tk.t === 's') return <span key={k} style={{ textDecoration: 'line-through' }}>{tk.v}</span>;
        if (tk.t === 'c') return <code key={k} style={{ background: 'rgba(99,102,241,0.12)', padding: '1px 5px', borderRadius: 4, fontSize: '0.92em', fontFamily: 'monospace' }}>{tk.v}</code>;
        return <span key={k}>{linkify(tk.v, k)}</span>;
      });
    };

    // Convert keycap emojis to plain digits — they look unprofessional and
    // don't handle 11+ correctly (1️⃣1️⃣ = 11 renders as two side-by-side keycaps).
    // Map 0️⃣–9️⃣ to "0"–"9" and 🔟 to "10", then collapse adjacent digits.
    const stripKeycaps = (text) => {
      if (!text) return text;
      return text
        // 🔟 → 10
        .replace(/🔟/g, '10')
        // 0️⃣–9️⃣ → 0–9
        .replace(/([0-9])️⃣/gu, '$1');
    };

    // Detect bullet/numbered/quote line prefix (post-keycap-strip)
    const renderLine = (line, lineKey) => {
      const cleaned = stripKeycaps(line);
      // Promote inline "1)" or "1." style numbered prefix
      const bullet = cleaned.match(/^([*•\-])\s+(.*)$/);
      const numbered = cleaned.match(/^(\d+)[.)]\s*(.*)$/);
      const quote = cleaned.match(/^>\s+(.*)$/);
      // Bare leading number (was a keycap) without a delimiter: e.g. "11 Megha Roy — ..."
      const bareNum = cleaned.match(/^(\d{1,2})\s+([A-Z].*)$/);
      if (bullet) {
        return (
          <div key={lineKey} style={{ display: 'flex', gap: 10, paddingLeft: 4, marginBottom: 4 }}>
            <span style={{ color: 'var(--indigo)', fontWeight: 700 }}>•</span>
            <span style={{ flex: 1 }}>{withMentions(bullet[2], lineKey)}</span>
          </div>
        );
      }
      if (numbered) {
        return (
          <div key={lineKey} style={{ display: 'flex', gap: 10, paddingLeft: 4, marginBottom: 4 }}>
            <span style={{ color: 'var(--indigo)', fontWeight: 700, minWidth: 22 }}>{numbered[1]}.</span>
            <span style={{ flex: 1 }}>{withMentions(numbered[2], lineKey)}</span>
          </div>
        );
      }
      if (bareNum) {
        return (
          <div key={lineKey} style={{ display: 'flex', gap: 10, paddingLeft: 4, marginBottom: 4 }}>
            <span style={{ color: 'var(--indigo)', fontWeight: 700, minWidth: 22 }}>{bareNum[1]}.</span>
            <span style={{ flex: 1 }}>{withMentions(bareNum[2], lineKey)}</span>
          </div>
        );
      }
      if (quote) {
        return (
          <div key={lineKey} style={{ borderLeft: '3px solid var(--indigo)', paddingLeft: 8, color: 'var(--ink-2)', fontStyle: 'italic', marginBottom: 4 }}>
            {withMentions(quote[1], lineKey)}
          </div>
        );
      }
      // Heading: whole line wrapped in ** ** → render bigger/bolder
      const headingMatch = cleaned.match(/^\*\*(.+?)\*\*\s*$/);
      if (headingMatch) {
        return (
          <div key={lineKey} style={{
            fontSize: 14, fontWeight: 800, color: 'var(--ink)',
            marginTop: 8, marginBottom: 4, letterSpacing: -0.2
          }}>
            {withMentions(headingMatch[1], lineKey)}
          </div>
        );
      }
      // Plain paragraph — give blank lines proper spacing
      if (!cleaned.trim()) return <div key={lineKey} style={{ height: 6 }} />;
      return <div key={lineKey} style={{ marginBottom: 2 }}>{withMentions(cleaned, lineKey)}</div>;
    };

    const withMentions = (segment, keyPrefix) => {
      return segment.split(/(@\w[\w\s]*?)(?=\s|$)/g).map((part, i) => {
        const k = `${keyPrefix}-m-${i}`;
        if (part.startsWith('@')) {
          return <span key={k} style={{ color: 'var(--indigo)', fontWeight: 600 }}>{part}</span>;
        }
        return <span key={k}>{renderInline(part, k)}</span>;
      });
    };

    // Auto-paragraph the source content so inline list markers render as a list.
    // Step 1: collapse keycap-digit sequences (incl. multi-digit like 1️⃣1️⃣=11) → plain "N. "
    let normalized = (content || '')
      .replace(/(?:(?:[0-9]️⃣)+|🔟)/gu, (m) => {
        const num = m === '🔟' ? '10' : m.replace(/️⃣/g, '');
        return `${num}. `;
      })
      // Step 2: each "N. " inline becomes a new line so renderLine can format it
      .replace(/(\S)\s+(\d{1,2}\.\s)/g, '$1\n$2');

    let lines = normalized.split('\n');

    // Step 3: heuristic auto-bullet detection for copy-pasted text that lost
    // its list formatting. Triggers:
    //   (a) Line ending in ":" followed by 2+ short non-empty lines  → heading + bullets
    //   (b) 3+ consecutive lines matching "Word — description" or "Word - description"
    //   (c) 3+ consecutive short lines (<80 chars), no other inline marker
    const isAlreadyMarked = (l) => /^([*•\-]\s|>\s|\d+[.)]\s)/.test(l.trim());
    const isHeading = (l) => /:\s*$/.test(l.trim()) && l.trim().length < 80;
    const isDashItem = (l) => /^[^—\-•*]{2,40}\s+[—-]\s+\S/.test(l.trim());
    const isShortLine = (l) => l.trim().length > 0 && l.trim().length < 90 && !isAlreadyMarked(l);

    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // (a) heading + followers
      if (isHeading(line)) {
        // Look ahead — count how many short followers
        let j = i + 1;
        const followers = [];
        while (j < lines.length && lines[j].trim() && !isAlreadyMarked(lines[j]) && !isHeading(lines[j]) && lines[j].trim().length < 200) {
          followers.push(lines[j]);
          j++;
          if (followers.length >= 30) break;
        }
        if (followers.length >= 2) {
          out.push('**' + line.trim() + '**'); // bold heading
          followers.forEach(f => out.push('• ' + f.trim()));
          i = j - 1;
          continue;
        }
      }
      // (b)(c) consecutive list-like lines — bulletize them as a group
      if (!isAlreadyMarked(line) && (isDashItem(line) || isShortLine(line))) {
        let j = i;
        const group = [];
        const allDash = [];
        while (j < lines.length && lines[j].trim() && !isAlreadyMarked(lines[j]) && !isHeading(lines[j])) {
          if (isDashItem(lines[j]) || isShortLine(lines[j])) {
            group.push(lines[j]);
            if (isDashItem(lines[j])) allDash.push(true);
            j++;
          } else break;
        }
        if (group.length >= 3) {
          group.forEach(g => out.push('• ' + g.trim()));
          i = j - 1;
          continue;
        }
      }
      out.push(line);
    }

    return out.map((line, idx) => renderLine(line.trim(), `l-${idx}`));
  };

  const renderMessageBubble = (msg, isThread = false, opts = {}) => {
    if (msg.type === 'system') return <div key={msg._id} className="msg-system">{msg.content}</div>;
    const sender = msg.sender;
    const isMe = sender?._id === user._id;
    const isEditing = editingMsg === msg._id;
    const canDelete = isMe || isAdmin;
    const grouped = !!opts.grouped;

    // Emoji-only detection: render content much bigger (WhatsApp/iMessage style)
    const trimmed = (msg.content || '').trim();
    // Strip variation selectors + ZWJ to count emoji count vs other chars
    const stripped = trimmed.replace(/[︀-️‍\s]/g, '');
    // Match emoji blocks (very rough but good enough for vast majority)
    const EMOJI_RE = /\p{Extended_Pictographic}/u;
    const emojiOnly =
      trimmed.length > 0 &&
      stripped.length > 0 &&
      // Replace all emoji-like chars with empty, what's left should be empty
      stripped.replace(/[\p{Extended_Pictographic}\p{Emoji_Component}]/gu, '') === '' &&
      EMOJI_RE.test(trimmed) &&
      // Cap at a few "characters" so big paragraphs of emoji don't blow up
      [...stripped].length <= 6 &&
      !msg.file && !msg.linkPreview?.title;

    return (
      <div key={msg._id} className={`msg-bubble ${msg.isDeleted ? 'deleted' : ''} ${grouped ? 'grouped' : ''} ${isMe ? 'mine' : ''} ${emojiOnly ? 'emoji-only' : ''}`}
        style={selectMode ? { cursor: 'pointer', background: selectedMsgIds.has(msg._id) ? 'rgba(99,102,241,0.06)' : undefined, borderRadius: 8, padding: '4px 8px', margin: '-4px -8px', marginBottom: 10 } : undefined}
        onClick={selectMode ? () => setSelectedMsgIds(prev => { const n = new Set(prev); n.has(msg._id) ? n.delete(msg._id) : n.add(msg._id); return n; }) : undefined}>
        {grouped ? (
          <div className="msg-bubble-avatar-spacer" />
        ) : (
          <Avatar user={sender} size={38} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }} />
        )}
        <div className="msg-bubble-content">
          {!grouped && (
          <div className="msg-bubble-header">
            <span className="msg-bubble-name">{sender?.name || 'Unknown'}</span>
            <span className="msg-bubble-time">
              {new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
            {msg.isEdited && !msg.isDeleted && <span className="msg-edited-tag">(edited)</span>}
            {msg.isPinned && !msg.isDeleted && <span className="msg-pinned-tag">pinned</span>}
          </div>
          )}

          {isEditing ? (
            <div className="msg-edit-form">
              <textarea
                className="msg-edit-input msg-edit-textarea"
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                onKeyDown={e => {
                  // Enter saves; Shift+Enter inserts newline; Escape cancels
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                  else if (e.key === 'Escape') cancelEdit();
                }}
                onInput={e => {
                  // Auto-grow to fit content
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                }}
                ref={el => {
                  if (el) {
                    el.style.height = 'auto';
                    el.style.height = el.scrollHeight + 'px';
                  }
                }}
                rows={1}
                autoFocus
              />
              <div className="msg-edit-actions">
                <button className="msg-edit-save" onClick={saveEdit}>Save</button>
                <button className="msg-edit-cancel" onClick={cancelEdit}>Cancel</button>
                <span style={{ fontSize: 10, color: 'var(--ink-3)', marginLeft: 'auto', alignSelf: 'center' }}>Enter to save · Shift+Enter newline · Esc to cancel</span>
              </div>
            </div>
          ) : (
            <div className="msg-bubble-text">{renderRichContent(msg.content)}</div>
          )}

          {/* Link preview card — click-through opens the actual link */}
          {msg.linkPreview?.title && !msg.isDeleted && (
            <a href={msg.linkPreview.url} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{
                display: 'block', marginTop: 6, maxWidth: 480,
                background: 'var(--glass)', border: '1px solid var(--line)',
                borderLeft: '3px solid var(--indigo)', borderRadius: 8,
                overflow: 'hidden', textDecoration: 'none', color: 'inherit',
                cursor: 'pointer'
              }}>
              {/* Header row: thumbnail + title/description */}
              <div style={{ display: 'flex' }}>
                {msg.linkPreview.image && (
                  <img src={msg.linkPreview.image} alt=""
                    style={{ width: 96, height: 96, objectFit: 'cover', flexShrink: 0 }}
                    onError={e => { e.target.style.display = 'none'; }} />
                )}
                <div style={{ padding: '8px 10px', flex: 1, minWidth: 0 }}>
                  {msg.linkPreview.siteName && (
                    <div style={{ fontSize: 9, color: 'var(--ink-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
                      {msg.linkPreview.siteName}
                    </div>
                  )}
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {msg.linkPreview.title}
                  </div>
                  {msg.linkPreview.description && (
                    <div style={{ fontSize: 10, color: 'var(--ink-2)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {msg.linkPreview.description}
                    </div>
                  )}
                </div>
              </div>

              {/* Tweet / X media gallery (up to 4 images) */}
              {msg.linkPreview.gallery && msg.linkPreview.gallery.length > 0 && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: msg.linkPreview.gallery.length === 1 ? '1fr' : 'repeat(2, 1fr)',
                  gap: 2, background: 'var(--line)', padding: 0, borderTop: '1px solid var(--line)'
                }}>
                  {msg.linkPreview.gallery.slice(0, 4).map((g, gi) => (
                    <div key={gi} style={{ position: 'relative', aspectRatio: msg.linkPreview.gallery.length === 1 ? '16 / 9' : '1 / 1', overflow: 'hidden' }}>
                      <img src={g.url} alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={e => { e.target.style.display = 'none'; }} />
                      {g.type === 'video' && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.25)', fontSize: 28, color: '#fff' }}>▶</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </a>
          )}

          {msg.file && (() => {
            const fileUrl = getFileUrl(msg.file.path || msg.file.url);
            const mime = msg.file.mimeType || '';
            const ext = (msg.file.name || '').split('.').pop().toLowerCase();
            const isImage = mime.startsWith('image/');
            const isVideo = mime.startsWith('video/');
            const isPdf = mime === 'application/pdf' || ext === 'pdf';
            const isOffice = ['xlsx','xls','xlsm','docx','doc','pptx','ppt','odt','ods','odp','rtf'].includes(ext)
              || mime.includes('spreadsheet') || mime.includes('wordprocessingml') || mime.includes('presentation');
            const officeIcon = ['xlsx','xls','xlsm','ods','csv'].includes(ext) ? '📊'
              : ['docx','doc','odt','rtf'].includes(ext) ? '📝'
              : ['pptx','ppt','odp'].includes(ext) ? '📽'
              : '📄';
            const officeLabel = ['xlsx','xls','xlsm','ods'].includes(ext) ? 'Spreadsheet'
              : ['docx','doc','odt','rtf'].includes(ext) ? 'Document'
              : ['pptx','ppt','odp'].includes(ext) ? 'Presentation'
              : 'File';
            const openViewer = () => setViewingFile({ url: fileUrl, name: msg.file.name, mimeType: mime, size: msg.file.originalSize });
            const sizeStr = msg.file.originalSize
              ? (msg.file.originalSize > 1024 * 1024
                  ? `${(msg.file.originalSize / 1024 / 1024).toFixed(1)} MB`
                  : `${Math.round(msg.file.originalSize / 1024)} KB`)
              : '';

            return (
              <div style={{ marginTop: 6, maxWidth: 460 }}>
                {/* Inline image preview — full bleed thumbnail */}
                {isImage && (
                  <img src={fileUrl} alt={msg.file.name}
                    onClick={openViewer}
                    style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 10, cursor: 'pointer', objectFit: 'cover', display: 'block', border: '1px solid var(--line)' }}
                    onError={e => { e.target.src = ''; e.target.alt = '🖼️ Image preview unavailable — click to view'; e.target.style.padding = '20px'; e.target.style.fontSize = '11px'; e.target.style.color = 'var(--ink-3)'; e.target.style.background = 'var(--glass)'; e.target.style.maxHeight = '60px'; }}
                  />
                )}
                {/* Inline video preview */}
                {isVideo && (
                  <video src={fileUrl} controls style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 10, display: 'block', border: '1px solid var(--line)' }} />
                )}
                {/* PDF — inline first-page preview using <embed> */}
                {isPdf && (
                  <div onClick={openViewer}
                    style={{ cursor: 'pointer', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line)', background: '#1a1a2e' }}>
                    <embed src={fileUrl + '#toolbar=0&navpanes=0&view=FitH'} type="application/pdf"
                      style={{ width: '100%', height: 280, border: 'none', display: 'block', pointerEvents: 'none' }} />
                    <div style={{ padding: '8px 12px', background: 'var(--glass)', display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid var(--line)' }}>
                      <span style={{ fontSize: 22 }}>📕</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.file.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>PDF · {sizeStr} · click to open</div>
                      </div>
                    </div>
                  </div>
                )}
                {/* Office — big visual card */}
                {isOffice && (
                  <div onClick={openViewer}
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, padding: 16, borderRadius: 10, background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(139,92,246,0.06))', border: '1px solid rgba(99,102,241,0.18)' }}>
                    <div style={{ fontSize: 38, lineHeight: 1, flexShrink: 0 }}>{officeIcon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.file.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>{officeLabel} · {sizeStr}</div>
                      <div style={{ fontSize: 10, color: 'var(--indigo)', marginTop: 4, fontWeight: 600 }}>Click to preview →</div>
                    </div>
                  </div>
                )}
                {/* Generic fallback for everything else */}
                {!isImage && !isVideo && !isPdf && !isOffice && (() => {
                  const isText = mime.startsWith('text/') || ['json','csv','md','txt','js','jsx','ts','tsx','css','html','htm','xml','yaml','yml','py','rb','go','rs','sh','sql','log','env','conf','ini','toml','c','cpp','h','java','kt','swift','php','vue','svelte'].includes(ext);
                  return (
                    <div className="msg-file" onClick={openViewer}
                      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 8, background: 'var(--glass)', border: '1px solid var(--line)' }}>
                      <span style={{ fontSize: 24 }}>{isText ? '📝' : '📎'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="msg-file-name">{msg.file.name}</div>
                        <div className="msg-file-size">{sizeStr}</div>
                      </div>
                      {isText && (
                        <button onClick={async (e) => {
                          e.stopPropagation();
                          const btn = e.currentTarget;
                          const original = btn.textContent;
                          try {
                            const resp = await fetch(fileUrl);
                            const text = await resp.text();
                            await navigator.clipboard.writeText(text);
                            btn.textContent = 'Copied!';
                            setTimeout(() => { btn.textContent = original; }, 1500);
                          } catch {
                            btn.textContent = 'Failed';
                            setTimeout(() => { btn.textContent = original; }, 1500);
                          }
                        }}
                          style={{ fontSize: 10, color: 'var(--emerald)', fontWeight: 700, padding: '4px 10px', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 5, background: 'rgba(16,185,129,0.08)', cursor: 'pointer', fontFamily: 'Inter' }}>
                          Copy
                        </button>
                      )}
                      <button onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const resp = await fetch(fileUrl);
                          const blob = await resp.blob();
                          const u = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = u; a.download = msg.file.name; a.click();
                          URL.revokeObjectURL(u);
                        } catch { window.open(fileUrl, '_blank'); }
                      }}
                        style={{ fontSize: 10, color: '#6366F1', fontWeight: 700, padding: '4px 10px', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 5, background: 'rgba(99,102,241,0.08)', cursor: 'pointer', fontFamily: 'Inter' }}>
                        Download
                      </button>
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {/* Message hover actions */}
          {!msg.isDeleted && !isEditing && (
            <div className="msg-hover-actions">
              {!isThread && (
                <button className="msg-action-btn" onClick={() => openThread(msg)} title="Reply in thread">
                  <MessageCircle size={14} strokeWidth={2.2} />
                  {msg.replyCount > 0 && <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 4 }}>{msg.replyCount}</span>}
                </button>
              )}
              <button className="msg-action-btn" onClick={() => togglePin(msg._id)} title={msg.isPinned ? 'Unpin' : 'Pin'}>
                <Pin size={14} strokeWidth={2.2} fill={msg.isPinned ? 'currentColor' : 'none'} />
              </button>
              <button className="msg-action-btn" onClick={() => setEmojiPickerMsg(emojiPickerMsg === msg._id ? null : msg._id)} title="React">
                <SmilePlus size={14} strokeWidth={2.2} />
              </button>
              {!isThread && (
                <button className="msg-action-btn" onClick={() => openTaskForm(msg)} title="Create task">
                  <ListPlus size={14} strokeWidth={2.2} />
                </button>
              )}
              <button className="msg-action-btn" onClick={async (e) => {
                const btn = e.currentTarget;
                try {
                  await navigator.clipboard.writeText(msg.content || '');
                  btn.classList.add('copied');
                  setTimeout(() => btn.classList.remove('copied'), 1200);
                } catch {}
              }} title="Copy text">
                <Copy size={14} strokeWidth={2.2} />
              </button>
              <button className="msg-action-btn" onClick={() => { setForwardMsg(msg); setForwardTargets([]); setForwardNote(''); }} title="Forward">
                <Forward size={14} strokeWidth={2.2} />
              </button>
              {isMe && (
                <button className="msg-action-btn" onClick={() => startEdit(msg)} title="Edit">
                  <Pencil size={14} strokeWidth={2.2} />
                </button>
              )}
              {canDelete && (
                <button className="msg-action-btn msg-action-danger" onClick={() => deleteMessage(msg._id)} title="Delete">
                  <Trash2 size={14} strokeWidth={2.2} />
                </button>
              )}
            </div>
          )}

          {/* Emoji full picker for reactions */}
          {emojiPickerMsg === msg._id && (
            <div style={{ position: 'relative' }}>
              <EmojiPicker
                position="top"
                anchor={isMe ? 'right' : 'left'}
                onPick={(em) => { react(msg._id, em); pushRecentEmoji(em); setEmojiPickerMsg(null); }}
              />
            </div>
          )}

          {/* Seen-by pill — only shown in channels and groups (not DMs).
              DMs already show a single "✓✓ Seen" at the bottom of the chat tail;
              repeating "Seen by 1/1" on every bubble there is just noise. */}
          {isMe && !msg.isDeleted && Array.isArray(msg.readBy)
            && activeChannel?.type !== 'dm' && (() => {
            // Count members other than the sender — those are the potential readers
            const totalReaders = Math.max(0, (activeChannel?.members?.length || 0) - 1);
            // readBy includes the sender themselves; subtract them out
            const seenCount = Math.max(0, msg.readBy.filter(id => id !== user._id).length);
            // Skip when there's only one other member — the chat-tail Seen tick covers it
            if (totalReaders <= 1) return null;
            const allSeen = seenCount >= totalReaders;
            return (
              <div
                onClick={(e) => { e.stopPropagation(); setSeenByMsg(msg); }}
                title="Click to see who has seen this message"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '1px 8px', borderRadius: 10, marginTop: 4, alignSelf: 'flex-end',
                  fontSize: 9, fontWeight: 600, cursor: 'pointer',
                  background: allSeen ? 'rgba(16,185,129,0.10)' : 'rgba(99,102,241,0.10)',
                  color: allSeen ? '#10B981' : '#6366F1',
                  border: `1px solid ${allSeen ? 'rgba(16,185,129,0.25)' : 'rgba(99,102,241,0.25)'}`
                }}>
                {allSeen ? '✓✓' : '👁'} Seen by {seenCount}/{totalReaders}
              </div>
            );
          })()}

          {/* Reactions display — hover any pill to see who reacted */}
          {msg.reactions?.length > 0 && (
            <div className="msg-reactions">
              {msg.reactions.map((r, ri) => (
                <ReactionPill
                  key={ri}
                  emoji={r.emoji}
                  users={r.users}
                  mine={r.users.includes(user._id)}
                  align="left"
                  resolveName={(id) => {
                    if (String(id) === String(user._id)) return 'You';
                    const u = allUsers.find(x => String(x._id) === String(id))
                      || channelMembers.find(x => String(x._id) === String(id));
                    return u?.name || 'Someone';
                  }}
                  className="msg-reaction"
                  onClick={() => react(msg._id, r.emoji)}
                />
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
      {/* Mobile sidebar overlay */}
      <div className={`msg-sidebar-overlay ${mobileSidebar ? 'mobile-open' : ''}`} onClick={() => setMobileSidebar(false)} />
      {/* Conversation Sidebar */}
      <div className={`msg-sidebar ${mobileSidebar ? 'mobile-open' : ''}`}>
        <div className="msg-sidebar-search">
          <input placeholder="Search conversations..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="msg-sidebar-list">
          {/* Channels */}
          <div className="msg-section-title"><span>Channels</span><span className="msg-section-add" onClick={() => setCreateModal('channel')}>+</span></div>
          {grouped.channel.map(ch => (
            <div key={ch._id} className={`msg-conv-item ${activeChannel?._id === ch._id ? 'active' : ''} ${ch.unreadCount > 0 ? 'unread' : ''}`} onClick={() => selectChannel(ch)}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-3)', width: 20, textAlign: 'center' }}>#</span>
              <span className="msg-conv-name">{ch.name.replace('#', '')}</span>
              {ch.unreadCount > 0 && <span className="msg-unread-badge">{ch.unreadCount}</span>}
            </div>
          ))}

          {/* Direct Messages */}
          <div className="msg-section-title"><span>Direct Messages</span><span className="msg-section-add" onClick={() => setCreateModal('dm')}>+</span></div>
          {grouped.dm.map(ch => {
            const isSelfDM = ch.members?.length === 1 && (ch.members[0]._id || ch.members[0]) === user._id;
            const other = getOtherDMUser(ch);
            const isOnline = onlineUsers.includes(other?._id);
            const label = isSelfDM ? '📌 Saved (you)' : (other?.name || 'Unknown');
            return (
              <div key={ch._id} className={`msg-conv-item ${activeChannel?._id === ch._id ? 'active' : ''} ${ch.unreadCount > 0 ? 'unread' : ''}`} onClick={() => selectChannel(ch)}>
                <div className="msg-avatar-wrap">
                  {isSelfDM ? (
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(99,102,241,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>📌</div>
                  ) : (
                    <Avatar user={other} size={24} />
                  )}
                  {!isSelfDM && <div className="msg-status-dot" style={{ background: isOnline ? '#10B981' : 'var(--ink-4)' }} />}
                </div>
                <span className="msg-conv-name">{label}</span>
                {ch.unreadCount > 0 && <span className="msg-unread-badge">{ch.unreadCount}</span>}
              </div>
            );
          })}

          {/* Groups */}
          {grouped.group.length > 0 && <>
            <div className="msg-section-title"><span>Groups</span><span className="msg-section-add" onClick={() => setCreateModal('group')}>+</span></div>
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
            <div className="msg-section-title"><span>Rooms</span><span className="msg-section-add" onClick={() => setCreateModal('room')}>+</span></div>
            {grouped.room.map(ch => (
              <div key={ch._id} className={`msg-conv-item ${activeChannel?._id === ch._id ? 'active' : ''} ${ch.unreadCount > 0 ? 'unread' : ''}`} onClick={() => selectChannel(ch)}>
                <span style={{ fontSize: 13 }}>🔒</span>
                <span className="msg-conv-name">{ch.name}</span>
                {ch.unreadCount > 0 && <span className="msg-unread-badge">{ch.unreadCount}</span>}
              </div>
            ))}
          </>}
          {/* Broadcast button */}
          <div style={{ padding: '8px 12px', borderTop: '1px solid var(--line)' }}>
            <div onClick={() => setCreateModal('broadcast')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--indigo)', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', textAlign: 'center', justifyContent: 'center' }}>
              📢 Broadcast Message
            </div>
          </div>
        </div>
      </div>

      {/* Create Channel/DM/Group/Room/Broadcast Modal */}
      {createModal && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9998 }} onClick={() => setCreateModal(null)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 9999, background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.5)', padding: 24, minWidth: 400, maxWidth: 500, maxHeight: '80vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>
                {createModal === 'channel' && '# New Channel'}
                {createModal === 'dm' && '💬 New Direct Message'}
                {createModal === 'group' && '👥 New Group Chat'}
                {createModal === 'room' && '🔒 New Private Room'}
                {createModal === 'broadcast' && '📢 Broadcast Message'}
              </h2>
              <button onClick={() => setCreateModal(null)} style={{ background: 'none', border: 'none', color: 'var(--ink-3)', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>

            {/* Name field (not for DM/Broadcast) */}
            {['channel', 'group', 'room'].includes(createModal) && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>
                  {createModal === 'channel' ? 'Channel Name' : createModal === 'room' ? 'Room Name' : 'Group Name'} *
                </div>
                <input className="ad-input" value={createForm.name} onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))}
                  placeholder={createModal === 'channel' ? 'e.g. design-team' : createModal === 'room' ? 'e.g. Project Alpha' : 'e.g. Lunch Squad'} />
              </div>
            )}

            {/* Description (channel/room only) */}
            {['channel', 'room'].includes(createModal) && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>Description</div>
                <input className="ad-input" value={createForm.description} onChange={e => setCreateForm(p => ({ ...p, description: e.target.value }))} placeholder="What's this about?" />
              </div>
            )}

            {/* Broadcast message */}
            {createModal === 'broadcast' && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>Message *</div>
                <textarea className="ad-textarea" value={createForm.message} onChange={e => setCreateForm(p => ({ ...p, message: e.target.value }))} placeholder="Type your broadcast message..." rows={3} />
                <div style={{ fontSize: 10, color: 'var(--ink-4)', marginTop: 4 }}>This message will be sent as individual DMs to each selected person (BCC-style)</div>
              </div>
            )}

            {/* People picker */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>
                {createModal === 'dm' ? 'Select Person' : 'Select People'} {createModal !== 'channel' ? '*' : ''}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 10, background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 8, maxHeight: 200, overflow: 'auto' }}>
                {/* In DM mode, show "📌 Saved (Yourself)" as the first option */}
                {createModal === 'dm' && (
                  <div onClick={() => setCreateForm(p => ({ ...p, members: [user._id] }))}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6,
                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      background: createForm.members.includes(user._id) ? 'rgba(99,102,241,0.12)' : 'rgba(245,158,11,0.08)',
                      color: createForm.members.includes(user._id) ? 'var(--indigo)' : '#F59E0B',
                      border: `1px solid ${createForm.members.includes(user._id) ? 'rgba(99,102,241,0.3)' : 'rgba(245,158,11,0.3)'}`
                    }}>
                    {createForm.members.includes(user._id) ? '✓ ' : '📌 '}Saved (yourself)
                  </div>
                )}
                {allUsers.filter(u => u._id !== user._id).map(u => (
                  <div key={u._id} onClick={() => {
                    if (createModal === 'dm') setCreateForm(p => ({ ...p, members: [u._id] }));
                    else toggleMember(u._id);
                  }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6,
                      fontSize: 11, fontWeight: 500, cursor: 'pointer',
                      background: createForm.members.includes(u._id) ? 'rgba(99,102,241,0.12)' : 'var(--glass-2)',
                      color: createForm.members.includes(u._id) ? 'var(--indigo)' : 'var(--ink-2)',
                      border: `1px solid ${createForm.members.includes(u._id) ? 'rgba(99,102,241,0.3)' : 'var(--line)'}`
                    }}>
                    {createForm.members.includes(u._id) ? '✓ ' : ''}{u.name}
                  </div>
                ))}
              </div>
              {createForm.members.length > 0 && (
                <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 4 }}>{createForm.members.length} selected</div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
              <button
                onClick={() => setCreateModal(null)}
                style={{
                  padding: '8px 18px', fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif',
                  border: '1px solid var(--line)', borderRadius: 8, background: 'transparent',
                  color: 'var(--ink-2)', cursor: 'pointer'
                }}
              >Cancel</button>
              <button
                onClick={handleCreate}
                disabled={createModal !== 'channel' && createForm.members.length === 0}
                style={{
                  padding: '8px 18px', fontSize: 13, fontWeight: 700, fontFamily: 'Inter, sans-serif',
                  border: 'none', borderRadius: 8,
                  background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', color: '#fff',
                  cursor: 'pointer', opacity: (createModal !== 'channel' && createForm.members.length === 0) ? 0.5 : 1
                }}
              >
                {createModal === 'broadcast' ? '📢 Send Broadcast' : createModal === 'dm' ? '💬 Start Chat' : 'Create'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Chat Area */}
      {activeChannel ? (
        <div
          className="msg-chat"
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{ position: 'relative' }}
        >
          {isDragOver && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 50,
              background: 'rgba(99,102,241,0.12)',
              border: '2px dashed var(--indigo)',
              borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none'
            }}>
              <div style={{ background: 'var(--bg-1)', padding: '14px 22px', borderRadius: 10, border: '1px solid var(--line-2)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 4 }}>📥</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Drop file to upload</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>Up to 50 MB per file</div>
              </div>
            </div>
          )}
          <div className="msg-chat-header">
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <button className="msg-mobile-menu-btn" onClick={() => setMobileSidebar(true)}
                style={{ display: 'none', background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ink-2)', marginRight: 8, padding: '4px' }}>☰</button>
              <span className="msg-chat-title">
                {activeChannel.type === 'room' ? '🔒 ' : ''}{getChannelDisplayName(activeChannel)}
              </span>
              <span className="msg-chat-sub">
                {activeChannel.type === 'dm' ? (
                  (activeChannel.members?.length === 1 && (activeChannel.members[0]._id || activeChannel.members[0]) === user._id)
                    ? 'Personal space'
                    : (onlineUsers.includes(getOtherDMUser(activeChannel)?._id) ? '🟢 Online' : 'Offline')
                ) :
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
                title={selectMode ? 'Summarize selected messages' : (user.aiActive ? 'Select messages to summarize' : 'AI not activated')}
                onClick={() => {
                  if (!user.aiActive) return;
                  if (selectMode) {
                    if (selectedMsgIds.size === 0) { dialog.alert('Select at least one message to summarize.'); return; }
                    handleAiSummarize(selectedMsgIds);
                  } else {
                    // For task threads, summarize all directly. For DMs/channels, enter select mode
                    const isTaskThread = activeChannel.name?.startsWith('Task:');
                    if (isTaskThread) { handleAiSummarize(); } else { setSelectMode(true); }
                  }
                }}
                style={{ padding: '4px 10px', border: `1px solid ${selectMode ? '#10B981' : 'var(--line)'}`, borderRadius: 6, fontSize: 10, background: selectMode ? 'rgba(16,185,129,0.12)' : (user.aiActive ? 'rgba(99,102,241,0.08)' : 'var(--glass)'), color: selectMode ? '#10B981' : (user.aiActive ? '#6366F1' : 'var(--ink-3)'), cursor: user.aiActive ? 'pointer' : 'not-allowed', opacity: user.aiActive ? 1 : 0.4, fontFamily: 'Inter,sans-serif' }}
              >
                {aiLoading ? 'Summarizing...' : selectMode ? `Summarize (${selectedMsgIds.size})` : '\u2728 Summarize'}
              </button>
              <button
                onClick={() => {
                  if (selectMode) { setSelectMode(false); setSelectedMsgIds(new Set()); }
                  else { setSelectMode(true); }
                }}
                title={selectMode ? 'Exit select mode' : 'Select multiple messages to forward or delete'}
                style={{ padding: '4px 10px', border: `1px solid ${selectMode ? '#6366F1' : 'var(--line)'}`, borderRadius: 6, fontSize: 10, background: selectMode ? 'rgba(99,102,241,0.18)' : 'var(--glass)', color: selectMode ? '#6366F1' : 'var(--ink-3)', cursor: 'pointer', fontFamily: 'Inter,sans-serif', fontWeight: 600 }}
              >
                {selectMode ? `☑ Selecting (${selectedMsgIds.size})` : '☑ Select'}
              </button>
              <button className={`msg-header-btn ${rightPanel === 'pinned' ? 'active' : ''}`} onClick={() => openRightPanel('pinned')} title="Pinned messages">📌</button>
              <button className={`msg-header-btn ${rightPanel === 'files' ? 'active' : ''}`} onClick={() => openRightPanel('files')} title="Files">📁</button>
              <button className={`msg-header-btn ${rightPanel === 'members' ? 'active' : ''}`} onClick={() => openRightPanel('members')} title="Members">👥</button>
            </div>
          </div>

          <div className="msg-chat-main">
            <div className="msg-chat-body-wrap">
              {/* Select mode bar — bulk Forward / Delete / Summarize */}
              {selectMode && (
                <div style={{ padding: '6px 14px', background: 'rgba(99,102,241,0.08)', borderBottom: '1px solid rgba(99,102,241,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', gap: 6 }}>
                  <span style={{ fontSize: 11, color: '#6366F1', fontWeight: 600 }}>
                    Click messages to select ({selectedMsgIds.size} selected)
                  </span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={() => setSelectedMsgIds(new Set(messages.map(m => m._id)))}
                      style={{ padding: '3px 8px', fontSize: 9, border: '1px solid #6366F1', borderRadius: 4, background: 'rgba(99,102,241,0.06)', color: '#6366F1', cursor: 'pointer', fontFamily: 'Inter' }}>Select All</button>
                    <button onClick={() => {
                        if (selectedMsgIds.size === 0) { dialog.alert('Select at least one message first.'); return; }
                        setForwardMsg({ bulk: true, ids: [...selectedMsgIds] });
                        setForwardTargets([]);
                        setForwardNote('');
                      }}
                      disabled={selectedMsgIds.size === 0}
                      style={{ padding: '3px 10px', fontSize: 10, border: '1px solid #6366F1', borderRadius: 4, background: selectedMsgIds.size > 0 ? '#6366F1' : 'rgba(99,102,241,0.20)', color: selectedMsgIds.size > 0 ? '#fff' : '#6366F1', cursor: selectedMsgIds.size > 0 ? 'pointer' : 'not-allowed', fontFamily: 'Inter', fontWeight: 600 }}>
                      ➤ Forward ({selectedMsgIds.size})
                    </button>
                    <button onClick={bulkDeleteMessages}
                      disabled={selectedMsgIds.size === 0}
                      style={{ padding: '3px 10px', fontSize: 10, border: '1px solid rgba(239,68,68,0.5)', borderRadius: 4, background: 'rgba(239,68,68,0.08)', color: '#EF4444', cursor: selectedMsgIds.size > 0 ? 'pointer' : 'not-allowed', fontFamily: 'Inter', fontWeight: 600, opacity: selectedMsgIds.size > 0 ? 1 : 0.5 }}>
                      🗑 Delete
                    </button>
                    <button onClick={() => { setSelectMode(false); setSelectedMsgIds(new Set()); }}
                      style={{ padding: '3px 8px', fontSize: 9, border: '1px solid var(--line)', borderRadius: 4, background: 'var(--glass)', color: 'var(--ink-3)', cursor: 'pointer', fontFamily: 'Inter' }}>Cancel</button>
                  </div>
                </div>
              )}
              <div className="msg-chat-body">
                {displayFormat === 'chat' && (() => {
                  // Insert date separators + collapse consecutive messages from same sender within 3 min
                  const fmtDay = (d) => {
                    const t = new Date(d);
                    const today = new Date(); today.setHours(0,0,0,0);
                    const y = new Date(today); y.setDate(today.getDate() - 1);
                    const dt = new Date(t); dt.setHours(0,0,0,0);
                    if (dt.getTime() === today.getTime()) return 'Today';
                    if (dt.getTime() === y.getTime()) return 'Yesterday';
                    return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                  };
                  const out = [];
                  let lastDay = null;
                  let lastSender = null;
                  let lastTime = 0;
                  messages.forEach((m, i) => {
                    const day = fmtDay(m.createdAt);
                    const ts = new Date(m.createdAt).getTime();
                    if (day !== lastDay) {
                      out.push(
                        <div key={`day-${day}-${i}`} className="msg-day-separator">
                          <span>{day}</span>
                        </div>
                      );
                      lastDay = day;
                      lastSender = null;
                    }
                    const sameAuthor = lastSender === (m.sender?._id || m.sender);
                    const closeInTime = ts - lastTime < 3 * 60 * 1000; // 3 min
                    const grouped = sameAuthor && closeInTime && m.type !== 'system';
                    lastSender = m.sender?._id || m.sender;
                    lastTime = ts;
                    out.push(renderMessageBubble(m, false, { grouped }));
                  });
                  return out;
                })()}

                {displayFormat === 'email' && messages.filter(m => m.type !== 'system').map(msg => (
                  <div key={msg._id} style={{ background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 8, padding: 14, marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
                      <div><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink)' }}>{msg.sender?.name}</span><span style={{ fontSize: 10, color: 'var(--ink-3)', marginLeft: 8 }}>&lt;{msg.sender?.email}&gt;</span></div>
                      <span style={{ fontSize: 10, color: 'var(--ink-4)' }}>{new Date(msg.createdAt).toLocaleString()}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                  </div>
                ))}

                {displayFormat === 'table' && (
                  <div style={{ background: 'var(--glass)', borderRadius: 8, border: '1px solid var(--line)', overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '120px 100px 1fr 120px', padding: '8px 12px', background: 'var(--glass)', borderBottom: '1px solid var(--line)', fontSize: 9, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase' }}>
                      <div>Sender</div><div>Time</div><div>Message</div><div>Attachments</div>
                    </div>
                    {messages.filter(m => m.type !== 'system').map(msg => (
                      <div key={msg._id} style={{ display: 'grid', gridTemplateColumns: '120px 100px 1fr 120px', padding: '8px 12px', borderBottom: '1px solid var(--line)', fontSize: 11, alignItems: 'center' }}>
                        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{msg.sender?.name}</div>
                        <div style={{ color: 'var(--ink-3)', fontSize: 10 }}>{new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
                        <div style={{ color: 'var(--ink-2)' }}>{msg.content}</div>
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
                          <span style={{ color: 'var(--ink-3)', width: 60, flexShrink: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>{new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                          <span style={{ fontWeight: 600, color: 'var(--ink)', width: 100, flexShrink: 0 }}>{msg.sender?.name}</span>
                          <span style={{ color: 'var(--ink-2)' }}>{msg.content}</span>
                        </div>
                      ))}
                    </div>
                  ));
                })()}

                {displayFormat === 'document' && (
                  <div style={{ background: 'var(--glass)', borderRadius: 8, border: '1px solid var(--line)', padding: '24px 32px', maxWidth: 640, margin: '0 auto' }}>
                    <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', marginBottom: 4, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                      {activeChannel?.name || 'Conversation'}
                    </h2>
                    <div style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--line)' }}>
                      {messages.length} messages · {activeChannel?.members?.length} members
                    </div>
                    {messages.filter(m => m.type !== 'system').map(msg => (
                      <div key={msg._id} style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink)' }}>
                          {msg.sender?.name} <span style={{ fontWeight: 400, color: 'var(--ink-4)' }}>— {new Date(msg.createdAt).toLocaleString()}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.7, paddingLeft: 0, marginTop: 2 }}>{msg.content}</div>
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
                      <button onClick={() => setAiSummary(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--ink-3)' }}>&times;</button>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{aiSummary}</div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="msg-typing">{typing ? `${typing} is typing...` : ''}</div>

              {/* Compose format panel — shows above input when a format is selected */}
              {composeMode && (
                <div style={{ borderTop: '1px solid var(--line)', padding: 12, background: 'var(--glass-2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
                      {composeMode === 'task' && '📋 Create Task Card'}
                      {composeMode === 'table' && '📊 Create Table'}
                      {composeMode === 'email' && '✉️ Email Format'}
                      {composeMode === 'checklist' && '☑️ Checklist'}
                      {composeMode === 'code' && '💻 Code Block'}
                      {composeMode === 'poll' && '📊 Create Poll'}
                    </span>
                    <button onClick={() => { setComposeMode(null); resetComposeState(); }} style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 16 }}>✕</button>
                  </div>

                  {/* TASK CARD */}
                  {composeMode === 'task' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input className="ad-input" placeholder="Task title *" value={composeTask.title} onChange={e => setComposeTask(p => ({ ...p, title: e.target.value }))} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <select className="ad-select" value={composeTask.assignee} onChange={e => setComposeTask(p => ({ ...p, assignee: e.target.value }))} style={{ flex: 1 }}>
                          <option value="">Assign to...</option>
                          {channelUsers.map(u => <option key={u._id} value={u.name}>{u.name}</option>)}
                        </select>
                        <select className="ad-select" value={composeTask.priority} onChange={e => setComposeTask(p => ({ ...p, priority: e.target.value }))}>
                          <option value="top">🔴 Top</option>
                          <option value="high">🟠 High</option>
                          <option value="medium">🟡 Medium</option>
                          <option value="low">🟢 Low</option>
                        </select>
                        <input className="ad-input" type="date" value={composeTask.deadline} onChange={e => setComposeTask(p => ({ ...p, deadline: e.target.value }))} style={{ width: 140 }} />
                      </div>
                      <input className="ad-input" placeholder="Description (optional)" value={composeTask.description} onChange={e => setComposeTask(p => ({ ...p, description: e.target.value }))} />
                      <button className="msg-send-btn" onClick={sendTaskCard} disabled={!composeTask.title.trim()} style={{ alignSelf: 'flex-end' }}>Send Task Card</button>
                    </div>
                  )}

                  {/* TABLE */}
                  {composeMode === 'table' && (
                    <div>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                        {composeTable.headers.map((h, i) => (
                          <input key={i} className="ad-input" value={h} onChange={e => {
                            const nh = [...composeTable.headers]; nh[i] = e.target.value;
                            setComposeTable(p => ({ ...p, headers: nh }));
                          }} style={{ flex: 1, fontWeight: 700, fontSize: 11 }} />
                        ))}
                        <button className="ad-btn-icon" onClick={() => {
                          setComposeTable(p => ({ headers: [...p.headers, `Col ${p.headers.length + 1}`], rows: p.rows.map(r => [...r, '']) }));
                        }} title="Add column">+</button>
                      </div>
                      {composeTable.rows.map((row, ri) => (
                        <div key={ri} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                          {row.map((cell, ci) => (
                            <input key={ci} className="ad-input" value={cell} onChange={e => {
                              const nr = composeTable.rows.map((r, idx) => idx === ri ? r.map((c, cidx) => cidx === ci ? e.target.value : c) : r);
                              setComposeTable(p => ({ ...p, rows: nr }));
                            }} style={{ flex: 1, fontSize: 11 }} />
                          ))}
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <button className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => setComposeTable(p => ({ ...p, rows: [...p.rows, p.headers.map(() => '')] }))}>+ Row</button>
                        <button className="msg-send-btn" onClick={sendTable} style={{ marginLeft: 'auto' }}>Send Table</button>
                      </div>
                    </div>
                  )}

                  {/* EMAIL FORMAT */}
                  {composeMode === 'email' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input className="ad-input" placeholder="Subject *" value={composeEmail.subject} onChange={e => setComposeEmail(p => ({ ...p, subject: e.target.value }))} style={{ fontWeight: 600 }} />
                      <textarea className="ad-textarea" placeholder="Email body..." value={composeEmail.body} onChange={e => setComposeEmail(p => ({ ...p, body: e.target.value }))} rows={4} />
                      <button className="msg-send-btn" onClick={sendEmailFormat} disabled={!composeEmail.subject.trim()} style={{ alignSelf: 'flex-end' }}>Send Email</button>
                    </div>
                  )}

                  {/* CHECKLIST */}
                  {composeMode === 'checklist' && (
                    <div>
                      {composeChecklist.map((item, i) => (
                        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                          <input type="checkbox" checked={item.done} onChange={() => {
                            const nc = [...composeChecklist]; nc[i] = { ...nc[i], done: !nc[i].done };
                            setComposeChecklist(nc);
                          }} style={{ accentColor: 'var(--indigo)' }} />
                          <input className="ad-input" value={item.text} onChange={e => {
                            const nc = [...composeChecklist]; nc[i] = { ...nc[i], text: e.target.value };
                            setComposeChecklist(nc);
                          }} placeholder={`Item ${i + 1}`} style={{ flex: 1 }} />
                          {composeChecklist.length > 1 && <button onClick={() => setComposeChecklist(composeChecklist.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}>✕</button>}
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <button className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => setComposeChecklist([...composeChecklist, { text: '', done: false }])}>+ Item</button>
                        <button className="msg-send-btn" onClick={sendChecklist} style={{ marginLeft: 'auto' }}>Send Checklist</button>
                      </div>
                    </div>
                  )}

                  {/* CODE BLOCK */}
                  {composeMode === 'code' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <select className="ad-select" value={composeCode.language} onChange={e => setComposeCode(p => ({ ...p, language: e.target.value }))}>
                        {['javascript', 'python', 'html', 'css', 'json', 'bash', 'sql', 'java', 'go', 'rust', 'typescript', 'text'].map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                      <textarea className="ad-textarea" value={composeCode.code} onChange={e => setComposeCode(p => ({ ...p, code: e.target.value }))} placeholder="Paste your code here..." rows={6} style={{ fontFamily: 'var(--mono)', fontSize: 12 }} />
                      <button className="msg-send-btn" onClick={sendCodeBlock} disabled={!composeCode.code.trim()} style={{ alignSelf: 'flex-end' }}>Send Code</button>
                    </div>
                  )}

                  {/* POLL */}
                  {composeMode === 'poll' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input className="ad-input" placeholder="Poll question *" value={composePoll.question} onChange={e => setComposePoll(p => ({ ...p, question: e.target.value }))} style={{ fontWeight: 600 }} />
                      {composePoll.options.map((opt, i) => (
                        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 14 }}>{['🅰️','🅱️','🅲️','🅳️','🅴️'][i] || '⭕'}</span>
                          <input className="ad-input" value={opt} onChange={e => {
                            const no = [...composePoll.options]; no[i] = e.target.value;
                            setComposePoll(p => ({ ...p, options: no }));
                          }} placeholder={`Option ${i + 1}`} style={{ flex: 1 }} />
                          {composePoll.options.length > 2 && <button onClick={() => setComposePoll(p => ({ ...p, options: p.options.filter((_, idx) => idx !== i) }))} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}>✕</button>}
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: 6 }}>
                        {composePoll.options.length < 5 && <button className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => setComposePoll(p => ({ ...p, options: [...p.options, ''] }))}>+ Option</button>}
                        <button className="msg-send-btn" onClick={sendPoll} disabled={!composePoll.question.trim()} style={{ marginLeft: 'auto' }}>Send Poll</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Pending file previews — shown above the input when user drops files */}
              {pendingFiles.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: 10, background: 'rgba(99,102,241,0.06)', borderTop: '1px solid var(--line)' }}>
                  {pendingFiles.map((f, i) => {
                    const isImg = f.type.startsWith('image/');
                    const url = isImg ? URL.createObjectURL(f) : null;
                    return (
                      <div key={i} style={{ position: 'relative', background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 8, padding: 6, minWidth: 120, maxWidth: 180 }}>
                        {isImg ? (
                          <img src={url} alt={f.name} style={{ width: '100%', maxHeight: 80, objectFit: 'cover', borderRadius: 4 }} onLoad={() => URL.revokeObjectURL(url)} />
                        ) : (
                          <div style={{ fontSize: 22, textAlign: 'center' }}>📄</div>
                        )}
                        <div style={{ fontSize: 10, color: 'var(--ink-2)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                        <div style={{ fontSize: 9, color: 'var(--ink-4)' }}>{(f.size / 1024).toFixed(1)} KB</div>
                        <button onClick={() => removePendingFile(i)}
                          style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#EF4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>×</button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="msg-input-bar">
                <div className="msg-input-actions">
                  <div className="msg-input-action" onClick={() => setEmojiPickerMsg(emojiPickerMsg === 'input' ? null : 'input')}>😊</div>
                  <div className="msg-input-action" onClick={() => fileInputRef.current?.click()}>📎</div>
                  {/* Format picker toggle */}
                  <div className="msg-input-action" onClick={() => setShowComposePicker(!showComposePicker)} style={showComposePicker ? { background: 'rgba(99,102,241,0.15)', color: 'var(--indigo)' } : {}}>➕</div>
                </div>
                <input type="file" ref={fileInputRef} multiple style={{ display: 'none' }} onChange={handleFileUpload} />

                {/* Format picker dropdown */}
                {showComposePicker && (
                  <div style={{ position: 'absolute', bottom: 52, left: 100, background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', padding: 6, zIndex: 20, minWidth: 160 }}>
                    {[
                      { key: 'task', icon: '📋', label: 'Task Card' },
                      { key: 'table', icon: '📊', label: 'Table' },
                      { key: 'email', icon: '✉️', label: 'Email Format' },
                      { key: 'checklist', icon: '☑️', label: 'Checklist' },
                      { key: 'code', icon: '💻', label: 'Code Block' },
                      { key: 'poll', icon: '📊', label: 'Poll' },
                    ].map(f => (
                      <div key={f.key} onClick={() => { setComposeMode(f.key); setShowComposePicker(false); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: 'var(--ink-2)', transition: 'background 0.1s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--glass-2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <span style={{ fontSize: 14 }}>{f.icon}</span>
                        <span style={{ fontWeight: 600 }}>{f.label}</span>
                      </div>
                    ))}
                  </div>
                )}

                <textarea
                  ref={messageInputRef}
                  className="msg-input-field"
                  rows={1}
                  spellCheck={true}
                  placeholder={
                    composeMode ? `${composeMode} mode active — use panel above` :
                    pendingFiles.length > 0 ? 'Add a caption (optional)…' :
                    'Type a message... (drop or paste files)'
                  }
                  value={input}
                  onChange={(e) => {
                    handleInputChange(e);
                    // Auto-grow: reset → measure → cap
                    const el = e.target;
                    el.style.height = 'auto';
                    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
                  }}
                  onKeyDown={(e) => {
                    // Enter sends; Shift+Enter adds a newline (like Slack)
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                      // Reset height after send
                      requestAnimationFrame(() => { e.target.style.height = 'auto'; });
                      return;
                    }
                    // Autocorrect the word just completed when space is pressed.
                    // Skip while typing an @mention so handles aren't mangled.
                    if (e.key === ' ' && !showMentionDropdown) {
                      const el = e.target;
                      const caret = el.selectionStart;
                      const fix = autocorrectAtCaret(el.value, caret);
                      if (fix) {
                        e.preventDefault();
                        const newVal = fix.text.slice(0, fix.caret) + ' ' + fix.text.slice(fix.caret);
                        setInput(newVal);
                        requestAnimationFrame(() => {
                          try { el.selectionStart = el.selectionEnd = fix.caret + 1; } catch {}
                        });
                      }
                    }
                  }}
                  onPaste={async (e) => {
                    if (!activeChannel) return;
                    const items = Array.from(e.clipboardData?.items || []);
                    const files = [];
                    for (const it of items) {
                      if (it.kind === 'file') {
                        const f = it.getAsFile();
                        if (f) {
                          // Clipboard screenshots come through with a generic name
                          // like "image.png" (or none). Only synthesize a name in
                          // that case — keep the real filename for actual files.
                          const generic = !f.name || /^(image|screenshot|clipboard|untitled)\.[a-z0-9]+$/i.test(f.name);
                          if (generic) {
                            const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                            const ext = (f.type.split('/')[1] || 'png').split('+')[0];
                            files.push(new File([f], `screenshot-${stamp}.${ext}`, { type: f.type }));
                          } else {
                            files.push(f);
                          }
                        }
                      }
                    }
                    if (files.length > 0) {
                      e.preventDefault();
                      // Stage the pasted file(s) — user reviews + hits Send
                      setPendingFiles(prev => [...prev, ...files]);
                    }
                  }}
                  disabled={!!composeMode}
                />
                <button className="msg-send-btn" onClick={sendMessage} disabled={(!input.trim() && pendingFiles.length === 0) || !!composeMode}>
                  {pendingFiles.length > 0 ? `Send (${pendingFiles.length})` : 'Send'}
                </button>

                {/* @mention dropdown — inside msg-input-bar so position: relative
                    on the bar anchors it directly above the input */}
                {showMentionDropdown && (
                  <div style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: 60, background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', maxHeight: 240, overflowY: 'auto', zIndex: 50, minWidth: 220 }}>
                    <div style={{ padding: '6px 12px', fontSize: 9, fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--line)' }}>
                      Mention someone ({mentionResults.length})
                    </div>
                    {mentionResults.map(m => (
                      <div key={m._id} onClick={() => selectMention(m)}
                        style={{ padding: '8px 12px', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--line)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.08)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: getGradient(m._id), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 700 }}>
                          {getInitials(m.name)}
                        </div>
                        <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{m.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Full emoji picker for input — categories + recent */}
              {emojiPickerMsg === 'input' && (
                <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 8, zIndex: 60 }}>
                  <EmojiPicker
                    position="bottom"
                    onPick={(em) => { setInput(prev => prev + em); pushRecentEmoji(em); }}
                  />
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
                        <div key={msg._id} className="msg-right-panel-file-item" style={{ cursor: 'pointer' }} onClick={() => msg.file && setViewingFile({ url: getFileUrl(msg.file.path || msg.file.url), name: msg.file.name, mimeType: msg.file.mimeType, size: msg.file.originalSize })}>
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
                    <>
                      {/* Delete channel — creator or main_admin only, not for DMs */}
                      {activeChannel && activeChannel.type !== 'dm' && (
                        (activeChannel.createdBy === user._id || activeChannel.createdBy?._id === user._id || user.role === 'main_admin') && (
                          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)' }}>
                            <button onClick={async () => {
                              if (!window.confirm(`Delete channel "${activeChannel.name}" and all its messages? This cannot be undone.`)) return;
                              try {
                                await api.delete(`/messages/channels/${activeChannel._id}`);
                                setActiveChannel(null);
                                setMessages([]);
                                setRightPanel(null);
                                loadChannels();
                              } catch (e) {
                                dialog.alert(e.response?.data?.error || 'Failed to delete.', 'Error');
                              }
                            }} style={{ width: '100%', padding: '8px 10px', fontSize: 11, fontWeight: 700, border: '1px solid rgba(239,68,68,0.4)', borderRadius: 6, background: 'rgba(239,68,68,0.08)', color: '#EF4444', cursor: 'pointer', fontFamily: 'Inter' }}>
                              🗑 Delete this channel
                            </button>
                          </div>
                        )
                      )}
                      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-2)' }}>{channelMembers.length} members</span>
                        {activeChannel?.type !== 'dm' && (
                          <button onClick={() => {
                            const addableUsers = allUsers.filter(u => !channelMembers.some(m => m._id === u._id));
                            if (addableUsers.length === 0) { dialog.alert('No more users to add.'); return; }
                            setShowMemberPicker(prev => !prev);
                          }} style={{ padding: '3px 10px', fontSize: 9, fontWeight: 600, border: '1px solid #6366F1', borderRadius: 5, background: 'rgba(99,102,241,0.08)', color: '#6366F1', cursor: 'pointer', fontFamily: 'Inter' }}>
                            + Add
                          </button>
                        )}
                      </div>
                      {showMemberPicker && (
                        <div style={{ padding: 8, borderBottom: '1px solid var(--line)', maxHeight: 160, overflowY: 'auto' }}>
                          {allUsers.filter(u => !channelMembers.some(m => m._id === u._id)).map(u => (
                            <div key={u._id} onClick={async () => {
                              try {
                                await api.post(`/messages/${activeChannel._id}/members`, { userIds: [u._id] });
                                openRightPanel('members');
                                setShowMemberPicker(false);
                              } catch (e) { dialog.alert(e.response?.data?.error || 'Failed to add member.', 'Error'); }
                            }}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', borderRadius: 6, cursor: 'pointer', fontSize: 11, color: 'var(--ink)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.06)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              <Avatar user={u} size={22} />
                              {u.name}
                            </div>
                          ))}
                        </div>
                      )}
                      {channelMembers.map(member => (
                        <div key={member._id} className="msg-right-panel-member">
                          <Avatar user={member} size={28} />
                          <div className="msg-right-panel-member-info">
                            <div className="msg-right-panel-member-name">{member.name}</div>
                            <div className="msg-right-panel-member-title">{member.jobTitle || member.email}</div>
                          </div>
                          <div className="msg-status-indicator" style={{ background: onlineUsers.includes(member._id) ? '#10B981' : 'var(--ink-4)' }} />
                        </div>
                      ))}
                    </>
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
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Select a conversation</h3>
            <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>Choose a channel, DM, or room from the sidebar</p>
            <button className="msg-mobile-menu-btn" onClick={() => setMobileSidebar(true)}
              style={{ display: 'none', marginTop: 12, padding: '8px 20px', background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Open Conversations
            </button>
          </div>
        </div>
      )}

      {/* Seen-By Modal — lazy-loads the read-receipt list when opened */}
      {seenByMsg && (
        <SeenByModal
          message={seenByMsg}
          channel={activeChannel}
          currentUserId={user._id}
          onClose={() => setSeenByMsg(null)}
        />
      )}

      {/* Forward Message Modal — handles single OR bulk (forwardMsg.bulk) */}
      {forwardMsg && (
        <div className="msg-task-overlay" onClick={() => setForwardMsg(null)}>
          <div className="msg-task-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="msg-task-modal-header">
              <span>➤ Forward {forwardMsg.bulk ? `${forwardMsg.ids.length} Messages` : 'Message'}</span>
              <button className="msg-task-modal-close" onClick={() => setForwardMsg(null)}>✕</button>
            </div>
            <div style={{ padding: 16 }}>
              {/* Preview — single message OR bulk summary */}
              <div style={{ background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 8, padding: 10, marginBottom: 12, borderLeft: '3px solid var(--indigo)' }}>
                {forwardMsg.bulk ? (
                  <>
                    <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 700, marginBottom: 6 }}>
                      Forwarding {forwardMsg.ids.length} messages from this chat
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-2)', maxHeight: 110, overflow: 'auto' }}>
                      {forwardMsg.ids.slice(0, 4).map(id => {
                        const m = messages.find(x => x._id === id);
                        if (!m) return null;
                        const txt = m.content || (m.file ? `📎 ${m.file.name}` : '(media)');
                        return (
                          <div key={id} style={{ padding: '2px 0', borderBottom: '1px solid var(--line)' }}>
                            <span style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{m.sender?.name || '?'}:</span> {txt.slice(0, 80)}{txt.length > 80 ? '…' : ''}
                          </div>
                        );
                      })}
                      {forwardMsg.ids.length > 4 && (
                        <div style={{ padding: '4px 0', color: 'var(--ink-4)', fontSize: 10, fontStyle: 'italic' }}>
                          …and {forwardMsg.ids.length - 4} more
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 700, marginBottom: 4 }}>
                      From {forwardMsg.sender?.name || 'Unknown'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink)', whiteSpace: 'pre-wrap', maxHeight: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {forwardMsg.content || (forwardMsg.file ? `📎 ${forwardMsg.file.name}` : '(no content)')}
                    </div>
                  </>
                )}
              </div>

              {/* Optional note */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>Add a note (optional)</div>
                <textarea
                  value={forwardNote}
                  onChange={e => setForwardNote(e.target.value)}
                  placeholder="Why are you sharing this?"
                  rows={2}
                  style={{ width: '100%', padding: 8, border: '1px solid var(--line)', borderRadius: 6, background: 'var(--bg-1)', color: 'var(--ink)', fontSize: 12, fontFamily: 'Inter, sans-serif', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>

              {/* Channel picker */}
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>
                Select chats to forward to ({forwardTargets.length} selected)
              </div>
              <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 6 }}>
                {channels.filter(c => c._id !== forwardMsg.channel).map(ch => {
                  const isSelected = forwardTargets.includes(ch._id);
                  const isDM = ch.type === 'dm';
                  const otherUser = isDM ? ch.members?.find(m => (m._id || m) !== user._id) : null;
                  const displayName = isDM ? (otherUser?.name || ch.name || 'DM') : ch.name;
                  const icon = isDM ? '💬' : ch.type === 'group' ? '👥' : ch.type === 'room' ? '🚪' : '#';
                  return (
                    <div key={ch._id} onClick={() =>
                      setForwardTargets(prev => isSelected ? prev.filter(id => id !== ch._id) : [...prev, ch._id])
                    } style={{
                      padding: '8px 12px', cursor: 'pointer',
                      background: isSelected ? 'rgba(99,102,241,0.1)' : 'transparent',
                      borderBottom: '1px solid var(--line)',
                      display: 'flex', alignItems: 'center', gap: 10, fontSize: 12
                    }}>
                      <input type="checkbox" checked={isSelected} readOnly
                        style={{ accentColor: 'var(--indigo)', pointerEvents: 'none' }} />
                      <span style={{ fontSize: 14 }}>{icon}</span>
                      <span style={{ flex: 1, color: isSelected ? 'var(--indigo)' : 'var(--ink)', fontWeight: isSelected ? 700 : 500 }}>{displayName}</span>
                      <span style={{ fontSize: 9, color: 'var(--ink-4)' }}>{ch.type}</span>
                    </div>
                  );
                })}
                {channels.filter(c => c._id !== forwardMsg.channel).length === 0 && (
                  <div style={{ padding: 16, textAlign: 'center', fontSize: 11, color: 'var(--ink-3)' }}>
                    No other chats available.
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                <button onClick={() => setForwardMsg(null)}
                  style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, background: 'transparent', color: 'var(--ink-2)', border: '1px solid var(--line)', borderRadius: 6, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={sendForward} disabled={forwardBusy || forwardTargets.length === 0}
                  style={{ padding: '8px 16px', fontSize: 12, fontWeight: 700, background: forwardTargets.length === 0 ? '#475569' : 'linear-gradient(135deg,#6366F1,#8B5CF6)', color: '#fff', border: 'none', borderRadius: 6, cursor: forwardTargets.length === 0 ? 'not-allowed' : 'pointer' }}>
                  {forwardBusy ? 'Forwarding…' : `Forward to ${forwardTargets.length}`}
                </button>
              </div>
            </div>
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

// Modal that fetches the read-receipt list lazily and shows who has seen the
// message. Splits members into "seen" and "not yet seen" so the sender knows
// who's still pending. Works for channels, groups, and DMs alike.
function SeenByModal({ message, channel, currentUserId, onClose }) {
  const [seen, setSeen] = useState(null); // null | array of users
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.get(`/messages/${channel?._id}/${message._id}/read-receipts`)
      .then(r => { if (!cancelled) setSeen(r.data?.readBy || []); })
      .catch(() => { if (!cancelled) setSeen([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [message._id, channel?._id]);

  // Build pending list: members - sender - already-seen
  const members = channel?.members || [];
  const seenIds = new Set((seen || []).map(u => u._id));
  const pending = members.filter(m => m._id !== currentUserId && !seenIds.has(m._id));
  // The receipt list includes the sender themselves; hide them from the "seen" list
  const seenWithoutSender = (seen || []).filter(u => u._id !== currentUserId);

  return (
    <div className="msg-task-overlay" onClick={onClose}>
      <div className="msg-task-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="msg-task-modal-header">
          <span>👁 Seen by</span>
          <button className="msg-task-modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 12, fontStyle: 'italic', maxHeight: 60, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            "{(message.content || message.file?.name || '(media)').slice(0, 100)}"
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--ink-3)', fontSize: 12 }}>Loading…</div>
          ) : (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#10B981', textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.5 }}>
                Seen ({seenWithoutSender.length})
              </div>
              {seenWithoutSender.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--ink-4)', padding: '6px 0' }}>No one has seen this yet.</div>
              ) : (
                <div style={{ marginBottom: 16 }}>
                  {seenWithoutSender.map(u => (
                    <div key={u._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                      <Avatar user={u} size={28} />
                      <div style={{ fontSize: 12, color: 'var(--ink)' }}>{u.name}</div>
                    </div>
                  ))}
                </div>
              )}

              {pending.length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.5 }}>
                    Not yet seen ({pending.length})
                  </div>
                  {pending.map(u => (
                    <div key={u._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', opacity: 0.55 }}>
                      <Avatar user={u} size={28} />
                      <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{u.name}</div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
