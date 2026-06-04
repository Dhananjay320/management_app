const mongoose = require('mongoose');

// Per-company classification for an app name. Used by the productivity score.
// One row per `app` string (case-insensitive — we lowercase on save).
//
// Categories follow the OjasTrack spec:
//   productive   — directly work-related
//   neutral      — could be work or personal (web search, WhatsApp)
//   unproductive — clearly not work (Instagram, Netflix, games)
//   uncategorized — default for any app the admin hasn't labelled yet
const appCategorySchema = new mongoose.Schema({
  app: { type: String, required: true, unique: true, lowercase: true, trim: true },
  category: {
    type: String,
    enum: ['productive', 'neutral', 'unproductive', 'uncategorized'],
    default: 'uncategorized'
  },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('AppCategory', appCategorySchema);
