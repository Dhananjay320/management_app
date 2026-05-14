import { useState, useEffect } from 'react';

// Small one-time card asking the user to grant the autoplay gesture so the
// wrap-up bell can ring at 5:50 PM. Disappears once enabled (or dismissed).
const STORAGE_KEY = 'niyoq-sound-enabled';

export default function EnableSoundPrompt() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const enabled = localStorage.getItem(STORAGE_KEY) === '1';
      // Suppress on mobile WebView (mobile uses OS push tones, not WebAudio)
      const isMobileWebView = !!(window.__EXPO_PUSH_TOKEN__ || /NiyoqMobile/i.test(navigator.userAgent || ''));
      if (!enabled && !isMobileWebView) setVisible(true);
    } catch {}
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      // Briefly play the bell at minimum volume to register the gesture in the browser's autoplay-gesture cache.
      const audio = new Audio('/wrapup-bell.mp3');
      audio.volume = 0.0001;
      audio.muted = false;
      const p = audio.play();
      if (p) await p;
      // Stop almost immediately
      setTimeout(() => { try { audio.pause(); audio.currentTime = 0; } catch {} }, 120);
      localStorage.setItem(STORAGE_KEY, '1');
      setVisible(false);
    } catch (err) {
      // If autoplay was blocked, the click itself counts as a gesture so re-try
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
      setVisible(false);
    }
    setBusy(false);
  };

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.06))',
      border: '1px solid rgba(99,102,241,0.25)',
      borderRadius: 12,
      padding: '12px 16px',
      marginBottom: 14,
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      flexWrap: 'wrap'
    }}>
      <span style={{ fontSize: 22 }}>🔔</span>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
          Enable the wrap-up bell
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
          A daily bell rings at 5:50 PM to remind everyone to wrap up. Click once to allow sound — browsers block autoplay otherwise.
        </div>
      </div>
      <button onClick={enable} disabled={busy}
        style={{ padding: '8px 14px', fontSize: 12, fontWeight: 700, background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
        {busy ? 'Enabling…' : '🔊 Enable'}
      </button>
      <button onClick={dismiss}
        style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, background: 'transparent', color: 'var(--ink-3)', border: '1px solid var(--line)', borderRadius: 8, cursor: 'pointer' }}>
        Not now
      </button>
    </div>
  );
}
