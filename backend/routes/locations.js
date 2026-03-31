/**
 * Location Routes
 * POST /api/locations/update   - Device pushes its current location (REST fallback)
 * GET  /api/locations/:deviceId/history - Get location history for a device
 * GET  /api/locations/:deviceId/path    - Get path (array of coords) for map polyline
 * DELETE /api/locations/:deviceId       - Clear location history
 */

const express = require('express');
const Device = require('../models/Device');
const LocationHistory = require('../models/LocationHistory');
const Geofence = require('../models/Geofence');
const { protect } = require('../middleware/auth');
const { checkGeofences } = require('../utils/geofenceChecker');

const router = express.Router();
router.use(protect);

// ─────────────────────────────────────────────
// POST /api/locations/update
// REST fallback for location push (Socket.IO is preferred)
// ─────────────────────────────────────────────
router.post('/update', async (req, res) => {
  const { deviceId, lat, lng, accuracy, altitude, speed, heading, battery, clientTimestamp } = req.body;

  if (!deviceId || lat === undefined || lng === undefined) {
    return res.status(400).json({ success: false, message: 'deviceId, lat, and lng are required.' });
  }

  try {
    // Find device owned by this user
    const device = await Device.findOne({ deviceId, owner: req.user._id });
    if (!device) return res.status(404).json({ success: false, message: 'Device not found.' });

    // Save location to history
    const locationRecord = await LocationHistory.create({
      device: device._id,
      owner: req.user._id,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      accuracy: accuracy ? parseFloat(accuracy) : null,
      altitude: altitude ? parseFloat(altitude) : null,
      speed: speed ? parseFloat(speed) : null,
      heading: heading ? parseFloat(heading) : null,
      battery: battery || {},
      clientTimestamp: clientTimestamp ? new Date(clientTimestamp) : new Date()
    });

    // Update device's lastLocation and battery
    device.lastLocation = { lat: parseFloat(lat), lng: parseFloat(lng), accuracy, timestamp: new Date() };
    device.status = 'online';
    if (battery) {
      device.battery = { level: battery.level, charging: battery.charging, updatedAt: new Date() };
    }
    await device.save();

    // Check geofences and emit alerts via Socket.IO
    checkGeofences(device, parseFloat(lat), parseFloat(lng), req.io);

    // Broadcast to dashboard via Socket.IO
    if (req.io) {
      req.io.to(`user_${req.user._id}`).emit('location_update', {
        deviceId: device._id,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        accuracy,
        battery: device.battery,
        timestamp: new Date()
      });
    }

    res.json({ success: true, location: locationRecord });
  } catch (err) {
    console.error('Location update error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─────────────────────────────────────────────
// GET /api/locations/:deviceId/history
// ─────────────────────────────────────────────
router.get('/:deviceId/history', async (req, res) => {
  const { limit = 100, from, to } = req.query;

  try {
    const device = await Device.findOne({ _id: req.params.deviceId, owner: req.user._id });
    if (!device) return res.status(404).json({ success: false, message: 'Device not found.' });

    const filter = { device: device._id };
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const history = await LocationHistory.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .select('lat lng accuracy speed battery createdAt clientTimestamp');

    res.json({ success: true, count: history.length, history });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─────────────────────────────────────────────
// GET /api/locations/:deviceId/path
// Returns ordered array of {lat, lng} for polyline
// ─────────────────────────────────────────────
router.get('/:deviceId/path', async (req, res) => {
  const { hours = 24 } = req.query;

  try {
    const device = await Device.findOne({ _id: req.params.deviceId, owner: req.user._id });
    if (!device) return res.status(404).json({ success: false, message: 'Device not found.' });

    const since = new Date(Date.now() - parseInt(hours) * 60 * 60 * 1000);

    const path = await LocationHistory.find({
      device: device._id,
      createdAt: { $gte: since }
    })
      .sort({ createdAt: 1 })
      .select('lat lng createdAt speed');

    res.json({ success: true, count: path.length, path });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─────────────────────────────────────────────
// DELETE /api/locations/:deviceId
// Clear all location history for a device
// ─────────────────────────────────────────────
router.delete('/:deviceId', async (req, res) => {
  try {
    const device = await Device.findOne({ _id: req.params.deviceId, owner: req.user._id });
    if (!device) return res.status(404).json({ success: false, message: 'Device not found.' });

    const { deletedCount } = await LocationHistory.deleteMany({ device: device._id });

    // Reset last location
    device.lastLocation = { lat: null, lng: null, accuracy: null, timestamp: null };
    await device.save();

    res.json({ success: true, message: `Deleted ${deletedCount} location records.` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
