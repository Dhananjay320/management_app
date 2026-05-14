import { useState } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import NotificationToast from '../NotificationToast';
import ErrorBoundary from '../ErrorBoundary';
// Session 26 (N1): draggable sticky notes overlay — renders pinned notes
// on top of every page so they persist across navigation.
import DraggableStickyOverlay from '../DraggableStickyOverlay';
// Session 28 (N8): celebratory toast when a badge unlocks or you level up.
import AchievementToast from '../AchievementToast';
import { useNotificationCounts } from '../../hooks/useNotificationCounts';
import {
  SearchBar, IconButton, Avatar, LiveDot, Icon,
} from '../../design-system';
import './AppLayout.css';

/* Sidebar item definitions.
   `icon` references an Icon component from our design-system/icons.
   `unread` placeholder — wired later (Session 12, notifications deep-linking).
*/
const PRIMARY_NAV = [
  { key: 'home',          icon: Icon.CalendarDays,  label: 'Home',          path: '/' },
  { key: 'tasks',         icon: Icon.CheckCircle,   label: 'Tasks',         path: '/tasks',         unreadKey: 'task' },
  { key: 'messages',      icon: Icon.MessageSquare, label: 'Messages',      path: '/messages',      unreadKey: 'message' },
  { key: 'scheduled',     icon: Icon.Clock,         label: 'Scheduled',     path: '/scheduled-messages' },
  { key: 'attendance',    icon: Icon.Clock,         label: 'Attendance',    path: '/attendance' },
  { key: 'meetings',      icon: Icon.Users,         label: 'Meetings',      path: '/meetings',      unreadKey: 'meeting' },
  { key: 'workspace',     icon: Icon.Folder,        label: 'Workspace',     path: '/workspace' },
  { key: 'email',         icon: Icon.Mail,          label: 'Email',         path: '/email',         unreadKey: 'email' },
  { key: 'feed',          icon: Icon.Newspaper,     label: 'Team Feed',     path: '/feed' },
  { key: 'social',        icon: Icon.Users,         label: 'Following',     path: '/social' },
  { key: 'wellness',      icon: Icon.Sparkles,      label: 'Wellness',      path: '/wellness' },
  { key: 'achievements',  icon: Icon.Zap,           label: 'Achievements',  path: '/achievements' },
  { key: 'content',       icon: Icon.Newspaper,     label: 'Learn',         path: '/content' },
  { key: 'activity',      icon: Icon.Activity,      label: 'Activity',      path: '/activity' },
];

const SECONDARY_NAV = [
  { key: 'sticky',         icon: Icon.StickyIcon, label: 'Sticky Notes',  path: '/sticky-notes' },
  { key: 'salary',         icon: Icon.DollarSign, label: 'Salary',        path: '/salary' },
  { key: 'notifications',  icon: Icon.Bell,       label: 'Notifications', path: '/notifications' },
];

const ADMIN_NAV = [
  { key: 'users',         icon: Icon.UserIcon,  label: 'Manage Users',  path: '/admin/users' },
  { key: 'analysis',      icon: Icon.BarChart3, label: 'Analysis',      path: '/admin/analysis' },
  { key: 'security',      icon: Icon.Shield,    label: 'Security',      path: '/admin/security' },
  { key: 'announcements', icon: Icon.Megaphone, label: 'Announcements', path: '/admin/announcements' },
];

function NavItem({ item, active, onClick, unreadCount = 0 }) {
  const I = item.icon;
  return (
    <button
      type="button"
      className={`ad-nav-item ad-focus ${active ? 'ad-nav-item--active' : ''}`}
      onClick={onClick}
      title={item.label}
      aria-current={active ? 'page' : undefined}
    >
      <I size={16} />
      <span className="ad-nav-item__label">{item.label}</span>
      {unreadCount > 0 && (
        <span className="ad-nav-item__unread" aria-label={`${unreadCount} unread`}>
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}

function SidebarDivider({ label }) {
  return (
    <div className="ad-nav-divider">
      {label && <span className="ad-label">{label}</span>}
    </div>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [adminMode, setAdminMode] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [query, setQuery] = useState('');
  // Session 17 C8: mobile drawer state. On desktop the sidebar is always
  // visible so this flag is effectively a no-op. On mobile (< 760px) it
  // controls whether the sidebar is slid in.
  const [drawerOpen, setDrawerOpen] = useState(false);

  const hasAdminPowers = user?.role === 'main_admin' || user?.role === 'admin';
  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  // Session 17 C8: close the drawer whenever the user navigates so they
  // don't have to tap a second time to dismiss it after picking a link.
  const go = (path) => {
    setDrawerOpen(false);
    navigate(path);
  };

  // Session 12 C3: real unread count for bell + sidebar Notifications item.
  const { total: notifBadge, byType: notifByType } = useNotificationCounts();

  return (
    <div className={`ad-shell ${drawerOpen ? 'ad-shell--drawer-open' : ''}`}>
      {/* Session 17 C8: drawer backdrop (mobile only, clicking closes) */}
      <div
        className="ad-sidebar-backdrop"
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />
      {/* ─── Topbar ──────────────────────────────────────────────── */}
      <header className="ad-topbar-wrap">
        <div className="ad-topbar ad-glass ad-glass--strong ad-glass--elevated">
          {/* Left: logo + wordmark + search */}
          <div className="ad-topbar__left">
            {/* Session 17 C8: hamburger (mobile only via CSS) */}
            <button
              type="button"
              className="ad-topbar__menu-btn ad-focus"
              onClick={() => setDrawerOpen(v => !v)}
              aria-label="Open navigation"
              aria-expanded={drawerOpen}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="4" y1="6"  x2="20" y2="6"  />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="18" x2="20" y2="18" />
              </svg>
            </button>
            <button type="button" className="ad-topbar__brand ad-focus" onClick={() => go('/')} title="Niyoq home">
              <span className="ad-logo-mark" aria-hidden="true" />
              <span className="ad-topbar__wordmark">
                <span className="ad-topbar__brand-name">Niyoq</span>
                <span className="ad-topbar__brand-sub">Team OS</span>
              </span>
            </button>
            <span className="ad-topbar__divider" aria-hidden="true" />
            <SearchBar
              value=""
              placeholder="Search people, tasks, messages…"
              onClick={() => window.dispatchEvent(new CustomEvent('cmdk:open'))}
            />
          </div>

          {/* Right: admin toggle + icons + avatar */}
          <div className="ad-topbar__right">
            {hasAdminPowers && (
              <button
                type="button"
                className={`ad-admin-toggle ad-focus ${adminMode ? 'ad-admin-toggle--on' : ''}`}
                onClick={() => setAdminMode(!adminMode)}
              >
                <Icon.Shield size={14} />
                <span>Admin</span>
                <span className={`ad-admin-toggle__knob ${adminMode ? 'ad-admin-toggle__knob--on' : ''}`} aria-hidden="true" />
              </button>
            )}

            <IconButton title="Notifications" badge={notifBadge > 0 ? notifBadge : undefined} onClick={() => go('/notifications')}>
              <Icon.Bell size={16} />
            </IconButton>
            <IconButton title="Sticky Notes" onClick={() => go('/sticky-notes')}>
              <Icon.StickyIcon size={16} />
            </IconButton>
            <IconButton title="Settings" onClick={() => go('/settings')}>
              <Icon.Settings size={16} />
            </IconButton>

            <span className="ad-topbar__divider" aria-hidden="true" />

            {/* Avatar + user menu */}
            <div className="ad-topbar__me">
              <button type="button" className="ad-topbar__me-btn ad-focus" onClick={() => setShowUserMenu(v => !v)} title={user?.name || 'Account'}>
                <Avatar name={user?.name || '??'} status="online" />
                <span className="ad-topbar__me-meta">
                  <span className="ad-topbar__me-name">{user?.name || 'You'}</span>
                  <span className="ad-topbar__me-status">
                    <LiveDot size="xs" /> Active
                  </span>
                </span>
              </button>

              {showUserMenu && (
                <>
                  <div className="ad-menu-scrim" onClick={() => setShowUserMenu(false)} />
                  <div className="ad-menu ad-glass ad-glass--strong ad-glass--elevated">
                    <div className="ad-menu__header">
                      <div className="ad-menu__name">{user?.name}</div>
                      <div className="ad-menu__email">{user?.email}</div>
                      <div className="ad-menu__rolepill">
                        {user?.role === 'main_admin'
                          ? 'Main Admin'
                          : user?.role === 'admin'
                          ? (user.adminTitle || 'Admin')
                          : 'Employee'}
                      </div>
                    </div>
                    <button type="button" className="ad-menu__item ad-focus" onClick={() => { go('/profile'); setShowUserMenu(false); }}>
                      <Icon.UserIcon size={14} /> Profile
                    </button>
                    <button type="button" className="ad-menu__item ad-focus" onClick={() => { go('/settings'); setShowUserMenu(false); }}>
                      <Icon.Settings size={14} /> Settings
                    </button>
                    <div className="ad-menu__sep" />
                    <button type="button" className="ad-menu__item ad-menu__item--danger ad-focus" onClick={() => { logout(); setShowUserMenu(false); }}>
                      <Icon.LogOut size={14} /> Logout
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ─── Body: sidebar + main ────────────────────────────────── */}
      <div className="ad-body">
        {/* Sidebar */}
        <aside className="ad-sidebar ad-glass ad-glass--elevated">
          <SidebarDivider label="Workspace" />
          <nav className="ad-nav">
            {PRIMARY_NAV.map(item => (
              <NavItem
                key={item.key}
                item={item}
                active={isActive(item.path)}
                onClick={() => go(item.path)}
                unreadCount={item.unreadKey ? (notifByType[item.unreadKey] || 0) : 0}
              />
            ))}
          </nav>

          <SidebarDivider label="More" />
          <nav className="ad-nav">
            {SECONDARY_NAV.map(item => (
              <NavItem
                key={item.key}
                item={item}
                active={isActive(item.path)}
                onClick={() => go(item.path)}
                unreadCount={item.key === 'notifications' ? notifBadge : 0}
              />
            ))}
          </nav>

          {hasAdminPowers && adminMode && (
            <>
              <SidebarDivider label="Admin" />
              <nav className="ad-nav">
                {ADMIN_NAV.map(item => (
                  <NavItem
                    key={item.key}
                    item={item}
                    active={isActive(item.path)}
                    onClick={() => go(item.path)}
                  />
                ))}
              </nav>
            </>
          )}

          <div className="ad-sidebar__spacer" />
        </aside>

        {/* Main content area */}
        <main className="ad-main">
          {adminMode && (
            <div className="ad-admin-banner ad-enter" role="status">
              <span className="ad-admin-banner__icon"><Icon.Shield size={16} /></span>
              <div className="ad-admin-banner__text">
                <strong>Admin Mode Active</strong>
                <span>You're viewing additional admin tools and analytics.</span>
              </div>
            </div>
          )}
          <ErrorBoundary key={location.pathname} scope={`route:${location.pathname}`} compact>
            <Outlet context={{ adminMode, setAdminMode }} />
          </ErrorBoundary>
        </main>
      </div>

      {/* Toasts */}
      <NotificationToast />

      {/* Session 26 (N1): draggable sticky notes pinned on top of every page */}
      <DraggableStickyOverlay />

      {/* Session 28 (N8): achievement + level-up toasts */}
      <AchievementToast />
    </div>
  );
}
