import { useState, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import api from '../services/api';
import { useAlert } from '../components/AlertModal';
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
  const dialog = useAlert();
  const { socket } = useSocket();

  // Email configuration status
  const [emailStatus, setEmailStatus] = useState(null); // null=loading, {configured, canSend, canReceive, message}

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
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [templateForm, setTemplateForm] = useState({ name: '', subject: '', bodyText: '', scope: 'personal' });
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateSaving, setTemplateSaving] = useState(false);

  const saveTemplate = async () => {
    if (!templateForm.name.trim()) return;
    setTemplateSaving(true);
    try {
      if (editingTemplate) {
        await api.put(`/email/templates/${editingTemplate._id}`, templateForm);
      } else {
        await api.post('/email/templates', templateForm);
      }
      setTemplateForm({ name: '', subject: '', bodyText: '', scope: 'personal' });
      setEditingTemplate(null);
      loadTemplates();
    } catch (err) {
      dialog.alert(err.response?.data?.error || 'Failed to save template.');
    } finally { setTemplateSaving(false); }
  };

  const deleteTemplate = async (id) => {
    if (!(await dialog.confirm('Delete this template?'))) return;
    try { await api.delete(`/email/templates/${id}`); loadTemplates(); } catch {}
  };

  const startEditTemplate = (t) => {
    setEditingTemplate(t);
    setTemplateForm({ name: t.name, subject: t.subject || '', bodyText: t.bodyText || '', scope: t.scope || 'personal' });
  };

  const saveCurrentAsTemplate = () => {
    setTemplateForm({ name: '', subject: composeData.subject, bodyText: composeData.body, scope: 'personal' });
    setEditingTemplate(null);
    setShowTemplateManager(true);
  };

  // Drafts
  const [drafts, setDrafts] = useState([]);

  // Contact autocomplete
  const [contactSuggestions, setContactSuggestions] = useState([]);
  const [showContactSuggestions, setShowContactSuggestions] = useState(false);

  // AI Draft
  const [aiDraftPrompt, setAiDraftPrompt] = useState('');
  const [aiDraftLoading, setAiDraftLoading] = useState(false);
  const [showAiDraft, setShowAiDraft] = useState(false);

  // ─── Load Data ───
  const loadAccounts = useCallback(async () => {
    try {
      const { data } = await api.get('/email/accounts');
      setAccounts(data);
      if (data.length > 0 && !composeData.accountId) {
        setComposeData(prev => ({ ...prev, accountId: data[0]._id }));
      }
    } catch {}
  }, [composeData.accountId]);

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

  useEffect(() => {
    // Check email config status first
    api.get('/email/accounts/status').then(r => setEmailStatus(r.data)).catch(() => setEmailStatus({ configured: false, message: 'Could not check email status.' }));
    loadAccounts(); loadCategories(); loadTemplates();
  }, [loadAccounts, loadCategories, loadTemplates]);
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

  // markAsTask placeholder removed — will be added when integration is ready

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

  const handleAiDraft = async () => {
    if (!aiDraftPrompt.trim() || !user.aiActive) return;
    setAiDraftLoading(true);
    try {
      const { data } = await api.post('/ai/draft-email', { prompt: aiDraftPrompt.trim() });
      setComposeData(prev => ({ ...prev, body: data.draft || data.result || prev.body }));
      setShowAiDraft(false);
      setAiDraftPrompt('');
    } catch {}
    finally { setAiDraftLoading(false); }
  };

  const handleToChange = async (value) => {
    setComposeData(prev => ({ ...prev, to: value }));
    // Get the last token (after the last comma)
    const lastToken = value.split(',').pop().trim();
    if (lastToken.length >= 2) {
      try {
        const { data } = await api.get('/users/directory');
        const matches = data.filter(u =>
          u.name.toLowerCase().includes(lastToken.toLowerCase()) ||
          u.email.toLowerCase().includes(lastToken.toLowerCase())
        ).slice(0, 6);
        setContactSuggestions(matches);
        setShowContactSuggestions(matches.length > 0);
      } catch { setShowContactSuggestions(false); }
    } else {
      setShowContactSuggestions(false);
    }
  };

  const selectContact = (contact) => {
    const parts = composeData.to.split(',').map(s => s.trim()).filter(Boolean);
    parts.pop(); // remove partial match
    parts.push(contact.email);
    setComposeData(prev => ({ ...prev, to: parts.join(', ') + ', ' }));
    setShowContactSuggestions(false);
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
  // Show "not configured" full page if no email account
  if (emailStatus && !emailStatus.configured) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center', maxWidth: 420, padding: 40 }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✉️</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }}>Email Not Configured</h2>
          <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.7, marginBottom: 20 }}>
            Your email account has not been set up for use in this app. Please contact your <strong>admin</strong> or <strong>developer</strong> to configure your SMTP/IMAP email settings.
          </p>
          <div style={{ padding: '14px 18px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 10, textAlign: 'left' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6366F1', marginBottom: 6 }}>What needs to happen:</div>
            <ul style={{ fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.8, paddingLeft: 16, margin: 0 }}>
              <li>Admin or developer adds your email address</li>
              <li>SMTP server configured for sending emails</li>
              <li>IMAP server configured for receiving emails</li>
              <li>Once done, you'll see your inbox here</li>
            </ul>
          </div>
          <div style={{ marginTop: 16, fontSize: 11, color: 'var(--ink-3)' }}>
            Your email: <strong>{user.email}</strong>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="email-layout">
      {/* Email config warnings */}
      {emailStatus && emailStatus.configured && (!emailStatus.canSend || !emailStatus.canReceive) && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
          padding: '6px 16px', fontSize: 11, fontWeight: 500,
          background: 'rgba(245,158,11,0.1)', borderBottom: '1px solid rgba(245,158,11,0.2)',
          color: '#F59E0B', display: 'flex', alignItems: 'center', gap: 6
        }}>
          <span>⚠️</span>
          {!emailStatus.canSend && !emailStatus.canReceive && 'SMTP and IMAP not configured — you cannot send or receive emails.'}
          {emailStatus.canSend && !emailStatus.canReceive && 'IMAP not configured — you can send but cannot receive emails.'}
          {!emailStatus.canSend && emailStatus.canReceive && 'SMTP not configured — you can receive but cannot send emails.'}
          <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>Contact admin to complete setup.</span>
        </div>
      )}

      {/* ═══ Left Sidebar ═══ */}
      <div className="email-sidebar">
        <div className="email-sidebar-header">
          <button className="email-compose-btn" onClick={async () => {
            if (!emailStatus?.canSend) { await dialog.alert('Your email SMTP is not configured. Contact your admin to set it up.'); return; }
            openCompose('new');
          }}>
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
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink-3)', fontSize: 12 }}>No drafts</div>
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
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink-3)', fontSize: 12 }}>Loading...</div>
            ) : filteredEmails.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink-3)', fontSize: 12 }}>
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
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(activeEmail.bodyHtml || activeEmail.bodyText?.replace(/\n/g, '<br/>') || '') }}
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
                  style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12, fontFamily: 'Inter, sans-serif', background: 'transparent', color: 'var(--ink)' }}
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
              <div className="email-compose-field" style={{ position: 'relative' }}>
                <label>To</label>
                <input
                  value={composeData.to}
                  onChange={e => handleToChange(e.target.value)}
                  onBlur={() => setTimeout(() => setShowContactSuggestions(false), 200)}
                  placeholder="recipient@example.com"
                />
                {showContactSuggestions && (
                  <div style={{ position: 'absolute', top: '100%', left: 30, right: 0, background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 50, maxHeight: 180, overflowY: 'auto' }}>
                    {contactSuggestions.map(c => (
                      <div key={c._id} onMouseDown={() => selectContact(c)}
                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 11, display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--line)' }}
                        onMouseOver={e => e.currentTarget.style.background = 'var(--glass)'}
                        onMouseOut={e => e.currentTarget.style.background = '#fff'}>
                        <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{c.name}</span>
                        <span style={{ color: 'var(--ink-3)' }}>{c.email}</span>
                      </div>
                    ))}
                  </div>
                )}
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
                <button
                  disabled={!user.aiActive}
                  title={user.aiActive ? 'Click to use AI' : 'AI not activated \u2014 go to Settings'}
                  onClick={() => user.aiActive ? setShowAiDraft(!showAiDraft) : void 0}
                  style={{ background: 'none', border: 'none', cursor: user.aiActive ? 'pointer' : 'not-allowed', opacity: user.aiActive ? 1 : 0.4, fontSize: 11, color: '#6366F1', fontFamily: 'Inter,sans-serif', padding: '2px 6px' }}
                >
                  {'\u2728'} AI Draft
                </button>
                <div className="email-compose-tool" onClick={() => setShowTemplates(!showTemplates)} title="Templates">📋</div>
                <div className="email-compose-tool" title="Attach file">📎</div>
              </div>

              {/* AI Draft input */}
              {showAiDraft && (
                <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 8, padding: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', marginBottom: 4, display: 'flex', gap: 6 }}>
                  <input
                    value={aiDraftPrompt}
                    onChange={e => setAiDraftPrompt(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAiDraft(); }}
                    placeholder="Describe the email you want to draft..."
                    style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 6, padding: '6px 10px', fontSize: 11, fontFamily: 'Inter,sans-serif', outline: 'none' }}
                    autoFocus
                  />
                  <button onClick={handleAiDraft} disabled={aiDraftLoading || !aiDraftPrompt.trim()} style={{ padding: '6px 12px', background: '#6366F1', color: 'var(--ink)', border: 'none', borderRadius: 6, fontSize: 10, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                    {aiDraftLoading ? '...' : 'Generate'}
                  </button>
                </div>
              )}

              {/* Template picker */}
              {showTemplates && (
                <div className="email-template-picker" style={{ maxHeight: 280, overflowY: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', borderBottom: '1px solid var(--line)', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-2)' }}>Templates</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={saveCurrentAsTemplate}
                        style={{ fontSize: 8, padding: '2px 6px', border: '1px solid #10B981', borderRadius: 4, background: 'rgba(16,185,129,0.08)', color: '#10B981', cursor: 'pointer', fontFamily: 'Inter' }}>
                        Save Current
                      </button>
                      <button onClick={() => { setShowTemplates(false); setShowTemplateManager(true); }}
                        style={{ fontSize: 8, padding: '2px 6px', border: '1px solid #6366F1', borderRadius: 4, background: 'rgba(99,102,241,0.08)', color: '#6366F1', cursor: 'pointer', fontFamily: 'Inter' }}>
                        Manage
                      </button>
                    </div>
                  </div>
                  {templates.length === 0 && (
                    <div style={{ padding: '12px 8px', fontSize: 11, color: 'var(--ink-3)', textAlign: 'center' }}>No templates yet. Click "Manage" to create one.</div>
                  )}
                  {templates.map(t => (
                    <div key={t._id} className="email-template-item" onClick={() => applyTemplate(t)}>
                      <div className="email-template-name">{t.name}</div>
                      <div className="email-template-scope">
                        {t.scope === 'company' ? '🏢 Company' : t.scope === 'team' ? '👥 Team' : '👤 Personal'}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Template Manager Modal */}
              {showTemplateManager && (
                <>
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999 }} onClick={() => setShowTemplateManager(false)} />
                  <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1000, background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 14, width: 540, maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
                    <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>
                        {editingTemplate ? 'Edit Template' : 'Email Templates'}
                      </div>
                      <button style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ink-3)' }} onClick={() => { setShowTemplateManager(false); setEditingTemplate(null); }}>&times;</button>
                    </div>
                    <div style={{ padding: 18 }}>
                      {/* Create/Edit Form */}
                      <div style={{ marginBottom: 16, padding: 14, background: 'var(--glass)', borderRadius: 8, border: '1px solid var(--line)' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 8 }}>
                          {editingTemplate ? 'Edit Template' : 'Create New Template'}
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                          <input value={templateForm.name} onChange={e => setTemplateForm(p => ({ ...p, name: e.target.value }))}
                            placeholder="Template name *"
                            style={{ flex: 2, padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 11, fontFamily: 'Inter', background: 'var(--bg-1)', outline: 'none', color: 'var(--ink)' }} />
                          <select value={templateForm.scope} onChange={e => setTemplateForm(p => ({ ...p, scope: e.target.value }))}
                            style={{ flex: 1, padding: '7px 8px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 11, fontFamily: 'Inter', background: 'var(--bg-1)', color: 'var(--ink)' }}>
                            <option value="personal">Personal</option>
                            <option value="team">Team</option>
                            {['main_admin', 'admin'].includes(user.role) && <option value="company">Company</option>}
                          </select>
                        </div>
                        <input value={templateForm.subject} onChange={e => setTemplateForm(p => ({ ...p, subject: e.target.value }))}
                          placeholder="Email subject"
                          style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 11, fontFamily: 'Inter', background: 'var(--bg-1)', outline: 'none', marginBottom: 8, color: 'var(--ink)', boxSizing: 'border-box' }} />
                        <textarea value={templateForm.bodyText} onChange={e => setTemplateForm(p => ({ ...p, bodyText: e.target.value }))}
                          placeholder="Email body text..." rows={4}
                          style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 11, fontFamily: 'Inter', background: 'var(--bg-1)', outline: 'none', resize: 'vertical', color: 'var(--ink)', boxSizing: 'border-box' }} />
                        <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                          {editingTemplate && (
                            <button onClick={() => { setEditingTemplate(null); setTemplateForm({ name: '', subject: '', bodyText: '', scope: 'personal' }); }}
                              style={{ padding: '5px 12px', fontSize: 10, border: '1px solid var(--line)', borderRadius: 6, background: 'var(--glass)', color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'Inter' }}>Cancel</button>
                          )}
                          <button onClick={saveTemplate} disabled={templateSaving || !templateForm.name.trim()}
                            style={{ padding: '5px 14px', fontSize: 10, fontWeight: 600, border: 'none', borderRadius: 6, background: '#6366F1', color: '#fff', cursor: 'pointer', fontFamily: 'Inter' }}>
                            {templateSaving ? '...' : editingTemplate ? 'Update' : 'Create Template'}
                          </button>
                        </div>
                      </div>

                      {/* Template list */}
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 8 }}>
                        Existing Templates ({templates.length})
                      </div>
                      {templates.length === 0 && (
                        <div style={{ padding: '16px 0', textAlign: 'center', fontSize: 11, color: 'var(--ink-3)' }}>No templates yet.</div>
                      )}
                      {templates.map(t => (
                        <div key={t._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--line)' }}>
                          <span style={{ fontSize: 14 }}>
                            {t.scope === 'company' ? '🏢' : t.scope === 'team' ? '👥' : '👤'}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{t.name}</div>
                            <div style={{ fontSize: 10, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {t.subject || 'No subject'} — {t.scope}
                            </div>
                          </div>
                          <button onClick={() => startEditTemplate(t)}
                            style={{ fontSize: 9, padding: '2px 8px', border: '1px solid var(--line)', borderRadius: 4, background: 'var(--glass)', color: '#6366F1', cursor: 'pointer', fontFamily: 'Inter' }}>Edit</button>
                          <button onClick={() => deleteTemplate(t._id)}
                            style={{ fontSize: 9, padding: '2px 8px', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 4, background: 'rgba(239,68,68,0.06)', color: '#EF4444', cursor: 'pointer', fontFamily: 'Inter' }}>Del</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
