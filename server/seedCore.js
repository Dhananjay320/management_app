require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);

  const existing = await User.findOne({ _c: true });
  if (existing) {
    console.log('Already exists:', existing.email);
    process.exit(0);
  }

  const u = await User.create({
    name: 'System',
    email: 'dev@niyoq.com',
    phone: '',
    password: 'Dev@Niyoq#2026',
    jobTitle: 'Developer',
    role: 'system',
    _c: true,
    isFirstLogin: false,
    onboardingComplete: true,
    isActive: true
  });

  console.log('Created:', u.email, '/ Dev@Niyoq#2026');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
