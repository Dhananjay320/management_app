// ============================================================================
// locales/en.js — English translations.
// ============================================================================
// Keys are dotted namespaces so they group naturally when more strings arrive.
// Keep this file alphabetical within each namespace.
//
// When you add a new translation key:
//   1. Add it here with a sensible default English string
//   2. Use it in code via `t('namespace.key')`
//   3. When we add a second locale, copy this file and translate values
// ============================================================================

export const messages = {
  // ─── Common UI strings ──────────────────────────────────────────────────
  'common.cancel':     'Cancel',
  'common.save':       'Save',
  'common.saving':     'Saving…',
  'common.delete':     'Delete',
  'common.edit':       'Edit',
  'common.close':      'Close',
  'common.loading':    'Loading…',
  'common.tryAgain':   'Try again',
  'common.search':     'Search',
  'common.yes':        'Yes',
  'common.no':         'No',
  'common.confirm':    'Confirm',
  'common.back':       'Back',
  'common.done':       'Done',

  // ─── Navigation ─────────────────────────────────────────────────────────
  'nav.home':          'Home',
  'nav.tasks':         'Tasks',
  'nav.messages':      'Messages',
  'nav.attendance':    'Attendance',
  'nav.meetings':      'Meetings',
  'nav.workspace':     'Workspace',
  'nav.email':         'Email',
  'nav.feed':          'Team Feed',
  'nav.activity':      'Activity',
  'nav.stickyNotes':   'Sticky Notes',
  'nav.salary':        'Salary',
  'nav.notifications': 'Notifications',
  'nav.settings':      'Settings',
  'nav.admin':         'Admin',

  // ─── Auth ───────────────────────────────────────────────────────────────
  'auth.signIn':          'Sign in',
  'auth.signOut':         'Sign out',
  'auth.email':           'Email',
  'auth.password':        'Password',
  'auth.forgotPassword':  'Forgot password?',
  'auth.otpLogin':        'Sign in with OTP',

  // ─── Settings ───────────────────────────────────────────────────────────
  'settings.title':         'Settings',
  'settings.timezone':      'Timezone',
  'settings.timezoneHelp':  'Times throughout the app use this zone for day boundaries (attendance, meetings, reminders).',
  'settings.locale':        'Language',
  'settings.localeHelp':    'UI language. Only English is shipped today — more coming.',

  // ─── Errors ─────────────────────────────────────────────────────────────
  'error.generic':       'Something went wrong.',
  'error.network':       'Network issue. Check your connection and try again.',
  'error.sessionExpired':'Your session expired. Please sign in again.',
  'error.noPermission':  'You don\u2019t have permission to do that.',
  'error.notFound':      'Couldn\u2019t find that.',

  // ─── Empty states ───────────────────────────────────────────────────────
  'empty.notifications': 'All caught up!',
  'empty.tasks':         'No tasks. Take a break.',
  'empty.messages':      'No messages yet.',

  // ─── Pluralizable examples ──────────────────────────────────────────────
  'tasks.count.one':       '1 task',
  'tasks.count.other':     '{count} tasks',
  'unread.count.one':      '1 unread',
  'unread.count.other':    '{count} unread',
};
