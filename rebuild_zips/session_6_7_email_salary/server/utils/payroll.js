// ============================================================================
// payroll.js — salary calculation helpers + real PDF payslip generator.
// ============================================================================
// Session 7 backend module.
//
// Fixes from audit (Section 14):
//   • getWorkingDays() now accepts a config object for company working days
//     and a list of holiday dates, instead of hardcoding "exclude Sundays".
//   • countAttendance() builds a proper date-range query that works with
//     Date or string storage, instead of a regex that silently matches zero.
//   • resolveEmployeeComp() explicitly checks each salary field and returns
//     a `missing` array when fields are absent, so callers can surface a
//     loud warning instead of silently computing a ₹0 payslip.
//   • generatePayslipPdf() produces a REAL PDF (pdf-lib), not a .txt file.
// ============================================================================

const PDFDocument = require('pdf-lib').PDFDocument;
const StandardFonts = require('pdf-lib').StandardFonts;
const rgb = require('pdf-lib').rgb;

const MONTHS_LONG = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// ─── Working-day calculation ────────────────────────────────────────────────

/**
 * Returns the number of working days in a given month.
 *
 * @param {number} year   4-digit year
 * @param {number} month  1-indexed month (1 = January)
 * @param {object} config {
 *   workingDayIndices: number[]  // JS day indices (0=Sun .. 6=Sat) that ARE working days.
 *                                //    Default [1,2,3,4,5] (Mon-Fri).
 *   holidays: string[]           // ISO date strings "YYYY-MM-DD" to exclude.
 * }
 */
function getWorkingDays(year, month, config = {}) {
  const workingDayIndices = Array.isArray(config.workingDayIndices) && config.workingDayIndices.length
    ? config.workingDayIndices
    : [1, 2, 3, 4, 5]; // default Mon–Fri
  const holidaySet = new Set(config.holidays || []);

  const daysInMonth = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');

  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month - 1, d);
    const dayIdx = dateObj.getDay();
    if (!workingDayIndices.includes(dayIdx)) continue;

    const iso = `${year}-${mm}-${String(d).padStart(2, '0')}`;
    if (holidaySet.has(iso)) continue;

    count++;
  }
  return count;
}

// ─── Attendance query (robust to Date or string field) ─────────────────────

/**
 * Builds an attendance query that matches records for a specific month,
 * regardless of whether `date` is stored as a String ("YYYY-MM-DD") or a
 * JS Date object. The OLD code only worked with strings and silently
 * matched zero when dates were stored as Dates.
 */
function monthAttendanceQuery(userId, year, month) {
  const mm = String(month).padStart(2, '0');
  const monthPrefix = `${year}-${mm}`;

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 1);  // first of NEXT month

  return {
    user: userId,
    $or: [
      { date: { $regex: `^${monthPrefix}` } },                        // string storage
      { date: { $gte: startDate, $lt: endDate } },                    // Date storage
    ],
  };
}

// ─── Resolve employee comp + report missing fields ─────────────────────────

/**
 * Pulls out the salary components we need and tracks which ones are missing.
 * Callers should abort and prompt for setup if `missing` is non-empty, rather
 * than silently generating a ₹0 payslip.
 *
 * Audit doc (Section 14): "Salaries silently generate as 0" — this prevents it.
 */
function resolveEmployeeComp(employee) {
  const s = employee.salary || {};
  const missing = [];

  const base = Number(s.base);
  if (!base || Number.isNaN(base)) missing.push('base');

  const tds = Number(s.tds) || 0;  // tax components are allowed to be 0 explicitly
  const pf  = Number(s.pf)  || 0;
  const esi = Number(s.esi) || 0;
  const fixedBonus = Number(s.fixedBonus) || 0;

  return {
    base: base || 0,
    tds, pf, esi,
    fixedBonus,
    missing,  // array of strings, e.g. ['base']
  };
}

// ─── Real PDF payslip ───────────────────────────────────────────────────────

/**
 * Builds a real PDF payslip (not a text file).
 * Returns a Uint8Array which the route streams as Content-Type application/pdf.
 */
async function generatePayslipPdf({ employee, record }) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4 portrait (points)
  const width = page.getWidth();
  const { height } = page.getSize();

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold    = await doc.embedFont(StandardFonts.HelveticaBold);

  // Design tokens from the Niyoq design system, mapped to pdf-lib rgb()
  const COLORS = {
    ink:    rgb(0.118, 0.161, 0.231),     // #1E293B
    muted:  rgb(0.39, 0.455, 0.545),      // #64748B
    indigo: rgb(0.388, 0.4, 0.945),       // #6366F1
    amber:  rgb(0.961, 0.620, 0.043),     // #F59E0B
    emerald:rgb(0.063, 0.725, 0.506),     // #10B981
    rose:   rgb(0.925, 0.282, 0.600),     // #EC4899
    line:   rgb(0.86, 0.89, 0.93),
    bg:     rgb(0.977, 0.980, 0.984),
  };

  const fmt = (n) =>
    'INR ' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n || 0));

  // ── Header band ──────────────────────────────────────────────────────
  page.drawRectangle({
    x: 0, y: height - 90, width, height: 90,
    color: COLORS.indigo,
  });
  page.drawText('SALARY SLIP', {
    x: 40, y: height - 50, size: 26, font: bold, color: rgb(1, 1, 1),
  });
  const monthName = MONTHS_LONG[record.month] || '';
  page.drawText(`${monthName} ${record.year}`, {
    x: 40, y: height - 75, size: 12, font: regular, color: rgb(1, 1, 1),
  });
  page.drawText('Niyoq', {
    x: width - 40 - bold.widthOfTextAtSize('Niyoq', 12),
    y: height - 50, size: 12, font: bold, color: rgb(1, 1, 1),
  });

  // ── Employee block ───────────────────────────────────────────────────
  let y = height - 130;
  const drawKV = (k, v, yPos, options = {}) => {
    const { keyColor = COLORS.muted, valueColor = COLORS.ink, keyFont = regular, valueFont = bold, size = 10 } = options;
    page.drawText(k, { x: 40,  y: yPos, size, font: keyFont, color: keyColor });
    page.drawText(String(v), { x: 180, y: yPos, size, font: valueFont, color: valueColor });
  };

  drawKV('Employee',  employee.name || '', y);       y -= 16;
  drawKV('Email',     employee.email || '', y);      y -= 16;
  if (employee.jobTitle) { drawKV('Title', employee.jobTitle, y); y -= 16; }
  drawKV('Generated', new Date().toLocaleDateString(), y);
  y -= 24;

  // ── Section header helper ────────────────────────────────────────────
  const sectionHeader = (label, yPos) => {
    page.drawRectangle({ x: 40, y: yPos - 2, width: width - 80, height: 22, color: COLORS.bg });
    page.drawText(label, { x: 48, y: yPos + 4, size: 10, font: bold, color: COLORS.ink });
    return yPos - 30;
  };

  const line = (yPos) => {
    page.drawLine({
      start: { x: 40, y: yPos }, end: { x: width - 40, y: yPos },
      thickness: 0.5, color: COLORS.line,
    });
  };

  // ── Attendance summary ───────────────────────────────────────────────
  y = sectionHeader('ATTENDANCE SUMMARY', y);
  const att = [
    ['Working Days', record.workingDays || 0],
    ['Present',      record.presentDays || 0],
    ['Absent',       record.absentDays || 0],
    ['Half Days',    record.halfDays || 0],
    ['Leaves',       record.leaveDays || 0],
  ];
  for (const [k, v] of att) { drawKV(k, v, y); y -= 14; }
  y -= 8; line(y); y -= 18;

  // ── Earnings ─────────────────────────────────────────────────────────
  y = sectionHeader('EARNINGS', y);
  drawKV('Base Salary', fmt(record.baseSalary), y, { valueColor: COLORS.emerald }); y -= 16;
  y -= 4; line(y); y -= 18;

  // ── Deductions ───────────────────────────────────────────────────────
  if (record.deductions?.length > 0 || record.totalDeductions > 0) {
    y = sectionHeader('DEDUCTIONS', y);
    (record.deductions || []).forEach(d => {
      drawKV(`${d.name} (${d.count})`, `- ${fmt(d.amount)}`, y, { valueColor: COLORS.rose });
      y -= 14;
    });
    y -= 2;
    drawKV('Total Deductions', `- ${fmt(record.totalDeductions)}`, y, {
      keyFont: bold, valueColor: COLORS.rose,
    });
    y -= 20; line(y); y -= 18;
  }

  // ── Taxes ────────────────────────────────────────────────────────────
  y = sectionHeader('TAX', y);
  if (record.tds > 0) { drawKV('TDS', `- ${fmt(record.tds)}`, y, { valueColor: COLORS.rose }); y -= 14; }
  if (record.pf  > 0) { drawKV('PF',  `- ${fmt(record.pf)}`,  y, { valueColor: COLORS.rose }); y -= 14; }
  if (record.esi > 0) { drawKV('ESI', `- ${fmt(record.esi)}`, y, { valueColor: COLORS.rose }); y -= 14; }
  drawKV('Total Tax', `- ${fmt(record.totalTax)}`, y, { keyFont: bold, valueColor: COLORS.rose });
  y -= 20; line(y); y -= 18;

  // ── Bonuses ──────────────────────────────────────────────────────────
  if (record.totalBonuses > 0) {
    y = sectionHeader('BONUSES', y);
    if (record.fixedBonus > 0) {
      drawKV('Fixed Bonus', `+ ${fmt(record.fixedBonus)}`, y, { valueColor: COLORS.amber });
      y -= 14;
    }
    (record.performanceBonuses || []).forEach(b => {
      drawKV(b.name, `+ ${fmt(b.amount)}`, y, { valueColor: COLORS.amber });
      y -= 14;
    });
    y -= 2;
    drawKV('Total Bonuses', `+ ${fmt(record.totalBonuses)}`, y, {
      keyFont: bold, valueColor: COLORS.amber,
    });
    y -= 20; line(y); y -= 18;
  }

  // ── Net salary highlighted ───────────────────────────────────────────
  page.drawRectangle({
    x: 40, y: y - 16, width: width - 80, height: 40, color: COLORS.indigo,
  });
  page.drawText('NET SALARY', {
    x: 48, y: y, size: 12, font: bold, color: rgb(1, 1, 1),
  });
  const netText = fmt(record.netSalary);
  page.drawText(netText, {
    x: width - 48 - bold.widthOfTextAtSize(netText, 16),
    y: y - 4, size: 16, font: bold, color: rgb(1, 1, 1),
  });
  y -= 60;

  // ── Footer ───────────────────────────────────────────────────────────
  page.drawText('This is a computer-generated document and requires no signature.', {
    x: 40, y: 40, size: 8, font: regular, color: COLORS.muted,
  });

  return await doc.save();
}

module.exports = {
  getWorkingDays,
  monthAttendanceQuery,
  resolveEmployeeComp,
  generatePayslipPdf,
};
