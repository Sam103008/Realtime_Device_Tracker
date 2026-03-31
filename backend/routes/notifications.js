/**
 * Push Notification Routes
 * POST /api/notifications/subscribe   - Save push subscription
 * POST /api/notifications/unsubscribe - Remove push subscription
 */

const express = require('express');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

// Save push subscription
router.post('/subscribe', async (req, res) => {
  const { subscription } = req.body;
  if (!subscription) return res.status(400).json({ success: false, message: 'Subscription required.' });

  try {
    await User.findByIdAndUpdate(req.user._id, { pushSubscription: subscription });
    res.json({ success: true, message: 'Push subscription saved.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// Remove push subscription
router.post('/unsubscribe', async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { pushSubscription: null });
    res.json({ success: true, message: 'Unsubscribed from push notifications.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
