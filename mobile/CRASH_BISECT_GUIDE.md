# Niyoq Mobile — Crash Bisect Guide

> When the Android APK crashes on launch or during use, follow this guide to capture diagnostic data and isolate the cause.
> Last updated: 2026-06-09.

---

## TL;DR — fastest path

1. Plug your phone into your Mac via USB. Enable **Developer Options → USB Debugging** on the phone.
2. Run:
   ```bash
   cd /Users/avadetimedia/Desktop/management_app/mobile
   adb logcat -c                # clear old logs
   adb logcat | tee crash.log   # start streaming
   ```
3. Reproduce the crash on the phone.
4. Stop logcat with Ctrl+C. Open `crash.log` and look for:
   - `FATAL EXCEPTION` — that's the killer line, with the stack right below
   - `AndroidRuntime` — usually has the full Java stack trace
   - `Niyoq` or the package name (`com.niyoq.team`) — filter for our specific app
5. Also check **`/sys` → 🐛 Crash Reports** for any `native_hint` entries that fired before the crash.

---

## What the new (2026-06-09) reporting layer captures automatically

Even without adb, these are now logged to `/api/v1/diagnostics/crash` and visible in `/sys` → Crash Reports:

| Event | Captured by | Type |
|---|---|---|
| Uncaught JS error in the WebView | `installCrashReporter()` in `client/src/utils/crashReporter.js` | `js_error` |
| Unhandled promise rejection | same | `unhandled_promise` |
| React render-tree error | `CrashBoundary` in `client/src/components/CrashBoundary.js` | `react_error` |
| WebView `onError` (page failed to load) | mobile `App.js` → `logNativeHint` | `native_hint` |
| WebView HTTP 4xx/5xx | mobile `App.js` → `logNativeHint` | `native_hint` |
| **WebView render process died (Android Chromium crash)** | mobile `App.js` → `onRenderProcessGone` → `logNativeHint`, then auto-reloads once | `native_hint` |
| Expo module load failure | mobile `App.js` lazy-require catch | `native_hint` |

**Hard native crashes** (the Android runtime kills the process) cannot be captured by the app itself — by the time you'd handle the error, the process is gone. Use `adb logcat` for those.

---

## Hard native crash — full procedure

### 1. Prerequisites on your Mac

```bash
# Install Android platform-tools if missing
brew install --cask android-platform-tools

# Verify adb is available
adb version
```

### 2. Prepare the phone

- Open **Settings → About phone** → tap **Build number** 7 times to unlock Developer Options.
- Open **Settings → System → Developer options** → enable **USB debugging**.
- Plug the phone into the Mac. A consent dialog appears on the phone — tap **Allow**.
- Verify: `adb devices` should show your device.

### 3. Capture logs

Two ways to filter:

```bash
# A) Catch-all — captures everything, easy to find FATAL but noisy
adb logcat -c          # clear
adb logcat | tee crash.log

# B) Filter to our package + the runtime — much cleaner
adb logcat -c
adb logcat \
  AndroidRuntime:E \
  '*:S' \
  --pid="$(adb shell pidof com.niyoq.team)" \
  | tee crash.log
```

The package name for the Niyoq APK is `com.niyoq.team`. Verify in `mobile/app.json` if it ever changes.

### 4. Reproduce the crash

Do the action that causes the crash on the phone. Watch the terminal — when the app dies, you'll see something like:

```
E AndroidRuntime: FATAL EXCEPTION: main
E AndroidRuntime: Process: com.niyoq.team, PID: 12345
E AndroidRuntime: java.lang.OutOfMemoryError: ...
E AndroidRuntime:     at android.webkit.WebView...
```

Stop with Ctrl+C and open `crash.log` in a text editor.

### 5. Common causes for this app

| Symptom in logcat | Likely cause | Fix |
|---|---|---|
| `WebView render process gone` repeatedly | Chrome WebView crashing on heavy page (rare) | Try a minimal WebView build (see Section 6 below) |
| `OutOfMemoryError` in WebView | Big screenshot blob or many images in memory | Check `MyRecordedActivity` / `AdminScreenshotViewer` for unfreed object URLs |
| `Trying to invoke virtual method on null` in `expo-notifications` | Stale FCM tokens / google-services.json mismatch | Re-run `eas build` after rotating `fcm-service-account.json` |
| `couldNotDecodeImage` | Server returned garbage on a screenshot URL | Check `/uploads/sc/` permissions on VPS |
| `Permission denied` for geolocation | User denied + restored geo prompt is broken | Use the in-app re-prompt via Attendance page |
| `WebViewClient.onPageFinished` then immediate process death | JS error inside the SPA the WebView can't recover from | Check `/sys` → Crash Reports for the matching `js_error` |

### 6. Bisect by stripping the SPA

If logcat doesn't make the cause obvious, point the mobile WebView at a known-minimal page to isolate:

1. Edit `mobile/App.js` and temporarily change `APP_URL` to a static test page:
   ```js
   const APP_URL = 'https://airanva.com/health-check.html'; // or any plain HTML
   ```
2. Build a debug APK: `cd mobile && eas build --platform android --profile preview`
3. Install and run. If it doesn't crash, the bug is in the SPA. Revert `APP_URL` and bisect by URL inside the SPA (`/login` → `/calendar` → `/messages` etc.) — note which page triggers it.
4. Once you know the page, check `/sys` → Crash Reports filtered by URL.

### 7. Get the OS / device info

```bash
adb shell getprop ro.build.version.release    # Android version
adb shell getprop ro.product.model            # Device model
adb shell getprop ro.product.manufacturer
adb shell pm list packages | grep niyoq       # Verify the APK is installed
```

Drop these into the bug report — Android 6 vs Android 14 matters a lot for WebView behaviour.

---

## After you've reproduced

1. Take screenshots of:
   - The crash log (FATAL EXCEPTION block)
   - `/sys` → Crash Reports filtered by `mobile-webview`
   - Your phone's About page (OS version + manufacturer)
2. Send to me. I'll write the actual fix.

---

## Why this matters

The whole reason task #29 has been "in_progress" for weeks is that we don't have the data needed to fix it. Now we do:
- Soft errors (95% of "crash" reports) → automatically captured in `/sys` → Crash Reports
- Hard native crashes (5%, but the most painful ones) → adb logcat per this guide

Next reproduction = next fix. No more guessing.
