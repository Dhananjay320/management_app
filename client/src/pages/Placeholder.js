import { useLocation } from 'react-router-dom';

const PAGE_INFO = {
  '/attendance': { icon: '⏰', title: 'Attendance', desc: 'Mark entry, wrap up, request leaves' },
  '/messages': { icon: '💬', title: 'Messages', desc: 'Channels, DMs, groups, rooms' },
  '/tasks': { icon: '✅', title: 'Tasks', desc: 'Manage tasks, subtasks, and to-dos' },
  '/workspace': { icon: '📁', title: 'Workspace', desc: 'Documents, files, notes, whiteboard' },
  '/meetings': { icon: '👥', title: 'Meetings', desc: 'Create meetings, MoM, Google Meet' },
  '/email': { icon: '✉️', title: 'Email', desc: 'Send and receive company emails' },
  '/sticky-notes': { icon: '📝', title: 'Sticky Notes', desc: 'Quick notes attached to anything' },
  '/activity': { icon: '🎯', title: 'Daily Activity', desc: 'Team enrichment activities' },
  '/feed': { icon: '📰', title: 'Team Feed', desc: 'Company social wall' },
  '/salary': { icon: '💰', title: 'Salary', desc: 'View salary breakdown and history' },
  '/notifications': { icon: '🔔', title: 'Notifications', desc: 'All your alerts and updates' },
  '/settings': { icon: '⚙️', title: 'Settings', desc: 'Preferences and configuration' },
  '/profile': { icon: '👤', title: 'Profile', desc: 'Your profile information' },
  '/admin/analysis': { icon: '📊', title: 'Analysis', desc: 'Team and company analytics' },
  '/admin/security': { icon: '🔐', title: 'Security', desc: 'OTPs, locks, sessions, password resets' },
  '/onboarding': { icon: '🚀', title: 'Welcome!', desc: 'Let\'s get you set up' },
};

export default function Placeholder() {
  const location = useLocation();
  const info = PAGE_INFO[location.pathname] || { icon: '🏗️', title: 'Coming Soon', desc: 'This section is being built' };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 140px)' }}>
      <div className="card" style={{ textAlign: 'center', padding: 40, maxWidth: 420 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>{info.icon}</div>
        <h2 style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: 22, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }}>
          {info.title}
        </h2>
        <p style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.7, marginBottom: 20 }}>
          {info.desc}<br />
          <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>This module will be built in an upcoming phase.</span>
        </p>
        <div style={{ display: 'inline-flex', padding: '6px 14px', background: 'rgba(99,102,241,0.06)', color: '#6366F1', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
          Phase 3+
        </div>
      </div>
    </div>
  );
}
