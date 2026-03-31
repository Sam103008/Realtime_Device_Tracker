/**
 * Device Routes
 * GET    /api/devices          - List all devices for the logged-in user
 * POST   /api/devices          - Register a new device
 * GET    /api/devices/:id      - Get single device details
 * PUT    /api/devices/:id      - Update device info
 * DELETE /api/devices/:id      - Remove device
 * POST   /api/devices/:id/ping - Device sends a heartbeat (status update)
 */

const express = require('express');
const { v4: uuidv4 } = require('crypto').webcrypto ? 
  { v4: () => require('crypto').randomUUID() } : 
  { v4: () => require('crypto').randomUUID() };
const Device = require('../models/Device');
const LocationHistory = require('../models/LocationHistory');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All device routes are protected
router.use(protect);

// ─────────────────────────────────────────────
// GET /api/devices
// ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const devices = await Device.find({ owner: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, count: devices.length, devices });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─────────────────────────────────────────────
// POST /api/devices
// ─────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { name, type, icon, color, notes } = req.body;

  if (!name) {
    return res.status(400).json({ success: false, message: 'Device name is required.' });
  }

  try {
    // Generate a unique device ID
    const deviceId = require('crypto').randomUUID();

    const device = await Device.create({
      owner: req.user._id,
      name,
      deviceId,
      type: type || 'mobile',
      icon: icon || '📱',
      color: color || '#6366f1',
      notes: notes || ''
    });

    res.status(201).json({ success: true, device });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ success: false, message: 'Device ID already exists.' });
    }
    console.error('Create device error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─────────────────────────────────────────────
// GET /api/devices/:id
// ─────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const device = await Device.findOne({ _id: req.params.id, owner: req.user._id });

    if (!device) {
      return res.status(404).json({ success: false, message: 'Device not found.' });
    }

    res.json({ success: true, device });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─────────────────────────────────────────────
// PUT /api/devices/:id
// ─────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const { name, type, icon, color, notes, isActive } = req.body;

  try {
    const device = await Device.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      { name, type, icon, color, notes, isActive },
      { new: true, runValidators: true }
    );

    if (!device) {
      return res.status(404).json({ success: false, message: 'Device not found.' });
    }

    res.json({ success: true, device });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─────────────────────────────────────────────
// DELETE /api/devices/:id
// ─────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const device = await Device.findOneAndDelete({ _id: req.params.id, owner: req.user._id });

    if (!device) {
      return res.status(404).json({ success: false, message: 'Device not found.' });
    }

    // Also delete all location history for this device
    await LocationHistory.deleteMany({ device: device._id });

    res.json({ success: true, message: 'Device and its location history deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─────────────────────────────────────────────
// GET /api/devices/:id/stats
// Get device statistics (total pings, distance traveled, etc.)
// ─────────────────────────────────────────────
router.get('/:id/stats', async (req, res) => {
  try {
    const device = await Device.findOne({ _id: req.params.id, owner: req.user._id });
    if (!device) return res.status(404).json({ success: false, message: 'Device not found.' });

    const totalPings = await LocationHistory.countDocuments({ device: device._id });

    // Get pings from last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentPings = await LocationHistory.countDocuments({
      device: device._id,
      createdAt: { $gte: oneDayAgo }
    });

    res.json({
      success: true,
      stats: {
        totalPings,
        recentPings,
        status: device.status,
        lastSeen: device.lastLocation?.timestamp,
        battery: device.battery
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
