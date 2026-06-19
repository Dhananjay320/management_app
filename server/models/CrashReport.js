const mongoose = require('mongoose');

// Crash / error telemetry. Receives reports from:
//   - the web SPA's global error handlers (window.onerror, unhandledrejection)
//   - the React ErrorBoundary at the top of App.js
//   - the mobile WebView shell (which re-throws WebView errors to its host)
//   - the Electron renderer (forwards via the same window handlers)
//
// All fields are best-effort — the client may be partially broken when it
// reports, so anything required would just lose the report. TTL'd to 30 days
// because old crashes are noise once the bug is fixed.

const crashReportSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // null if not logged in
  type: {
    type: String,
    enum: ['js_error', 'unhandled_promise', 'react_error', 'native_hint'],
    default: 'js_error',
    index: true
  },
  message:    { type: String, maxlength: 1000, default: '' },
  stack:      { type: String, maxlength: 8000, default: '' },
  url:        { type: String, maxlength: 500,  default: '' },
  userAgent:  { type: String, maxlength: 500,  default: '' },
  platform:   { type: String, maxlength: 50,   default: '' }, // 'web', 'electron', 'mobile-webview', etc.
  appVersion: { type: String, maxlength: 50,   default: '' },
  // Optional extra context the client may attach: route, last action, etc.
  context:    { type: mongoose.Schema.Types.Mixed, default: {} },
  // Set by the receiving endpoint
  ip:         { type: String, maxlength: 60,   default: '' },
  resolved:   { type: Boolean, default: false, index: true },
  // 30-day TTL — fix the bug, then forget the noise
  expiresAt:  { type: Date, index: { expireAfterSeconds: 0 } }
}, { timestamps: true });

crashReportSchema.index({ createdAt: -1 });

module.exports = mongoose.model('CrashReport', crashReportSchema);
