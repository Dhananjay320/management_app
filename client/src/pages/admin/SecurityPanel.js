import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';

const TABS = [
  { key: 'otps', label: 'Pending OTPs' },
  { key: 'locks', label: 'Account Locks' },
  { key: 'sessions', label: 'Active Sessions' },
  { key: 'resets', label: 'Password Resets' },
];

const tabStyle = (active) => ({
  padding: '8px 18px',
  fontSize: 12,
  fontWeight: active ? 700 : 500,
  color: active ? '#6366F1' : '#64748B',
  background: active ? 'rgba(99,102,241,0.08)' : 'transparent',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  transition: 'all 0.15s',
  fontFamily: 'Inter, sans-serif',
});

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function countdown(expiresAt) {
  if (!expiresAt) return 'Expired';
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function SecurityPanel() {
  const [tab, setTab] = useState('otps');
  const [otps, setOtps] = useState([]);
  const [locks, setLocks] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [resets, setResets] = useState({ otpResets: [], passwordChanges: [] });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (tab === 'otps') {
        const { data } = await api.get('/security/pending-otps');
        setOtps(data);
      } else if (tab === 'locks') {
        const { data } = await api.get('/security/locked-accounts');
        setLocks(data);
      } else if (tab === 'sessions') {
        const { data } = await api.get('/security/active-sessions');
        setSessions(data);
      } else if (tab === 'resets') {
        const { data } = await api.get('/security/password-resets');
        setResets(data);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load data. You may lack permission for this section.');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Countdown timer for OTPs
  const [, setTick] = useState(0);
  useEffect(() => {
    if (tab !== 'otps') return;
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [tab]);

  const handleUnlock = async (userId) => {
    setActionLoading(userId);
    setSuccess('');
    try {
      const { data } = await api.post(`/security/unlock/${userId}`);
      setSuccess(data.message);
      setLocks(prev => prev.filter(l => l._id !== userId));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to unlock account.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleForceLogout = async (userId) => {
    setActionLoading(userId);
    setSuccess('');
    try {
      const { data } = await api.post(`/security/force-logout/${userId}`);
      setSuccess(data.message);
      setSessions(prev => prev.filter(s => s._id !== userId));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to force logout.');
    } finally {
      setActionLoading(null);
    }
  };

  const renderOtps = () => {
    if (otps.length === 0) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>No pending OTPs.</div>;
    return (
      <div className="table-container">
        <div className="table-header" style={{ gridTemplateColumns: '1fr 120px 120px 100px' }}>
          <div>User</div>
          <div>OTP Code</div>
          <div>Created</div>
          <div>Expires In</div>
        </div>
        {otps.map(otp => (
          <div key={otp._id} className="table-row" style={{ gridTemplateColumns: '1fr 120px 120px 100px' }}>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{otp.userId?.name || 'Unknown'}</div>
              <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>{otp.userId?.email || ''}</div>
            </div>
            <div>
              <span style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 14,
                fontWeight: 700,
                color: '#6366F1',
                background: 'rgba(99,102,241,0.08)',
                padding: '4px 10px',
                borderRadius: 6,
              }}>{otp.code}</span>
            </div>
            <div style={{ color: 'var(--ink-2)', fontSize: 11 }}>{timeAgo(otp.createdAt)}</div>
            <div>
              <span className="badge-pill" style={{
                background: countdown(otp.expiresAt) === 'Expired' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
                color: countdown(otp.expiresAt) === 'Expired' ? '#EF4444' : '#F59E0B',
              }}>{countdown(otp.expiresAt)}</span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderLocks = () => {
    if (locks.length === 0) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>No locked accounts.</div>;
    return (
      <div className="table-container">
        <div className="table-header" style={{ gridTemplateColumns: '1fr 1fr 120px 80px 100px' }}>
          <div>Name</div>
          <div>Email</div>
          <div>Locked At</div>
          <div>Attempts</div>
          <div>Action</div>
        </div>
        {locks.map(user => (
          <div key={user._id} className="table-row" style={{ gridTemplateColumns: '1fr 1fr 120px 80px 100px' }}>
            <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{user.name}</div>
            <div style={{ color: 'var(--ink-2)' }}>{user.email}</div>
            <div style={{ color: 'var(--ink-2)', fontSize: 11 }}>{timeAgo(user.lockedAt)}</div>
            <div>
              <span className="badge-pill" style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444' }}>
                {user.failedLoginAttempts}
              </span>
            </div>
            <div>
              <button
                className="btn btn-primary-sm"
                style={{ fontSize: 10, padding: '4px 12px' }}
                disabled={actionLoading === user._id}
                onClick={() => handleUnlock(user._id)}
              >
                {actionLoading === user._id ? 'Unlocking...' : 'Unlock'}
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderSessions = () => {
    if (sessions.length === 0) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>No active sessions.</div>;
    return (
      <div className="table-container">
        <div className="table-header" style={{ gridTemplateColumns: '1fr 1fr 100px 120px 100px' }}>
          <div>Name</div>
          <div>Email</div>
          <div>Role</div>
          <div>Last Login</div>
          <div>Action</div>
        </div>
        {sessions.map(user => (
          <div key={user._id} className="table-row" style={{ gridTemplateColumns: '1fr 1fr 100px 120px 100px' }}>
            <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{user.name}</div>
            <div style={{ color: 'var(--ink-2)' }}>{user.email}</div>
            <div>
              <span className="badge-pill" style={{
                background: user.role === 'main_admin' ? 'rgba(99,102,241,0.08)' : user.role === 'admin' ? 'rgba(249,115,22,0.08)' : 'rgba(16,185,129,0.08)',
                color: user.role === 'main_admin' ? '#6366F1' : user.role === 'admin' ? '#F97316' : '#10B981',
              }}>
                {user.role === 'main_admin' ? 'Main Admin' : user.role === 'admin' ? 'Admin' : 'Employee'}
              </span>
            </div>
            <div style={{ color: 'var(--ink-2)', fontSize: 11 }}>{formatDate(user.lastLogin)}</div>
            <div>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 10, padding: '4px 12px', color: '#EF4444', borderColor: '#FCA5A5' }}
                disabled={actionLoading === user._id}
                onClick={() => handleForceLogout(user._id)}
              >
                {actionLoading === user._id ? 'Logging out...' : 'Force Logout'}
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderResets = () => {
    const { otpResets, passwordChanges } = resets;
    if (otpResets.length === 0 && passwordChanges.length === 0) {
      return <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>No password reset history.</div>;
    }
    return (
      <div>
        {/* OTP-based resets */}
        {otpResets.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 10 }}>OTP-Based Resets</div>
            <div className="table-container">
              <div className="table-header" style={{ gridTemplateColumns: '1fr 1fr 150px' }}>
                <div>User</div>
                <div>Email</div>
                <div>Used At</div>
              </div>
              {otpResets.map(otp => (
                <div key={otp._id} className="table-row" style={{ gridTemplateColumns: '1fr 1fr 150px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{otp.userId?.name || 'Unknown'}</div>
                  <div style={{ color: 'var(--ink-2)' }}>{otp.userId?.email || ''}</div>
                  <div style={{ color: 'var(--ink-2)', fontSize: 11 }}>{formatDate(otp.usedAt)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Password changes (first-login) */}
        {passwordChanges.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 10 }}>First-Login Password Changes</div>
            <div className="table-container">
              <div className="table-header" style={{ gridTemplateColumns: '1fr 1fr 150px' }}>
                <div>User</div>
                <div>Email</div>
                <div>Changed At</div>
              </div>
              {passwordChanges.map(user => (
                <div key={user._id} className="table-row" style={{ gridTemplateColumns: '1fr 1fr 150px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{user.name}</div>
                  <div style={{ color: 'var(--ink-2)' }}>{user.email}</div>
                  <div style={{ color: 'var(--ink-2)', fontSize: 11 }}>{formatDate(user.updatedAt)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Security</div>
          <div className="page-subtitle">Monitor and manage account security</div>
        </div>
        <button className="btn btn-secondary" onClick={loadData} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--glass)', padding: 4, borderRadius: 10, width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t.key} style={tabStyle(tab === t.key)} onClick={() => { setTab(t.key); setSuccess(''); setError(''); }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Alerts */}
      {error && <div className="info-box amber" style={{ marginBottom: 12 }}><span>&#9888;&#65039;</span><div>{error}</div></div>}
      {success && <div className="info-box green" style={{ marginBottom: 12 }}><span>&#9989;</span><div>{success}</div></div>}

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-3)' }}>Loading...</div>
      ) : (
        <>
          {tab === 'otps' && renderOtps()}
          {tab === 'locks' && renderLocks()}
          {tab === 'sessions' && renderSessions()}
          {tab === 'resets' && renderResets()}
        </>
      )}
    </div>
  );
}
