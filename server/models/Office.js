const mongoose = require('mongoose');

const officeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  wifiSubnet: { type: String, required: true }, // Legacy single prefix — kept for back-compat
  // Additional WiFi prefixes (IPv4 first-3-octets or IPv6 prefix). When the ISP
  // changes the public IPv6 prefix (common with Jio), admin can add the new
  // one here without losing the old. ALL entries are tried; first match wins.
  wifiSubnets: { type: [String], default: [] },
  radiusMeters: { type: Number, default: 100 },
  address: { type: String },
  // Weekly off days override for this office (0=Sun..6=Sat). Empty array = use company default.
  weeklyOffDays: { type: [Number], default: undefined },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Office', officeSchema);
