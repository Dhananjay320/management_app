# Niyoq — Mobile App

## How Push Notifications Work

```
Phone App (Expo Build + google-services.json)
  → Expo registers with FCM automatically
  → Gets an Expo Push Token
  → Sends token to backend via /api/v1/push/subscribe
  → When something happens (message, task, meeting, etc.)
  → Backend creates Notification → triggers post-save hook
  → Sends to Expo Push API → Expo routes to FCM → Phone shows notification
```

**No Firebase service account needed.** Expo Push Service handles FCM routing.

## Quick Start (Development)

```bash
cd mobile
npm install
npx expo start
```

Scan QR with **Expo Go** on your Android phone.

## Build Preview APK (Share with team)

```bash
# One-time: login to Expo
npx eas login

# One-time: configure EAS
npx eas build:configure

# Build APK
npx eas build --platform android --profile preview
```

This creates an `.apk` file you can share directly — no Play Store needed.

## Build for Play Store

```bash
npx eas build --platform android --profile production
```

Creates an `.aab` file for Play Store upload.

## Configuration

1. `google-services.json` — already in this folder (from Firebase Console)
2. `app.json` — package name: `com.niyoqmedia.niyoqteam`
3. `App.js` — change `APP_URL` and `API_URL` to your server address

## Important

- Replace `APP_URL` in App.js with your deployed server URL before building
- Push notifications only work on physical devices, not emulators
- Assets in `/assets/` are placeholders — replace with real app icons before Play Store
