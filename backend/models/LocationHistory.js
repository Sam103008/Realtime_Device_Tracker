/**
 * LocationHistory Model
 * Stores every GPS ping received from a device.
 * Documents are immutable once created.
 */

const mongoose = require('mongoose');

const locationHistorySchema = new mongoose.Schema(
  {
    device: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Device',
      required: true
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    lat: {
      type: Number,
      required: true,
      min: -90,
      max: 90
    },
    lng: {
      type: Number,
      required: true,
      min: -180,
      max: 180
    },
    accuracy: {
      type: Number,        // Accuracy radius in meters
      default: null
    },
    altitude: {
      type: Number,        // Meters above sea level
      default: null
    },
    speed: {
      type: Number,        // m/s
      default: null
    },
    heading: {
      type: Number,        // Degrees (0–360)
      default: null
    },
    // Battery snapshot at time of this ping
    battery: {
      level: { type: Number, default: null },
      charging: { type: Boolean, default: null }
    },
    // Client-side timestamp (may differ from server createdAt if offline)
    clientTimestamp: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true   // createdAt = server receive time
  }
);

// Indexes for efficient queries
locationHistorySchema.index({ device: 1, createdAt: -1 });
locationHistorySchema.index({ owner: 1, createdAt: -1 });

// TTL index: auto-delete records older than 30 days to save storage
// Remove this if you want to keep all history
locationHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

module.exports = mongoose.model('LocationHistory', locationHistorySchema);
