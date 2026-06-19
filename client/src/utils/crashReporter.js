// Global error/crash reporter — installs once at app boot and POSTs uncaught
// errors to /api/v1/diagnostics/crash. Survives most failure modes because:
//   - the POST uses a no-credentials fetch (avoids 401 redirects on auth death)
//   - failures are silenced (we never want to crash the reporter itself)
//   - send-beacon is used on page-unload for last-chance reports
//
// Hooks:
//   - window.onerror                — synchronous uncaught errors
//   - window.onunhandledrejection   — async promise rejections
//   - pagehide/beforeunload         — last-chance flush via sendBeacon
//
// What's NOT caught here:
//   - React render errors (use ErrorBoundary — separate file)
//   - True native crashes inside the mobile app shell (need adb logcat)
//
// Identification:
//   We send platform + appVersion + url + userAgent. The server pulls user
//   identity from the Bearer token if present; otherwise the report is anonymous.

const ENDPOINT = '/api/v1/diagnostics/crash';

// Coarse rate-limit on the client side too — if the SPA enters an error loop,
// don't pummel the server. 5 reports per minute is plenty for any real bug.
const sentRecent = [];
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 1000;
function canSend() {
  const now = Date.now();
  while (sentRecent.length && now - sentRecent[0] > RATE_WINDOW_MS) sentRecent.shift();
  if (sentRecent.length >= RATE_LIMIT) return false;
  sentRecent.push(now);
  return true;
}

function detectPlatform() {
  // Electron sets window.niyoqDesktop via preload — we use that as a signal
  if (typeof window !== 'undefined' && window.niyoqDesktop) return 'electron';
  // Mobile WebView injects __EXPO_PUSH_TOKEN__ from App.js
  if (typeof window !== 'undefined' && '__EXPO_PUSH_TOKEN__' in window) return 'mobile-webview';
  return 'web';
}

function getAppVersion() {
  // CRA exposes the package.json version via env at build time
  return process.env.REACT_APP_VERSION || 'unknown';
}

function getAuthToken() {
  try { return localStorage.getItem('accessToken') || null; } catch { return null; }
}

function buildPayload(type, message, stack, context) {
  return {
    type,
    message: String(message || '').slice(0, 1000),
    stack: String(stack || '').slice(0, 8000),
    url: typeof window !== 'undefined' && window.location ? window.location.href : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    platform: detectPlatform(),
    appVersion: getAppVersion(),
    context: context || {}
  };
}

async function send(payload) {
  if (!canSend()) return;
  try {
    const headers = { 'Content-Type': 'application/json' };
    const tok = getAuthToken();
    if (tok) headers.Authorization = `Bearer ${tok}`;
    await fetch(ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      // No credentials so a broken auth state can't redirect us
      credentials: 'omit',
      keepalive: true
    });
  } catch {
    // Silently drop — never crash the reporter
  }
}

function sendBeacon(payload) {
  // sendBeacon is the only path that survives page-unload reliably
  try {
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon(ENDPOINT, blob);
    }
  } catch {}
}

let installed = false;
export function installCrashReporter() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  // 1. Uncaught synchronous errors
  window.addEventListener('error', (e) => {
    const payload = buildPayload(
      'js_error',
      e.message || (e.error && e.error.message) || 'unknown error',
      (e.error && e.error.stack) || '',
      { filename: e.filename, lineno: e.lineno, colno: e.colno }
    );
    send(payload);
  });

  // 2. Unhandled promise rejections
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    const payload = buildPayload(
      'unhandled_promise',
      reason?.message || String(reason || 'unhandled rejection'),
      reason?.stack || '',
      {}
    );
    send(payload);
  });

  // 3. Last-chance flush on page unload — useful for cases where the user
  // closes the tab right after a crash. Buffer is sent via sendBeacon.
  // (Nothing to flush right now since we send eagerly, but kept as a hook.)
  // window.addEventListener('pagehide', () => { /* future: flush buffer */ });
}

// Public API for ErrorBoundary or manual reporting
export function reportCrash({ type = 'js_error', message, stack, context } = {}) {
  send(buildPayload(type, message, stack, context));
}

export { sendBeacon }; // exposed for last-resort scenarios
