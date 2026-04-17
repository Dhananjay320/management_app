import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import api from '../services/api';
import '../styles/email.css';

const GRADIENTS = [
  'linear-gradient(135deg,#6366F1,#8B5CF6)',
  'linear-gradient(135deg,#10B981,#06B6D4)',
  'linear-gradient(135deg,#F59E0B,#F97316)',
  'linear-gradient(135deg,#EC4899,#8B5CF6)',
  'linear-gradient(135deg,#EF4444,#F97316)',
  'linear-gradient(135deg,#06B6D4,#10B981)',
];

function getGradient(str) {
  const hash = (str || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return GRADIENTS[hash % GRADIENTS.length];
}

function getInitials(name) {
  return (name || '??').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatTime(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  if (isToday) return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  if (isYesterday) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatFullDate(dateStr) {
  return new Date(dateStr).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

const FOLDERS = [
  { key: 'inbox', icon: '📥', label: 'Inbox' },
  { key: 'sent', icon: '📤', label: 'Sent' },
  { key: 'drafts', icon: '📝', label: 'Drafts' },
  { key: 'starred', icon: '⭐', label: 'Starred' },
  { key: 'trash', icon: '🗑️', label: 'Trash' },
];

export default function EmailPage() {
  const { user } = useAuth();
  const { socket } = useSocket();

  // State
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('all');
  const [activeFolder, setActiveFolder] = useState('inbox');
  const [emails, setEmails] = useState([]);
  const [activeEmail, setActiveEmail] = useState(null);
  const [categories, setCategories] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState({ totalUnread: 0, perAccount: [] });

  // Compose state
  const [composing, setComposing] = useState(false);
  const [composeMode, setComposeMode] = useState('new'); // 'new', 'reply', 'replyAll', 'forward'
  const [composeData, setComposeData] = useState({ to: '', cc: '', bcc: '', subject: '', body: '', accountId: '' });
  const [showTemplates, setShowTemplates] = useState(false);

  // Drafts
  const [drafts, setDrafts] = useState([]);

  // ─── Load Data ───
  const loadAccounts = useCallback(async () => {
    try {
      const { data } = await api.get('/email/accounts');
      setAccounts(data);
      if (data.length > 0 && !composeData.accountId) {
        setComposeData(prev => ({ ...prev, accountId: data[0]._id }));
      }
    } catch {}
  }, []);

  const loadEmails = useCallback(async () => {
    setLoading(true);
    try {
      if (activeFolder === 'drafts') {
        const { data } = await api.get('/email/drafts');
        setDrafts(data);
        setEmails([]);
      } else if (activeFolder === 'starred') {
        const params = { starred: 'true' };
        if (selectedAccount !== 'all') params.account = selectedAccount;
        if (search) params.search = search;
        const { data } = await api.get('/email/messages', { params });
        setEmails(data);
      } else {
        const params = { folder: activeFolder };
        if (selectedAccount !== 'all') params.account = selectedAccount;
        if (search) params.search = search;
        const { data } = await api.get('/email/messages', { params });
        setEmails(data);
      }
    } catch {}
    setLoading(false);
  }, [activeFolder, selectedAccount, search]);

  const loadUnreadCounts = useCallback(async () => {
    try {
      const { data } = await api.get('/email/messages/unread-counts');
      setUnreadCounts(data);
    } catch {}
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const { data } = await api.get('/email/categories');
      setCategories(data);
    } catch {}
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const { data } = await api.get('/email/templates');
      setTemplates(data);
    } catch {}
  }, []);

  useEffect(() => { loadAccounts(); loadCategories(); loadTemplates(); }, [loadAccounts, loadCategories, loadTemplates]);
  useEffect(() => { loadEmails(); loadUnreadCounts(); }, [loadEmails, loadUnreadCounts]);

  // Socket: new email notification
  useEffect(() => {
    if (!socket) return;
    const handleNewEmail = () => { loadEmails(); loadUnreadCounts(); };
    socket.on('email:new', handleNewEmail);
    return () => socket.off('email:new', handleNewEmail);
  }, [socket, loadEmails, loadUnreadCounts]);

  // ─── Actions ───
  const selectEmail = async (email) => {
    try {
      const { data } = await api.get(`/email/messages/${email._id}`);
      setActiveEmail(data);
      if (!email.isRead) {
        loadEmails();
        loadUnreadCounts();
      }
    } catch {}
  };

  const toggleStar = async (e, emailId) => {
    e.stopPropagation();
    try {
      const { data } = await api.put(`/email/messages/${emailId}/star`);
      setEmails(prev => prev.map(em => em._id === emailId ? { ...em, isStarred: data.isStarred } : em));
      if (activeEmail?._id === emailId) setActiveEmail(prev => ({ ...prev, isStarred: data.isStarred }));
    } catch {}
  };

  const moveToTrash = async (emailId) => {
    try {
      await api.put(`/email/messages/${emailId}/move`, { folder: 'trash' });
      setActiveEmail(null);
      loadEmails();
    } catch {}
  };

  const markAsTask = async () => {
    // Placeholder for mark-as-task integration
  };

  // ─── Compose ───
  const openCompose = (mode = 'new', email = null) => {
    setComposeMode(mode);
    const defaultAccount = accounts[0]?._id || '';

    if (mode === 'new') {
      setComposeData({ to: '', cc: '', bcc: '', subject: '', body: '', accountId: defaultAccount });
    } else if (mode === 'reply' && email) {
      setComposeData({
        to: email.from,
        cc: '',
        bcc: '',
        subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
        body: `\n\n--- Original Message ---\nFrom: ${email.fromName} <${email.from}>\nDate: ${formatFullDate(email.receivedAt)}\n\n${email.bodyText}`,
        accountId: email.account?._id || defaultAccount,
        inReplyTo: email.messageId,
        threadId: email.threadId
      });
    } else if (mode === 'replyAll' && email) {
      const allRecipients = [...(email.to || []), ...(email.cc || [])].filter(e => e !== user.email);
      setComposeData({
        to: email.from,
        cc: allRecipients.join(', '),
        bcc: '',
        subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
        body: `\n\n--- Original Message ---\nFrom: ${email.fromName} <${email.from}>\nDate: ${formatFullDate(email.receivedAt)}\n\n${email.bodyText}`,
        accountId: email.account?._id || defaultAccount,
        inReplyTo: email.messageId,
        threadId: email.threadId
      });
    } else if (mode === 'forward' && email) {
      setComposeData({
        to: '',
        cc: '',
        bcc: '',
        subject: email.subject.startsWith('Fwd:') ? email.subject : `Fwd: ${email.subject}`,
        body: `\n\n--- Forwarded Message ---\nFrom: ${email.fromName} <${email.from}>\nTo: ${(email.to || []).join(', ')}\nDate: ${formatFullDate(email.receivedAt)}\nSubject: ${email.subject}\n\n${email.bodyText}`,
        accountId: email.account?._id || defaultAccount
      });
    }
    setComposing(true);
  };

  const sendEmail = async () => {
    if (!composeData.to.trim()) return;
    try {
      const payload = {
        accountId: composeData.accountId,
        to: composeData.to.split(',').map(e => e.trim()).filter(Boolean),
        cc: composeData.cc ? composeData.cc.split(',').map(e => e.trim()).filter(Boolean) : [],
        bcc: composeData.bcc ? composeData.bcc.split(',').map(e => e.trim()).filter(Boolean) : [],
        subject: composeData.subject,
        bodyHtml: `<div>${composeData.body.replace(/\n/g, '<br/>')}</div>`,
        bodyText: composeData.body,
        inReplyTo: composeData.inReplyTo,
        threadId: composeData.threadId
      };
      await api.post('/email/send', payload);
      setComposing(false);
      loadEmails();
      loadUnreadCounts();
    } catch {}
  };

  const saveDraft = async () => {
    try {
      await api.post('/email/drafts', {
        account: composeData.accountId,
        to: composeData.to.split(',').map(e => e.trim()).filter(Boolean),
        cc: composeData.cc ? composeData.cc.split(',').map(e => e.trim()).filter(Boolean) : [],
        bcc: composeData.bcc ? composeData.bcc.split(',').map(e => e.trim()).filter(Boolean) : [],
        subject: composeData.subject,
        bodyHtml: `<div>${composeData.body.replace(/\n/g, '<br/>')}</div>`,
        bodyText: composeData.body
      });
      setComposing(false);
      if (activeFolder === 'drafts') loadEmails();
    } catch {}
  };

  const applyTemplate = (template) => {
    setComposeData(prev => ({
      ...prev,
      subject: template.subject || prev.subject,
      body: template.bodyText || prev.body
    }));
    setShowTemplates(false);
  };

  const openDraft = (draft) => {
    setComposeData({
      to: (draft.to || []).join(', '),
      cc: (draft.cc || []).join(', '),
      bcc: (draft.bcc || []).join(', '),
      subject: draft.subject || '',
      body: draft.bodyText || '',
      accountId: draft.account?._id || accounts[0]?._id || ''
    });
    setComposeMode('new');
    setComposing(true);
  };

  // Category filter
  const [activeCategory, setActiveCategory] = useState(null);

  const filteredEmails = activeCategory
    ? emails.filter(e => e.categories?.includes(activeCategory))
    : emails;

  // ─── Render ───
  return (
    <div className="email-layout">
      {/* ═══ Left Sidebar ═══ */}
      <div className="email-sidebar">
        <div className="email-sidebar-header">
          <button className="email-compose-btn" onClick={() => openCompose('new')}>
            ✏️ <span>Compose</span>
          </button>
        </div>

        <div className="email-sidebar-nav">
          {/* Account switcher */}
          <div className="email-account-switch">
            <select
              className="email-account-select"
              value={selectedAccount}
              onChange={e => setSelectedAccount(e.target.value)}
            >
              <option value="all">All Inboxes</option>
              {accounts.map(acc => (
                <option key={acc._id} value={acc._id}>
                  {acc.displayName || acc.address}
                  {acc.type === 'shared' ? ' (Shared)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Folders */}
          <div className="email-nav-section">Folders</div>
          {FOLDERS.map(f => (
            <div
              key={f.key}
              className={`email-nav-item ${activeFolder === f.key ? 'active' : ''}`}
              onClick={() => { setActiveFolder(f.key); setActiveEmail(null); setActiveCategory(null); }}
            >
              <span className="email-nav-icon">{f.icon}</span>
              <span className="email-nav-label">{f.label}</span>
              {f.key === 'inbox' && unreadCounts.totalUnread > 0 && (
                <span className="email-nav-count">{unreadCounts.totalUnread}</span>
              )}
            </div>
          ))}

          {/* Accounts list */}
          <div className="email-nav-section">Accounts</div>
          {accounts.map(acc => (
            <div
              key={acc._id}
              className={`email-account-item ${selectedAccount === acc._id ? 'active' : ''}`}
              onClick={() => { setSelectedAccount(acc._id); setActiveFolder('inbox'); setActiveEmail(null); }}
            >
              <div className="email-account-avatar" style={{ background: getGradient(acc.address) }}>
                {getInitials(acc.displayName || acc.address)}
              </div>
              <span className="email-account-name">{acc.displayName || acc.address.split('@')[0]}</span>
              {acc.type === 'shared' && <span className="email-shared-badge">Shared</span>}
            </div>
          ))}

          {/* Categories */}
          {categories.length > 0 && (
            <>
              <div className="email-nav-section">Categories</div>
              {categories.map(cat => (
                <div
                  key={cat._id}
                  className={`email-nav-item ${activeCategory === cat.name ? 'active' : ''}`}
                  onClick={() => {
                    setActiveCategory(activeCategory === cat.name ? null : cat.name);
                    setActiveFolder('inbox');
                  }}
                >
                  <span className="email-nav-dot" style={{ background: cat.color }} />
                  <span className="email-nav-label">{cat.name}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ═══ Middle Panel — Email List ═══ */}
      <div className="email-list-panel">
        <div className="email-list-header">
          <input
            className="email-list-search"
            placeholder="Search emails..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="email-list-actions">
            <div className="email-list-action" onClick={loadEmails} title="Refresh">🔄</div>
          </div>
        </div>

        <div className="email-list-body">
          {activeFolder === 'drafts' ? (
            // Draft list
            drafts.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#94A3B8', fontSize: 12 }}>No drafts</div>
            ) : (
              drafts.map(draft => (
                <div key={draft._id} className="email-list-item" onClick={() => openDraft(draft)}>
                  <div className="email-item-content">
                    <div className="email-item-top">
                      <span className="email-item-sender" style={{ color: '#F59E0B', fontWeight: 600 }}>Draft</span>
                      <span className="email-item-time">{formatTime(draft.updatedAt)}</span>
                    </div>
                    <div className="email-item-subject">{draft.subject || '(No Subject)'}</div>
                    <div className="email-item-preview">To: {(draft.to || []).join(', ') || 'No recipient'}</div>
                  </div>
                </div>
              ))
            )
          ) : (
            // Email list
            loading ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#94A3B8', fontSize: 12 }}>Loading...</div>
            ) : filteredEmails.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#94A3B8', fontSize: 12 }}>
                No emails in {activeFolder}
              </div>
            ) : (
              filteredEmails.map(email => (
                <div
                  key={email._id}
                  className={`email-list-item ${activeEmail?._id === email._id ? 'active' : ''} ${!email.isRead ? 'unread' : ''}`}
                  onClick={() => selectEmail(email)}
                >
                  {!email.isRead && <div className="email-item-unread-dot" />}
                  <div className="email-item-content">
                    <div className="email-item-top">
                      <span className="email-item-sender">
                        {activeFolder === 'sent' ? `To: ${(email.to || []).join(', ')}` : email.fromName || email.from}
                      </span>
                      <span className="email-item-time">{formatTime(email.receivedAt)}</span>
                    </div>
                    <div className="email-item-subject">{email.subject}</div>
                    <div className="email-item-preview">{(email.bodyText || '').substring(0, 80)}</div>
                    <div className="email-item-meta">
                      <span
                        className={`email-item-star ${email.isStarred ? 'starred' : ''}`}
                        onClick={(e) => toggleStar(e, email._id)}
                      >
                        {email.isStarred ? '⭐' : '☆'}
                      </span>
                      {email.attachments?.length > 0 && <span className="email-item-attachment">📎</span>}
                      {email.repliedBy && <span className="email-item-replied">Replied by {email.repliedBy.name}</span>}
                      {email.categories?.map(cat => {
                        const catObj = categories.find(c => c.name === cat);
                        return (
                          <span
                            key={cat}
                            className="email-item-category"
                            style={{ background: `${catObj?.color || '#6366F1'}15`, color: catObj?.color || '#6366F1' }}
                          >
                            {cat}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))
            )
          )}
        </div>
      </div>

      {/* ═══ Right Panel — Email Detail ═══ */}
      {activeEmail ? (
        <div className="email-detail-panel">
          <div className="email-detail-header">
            <div className="email-detail-subject">{activeEmail.subject}</div>
            <div className="email-detail-meta">
              <span>{activeFolder === 'sent' ? 'Sent' : 'Received'} {formatFullDate(activeEmail.receivedAt)}</span>
              {activeEmail.account?.type === 'shared' && (
                <span style={{ color: '#6366F1', fontWeight: 600 }}>
                  via {activeEmail.account.displayName}
                </span>
              )}
            </div>
            <div className="email-detail-actions">
              <button className="email-detail-action primary" onClick={() => openCompose('reply', activeEmail)}>
                ↩️ Reply
              </button>
              <button className="email-detail-action" onClick={() => openCompose('replyAll', activeEmail)}>
                ↩️ Reply All
              </button>
              <button className="email-detail-action" onClick={() => openCompose('forward', activeEmail)}>
                ↪️ Forward
              </button>
              <button
                className="email-detail-action"
                onClick={() => toggleStar({ stopPropagation: () => {} }, activeEmail._id)}
              >
                {activeEmail.isStarred ? '⭐' : '☆'} Star
              </button>
              <button className="email-detail-action" onClick={() => moveToTrash(activeEmail._id)}>
                🗑️ Delete
              </button>
            </div>
          </div>

          <div className="email-detail-from">
            <div className="email-from-avatar" style={{ background: getGradient(activeEmail.from) }}>
              {getInitials(activeEmail.fromName || activeEmail.from)}
            </div>
            <div className="email-from-info">
              <div className="email-from-name">{activeEmail.fromName || activeEmail.from}</div>
              <div className="email-from-address">&lt;{activeEmail.from}&gt;</div>
              <div className="email-from-to">
                To: {(activeEmail.to || []).join(', ')}
                {activeEmail.cc?.length > 0 && ` | CC: ${activeEmail.cc.join(', ')}`}
              </div>
            </div>
            <span className="email-from-time">{formatFullDate(activeEmail.receivedAt)}</span>
          </div>

          <div className="email-detail-body">
            <div
              className="email-body-content"
              dangerouslySetInnerHTML={{ __html: activeEmail.bodyHtml || activeEmail.bodyText?.replace(/\n/g, '<br/>') || '' }}
            />
          </div>
        </div>
      ) : (
        <div className="email-empty">
          <div className="email-empty-inner">
            <div className="email-empty-icon">✉️</div>
            <div className="email-empty-title">Select an email</div>
            <div className="email-empty-sub">Choose an email from the list to read it here</div>
          </div>
        </div>
      )}

      {/* ═══ Compose Modal ═══ */}
      {composing && (
        <div className="email-compose-overlay" onClick={() => setComposing(false)}>
          <div className="email-compose" onClick={e => e.stopPropagation()}>
            <div className="email-compose-header">
              <h4>
                {composeMode === 'new' ? 'New Email' :
                  composeMode === 'reply' ? 'Reply' :
                  composeMode === 'replyAll' ? 'Reply All' : 'Forward'}
              </h4>
              <button className="email-compose-close" onClick={() => setComposing(false)}>&times;</button>
            </div>

            <div className="email-compose-fields">
              {/* Account selector */}
              <div className="email-compose-field">
                <label>From</label>
                <select
                  style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12, fontFamily: 'Inter, sans-serif', background: 'transparent', color: '#1E293B' }}
                  value={composeData.accountId}
                  onChange={e => setComposeData(prev => ({ ...prev, accountId: e.target.value }))}
                >
                  {accounts.map(acc => (
                    <option key={acc._id} value={acc._id}>
                      {acc.displayName} &lt;{acc.address}&gt;
                    </option>
                  ))}
                </select>
              </div>
              <div className="email-compose-field">
                <label>To</label>
                <input
                  value={composeData.to}
                  onChange={e => setComposeData(prev => ({ ...prev, to: e.target.value }))}
                  placeholder="recipient@example.com"
                />
              </div>
              <div className="email-compose-field">
                <label>CC</label>
                <input
                  value={composeData.cc}
                  onChange={e => setComposeData(prev => ({ ...prev, cc: e.target.value }))}
                  placeholder="cc@example.com"
                />
              </div>
              <div className="email-compose-field">
                <label>Subject</label>
                <input
                  value={composeData.subject}
                  onChange={e => setComposeData(prev => ({ ...prev, subject: e.target.value }))}
                  placeholder="Email subject"
                />
              </div>
            </div>

            <div className="email-compose-body">
              <textarea
                value={composeData.body}
                onChange={e => setComposeData(prev => ({ ...prev, body: e.target.value }))}
                placeholder="Write your email..."
                spellCheck="true"
              />
            </div>

            <div className="email-compose-footer" style={{ position: 'relative' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="email-compose-send" onClick={sendEmail} disabled={!composeData.to.trim()}>
                  ✈️ Send
                </button>
                <button
                  className="email-detail-action"
                  onClick={saveDraft}
                  style={{ fontSize: 11 }}
                >
                  💾 Save Draft
                </button>
              </div>
              <div className="email-compose-toolbar">
                <div className="email-compose-tool" onClick={() => setShowTemplates(!showTemplates)} title="Templates">📋</div>
                <div className="email-compose-tool" title="Attach file">📎</div>
              </div>

              {/* Template picker */}
              {showTemplates && templates.length > 0 && (
                <div className="email-template-picker">
                  {templates.map(t => (
                    <div key={t._id} className="email-template-item" onClick={() => applyTemplate(t)}>
                      <div className="email-template-name">{t.name}</div>
                      <div className="email-template-scope">{t.scope === 'company' ? 'Company Template' : 'Personal'}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
