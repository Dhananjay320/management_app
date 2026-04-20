// ============================================================================
// AchievementToast.js — floating toast when a badge is unlocked or you level up.
// ============================================================================
// Session 28 (N8). Listens for `achievement:unlocked` and `level:up` socket
// events emitted from the gamification engine and shows a celebratory card
// in the bottom-right corner for ~4 seconds each.
//
// Multiple unlocks stack. Auto-dismiss; clickable to navigate to the
// achievements page.
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import './AchievementToast.css';

export default function AchievementToast() {
  const { socket } = useSocket();
  const [toasts, setToasts] = useState([]);
  const navigate = useNavigate();

  const push = useCallback((kind, data) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts(prev => [...prev, { id, kind, ...data }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4200);
  }, []);

  useEffect(() => {
    if (!socket) return;

    const onUnlock = (data) => push('achievement', data);
    const onLevelUp = (data) => push('levelup', data);

    socket.on('achievement:unlocked', onUnlock);
    socket.on('level:up', onLevelUp);
    return () => {
      socket.off('achievement:unlocked', onUnlock);
      socket.off('level:up', onLevelUp);
    };
  }, [socket, push]);

  if (toasts.length === 0) return null;

  return (
    <div className="ad-ach-toasts">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`ad-ach-toast ad-ach-toast--${t.kind}`}
          onClick={() => navigate('/achievements')}
          role="status"
        >
          {t.kind === 'achievement' ? (
            <>
              <div className="ad-ach-toast__icon">{t.icon}</div>
              <div className="ad-ach-toast__text">
                <div className="ad-ach-toast__kicker">Achievement unlocked</div>
                <div className="ad-ach-toast__title">{t.title}</div>
                <div className="ad-ach-toast__xp">+{t.xp} XP</div>
              </div>
            </>
          ) : (
            <>
              <div className="ad-ach-toast__icon">⬆️</div>
              <div className="ad-ach-toast__text">
                <div className="ad-ach-toast__kicker">Level up!</div>
                <div className="ad-ach-toast__title">You reached level {t.level}</div>
                <div className="ad-ach-toast__xp">{(t.xp || 0).toLocaleString()} XP</div>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
