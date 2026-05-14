const mongoose = require('mongoose');

const officeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  wifiSubnet: { type: String, required: true }, // First 3 octets e.g. '192.168.1'
  radiusMeters: { type: Number, default: 100 },
  address: { type: String },
  // Weekly off days override for this office (0=Sun..6=Sat). Empty array = use company default.
  weeklyOffDays: { type: [Number], default: undefined },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Office', officeSchema);
