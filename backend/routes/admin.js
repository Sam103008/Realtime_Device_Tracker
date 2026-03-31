/**
 * Admin Routes (role: admin only)
 * GET /api/admin/users          - List all users
 * PUT /api/admin/users/:id      - Update user (activate/deactivate/change role)
 * DELETE /api/admin/users/:id   - Delete user
 * GET /api/admin/stats          - Dashboard statistics
 */

const express = require('express');
const User = require('../models/User');
const Device = require('../models/Device');
const LocationHistory = require('../models/LocationHistory');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(protect, authorize('admin'));

// GET all users
router.get('/users', async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 }).select('-password');
    res.json({ success: true, count: users.length, users });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PUT update user
router.put('/users/:id', async (req, res) => {
  const { role, isActive } = req.body;
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role, isActive },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// DELETE user (also removes their devices and location data)
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    const devices = await Device.find({ owner: user._id });
    const deviceIds = devices.map(d => d._id);

    await LocationHistory.deleteMany({ device: { $in: deviceIds } });
    await Device.deleteMany({ owner: user._id });
    await User.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'User and all associated data deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET admin dashboard stats
router.get('/stats', async (req, res) => {
  try {
    const [totalUsers, totalDevices, totalPings, onlineDevices] = await Promise.all([
      User.countDocuments(),
      Device.countDocuments(),
      LocationHistory.countDocuments(),
      Device.countDocuments({ status: 'online' })
    ]);

    const recentUsers = await User.find().sort({ createdAt: -1 }).limit(5).select('name email createdAt');

    res.json({
      success: true,
      stats: { totalUsers, totalDevices, totalPings, onlineDevices },
      recentUsers
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
