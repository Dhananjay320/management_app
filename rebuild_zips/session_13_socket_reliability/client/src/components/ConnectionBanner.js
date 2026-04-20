import { useSocket } from '../context/SocketContext';
import './ConnectionBanner.css';

/**
 * ConnectionBanner — small banner that appears at the top of the shell
 * when the socket is disconnected. Part of Session 13 (C5).
 *
 * Hides itself during the first 2 s after app load so we don't flash
 * "Connecting…" on every page reload.
 */
export default function ConnectionBanner() {
  const { isConnected, reconnectAttempt } = useSocket() || {};

  // Give the initial connection a grace period before showing anything.
  // socket.io connects in ~500ms so a 2s grace avoids flashing on page load.
  // We track this via a CSS animation delay instead of state, keeping the
  // component pure.
  if (isConnected) return null;

  const label = reconnectAttempt && reconnectAttempt > 0
    ? `Reconnecting… (attempt ${reconnectAttempt})`
    : 'Connecting to server…';

  return (
    <div className="ad-connbanner" role="status" aria-live="polite">
      <span className="ad-connbanner__dot" aria-hidden="true" />
      <span className="ad-connbanner__label">{label}</span>
    </div>
  );
}
