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

    // Auto-dismiss after 10s (emergency never auto-dismisses)
    if (!notif.isEmergency) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.toastId !== id));
      }, 10000);
    }
  }, [dnd]);

  // Show a real OS-level notification using the Web Notification API.
  // (Works in Electron renderer on macOS even for unsigned apps. The
  // main-process Electron Notification class is unreliable without
  // code signing, so we don't use the IPC bridge.)
  const showOSNotification = (title, body, url) => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    try {
      const n = new Notification(title, {
        body: body || '',
        icon: '/logo192.png',
        tag: 'niyoq-' + Date.now()
      });
      n.onclick = () => {
        try { window.focus(); } catch (_) {}
        if (url) window.location.href = url;
      };
    } catch (_) {}
  };

  // Auto-request browser notification permission on first run for non-Electron too,
  // so OS-level banners appear even when the tab is focused.
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      // Only ask if the user has been on the app for a moment (not on initial load)
      const t = setTimeout(() => {
        try { Notification.requestPermission().catch(() => {}); } catch {}
      }, 5000);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    if (!socket) return;
    const urlFor = (data) =>
      data.entityType === 'channel' ? `/messages?channel=${data.entityId}` :
      data.entityType === 'task' ? `/tasks?id=${data.entityId}` :
      data.entityType === 'meeting' ? `/meetings?id=${data.entityId}` :
      '/notifications';

    // Detect mobile WebView wrapper (the Niyoq APK injects this token).
    // Bell sound only on web/Electron — mobile already gets OS push tones.
    const isMobileWebView = typeof window !== 'undefined' &&
      (window.__EXPO_PUSH_TOKEN__ || /NiyoqMobile/i.test(navigator.userAgent || ''));

    // Loops the wrap-up bell MP3 until user dismisses, or 10 minutes max.
    const activeBell = { audio: null, stopTimer: null };
    const stopBell = () => {
      if (activeBell.audio) {
        try { activeBell.audio.pause(); activeBell.audio.currentTime = 0; } catch {}
        activeBell.audio = null;
      }
      if (activeBell.stopTimer) { clearTimeout(activeBell.stopTimer); activeBell.stopTimer = null; }
    };

    const playBell = () => {
      if (isMobileWebView) return;
      stopBell();
      try {
        const audio = new Audio('/wrapup-bell.mp3');
        audio.loop = true;
        audio.volume = 1.0; // browser max — system volume is OS-controlled and cannot be forced
        activeBell.audio = audio;
        const p = audio.play();
        if (p && typeof p.catch === 'function') {
          // Autoplay can be blocked if no recent user gesture; ignore silently
          p.catch(() => {});
        }
        // Hard cap at 10 minutes
        activeBell.stopTimer = setTimeout(stopBell, 10 * 60 * 1000);
      } catch (_) {}
    };

    window.__niyoqStopBell = stopBell;

    const handleNew = (data) => {
      addToast(data);
      showOSNotification(data.title, data.message, urlFor(data));
      if (data.playSound) playBell();
    };
    const handleEmergency = (data) => {
      addToast({ ...data, isEmergency: true });
      showOSNotification('🚨 ' + data.title, data.message, '/notifications');
    };

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
            {t.playSound && (
              <div className="notif-toast-actions">
                <button className="notif-toast-action"
                  onClick={() => { try { window.__niyoqStopBell?.(); } catch {} dismissToast(t.toastId); }}>
                  🔕 Stop bell
                </button>
              </div>
            )}
          </div>
          {!t.isEmergency && (
            <button className="notif-toast-close" onClick={() => { try { if (t.playSound) window.__niyoqStopBell?.(); } catch {} dismissToast(t.toastId); }}>&times;</button>
          )}
        </div>
      ))}
    </div>
  );
}
