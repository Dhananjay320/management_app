import { useState, useCallback } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import NotificationToast from '../NotificationToast';
import FloatingStickyNote from '../FloatingStickyNote';
import '../../styles/layout.css';

const NAV_ITEMS = [
  { key: 'calendar', icon: '📅', label: 'Calendar', path: '/' },
  { key: 'attendance', icon: '⏰', label: 'Attendance', path: '/attendance' },
  { key: 'messages', icon: '💬', label: 'Messages', path: '/messages' },
  { key: 'tasks', icon: '✅', label: 'Tasks', path: '/tasks' },
  { key: 'workspace', icon: '📁', label: 'Workspace', path: '/workspace' },
  { key: 'meetings', icon: '👥', label: 'Meetings', path: '/meetings' },
  { key: 'email', icon: '✉️', label: 'Email', path: '/email' },
  { key: 'divider' },
  { key: 'sticky', icon: '📝', label: 'Sticky Notes', path: '/sticky-notes' },
  { key: 'activity', icon: '🎯', label: 'Activity', path: '/activity' },
  { key: 'feed', icon: '📰', label: 'Team Feed', path: '/feed' },
  { key: 'whiteboards', icon: '🎨', label: 'Whiteboards', path: '/whiteboards' },
  { key: 'divider2' },
  { key: 'salary', icon: '💰', label: 'Salary', path: '/salary' },
  { key: 'notifications', icon: '🔔', label: 'Notifications', path: '/notifications', badge: true },
];

const ADMIN_ITEMS = [
  { key: 'users', icon: '👤', label: 'Manage Users', path: '/admin/users' },
  { key: 'offices', icon: '🏢', label: 'Offices', path: '/admin/offices' },
  { key: 'announcements', icon: '📢', label: 'Announcements', path: '/admin/announcements' },
  { key: 'analysis', icon: '📊', label: 'Analysis', path: '/admin/analysis' },
  { key: 'security', icon: '🔐', label: 'Security', path: '/admin/security' },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [adminMode, setAdminMode] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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

  const addFloatingNote = useCallback(() => {
    const newNote = { id: 'fn-' + Date.now(), title: '', content: '', color: '#FEF3C7' };
    saveFloatingNotes([...floatingNotes, newNote]);
  }, [floatingNotes, saveFloatingNotes]);

  const closeFloatingNote = useCallback((noteId) => {
    saveFloatingNotes(floatingNotes.filter(n => n.id !== noteId));
    try { localStorage.removeItem(`floating-note-pos-${noteId}`); } catch {}
  }, [floatingNotes, saveFloatingNotes]);

  const saveFloatingNote = useCallback((updatedNote) => {
    saveFloatingNotes(floatingNotes.map(n => n.id === updatedNote.id ? updatedNote : n));
  }, [floatingNotes, saveFloatingNotes]);

  const hasAdminPowers = user?.role === 'main_admin' || user?.role === 'admin';
  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const currentPage = [...NAV_ITEMS, ...ADMIN_ITEMS].find(i => i.path && isActive(i.path));
  const pageTitle = currentPage?.label || 'Avadeti Team';

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <nav className="sidebar">
        <div className="sidebar-logo" onClick={() => navigate('/')}>A</div>

        {NAV_ITEMS.map(item => {
          if (item.key.startsWith('divider')) return <div key={item.key} className="sidebar-divider" />;
          return (
            <div
              key={item.key}
              className={`sidebar-item ${isActive(item.path) ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
              title={item.label}
            >
              {item.icon}
              {item.badge && <span className="badge" />}
            </div>
          );
        })}

        {hasAdminPowers && adminMode && (
          <>
            <div className="sidebar-divider" />
            {ADMIN_ITEMS.map(item => (
              <div
                key={item.key}
                className={`sidebar-item ${isActive(item.path) ? 'active' : ''}`}
                onClick={() => navigate(item.path)}
                title={item.label}
              >
                {item.icon}
              </div>
            ))}
          </>
        )}

        <div className="sidebar-spacer" />
        <div className="sidebar-item" onClick={() => navigate('/settings')} title="Settings">⚙️</div>
      </nav>

      {/* Main */}
      <div className="main-area">
        {/* Top Bar */}
        <header className="topbar">
          <div className="topbar-left">
            <span className="topbar-title">{pageTitle}</span>
          </div>
          <div style={{ flex: 1, maxWidth: 360, margin: '0 16px' }}>
            <input
              type="text"
              placeholder="Search everything..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && searchQuery.trim()) {
                  navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
                  setSearchQuery('');
                }
              }}
              style={{ width: '100%', padding: '6px 12px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12, fontFamily: 'Inter,sans-serif', outline: 'none', background: 'var(--glass)', color: 'var(--ink)' }}
            />
          </div>
          <div className="topbar-right">
            {hasAdminPowers && (
              <div
                className={`admin-toggle ${adminMode ? 'on' : 'off'}`}
                onClick={() => setAdminMode(!adminMode)}
              >
                🛡️ Admin Mode
                <div className={`toggle-switch ${adminMode ? 'on' : 'off'}`} />
              </div>
            )}

            {/* Sticky Notes persistent icon — opens floating note, or navigate with shift+click */}
            <div
              className="topbar-sticky-icon"
              onClick={(e) => e.shiftKey ? navigate('/sticky-notes') : addFloatingNote()}
              title="New Floating Sticky Note (Shift+click for full page)"
              style={{ cursor: 'pointer', fontSize: 16, padding: '4px 8px', borderRadius: 6, background: 'rgba(99,102,241,0.06)', marginRight: 4 }}
            >
              📝
            </div>

            <div style={{ position: 'relative' }}>
              <div className="topbar-avatar" onClick={() => setShowUserMenu(!showUserMenu)}>
                {user?.name?.split(' ').map(w => w[0]).join('')}
              </div>
              {showUserMenu && (
                <div className="user-menu">
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)', marginBottom: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{user.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>{user.email}</div>
                    <div style={{ marginTop: 4 }}>
                      <span className="badge-pill" style={{ background: 'rgba(99,102,241,0.08)', color: '#6366F1' }}>
                        {user.role === 'main_admin' ? 'Main Admin' : user.role === 'admin' ? user.adminTitle || 'Admin' : 'Employee'}
                      </span>
                    </div>
                  </div>
                  <div className="user-menu-item" onClick={() => { navigate('/settings'); setShowUserMenu(false); }}>⚙️ Settings</div>
                  <div className="user-menu-item" onClick={() => { navigate('/profile'); setShowUserMenu(false); }}>👤 Profile</div>
                  <div className="user-menu-item danger" onClick={() => { logout(); setShowUserMenu(false); }}>🚪 Logout</div>
                </div>
              )}
            </div>
          </div>
        </header>

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

        {/* Page Content */}
        <div className="content">
          <Outlet context={{ adminMode, setAdminMode }} />
        </div>
      </div>

      {/* Floating Sticky Notes */}
      {floatingNotes.map(note => (
        <FloatingStickyNote
          key={note.id}
          note={note}
          onClose={closeFloatingNote}
          onSave={saveFloatingNote}
        />
      ))}

      {/* Toast Notifications */}
      <NotificationToast />

      {/* Click outside to close user menu */}
      {showUserMenu && <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setShowUserMenu(false)} />}
    </div>
  );
}
