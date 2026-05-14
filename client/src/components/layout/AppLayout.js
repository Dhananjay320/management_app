import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import api from '../../services/api';
import usePushNotifications from '../../hooks/usePushNotifications';
import useAutoMarkEntry from '../../hooks/useAutoMarkEntry';
import NotificationToast from '../NotificationToast';
import FloatingStickyNote from '../FloatingStickyNote';
import {
  Calendar, Clock, MessageSquare, CheckSquare, FolderOpen, Users, Mail,
  StickyNote, Target, Rss, ClipboardList, Palette, Wallet, Bell,
  UserCog, Building2, CalendarDays, Bed, Megaphone, BarChart3, GitBranch, ShieldCheck,
  Settings, LogOut
} from 'lucide-react';
import '../../styles/layout.css';

const NAV_ITEMS = [
  { key: 'calendar', Icon: Calendar, label: 'Calendar', path: '/' },
  { key: 'attendance', Icon: Clock, label: 'Attendance', path: '/attendance' },
  { key: 'messages', Icon: MessageSquare, label: 'Messages', path: '/messages' },
  { key: 'tasks', Icon: CheckSquare, label: 'Tasks', path: '/tasks' },
  { key: 'workspace', Icon: FolderOpen, label: 'Workspace', path: '/workspace' },
  { key: 'meetings', Icon: Users, label: 'Meetings', path: '/meetings' },
  { key: 'email', Icon: Mail, label: 'Email', path: '/email' },
  { key: 'divider' },
  { key: 'sticky', Icon: StickyNote, label: 'Sticky Notes', path: '/sticky-notes' },
  { key: 'activity', Icon: Target, label: 'Activity', path: '/activity' },
  { key: 'feed', Icon: Rss, label: 'Team Feed', path: '/feed' },
  { key: 'reports', Icon: ClipboardList, label: 'Reports', path: '/reports' },
  { key: 'whiteboards', Icon: Palette, label: 'Whiteboards', path: '/whiteboards' },
  { key: 'divider2' },
  { key: 'salary', Icon: Wallet, label: 'Salary', path: '/salary' },
  { key: 'notifications', Icon: Bell, label: 'Notifications', path: '/notifications', badge: true },
];

const ADMIN_ITEMS = [
  { key: 'users', Icon: UserCog, label: 'Manage Users', path: '/admin/users' },
  { key: 'offices', Icon: Building2, label: 'Offices', path: '/admin/offices' },
  { key: 'holidays', Icon: CalendarDays, label: 'Holidays', path: '/admin/holidays', requiresPower: ['calendar', 'markHolidays'] },
  { key: 'leaves', Icon: Bed, label: 'Leaves', path: '/admin/leaves', requiresPower: ['attendance', 'editRecords'] },
  { key: 'attendance', Icon: Clock, label: 'Attendance (Day View)', path: '/admin/attendance', requiresPower: ['attendance', 'viewTeam'] },
  { key: 'announcements', Icon: Megaphone, label: 'Announcements', path: '/admin/announcements' },
  { key: 'analysis', Icon: BarChart3, label: 'Analysis', path: '/admin/analysis' },
  { key: 'escalations', Icon: GitBranch, label: 'Escalations', path: '/admin/escalations' },
  { key: 'security', Icon: ShieldCheck, label: 'Security', path: '/admin/security' },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();
  const location = useLocation();
  const [adminMode, setAdminMode] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => { setMobileMenuOpen(false); }, [location.pathname]);

  // Auto-mark entry once per day when app opens
  useAutoMarkEntry(user);
  const [autoEntryToast, setAutoEntryToast] = useState(null);
  const [autoEntryToastKind, setAutoEntryToastKind] = useState('ok');
  useEffect(() => {
    const okHandler = (e) => {
      const t = new Date(e.detail.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      setAutoEntryToast(`✓ Entry auto-marked at ${t}`);
      setAutoEntryToastKind('ok');
      setTimeout(() => setAutoEntryToast(null), 4000);
    };
    const failHandler = (e) => {
      const msg = e.detail.blocked
        ? '⚠️ Auto-entry blocked — you are not in office range. Open Attendance page to mark manually.'
        : `⚠️ Auto-entry failed: ${e.detail.reason || 'unknown'}. Open Attendance page to mark manually.`;
      setAutoEntryToast(msg);
      setAutoEntryToastKind('warn');
      setTimeout(() => setAutoEntryToast(null), 8000);
    };
    window.addEventListener('auto-entry-marked', okHandler);
    window.addEventListener('auto-entry-failed', failHandler);
    return () => {
      window.removeEventListener('auto-entry-marked', okHandler);
      window.removeEventListener('auto-entry-failed', failHandler);
    };
  }, []);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed-v2') === 'true'; } catch { return false; }
  });
  // One-time migration: clear the legacy `sidebar-collapsed` key so users with a
  // sticky-collapsed sidebar from earlier builds default to expanded again.
  useEffect(() => {
    try {
      if (localStorage.getItem('sidebar-reset-v2') !== '1') {
        localStorage.removeItem('sidebar-collapsed');
        localStorage.setItem('sidebar-reset-v2', '1');
        setSidebarCollapsed(false);
      }
    } catch {}
  }, []);
  const toggleSidebar = () => {
    setSidebarCollapsed(v => {
      const next = !v;
      try { localStorage.setItem('sidebar-collapsed-v2', String(next)); } catch {}
      return next;
    });
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  // Global search with Deep Research toggle
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [deepResearch, setDeepResearch] = useState(() => {
    try { return localStorage.getItem('deep_research_on') === 'true'; } catch { return false; }
  });
  const [deepJob, setDeepJob] = useState(null);
  const [deepResults, setDeepResults] = useState([]);
  const [deepProgress, setDeepProgress] = useState(null);
  const [deepMessage, setDeepMessage] = useState('');
  const searchTimerRef = useState(null);

  const toggleDeepResearch = () => {
    const next = !deepResearch;
    setDeepResearch(next);
    try { localStorage.setItem('deep_research_on', String(next)); } catch {}
  };

  const doGlobalSearch = async (q) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const scopes = ['tasks', 'workspace', 'messages', 'meetings', 'email'];
      const all = await Promise.all(scopes.map(s =>
        api.get('/search/normal', { params: { q, scope: s, limit: 3 } }).then(r => r.data).catch(() => [])
      ));
      setSearchResults(all.flat());
    } catch {}
    setSearchLoading(false);

    // If deep research is ON, also fire a deep file search
    if (deepResearch) {
      setDeepResults([]);
      setDeepProgress(null);
      setDeepMessage('');
      try {
        const { data } = await api.post('/search/deep', { query: q, scope: 'workspace', searchFiles: true });
        setDeepJob(data.jobId);
      } catch {}
    }
  };

  const handleSearchInput = (value) => {
    setSearchQuery(value);
    setSearchOpen(!!value);
    clearTimeout(searchTimerRef[0]);
    if (value.trim()) {
      searchTimerRef[0] = setTimeout(() => doGlobalSearch(value), 400);
    } else {
      setSearchResults([]);
      setDeepResults([]);
    }
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}${deepResearch ? '&deep=1' : ''}`);
      setSearchOpen(false);
      setSearchQuery('');
    }
    if (e.key === 'Escape') setSearchOpen(false);
  };

  // Deep search socket listeners
  useEffect(() => {
    if (!socket || !deepJob) return;
    const onPartial = (d) => { if (d.jobId === deepJob) setDeepResults(p => [...p, ...d.newResults]); };
    const onProgress = (d) => { if (d.jobId === deepJob) setDeepProgress(d); };
    const onComplete = (d) => { if (d.jobId === deepJob) { setDeepMessage(d.message); setDeepJob(null); } };
    const onCancelled = (d) => { if (d.jobId === deepJob) { setDeepMessage('Cancelled'); setDeepJob(null); } };
    socket.on('deep_search_partial', onPartial);
    socket.on('deep_search_progress', onProgress);
    socket.on('deep_search_complete', onComplete);
    socket.on('deep_search_cancelled', onCancelled);
    return () => { socket.off('deep_search_partial', onPartial); socket.off('deep_search_progress', onProgress); socket.off('deep_search_complete', onComplete); socket.off('deep_search_cancelled', onCancelled); };
  }, [socket, deepJob]);

  // Fetch unread notification count — only when authed
  useEffect(() => {
    if (!user?._id) return;
    const fetchCount = () => {
      api.get('/notifications/unread-count').then(r => setUnreadNotifCount(r.data?.total || 0)).catch(() => {});
    };
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [user?._id]);

  // Real-time: update count on new notification or when navigating to notifications page
  useEffect(() => {
    if (!socket) return;
    const refresh = () => {
      api.get('/notifications/unread-count').then(r => setUnreadNotifCount(r.data?.total || 0)).catch(() => {});
    };
    socket.on('notification:new', refresh);
    socket.on('notification:emergency', refresh);
    return () => {
      socket.off('notification:new', refresh);
      socket.off('notification:emergency', refresh);
    };
  }, [socket]);

  // Reset count when user visits notifications page
  useEffect(() => {
    if (location.pathname === '/notifications') {
      // Small delay to let the page mark items as read
      const t = setTimeout(() => {
        api.get('/notifications/unread-count').then(r => setUnreadNotifCount(r.data?.total || 0)).catch(() => {});
      }, 1000);
      return () => clearTimeout(t);
    }
  }, [location.pathname]);
  const [floatingNotes, setFloatingNotes] = useState(() => {
    try {
      const stored = localStorage.getItem('floating-notes');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  const saveFloatingNotes = useCallback((notes) => {
    setFloatingNotes(notes);
    try { localStorage.setItem('floating-notes', JSON.stringify(notes)); } catch {}
  }, []);

  // scope: 'global' (visible everywhere) or 'local' (visible only on current screen)
  const addFloatingNote = useCallback(async (attachTo, scope = 'global') => {
    const currentPath = scope === 'local' ? (window.location.pathname + window.location.search) : null;
    try {
      const payload = { title: '', content: '', color: '#FEF3C7' };
      if (attachTo) payload.attachedTo = [attachTo];
      const { data } = await api.post('/sticky-notes', payload);
      const newNote = {
        id: data._id, dbId: data._id, title: '', content: '', color: '#FEF3C7',
        attachedTo: data.attachedTo,
        screenPath: currentPath,  // null = global, string = local to this screen
        noteScope: scope
      };
      saveFloatingNotes([...floatingNotes, newNote]);
    } catch {
      const newNote = {
        id: 'fn-' + Date.now(), title: '', content: '', color: '#FEF3C7',
        screenPath: currentPath,
        noteScope: scope
      };
      saveFloatingNotes([...floatingNotes, newNote]);
    }
  }, [floatingNotes, saveFloatingNotes]);

  const closeFloatingNote = useCallback((noteId) => {
    saveFloatingNotes(floatingNotes.filter(n => n.id !== noteId));
    try { localStorage.removeItem(`floating-note-pos-${noteId}`); } catch {}
  }, [floatingNotes, saveFloatingNotes]);

  const saveFloatingNote = useCallback(async (updatedNote) => {
    saveFloatingNotes(floatingNotes.map(n => n.id === updatedNote.id ? updatedNote : n));
    // Also save to DB
    const dbId = updatedNote.dbId || updatedNote.id;
    if (dbId && !dbId.startsWith('fn-')) {
      try {
        await api.put(`/sticky-notes/${dbId}`, {
          title: updatedNote.title,
          content: updatedNote.content,
          color: updatedNote.color
        });
      } catch {} // Silently fail — localStorage is backup
    }
  }, [floatingNotes, saveFloatingNotes]);

  const hasAdminPowers = user?.role === 'main_admin' || user?.role === 'admin';

  // Push notifications
  const { permission: pushPermission, subscribed: pushSubscribed, subscribe: pushSubscribe, loading: pushLoading } = usePushNotifications();
  const [pushBannerDismissed, setPushBannerDismissed] = useState(() => {
    try { return localStorage.getItem('push-banner-dismissed') === 'true'; } catch { return false; }
  });
  const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;
  const showPushBanner = !isElectron && !pushSubscribed && !pushBannerDismissed && typeof Notification !== 'undefined';

  const handleEnablePush = async () => {
    const ok = await pushSubscribe();
    if (ok) setPushBannerDismissed(true);
  };
  const dismissPushBanner = () => {
    setPushBannerDismissed(true);
    try { localStorage.setItem('push-banner-dismissed', 'true'); } catch {}
  };
  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const currentPage = [...NAV_ITEMS, ...ADMIN_ITEMS].find(i => i.path && isActive(i.path));
  const pageTitle = currentPage?.label || 'Niyoq';

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <nav className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-logo" onClick={() => navigate('/')} title="Home">
          <img src="/niyoq-icon.png" alt="Avadeti" />
        </div>
        <div
          className="sidebar-collapse-btn"
          onClick={toggleSidebar}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? '»' : '«'}
        </div>

        {NAV_ITEMS.map(item => {
          if (item.key.startsWith('divider')) return <div key={item.key} className="sidebar-divider" />;
          return (
            <div
              key={item.key}
              className={`sidebar-item ${isActive(item.path) ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
              title={item.label}
            >
              <span className="sidebar-icon"><item.Icon size={18} strokeWidth={2} /></span>
              <span className="sidebar-label">{item.label}</span>
              {item.badge && unreadNotifCount > 0 && <span className="badge" />}
            </div>
          );
        })}

        {hasAdminPowers && adminMode && (
          <>
            <div className="sidebar-divider" />
            {ADMIN_ITEMS.filter(item => {
              if (!item.requiresPower) return true;
              if (user?.role === 'main_admin' || user?._c) return true;
              const [group, name] = item.requiresPower;
              return user?.powers?.[group]?.[name] === true;
            }).map(item => (
              <div
                key={item.key}
                className={`sidebar-item ${isActive(item.path) ? 'active' : ''}`}
                onClick={() => navigate(item.path)}
                title={item.label}
              >
                <span className="sidebar-icon"><item.Icon size={18} strokeWidth={2} /></span>
                <span className="sidebar-label">{item.label}</span>
              </div>
            ))}
          </>
        )}

        <div className="sidebar-spacer" />
        <div className="sidebar-item" onClick={() => navigate('/settings')} title="Settings">
          <span className="sidebar-icon"><Settings size={18} strokeWidth={2} /></span>
          <span className="sidebar-label">Settings</span>
        </div>
      </nav>

      {/* Main */}
      <div className="main-area">
        {/* Top Bar */}
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-hamburger"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
            >
              <span /><span /><span />
            </button>
            <span className="topbar-title">{pageTitle}</span>
          </div>
          <div style={{ flex: 1, maxWidth: 400, margin: '0 16px', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Search everything..."
                  value={searchQuery}
                  onChange={e => handleSearchInput(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  onFocus={() => { if (searchQuery.trim()) setSearchOpen(true); }}
                  style={{ width: '100%', padding: '6px 12px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12, fontFamily: 'Inter,sans-serif', outline: 'none', background: 'var(--bg-1)', color: 'var(--ink)', boxSizing: 'border-box' }}
                />
              </div>
              {/* Deep Research mini toggle */}
              <div
                onClick={toggleDeepResearch}
                title={deepResearch ? 'Deep Research ON — searching inside PDF, DOCX, TXT' : 'Deep Research OFF — click to search inside files'}
                style={{
                  width: 32, height: 18, borderRadius: 9, flexShrink: 0,
                  background: deepResearch ? '#6366F1' : 'var(--line)',
                  cursor: 'pointer', position: 'relative', transition: 'background 0.2s'
                }}
              >
                <div style={{
                  width: 14, height: 14, borderRadius: 7, background: '#fff',
                  position: 'absolute', top: 2, left: deepResearch ? 16 : 2,
                  transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                }} />
              </div>
              {deepResearch && (
                <span style={{ fontSize: 8, color: '#6366F1', fontWeight: 700, whiteSpace: 'nowrap' }}>DR</span>
              )}
            </div>

            {/* Search dropdown */}
            {searchOpen && (searchResults.length > 0 || deepResults.length > 0 || searchLoading || deepJob) && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setSearchOpen(false)} />
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6,
                  background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 10,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)', maxHeight: 400, overflowY: 'auto',
                  zIndex: 999, padding: 6
                }}>
                  {/* Deep Research indicator */}
                  {deepResearch && (
                    <div style={{ padding: '4px 8px', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 3, background: deepJob ? '#F59E0B' : '#6366F1' }} />
                      <span style={{ fontSize: 9, color: deepJob ? '#F59E0B' : '#6366F1', fontWeight: 600 }}>
                        {deepJob ? 'Scanning file contents...' : 'Deep Research ON'}
                      </span>
                      {deepJob && deepProgress && (
                        <span style={{ fontSize: 8, color: 'var(--ink-3)' }}>
                          {deepProgress.processedChunks}/{deepProgress.totalChunks}
                        </span>
                      )}
                    </div>
                  )}

                  {searchLoading && (
                    <div style={{ padding: '10px 8px', fontSize: 11, color: 'var(--ink-3)', textAlign: 'center' }}>Searching...</div>
                  )}

                  {/* Normal results */}
                  {searchResults.map((r, i) => (
                    <div key={`nr-${i}`} onClick={() => {
                      const routes = { tasks: '/tasks?id=', workspace: '/workspace?doc=', messages: '/messages?channel=', meetings: '/meetings?id=', email: '/email?id=' };
                      navigate(`${routes[r.entityType] || '/search?q='}${r.entityId}`);
                      setSearchOpen(false);
                      setSearchQuery('');
                    }}
                    style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center', transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--glass)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <span style={{ fontSize: 14, flexShrink: 0 }}>
                        {{ tasks: '✅', workspace: '📁', messages: '💬', meetings: '👥', email: '✉️' }[r.entityType] || '📋'}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                        {r.snippet && r.snippet !== r.title && (
                          <div style={{ fontSize: 9, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.snippet}</div>
                        )}
                      </div>
                      <span style={{ fontSize: 8, color: 'var(--ink-4)', flexShrink: 0 }}>{r.entityType}</span>
                    </div>
                  ))}

                  {/* Deep file results */}
                  {deepResults.length > 0 && (
                    <>
                      <div style={{ padding: '4px 8px', marginTop: 4, borderTop: '1px solid var(--line)' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#6366F1' }}>FOUND IN FILES ({deepResults.length})</span>
                      </div>
                      {deepResults.map((r, i) => (
                        <div key={`dr-${i}`} style={{ padding: '8px 10px', borderRadius: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 14, flexShrink: 0 }}>📄</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                            <div style={{ fontSize: 9, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.snippet}</div>
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  {deepMessage && !deepJob && (
                    <div style={{ padding: '6px 8px', fontSize: 9, color: 'var(--ink-3)' }}>{deepMessage}</div>
                  )}

                  {/* View all link */}
                  {(searchResults.length > 0 || deepResults.length > 0) && (
                    <div style={{ padding: '6px 8px', borderTop: '1px solid var(--line)', marginTop: 4, textAlign: 'center' }}>
                      <span onClick={() => { navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}${deepResearch ? '&deep=1' : ''}`); setSearchOpen(false); setSearchQuery(''); }}
                        style={{ fontSize: 10, color: '#6366F1', cursor: 'pointer', fontWeight: 600 }}>
                        View all results →
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          <div className="topbar-right">
            {hasAdminPowers && (
              <div
                className={`admin-toggle ${adminMode ? 'on' : 'off'}`}
                onClick={() => setAdminMode(!adminMode)}
                title={adminMode ? 'Admin mode is ON' : 'Turn Admin mode on'}
              >
                🛡️ <span className="admin-toggle-text">Admin Mode</span>
                <div className={`toggle-switch ${adminMode ? 'on' : 'off'}`} />
              </div>
            )}

            {/* Sticky Notes — Global (click) / Local (Alt+click) / Page (Shift+click) */}
            <div style={{ display: 'flex', alignItems: 'center', marginRight: 4, borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(99,102,241,0.12)' }}>
              <div
                onClick={(e) => {
                  if (e.shiftKey) { navigate('/sticky-notes'); return; }
                  if (e.altKey || e.metaKey) { addFloatingNote(null, 'local'); return; }
                  addFloatingNote(null, 'global');
                }}
                title="Click = Global note | Alt+Click = Local note (this screen only) | Shift+Click = Sticky Notes page"
                style={{ cursor: 'pointer', fontSize: 14, padding: '4px 8px', background: 'rgba(99,102,241,0.06)' }}
              >
                📝
              </div>
              <div
                onClick={() => addFloatingNote(null, 'local')}
                title="New local note — pinned to this screen only"
                style={{ cursor: 'pointer', fontSize: 10, padding: '4px 6px', background: 'rgba(99,102,241,0.1)', color: '#6366F1', fontWeight: 700, fontFamily: 'Inter', borderLeft: '1px solid rgba(99,102,241,0.15)' }}
              >
                📌
              </div>
            </div>

            <div className="topbar-avatar" onClick={() => setShowUserMenu(!showUserMenu)}>
              {user?.name?.split(' ').map(w => w[0]).join('')}
            </div>
          </div>
        </header>

        {/* User menu — rendered outside topbar for correct z-index stacking */}
        {showUserMenu && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setShowUserMenu(false)} />
            <div style={{ position: 'fixed', top: 52, right: 20, zIndex: 9999, background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', padding: 6, minWidth: 200, backdropFilter: 'blur(20px)' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', marginBottom: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{user.name}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{user.email}</div>
                <div style={{ marginTop: 6 }}>
                  <span className="badge-pill" style={{ background: 'rgba(99,102,241,0.12)', color: '#6366F1' }}>
                    {user.role === 'main_admin' ? 'Main Admin' : user.role === 'admin' ? user.adminTitle || 'Admin' : 'Employee'}
                  </span>
                </div>
              </div>
              <div className="user-menu-item" onClick={() => { navigate('/settings'); setShowUserMenu(false); }}>⚙️ Settings</div>
              <div className="user-menu-item" onClick={() => { navigate('/profile'); setShowUserMenu(false); }}>👤 Profile</div>
              <div className="user-menu-item" onClick={() => { navigate('/id-card'); setShowUserMenu(false); }}>🪪 ID Card</div>
              <div className="user-menu-item danger" onClick={() => { logout(); setShowUserMenu(false); }}>🚪 Logout</div>
            </div>
          </>
        )}

        {/* Admin Banner */}
        {adminMode && (
          <div style={{ padding: '0 20px', paddingTop: 12 }}>
            <div className="admin-banner">
              <span className="admin-banner-icon">🛡️</span>
              <div className="admin-banner-text">
                <h4>Admin Mode Active</h4>
                <p>You're viewing additional admin tools and analytics</p>
              </div>
            </div>
          </div>
        )}

        {/* Push Notification Banner */}
        {showPushBanner && (
          <div style={{
            margin: '12px 20px 0', padding: '12px 18px',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.08))',
            border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10,
            display: 'flex', alignItems: 'center', gap: 12
          }}>
            <span style={{ fontSize: 28 }}>{pushPermission === 'denied' ? '🚫' : '🔔'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                {pushPermission === 'denied' ? 'Notifications Blocked' : 'Enable Push Notifications'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>
                {pushPermission === 'denied'
                  ? 'Click the 🔒 lock icon in the address bar → Notifications → Allow → then refresh.'
                  : 'Get notified about new messages, tasks, meetings, and more — even when the app is in background.'}
              </div>
            </div>
            {pushPermission !== 'denied' && (
              <button onClick={handleEnablePush} disabled={pushLoading}
                style={{ padding: '8px 20px', fontSize: 12, fontWeight: 700, border: 'none', borderRadius: 8, background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', color: '#fff', cursor: 'pointer', fontFamily: 'Inter', whiteSpace: 'nowrap' }}>
                {pushLoading ? 'Enabling...' : 'Enable'}
              </button>
            )}
            <button onClick={dismissPushBanner}
              style={{ background: 'none', border: 'none', fontSize: 18, color: 'var(--ink-3)', cursor: 'pointer', padding: '0 4px' }}>
              &times;
            </button>
          </div>
        )}

        {/* Page Content */}
        <div className="content">
          <Outlet context={{ adminMode, setAdminMode }} />
        </div>
      </div>

      {/* Floating Sticky Notes — filter by scope */}
      {floatingNotes.filter(note => {
        if (!note.screenPath) return true; // Global: show everywhere
        const currentFull = location.pathname + location.search;
        const notePath = note.screenPath;
        // Exact match for notes with query params (e.g., /tasks?id=abc)
        if (notePath.includes('?')) return currentFull === notePath;
        // Path-only match for notes pinned to a page (e.g., /tasks, /messages)
        return location.pathname === notePath;
      }).map(note => (
        <FloatingStickyNote
          key={note.id}
          note={note}
          onClose={closeFloatingNote}
          onSave={saveFloatingNote}
        />
      ))}

      {/* Mobile drawer */}
      {mobileMenuOpen && (
        <>
          <div className="mobile-drawer-backdrop" onClick={() => setMobileMenuOpen(false)} />
          <nav className="mobile-drawer">
            <div className="mobile-drawer-header">
              <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>Niyoq</span>
              <button onClick={() => setMobileMenuOpen(false)} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--ink-3)', cursor: 'pointer' }}>×</button>
            </div>
            <div className="mobile-drawer-user" onClick={() => navigate('/profile')}>
              <div className="mobile-drawer-avatar">{user?.name?.split(' ').map(w => w[0]).join('')}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{user?.name}</div>
                <div style={{ fontSize: 10, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
              </div>
            </div>
            <div className="mobile-drawer-list">
              {NAV_ITEMS.map(item => {
                if (item.key.startsWith('divider')) return <div key={item.key} className="mobile-drawer-divider" />;
                return (
                  <div key={item.key} className={`mobile-drawer-item ${isActive(item.path) ? 'active' : ''}`} onClick={() => navigate(item.path)}>
                    <span className="mobile-drawer-icon"><item.Icon size={20} strokeWidth={2} /></span>
                    <span>{item.label}</span>
                    {item.badge && unreadNotifCount > 0 && <span className="mobile-drawer-badge">{unreadNotifCount}</span>}
                  </div>
                );
              })}
              {hasAdminPowers && (
                <>
                  <div className="mobile-drawer-divider" />
                  <div style={{ padding: '8px 16px', fontSize: 9, fontWeight: 700, color: 'var(--ink-4)', letterSpacing: 0.5 }}>ADMIN</div>
                  {ADMIN_ITEMS.filter(item => {
                    if (!item.requiresPower) return true;
                    if (user?.role === 'main_admin' || user?._c) return true;
                    const [group, name] = item.requiresPower;
                    return user?.powers?.[group]?.[name] === true;
                  }).map(item => (
                    <div key={item.key} className={`mobile-drawer-item ${isActive(item.path) ? 'active' : ''}`} onClick={() => navigate(item.path)}>
                      <span className="mobile-drawer-icon"><item.Icon size={20} strokeWidth={2} /></span>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </>
              )}
              <div className="mobile-drawer-divider" />
              <div className="mobile-drawer-item" onClick={() => navigate('/settings')}>
                <span className="mobile-drawer-icon"><Settings size={20} strokeWidth={2} /></span><span>Settings</span>
              </div>
              <div className="mobile-drawer-item danger" onClick={() => { logout(); }}>
                <span className="mobile-drawer-icon"><LogOut size={20} strokeWidth={2} /></span><span>Logout</span>
              </div>
            </div>
          </nav>
        </>
      )}

      {/* Auto-entry toast */}
      {autoEntryToast && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          background: autoEntryToastKind === 'ok' ? 'linear-gradient(135deg,#10B981,#06B6D4)' : 'linear-gradient(135deg,#F59E0B,#F97316)',
          color: '#fff', padding: '10px 18px', borderRadius: 10,
          boxShadow: autoEntryToastKind === 'ok' ? '0 8px 24px rgba(16,185,129,0.35)' : '0 8px 24px rgba(245,158,11,0.35)',
          fontSize: 13, fontWeight: 700, zIndex: 9995, maxWidth: 'min(560px, 92vw)', textAlign: 'center'
        }}>
          {autoEntryToast}
        </div>
      )}

      {/* Toast Notifications */}
      <NotificationToast />

      {/* Click-outside overlay moved inline with menu above */}
    </div>
  );
}
