/**
 * Geofence Checker Utility
 * Called every time a device sends a location update.
 * Checks all active geofences for the device's owner
 * and emits alerts if the device enters/exits a fence.
 */

const Geofence = require('../models/Geofence');

/**
 * Haversine formula – distance between two lat/lng points in meters
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * checkGeofences
 * @param {Object} device  - Mongoose Device document
 * @param {number} lat
 * @param {number} lng
 * @param {Object} io      - Socket.IO server instance
 */
async function checkGeofences(device, lat, lng, io) {
  try {
    // Fetch all active geofences for this device's owner
    // (either unlinked global fences or fences tied to this device)
    const geofences = await Geofence.find({
      owner: device.owner,
      isActive: true,
      $or: [{ device: null }, { device: device._id }]
    });

    for (const fence of geofences) {
      const distance = haversineDistance(lat, lng, fence.center.lat, fence.center.lng);
      const isInsideNow = distance <= fence.radius;

      // Find previous state for this device in this fence
      let stateEntry = fence.deviceStates.find(
        (s) => s.deviceId.toString() === device._id.toString()
      );

      const wasInside = stateEntry ? stateEntry.isInside : null; // null = first check

      // Update state
      if (!stateEntry) {
        fence.deviceStates.push({ deviceId: device._id, isInside: isInsideNow, lastChecked: new Date() });
      } else {
        stateEntry.isInside = isInsideNow;
        stateEntry.lastChecked = new Date();
      }

      await fence.save();

      // Determine if we need to send an alert (state changed from known previous state)
      if (wasInside !== null && wasInside !== isInsideNow) {
        let alert = null;

        if (!isInsideNow && fence.alertOnExit) {
          // Device LEFT the fence
          alert = {
            type: 'geofence_exit',
            fenceId: fence._id,
            fenceName: fence.name,
            deviceId: device._id,
            deviceName: device.name,
            message: `🚨 ${device.name} left geofence "${fence.name}"`,
            lat,
            lng,
            timestamp: new Date()
          };
        } else if (isInsideNow && fence.alertOnEnter) {
          // Device ENTERED the fence
          alert = {
            type: 'geofence_enter',
            fenceId: fence._id,
            fenceName: fence.name,
            deviceId: device._id,
            deviceName: device.name,
            message: `✅ ${device.name} entered geofence "${fence.name}"`,
            lat,
            lng,
            timestamp: new Date()
          };
        }

        if (alert && io) {
          io.to(`user_${device.owner}`).emit('alert', alert);
          console.log(`🚧 Geofence alert: ${alert.message}`);
        }
      }
    }
  } catch (err) {
    console.error('Geofence check error:', err);
  }
}

module.exports = { checkGeofences, haversineDistance };
