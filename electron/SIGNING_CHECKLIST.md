# Niyoq Desktop — Code Signing & Distribution Checklist

> Turnkey instructions for shipping the **Niyoq.app** desktop client.
> Last updated: 2026-06-09 — most of the config is already in `package.json`; you only need to do the one-time Apple/Microsoft enrollment.

---

## Part A — macOS (Apple Developer Program)

### A1. One-time enrollment (~30 min, $99/year)

1. Go to https://developer.apple.com/programs/enroll/ and sign in with the Apple ID you want associated with Avadeti Media.
2. Choose **Company / Organization** enrollment (gives "Developer ID Application: Avadeti Media (TEAMID)" certificates which signal real-company trust to macOS).
3. You'll need a DUNS number for the company. Free lookup at https://www.dnb.com/duns-number/lookup.html — request one if Avadeti Media doesn't have it yet (takes 1–30 days).
4. Pay the $99 USD annual fee. Wait for Apple to confirm enrollment (a few hours to a few days).
5. Note down:
   - **Team ID** (10-character alphanumeric, e.g. `A1B2C3D4E5`)
   - **Apple ID email** used for the developer account
   - **App-specific password**: Generate at https://appleid.apple.com/account/manage → Sign-In and Security → App-Specific Passwords → "+" → name it "Niyoq Notarization". You'll get a 16-character password like `abcd-efgh-ijkl-mnop`.

### A2. Create the Developer ID certificate

1. In Xcode → Settings → Accounts → add your Apple ID → "Manage Certificates…" → "+" → **Developer ID Application**.
2. Verify it shows in **Keychain Access** under "login" keychain as `Developer ID Application: Avadeti Media (TEAMID)`.

### A3. Configure the build

Edit `electron/package.json` → `build.mac`:

```json
"mac": {
  "category": "public.app-category.business",
  "icon": "assets/icon.icns",
  "identity": "Developer ID Application: Avadeti Media (TEAMID)",
  "hardenedRuntime": true,
  "gatekeeperAssess": false,
  "entitlements": "build/entitlements.mac.plist",
  "entitlementsInherit": "build/entitlements.mac.plist",
  "notarize": { "teamId": "TEAMID" },
  ...
}
```

Replace `TEAMID` with the 10-char Team ID from step A1.5.

### A4. Build and notarize

```bash
cd electron

# Export credentials (these don't go in git)
export APPLE_ID="your-developer-apple-id@avadeti.com"
export APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
export APPLE_TEAM_ID="TEAMID"

# Build + sign + notarize + staple (all in one command)
npm run build:mac
```

The build takes 5–15 minutes the first time because notarization round-trips to Apple. You'll see:
- `signing Niyoq.app`
- `notarizing Niyoq.app`
- `notarization successful`
- `stapling Niyoq.app`

Output: `dist/Niyoq-1.0.0-arm64.dmg` and `dist/Niyoq-1.0.0.dmg` (x64).

### A5. Verify the signature

```bash
# Should print "accepted" with "source=Notarized Developer ID"
spctl -a -t exec -vvv dist/mac-arm64/Niyoq.app
codesign -vvv --deep --strict dist/mac-arm64/Niyoq.app
```

### A6. Distribute

Upload the `.dmg` files to:
- Avadeti Media internal Drive / Dropbox / S3 bucket
- A page on airanva.com/download (recommended — link from the app's onboarding)

Users double-click the DMG, drag Niyoq.app to Applications, launch — no Gatekeeper warnings.

---

## Part B — Windows (EV code-signing cert)

### B1. Cost vs. UX tradeoff

| Option | Cost | UX |
|---|---|---|
| **EV cert from Sectigo / DigiCert** | $250–500/yr | No SmartScreen warning; trust earned immediately |
| **Standard OV cert** | $80–250/yr | SmartScreen until ~3000 downloads build reputation (slow for internal use) |
| **Unsigned** | Free | "Windows protected your PC" → user must click "More info" → "Run anyway" |

**Recommendation for 15–20 user internal rollout:** ship unsigned with a clear "first launch override" instruction. The EV cert only pays off if you start distributing publicly.

### B2. If you go EV

1. Buy from Sectigo or DigiCert (Sectigo is cheapest at ~$250/yr).
2. They ship a USB token with the private key (you can't extract it — a hardware requirement of EV).
3. Plug the token into the build machine. Install the vendor's middleware (eTokenSafeNet).
4. Add to `electron/package.json` → `build.win.signingHashAlgorithms` and use electron-builder's `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` env vars at build time.
5. Build: `npm run build:win` produces `dist/Niyoq-Setup-1.0.0.exe` (signed).

### B3. If you ship unsigned

Just `npm run build:win` works as-is. Document for users:

> Windows will show "Windows protected your PC" the first time. Click **More info** → **Run anyway**. This only happens once per machine.

---

## Part C — Linux (no signing required)

`.AppImage` and `.deb` builds just work:

```bash
cd electron
npm run build:linux
```

Distribute `dist/Niyoq-1.0.0.AppImage`. Users `chmod +x` and double-click.

**Reminder:** for app-usage tracking to work on X11 Linux, users need `xprop` and `xdotool` installed (see WFH_TRACKING_MINDMAP.md §7.2).

---

## Part D — Auto-update (future)

Once builds are signed, you can wire `electron-updater` to serve updates from airanva.com. Out of scope for this checklist — see https://www.electron.build/auto-update when you want it.

---

## Pre-flight checklist (every release)

- [ ] Bump version in `electron/package.json` (e.g. `1.0.0` → `1.0.1`)
- [ ] Test in dev: `cd electron && npm start` — confirm screenshot, app-usage, idle tracking all work end-to-end
- [ ] Build all three platforms (or at least mac + win for now)
- [ ] Verify signature on macOS build (Part A5)
- [ ] Test installing the signed build on a fresh user machine
- [ ] Upload to distribution channel
- [ ] Post download link in #general (or wherever)

---

## Useful commands

```bash
# Check what's currently in the dist/ folder
ls -lh electron/dist/

# Clean rebuild
rm -rf electron/dist electron/node_modules
cd electron && npm install && npm run build:mac

# Verify notarization is valid (mac)
xcrun stapler validate electron/dist/mac-arm64/Niyoq.app

# Test that an unsigned mac build is the problem (debug aid)
spctl --master-disable    # Allow anything; turn OFF Gatekeeper temporarily
# Try launching Niyoq.app
spctl --master-enable     # Turn Gatekeeper back on
```
