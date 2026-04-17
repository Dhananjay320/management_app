const mongoose = require('mongoose');

const apiConfigSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },

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

module.exports = mongoose.model('ApiConfig', apiConfigSchema);
