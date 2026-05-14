# Session 33 — Electron Wrapper (Phase G, Part 1)

**Status: ✅ Build-verified.** Client: 319.10 kB main.js (+551 B), 34.39 kB CSS (+190 B). Electron main + preload syntax-verified; package.json validated.

First of two Phase G sessions. Turns the Niyoq web app into a proper desktop app — frameless window with custom titlebar, OS-native menu, single-instance lock, `niyoq://` deep links, auto-start at login, and installers for Windows/macOS/Linux.

---

## What's in this zip

```
electron/                              ← NEW top-level folder (sibling to client/ and server/)
├── main.js                            Electron main process (window + menu + IPC + deep links)
├── preload.js                         Context-isolated bridge for window.electron.*
├── package.json                       electron-builder config + dev/build scripts
├── README.md                          dev + build instructions
└── assets/
    └── entitlements.mac.plist         Hardened-runtime entitlements for macOS

client/src/
├── components/
│   ├── ElectronTitleBar.js            (NEW) custom 36px frameless titlebar
│   ├── ElectronTitleBar.css           (NEW)
│   └── layout/AppLayout.js            (patched) mounts titlebar + useDeepLink
└── hooks/
    └── useDeepLink.js                 (NEW) niyoq:// URL → react-router navigate
```

**9 files total: 1 patched + 8 new.** Zero new npm dependencies on the client side.

---

## What it does

### 1. Proper desktop app packaging

`electron-builder` config produces:

| Platform | Targets |
|---|---|
| macOS | `.dmg` + `.zip` — both `arm64` and `x64` |
| Windows | NSIS installer (`.exe`) + portable `.exe` |
| Linux | `AppImage` + `.deb` |

All share the same `main.js` / `preload.js` / client build.

### 2. Frameless window + custom titlebar

- Window is frameless (`frame: false`) — we draw our own 36-px titlebar inside the React app
- **macOS**: uses `titleBarStyle: 'hiddenInset'` so native traffic-light buttons (red/yellow/green) stay visible; our titlebar reserves 84 px of padding on the left so they don't overlap our brand label
- **Windows / Linux**: our titlebar includes SVG minimize / maximize / close buttons with correct hover states (close goes red)
- Entire titlebar is draggable via CSS `-webkit-app-region: drag`
- Auto-updates "maximize" vs "restore" icon when window state changes
- Hides in fullscreen

### 3. OS-native menu bar

Platform-appropriate template:

- **macOS**: app-name menu (About, Services, Hide, Quit) + File / Edit / View / Window / Help
- **Windows/Linux**: File (New Window, Exit) / Edit / View / Window / Help
- **Dev-only entry**: "Toggle Developer Tools" inside View
- Help menu links to external docs + issue tracker (opens in default browser)

### 4. Single-instance lock

Only one window of the app runs at a time:

- Double-clicking the icon or opening an `niyoq://` link while running → focuses the existing window
- Second instance process quits immediately
- Deep-link URL from the new process gets forwarded into the running one

### 5. `niyoq://` deep links

OS-level URL protocol. Click `niyoq://meetings/abc123` anywhere (email, Slack, browser) → the app opens (or focuses) and navigates to `/meetings/abc123`.

Wiring:

- `main.js` registers via `app.setAsDefaultProtocolClient('niyoq')`
- Deep link arrives via `open-url` (macOS) or as an argv entry in `second-instance` (Windows/Linux)
- Forwarded into renderer as an IPC `deep-link` event
- `preload.js` exposes `window.electron.onDeepLink(cb)` for the renderer
- `useDeepLink` hook parses the URL and calls `navigate(path + search)`

### 6. Auto-start at login

Via Electron's built-in `setLoginItemSettings`:

- `window.electron.autoStart.get()` → `{ enabled: bool }`
- `window.electron.autoStart.set(true)` → enables; launches hidden on macOS
- Stored in the OS login-items list; persists across app updates

Not wired into any UI yet — ready for a Settings page to expose it.

### 7. Open external links in default browser

Any `http://` or `https://` link the app opens via `window.open` or `_blank` is redirected to the user's default browser via `shell.openExternal`. Prevents the app from becoming a mini-browser for random web pages.

### 8. Security

- `contextIsolation: true` — renderer has no access to Node
- `sandbox: false` but `nodeIntegration: false` — preload can use Node, renderer cannot
- All main-process capabilities exposed through a tiny, explicit API in preload.js
- Each IPC method has a named handler in main.js

---

## Electron → Renderer API surface

Everything the React app can call from the renderer:

```ts
window.electron = {
  platform: 'darwin' | 'win32' | 'linux',

  window: {
    minimize(): Promise<void>,
    maximize(): Promise<void>,   // toggles
    close(): Promise<void>,
    state(): Promise<{ isMaximized, isFullScreen, platform }>,
    onStateChange(cb): () => void,  // returns unsubscribe
  },

  autoStart: {
    get(): Promise<{ enabled: boolean }>,
    set(enabled: boolean): Promise<{ enabled: boolean }>,
  },

  app: {
    version(): Promise<{ version, electron, chrome, node, platform, arch }>,
  },

  theme: {
    get(): Promise<'dark' | 'light'>,
  },

  onDeepLink(cb): () => void,  // (url: string) => void
}
```

Calls no-op in the browser (everything checks `window.electron`). The app works identically in a regular browser — the Electron features just silently don't appear.

---

## Integration steps

**Prerequisite:** Sessions 1–32 integrated. A working React client at `client/` and Node server at `server/`.

### 1. Place the `electron/` folder

Drop the entire `electron/` folder from the zip as a **sibling** to your existing `client/` and `server/`:

```
niyoq/
├── client/
├── server/
└── electron/     ← here
```

### 2. Copy client-side files

```
client/src/components/ElectronTitleBar.js          (new)
client/src/components/ElectronTitleBar.css         (new)
client/src/hooks/useDeepLink.js                    (new)
client/src/components/layout/AppLayout.js          (replace)
```

### 3. Install Electron deps

```bash
cd electron
npm install
```

This installs `electron@^28`, `electron-builder@^24.9.1`, `concurrently`, and `wait-on`.

### 4. (Optional) Drop in icons

Put two files in `electron/assets/`:

- `icon.png` — 512×512 transparent PNG (Linux + fallback)
- `icon.ico` — Windows multi-resolution (16/24/32/48/64/128/256)

If these are missing, the build still works but uses Electron's default icon.

### 5. Run in dev mode

```bash
cd electron
npm run dev
```

Launches all three (client dev server, API server, Electron). Hot reload works.

### 6. Build installers

```bash
cd electron
npm run build         # auto-detects OS
# or specifically:
npm run build:win
npm run build:mac
npm run build:linux
```

Output in `electron/dist/`.

### 7. Verify

**In dev:**

- Window opens with a 36-px dark titlebar at the top
- Title reads "Niyoq"
- On Windows/Linux: min/max/close buttons on the right; close hovers red
- On macOS: native traffic lights appear on the left; our titlebar reserves space for them
- Menu bar shows File / Edit / View / Window / Help (plus app menu on macOS)
- View → Toggle Developer Tools opens DevTools
- Cmd/Ctrl+R reloads
- Drag the titlebar → window moves
- Double-click titlebar → maximize/restore toggle

**Deep link test (macOS):**

- Open Terminal and run: `open 'niyoq://meetings/test123'`
- App opens (or focuses if already running)
- Navigates to `/meetings/test123`

**Deep link test (Windows):**

- Open CMD or PowerShell: `start niyoq://meetings/test123`
- Same result

**Single-instance lock:**

- Launch the app
- Launch it again (double-click icon, or `niyoq://` link) → focuses existing window, no second window opens

**Production build smoke-test:**

```bash
cd client && npm run build
cd ../electron && npm start
```

The window should load the bundled `client/build/index.html` and work identically.

---

## Key design decisions

### Why frameless with a custom titlebar?

Native Electron titlebars look inconsistent across platforms — Windows has its own chrome, macOS looks fine, Linux varies by DE. A custom titlebar:

- Matches our app's glass aesthetic (dark, translucent, with the indigo/violet accent)
- Gives us a place to put our brand name and (in the future) status indicators
- Fixes the weird white flash on Windows when the window first appears

macOS keeps native traffic lights because those are deeply muscle-memory for Mac users; we just inset our drag region to make room.

### Why `sandbox: false`?

The preload script uses Node APIs (`ipcRenderer`, `contextBridge`). Electron's sandbox option disables Node in the preload too — which would prevent our bridge from existing. We keep `nodeIntegration: false` + `contextIsolation: true` which gives us the same renderer-side security: the React app has no Node access, only the bridge methods we explicitly expose.

### Why `extraResources` instead of bundling client/build inside the app?

`electron-builder` supports both. `extraResources` keeps `client/build` as a static folder next to the Electron binary, which:

- Speeds up the build (no asar repackaging of client assets)
- Makes it possible to hot-patch the client without rebuilding Electron
- Simplifies debugging in a release build — you can inspect the shipped files directly

Trade-off: someone with access to the install directory can see the React source. Since our client is going to run in a browser anyway (where "source" means the minified `main.js`), this isn't a meaningful security regression.

### Why `titleBarStyle: 'hiddenInset'` on macOS only?

`hiddenInset` is macOS-specific. It hides the titlebar chrome but keeps the native window controls (red/yellow/green circles) that Mac users expect. On Windows and Linux there's no equivalent of those buttons — a "hiddenInset"-style thing would just leave an empty 80 px gap on the left. So: `hidden` everywhere else.

### Why a hook for deep links (`useDeepLink`) instead of wiring them in `main.js`?

The URL parsing and navigation logic needs the React Router's `useNavigate`. That hook only works inside a component. Doing it in a component ensures:

- Route changes follow the same code path as in-app links
- History state integrates properly (back button works)
- Future auth-guarded routes redirect correctly

Tradeoff: it has to be mounted once (we do it in `AppLayout`). If you have multiple layouts, mount it in each — it unsubscribes cleanly so it's safe.

### Why not register the protocol on every startup?

`setAsDefaultProtocolClient` is persistent across OS reboots. Registering on every launch causes a brief permission-ish prompt on some OSes. We guard with `isDefaultProtocolClient` and register only once.

### Why open external links in the default browser?

Users expect "click link → my browser opens". If we let them open inside the Electron window:

- No password autofill (different browser profile)
- No existing login sessions
- No browser extensions (ad-blockers, 1Password, etc.)
- Users could get stuck in an in-app webview with no obvious way back

`shell.openExternal` is the universal fix — every serious Electron app does this.

---

## Known tradeoffs

- **No auto-updater yet.** Session 34 adds that. For now, users download new installers manually.
- **No code signing yet.** Windows will warn "Unknown Publisher" at install. macOS will quarantine the app (users have to right-click → Open the first time, or disable Gatekeeper). Fine for internal testing; sign before distributing publicly.
- **Icons are user-supplied.** `assets/icon.png` and `icon.ico` aren't in the zip because there's no canonical brand asset. Build works without them (Electron's default icon appears).
- **Deep-link protocol is registered system-wide.** On macOS this works out of the box. On Windows, the registry entry is per-user, not system-wide — so per-user installs (the NSIS default) are correct, but system-wide installs would need `perMachine: true` in the NSIS config.
- **No "launch on startup" UI.** The IPC handlers are in place (`autoStart.get`, `autoStart.set`) but no Settings page is wired to them. Add a toggle in a Settings page whenever you build one.
- **Custom titlebar doesn't show meeting/call status.** Could show a live indicator dot for incoming notifications. Post-MVP.
- **The "1 live" whiteboard badge works the same as in browser.** Socket traffic is unchanged — Electron is just a window.
- **No tray icon.** Could minimize-to-tray instead of close. Not a v1 feature.
- **No window state persistence.** Window position + size reset to defaults on relaunch. `electron-window-state` package fixes this in ~10 lines.
- **No native notifications yet.** The in-app toasts (Session 12) still work in Electron, but we don't post OS-level notifications. Could wire `new Notification(title, { body })` easily.

---

## What's next

**Session 34 — the final session** — wraps the project:

1. **electron-updater integration** — auto-download + install new releases from a GitHub Releases feed (or self-hosted)
2. **Code signing** — `CSC_LINK` + `CSC_KEY_PASSWORD` for Windows; Developer ID + notarization for macOS
3. **"Check for updates" menu entry** — manual trigger + background poll every 6 h
4. **Release workflow** — GitHub Action that builds for all three platforms on tag push
5. **CHANGELOG and versioning conventions** — semver bumps, auto-generated release notes

After S34, the entire Niyoq rebuild is complete.

---

## Progress map

| Phase | Sessions | Status |
|---|---|---|
| A — Foundation | 1, 2, 3 | ✅ |
| B — Security | 4, 5 | ✅ |
| C — Broken repairs | 6–9 | ✅ |
| D — Cross-cutting | 10–17 | ✅ |
| E — Module restyles | 18–23 | ✅ |
| F — New features | 24–32 | ✅ |
| **G — Electron** | **33**, 34 | 🟡 **1/2 done** |

**33 of 34 sessions complete (97%).** One more session and the project is done.

Say **"next"** for Session 34 — the final session: auto-updater + signed builds + release workflow.
