/**
 * Real-Time Device Tracker - Main Server
 * Entry point for the Express + Socket.IO backend
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load env variables
dotenv.config();

// Route imports
const authRoutes = require('./routes/auth');
const deviceRoutes = require('./routes/devices');
const locationRoutes = require('./routes/locations');
const geofenceRoutes = require('./routes/geofences');
const adminRoutes = require('./routes/admin');
const notificationRoutes = require('./routes/notifications');

// Socket handler
const socketHandler = require('./socket/socketHandler');

// Initialize app
const app = express();
const server = http.createServer(app);

// Socket.IO setup with CORS
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────
app.use(cors({
  origin: process.env.CLIENT_URL || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend/public')));

// Attach io to every request so routes can emit events
app.use((req, res, next) => {
  req.io = io;
  next();
});

// ─────────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/geofences', geofenceRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Catch-all: serve frontend for any non-API route (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

// ─────────────────────────────────────────────
// Socket.IO
// ─────────────────────────────────────────────
socketHandler(io);

// ─────────────────────────────────────────────
// Database Connection & Server Start
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/device_tracker')
  .then(() => {
    console.log('✅ MongoDB connected successfully');
    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err.message);
  server.close(() => process.exit(1));
});

module.exports = { app, io };
