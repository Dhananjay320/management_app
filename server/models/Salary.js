const mongoose = require('mongoose');

// ─── Company Deduction Rules (set once by admin, overridable per employee) ───
const salaryStructureSchema = new mongoose.Schema({
  // Company-wide default rules
  perAbsentDay: { type: Number, default: 0 },       // Deduction per absent day
  perHalfDay: { type: Number, default: 0 },          // Deduction per half day
  perUnapprovedLeave: { type: Number, default: 0 },  // Deduction per unapproved leave

  // Bonus rules (auto-applied at month end)
  bonusRules: [{
    name: { type: String, required: true },       // e.g. "Perfect Attendance Bonus"
    condition: { type: String, required: true },   // e.g. "zero_absences", "max_2_leaves", "perfect_attendance"
    amount: { type: Number, required: true }
  }],

  // Who set this
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

// ─── Per-Employee Override (optional — overrides company defaults) ───
const employeeOverrideSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  perAbsentDay: { type: Number },
  perHalfDay: { type: Number },
  perUnapprovedLeave: { type: Number },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

employeeOverrideSchema.index({ user: 1 });

// ─── Monthly Salary Record (generated per employee per month) ───
const salaryMonthlySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  month: { type: Number, required: true },   // 1-12
  year: { type: Number, required: true },

  // Base
  baseSalary: { type: Number, default: 0 },

  // Attendance counts (for that month)
  workingDays: { type: Number, default: 0 },
  presentDays: { type: Number, default: 0 },
  absentDays: { type: Number, default: 0 },
  halfDays: { type: Number, default: 0 },
  leaveDays: { type: Number, default: 0 },
  unapprovedLeaveDays: { type: Number, default: 0 },

  // Deductions itemized
  deductions: [{
    name: { type: String },
    amount: { type: Number },
    count: { type: Number }     // e.g., 3 absent days
  }],
  totalDeductions: { type: Number, default: 0 },

  // Tax
  tds: { type: Number, default: 0 },
  pf: { type: Number, default: 0 },
  esi: { type: Number, default: 0 },
  totalTax: { type: Number, default: 0 },

  // Bonuses
  fixedBonus: { type: Number, default: 0 },
  performanceBonuses: [{
    name: { type: String },
    amount: { type: Number }
  }],
  totalBonuses: { type: Number, default: 0 },

  // Net
  grossSalary: { type: Number, default: 0 },   // base - deductions
  netSalary: { type: Number, default: 0 },      // gross - tax + bonuses

  // Status
  status: { type: String, enum: ['draft', 'finalized'], default: 'draft' },
  finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  finalizedAt: { type: Date },

  generatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

salaryMonthlySchema.index({ user: 1, year: 1, month: 1 }, { unique: true });

// ─── Salary Dispute ───
const salaryDisputeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  month: { type: Number, required: true },
  year: { type: Number, required: true },
  salaryRecord: { type: mongoose.Schema.Types.ObjectId, ref: 'SalaryMonthly' },

  description: { type: String, required: true },
  whatIsWrong: { type: String, required: true },

  // Status
  status: { type: String, enum: ['open', 'resolved', 'rejected', 'escalated'], default: 'open' },
  resolution: { type: String },
  rejectionReason: { type: String },

  // Handled by
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Manager or HR
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolvedAt: { type: Date },

  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

salaryDisputeSchema.index({ user: 1, year: 1, month: 1 });
salaryDisputeSchema.index({ status: 1 });

const SalaryStructure = mongoose.model('SalaryStructure', salaryStructureSchema);
const EmployeeOverride = mongoose.model('EmployeeOverride', employeeOverrideSchema);
const SalaryMonthly = mongoose.model('SalaryMonthly', salaryMonthlySchema);
const SalaryDispute = mongoose.model('SalaryDispute', salaryDisputeSchema);

module.exports = { SalaryStructure, EmployeeOverride, SalaryMonthly, SalaryDispute };
