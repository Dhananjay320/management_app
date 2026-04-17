require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const { SalaryStructure, EmployeeOverride, SalaryMonthly, SalaryDispute } = require('./models/Salary');

async function seedSalary() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Clear
  await SalaryStructure.deleteMany({});
  await EmployeeOverride.deleteMany({});
  await SalaryMonthly.deleteMany({});
  await SalaryDispute.deleteMany({});

  const admin = await User.findOne({ email: 'admin@avadeti.com' });
  const priya = await User.findOne({ email: 'priya@avadeti.com' });
  const ravi = await User.findOne({ email: 'ravi@avadeti.com' });
  const meera = await User.findOne({ email: 'meera@avadeti.com' });

  if (!admin || !priya || !ravi || !meera) {
    console.error('Users not found. Run seed.js first.');
    process.exit(1);
  }

  // Update user salary configs if not already set
  await User.updateOne({ _id: admin._id }, { salary: { base: 150000, tds: 15000, pf: 1800, esi: 0, fixedBonus: 10000 } });
  await User.updateOne({ _id: priya._id }, { salary: { base: 85000, tds: 8500, pf: 1800, esi: 750, fixedBonus: 5000 } });
  await User.updateOne({ _id: ravi._id }, { salary: { base: 65000, tds: 6500, pf: 1800, esi: 750, fixedBonus: 3000 } });
  await User.updateOne({ _id: meera._id }, { salary: { base: 60000, tds: 6000, pf: 1800, esi: 750, fixedBonus: 2000 } });
  console.log('User salary configs updated');

  // ─── Company Deduction Rules ───
  const rules = await SalaryStructure.create({
    perAbsentDay: 2000,
    perHalfDay: 1000,
    perUnapprovedLeave: 3000,
    bonusRules: [
      { name: 'Perfect Attendance Bonus', condition: 'perfect_attendance', amount: 5000 },
      { name: 'Zero Absences Bonus', condition: 'zero_absences', amount: 2000 }
    ],
    updatedBy: admin._id
  });
  console.log('Company deduction rules created');

  // ─── Monthly Salary Records (March 2026) ───
  const month = 3, year = 2026;

  await SalaryMonthly.create({
    user: priya._id, month, year,
    baseSalary: 85000, workingDays: 26, presentDays: 24, absentDays: 0, halfDays: 1, leaveDays: 1, unapprovedLeaveDays: 0,
    deductions: [{ name: 'Half days', amount: 1000, count: 1 }],
    totalDeductions: 1000,
    tds: 8500, pf: 1800, esi: 750, totalTax: 11050,
    fixedBonus: 5000,
    performanceBonuses: [{ name: 'Zero Absences Bonus', amount: 2000 }],
    totalBonuses: 7000,
    grossSalary: 84000, netSalary: 79950,
    status: 'finalized', finalizedBy: admin._id, finalizedAt: new Date('2026-04-01')
  });

  await SalaryMonthly.create({
    user: ravi._id, month, year,
    baseSalary: 65000, workingDays: 26, presentDays: 22, absentDays: 2, halfDays: 0, leaveDays: 2, unapprovedLeaveDays: 0,
    deductions: [{ name: 'Absent days', amount: 4000, count: 2 }],
    totalDeductions: 4000,
    tds: 6500, pf: 1800, esi: 750, totalTax: 9050,
    fixedBonus: 3000,
    performanceBonuses: [],
    totalBonuses: 3000,
    grossSalary: 61000, netSalary: 54950,
    status: 'finalized', finalizedBy: admin._id, finalizedAt: new Date('2026-04-01')
  });

  await SalaryMonthly.create({
    user: meera._id, month, year,
    baseSalary: 60000, workingDays: 26, presentDays: 26, absentDays: 0, halfDays: 0, leaveDays: 0, unapprovedLeaveDays: 0,
    deductions: [],
    totalDeductions: 0,
    tds: 6000, pf: 1800, esi: 750, totalTax: 8550,
    fixedBonus: 2000,
    performanceBonuses: [
      { name: 'Perfect Attendance Bonus', amount: 5000 },
      { name: 'Zero Absences Bonus', amount: 2000 }
    ],
    totalBonuses: 9000,
    grossSalary: 60000, netSalary: 60450,
    status: 'finalized', finalizedBy: admin._id, finalizedAt: new Date('2026-04-01')
  });

  // April 2026 — draft (current month)
  await SalaryMonthly.create({
    user: priya._id, month: 4, year: 2026,
    baseSalary: 85000, workingDays: 26, presentDays: 12, absentDays: 0, halfDays: 0, leaveDays: 0, unapprovedLeaveDays: 0,
    deductions: [], totalDeductions: 0,
    tds: 8500, pf: 1800, esi: 750, totalTax: 11050,
    fixedBonus: 5000, performanceBonuses: [], totalBonuses: 5000,
    grossSalary: 85000, netSalary: 78950,
    status: 'draft'
  });

  await SalaryMonthly.create({
    user: ravi._id, month: 4, year: 2026,
    baseSalary: 65000, workingDays: 26, presentDays: 11, absentDays: 1, halfDays: 0, leaveDays: 0, unapprovedLeaveDays: 0,
    deductions: [{ name: 'Absent days', amount: 2000, count: 1 }],
    totalDeductions: 2000,
    tds: 6500, pf: 1800, esi: 750, totalTax: 9050,
    fixedBonus: 3000, performanceBonuses: [], totalBonuses: 3000,
    grossSalary: 63000, netSalary: 56950,
    status: 'draft'
  });

  console.log('Monthly salary records created');

  // ─── Sample Dispute ───
  const raviMarchRecord = await SalaryMonthly.findOne({ user: ravi._id, month: 3, year: 2026 });
  await SalaryDispute.create({
    user: ravi._id, month: 3, year: 2026,
    salaryRecord: raviMarchRecord._id,
    whatIsWrong: 'Absent days count incorrect',
    description: 'I was marked absent on March 12 but I was working from home that day. My attendance shows remote check-in at 9:15 AM. Please review.',
    status: 'open',
    assignedTo: priya._id
  });

  console.log('Sample dispute created');

  console.log('\n✅ Salary seed complete!');
  process.exit(0);
}

seedSalary().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
