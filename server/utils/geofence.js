// Haversine formula — distance between two GPS coordinates in meters
function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Check if device is on office WiFi (subnet match)
function isOnOfficeWifi(deviceIP, officeWifiSubnet) {
  if (!deviceIP || !officeWifiSubnet) return false;
  const deviceSubnet = deviceIP.split('.').slice(0, 3).join('.');
  return deviceSubnet === officeWifiSubnet;
}

// Dual layer check-in verification
function verifyLocation(office, deviceIP, coordinates) {
  // Layer 1: WiFi subnet check
  if (deviceIP && isOnOfficeWifi(deviceIP, office.wifiSubnet)) {
    return { allowed: true, method: 'wifi', distance: 0 };
  }

  // Layer 2: GPS check (100m radius)
  if (coordinates && coordinates.lat && coordinates.lng) {
    const distance = getDistanceMeters(
      coordinates.lat, coordinates.lng,
      office.lat, office.lng
    );
    if (distance <= office.radiusMeters) {
      return { allowed: true, method: 'gps', distance: Math.round(distance) };
    }
    return { allowed: false, method: 'gps', distance: Math.round(distance) };
  }

  return { allowed: false, method: 'none', distance: null };
}

module.exports = { getDistanceMeters, isOnOfficeWifi, verifyLocation };
