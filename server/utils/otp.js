const crypto = require('crypto');
const mongoose = require('mongoose');

// OTP schema — stored in memory/DB, NOT sent to user
const otpSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  code: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 3 },
  expiresAt: { type: Date, required: true },
  isUsed: { type: Boolean, default: false },
  usedAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const OTP = mongoose.model('OTP', otpSchema);

function generateOTPCode() {
  return crypto.randomInt(100000, 999999).toString();
}

async function createOTP(userId) {
  // Invalidate any existing OTPs for this user
  await OTP.updateMany({ userId, isUsed: false }, { isUsed: true });

  const code = generateOTPCode();
  const otp = await OTP.create({
    userId,
    code,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
  });

  // Log to backend console (as per spec — OTP goes to admin chain + console)
  console.log(`[OTP] User ${userId}: ${code} (expires in 10 min)`);

  return otp;
}

async function verifyOTP(userId, code) {
  const otp = await OTP.findOne({ userId, isUsed: false, expiresAt: { $gt: new Date() } })
    .sort({ createdAt: -1 });

  if (!otp) return { valid: false, error: 'No valid OTP found. Please request a new one.' };

  if (otp.attempts >= otp.maxAttempts) {
    otp.isUsed = true;
    await otp.save();
    return { valid: false, error: 'Maximum attempts reached. Please request a new OTP.' };
  }

  if (otp.code !== code) {
    otp.attempts += 1;
    await otp.save();
    const remaining = otp.maxAttempts - otp.attempts;
    return { valid: false, error: `Incorrect OTP. ${remaining} attempt(s) remaining.` };
  }

  otp.isUsed = true;
  otp.usedAt = new Date();
  await otp.save();
  return { valid: true };
}

module.exports = { OTP, createOTP, verifyOTP };
