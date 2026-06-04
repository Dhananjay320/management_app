const { contextBridge, ipcRenderer } = require('electron');

// Surfaces a small, audited API to the renderer (React app). Everything the
// web app can do natively goes through here so contextIsolation stays on
// (more secure — the renderer can't reach raw `require` or `process`).
contextBridge.exposeInMainWorld('niyoqDesktop', {
  // Available everywhere
  isElectron: true,
  platform: process.platform,
  version: process.versions.electron,

  // Notifications + badge — used by the existing NotificationToast
  showNotification: (data) => ipcRenderer.send('show-notification', data),
  setBadge: (count) => ipcRenderer.send('set-badge', count),

  // Screen capture — for the sys workspace tab and (later) the auto-tracker
  captureScreens:  () => ipcRenderer.invoke('niyoq:capture-screens'),
  capturePrimary: () => ipcRenderer.invoke('niyoq:capture-primary'),

  // System idle time in seconds. The renderer polls this to determine
  // Active / Idle / Away states.
  getIdleSeconds: () => ipcRenderer.invoke('niyoq:get-idle-seconds'),

  // Foreground app / window title — used by the app-usage tracker
  getActiveWindow: () => ipcRenderer.invoke('niyoq:get-active-window'),

  // Subscribe to power-state changes (lock/unlock/sleep/wake)
  onPowerState: (handler) => {
    const wrapped = (_event, state) => handler(state);
    ipcRenderer.on('niyoq:power', wrapped);
    return () => ipcRenderer.removeListener('niyoq:power', wrapped);
  }
});

// Keep the older name working so existing client code that referenced
// window.electronAPI doesn't break.
contextBridge.exposeInMainWorld('electronAPI', {
  showNotification: (data) => ipcRenderer.send('show-notification', data),
  setBadge: (count) => ipcRenderer.send('set-badge', count),
  isElectron: true
});
