// Work-calendar helper — decides whether a given date is an off-day for a given user.
// Used by all schedulers to suppress notifications on weekends and holidays.
//
// Resolution order (first non-empty wins):
//   1. user.weeklyOffDays
//   2. user's primary team.weeklyOffDays  (first team in user.teams[])
//   3. user.office.weeklyOffDays
//   4. CompanyInfo.defaultWeeklyOffDays
//   5. Fallback: [0]  (Sunday)
//
// Plus: any CalendarEvent with type:'holiday' on that date that applies to the user.

const CalendarEvent = require('../models/CalendarEvent');
const CompanyInfo = require('../models/CompanyInfo');
const Team = require('../models/Team');
const Office = require('../models/Office');

let _companyOffDaysCache = null;
let _companyCacheAt = 0;
const CACHE_MS = 5 * 60 * 1000; // 5 min — config is rarely changed

async function getCompanyDefaultOffDays() {
  if (_companyOffDaysCache && Date.now() - _companyCacheAt < CACHE_MS) {
    return _companyOffDaysCache;
  }
  try {
    const company = await CompanyInfo.findOne({}).select('defaultWeeklyOffDays');
    _companyOffDaysCache = (company && Array.isArray(company.defaultWeeklyOffDays) && company.defaultWeeklyOffDays.length > 0)
      ? company.defaultWeeklyOffDays
      : [0];
  } catch {
    _companyOffDaysCache = [0];
  }
  _companyCacheAt = Date.now();
  return _companyOffDaysCache;
}

// Pass any user document (must include teams + office in the doc; will populate if needed)
async function resolveOffDaysForUser(user) {
  if (!user) return [0];

  if (Array.isArray(user.weeklyOffDays) && user.weeklyOffDays.length > 0) {
    return user.weeklyOffDays;
  }

  // First team
  const firstTeamId = (user.teams || [])[0];
  if (firstTeamId) {
    const team = typeof firstTeamId === 'object' && firstTeamId.weeklyOffDays
      ? firstTeamId
      : await Team.findById(firstTeamId).select('weeklyOffDays').lean();
    if (team && Array.isArray(team.weeklyOffDays) && team.weeklyOffDays.length > 0) {
      return team.weeklyOffDays;
    }
  }

  // Office
  if (user.office) {
    const office = typeof user.office === 'object' && user.office.weeklyOffDays
      ? user.office
      : await Office.findById(user.office).select('weeklyOffDays').lean();
    if (office && Array.isArray(office.weeklyOffDays) && office.weeklyOffDays.length > 0) {
      return office.weeklyOffDays;
    }
  }

  return await getCompanyDefaultOffDays();
}

// Pass a Date or anything Date-parseable. Day-of-week: 0=Sun..6=Sat
function dayOfWeek(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.getDay();
}

function ymd(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().split('T')[0];
}

// Check if a date has a holiday applicable to the user.
async function hasHolidayForUser(user, date) {
  const dateStr = ymd(date);
  const userId = user?._id || user;
  const teamIds = (user?.teams || []).map(t => t._id || t);
  const officeId = user?.office?._id || user?.office;

  const conditions = [{ isCompanyWide: true }];
  if (userId) conditions.push({ user: userId });
  if (teamIds.length > 0) conditions.push({ team: { $in: teamIds } });
  if (officeId) conditions.push({ office: officeId });

  const found = await CalendarEvent.findOne({
    type: 'holiday',
    date: dateStr,
    $or: conditions
  }).select('_id').lean();

  return !!found;
}

// Main entry point — schedulers call this. Returns true if the user should NOT receive notifications.
async function isOffDay(user, date = new Date()) {
  try {
    const offDays = await resolveOffDaysForUser(user);
    if (offDays.includes(dayOfWeek(date))) return true;
    if (await hasHolidayForUser(user, date)) return true;
    return false;
  } catch {
    return false; // fail open — don't accidentally silence everyone if DB hiccups
  }
}

// Force-clear cache (used after admin updates company config)
function clearCache() {
  _companyOffDaysCache = null;
  _companyCacheAt = 0;
}

module.exports = {
  isOffDay,
  resolveOffDaysForUser,
  hasHolidayForUser,
  getCompanyDefaultOffDays,
  clearCache
};
