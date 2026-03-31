/**
 * Geofence Model
 * A circular geographic boundary associated with a device.
 * Alerts are triggered when device enters or exits the fence.
 */

const mongoose = require('mongoose');

const geofenceSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    // Geofence can be linked to a specific device OR act as a global zone
    device: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Device',
      default: null
    },
    name: {
      type: String,
      required: [true, 'Geofence name is required'],
      trim: true,
      maxlength: [60, 'Name cannot exceed 60 characters']
    },
    // Center of the circular geofence
    center: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true }
    },
    // Radius in meters
    radius: {
      type: Number,
      required: true,
      min: [50, 'Radius must be at least 50 meters'],
      max: [50000, 'Radius cannot exceed 50 km']
    },
    color: {
      type: String,
      default: '#ef4444'  // Red
    },
    isActive: {
      type: Boolean,
      default: true
    },
    alertOnExit: {
      type: Boolean,
      default: true
    },
    alertOnEnter: {
      type: Boolean,
      default: false
    },
    // Track current state per device to avoid repeated alerts
    deviceStates: [
      {
        deviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Device' },
        isInside: { type: Boolean, default: null }, // null = unknown
        lastChecked: { type: Date, default: null }
      }
    ]
  },
  {
    timestamps: true
  }
);

geofenceSchema.index({ owner: 1 });
geofenceSchema.index({ device: 1 });

module.exports = mongoose.model('Geofence', geofenceSchema);
