// ============================================================================
// preload.js — context bridge between renderer (React) and main (Electron).
// ============================================================================
// Session 33. The renderer (our React app) runs in a sandboxed browser
// context with `contextIsolation: true`. It has NO direct access to Node
// or Electron APIs. We expose a small, specific surface via contextBridge
// so the app can do what it needs without opening a full attack surface.
//
// Everything added to `window.electron` is available to the React app
// as `window.electron.XYZ`. Keep this surface minimal — each new IPC
// method needs a matching handler in main.js.
// ============================================================================

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // Platform info — useful for conditional UI (e.g. macOS-specific titlebar inset)
  platform: process.platform,

  // ─── Window controls ────────────────────────────────────────────────
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close:    () => ipcRenderer.invoke('window:close'),
    state:    () => ipcRenderer.invoke('window:state'),
    onStateChange: (cb) => {
      const handler = (_e, state) => cb(state);
      ipcRenderer.on('window-state', handler);
      return () => ipcRenderer.removeListener('window-state', handler);
    },
  },

  // ─── Auto-start ────────────────────────────────────────────────────
  autoStart: {
    get: () => ipcRenderer.invoke('autostart:get'),
    set: (enabled) => ipcRenderer.invoke('autostart:set', enabled),
  },

  // ─── App metadata ──────────────────────────────────────────────────
  app: {
    version: () => ipcRenderer.invoke('app:version'),
  },

  // ─── Theme (OS preference) ─────────────────────────────────────────
  theme: {
    get: () => ipcRenderer.invoke('theme:get'),
  },

  // ─── Deep links (avadeti://) ──────────────────────────────────────
  onDeepLink: (cb) => {
    const handler = (_e, url) => cb(url);
    ipcRenderer.on('deep-link', handler);
    return () => ipcRenderer.removeListener('deep-link', handler);
  },
});
