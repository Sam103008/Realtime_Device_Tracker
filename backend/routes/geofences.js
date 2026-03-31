/**
 * Geofence Routes
 * GET    /api/geofences           - List all geofences
 * POST   /api/geofences           - Create geofence
 * PUT    /api/geofences/:id       - Update geofence
 * DELETE /api/geofences/:id       - Delete geofence
 */

const express = require('express');
const Geofence = require('../models/Geofence');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

// GET all geofences
router.get('/', async (req, res) => {
  try {
    const geofences = await Geofence.find({ owner: req.user._id }).populate('device', 'name type icon');
    res.json({ success: true, geofences });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// POST create geofence
router.post('/', async (req, res) => {
  const { name, device, center, radius, color, alertOnExit, alertOnEnter } = req.body;

  if (!name || !center?.lat || !center?.lng || !radius) {
    return res.status(400).json({ success: false, message: 'name, center, and radius are required.' });
  }

  try {
    const geofence = await Geofence.create({
      owner: req.user._id,
      name,
      device: device || null,
      center,
      radius: parseInt(radius),
      color: color || '#ef4444',
      alertOnExit: alertOnExit !== undefined ? alertOnExit : true,
      alertOnEnter: alertOnEnter !== undefined ? alertOnEnter : false
    });

    res.status(201).json({ success: true, geofence });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PUT update geofence
router.put('/:id', async (req, res) => {
  try {
    const geofence = await Geofence.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!geofence) return res.status(404).json({ success: false, message: 'Geofence not found.' });

    res.json({ success: true, geofence });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// DELETE geofence
router.delete('/:id', async (req, res) => {
  try {
    const geofence = await Geofence.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
    if (!geofence) return res.status(404).json({ success: false, message: 'Geofence not found.' });

    res.json({ success: true, message: 'Geofence deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
