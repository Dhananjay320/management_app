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

  // Create office
  const office = await Office.create({
    name: 'Hyderabad HQ',
    lat: 17.385044,
    lng: 78.486671,
    wifiSubnet: '192.168.1',
    radiusMeters: 100,
    address: '123 Business Park, Hyderabad, India'
  });
  console.log('Office created:', office.name);

  // Create teams
  const techTeam = await Team.create({ name: 'Tech Team', description: 'Engineering and development' });
  const designTeam = await Team.create({ name: 'Design Team', description: 'UI/UX and visual design' });
  console.log('Teams created:', techTeam.name, designTeam.name);

  // Create Main Admin
  const mainAdmin = await User.create({
    name: 'Yugara Admin',
    email: 'admin@avadeti.com',
    phone: '+91 98765 43210',
    password: 'Admin@123',
    jobTitle: 'Company Owner',
    role: 'main_admin',
    teams: [techTeam._id],
    office: office._id,
    workType: 'full_office',
    isFirstLogin: false,
    onboardingComplete: true,
    salary: { base: 100000 }
  });
  console.log('Main Admin created:', mainAdmin.email, '/ password: Admin@123');

  // Create sample employees
  const priya = await User.create({
    name: 'Priya Sharma',
    email: 'priya@avadeti.com',
    phone: '+91 98765 43211',
    password: 'TempPass!1',
    tempPassword: 'TempPass!1',
    jobTitle: 'Team Lead',
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

  const ravi = await User.create({
    name: 'Ravi Kumar',
    email: 'ravi@avadeti.com',
    phone: '+91 98765 43212',
    password: 'TempPass!2',
    tempPassword: 'TempPass!2',
    jobTitle: 'Frontend Developer',
    role: 'employee',
    teams: [techTeam._id],
    office: office._id,
    manager: priya._id,
    workType: 'hybrid',
    hybridOfficeDays: ['monday', 'tuesday', 'wednesday'],
    isFirstLogin: true,
    salary: { base: 60000, tds: 2000, pf: 1800 }
  });

  const meera = await User.create({
    name: 'Meera Nair',
    email: 'meera@avadeti.com',
    phone: '+91 98765 43213',
    password: 'TempPass!3',
    tempPassword: 'TempPass!3',
    jobTitle: 'UI/UX Designer',
    role: 'employee',
    teams: [designTeam._id],
    office: office._id,
    manager: priya._id,
    workType: 'full_remote',
    isFirstLogin: true,
    salary: { base: 55000, tds: 1800, pf: 1650 }
  });

  console.log('Employees created:');
  console.log('  priya@avadeti.com / TempPass!1 (Team Lead)');
  console.log('  ravi@avadeti.com / TempPass!2 (Developer)');
  console.log('  meera@avadeti.com / TempPass!3 (Designer)');

  console.log('\nSeed complete!');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
