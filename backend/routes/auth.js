/**
 * Auth Routes
 * POST /api/auth/register
 * POST /api/auth/login
 * GET  /api/auth/me
 * PUT  /api/auth/profile
 * POST /api/auth/logout
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

// ─────────────────────────────────────────────
// @route  POST /api/auth/register
// @access Public
// ─────────────────────────────────────────────
router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
  ],
  async (req, res) => {
    // Validate inputs
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, email, password } = req.body;

    try {
      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ success: false, message: 'Email already registered.' });
      }

      // Create user (password hashed in pre-save hook)
      const user = await User.create({ name, email, password });

      // Generate JWT
      const token = user.generateJWT();

      res.status(201).json({
        success: true,
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
  }
);

// ─────────────────────────────────────────────
// @route  POST /api/auth/login
// @access Public
// ─────────────────────────────────────────────
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      // Find user and include password for comparison
      const user = await User.findOne({ email }).select('+password');

      if (!user || !(await user.comparePassword(password))) {
        return res.status(401).json({ success: false, message: 'Invalid email or password.' });
      }

      if (!user.isActive) {
        return res.status(403).json({ success: false, message: 'Account deactivated. Contact admin.' });
      }

      // Update last login
      user.lastLogin = new Date();
      await user.save({ validateBeforeSave: false });

      const token = user.generateJWT();

      res.json({
        success: true,
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          lastLogin: user.lastLogin
        }
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ success: false, message: 'Server error.' });
    }
  }
);

// ─────────────────────────────────────────────
// @route  GET /api/auth/me
// @access Private
// ─────────────────────────────────────────────
router.get('/me', protect, async (req, res) => {
  res.json({ success: true, user: req.user });
});

// ─────────────────────────────────────────────
// @route  PUT /api/auth/profile
// @access Private
// ─────────────────────────────────────────────
router.put('/profile', protect, async (req, res) => {
  const { name, currentPassword, newPassword } = req.body;

  try {
    const user = await User.findById(req.user._id).select('+password');

    if (name) user.name = name;

    // Password change flow
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, message: 'Current password required.' });
      }
      const match = await user.comparePassword(currentPassword);
      if (!match) {
        return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
      }
      user.password = newPassword;
    }

    await user.save();

    res.json({
      success: true,
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
