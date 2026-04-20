// ============================================================================
// ElectronTitleBar.js — custom titlebar for the frameless Electron window.
// ============================================================================
// Session 33. Only renders when running inside Electron (detected via
// `window.electron`). The bar is draggable (via CSS `-webkit-app-region`)
// and includes platform-appropriate window controls on the non-drag side.
//
// On macOS we don't draw our own traffic-light buttons — Electron's
// `titleBarStyle: 'hiddenInset'` keeps the native buttons, so we just
// reserve space for them with a left-side inset.
// ============================================================================

import { useEffect, useState } from 'react';
import './ElectronTitleBar.css';

// Only show in Electron; never show in a regular browser.
const isElectron = typeof window !== 'undefined' && !!window.electron;

export default function ElectronTitleBar() {
  const [state, setState] = useState({ isMaximized: false, isFullScreen: false, platform: null });

  useEffect(() => {
    if (!isElectron) return;
    let unsub = null;
    window.electron.window.state().then(setState).catch(() => {});
    unsub = window.electron.window.onStateChange(setState);
    return () => { if (unsub) unsub(); };
  }, []);

  if (!isElectron) return null;
  // Full-screen windows on any platform: hide the titlebar entirely
  if (state.isFullScreen) return null;

  const isMac = state.platform === 'darwin';

  return (
    <div className={`ad-titlebar ${isMac ? 'ad-titlebar--mac' : ''}`}>
      {/* Left-side drag region. On macOS we leave 80px padding for the native traffic lights. */}
      <div className="ad-titlebar__drag">
        <span className="ad-titlebar__brand">Avadeti Team</span>
      </div>

      {/* Windows / Linux: draw our own window controls */}
      {!isMac && (
        <div className="ad-titlebar__controls">
          <button
            className="ad-titlebar__btn"
            onClick={() => window.electron.window.minimize()}
            aria-label="Minimize"
            title="Minimize"
          >
            <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden><path d="M0 5 H10" stroke="currentColor" strokeWidth="1.2" /></svg>
          </button>
          <button
            className="ad-titlebar__btn"
            onClick={() => window.electron.window.maximize()}
            aria-label={state.isMaximized ? 'Restore' : 'Maximize'}
            title={state.isMaximized ? 'Restore' : 'Maximize'}
          >
            {state.isMaximized ? (
              <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden>
                <path d="M2 2 H8 V8 H2 Z M0 4 H6 V10 H0 Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            ) : (
              <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden>
                <path d="M0 0 H10 V10 H0 Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            )}
          </button>
          <button
            className="ad-titlebar__btn ad-titlebar__btn--close"
            onClick={() => window.electron.window.close()}
            aria-label="Close"
            title="Close"
          >
            <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden>
              <path d="M0 0 L10 10 M10 0 L0 10" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// Export a helper so other components can check if they're in Electron.
export const IS_ELECTRON = isElectron;
