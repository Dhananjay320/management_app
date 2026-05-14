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

---

## Session 34 — Auto-updater, signing, release workflow

### Auto-updater

Enabled automatically in packaged builds. Polls GitHub Releases every 6 hours
and also does a check ~30 seconds after launch. Users see an update toast in
the bottom-right of the app when a new version is available.

Behavior:
- Downloads happen silently in the background
- User clicks "Restart to install" in the toast, or closes the app (auto-install on quit)
- Help → Check for Updates… triggers a manual check

Config lives in `package.json` under `build.publish` (points at GitHub
releases: `niyoq/team`). Change owner/repo to match your GitHub slug.

### Windows code signing

Get an EV or OV code-signing certificate (`.pfx` file). Then:

```bash
# Base64-encode the pfx for GitHub secrets
base64 -i cert.pfx | pbcopy

# Local test (not needed for CI)
export CSC_LINK=/path/to/cert.pfx
export CSC_KEY_PASSWORD='your-pfx-password'
npm run release:win
```

GitHub Actions secrets to set:
- `CSC_LINK` — base64-encoded `.pfx`
- `CSC_KEY_PASSWORD` — the pfx password

### macOS code signing + notarization

Requires:
1. An Apple Developer account ($99/year)
2. A "Developer ID Application" certificate from https://developer.apple.com/account/resources/certificates
3. Export the cert as `.p12`, base64-encode for the `MAC_CERTS` secret
4. Generate an app-specific password at https://appleid.apple.com → Sign-In and Security → App-Specific Passwords

GitHub Actions secrets:
- `MAC_CERTS` — base64-encoded `.p12`
- `MAC_CERTS_PASSWORD` — password for the .p12
- `APPLE_ID` — your Apple ID email
- `APPLE_APP_SPECIFIC_PASSWORD` — the generated app-specific password
- `APPLE_TEAM_ID` — 10-char team ID from developer.apple.com

Notarization runs automatically via the `afterSign` hook (`notarize.js`).
If the Apple env vars aren't set, the hook skips with a warning — useful for
local builds where you want a signed app but don't need Apple's approval.

Takes 5–15 minutes on Apple's side per build.

### Cutting a release

1. Bump `version` in `electron/package.json` **and** `client/package.json`
   (they should stay in sync)
2. Update `CHANGELOG.md` under a new `## [X.Y.Z]` heading
3. `git commit -am "chore: release vX.Y.Z"`
4. `git tag vX.Y.Z && git push && git push --tags`
5. GitHub Actions picks up the tag, builds for all three platforms (~20 min)
6. A draft release appears on GitHub. Edit the notes, then click Publish.
7. Within 6 hours, users with older versions see the update toast.

### Things that can go wrong

**"Code signature invalid" on macOS first launch** — the `afterSign` hook
failed to notarize. Check Actions logs; the build artifact is still produced
but not trusted by Gatekeeper. Users can right-click → Open as a workaround
for pre-notarized test builds.

**Windows SmartScreen warning** — you have an OV cert (not EV). Builds
reputation over time; eventually SmartScreen stops warning. EV certs skip
this entirely but cost more and require a hardware token.

**"Update available" never appears** — check `package.json`'s `publish`
config matches your GitHub repo. The `latest.yml` / `latest-mac.yml` files
need to be uploaded alongside installers; electron-builder does this
automatically when you publish a release.

**Auto-updater fails silently in dev** — expected. Auto-updates only work
in packaged builds with a valid release feed. The Check for Updates menu
item shows an info dialog in dev.
