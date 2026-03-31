/**
 * Socket.IO Handler
 * Manages real-time bidirectional communication between
 * the tracking devices and the dashboard clients.
 *
 * Two types of clients connect:
 *   1. "tracker" – the device being tracked (sends location pings)
 *   2. "dashboard" – the web UI monitoring devices
 */

const jwt = require('jsonwebtoken');
const Device = require('../models/Device');
const LocationHistory = require('../models/LocationHistory');
const { checkGeofences } = require('../utils/geofenceChecker');

module.exports = (io) => {
  // ─────────────────────────────────────────────
  // Authentication middleware for Socket.IO
  // ─────────────────────────────────────────────
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
      return next(new Error('Authentication token required.'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
      socket.userId = decoded.id;
      next();
    } catch (err) {
      next(new Error('Invalid token.'));
    }
  });

  // ─────────────────────────────────────────────
  // Connection handler
  // ─────────────────────────────────────────────
  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id} (user: ${socket.userId})`);

    // Join a room named after the user — allows server to target all user's tabs
    socket.join(`user_${socket.userId}`);

    // ── Dashboard joins device-specific room for live updates ──
    socket.on('watch_device', (deviceId) => {
      socket.join(`device_${deviceId}`);
      console.log(`👁 ${socket.id} watching device ${deviceId}`);
    });

    socket.on('unwatch_device', (deviceId) => {
      socket.leave(`device_${deviceId}`);
    });

    // ── Device registers itself ──
    socket.on('register_device', async ({ deviceId }) => {
      try {
        const device = await Device.findOne({ deviceId });
        if (!device) {
          socket.emit('error', { message: 'Device not found. Register via dashboard first.' });
          return;
        }

        // Store socket ID on device document
        device.socketId = socket.id;
        device.status = 'online';
        await device.save();

        socket.deviceDbId = device._id.toString();
        socket.join(`device_${device._id}`);

        socket.emit('registered', { deviceId: device._id, name: device.name });

        // Notify dashboard that device came online
        io.to(`user_${socket.userId}`).emit('device_status_change', {
          deviceId: device._id,
          status: 'online'
        });

        console.log(`📱 Device registered: ${device.name} (${socket.id})`);
      } catch (err) {
        console.error('register_device error:', err);
      }
    });

    // ── Device sends a location update ──
    socket.on('location_update', async (data) => {
      /*
       * data = {
       *   deviceId: <mongo ObjectId string>,
       *   lat, lng, accuracy, altitude, speed, heading,
       *   battery: { level, charging },
       *   timestamp: <ISO string>
       * }
       */
      try {
        const { deviceId, lat, lng, accuracy, altitude, speed, heading, battery, timestamp } = data;

        const device = await Device.findById(deviceId);
        if (!device) return;

        // Persist to history
        await LocationHistory.create({
          device: device._id,
          owner: device.owner,
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          accuracy: accuracy ? parseFloat(accuracy) : null,
          altitude: altitude ? parseFloat(altitude) : null,
          speed: speed ? parseFloat(speed) : null,
          heading: heading ? parseFloat(heading) : null,
          battery: battery || {},
          clientTimestamp: timestamp ? new Date(timestamp) : new Date()
        });

        // Update device snapshot
        device.lastLocation = {
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          accuracy,
          timestamp: new Date()
        };
        device.status = 'online';
        if (battery) {
          device.battery = { level: battery.level, charging: battery.charging, updatedAt: new Date() };
        }
        await device.save();

        // Check geofence violations
        checkGeofences(device, parseFloat(lat), parseFloat(lng), io);

        // Broadcast to all dashboards watching this device and user's general room
        const payload = {
          deviceId: device._id,
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          accuracy,
          speed,
          heading,
          battery: device.battery,
          timestamp: new Date()
        };

        io.to(`device_${device._id}`).emit('location_update', payload);
        io.to(`user_${device.owner}`).emit('location_update', payload);

      } catch (err) {
        console.error('location_update socket error:', err);
      }
    });

    // ── Battery status update (can be sent independently) ──
    socket.on('battery_update', async ({ deviceId, level, charging }) => {
      try {
        const device = await Device.findByIdAndUpdate(
          deviceId,
          { battery: { level, charging, updatedAt: new Date() } },
          { new: true }
        );
        if (!device) return;

        io.to(`user_${device.owner}`).emit('battery_update', {
          deviceId: device._id,
          level,
          charging
        });

        // Alert if battery is critically low (< 15%)
        if (level < 15 && !charging) {
          io.to(`user_${device.owner}`).emit('alert', {
            type: 'battery',
            deviceId: device._id,
            deviceName: device.name,
            message: `⚠️ ${device.name} battery is critically low (${level}%)`,
            timestamp: new Date()
          });
        }
      } catch (err) {
        console.error('battery_update error:', err);
      }
    });

    // ── Handle disconnect ──
    socket.on('disconnect', async () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);

      if (socket.deviceDbId) {
        try {
          const device = await Device.findByIdAndUpdate(
            socket.deviceDbId,
            { status: 'offline', socketId: null },
            { new: true }
          );

          if (device) {
            io.to(`user_${device.owner}`).emit('device_status_change', {
              deviceId: device._id,
              status: 'offline'
            });
          }
        } catch (err) {
          console.error('disconnect cleanup error:', err);
        }
      }
    });
  });
};
