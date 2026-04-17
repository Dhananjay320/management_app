import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import api from '../services/api';
import '../styles/notifications.css';

const TYPE_ICONS = {
  emergency: '🚨', task: '✅', message: '💬', meeting: '👥',
  approval: '📋', announcement: '📢', salary: '💰', attendance: '⏰',
  email: '✉️', system: '⚙️'
};

const TYPE_LABELS = {
  all: 'All', emergency: 'Emergency', task: 'Tasks', message: 'Messages',
  meeting: 'Meetings', approval: 'Approvals', announcement: 'Announcements'
};

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [notifications, setNotifications] = useState([]);
  const [tab, setTab] = useState('all');
  const [counts, setCounts] = useState({ total: 0, byType: {}, emergencyUnacked: 0 });

  const loadNotifications = useCallback(async () => {
    try {
      const params = {};
      if (tab !== 'all') params.type = tab;
      const { data } = await api.get('/notifications', { params });
      setNotifications(data);
    } catch {}
  }, [tab]);

  const loadCounts = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications/unread-count');
      setCounts(data);
    } catch {}
  }, []);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);
  useEffect(() => { loadCounts(); }, [loadCounts]);

  // Socket: real-time notifications
  useEffect(() => {
    if (!socket) return;
    const handleNew = () => { loadNotifications(); loadCounts(); };
    socket.on('notification:new', handleNew);
    socket.on('notification:emergency', handleNew);
    return () => {
      socket.off('notification:new', handleNew);
      socket.off('notification:emergency', handleNew);
    };
  }, [socket, loadNotifications, loadCounts]);

  const markRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
      loadCounts();
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await api.put('/notifications/read-all', { type: tab !== 'all' ? tab : undefined });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      loadCounts();
    } catch {}
  };

  const clearAll = async () => {
    try {
      await api.delete('/notifications/clear', { params: { type: tab !== 'all' ? tab : undefined } });
      loadNotifications();
      loadCounts();
    } catch {}
  };

  const acknowledge = async (id) => {
    try {
      await api.put(`/notifications/${id}/acknowledge`);
      setNotifications(prev => prev.map(n =>
        n._id === id ? { ...n, acknowledgedAt: new Date(), isRead: true, isDismissed: true } : n
      ));
      loadCounts();
    } catch {}
  };

  const dismiss = async (id) => {
    try {
      await api.put(`/notifications/${id}/dismiss`);
      setNotifications(prev => prev.filter(n => n._id !== id));
    } catch {}
  };

  return (
    <div className="notif-layout">
      <div className="notif-header">
        <h2>
          Notifications
          {counts.total > 0 && <span style={{ fontSize: 13, color: '#6366F1', marginLeft: 8 }}>({counts.total} unread)</span>}
        </h2>
        <div className="notif-header-actions">
          <button className="notif-header-btn" onClick={markAllRead}>Mark all read</button>
          <button className="notif-header-btn" onClick={clearAll}>Clear all</button>
        </div>
      </div>

      {/* Group Tabs */}
      <div className="notif-tabs">
        {Object.entries(TYPE_LABELS).map(([key, label]) => (
          <button
            key={key}
            className={`notif-tab ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
          >
            {key !== 'all' && <span>{TYPE_ICONS[key]}</span>}
            {label}
            {key === 'all' && counts.total > 0 && (
              <span className="notif-tab-badge">{counts.total}</span>
            )}
            {key !== 'all' && (counts.byType[key] || 0) > 0 && (
              <span className="notif-tab-badge">{counts.byType[key]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Notification List */}
      {notifications.length === 0 ? (
        <div className="notif-empty">
          <div className="notif-empty-icon">🔔</div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', marginBottom: 6 }}>All caught up!</h3>
          <p style={{ fontSize: 12, color: '#94A3B8' }}>No notifications to show. You'll see new ones here as they come in.</p>
        </div>
      ) : (
        <div className="notif-list">
          {notifications.map(n => (
            <div
              key={n._id}
              className={`notif-item ${!n.isRead ? 'unread' : ''} ${n.isEmergency ? 'emergency' : ''}`}
              onClick={() => !n.isRead && markRead(n._id)}
            >
              <div className={`notif-icon notif-icon-${n.type}`}>
                {TYPE_ICONS[n.type] || '🔔'}
              </div>
              <div className="notif-content">
                <div className="notif-title">{n.title}</div>
                <div className="notif-message">{n.message}</div>
                <div className="notif-meta">
                  <span className="notif-time">{timeAgo(n.createdAt)}</span>
                  {n.sender && <span className="notif-sender">from {n.sender.name}</span>}
                </div>
              </div>
              <div className="notif-actions">
                {n.isEmergency && !n.acknowledgedAt && (
                  <button className="notif-action-btn acknowledge" onClick={(e) => { e.stopPropagation(); acknowledge(n._id); }}>
                    Acknowledge
                  </button>
                )}
                {n.isEmergency && n.acknowledgedAt && (
                  <span style={{ fontSize: 10, color: '#10B981', fontWeight: 600 }}>Acknowledged</span>
                )}
              </div>
              {!n.isEmergency && (
                <button className="notif-dismiss" onClick={(e) => { e.stopPropagation(); dismiss(n._id); }} title="Dismiss">
                  &times;
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
