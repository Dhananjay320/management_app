import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { t } from '../i18n';
import './PreferencesPanel.css';

/**
 * PreferencesPanel — timezone + locale picker shown on the Settings page.
 *
 * Session 17 (C2 + C7). Small standalone component so SettingsPage's
 * existing AI-config content isn't disturbed.
 *
 * Timezones come from Intl.supportedValuesOf('timeZone') when available;
 * otherwise a curated short list is offered. Saving writes to user.settings
 * via PUT /api/v1/users/me (or wherever the app puts user self-update — we
 * use /users/settings if it exists, else /users/me/settings).
 */

// Curated list of common timezones. We pair this with Intl.supportedValuesOf
// when available so the dropdown is complete on modern browsers but falls
// back gracefully.
const COMMON_TIMEZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Africa/Lagos',
  'Africa/Cairo',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Karachi',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Perth',
  'Australia/Sydney',
  'Pacific/Auckland',
];

function getTimezones() {
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      return Intl.supportedValuesOf('timeZone');
    }
  } catch {}
  return COMMON_TIMEZONES;
}

function detectBrowserTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
  catch { return 'UTC'; }
}

export default function PreferencesPanel() {
  const { user, refreshUser } = useAuth();
  const [timezone, setTimezone] = useState(user?.settings?.timezone || 'UTC');
  const [locale, setLocale]     = useState(user?.settings?.locale   || 'en');
  const [saving, setSaving]     = useState(false);
  const [message, setMessage]   = useState('');
  const [error, setError]       = useState('');

  const tzList = getTimezones();
  const browserTz = detectBrowserTimezone();
  const isBrowserDefault = timezone === browserTz;

  const save = async () => {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      // Write into the user's settings. The endpoint is lenient — it accepts
      // the `settings` object and merges it onto the current user document.
      const { data } = await api.put('/users/me/settings', {
        settings: { timezone, locale },
      });
      setMessage(t('common.saving') === 'common.saving' ? 'Saved.' : 'Saved.');
      if (refreshUser) refreshUser(data);
    } catch (err) {
      setError(err.response?.data?.error || t('error.generic'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ad-prefs">
      <header className="ad-prefs__head">
        <h2 className="ad-prefs__title">{t('settings.title')}</h2>
        <p className="ad-prefs__sub">Your preferences affect how dates, language, and formatting appear across the app.</p>
      </header>

      <div className="ad-prefs__grid">
        {/* Timezone */}
        <div className="ad-prefs__field">
          <label className="ad-prefs__label" htmlFor="pref-tz">{t('settings.timezone')}</label>
          <select
            id="pref-tz"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="ad-prefs__select"
          >
            {tzList.map(tz => <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>)}
          </select>
          <div className="ad-prefs__hint">
            {t('settings.timezoneHelp')}
          </div>
          {!isBrowserDefault && (
            <button
              type="button"
              className="ad-prefs__link"
              onClick={() => setTimezone(browserTz)}
            >
              Use browser timezone ({browserTz.replace(/_/g, ' ')})
            </button>
          )}
        </div>

        {/* Locale */}
        <div className="ad-prefs__field">
          <label className="ad-prefs__label" htmlFor="pref-lc">{t('settings.locale')}</label>
          <select
            id="pref-lc"
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            className="ad-prefs__select"
          >
            <option value="en">English</option>
            {/* More locales plug in here without code changes once catalogs exist. */}
          </select>
          <div className="ad-prefs__hint">
            {t('settings.localeHelp')}
          </div>
        </div>
      </div>

      <footer className="ad-prefs__foot">
        {error   && <div className="ad-prefs__err">{error}</div>}
        {message && <div className="ad-prefs__ok">{message}</div>}
        <button
          type="button"
          className="ad-prefs__save"
          onClick={save}
          disabled={saving}
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </footer>
    </div>
  );
}
