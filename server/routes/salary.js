const router = require('express').Router();
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { SalaryStructure, EmployeeOverride, SalaryMonthly, SalaryDispute } = require('../models/Salary');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const User = require('../models/User');
const { protect, requireRole, requirePower } = require('../middleware/auth');

// ══════════════════════════════════════
//  COMPANY DEDUCTION RULES
// ══════════════════════════════════════

// GET /api/v1/salary/rules — get current company rules
router.get('/rules', protect, async (req, res) => {
  try {
    let rules = await SalaryStructure.findOne({ isActive: true });
    if (!rules) {
      rules = await SalaryStructure.create({
        perAbsentDay: 0, perHalfDay: 0, perUnapprovedLeave: 0,
        bonusRules: [], updatedBy: req.user._id
      });
    }
    res.json(rules);
  } catch (err) {
    console.error('Get salary rules error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/salary/rules — update company rules (admin only)
router.put('/rules', protect, requirePower('salary', 'editStructure'), async (req, res) => {
  try {
    const { perAbsentDay, perHalfDay, perUnapprovedLeave, bonusRules } = req.body;
    let rules = await SalaryStructure.findOne({ isActive: true });
    if (!rules) {
      rules = new SalaryStructure({});
    }
    if (perAbsentDay !== undefined) rules.perAbsentDay = perAbsentDay;
    if (perHalfDay !== undefined) rules.perHalfDay = perHalfDay;
    if (perUnapprovedLeave !== undefined) rules.perUnapprovedLeave = perUnapprovedLeave;
    if (bonusRules) rules.bonusRules = bonusRules;
    rules.updatedBy = req.user._id;
    await rules.save();
    res.json(rules);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ══════════════════════════════════════
//  EMPLOYEE OVERRIDES
// ══════════════════════════════════════

// GET /api/v1/salary/override/:userId
router.get('/override/:userId', protect, requirePower('salary', 'editStructure'), async (req, res) => {
  try {
    const override = await EmployeeOverride.findOne({ user: req.params.userId });
    res.json(override || {});
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/salary/override/:userId
router.put('/override/:userId', protect, requirePower('salary', 'editStructure'), async (req, res) => {
  try {
    const { perAbsentDay, perHalfDay, perUnapprovedLeave } = req.body;
    const override = await EmployeeOverride.findOneAndUpdate(
      { user: req.params.userId },
      { perAbsentDay, perHalfDay, perUnapprovedLeave, updatedBy: req.user._id },
      { upsert: true, new: true }
    );
    res.json(override);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ══════════════════════════════════════
//  MONTHLY SALARY — GENERATE & VIEW
// ══════════════════════════════════════

// Helper: calculate working days in a month (exclude Sundays and Saturdays)
function getWorkingDays(year, month) {
  let count = 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(year, month - 1, d).getDay();
    if (day !== 0 && day !== 6) count++; // Exclude Sundays and Saturdays
  }
  return count;
}

// POST /api/v1/salary/generate — generate/recalculate monthly salary for a user
// POST /salary/generate-all — kick off monthly generation for everyone for a given month.
// Useful when you want to run "auto" early or backfill a missed month.
router.post('/generate-all', protect, requirePower('salary', 'editStructure'), async (req, res) => {
  try {
    const { month, year } = req.body;
    if (!month || !year) return res.status(400).json({ error: 'month and year required.' });
    const { generateForAllUsers } = require('../utils/salaryGenerator');
    const result = await generateForAllUsers(parseInt(month), parseInt(year));
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('generate-all salary error:', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

router.post('/generate', protect, requirePower('salary', 'editStructure'), async (req, res) => {
  try {
    const { userId, month, year } = req.body;

    const employee = await User.findById(userId);
    if (!employee) return res.status(404).json({ error: 'Employee not found.' });

    // Skip if baseSalary is 0 or missing
    const baseSalary = employee.salary?.base || 0;
    if (!baseSalary) {
      return res.status(400).json({ error: 'Cannot generate salary: employee has no base salary configured.' });
    }

    // Get rules (employee override or company default)
    const companyRules = await SalaryStructure.findOne({ isActive: true });
    const override = await EmployeeOverride.findOne({ user: userId });

    const perAbsentDay = override?.perAbsentDay ?? companyRules?.perAbsentDay ?? 0;
    const perHalfDay = override?.perHalfDay ?? companyRules?.perHalfDay ?? 0;
    const perUnapprovedLeave = override?.perUnapprovedLeave ?? companyRules?.perUnapprovedLeave ?? 0;

    // Count attendance for the month (Attendance.date is a String in YYYY-MM-DD format)
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const attendances = await Attendance.find({
      user: userId,
      date: { $regex: `^${monthStr}` }
    });

    let presentDays = 0, absentDays = 0, halfDays = 0, leaveDays = 0;
    attendances.forEach(a => {
      if (a.status === 'present') presentDays++;
      else if (a.status === 'absent') absentDays++;
      else if (a.status === 'half_day') halfDays++;
      else if (a.status === 'leave') leaveDays++;
    });

    // Count unapproved leaves
    const startDate = `${monthStr}-01`;
    const endDate = `${monthStr}-31`;
    const unapprovedLeaves = await Leave.countDocuments({
      user: userId,
      status: 'rejected',
      startDate: { $gte: startDate, $lte: endDate }
    });

    const workingDays = getWorkingDays(year, month);

    // Calculate deductions
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

    // Tax
    const tds = employee.salary?.tds || 0;
    const pf = employee.salary?.pf || 0;
    const esi = employee.salary?.esi || 0;
    const totalTax = tds + pf + esi;

    // Bonuses
    const fixedBonus = employee.salary?.fixedBonus || 0;
    const performanceBonuses = [];

    // Apply rule-based bonuses
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

    // Upsert monthly record
    const record = await SalaryMonthly.findOneAndUpdate(
      { user: userId, month, year },
      {
        baseSalary, workingDays, presentDays, absentDays, halfDays, leaveDays,
        unapprovedLeaveDays: unapprovedLeaves,
        deductions, totalDeductions,
        tds, pf, esi, totalTax,
        fixedBonus, performanceBonuses, totalBonuses,
        grossSalary, netSalary,
        generatedAt: new Date()
      },
      { upsert: true, new: true }
    );

    res.json(record);
  } catch (err) {
    console.error('Generate salary error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/salary/monthly — get my salary records
router.get('/monthly', protect, async (req, res) => {
  try {
    const { year } = req.query;
    const query = { user: req.user._id };
    if (year) query.year = parseInt(year);

    const records = await SalaryMonthly.find(query).sort({ year: -1, month: -1 });
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/salary/monthly/:userId — get employee salary (admin with power)
router.get('/monthly/:userId', protect, requirePower('salary', 'viewEmployee'), async (req, res) => {
  try {
    const { year } = req.query;
    const query = { user: req.params.userId };
    if (year) query.year = parseInt(year);

    const records = await SalaryMonthly.find(query).sort({ year: -1, month: -1 });
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/salary/monthly/:userId/:year/:month — single month detail
router.get('/monthly/:userId/:year/:month', protect, async (req, res) => {
  try {
    const { userId, year, month } = req.params;

    // Can view own or with power
    if (userId !== req.user._id.toString() && !req.user.hasPower('salary', 'viewEmployee')) {
      return res.status(403).json({ error: 'No permission.' });
    }

    const record = await SalaryMonthly.findOne({
      user: userId,
      year: parseInt(year),
      month: parseInt(month)
    });

    if (!record) return res.status(404).json({ error: 'Salary record not found for this month.' });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/salary/monthly/:id/finalize — finalize monthly salary
router.put('/monthly/:id/finalize', protect, requirePower('salary', 'editStructure'), async (req, res) => {
  try {
    const record = await SalaryMonthly.findByIdAndUpdate(
      req.params.id,
      { status: 'finalized', finalizedBy: req.user._id, finalizedAt: new Date() },
      { new: true }
    );
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/salary/monthly/:userId/:year/:month/pdf — download salary slip as PDF
router.get('/monthly/:userId/:year/:month/pdf', protect, async (req, res) => {
  try {
    const { userId, year, month } = req.params;

    // Can view own or with power
    if (userId !== req.user._id.toString() && !req.user.hasPower('salary', 'viewEmployee')) {
      return res.status(403).json({ error: 'No permission.' });
    }

    const record = await SalaryMonthly.findOne({ user: userId, year: parseInt(year), month: parseInt(month) });
    if (!record) return res.status(404).json({ error: 'Salary record not found.' });

    const employee = await User.findById(userId).select('name email jobTitle');
    const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = MONTHS[record.month];
    const fmt = (n) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n || 0);

    // Generate real PDF using pdf-lib
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontNormal = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const darkColor = rgb(0.12, 0.16, 0.21);
    const grayColor = rgb(0.4, 0.45, 0.53);
    const accentColor = rgb(0.24, 0.36, 0.96);

    let y = 790;
    const lx = 50; // left margin
    const rx = 545; // right margin

    // Company header
    page.drawText('NIYOQ MEDIA', { x: lx, y, font: fontBold, size: 20, color: accentColor });
    y -= 18;
    page.drawText('Salary Slip', { x: lx, y, font: fontNormal, size: 12, color: grayColor });
    y -= 14;
    page.drawText(`${monthName} ${year}`, { x: lx, y, font: fontNormal, size: 12, color: grayColor });
    y -= 30;

    // Horizontal rule
    page.drawLine({ start: { x: lx, y }, end: { x: rx, y }, thickness: 1, color: rgb(0.85, 0.87, 0.9) });
    y -= 22;

    // Employee info
    const drawRow = (label, value, bold) => {
      page.drawText(label, { x: lx, y, font: fontNormal, size: 10, color: grayColor });
      page.drawText(value || '', { x: 180, y, font: bold ? fontBold : fontNormal, size: 10, color: darkColor });
      y -= 16;
    };
    drawRow('Employee Name:', employee.name, true);
    drawRow('Email:', employee.email);
    if (employee.jobTitle) drawRow('Designation:', employee.jobTitle);
    y -= 10;

    // Attendance section
    page.drawText('ATTENDANCE SUMMARY', { x: lx, y, font: fontBold, size: 11, color: darkColor });
    y -= 18;
    drawRow('Working Days:', String(record.workingDays));
    drawRow('Present:', String(record.presentDays));
    drawRow('Absent:', String(record.absentDays));
    drawRow('Half Days:', String(record.halfDays));
    drawRow('Leaves:', String(record.leaveDays));
    y -= 6;
    page.drawLine({ start: { x: lx, y }, end: { x: rx, y }, thickness: 0.5, color: rgb(0.85, 0.87, 0.9) });
    y -= 18;

    // Earnings
    page.drawText('EARNINGS', { x: lx, y, font: fontBold, size: 11, color: darkColor });
    y -= 18;
    page.drawText('Base Salary', { x: lx, y, font: fontNormal, size: 10, color: grayColor });
    page.drawText(`INR ${fmt(record.baseSalary)}`, { x: 400, y, font: fontNormal, size: 10, color: darkColor });
    y -= 16;

    // Deductions
    if (record.deductions?.length > 0) {
      y -= 6;
      page.drawText('DEDUCTIONS', { x: lx, y, font: fontBold, size: 11, color: darkColor });
      y -= 18;
      for (const d of record.deductions) {
        page.drawText(`${d.name} (x${d.count})`, { x: lx, y, font: fontNormal, size: 10, color: grayColor });
        page.drawText(`- INR ${fmt(d.amount)}`, { x: 400, y, font: fontNormal, size: 10, color: rgb(0.8, 0.2, 0.2) });
        y -= 16;
      }
      page.drawText('Total Deductions', { x: lx, y, font: fontBold, size: 10, color: grayColor });
      page.drawText(`- INR ${fmt(record.totalDeductions)}`, { x: 400, y, font: fontBold, size: 10, color: rgb(0.8, 0.2, 0.2) });
      y -= 16;
    }

    // Tax
    y -= 6;
    page.drawText('TAX DEDUCTIONS', { x: lx, y, font: fontBold, size: 11, color: darkColor });
    y -= 18;
    if (record.tds > 0) { drawRow('TDS:', `- INR ${fmt(record.tds)}`); }
    if (record.pf > 0) { drawRow('PF:', `- INR ${fmt(record.pf)}`); }
    if (record.esi > 0) { drawRow('ESI:', `- INR ${fmt(record.esi)}`); }
    page.drawText('Total Tax', { x: lx, y, font: fontBold, size: 10, color: grayColor });
    page.drawText(`- INR ${fmt(record.totalTax)}`, { x: 400, y, font: fontBold, size: 10, color: rgb(0.8, 0.2, 0.2) });
    y -= 16;

    // Bonuses
    if (record.totalBonuses > 0) {
      y -= 6;
      page.drawText('BONUSES', { x: lx, y, font: fontBold, size: 11, color: darkColor });
      y -= 18;
      if (record.fixedBonus > 0) {
        page.drawText('Fixed Bonus', { x: lx, y, font: fontNormal, size: 10, color: grayColor });
        page.drawText(`+ INR ${fmt(record.fixedBonus)}`, { x: 400, y, font: fontNormal, size: 10, color: rgb(0.1, 0.6, 0.3) });
        y -= 16;
      }
      for (const b of (record.performanceBonuses || [])) {
        page.drawText(b.name, { x: lx, y, font: fontNormal, size: 10, color: grayColor });
        page.drawText(`+ INR ${fmt(b.amount)}`, { x: 400, y, font: fontNormal, size: 10, color: rgb(0.1, 0.6, 0.3) });
        y -= 16;
      }
      page.drawText('Total Bonuses', { x: lx, y, font: fontBold, size: 10, color: grayColor });
      page.drawText(`+ INR ${fmt(record.totalBonuses)}`, { x: 400, y, font: fontBold, size: 10, color: rgb(0.1, 0.6, 0.3) });
      y -= 16;
    }

    // Net salary
    y -= 10;
    page.drawLine({ start: { x: lx, y }, end: { x: rx, y }, thickness: 1.5, color: accentColor });
    y -= 22;
    page.drawText('NET SALARY', { x: lx, y, font: fontBold, size: 14, color: darkColor });
    page.drawText(`INR ${fmt(record.netSalary)}`, { x: 400, y, font: fontBold, size: 14, color: accentColor });
    y -= 30;
    page.drawLine({ start: { x: lx, y }, end: { x: rx, y }, thickness: 1.5, color: accentColor });

    // Footer
    y -= 30;
    page.drawText(`Generated: ${new Date().toLocaleDateString()}`, { x: lx, y, font: fontNormal, size: 8, color: grayColor });
    y -= 12;
    page.drawText('This is a computer-generated document and does not require a signature.', { x: lx, y, font: fontNormal, size: 8, color: grayColor });

    const pdfBytes = await pdfDoc.save();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=salary_${employee.name.replace(/\s/g, '_')}_${monthName}_${year}.pdf`);
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    console.error('Salary PDF error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ══════════════════════════════════════
//  SALARY DISPUTES
// ══════════════════════════════════════

// GET /api/v1/salary/disputes — my disputes (or all if admin with power)
router.get('/disputes', protect, async (req, res) => {
  try {
    const { all } = req.query;

    let query = { isActive: true };
    if (all === 'true' && req.user.hasPower('salary', 'viewDisputes')) {
      // Admin sees all
    } else {
      query.user = req.user._id;
    }

    const disputes = await SalaryDispute.find(query)
      .populate('user', 'name email avatar jobTitle')
      .populate('resolvedBy', 'name')
      .populate('thread.user', 'name avatar')
      .sort({ createdAt: -1 });
    res.json(disputes);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/salary/disputes — raise dispute
router.post('/disputes', protect, async (req, res) => {
  try {
    const { month, year, whatIsWrong, description, disputeAmount } = req.body;

    // Find salary record
    const salaryRecord = await SalaryMonthly.findOne({ user: req.user._id, month, year });

    // Find manager and HR
    const employee = await User.findById(req.user._id);

    const dispute = await SalaryDispute.create({
      user: req.user._id,
      month, year,
      salaryRecord: salaryRecord?._id,
      whatIsWrong,
      description,
      disputeAmount: disputeAmount || 0,
      assignedTo: employee.manager
    });

    // Notify manager (DB row + push)
    const { notifyUser } = require('../utils/notify');
    if (employee.manager) {
      await notifyUser(req.app.get('io'), employee.manager, {
        type: 'salary',
        title: 'New Salary Dispute',
        message: `${req.user.name} raised a dispute for ${month}/${year}`,
        entityType: 'dispute',
        entityId: dispute._id,
        sender: req.user._id
      });
    }

    const populated = await SalaryDispute.findById(dispute._id)
      .populate('user', 'name email avatar');
    res.status(201).json(populated);
  } catch (err) {
    console.error('Create dispute error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/salary/disputes/:id — resolve/reject/escalate dispute
router.put('/disputes/:id', protect, requirePower('salary', 'resolveDisputes'), async (req, res) => {
  try {
    const { status, resolution, rejectionReason } = req.body;
    const update = { status };
    if (status === 'resolved') {
      update.resolution = resolution;
      update.resolvedBy = req.user._id;
      update.resolvedAt = new Date();
    }
    if (status === 'rejected') {
      update.rejectionReason = rejectionReason;
      update.resolvedBy = req.user._id;
      update.resolvedAt = new Date();
    }

    const dispute = await SalaryDispute.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('user', 'name email avatar')
      .populate('resolvedBy', 'name');

    // Notify employee (DB + push)
    const { notifyUser } = require('../utils/notify');
    await notifyUser(req.app.get('io'), dispute.user._id, {
      type: 'salary',
      title: `Dispute ${status}`,
      message: status === 'resolved' ? resolution : rejectionReason || `Your dispute has been ${status}.`,
      entityType: 'dispute',
      entityId: dispute._id,
      sender: req.user._id
    });

    res.json(dispute);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ══════════════════════════════════════
//  SALARY BONUS
// ══════════════════════════════════════

// POST /api/v1/salary/bonus — admin adds bonus to employee's monthly record
router.post('/bonus', protect, requirePower('salary', 'editStructure'), async (req, res) => {
  try {
    const { employeeId, month, amount, reason } = req.body;

    if (!employeeId || !month || !amount || !reason) {
      return res.status(400).json({ error: 'employeeId, month, amount, and reason are required.' });
    }

    // Parse month string "YYYY-MM" or accept separate month/year
    let year, monthNum;
    if (typeof month === 'string' && month.includes('-')) {
      const parts = month.split('-');
      year = parseInt(parts[0]);
      monthNum = parseInt(parts[1]);
    } else {
      // If month is just a number, use current year
      monthNum = parseInt(month);
      year = req.body.year || new Date().getFullYear();
    }

    const record = await SalaryMonthly.findOne({ user: employeeId, month: monthNum, year });
    if (!record) {
      return res.status(404).json({ error: 'No salary record found for this employee and month.' });
    }

    if (record.status === 'finalized') {
      return res.status(400).json({ error: 'Cannot add bonus to a finalized salary record.' });
    }

    // Add the bonus to performanceBonuses
    record.performanceBonuses.push({ name: reason, amount: parseFloat(amount) });

    // Recalculate totals
    record.totalBonuses = (record.fixedBonus || 0) +
      record.performanceBonuses.reduce((sum, b) => sum + b.amount, 0);
    record.netSalary = record.grossSalary - record.totalTax + record.totalBonuses;

    await record.save();

    // Notify employee (DB + push)
    const { notifyUser } = require('../utils/notify');
    await notifyUser(req.app.get('io'), employeeId, {
      type: 'salary',
      title: 'Bonus Added',
      message: `A bonus of INR ${amount} has been added to your ${monthNum}/${year} salary: ${reason}`,
      entityType: 'salary',
      entityId: record._id,
      sender: req.user._id
    });

    res.json(record);
  } catch (err) {
    console.error('Add bonus error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ══════════════════════════════════════
//  DISPUTE THREAD & SETTLEMENT
// ══════════════════════════════════════

// POST /api/v1/salary/disputes/:id/message — add message to dispute thread
router.post('/disputes/:id/message', protect, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required.' });
    }

    const dispute = await SalaryDispute.findById(req.params.id);
    if (!dispute) {
      return res.status(404).json({ error: 'Dispute not found.' });
    }

    // Only the dispute owner or admin with power can add messages
    const isOwner = dispute.user.toString() === req.user._id.toString();
    const isAdmin = req.user.hasPower('salary', 'resolveDisputes');
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to message on this dispute.' });
    }

    dispute.thread.push({
      user: req.user._id,
      message: message.trim(),
      timestamp: new Date()
    });
    await dispute.save();

    const populated = await SalaryDispute.findById(dispute._id)
      .populate('user', 'name email avatar')
      .populate('thread.user', 'name avatar')
      .populate('resolvedBy', 'name');

    // Notify the other party (DB + push)
    const { notifyUser } = require('../utils/notify');
    const notifyUserId = isOwner ? dispute.assignedTo : dispute.user;
    if (notifyUserId) {
      await notifyUser(req.app.get('io'), notifyUserId, {
        type: 'salary',
        title: 'New Dispute Message',
        message: `${req.user.name} sent a message on dispute #${dispute._id.toString().slice(-6)}`,
        entityType: 'dispute',
        entityId: dispute._id,
        sender: req.user._id
      });
    }

    res.json(populated);
  } catch (err) {
    console.error('Dispute message error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/v1/salary/disputes/:id/settle — admin settles dispute
router.put('/disputes/:id/settle', protect, requirePower('salary', 'resolveDisputes'), async (req, res) => {
  try {
    const { amount, action } = req.body;

    if (!action || !['approve', 'decline'].includes(action)) {
      return res.status(400).json({ error: 'action must be "approve" or "decline".' });
    }

    const dispute = await SalaryDispute.findById(req.params.id);
    if (!dispute) {
      return res.status(404).json({ error: 'Dispute not found.' });
    }

    if (dispute.status === 'settled' || dispute.status === 'resolved' || dispute.status === 'rejected') {
      return res.status(400).json({ error: `Dispute is already ${dispute.status}.` });
    }

    if (action === 'approve') {
      const settleAmount = parseFloat(amount) || 0;
      if (settleAmount <= 0) {
        return res.status(400).json({ error: 'Settlement amount must be greater than 0.' });
      }

      dispute.settlementAmount = settleAmount;
      dispute.status = 'settled';
      dispute.resolvedBy = req.user._id;
      dispute.resolvedAt = new Date();
      dispute.resolution = `Settled with INR ${settleAmount}`;
      await dispute.save();

      // Add settlement amount to the monthly salary record
      if (dispute.salaryRecord) {
        const record = await SalaryMonthly.findById(dispute.salaryRecord);
        if (record && record.status !== 'finalized') {
          record.performanceBonuses.push({
            name: `Dispute Settlement #${dispute._id.toString().slice(-6)}`,
            amount: settleAmount
          });
          record.totalBonuses = (record.fixedBonus || 0) +
            record.performanceBonuses.reduce((sum, b) => sum + b.amount, 0);
          record.netSalary = record.grossSalary - record.totalTax + record.totalBonuses;
          await record.save();
        }
      }
    } else {
      // decline
      dispute.settlementAmount = 0;
      dispute.status = 'rejected';
      dispute.resolvedBy = req.user._id;
      dispute.resolvedAt = new Date();
      dispute.rejectionReason = req.body.reason || 'Dispute declined during settlement.';
      await dispute.save();
    }

    const populated = await SalaryDispute.findById(dispute._id)
      .populate('user', 'name email avatar')
      .populate('thread.user', 'name avatar')
      .populate('resolvedBy', 'name');

    // Notify employee (DB + push)
    const { notifyUser } = require('../utils/notify');
    await notifyUser(req.app.get('io'), dispute.user._id || dispute.user, {
      type: 'salary',
      title: action === 'approve' ? 'Dispute Settled' : 'Dispute Declined',
      message: action === 'approve'
        ? `Your dispute has been settled with INR ${dispute.settlementAmount}.`
        : dispute.rejectionReason,
      entityType: 'dispute',
      entityId: dispute._id,
      sender: req.user._id
    });

    res.json(populated);
  } catch (err) {
    console.error('Settle dispute error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
