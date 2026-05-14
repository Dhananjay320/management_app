const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  showNotification: (data) => ipcRenderer.send('show-notification', data),
  setBadge: (count) => ipcRenderer.send('set-badge', count),
  isElectron: true
});
