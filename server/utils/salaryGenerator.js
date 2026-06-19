// Monthly salary calculation — pulled out of routes/salary.js so it can be
// called both from the manual /salary/generate endpoint AND from the scheduler
// that auto-runs on the 1st of each month.

const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const { SalaryStructure, EmployeeOverride, SalaryMonthly } = require('../models/Salary');

function getWorkingDays(year, month) {
  const last = new Date(year, month, 0).getDate();
  let days = 0;
  for (let d = 1; d <= last; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0 && dow !== 6) days++; // skip Sat & Sun
  }
  return days;
}

async function generateMonthlySalary(userId, month, year, options = {}) {
  const employee = await User.findById(userId);
  if (!employee) throw new Error('Employee not found.');

  const baseSalary = employee.salary?.base || 0;
  if (!baseSalary) {
    if (options.silent) return null;
    throw new Error('No base salary configured.');
  }

  const companyRules = await SalaryStructure.findOne({ isActive: true });
  const override = await EmployeeOverride.findOne({ user: userId });

  const perAbsentDay = override?.perAbsentDay ?? companyRules?.perAbsentDay ?? 0;
  const perHalfDay = override?.perHalfDay ?? companyRules?.perHalfDay ?? 0;
  const perUnapprovedLeave = override?.perUnapprovedLeave ?? companyRules?.perUnapprovedLeave ?? 0;

  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const attendances = await Attendance.find({
    user: userId,
    date: { $regex: `^${monthStr}` }
  });

  let presentDays = 0, absentDays = 0, halfDays = 0, leaveDays = 0;
  for (const a of attendances) {
    if (a.status === 'present') presentDays++;
    else if (a.status === 'absent') absentDays++;
    else if (a.status === 'half_day') halfDays++;
    else if (a.status === 'leave') leaveDays++;
  }

  const startDate = `${monthStr}-01`;
  const endDate = `${monthStr}-31`;
  const unapprovedLeaves = await Leave.countDocuments({
    user: userId,
    status: 'rejected',
    startDate: { $gte: startDate, $lte: endDate }
  });

  const workingDays = getWorkingDays(year, month);

  // Count company-wide holidays that fell in this month (paid, no deduction).
  // Imported lazily to avoid circular requires.
  const CalendarEvent = require('../models/CalendarEvent');
  const holidayDays = await CalendarEvent.countDocuments({
    type: 'holiday',
    isCompanyWide: true,
    date: { $regex: `^${monthStr}` }
  });

  const deductions = [];
  if (absentDays > 0 && perAbsentDay > 0) {
    deductions.push({ name: 'Absent days', amount: absentDays * perAbsentDay, count: absentDays });
  }
  if (halfDays > 0 && perHalfDay > 0) {
    deductions.push({ name: 'Half days', amount: halfDays * perHalfDay, count: halfDays });
  }
  if (unapprovedLeaves > 0 && perUnapprovedLeave > 0) {
    deductions.push({ name: 'Unapproved leaves', amount: unapprovedLeaves * perUnapprovedLeave, count: unapprovedLeaves });
  }
  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);

  const tds = employee.salary?.tds || 0;
  const pf = employee.salary?.pf || 0;
  const esi = employee.salary?.esi || 0;
  const totalTax = tds + pf + esi;

  const fixedBonus = employee.salary?.fixedBonus || 0;
  const performanceBonuses = [];
  if (companyRules?.bonusRules) {
    for (const rule of companyRules.bonusRules) {
      let qualifies = false;
      if (rule.condition === 'zero_absences' && absentDays === 0) qualifies = true;
      if (rule.condition === 'perfect_attendance' && absentDays === 0 && halfDays === 0 && unapprovedLeaves === 0) qualifies = true;
      if (rule.condition === 'max_2_leaves' && leaveDays <= 2) qualifies = true;
      if (qualifies) {
        performanceBonuses.push({ name: rule.name, amount: rule.amount });
      }
    }
  }
  const totalBonuses = fixedBonus + performanceBonuses.reduce((s, b) => s + b.amount, 0);

  const grossSalary = baseSalary - totalDeductions;
  const netSalary = grossSalary - totalTax + totalBonuses;

  return SalaryMonthly.findOneAndUpdate(
    { user: userId, month, year },
    {
      baseSalary, workingDays, presentDays, absentDays, halfDays, leaveDays,
      holidayDays,
      unapprovedLeaveDays: unapprovedLeaves,
      deductions, totalDeductions,
      tds, pf, esi, totalTax,
      fixedBonus, performanceBonuses, totalBonuses,
      grossSalary, netSalary,
      generatedAt: new Date()
    },
    { upsert: true, new: true }
  );
}

// Generate salaries for ALL eligible active employees for a given month.
// Used by the monthly scheduler.
async function generateForAllUsers(month, year) {
  const employees = await User.find({
    isActive: true,
    _c: { $ne: true },
    'salary.base': { $gt: 0 }
  }).select('_id name');

  let generated = 0;
  let failed = 0;
  for (const emp of employees) {
    try {
      const result = await generateMonthlySalary(emp._id, month, year, { silent: true });
      if (result) generated++;
    } catch (err) {
      failed++;
      console.error(`[salary] failed for ${emp.name} (${emp._id}):`, err.message);
    }
  }
  return { generated, failed, total: employees.length };
}

module.exports = { generateMonthlySalary, generateForAllUsers, getWorkingDays };
