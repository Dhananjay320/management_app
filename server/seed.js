require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Team = require('./models/Team');
const Office = require('./models/Office');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Clear existing data
  await User.deleteMany({});
  await Team.deleteMany({});
  await Office.deleteMany({});

  // Create office (San Francisco-ish coordinates as a generic placeholder)
  const office = await Office.create({
    name: 'Main HQ',
    lat: 37.7749,
    lng: -122.4194,
    wifiSubnet: '192.168.1',
    radiusMeters: 100,
    address: '1 Market Street, San Francisco, CA'
  });
  console.log('Office created:', office.name);

  // Create teams
  const techTeam = await Team.create({ name: 'Engineering', description: 'Engineering and development' });
  const designTeam = await Team.create({ name: 'Design', description: 'UI/UX and visual design' });
  console.log('Teams created:', techTeam.name, designTeam.name);

  // Main Admin (demo credentials — change in production)
  const mainAdmin = await User.create({
    name: 'Demo Admin',
    email: 'admin@example.com',
    phone: '+1 555 010 0001',
    password: 'Admin@123',
    jobTitle: 'Founder',
    role: 'main_admin',
    teams: [techTeam._id],
    office: office._id,
    workType: 'full_office',
    isFirstLogin: false,
    onboardingComplete: true,
    salary: { base: 100000 }
  });
  console.log('Main Admin created:', mainAdmin.email, '/ password: Admin@123');

  // Sample employees with neutral demo names
  const alice = await User.create({
    name: 'Alice Johnson',
    email: 'alice@example.com',
    phone: '+1 555 010 0002',
    password: 'TempPass!1',
    tempPassword: 'TempPass!1',
    jobTitle: 'Engineering Lead',
    role: 'admin',
    adminTitle: 'Team Lead',
    teams: [techTeam._id],
    office: office._id,
    manager: mainAdmin._id,
    workType: 'full_office',
    isFirstLogin: true,
    powers: {
      attendance: { viewTeam: true, viewIndividual: true },
      tasks: { viewMemberTasks: true, viewTeamTasks: true, createForOthers: true },
      meetings: { createCompanyWide: true, viewAll: true },
      analysis: { viewIndividual: true, viewTeam: true },
      security: { viewOTPs: true, unlockAccounts: true, viewSessions: true, forceLogout: true }
    },
    salary: { base: 80000, tds: 3000, pf: 2400 }
  });

  const bob = await User.create({
    name: 'Bob Martinez',
    email: 'bob@example.com',
    phone: '+1 555 010 0003',
    password: 'TempPass!2',
    tempPassword: 'TempPass!2',
    jobTitle: 'Frontend Developer',
    role: 'employee',
    teams: [techTeam._id],
    office: office._id,
    manager: alice._id,
    workType: 'hybrid',
    hybridOfficeDays: ['monday', 'tuesday', 'wednesday'],
    isFirstLogin: true,
    salary: { base: 60000, tds: 2000, pf: 1800 }
  });

  const carol = await User.create({
    name: 'Carol Singh',
    email: 'carol@example.com',
    phone: '+1 555 010 0004',
    password: 'TempPass!3',
    tempPassword: 'TempPass!3',
    jobTitle: 'UI/UX Designer',
    role: 'employee',
    teams: [designTeam._id],
    office: office._id,
    manager: alice._id,
    workType: 'full_remote',
    isFirstLogin: true,
    salary: { base: 55000, tds: 1800, pf: 1650 }
  });

  console.log('Employees created:');
  console.log('  alice@example.com / TempPass!1 (Team Lead)');
  console.log('  bob@example.com   / TempPass!2 (Developer)');
  console.log('  carol@example.com / TempPass!3 (Designer)');
  console.log('\nSeed complete!');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
