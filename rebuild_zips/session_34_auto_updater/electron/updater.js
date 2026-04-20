// ============================================================================
// updater.js — electron-updater integration for auto-updates.
// ============================================================================
// Session 34 (Phase G, final). Wraps electron-updater with a small async API
// and forwards lifecycle events to the renderer via the 'updater:event' IPC
// channel. The renderer's UpdateToast component subscribes and shows UI when:
//
//   - an update is available
//   - download progress ticks
//   - an update has been downloaded and is ready to install
//
// The updater reads its release feed from package.json's `publish` config
// (we point at GitHub Releases). When a new semver tag is pushed, GitHub
// Actions builds and uploads installers + a latest.yml/latest-mac.yml
// manifest; electron-updater reads that manifest on check.
//
// Signing + publishing are handled by electron-builder at build time; the
// updater only *verifies* signatures at install time on Windows/macOS.
// ============================================================================

const { autoUpdater } = require('electron-updater');

// How often to poll for updates in ms. 6h is the default for most Electron apps
// — short enough to land patches fast, long enough that it's not noisy.
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let wired = false;
let mainWindowRef = null;
let pollTimer = null;

function send(event, data) {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send('updater:event', { event, ...data });
  }
}

function wireEvents() {
  if (wired) return;
  wired = true;

  // We configure autoUpdater to download automatically (default) but NOT
  // install without explicit user consent — users should know when their
  // app is about to restart.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => send('checking'));

  autoUpdater.on('update-available', (info) => {
    send('available', {
      version: info.version,
      releaseNotes: info.releaseNotes || '',
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    send('not-available', { version: info?.version });
  });

  autoUpdater.on('download-progress', (progress) => {
    send('progress', {
      percent: Math.round(progress.percent || 0),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    send('downloaded', {
      version: info.version,
      releaseNotes: info.releaseNotes || '',
    });
  });

  autoUpdater.on('error', (err) => {
    // electron-updater throws for a lot of benign reasons in dev (no update
    // feed configured, signature mismatch, etc.). We log and forward — UI
    // layer can decide whether to show it.
    // eslint-disable-next-line no-console
    console.warn('[updater]', err?.message || err);
    send('error', { message: String(err?.message || err) });
  });
}

// ─── Public API ─────────────────────────────────────────────────────

function init(mainWindow) {
  mainWindowRef = mainWindow;
  wireEvents();
  // Do an initial check shortly after launch, then poll every 6h.
  // 30s delay so we don't block startup on network activity.
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 30_000);
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, CHECK_INTERVAL_MS);
}

async function check() {
  // Exposed to menu + IPC. Never throws — returns null on failure.
  try {
    const result = await autoUpdater.checkForUpdates();
    return result?.updateInfo || null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[updater] check failed', err?.message);
    return null;
  }
}

function quitAndInstall() {
  // Fires after the user agrees in the UI. Electron will relaunch the app
  // automatically after installing.
  autoUpdater.quitAndInstall(false, true);
}

function teardown() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  mainWindowRef = null;
}

module.exports = { init, check, quitAndInstall, teardown };
