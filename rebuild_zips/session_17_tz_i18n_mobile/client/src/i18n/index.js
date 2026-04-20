// ============================================================================
// i18n.js — minimal translation scaffolding.
// ============================================================================
// Session 17 (C7). We intentionally don't pull in react-intl or i18next yet —
// both add ~40 KB and we ship English-only at Session 17. This tiny module
// lets us start using `t('key')` everywhere now. When a second locale is
// actually added, we can swap this for a library without changing call sites.
//
// Usage:
//   import { t } from '../i18n';
//   <button>{t('common.save')}</button>
//   <span>{t('greeting.hi', { name: user.name })}</span>
//
// Locale switching is Session 17+; for now locale is hardcoded to 'en' but
// already reads user.settings.locale so the migration path is painless.
// ============================================================================

import { messages as enMessages } from './locales/en';

// Locale catalogs. Add new languages by adding files under ./locales/ and
// importing them here.
const CATALOGS = {
  en: enMessages,
};

let currentLocale = 'en';

export function setLocale(locale) {
  if (CATALOGS[locale]) currentLocale = locale;
}

export function getLocale() {
  return currentLocale;
}

/**
 * Look up a translation key.
 * Returns the key itself (as a visible placeholder) if missing — easier to
 * spot untranslated strings in dev than silently rendering empty.
 *
 * Supports {name} interpolation:
 *   t('greeting.hi', { name: 'Ravi' }) -> 'Hi, Ravi'
 *
 * Supports plural via `one` / `other` suffix:
 *   catalog: { 'tasks.count.one': '1 task', 'tasks.count.other': '{count} tasks' }
 *   t('tasks.count', { count: 1 }) -> '1 task'
 *   t('tasks.count', { count: 5 }) -> '5 tasks'
 */
export function t(key, values = {}) {
  const catalog = CATALOGS[currentLocale] || CATALOGS.en;

  // Pluralization
  if (typeof values.count === 'number') {
    const suffix = values.count === 1 ? 'one' : 'other';
    const pluralKey = `${key}.${suffix}`;
    if (catalog[pluralKey] !== undefined) {
      return interpolate(catalog[pluralKey], values);
    }
  }

  if (catalog[key] !== undefined) {
    return interpolate(catalog[key], values);
  }

  // Fallback: show the key so missing strings are obvious in dev.
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[i18n] missing key: ${key}`);
  }
  return key;
}

function interpolate(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (_, k) =>
    values[k] !== undefined ? String(values[k]) : `{${k}}`
  );
}

// ─── Convenience locale-aware formatters ───────────────────────────────────

/**
 * Format a date according to the user's locale.
 * options follows Intl.DateTimeFormat signature.
 */
export function formatDate(date, options = { dateStyle: 'medium' }) {
  try {
    return new Intl.DateTimeFormat(currentLocale, options).format(new Date(date));
  } catch {
    return String(date);
  }
}

/**
 * Format a number according to the user's locale.
 */
export function formatNumber(n, options) {
  try {
    return new Intl.NumberFormat(currentLocale, options).format(n);
  } catch {
    return String(n);
  }
}
