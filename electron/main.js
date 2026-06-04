const { app, BrowserWindow, Notification, ipcMain, shell, desktopCapturer, powerMonitor, nativeImage } = require('electron');
const path = require('path');

// ═══ Configuration ═══
// Default to production; switch to local dev with `APP_URL=http://localhost:3001 npm start`
const APP_URL = process.env.APP_URL || 'https://airanva.com';
const isDev = !app.isPackaged;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Niyoq',
    backgroundColor: '#0A0B1A',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.loadURL(APP_URL);

  // External links open in the user's default browser, not in the app frame
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(APP_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Flag the web app so it knows it's running inside Electron
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`window.__ELECTRON__ = true;`);
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ═══ Native bridges (exposed to React via preload.js) ═══

// Desktop notifications routed through the OS
ipcMain.on('show-notification', (event, data) => {
  if (Notification.isSupported()) {
    const notif = new Notification({
      title: data.title || 'Niyoq',
      body: data.body || data.message || '',
      icon: path.join(__dirname, 'assets', 'icon.png'),
      silent: false
    });
    notif.on('click', () => {
      mainWindow?.show();
      mainWindow?.focus();
      if (data.url) {
        mainWindow.webContents.executeJavaScript(`window.location.href = '${data.url}';`);
      }
    });
    notif.show();
  }
});

// macOS dock badge
ipcMain.on('set-badge', (event, count) => {
  if (process.platform === 'darwin') app.setBadgeCount(count);
});

// Capture a screenshot of every connected display. Returns array of
// { id, name, displayId, dataUrl } so the renderer can pick one or
// upload them all. Quality is jpeg/0.7 to keep payload reasonable.
ipcMain.handle('niyoq:capture-screens', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1920, height: 1080 }
  });
  return sources.map(s => ({
    id: s.id,
    name: s.name,
    displayId: s.display_id,
    dataUrl: s.thumbnail.toJPEG(70).toString('base64') // jpeg base64 (no data: prefix)
  }));
});

// Capture a single primary screen — convenience for the auto-tracker.
ipcMain.handle('niyoq:capture-primary', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1920, height: 1080 }
  });
  if (!sources.length) return null;
  const primary = sources[0];
  return {
    id: primary.id,
    displayId: primary.display_id,
    capturedAt: Date.now(),
    jpegBase64: primary.thumbnail.toJPEG(70).toString('base64')
  };
});

// Seconds since the user last touched mouse/keyboard system-wide.
// Renderer can poll this every 30s to classify Active / Idle / Away.
ipcMain.handle('niyoq:get-idle-seconds', () => {
  return powerMonitor.getSystemIdleTime();
});

// Foreground app + window title. Returns null if nothing active or if the
// OS denied accessibility access (first-run prompt). Renderer polls this on
// a 15s interval and posts batches to the server.
let _activeWin = null;
try { _activeWin = require('active-win'); } catch {}
ipcMain.handle('niyoq:get-active-window', async () => {
  if (!_activeWin) return null;
  try {
    const w = await _activeWin();
    if (!w) return null;
    return {
      app: w.owner?.name || 'unknown',
      title: w.title || '',
      bundleId: w.owner?.bundleId || '',
      pid: w.owner?.processId || 0,
      ts: Date.now()
    };
  } catch { return null; }
});

// System power state — locked/unlocked/sleep/wake — useful so the renderer
// can stop the work timer if the laptop is closed.
powerMonitor.on('lock-screen',    () => mainWindow?.webContents.send('niyoq:power', 'lock'));
powerMonitor.on('unlock-screen',  () => mainWindow?.webContents.send('niyoq:power', 'unlock'));
powerMonitor.on('suspend',        () => mainWindow?.webContents.send('niyoq:power', 'suspend'));
powerMonitor.on('resume',         () => mainWindow?.webContents.send('niyoq:power', 'resume'));
