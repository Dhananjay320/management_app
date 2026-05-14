// ============================================================================
// useDeepLink.js — handle niyoq:// URLs from the OS/protocol handler.
// ============================================================================
// Session 33 (Phase G). When a user clicks an `niyoq://` link in a browser
// or external app, Electron forwards it to the renderer via the
// `deep-link` IPC channel (set up in main.js + preload.js).
//
// URL shape: `niyoq://<path>?<query>` — e.g. `niyoq://meeting/abc123`
// or `niyoq://whiteboards/xyz?tab=export`. We parse out the path and
// query and navigate the React Router accordingly.
//
// No-ops in a regular browser (where `window.electron` is undefined).
// ============================================================================

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function useDeepLink() {
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.onDeepLink) return;

    const unsub = window.electron.onDeepLink((url) => {
      try {
        // URL parser needs a valid scheme; our scheme ('niyoq://') is fine
        // because it's a registered URL protocol.
        const parsed = new URL(url);
        // `host + pathname` gives us what's after `niyoq://`
        const raw = (parsed.host + parsed.pathname).replace(/^\/+/, '');
        const path = '/' + raw;
        const full = path + (parsed.search || '');
        navigate(full);
      } catch (err) {
        // If the URL is malformed just log and ignore — it's user input
        // arriving from the OS and may not be our format.
        // eslint-disable-next-line no-console
        console.warn('[deep-link] could not parse', url, err);
      }
    });

    return () => { if (unsub) unsub(); };
  }, [navigate]);
}
