// ============================================================================
// UpdateToast.js — bottom-right toast for auto-update lifecycle.
// ============================================================================
// Session 34 (final). Subscribes to window.electron.updater.onEvent and
// shows a small persistent card when:
//
//   available  → "Update v1.2.3 available. Downloading…"  + progress bar
//   downloaded → "Update ready. Restart to install."      + Restart button
//   error      → "Update failed."                          + Dismiss button
//
// In a regular browser (no Electron), this component renders null.
// ============================================================================

import { useEffect, useState } from 'react';
import './UpdateToast.css';

const isElectron = typeof window !== 'undefined' && !!window.electron?.updater;

export default function UpdateToast() {
  const [state, setState] = useState(null);  // null | 'available' | 'progress' | 'downloaded' | 'error'
  const [info, setInfo] = useState({});
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isElectron) return;
    const unsub = window.electron.updater.onEvent((data) => {
      switch (data.event) {
        case 'checking':
          // Quiet — no UI yet, avoid nagging users
          break;
        case 'not-available':
          // Only show if user manually triggered; we don't track that here.
          break;
        case 'available':
          setState('available');
          setInfo({ version: data.version, releaseNotes: data.releaseNotes });
          setDismissed(false);
          break;
        case 'progress':
          setState('progress');
          setInfo(prev => ({ ...prev, percent: data.percent }));
          break;
        case 'downloaded':
          setState('downloaded');
          setInfo(prev => ({ ...prev, version: data.version }));
          setDismissed(false);
          break;
        case 'error':
          setState('error');
          setInfo({ message: data.message });
          break;
        default: break;
      }
    });
    return () => { if (unsub) unsub(); };
  }, []);

  if (!isElectron || !state || dismissed) return null;

  const install = async () => {
    try { await window.electron.updater.install(); } catch {}
  };

  return (
    <div className={`ad-update-toast ad-update-toast--${state}`}>
      <div className="ad-update-toast__icon">
        {state === 'error' ? '⚠️' : state === 'downloaded' ? '✅' : '⬇️'}
      </div>
      <div className="ad-update-toast__body">
        {state === 'available' && (
          <>
            <div className="ad-update-toast__title">
              Update available — v{info.version}
            </div>
            <div className="ad-update-toast__sub">Downloading in the background…</div>
          </>
        )}
        {state === 'progress' && (
          <>
            <div className="ad-update-toast__title">
              Downloading v{info.version}
            </div>
            <div className="ad-update-toast__bar">
              <div
                className="ad-update-toast__bar-fill"
                style={{ width: `${info.percent || 0}%` }}
              />
            </div>
            <div className="ad-update-toast__sub">{info.percent || 0}%</div>
          </>
        )}
        {state === 'downloaded' && (
          <>
            <div className="ad-update-toast__title">
              v{info.version} ready to install
            </div>
            <div className="ad-update-toast__sub">
              The app will restart to apply the update.
            </div>
          </>
        )}
        {state === 'error' && (
          <>
            <div className="ad-update-toast__title">Update failed</div>
            <div className="ad-update-toast__sub">{info.message || 'Please try again later.'}</div>
          </>
        )}
      </div>
      <div className="ad-update-toast__actions">
        {state === 'downloaded' && (
          <button className="ad-update-toast__btn ad-update-toast__btn--primary" onClick={install}>
            Restart
          </button>
        )}
        <button
          className="ad-update-toast__btn"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          title="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
