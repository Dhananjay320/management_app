require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const { SalaryStructure, EmployeeOverride, SalaryMonthly, SalaryDispute } = require('./models/Salary');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected');

  await SalaryMonthly.deleteMany({});
  await SalaryDispute.deleteMany({});
  await SalaryStructure.deleteMany({});
  await EmployeeOverride.deleteMany({});

  const users = await User.find({ isActive: true, _c: { $ne: true } });

  // Company deduction rules
  await SalaryStructure.create({
    perAbsentDay: 2000,
    perHalfDay: 1000,
    perUnapprovedLeave: 3000,
    bonusRules: [
      { name: 'Perfect Attendance', condition: 'zero_absences', description: 'Perfect attendance bonus', amount: 3000 },
      { name: 'No Half Days', condition: 'zero_half_days', description: 'No half days bonus', amount: 1000 }
    ]
  });

  // Generate 4 months of salary data: Jan, Feb, Mar, Apr 2026
  const months = [
    { month: 1, year: 2026 },
    { month: 2, year: 2026 },
    { month: 3, year: 2026 },
    { month: 4, year: 2026 }
  ];

  const userConfigs = {};
  for (const u of users) {
    const base = u.salary?.base || 50000;
    const tds = u.salary?.tds || Math.round(base * 0.05);
    const pf = u.salary?.pf || Math.round(base * 0.04);
    const esi = u.salary?.esi || Math.round(base * 0.01);
    const fixedBonus = u.salary?.fixedBonus || 0;
    userConfigs[u._id.toString()] = { base, tds, pf, esi, fixedBonus, name: u.name };
  }

  let totalRecords = 0;

  for (const { month, year } of months) {
    for (const u of users) {
      const cfg = userConfigs[u._id.toString()];
      const workingDays = month === 2 ? 24 : 26;

      // Randomize attendance slightly per month
      const absentDays = Math.floor(Math.random() * 3);
      const halfDays = Math.floor(Math.random() * 2);
      const leaveDays = Math.floor(Math.random() * 2);
      const unapprovedDays = Math.random() > 0.8 ? 1 : 0;
      const presentDays = workingDays - absentDays - halfDays - leaveDays - unapprovedDays;

      // Deductions
      const deductions = [];
      if (absentDays > 0) deductions.push({ name: 'Absent days', amount: absentDays * 2000, count: absentDays });
      if (halfDays > 0) deductions.push({ name: 'Half days', amount: halfDays * 1000, count: halfDays });
      if (unapprovedDays > 0) deductions.push({ name: 'Unapproved leave', amount: unapprovedDays * 3000, count: unapprovedDays });
      const totalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0);

      // Tax
      const totalTax = cfg.tds + cfg.pf + cfg.esi;

      // Bonuses
      const performanceBonuses = [];
      if (absentDays === 0) performanceBonuses.push({ name: 'Perfect attendance', amount: 3000 });
      if (halfDays === 0) performanceBonuses.push({ name: 'No half days', amount: 1000 });
      const totalBonuses = cfg.fixedBonus + performanceBonuses.reduce((sum, b) => sum + b.amount, 0);

      // Calculate net
      const grossSalary = cfg.base - totalDeductions;
      const netSalary = grossSalary - totalTax + totalBonuses;

      await SalaryMonthly.create({
        user: u._id,
        month,
        year,
        baseSalary: cfg.base,
        workingDays,
        presentDays,
        absentDays,
        halfDays,
        leaveDays,
        unapprovedLeaveDays: unapprovedDays,
        deductions,
        totalDeductions,
        tds: cfg.tds,
        pf: cfg.pf,
        esi: cfg.esi,
        totalTax,
        fixedBonus: cfg.fixedBonus,
        performanceBonuses,
        totalBonuses,
        grossSalary,
        netSalary,
        status: month < 4 ? 'finalized' : 'draft',
        finalizedAt: month < 4 ? new Date(year, month, 1) : undefined,
        generatedAt: new Date(year, month - 1, 28)
      });

      totalRecords++;
    }
  }

  // Create a dispute from Ravi for March
  const ravi = users.find(u => u.name.includes('Ravi'));
  const raviMarch = await SalaryMonthly.findOne({ user: ravi._id, month: 3, year: 2026 });
  if (ravi && raviMarch) {
    await SalaryDispute.create({
      user: ravi._id,
      month: 3,
      year: 2026,
      salaryRecord: raviMarch._id,
      whatIsWrong: 'Absent Day Count',
      description: 'Absent day count is incorrect — I was present on March 12 but marked absent. Please check attendance logs.',
      status: 'open'
    });
  }

  // Create a resolved dispute from Priya for Feb
  const priya = users.find(u => u.name.includes('Priya'));
  const admin = users.find(u => u.role === 'main_admin');
  if (priya) {
    await SalaryDispute.create({
      user: priya._id,
      month: 2,
      year: 2026,
      whatIsWrong: 'Bonus Missing',
      description: 'Performance bonus was not applied for February despite zero absences.',
      status: 'resolved',
      resolution: 'Bonus has been added to the March salary. Apologies for the oversight.',
      resolvedBy: admin?._id,
      resolvedAt: new Date(2026, 2, 5)
    });
  }

  console.log(`Salary seeded: ${totalRecords} monthly records (${months.length} months × ${users.length} users)`);
  console.log(`  + Company deduction rules`);
  console.log(`  + 2 disputes (1 open, 1 resolved)`);
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
