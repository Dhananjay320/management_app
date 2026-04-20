// ============================================================================
// main.js — Electron main process for Avadeti Team desktop app.
// ============================================================================
// Session 33 (Phase G part 1). This is the entry point Electron spawns.
// Responsibilities:
//   1. Create the BrowserWindow (frameless, custom titlebar)
//   2. Load the client (dev: localhost:3000, prod: bundled build)
//   3. Install app menu with platform-appropriate shortcuts
//   4. Register `avadeti://` deep-link protocol
//   5. Handle IPC from renderer — window controls, auto-start toggle, etc.
//   6. Handle second-instance events (single-instance lock)
//
// Session 34 will add:
//   - electron-updater for auto-updates
//   - Code-signing integration for trusted installers
//   - GitHub Releases feed configuration
// ============================================================================

const { app, BrowserWindow, Menu, shell, ipcMain, nativeTheme } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;
const DEV_URL = 'http://localhost:3000';
// In production, we load the static build output from `../client/build`.
// This assumes the electron-builder `files` glob includes the client build.
const PROD_INDEX = path.join(__dirname, '..', 'client', 'build', 'index.html');

let mainWindow = null;

// ─── Single-instance lock ────────────────────────────────────────────────
// If a user double-clicks the app or opens an `avadeti://` link while it's
// already running, we focus the existing window instead of spawning a new one.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      // On Windows, the deep-link URL comes as a command-line arg
      const deepLinkArg = argv.find(a => a.startsWith('avadeti://'));
      if (deepLinkArg) mainWindow.webContents.send('deep-link', deepLinkArg);
    }
  });
}

// ─── Deep link protocol ─────────────────────────────────────────────────
// Register `avadeti://` so URLs like `avadeti://meeting/abc123` can launch
// or focus the app. On macOS, the OS hands us these via `open-url`. On
// Windows/Linux, they arrive as command-line args to the second instance.
if (!app.isDefaultProtocolClient('avadeti')) {
  app.setAsDefaultProtocolClient('avadeti');
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  if (mainWindow) {
    mainWindow.webContents.send('deep-link', url);
    mainWindow.focus();
  }
});

// ─── Window creation ────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    // Frameless — we draw our own titlebar in the React app.
    // Switch to `titleBarStyle: 'hiddenInset'` on macOS to keep native
    // traffic-light buttons but remove the rest of the titlebar.
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    // Dark backdrop so the window doesn't flash white before the React app paints
    backgroundColor: '#0A0B1A',
    // Better-looking app icon on Windows/Linux
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // contextIsolation + sandbox keep the renderer as secure as a regular web page.
      // All privileged operations happen in this main process and are exposed
      // through a small, explicit API in preload.js.
      contextIsolation: true,
      sandbox: false,                // we need node for the preload; the bridge is still safe
      nodeIntegration: false,
      webSecurity: !isDev,           // allow localhost API in dev without CORS pain
    },
    show: false,   // wait for ready-to-show to avoid paint flash
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open external links (http/https) in the user's default browser, never in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(PROD_INDEX);
  }

  mainWindow.on('closed', () => { mainWindow = null; });

  // Broadcast window state changes so the custom titlebar's maximize button
  // knows whether to show "maximize" or "restore".
  const pushState = () => {
    mainWindow?.webContents.send('window-state', {
      isMaximized: mainWindow.isMaximized(),
      isFullScreen: mainWindow.isFullScreen(),
      platform: process.platform,
    });
  };
  mainWindow.on('maximize', pushState);
  mainWindow.on('unmaximize', pushState);
  mainWindow.on('enter-full-screen', pushState);
  mainWindow.on('leave-full-screen', pushState);
}

// ─── Application menu ────────────────────────────────────────────────────
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => { createWindow(); },
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },   // Undo, Redo, Cut, Copy, Paste, Select All
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        ...(isDev ? [{ role: 'toggleDevTools' }] : []),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'Documentation',
          click: () => shell.openExternal('https://github.com/avadeti/team-docs'),
        },
        {
          label: 'Report Issue',
          click: () => shell.openExternal('https://github.com/avadeti/team/issues'),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── IPC handlers (called from renderer via preload bridge) ──────────────
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.handle('window:close',    () => mainWindow?.close());
ipcMain.handle('window:state',    () => ({
  isMaximized: mainWindow?.isMaximized(),
  isFullScreen: mainWindow?.isFullScreen(),
  platform: process.platform,
}));

// Auto-start toggle. Stored in the OS login-items list via Electron's
// built-in `setLoginItemSettings`. Read the current value via `getLoginItemSettings`.
ipcMain.handle('autostart:get', () => {
  const settings = app.getLoginItemSettings();
  return { enabled: settings.openAtLogin };
});
ipcMain.handle('autostart:set', (_e, enabled) => {
  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
    // Launch hidden so users don't see the window every login
    openAsHidden: process.platform === 'darwin',
  });
  return { enabled: Boolean(enabled) };
});

// Theme detection — lets the renderer pick dark/light variants based on OS.
ipcMain.handle('theme:get', () => nativeTheme.shouldUseDarkColors ? 'dark' : 'light');

// Version info for the About dialog in the app.
ipcMain.handle('app:version', () => ({
  version: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  platform: process.platform,
  arch: process.arch,
}));

// ─── App lifecycle ──────────────────────────────────────────────────────
app.whenReady().then(() => {
  buildMenu();
  createWindow();

  app.on('activate', () => {
    // macOS: re-create window when the dock icon is clicked with no windows open
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // macOS apps typically stay running until explicitly quit
  if (process.platform !== 'darwin') app.quit();
});
