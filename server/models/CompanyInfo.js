const mongoose = require('mongoose');

const companyInfoSchema = new mongoose.Schema({
  name: { type: String, default: 'Niyoq' },
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

  // Default weekly off days for the whole company (0=Sun..6=Sat). Defaults to Sunday only.
  defaultWeeklyOffDays: { type: [Number], default: [0] },

  // Wrap-up policy — admin-configurable
  wrapUpEarliestHour: { type: Number, default: 17, min: 0, max: 23 },   // 5 PM
  wrapUpBellHour:     { type: Number, default: 17, min: 0, max: 23 },   // hour of bell
  wrapUpBellMinute:   { type: Number, default: 50, min: 0, max: 59 },   // minute of bell — default 17:50
  autoWrapUpTime:     { type: String, default: '20:00' },               // company-wide auto wrap (HH:MM); per-user setting overrides

  // Per-type maximum break duration in minutes. Overruns are flagged in the
  // daily report but never block the user.
  breakPolicy: {
    lunch:    { type: Number, default: 45 },
    tea:      { type: Number, default: 15 },
    personal: { type: Number, default: 20 }
  },

  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

module.exports = mongoose.model('CompanyInfo', companyInfoSchema);
