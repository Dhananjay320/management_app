require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const CompanyInfo = require('./models/CompanyInfo');

async function seedCompany() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  await CompanyInfo.deleteMany({});

  const admin = await User.findOne({ email: 'admin@avadeti.com' });

  await CompanyInfo.create({
    name: 'Avadeti Technologies',
    about: 'We build innovative tools that help teams collaborate better, work smarter, and stay connected — all from one unified platform.',
    tagline: 'Your team, one platform.',
    email: 'contact@avadeti.com',
    phone: '+91 40 1234 5678',
    address: '123 Business Park, HITEC City, Hyderabad, India',
    website: 'https://avadeti.com',
    social: {
      linkedin: 'https://linkedin.com/company/avadeti',
      twitter: 'https://twitter.com/avadeti',
      instagram: 'https://instagram.com/avadeti',
      github: 'https://github.com/avadeti'
    },
    welcomeMessage: 'Welcome to Avadeti Technologies! We\'re thrilled to have you join our team. Together, we\'re building something amazing.',
    updatedBy: admin?._id
  });

  console.log('Company info created');
  console.log('\n✅ Company seed complete!');
  process.exit(0);
}

seedCompany().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
