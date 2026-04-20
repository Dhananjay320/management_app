// ============================================================================
// notarize.js — electron-builder afterSign hook for macOS notarization.
// ============================================================================
// Session 34. Runs automatically after electron-builder signs the .app
// bundle. Submits the signed bundle to Apple's notarization service,
// which is required for any macOS app distributed outside the App Store.
// Without notarization, macOS Gatekeeper will refuse to run the app on
// first launch (user sees "app is damaged" or has to right-click → Open).
//
// Environment variables required (set in GitHub Actions secrets or locally):
//   APPLE_ID           — Apple ID email address
//   APPLE_APP_SPECIFIC_PASSWORD — app-specific password from appleid.apple.com
//   APPLE_TEAM_ID      — 10-character team ID from developer.apple.com
//
// Without any of these set, the hook no-ops with a warning. Useful for
// CI builds where you want the package to succeed but don't need notarization
// (e.g. nightly builds, dev previews).
// ============================================================================

const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appleIdPassword || !teamId) {
    console.warn('[notarize] Skipping — APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID not set');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`[notarize] Submitting ${appPath} to Apple. This can take 5–15 minutes…`);

  try {
    await notarize({
      tool: 'notarytool',
      appPath,
      appleId,
      appleIdPassword,
      teamId,
    });
    console.log('[notarize] ✓ Notarization succeeded');
  } catch (err) {
    // Don't throw — we still want the .dmg to be produced for inspection.
    // CI should check for the string "Notarization succeeded" in logs to
    // determine whether to actually publish.
    console.error('[notarize] ✗ Notarization failed:', err.message);
    throw err;
  }
};
