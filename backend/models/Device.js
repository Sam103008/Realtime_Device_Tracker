/**
 * Device Model
 * Represents a trackable device (phone, laptop, vehicle, etc.)
 */

const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema(
  {
    // Owner of the device
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    name: {
      type: String,
      required: [true, 'Device name is required'],
      trim: true,
      maxlength: [60, 'Device name cannot exceed 60 characters']
    },
    // Unique identifier sent from device (e.g., browser fingerprint or UUID)
    deviceId: {
      type: String,
      required: [true, 'Device ID is required'],
      unique: true,
      trim: true
    },
    type: {
      type: String,
      enum: ['mobile', 'laptop', 'tablet', 'vehicle', 'other'],
      default: 'mobile'
    },
    icon: {
      type: String,
      default: '📱'
    },
    color: {
      type: String,
      default: '#6366f1' // Indigo as default marker color
    },
    isActive: {
      type: Boolean,
      default: true
    },
    // Latest known location (quick access without querying LocationHistory)
    lastLocation: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      accuracy: { type: Number, default: null },
      timestamp: { type: Date, default: null }
    },
    // Latest battery info
    battery: {
      level: { type: Number, default: null },    // 0–100
      charging: { type: Boolean, default: null },
      updatedAt: { type: Date, default: null }
    },
    // Online/offline status
    status: {
      type: String,
      enum: ['online', 'offline', 'idle'],
      default: 'offline'
    },
    // Socket ID of the currently connected device
    socketId: {
      type: String,
      default: null
    },
    notes: {
      type: String,
      maxlength: [200, 'Notes cannot exceed 200 characters'],
      default: ''
    }
  },
  {
    timestamps: true
  }
);

// Index for fast owner queries
deviceSchema.index({ owner: 1 });
deviceSchema.index({ deviceId: 1 });

module.exports = mongoose.model('Device', deviceSchema);
