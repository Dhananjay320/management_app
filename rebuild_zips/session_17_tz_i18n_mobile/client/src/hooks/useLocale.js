// ============================================================================
// useLocale — react-glue for the i18n module.
// ============================================================================
// Session 17 (C7). Reads user.settings.locale and calls setLocale() on it.
// Also exposes `t` / `formatDate` / `formatNumber` via a hook for components
// that want them from context, though you can also import them directly.
// ============================================================================

import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { setLocale, getLocale, t, formatDate, formatNumber } from '../i18n';

export function useLocale() {
  const { user } = useAuth();
  const preferred = user?.settings?.locale || 'en';

  useEffect(() => {
    setLocale(preferred);
  }, [preferred]);

  return { locale: getLocale(), t, formatDate, formatNumber };
}
