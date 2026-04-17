const router = require('express').Router();
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

// Helper: calculate working days in a month (exclude Sundays)
function getWorkingDays(year, month) {
  let count = 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(year, month - 1, d).getDay();
    if (day !== 0) count++; // Exclude Sundays
  }
  return count;
}

// POST /api/v1/salary/generate — generate/recalculate monthly salary for a user
router.post('/generate', protect, requirePower('salary', 'editStructure'), async (req, res) => {
  try {
    const { userId, month, year } = req.body;

    const employee = await User.findById(userId);
    if (!employee) return res.status(404).json({ error: 'Employee not found.' });

    // Get rules (employee override or company default)
    const companyRules = await SalaryStructure.findOne({ isActive: true });
    const override = await EmployeeOverride.findOne({ user: userId });

    const perAbsentDay = override?.perAbsentDay ?? companyRules?.perAbsentDay ?? 0;
    const perHalfDay = override?.perHalfDay ?? companyRules?.perHalfDay ?? 0;
    const perUnapprovedLeave = override?.perUnapprovedLeave ?? companyRules?.perUnapprovedLeave ?? 0;

    // Count attendance for the month
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
    const baseSalary = employee.salary?.base || 0;
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

    // Generate simple HTML-to-text PDF-like content (plain text format for download)
    // In production, use pdf-lib or puppeteer for real PDF
    const fmt = (n) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n || 0);

    let lines = [];
    lines.push('═══════════════════════════════════════');
    lines.push('           SALARY SLIP');
    lines.push(`         ${monthName} ${year}`);
    lines.push('═══════════════════════════════════════');
    lines.push('');
    lines.push(`Employee: ${employee.name}`);
    lines.push(`Email: ${employee.email}`);
    if (employee.jobTitle) lines.push(`Title: ${employee.jobTitle}`);
    lines.push('');
    lines.push('───────────────────────────────────────');
    lines.push('ATTENDANCE SUMMARY');
    lines.push(`  Working Days:        ${record.workingDays}`);
    lines.push(`  Present:             ${record.presentDays}`);
    lines.push(`  Absent:              ${record.absentDays}`);
    lines.push(`  Half Days:           ${record.halfDays}`);
    lines.push(`  Leaves:              ${record.leaveDays}`);
    lines.push('');
    lines.push('───────────────────────────────────────');
    lines.push('EARNINGS');
    lines.push(`  Base Salary:         INR ${fmt(record.baseSalary)}`);
    lines.push('');

    if (record.deductions?.length > 0) {
      lines.push('DEDUCTIONS');
      record.deductions.forEach(d => {
        lines.push(`  ${d.name} (${d.count}):   - INR ${fmt(d.amount)}`);
      });
      lines.push(`  Total Deductions:    - INR ${fmt(record.totalDeductions)}`);
      lines.push('');
    }

    lines.push('TAX DEDUCTIONS');
    if (record.tds > 0) lines.push(`  TDS:                 - INR ${fmt(record.tds)}`);
    if (record.pf > 0) lines.push(`  PF:                  - INR ${fmt(record.pf)}`);
    if (record.esi > 0) lines.push(`  ESI:                 - INR ${fmt(record.esi)}`);
    lines.push(`  Total Tax:           - INR ${fmt(record.totalTax)}`);
    lines.push('');

    if (record.totalBonuses > 0) {
      lines.push('BONUSES');
      if (record.fixedBonus > 0) lines.push(`  Fixed Bonus:         + INR ${fmt(record.fixedBonus)}`);
      record.performanceBonuses?.forEach(b => {
        lines.push(`  ${b.name}:  + INR ${fmt(b.amount)}`);
      });
      lines.push(`  Total Bonuses:       + INR ${fmt(record.totalBonuses)}`);
      lines.push('');
    }

    lines.push('═══════════════════════════════════════');
    lines.push(`  NET SALARY:          INR ${fmt(record.netSalary)}`);
    lines.push('═══════════════════════════════════════');
    lines.push('');
    lines.push(`Generated: ${new Date().toLocaleDateString()}`);
    lines.push('This is a computer-generated document.');

    const content = lines.join('\n');

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename=salary_${employee.name.replace(/\s/g, '_')}_${monthName}_${year}.txt`);
    res.send(content);
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
      .sort({ createdAt: -1 });
    res.json(disputes);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/salary/disputes — raise dispute
router.post('/disputes', protect, async (req, res) => {
  try {
    const { month, year, whatIsWrong, description } = req.body;

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
      assignedTo: employee.manager
    });

    // Notify manager via socket
    const io = req.app.get('io');
    if (io && employee.manager) {
      io.to(`user:${employee.manager}`).emit('notification:new', {
        type: 'salary_dispute',
        title: 'New Salary Dispute',
        message: `${req.user.name} raised a dispute for ${month}/${year}`,
        disputeId: dispute._id
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

    // Notify employee
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${dispute.user._id}`).emit('notification:new', {
        type: 'salary_dispute_update',
        title: `Dispute ${status}`,
        message: status === 'resolved' ? resolution : rejectionReason || `Your dispute has been ${status}.`
      });
    }

    res.json(dispute);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
