# Niyoq — Desktop (Electron)

Desktop wrapper for the Niyoq app. Runs the React client inside a
native window with an OS-level menu bar, deep links, and auto-start.

## Folder layout

Put this folder **as a sibling** to your existing `client/` and `server/`:

```
niyoq/
├── client/          (your existing React app)
├── server/          (your existing Node/Express API)
└── electron/        ← THIS FOLDER
    ├── main.js
    ├── preload.js
    ├── package.json
    ├── assets/
    │   ├── icon.png          (512×512 PNG — you provide)
    │   ├── icon.ico          (Windows icon — you provide)
    │   └── entitlements.mac.plist
    └── README.md
```

## One-time setup

```bash
cd electron
npm install
```

## Development

Runs client + server + Electron in one terminal:

```bash
npm run dev
```

This uses `concurrently` to:
1. `cd ../client && npm start` (React dev server on :3000)
2. `cd ../server && npm run dev`
3. `wait-on http://localhost:3000 && electron .` (launches Electron after the client is ready)

The Electron window loads `http://localhost:3000` — hot reloading works as normal.
DevTools open automatically in a detached panel.

## Start just Electron (against a running client)

```bash
npm start
```

## Production build

Builds the React client, then packages Electron into a platform-native installer:

```bash
npm run build          # auto-detects your current OS
npm run build:win      # .exe installer + portable .exe
npm run build:mac      # .dmg + .zip (arm64 + x64)
npm run build:linux    # AppImage + .deb
```

Output lands in `electron/dist/`.

The `prebuild` script runs `cd ../client && npm run build` first, and
`electron-builder` bundles the resulting `client/build` folder into the installer
via the `extraResources` config in `package.json`.

## Code signing

Not configured in Session 33. Session 34 adds:

- Windows: `CSC_LINK` (path to .pfx) + `CSC_KEY_PASSWORD` env vars
- macOS: Developer ID certificate + `@electron/notarize` for notarization

Until then, Windows will warn users about "Unknown Publisher" and macOS
will quarantine the app. Fine for internal testing; ship Session 34 before
distributing externally.

## Icons

You'll need to provide:

- `assets/icon.png` — 512×512 transparent PNG (used on Linux + as a fallback)
- `assets/icon.ico` — Windows multi-resolution .ico (16, 24, 32, 48, 64, 128, 256)

macOS uses the PNG (electron-builder generates the .icns automatically).

If these files are missing, the build still succeeds but uses Electron's
default icon. You can generate them from any 1024×1024 PNG with a tool like
[electron-icon-builder](https://www.npmjs.com/package/electron-icon-builder).

## Deep links

The app registers `niyoq://` as a URL protocol. Examples:

- `niyoq://meetings/abc123` → opens the app and navigates to `/meetings/abc123`
- `niyoq://whiteboards/xyz` → opens whiteboard xyz

On the client side, the `useDeepLink()` hook (mounted in `AppLayout.js`)
catches these and calls `navigate(path)` on the React Router.

## Features enabled

- **Single-instance lock** — double-clicking the icon focuses the running window
- **Frameless window with custom titlebar** — see `client/src/components/ElectronTitleBar.js`
- **Auto-start at login** — togglable via `window.electron.autoStart.set(true)`
- **OS-native menu bar** — File / Edit / View / Window / Help
- **Open external links in default browser** — no more in-app webview
- **Dark backdrop** (`#0A0B1A`) during initial load — no white paint flash

## Troubleshooting

**"Cannot find module 'electron'"** — run `npm install` inside `electron/`.

**Blank window on launch** — check that `http://localhost:3000` is running.
The Electron window loads that URL; if the client hasn't compiled yet,
you'll see a blank page until it does.

**Production build shows blank** — the `extraResources` path assumes
`client/build` exists. Run `cd ../client && npm run build` first, or use
`npm run build` from the electron folder (the `prebuild` script does it).

**DevTools open in dev but not in prod** — by design (`isDev` check). Add
`mainWindow.webContents.openDevTools()` unconditionally while debugging.
