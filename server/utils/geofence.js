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

// Check if device is on office WiFi (subnet match) — IPv4 and IPv6.
//   - Strips Express's "::ffff:" prefix from IPv4-mapped IPv6 addresses.
//   - X-Forwarded-For can be a comma-separated list — takes the first entry.
//   - Subnet like "2401:4900:88" matches "2401:4900:88:abcd:..." but NOT
//     "2401:4900:8800:..." — we require a separator (`.` or `:`) right after
//     the prefix so partial-numeric overlaps don't false-match.
//   - Legacy IPv4 subnet of the form "192.168.1" still works the same way.
function isOnOfficeWifi(deviceIP, officeWifiSubnet) {
  if (!deviceIP || !officeWifiSubnet) return false;
  let ip = String(deviceIP).split(',')[0].trim().toLowerCase();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  const sub = String(officeWifiSubnet).trim().toLowerCase();
  if (!ip || !sub) return false;
  if (ip === sub) return true;
  if (!ip.startsWith(sub)) return false;
  const nextChar = ip[sub.length];
  return nextChar === '.' || nextChar === ':';
}

// Collect every wifi prefix configured for the office — legacy single field
// `wifiSubnet` PLUS the new array `wifiSubnets`. Deduplicated, trimmed,
// lowercased. Empty strings filtered out so an admin can clear the legacy
// field by setting it to "" without breaking iteration.
function allOfficeSubnets(office) {
  const list = [];
  if (office?.wifiSubnet) list.push(String(office.wifiSubnet).trim().toLowerCase());
  if (Array.isArray(office?.wifiSubnets)) {
    for (const s of office.wifiSubnets) {
      if (s) list.push(String(s).trim().toLowerCase());
    }
  }
  return [...new Set(list.filter(Boolean))];
}

// Dual layer check-in verification.
// Order: GPS first when coords are available — matches the spec ("if we get
// coordinates and valid, match them"). WiFi is the fallback for indoor cases
// where GPS is missing or beyond the radius. All known subnets are tried.
function verifyLocation(office, deviceIP, coordinates) {
  const subnets = allOfficeSubnets(office);

  // Layer 1: GPS check
  let gpsDistance = null;
  if (coordinates && coordinates.lat && coordinates.lng) {
    const distance = getDistanceMeters(
      coordinates.lat, coordinates.lng,
      office.lat, office.lng
    );
    gpsDistance = Math.round(distance);
    if (distance <= office.radiusMeters) {
      return { allowed: true, method: 'gps', distance: gpsDistance, matchedSubnet: null };
    }
  }

  // Layer 2: WiFi subnet — try every known prefix
  if (deviceIP) {
    for (const sub of subnets) {
      if (isOnOfficeWifi(deviceIP, sub)) {
        return { allowed: true, method: 'wifi', distance: gpsDistance, matchedSubnet: sub };
      }
    }
  }

  // Neither path matched
  return { allowed: false, method: gpsDistance !== null ? 'gps' : 'none', distance: gpsDistance, matchedSubnet: null };
}

module.exports = { getDistanceMeters, isOnOfficeWifi, verifyLocation, allOfficeSubnets };
