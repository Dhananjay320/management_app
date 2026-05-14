const { app, BrowserWindow, Notification, ipcMain, shell } = require('electron');
const path = require('path');

// ═══ Configuration ═══
const APP_URL = process.env.APP_URL || 'https://example.com';
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
    titleBarStyle: 'hiddenInset', // macOS: clean title bar
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.loadURL(APP_URL);

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(APP_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Show native desktop notifications
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`
      // Override the web notification API to use Electron native notifications
      window.__ELECTRON__ = true;
    `);
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

// Handle push notifications from the web app via IPC
ipcMain.on('show-notification', (event, data) => {
  if (Notification.isSupported()) {
    const notif = new Notification({
      title: data.title || 'Niyoq',
      body: data.body || data.message || '',
      icon: path.join(__dirname, 'assets', 'icon.png'),
      silent: false
    });

    notif.on('click', () => {
      mainWindow.show();
      mainWindow.focus();
      if (data.url) {
        mainWindow.webContents.executeJavaScript(`window.location.href = '${data.url}';`);
      }
    });

    notif.show();
  }
});

// Badge count (macOS dock)
ipcMain.on('set-badge', (event, count) => {
  if (process.platform === 'darwin') {
    app.setBadgeCount(count);
  }
});
