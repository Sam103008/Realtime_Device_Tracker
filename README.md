# 🛰️ Track Map — Real-Time Device Tracker

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
