import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import '../styles/notifications.css';

const TYPE_ICONS = {
  emergency: '🚨', task: '✅', message: '💬', meeting: '👥',
  approval: '📋', announcement: '📢', salary: '💰', attendance: '⏰',
  email: '✉️', system: '⚙️'
};

const BELL_KEY = 'niyoq-active-bell';
const BELL_MAX_MS = 10 * 60 * 1000;
const BELL_TOAST_ID = 'bell-toast';

export default function NotificationToast() {
  const { socket } = useSocket();
  const [toasts, setToasts] = useState([]);
  const [dnd, setDnd] = useState(false);
  const [dndUntil, setDndUntil] = useState(null);
  // Indicates the bell is loaded but autoplay-blocked, waiting for any user
  // gesture. Render a friendly hint in the toast so the user knows to tap.
  const [bellMuted, setBellMuted] = useState(false);

  // Auto-expire DND
  useEffect(() => {
    if (!dndUntil) return;
    const timeout = setTimeout(() => { setDnd(false); setDndUntil(null); }, dndUntil - Date.now());
    return () => clearTimeout(timeout);
  }, [dndUntil]);

  // Bell state lives in a ref so React re-renders (e.g. DND toggle) don't
  // orphan the audio object or duplicate handlers.
  const bellRef = useRef({
    audio: null,
    stopTimer: null,
    bellId: null,        // active bell session id from server (or 'resume' on localStorage rehydrate)
    unlockListener: null // cleanup for autoplay-unlock pointer/key listeners
  });

  // Add a toast — sticky (no auto-dismiss) for bell toasts.
  const addToast = useCallback((notif) => {
    if (dnd && !notif.isEmergency) return;
    const id = notif.playSound ? BELL_TOAST_ID : (notif._id || Date.now() + Math.random());
    setToasts(prev => {
      // De-dupe bell toast — only one at a time
      if (notif.playSound && prev.some(t => t.toastId === BELL_TOAST_ID)) return prev;
      return [...prev, { ...notif, toastId: id }];
    });
    // Auto-dismiss only for non-emergency, non-bell toasts
    if (!notif.isEmergency && !notif.playSound) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.toastId !== id));
      }, 10000);
    }
  }, [dnd]);

  // OS notification (only fires if user has granted permission)
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

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      const t = setTimeout(() => {
        try { Notification.requestPermission().catch(() => {}); } catch {}
      }, 5000);
      return () => clearTimeout(t);
    }
  }, []);

  // Stop audio only (no localStorage clear, no server emit). Used when we're
  // about to start a new audio object on the same bell session.
  const silentStopAudio = () => {
    const b = bellRef.current;
    if (b.audio) {
      try { b.audio.pause(); b.audio.currentTime = 0; } catch {}
      b.audio = null;
    }
    if (b.unlockListener) {
      try {
        window.removeEventListener('pointerdown', b.unlockListener, true);
        window.removeEventListener('keydown', b.unlockListener, true);
      } catch {}
      b.unlockListener = null;
    }
  };

  // Full stop: audio + timer + localStorage + cross-tab sync + toast removal.
  // Called from user action (Stop button / × close) or 10-min cap.
  const stopBell = useCallback(() => {
    const b = bellRef.current;
    silentStopAudio();
    if (b.stopTimer) { clearTimeout(b.stopTimer); b.stopTimer = null; }
    b.bellId = null;
    setBellMuted(false);
    try { localStorage.removeItem(BELL_KEY); } catch {}
    try { socket?.emit?.('bell:stop'); } catch {}
    setToasts(prev => prev.filter(t => t.toastId !== BELL_TOAST_ID));
  }, [socket]);

  // Expose stop globally so the toast button (which is outside this closure
  // when stale) can always reach the current stop function.
  useEffect(() => {
    window.__niyoqStopBell = stopBell;
    return () => { if (window.__niyoqStopBell === stopBell) window.__niyoqStopBell = null; };
  }, [stopBell]);

  useEffect(() => {
    if (!socket) return;

    const urlFor = (data) =>
      data.entityType === 'channel' ? `/messages?channel=${data.entityId}` :
      data.entityType === 'task' ? `/tasks?id=${data.entityId}` :
      data.entityType === 'meeting' ? `/meetings?id=${data.entityId}` :
      '/notifications';

    const isMobileWebView = typeof window !== 'undefined' &&
      (window.__EXPO_PUSH_TOKEN__ || /NiyoqMobile/i.test(navigator.userAgent || ''));

    const playBell = (remainingMs) => {
      if (isMobileWebView) return;
      const b = bellRef.current;
      silentStopAudio();
      const cap = Math.max(1000, Math.min(BELL_MAX_MS, remainingMs || BELL_MAX_MS));
      try {
        const audio = new Audio('/wrapup-bell.mp3');
        audio.loop = true;
        audio.volume = 1.0;
        b.audio = audio;
        const p = audio.play();
        if (p && typeof p.catch === 'function') {
          p.then(() => setBellMuted(false)).catch(() => {
            // Autoplay blocked — show muted state and listen for the first
            // user gesture anywhere on the page to unlock.
            setBellMuted(true);
            const unlock = () => {
              try {
                audio.play().then(() => setBellMuted(false)).catch(() => {});
              } catch {}
              try { localStorage.setItem('niyoq-sound-enabled', '1'); } catch {}
              window.removeEventListener('pointerdown', unlock, true);
              window.removeEventListener('keydown', unlock, true);
              b.unlockListener = null;
            };
            b.unlockListener = unlock;
            window.addEventListener('pointerdown', unlock, true);
            window.addEventListener('keydown', unlock, true);
          });
        }
        // Hard cap timer — stop fully (will clear localStorage too)
        b.stopTimer = setTimeout(() => stopBell(), cap);
      } catch (_) {}
    };

    // Resume any bell that was active when the page was unloaded
    try {
      const saved = JSON.parse(localStorage.getItem(BELL_KEY) || 'null');
      if (saved?.startedAt) {
        const age = Date.now() - saved.startedAt;
        if (age < BELL_MAX_MS) {
          bellRef.current.bellId = saved.bellId || 'resume';
          addToast({
            type: 'attendance',
            title: '🔔 Wrap-up Bell',
            message: saved.message || 'Time to wrap up!',
            playSound: true
          });
          playBell(BELL_MAX_MS - age);
        } else {
          localStorage.removeItem(BELL_KEY);
        }
      }
    } catch {}

    // Watchdog: every 30s and on tab-visibility change, verify the bell
    // hasn't exceeded its 10-min lifetime. Protects against frozen tabs
    // where setTimeout fires late and the looping Audio kept running.
    const watchdog = () => {
      try {
        const saved = JSON.parse(localStorage.getItem(BELL_KEY) || 'null');
        const age = saved?.startedAt ? Date.now() - saved.startedAt : Infinity;
        if (age >= BELL_MAX_MS && (bellRef.current.audio || saved)) {
          stopBell();
        }
      } catch {}
    };
    const watchdogInterval = setInterval(watchdog, 30000);
    const onVisible = () => { if (document.visibilityState === 'visible') watchdog(); };
    document.addEventListener('visibilitychange', onVisible);

    const handleNew = (data) => {
      if (data.playSound) {
        // Dedupe by bellId: ignore if this exact bell session is already active
        if (data.bellId && bellRef.current.bellId === data.bellId) return;
        bellRef.current.bellId = data.bellId || 'unknown';
        // Persist to localStorage so refresh during the ring resumes correctly
        try {
          localStorage.setItem(BELL_KEY, JSON.stringify({
            startedAt: Date.now(),
            bellId: bellRef.current.bellId,
            message: data.message
          }));
        } catch {}
        addToast(data);
        showOSNotification(data.title, data.message, urlFor(data));
        playBell(data.remainingMs);
        return;
      }
      addToast(data);
      showOSNotification(data.title, data.message, urlFor(data));
    };

    const handleEmergency = (data) => {
      addToast({ ...data, isEmergency: true });
      showOSNotification('🚨 ' + data.title, data.message, '/notifications');
    };

    // Cross-tab: another tab stopped the bell — stop here too
    const handleStopped = () => stopBell();

    socket.on('notification:new', handleNew);
    socket.on('notification:emergency', handleEmergency);
    socket.on('bell:stopped', handleStopped);
    socket.on('email:new', (data) => addToast({ type: 'email', title: 'New Email', message: `From ${data.fromName}: ${data.subject}` }));

    return () => {
      socket.off('notification:new', handleNew);
      socket.off('notification:emergency', handleEmergency);
      socket.off('bell:stopped', handleStopped);
      socket.off('email:new');
      clearInterval(watchdogInterval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [socket, addToast, stopBell]);

  const dismissToast = (toastId) => {
    if (toastId === BELL_TOAST_ID) { stopBell(); return; }
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
            {t.playSound && bellMuted && (
              <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 4, fontWeight: 600 }}>
                Tap anywhere to start the bell — your browser blocked autoplay.
              </div>
            )}
            {t.isEmergency && (
              <div className="notif-toast-actions">
                <button className="notif-toast-action" onClick={() => dismissToast(t.toastId)}>Acknowledge</button>
              </div>
            )}
            {t.playSound && (
              <div className="notif-toast-actions">
                <button className="notif-toast-action" onClick={stopBell}>
                  🔕 Stop bell
                </button>
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
