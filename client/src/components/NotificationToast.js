import { useState, useEffect, useCallback } from 'react';
import { useSocket } from '../context/SocketContext';
import '../styles/notifications.css';

const TYPE_ICONS = {
  emergency: '🚨', task: '✅', message: '💬', meeting: '👥',
  approval: '📋', announcement: '📢', salary: '💰', attendance: '⏰',
  email: '✉️', system: '⚙️'
};

export default function NotificationToast() {
  const { socket } = useSocket();
  const [toasts, setToasts] = useState([]);
  const [dnd, setDnd] = useState(false);
  const [dndUntil, setDndUntil] = useState(null); // DND expiry timestamp

  // Auto-expire DND
  useEffect(() => {
    if (!dndUntil) return;
    const timeout = setTimeout(() => { setDnd(false); setDndUntil(null); }, dndUntil - Date.now());
    return () => clearTimeout(timeout);
  }, [dndUntil]);

  const addToast = useCallback((notif) => {
    // DND blocks everything except emergency
    if (dnd && !notif.isEmergency) return;

    const id = notif._id || Date.now() + Math.random();
    setToasts(prev => [...prev, { ...notif, toastId: id }]);

    // Auto-dismiss after 5s (emergency never auto-dismisses)
    if (!notif.isEmergency) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.toastId !== id));
      }, 5000);
    }
  }, [dnd]);

  useEffect(() => {
    if (!socket) return;
    const handleNew = (data) => addToast(data);
    const handleEmergency = (data) => addToast({ ...data, isEmergency: true });

    socket.on('notification:new', handleNew);
    socket.on('notification:emergency', handleEmergency);
    socket.on('email:new', (data) => addToast({ type: 'email', title: 'New Email', message: `From ${data.fromName}: ${data.subject}` }));

    return () => {
      socket.off('notification:new', handleNew);
      socket.off('notification:emergency', handleEmergency);
      socket.off('email:new');
    };
  }, [socket, addToast]);

  const dismissToast = (toastId) => {
    setToasts(prev => prev.filter(t => t.toastId !== toastId));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="notif-toast-stack">
      {toasts.map(t => (
        <div key={t.toastId} className={`notif-toast ${t.isEmergency ? 'emergency' : ''}`}>
          <div className={`notif-toast-icon notif-icon-${t.type || 'system'}`}>
            {TYPE_ICONS[t.type] || '🔔'}
          </div>
          <div className="notif-toast-content">
            <div className="notif-toast-title">{t.title}</div>
            <div className="notif-toast-message">{t.message}</div>
            {t.isEmergency && (
              <div className="notif-toast-actions">
                <button className="notif-toast-action" onClick={() => dismissToast(t.toastId)}>Acknowledge</button>
              </div>
            )}
          </div>
          {!t.isEmergency && (
            <button className="notif-toast-close" onClick={() => dismissToast(t.toastId)}>&times;</button>
          )}
        </div>
      ))}
    </div>
  );
}
