const mongoose = require('mongoose');

const apiConfigSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Type: 'personal' (default) or 'company' for company-wide key
  type: { type: String, enum: ['personal', 'company'], default: 'personal' },

  // Provider: gemini, openai, claude
  provider: { type: String, enum: ['gemini', 'openai', 'claude'], required: true },

  // Encrypted API key (in production, use Electron safeStorage; here stored encrypted)
  encryptedKey: { type: String, required: true },

  // Activation
  activationCode: { type: String },
  expiresAt: { type: Date },
  isActive: { type: Boolean, default: true },

  activatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

apiConfigSchema.index({ user: 1 });
apiConfigSchema.index({ type: 1 });

module.exports = mongoose.model('ApiConfig', apiConfigSchema);
