// ============================================================================
// timezone.js — per-user timezone helpers.
// ============================================================================
// Session 17 (C2). Before this file, dates in the app were computed from
// `new Date().toISOString()` (UTC). That was wrong for any user not in UTC —
// attendance marked at 1 a.m. local (which is the previous day in UTC for
// an IST user) went on the wrong date. Meeting "upcoming vs past" cutoffs
// had the same bug.
//
// This module centralizes timezone-aware date logic so routes don't sprinkle
// Intl.DateTimeFormat calls everywhere.
//
// Uses the built-in Intl.DateTimeFormat + timeZone option — available in
// Node 14+ and backed by the same ICU tz database the rest of the world uses.
// No new dependencies needed.
// ============================================================================

/**
 * Returns the YYYY-MM-DD string for `now` in the given IANA timezone.
 * Defaults to UTC if the user hasn't set one.
 */
function dateStrInTz(tz, nowDate) {
  const now = nowDate || new Date();
  const zone = tz || 'UTC';
  try {
    // Intl formats in the target zone's local-wallclock. We assemble YYYY-MM-DD
    // from the parts so we aren't depending on locale-specific output.
    const fmt = new Intl.DateTimeFormat('en-CA', {  // en-CA gives YYYY-MM-DD
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return fmt.format(now);  // already YYYY-MM-DD
  } catch {
    // Invalid timezone string — fall back to UTC so the app keeps working.
    return now.toISOString().slice(0, 10);
  }
}

/**
 * Return today's date string (YYYY-MM-DD) in this user's timezone.
 * Safely handles users who don't have a timezone set.
 */
function userToday(user) {
  const tz = user?.settings?.timezone || 'UTC';
  return dateStrInTz(tz);
}

/**
 * Return start-of-day as a JS Date (UTC wallclock) for a given local date in
 * a user's timezone. Useful for building Mongo queries that compare against
 * `new Date()` but need a wall-clock-aware boundary (e.g. meetings whose
 * date field is "today in my timezone").
 *
 * Example: startOfUserDay(istUser) on Oct 14 returns
 *   2026-10-13T18:30:00.000Z   (which is 00:00 IST on Oct 14)
 */
function startOfUserDay(user, dateStr) {
  const tz = user?.settings?.timezone || 'UTC';
  const ymd = dateStr || userToday(user);
  // Compute the UTC instant that corresponds to 00:00 local wallclock on that date.
  try {
    // Build a "wallclock string" and parse it via the environment's tz db.
    // Node's Date parsing doesn't natively support timezone-aware parsing,
    // so we use the offset trick: get the zone's offset for that date and
    // apply it.
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const probe = new Date(`${ymd}T00:00:00Z`);  // midnight UTC on the same date
    const parts = fmt.formatToParts(probe);
    const offsetPart = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT+0';
    // offsetPart looks like "GMT+5:30" or "GMT-7"
    const match = offsetPart.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!match) return probe;
    const sign = match[1] === '+' ? 1 : -1;
    const hours = parseInt(match[2], 10);
    const mins  = parseInt(match[3] || '0', 10);
    const offsetMs = sign * (hours * 60 + mins) * 60 * 1000;
    // Local midnight wallclock == UTC midnight minus the offset
    return new Date(Date.parse(`${ymd}T00:00:00Z`) - offsetMs);
  } catch {
    return new Date(`${ymd}T00:00:00Z`);
  }
}

/**
 * Does the given JS Date fall on `dateStr` (YYYY-MM-DD) in the user's tz?
 */
function isOnUserDay(user, date, dateStr) {
  const tz = user?.settings?.timezone || 'UTC';
  return dateStrInTz(tz, date) === dateStr;
}

module.exports = {
  dateStrInTz,
  userToday,
  startOfUserDay,
  isOnUserDay,
};
