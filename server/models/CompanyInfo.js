const mongoose = require('mongoose');

const companyInfoSchema = new mongoose.Schema({
  name: { type: String, default: 'Avadeti Team' },
  about: { type: String, default: '' },
  logo: { type: String }, // Path or URL
  tagline: { type: String, default: '' },

  // Contact
  email: { type: String, default: '' },
  phone: { type: String, default: '' },
  address: { type: String, default: '' },
  website: { type: String, default: '' },

  // Social links
  social: {
    linkedin: { type: String, default: '' },
    twitter: { type: String, default: '' },
    instagram: { type: String, default: '' },
    github: { type: String, default: '' }
  },

  // Welcome message shown during onboarding
  welcomeMessage: { type: String, default: 'Welcome to the team! We\'re excited to have you.' },

  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

module.exports = mongoose.model('CompanyInfo', companyInfoSchema);
