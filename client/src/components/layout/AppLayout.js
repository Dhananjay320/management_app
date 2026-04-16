import { useState } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
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
  { key: 'divider2' },
  { key: 'salary', icon: '💰', label: 'Salary', path: '/salary' },
  { key: 'notifications', icon: '🔔', label: 'Notifications', path: '/notifications', badge: true },
];

const ADMIN_ITEMS = [
  { key: 'users', icon: '👤', label: 'Manage Users', path: '/admin/users' },
  { key: 'analysis', icon: '📊', label: 'Analysis', path: '/admin/analysis' },
  { key: 'security', icon: '🔐', label: 'Security', path: '/admin/security' },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [adminMode, setAdminMode] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

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

            <div style={{ position: 'relative' }}>
              <div className="topbar-avatar" onClick={() => setShowUserMenu(!showUserMenu)}>
                {user?.name?.split(' ').map(w => w[0]).join('')}
              </div>
              {showUserMenu && (
                <div className="user-menu">
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid #F0F2F7', marginBottom: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#1E293B' }}>{user.name}</div>
                    <div style={{ fontSize: 10, color: '#94A3B8' }}>{user.email}</div>
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

      {/* Click outside to close user menu */}
      {showUserMenu && <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setShowUserMenu(false)} />}
    </div>
  );
}
