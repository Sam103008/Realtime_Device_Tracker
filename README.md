# 🛰️ TrackOS — Real-Time Device Tracker

A production-grade real-time device tracking system built with Node.js, Express, MongoDB, Socket.IO, and Leaflet Maps.

---

## 📁 Folder Structure

```
device-tracker/
├── backend/
│   ├── middleware/
│   │   └── auth.js              # JWT authentication middleware
│   ├── models/
│   │   ├── User.js              # User schema (auth + push subscriptions)
│   │   ├── Device.js            # Tracked device schema
│   │   ├── LocationHistory.js   # GPS ping storage
│   │   └── Geofence.js          # Geographic alert zones
│   ├── routes/
│   │   ├── auth.js              # Register, login, profile
│   │   ├── devices.js           # CRUD for devices
│   │   ├── locations.js         # Location history + path
│   │   ├── geofences.js         # Geofence management
│   │   ├── admin.js             # Admin-only user management
│   │   └── notifications.js     # Push subscription management
│   ├── socket/
│   │   └── socketHandler.js     # All Socket.IO event logic
│   ├── utils/
│   │   └── geofenceChecker.js   # Haversine geofence detection
│   ├── server.js                # Main entry point
│   ├── package.json
│   └── .env.example
├── frontend/
│   └── public/
│       ├── css/
│       │   ├── auth.css          # Login/signup styles
│       │   └── dashboard.css     # Dashboard styles
│       ├── js/
│       │   └── app.js            # Dashboard JavaScript
│       ├── index.html            # Login / Signup page
│       ├── dashboard.html        # Main dashboard
│       └── tracker.html          # Tracking client (runs on tracked device)
└── docs/
    └── API.md                    # API reference
```

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- Node.js v18+
- MongoDB (local or free Atlas cloud cluster)
- Git

### Step 1 — Clone & Install

```bash
git clone https://github.com/yourusername/device-tracker.git
cd device-tracker/backend
npm install
```

### Step 2 — Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/device_tracker
JWT_SECRET=change_this_to_a_long_random_string
JWT_EXPIRE=7d
CLIENT_URL=http://localhost:5000
NODE_ENV=development
```

**For MongoDB Atlas (free cloud):**
1. Go to https://cloud.mongodb.com → Create free cluster
2. Click Connect → Drivers → Copy connection string
3. Replace `MONGODB_URI` in `.env` with your connection string

### Step 3 — Run the Server

```bash
# Development (auto-restart on file change)
npm run dev

# Production
npm start
```

Server starts at: **http://localhost:5000**

### Step 4 — Create Admin User

Register via the UI at http://localhost:5000, then promote to admin via MongoDB:

```javascript
// In MongoDB shell or Compass
db.users.updateOne({ email: "your@email.com" }, { $set: { role: "admin" } })
```

---

## 📱 How to Track a Device

### Method 1: Browser (tracker.html)
1. Open **http://localhost:5000/tracker.html** on the device you want to track
2. Log in to the dashboard → Devices → Copy the Device ID
3. Get your JWT token from: dashboard → browser DevTools → Application → localStorage → `token`
4. Paste both into the tracker page and click **Start Tracking**

### Method 2: REST API (for custom clients)
```javascript
// POST /api/locations/update
fetch('/api/locations/update', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  },
  body: JSON.stringify({
    deviceId: 'YOUR_DEVICE_ID',
    lat: 28.6139,
    lng: 77.2090,
    accuracy: 10,
    battery: { level: 85, charging: false }
  })
});
```

### Method 3: Socket.IO (real-time, preferred)
```javascript
const socket = io('http://localhost:5000', { auth: { token: 'YOUR_JWT' } });
socket.emit('register_device', { deviceId: 'YOUR_DEVICE_ID' });
socket.emit('location_update', {
  deviceId: 'MONGO_DEVICE_ID', // _id from registration response
  lat: 28.6139, lng: 77.2090,
  accuracy: 10, speed: 0,
  battery: { level: 85, charging: false },
  timestamp: new Date().toISOString()
});
```

---

## 📡 API Reference

All protected routes require: `Authorization: Bearer <token>`

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login, returns JWT |
| GET | `/api/auth/me` | Get current user |
| PUT | `/api/auth/profile` | Update name/password |

**Register body:**
```json
{ "name": "John", "email": "john@example.com", "password": "secret123" }
```

**Login response:**
```json
{ "success": true, "token": "eyJ...", "user": { "id": "...", "name": "John", "role": "user" } }
```

---

### Devices

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/devices` | List all devices |
| POST | `/api/devices` | Register new device |
| GET | `/api/devices/:id` | Get device details |
| PUT | `/api/devices/:id` | Update device |
| DELETE | `/api/devices/:id` | Delete device + history |
| GET | `/api/devices/:id/stats` | Ping count, last seen |

**Register device body:**
```json
{ "name": "My Phone", "type": "mobile", "color": "#6366f1", "notes": "Work phone" }
```

**Response includes `deviceId`** — copy this to use in the tracker client.

---

### Locations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/locations/update` | Push location (REST) |
| GET | `/api/locations/:deviceId/history` | Location history |
| GET | `/api/locations/:deviceId/path` | Path for map polyline |
| DELETE | `/api/locations/:deviceId` | Clear history |

**Query params for `/path`:** `?hours=24` (default 24, max 168)

**Query params for `/history`:** `?limit=100&from=2024-01-01&to=2024-01-31`

---

### Geofences

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/geofences` | List geofences |
| POST | `/api/geofences` | Create geofence |
| PUT | `/api/geofences/:id` | Update geofence |
| DELETE | `/api/geofences/:id` | Delete geofence |

**Create geofence body:**
```json
{
  "name": "Home Zone",
  "center": { "lat": 28.6139, "lng": 77.2090 },
  "radius": 500,
  "alertOnExit": true,
  "alertOnEnter": false,
  "color": "#ef4444"
}
```

---

### Admin (role: admin only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | All users |
| PUT | `/api/admin/users/:id` | Update role/status |
| DELETE | `/api/admin/users/:id` | Delete user + all data |
| GET | `/api/admin/stats` | System statistics |

---

## 🔌 Socket.IO Events

### Client → Server (emit)

| Event | Payload | Description |
|-------|---------|-------------|
| `register_device` | `{ deviceId }` | Register tracker device |
| `location_update` | `{ deviceId, lat, lng, accuracy, speed, heading, battery, timestamp }` | Send GPS ping |
| `battery_update` | `{ deviceId, level, charging }` | Send battery info only |
| `watch_device` | `deviceId` | Dashboard subscribes to device |
| `unwatch_device` | `deviceId` | Dashboard unsubscribes |

### Server → Client (on)

| Event | Payload | Description |
|-------|---------|-------------|
| `registered` | `{ deviceId, name }` | Device registration confirmed |
| `location_update` | `{ deviceId, lat, lng, battery, timestamp }` | New location (broadcast to dashboard) |
| `device_status_change` | `{ deviceId, status }` | online / offline |
| `battery_update` | `{ deviceId, level, charging }` | Battery change |
| `alert` | `{ type, message, deviceId, ... }` | Geofence or battery alert |

---

## ☁️ Deployment Guide

### Option A: Render (recommended, free tier)

1. Push your code to GitHub
2. Go to https://render.com → New Web Service
3. Connect your GitHub repo
4. Settings:
   - **Root directory:** `backend`
   - **Build command:** `npm install`
   - **Start command:** `node server.js`
5. Add environment variables (same as `.env`)
6. Click Deploy

Your app will be live at `https://your-app.onrender.com`

> ⚠️ Render free tier spins down after 15 min of inactivity. Use a free uptime monitor like UptimeRobot to keep it awake.

---

### Option B: Railway

1. Go to https://railway.app → New Project
2. Deploy from GitHub repo
3. Set root to `backend/`
4. Add env vars in Railway dashboard
5. Railway auto-detects Node.js and deploys

---

### Option C: Vercel (frontend) + Render (backend)

If you want to separate frontend and backend:

**Backend on Render** (as above)

**Frontend on Vercel:**
1. Move `frontend/public` to a new repo or subfolder
2. Update `API_BASE` in `app.js` to your Render URL: `const API_BASE = 'https://your-app.onrender.com'`
3. Deploy via https://vercel.com

---

### MongoDB Atlas Setup

1. https://cloud.mongodb.com → Create Free Cluster
2. Database Access → Add User (username/password)
3. Network Access → Add IP `0.0.0.0/0` (allow all, for deployment)
4. Clusters → Connect → Node.js → Copy URI
5. Replace `<password>` in URI with your database user password
6. Set as `MONGODB_URI` in your environment

---

## 🔐 Security Checklist

- [x] Passwords hashed with bcrypt (salt rounds: 10)
- [x] JWT stored client-side, verified server-side on every request
- [x] Routes protected with `protect` middleware
- [x] Admin routes gated with `authorize('admin')` middleware
- [x] All user data scoped by `owner` field — users can't access others' devices
- [x] Express-validator input validation on auth routes
- [x] CORS configured for specific origin
- [ ] Rate limiting (add `express-rate-limit` for production)
- [ ] HTTPS (handled by Render/Railway/Vercel automatically)

---

## 🧩 Optional Enhancements

### Add Rate Limiting
```bash
npm install express-rate-limit
```
```javascript
const rateLimit = require('express-rate-limit');
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));
```

### Enable Push Notifications
```bash
node -e "const wp=require('web-push');const k=wp.generateVAPIDKeys();console.log(JSON.stringify(k,null,2));"
```
Copy keys to `.env` as `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`.

### React Native Tracker App
Use the Socket.IO method with `react-native-geolocation-service` to build a native tracker client.

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| MongoDB connection fails | Check `MONGODB_URI` format; ensure IP whitelist on Atlas |
| Socket.IO not connecting | Check CORS `CLIENT_URL` env var matches your frontend URL |
| Location not updating | Check browser location permission; use HTTPS in production |
| 401 Unauthorized | Token expired — log out and log in again |
| Map not loading | Leaflet tiles require internet; check network |

---

## 📄 License
MIT — free to use, modify, and distribute.
