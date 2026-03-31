/**
 * TrackOS — Dashboard App JS
 * Handles: Auth guard, Socket.IO, Maps, Devices, Geofences, Alerts, Admin
 */

'use strict';

// ─────────────────────────────────────────────
// Config & State
// ─────────────────────────────────────────────
const API_BASE = '';  // Same origin
let token = localStorage.getItem('token');
let currentUser = JSON.parse(localStorage.getItem('user') || 'null');
let socket = null;

// Map instances
let mainMap = null, historyMap = null, geofenceMap = null;
let mainMarkers = {};     // deviceId → Leaflet marker
let mainPaths = {};       // deviceId → Leaflet polyline
let fenceCircles = [];    // Leaflet circles for geofences
let selectedDeviceId = null;
let showPath = true;
let showFences = true;

// Data
let devices = [];
let geofences = [];
let alerts = [];
let alertCount = 0;

// ─────────────────────────────────────────────
// Auth Guard
// ─────────────────────────────────────────────
if (!token) {
  window.location.href = '/';
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/';
}

// ─────────────────────────────────────────────
// Fetch helper
// ─────────────────────────────────────────────
async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  if (res.status === 401) {
    logout();
    return null;
  }

  const data = await res.json();
  return data;
}

// ─────────────────────────────────────────────
// Toast Notifications
// ─────────────────────────────────────────────
const TOAST_ICONS = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${TOAST_ICONS[type]}</span>
    <span class="toast-text">${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ─────────────────────────────────────────────
// Sidebar & Navigation
// ─────────────────────────────────────────────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function switchView(viewName, navEl) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById(`view-${viewName}`).classList.add('active');
  if (navEl) navEl.classList.add('active');

  // Close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');

  // Lazy-load view data
  if (viewName === 'history') populateDeviceSelects();
  if (viewName === 'geofences') { loadGeofences(); initGeofenceMap(); }
  if (viewName === 'admin') loadAdminData();

  // Fix map size when it becomes visible
  setTimeout(() => {
    if (mainMap) mainMap.invalidateSize();
    if (historyMap) historyMap.invalidateSize();
    if (geofenceMap) geofenceMap.invalidateSize();
  }, 100);

  return false;
}

// ─────────────────────────────────────────────
// Modal helpers
// ─────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// ─────────────────────────────────────────────
// Initialize User UI
// ─────────────────────────────────────────────
function initUserUI() {
  if (!currentUser) return;
  document.getElementById('user-name').textContent = currentUser.name;
  document.getElementById('user-role').textContent = currentUser.role;
  document.getElementById('user-avatar').textContent = currentUser.name.charAt(0).toUpperCase();

  if (currentUser.role === 'admin') {
    document.getElementById('admin-nav').style.display = 'flex';
  }
}

// ─────────────────────────────────────────────
// Socket.IO Setup
// ─────────────────────────────────────────────
function initSocket() {
  socket = io({ auth: { token } });

  socket.on('connect', () => {
    console.log('🔌 Socket connected');
    setConnectionStatus(true);
  });

  socket.on('disconnect', () => {
    console.log('🔌 Socket disconnected');
    setConnectionStatus(false);
  });

  // Real-time location update
  socket.on('location_update', (data) => {
    updateDeviceOnMap(data);
    updateDeviceCard(data);
    updateQuickCard(data.deviceId, data);
    updateStats();
  });

  // Device online/offline
  socket.on('device_status_change', (data) => {
    updateDeviceStatus(data.deviceId, data.status);
    updateStats();
  });

  // Battery update
  socket.on('battery_update', (data) => {
    updateBatteryUI(data);
  });

  // Alerts (geofence, battery)
  socket.on('alert', (alertData) => {
    addAlert(alertData);
    showToast(alertData.message, alertData.type === 'battery' ? 'warning' : 'error', 6000);
  });
}

function setConnectionStatus(connected) {
  const dot = document.getElementById('conn-dot');
  dot.classList.toggle('connected', connected);
  dot.classList.toggle('disconnected', !connected);
}

// ─────────────────────────────────────────────
// Map Initialization
// ─────────────────────────────────────────────
function initMainMap() {
  mainMap = L.map('map', {
    center: [20.5937, 78.9629], // India center
    zoom: 5,
    zoomControl: true
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(mainMap);
}

function initGeofenceMap() {
  if (geofenceMap) return;
  geofenceMap = L.map('geofence-map', {
    center: [20.5937, 78.9629],
    zoom: 5
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(geofenceMap);

  // Click on map to set fence center
  geofenceMap.on('click', (e) => {
    document.getElementById('fence-lat').value = e.latlng.lat.toFixed(6);
    document.getElementById('fence-lng').value = e.latlng.lng.toFixed(6);
    showToast(`Center set: ${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`, 'info', 2000);
  });

  renderGeofencesOnMap();
}

function initHistoryMap() {
  if (historyMap) return;
  historyMap = L.map('history-map', {
    center: [20.5937, 78.9629],
    zoom: 5
  });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(historyMap);
}

// ─────────────────────────────────────────────
// Create Leaflet marker icon
// ─────────────────────────────────────────────
function createMarkerIcon(color, icon = '📱', status = 'offline') {
  const pulse = status === 'online' ? `
    <div style="position:absolute;inset:-6px;border-radius:50%;border:2px solid ${color};animation:pulse 2s infinite;opacity:0.6;"></div>
  ` : '';

  return L.divIcon({
    html: `
      <style>@keyframes pulse{0%,100%{transform:scale(1);opacity:0.6}50%{transform:scale(1.3);opacity:0.2}}</style>
      <div style="position:relative;width:36px;height:36px;">
        ${pulse}
        <div style="
          width:36px;height:36px;border-radius:50%;
          background:${color};border:3px solid #fff;
          display:flex;align-items:center;justify-content:center;
          font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.4);
          position:relative;z-index:1;
        ">${icon}</div>
      </div>`,
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20]
  });
}

// ─────────────────────────────────────────────
// Device Markers on Map
// ─────────────────────────────────────────────
function placeDevicesOnMap() {
  devices.forEach(device => {
    if (device.lastLocation?.lat && device.lastLocation?.lng) {
      addOrUpdateMarker(device);
    }
  });

  if (showFences) renderFencesOnMainMap();
}

function addOrUpdateMarker(device) {
  const { lat, lng } = device.lastLocation;
  const id = device._id;

  if (mainMarkers[id]) {
    mainMarkers[id].setLatLng([lat, lng]);
    mainMarkers[id].setIcon(createMarkerIcon(device.color, device.icon, device.status));
  } else {
    const marker = L.marker([lat, lng], {
      icon: createMarkerIcon(device.color, device.icon, device.status)
    }).addTo(mainMap);

    marker.bindPopup(() => buildPopupHTML(device));
    mainMarkers[id] = marker;
  }

  // Update popup content
  if (mainMarkers[id].isPopupOpen()) {
    mainMarkers[id].setPopupContent(buildPopupHTML(device));
  }
}

function buildPopupHTML(device) {
  const bat = device.battery?.level != null
    ? `🔋 ${device.battery.level}%${device.battery.charging ? ' ⚡' : ''}` : '';
  const ts = device.lastLocation?.timestamp
    ? new Date(device.lastLocation.timestamp).toLocaleTimeString() : '—';
  return `
    <div style="min-width:160px">
      <div style="font-weight:700;font-size:0.9rem;margin-bottom:4px">${device.icon} ${device.name}</div>
      <div style="font-size:0.72rem;opacity:0.7;font-family:monospace">
        ${device.lastLocation.lat.toFixed(5)}, ${device.lastLocation.lng.toFixed(5)}<br>
        Last seen: ${ts}<br>
        ${bat}
      </div>
      <div style="margin-top:8px">
        <button onclick="focusDevice('${device._id}')" style="
          background:#39d353;border:none;border-radius:4px;
          color:#000;padding:3px 8px;font-size:0.68rem;cursor:pointer;font-weight:700
        ">Track</button>
      </div>
    </div>`;
}

function updateDeviceOnMap(data) {
  const device = devices.find(d => d._id === data.deviceId?.toString() || d._id === data.deviceId);
  if (!device) return;

  device.lastLocation = { lat: data.lat, lng: data.lng, accuracy: data.accuracy, timestamp: data.timestamp };
  device.status = 'online';
  if (data.battery) device.battery = data.battery;

  addOrUpdateMarker(device);

  // Append to path
  if (showPath) {
    if (!mainPaths[device._id]) {
      mainPaths[device._id] = L.polyline([], {
        color: device.color || '#39d353',
        weight: 3,
        opacity: 0.7,
        dashArray: '6,4'
      }).addTo(mainMap);
    }
    mainPaths[device._id].addLatLng([data.lat, data.lng]);
  }
}

function focusDevice(deviceId) {
  const device = devices.find(d => d._id === deviceId);
  if (!device?.lastLocation?.lat) return;
  mainMap.setView([device.lastLocation.lat, device.lastLocation.lng], 15, { animate: true });
  mainMarkers[deviceId]?.openPopup();
  highlightQuickCard(deviceId);
}

function fitMapBounds() {
  const positions = Object.values(mainMarkers).map(m => m.getLatLng());
  if (positions.length === 0) return;
  if (positions.length === 1) {
    mainMap.setView(positions[0], 14);
  } else {
    mainMap.fitBounds(L.latLngBounds(positions), { padding: [40, 40] });
  }
}

function filterMapDevice(deviceId) {
  if (deviceId === 'all') {
    Object.values(mainMarkers).forEach(m => mainMap.addLayer(m));
    Object.values(mainPaths).forEach(p => mainMap.addLayer(p));
  } else {
    Object.entries(mainMarkers).forEach(([id, m]) => {
      if (id === deviceId) mainMap.addLayer(m);
      else mainMap.removeLayer(m);
    });
    Object.entries(mainPaths).forEach(([id, p]) => {
      if (id === deviceId) mainMap.addLayer(p);
      else mainMap.removeLayer(p);
    });
  }
}

function togglePath() {
  showPath = !showPath;
  const btn = document.getElementById('btn-show-path');
  btn.classList.toggle('active', showPath);
  Object.values(mainPaths).forEach(p => {
    if (showPath) mainMap.addLayer(p);
    else mainMap.removeLayer(p);
  });
}

function toggleFences() {
  showFences = !showFences;
  document.getElementById('btn-show-fences').classList.toggle('active', showFences);
  fenceCircles.forEach(c => {
    if (showFences) mainMap.addLayer(c);
    else mainMap.removeLayer(c);
  });
}

function refreshMap() {
  loadDevices().then(placeDevicesOnMap);
  showToast('Map refreshed', 'info', 1500);
}

function renderFencesOnMainMap() {
  fenceCircles.forEach(c => mainMap.removeLayer(c));
  fenceCircles = [];
  geofences.forEach(fence => {
    const circle = L.circle([fence.center.lat, fence.center.lng], {
      radius: fence.radius,
      color: fence.color,
      fillColor: fence.color,
      fillOpacity: 0.07,
      weight: 2,
      dashArray: '6,4'
    }).addTo(mainMap);
    circle.bindPopup(`<b>${fence.name}</b><br>${fence.radius}m radius`);
    fenceCircles.push(circle);
  });
}

// ─────────────────────────────────────────────
// Devices
// ─────────────────────────────────────────────
async function loadDevices() {
  const data = await api('/api/devices');
  if (!data?.success) return;
  devices = data.devices;
  renderDeviceGrid();
  renderDeviceQuickList();
  populateDeviceSelects();
  updateStats();
  document.getElementById('device-count-badge').textContent = devices.length;
}

function renderDeviceGrid() {
  const grid = document.getElementById('device-grid');
  if (devices.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">No devices yet. Click "+ Add Device" to register your first device.</div>`;
    return;
  }
  grid.innerHTML = devices.map(d => deviceCardHTML(d)).join('');
}

function deviceCardHTML(d) {
  const lat = d.lastLocation?.lat?.toFixed(5) ?? '—';
  const lng = d.lastLocation?.lng?.toFixed(5) ?? '—';
  const lastSeen = d.lastLocation?.timestamp ? timeAgo(d.lastLocation.timestamp) : 'Never';
  const bat = d.battery?.level != null ? `🔋 ${d.battery.level}%${d.battery.charging ? ' ⚡' : ''}` : '🔋 N/A';
  const batClass = d.battery?.level < 15 ? 'battery-low' : d.battery?.level < 40 ? 'battery-mid' : 'battery-ok';

  return `
    <div class="device-card" id="dcard-${d._id}" style="--device-color:${d.color}" onclick="openDeviceDetail('${d._id}')">
      <div class="dc-header">
        <div class="dc-info">
          <span class="dc-icon">${d.icon}</span>
          <div>
            <div class="dc-name">${d.name}</div>
            <div class="dc-type">${d.type}</div>
          </div>
        </div>
        <div style="display:flex;gap:4px;">
          <button class="btn-icon" onclick="event.stopPropagation();focusDevice('${d._id}')" title="Show on map">🗺️</button>
        </div>
      </div>
      <div class="dc-coords">
        📍 ${lat}, ${lng}<br>
        🕒 ${lastSeen}
      </div>
      <div class="dc-footer">
        <div class="dc-status">
          <span class="status-dot ${d.status}"></span>${d.status}
        </div>
        <div class="dc-battery ${batClass}">${bat}</div>
      </div>
      <div class="dc-actions">
        <button class="btn-sm btn-outline" onclick="event.stopPropagation();copyDeviceId('${d.deviceId}')">📋 Copy ID</button>
        <button class="btn-sm btn-outline" onclick="event.stopPropagation();showHistoryForDevice('${d._id}')">📍 History</button>
        <button class="btn-sm btn-danger" onclick="event.stopPropagation();deleteDevice('${d._id}','${d.name}')">🗑</button>
      </div>
    </div>`;
}

function renderDeviceQuickList() {
  const list = document.getElementById('device-quick-list');
  if (devices.length === 0) {
    list.innerHTML = `<div style="color:var(--text-muted);font-size:0.78rem;padding:0.5rem;font-family:var(--font-mono)">No devices registered yet.</div>`;
    return;
  }
  list.innerHTML = devices.map(d => `
    <div class="device-quick-card" id="dqc-${d._id}" onclick="focusDevice('${d._id}')">
      <div class="dqc-header">
        <span class="dqc-icon">${d.icon}</span>
        <span class="dqc-name">${d.name}</span>
      </div>
      <div class="dqc-status">
        <span class="status-dot ${d.status}"></span>${d.status}
      </div>
      ${d.battery?.level != null ? `<div class="dqc-battery">🔋 ${d.battery.level}%</div>` : ''}
    </div>`).join('');
}

function populateDeviceSelects() {
  const selects = ['map-device-filter', 'history-device-select', 'fence-device'];
  selects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const isFilter = id === 'map-device-filter';
    const isFence = id === 'fence-device';

    const base = isFilter ? '<option value="all">All Devices</option>' :
                 isFence  ? '<option value="">All Devices</option>' :
                             '<option value="">Select a device...</option>';

    el.innerHTML = base + devices.map(d =>
      `<option value="${d._id}">${d.icon} ${d.name}</option>`
    ).join('');
  });
}

function updateDeviceCard(data) {
  const device = devices.find(d => d._id === data.deviceId?.toString() || d._id === data.deviceId);
  if (!device) return;
  device.status = 'online';
  if (data.battery) device.battery = data.battery;
  device.lastLocation = { lat: data.lat, lng: data.lng, timestamp: data.timestamp };
  renderDeviceGrid();
}

function updateDeviceStatus(deviceId, status) {
  const device = devices.find(d => d._id === deviceId?.toString() || d._id === deviceId);
  if (!device) return;
  device.status = status;
  renderDeviceGrid();
  renderDeviceQuickList();

  const marker = mainMarkers[deviceId];
  if (marker) marker.setIcon(createMarkerIcon(device.color, device.icon, status));
}

function updateBatteryUI(data) {
  const device = devices.find(d => d._id === data.deviceId?.toString());
  if (!device) return;
  device.battery = { level: data.level, charging: data.charging };
  renderDeviceGrid();
}

function updateQuickCard(deviceId, data) {
  const device = devices.find(d => d._id === deviceId?.toString() || d._id === deviceId);
  if (!device) return;
  const card = document.getElementById(`dqc-${device._id}`);
  if (card) {
    card.querySelector('.dqc-status').innerHTML = `<span class="status-dot online"></span>online`;
    const batDiv = card.querySelector('.dqc-battery');
    if (batDiv && data.battery?.level != null) batDiv.textContent = `🔋 ${data.battery.level}%`;
  }
}

function highlightQuickCard(deviceId) {
  document.querySelectorAll('.device-quick-card').forEach(c => c.classList.remove('selected'));
  const card = document.getElementById(`dqc-${deviceId}`);
  if (card) {
    card.classList.add('selected');
    card.scrollIntoView({ behavior: 'smooth', inline: 'center' });
  }
}

function updateStats() {
  const total = devices.length;
  const online = devices.filter(d => d.status === 'online').length;
  const offline = total - online;
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-online').textContent = online;
  document.getElementById('stat-offline').textContent = offline;
  document.getElementById('stat-alerts').textContent = alertCount;
}

// ─────────────────────────────────────────────
// Add Device
// ─────────────────────────────────────────────
function openAddDeviceModal() { openModal('modal-add-device'); }

async function submitAddDevice(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById('dev-name').value,
    type: document.getElementById('dev-type').value,
    color: document.getElementById('dev-color').value,
    notes: document.getElementById('dev-notes').value,
    icon: typeToIcon(document.getElementById('dev-type').value)
  };

  const data = await api('/api/devices', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  if (data?.success) {
    showToast(`Device "${payload.name}" registered!`, 'success');
    closeModal('modal-add-device');
    e.target.reset();
    await loadDevices();
  } else {
    showToast(data?.message || 'Failed to add device', 'error');
  }
}

function typeToIcon(type) {
  return { mobile: '📱', laptop: '💻', tablet: '📟', vehicle: '🚗', other: '📦' }[type] || '📦';
}

// ─────────────────────────────────────────────
// Delete Device
// ─────────────────────────────────────────────
async function deleteDevice(deviceId, name) {
  if (!confirm(`Delete "${name}" and all its location history?`)) return;
  const data = await api(`/api/devices/${deviceId}`, { method: 'DELETE' });
  if (data?.success) {
    showToast(`Device "${name}" deleted`, 'warning');

    // Remove from map
    if (mainMarkers[deviceId]) { mainMap.removeLayer(mainMarkers[deviceId]); delete mainMarkers[deviceId]; }
    if (mainPaths[deviceId]) { mainMap.removeLayer(mainPaths[deviceId]); delete mainPaths[deviceId]; }

    await loadDevices();
  } else {
    showToast('Failed to delete device', 'error');
  }
}

function copyDeviceId(deviceId) {
  navigator.clipboard.writeText(deviceId).then(() => {
    showToast('Device ID copied to clipboard!', 'success', 2000);
  });
}

// ─────────────────────────────────────────────
// Device Detail Modal
// ─────────────────────────────────────────────
function openDeviceDetail(deviceId) {
  const device = devices.find(d => d._id === deviceId);
  if (!device) return;
  document.getElementById('detail-title').textContent = `${device.icon} ${device.name}`;
  document.getElementById('device-detail-content').innerHTML = `
    <div style="padding:1.5rem;display:flex;flex-direction:column;gap:1rem;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div>
          <div class="section-title">Device Info</div>
          <table class="data-table">
            <tr><td>Type</td><td>${device.type}</td></tr>
            <tr><td>Status</td><td><span class="status-dot ${device.status}" style="display:inline-block"></span> ${device.status}</td></tr>
            <tr><td>Battery</td><td>${device.battery?.level != null ? `${device.battery.level}%${device.battery.charging ? ' ⚡' : ''}` : '—'}</td></tr>
            <tr><td>Registered</td><td>${new Date(device.createdAt).toLocaleDateString()}</td></tr>
          </table>
        </div>
        <div>
          <div class="section-title">Last Location</div>
          <table class="data-table">
            <tr><td>Lat</td><td>${device.lastLocation?.lat?.toFixed(6) ?? '—'}</td></tr>
            <tr><td>Lng</td><td>${device.lastLocation?.lng?.toFixed(6) ?? '—'}</td></tr>
            <tr><td>Accuracy</td><td>${device.lastLocation?.accuracy != null ? device.lastLocation.accuracy + 'm' : '—'}</td></tr>
            <tr><td>Last Seen</td><td>${device.lastLocation?.timestamp ? timeAgo(device.lastLocation.timestamp) : 'Never'}</td></tr>
          </table>
        </div>
      </div>
      <div>
        <div class="section-title">Device Tracking ID</div>
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:0.75rem;font-family:var(--font-mono);font-size:0.78rem;word-break:break-all;color:var(--accent)">
          ${device.deviceId}
        </div>
        <p style="font-size:0.72rem;color:var(--text-muted);margin-top:0.5rem;font-family:var(--font-mono)">
          Use this ID in your tracking client to send real-time location updates.
        </p>
      </div>
      ${device.notes ? `<div><div class="section-title">Notes</div><p style="font-size:0.85rem;color:var(--text-muted)">${device.notes}</p></div>` : ''}
    </div>`;
  openModal('modal-device-detail');
}

// ─────────────────────────────────────────────
// Location History
// ─────────────────────────────────────────────
function showHistoryForDevice(deviceId) {
  switchView('history', document.querySelector('[data-view="history"]'));
  setTimeout(() => {
    document.getElementById('history-device-select').value = deviceId;
    loadHistory();
  }, 100);
}

async function loadHistory() {
  const deviceId = document.getElementById('history-device-select').value;
  const hours = document.getElementById('history-hours').value;
  const tbody = document.getElementById('history-tbody');

  if (!deviceId) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Select a device to view history</td></tr>';
    return;
  }

  tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Loading...</td></tr>';

  const data = await api(`/api/locations/${deviceId}/path?hours=${hours}`);
  if (!data?.success || data.path.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No location data for this period</td></tr>';
    document.getElementById('history-map-wrapper').style.display = 'none';
    return;
  }

  // Render table
  tbody.innerHTML = data.path.slice().reverse().map((p, i) => `
    <tr>
      <td>${data.path.length - i}</td>
      <td>${p.lat.toFixed(6)}</td>
      <td>${p.lng.toFixed(6)}</td>
      <td>—</td>
      <td>${p.speed != null ? (p.speed * 3.6).toFixed(1) + ' km/h' : '—'}</td>
      <td>—</td>
      <td>${new Date(p.createdAt).toLocaleString()}</td>
    </tr>`).join('');

  // Draw on history map
  document.getElementById('history-map-wrapper').style.display = 'block';
  initHistoryMap();
  setTimeout(() => historyMap.invalidateSize(), 100);

  // Clear old layers
  historyMap.eachLayer(layer => {
    if (layer instanceof L.Polyline || layer instanceof L.Marker || layer instanceof L.CircleMarker) {
      historyMap.removeLayer(layer);
    }
  });

  const latlngs = data.path.map(p => [p.lat, p.lng]);
  const device = devices.find(d => d._id === deviceId);
  const color = device?.color || '#39d353';

  L.polyline(latlngs, { color, weight: 3, opacity: 0.8 }).addTo(historyMap);

  // Start marker
  if (latlngs.length > 0) {
    L.circleMarker(latlngs[0], { radius: 7, color: '#58a6ff', fillColor: '#58a6ff', fillOpacity: 1 })
      .bindPopup('Start').addTo(historyMap);
    L.circleMarker(latlngs[latlngs.length - 1], { radius: 7, color: color, fillColor: color, fillOpacity: 1 })
      .bindPopup('Latest').addTo(historyMap);
    historyMap.fitBounds(L.latLngBounds(latlngs), { padding: [30, 30] });
  }
}

async function clearHistory() {
  const deviceId = document.getElementById('history-device-select').value;
  if (!deviceId) return;
  const device = devices.find(d => d._id === deviceId);
  if (!confirm(`Clear all location history for "${device?.name}"?`)) return;

  const data = await api(`/api/locations/${deviceId}`, { method: 'DELETE' });
  if (data?.success) {
    showToast('Location history cleared', 'warning');
    loadHistory();
    if (mainPaths[deviceId]) {
      mainPaths[deviceId].setLatLngs([]);
    }
  }
}

// ─────────────────────────────────────────────
// Geofences
// ─────────────────────────────────────────────
async function loadGeofences() {
  const data = await api('/api/geofences');
  if (!data?.success) return;
  geofences = data.geofences;
  renderGeofenceList();
  if (mainMap) renderFencesOnMainMap();
}

function renderGeofenceList() {
  const list = document.getElementById('geofence-list');
  if (geofences.length === 0) {
    list.innerHTML = '<div class="empty-state">No geofences yet. Click "+ Add Geofence" to create one.</div>';
    return;
  }
  list.innerHTML = geofences.map(f => `
    <div class="geofence-item" onclick="focusGeofence('${f._id}')">
      <div style="display:flex;align-items:center;">
        <span class="gi-color-dot" style="background:${f.color}"></span>
        <span class="gi-name">${f.name}</span>
      </div>
      <div class="gi-meta">
        Radius: ${f.radius}m &nbsp;|&nbsp;
        ${f.alertOnExit ? '🚨 Exit ' : ''}${f.alertOnEnter ? '✅ Enter' : ''}
        ${f.device ? `<br>Device: ${f.device?.name || 'linked'}` : '<br>All devices'}
      </div>
      <div class="gi-actions">
        <button class="btn-sm btn-danger" onclick="event.stopPropagation();deleteGeofence('${f._id}','${f.name}')">🗑 Delete</button>
        <button class="btn-sm btn-outline" onclick="event.stopPropagation();toggleGeofence('${f._id}',${!f.isActive})">
          ${f.isActive ? '⏸ Disable' : '▶️ Enable'}
        </button>
      </div>
    </div>`).join('');
}

function renderGeofencesOnMap() {
  if (!geofenceMap) return;
  geofenceMap.eachLayer(l => {
    if (l instanceof L.Circle) geofenceMap.removeLayer(l);
  });
  geofences.forEach(f => {
    L.circle([f.center.lat, f.center.lng], {
      radius: f.radius,
      color: f.color,
      fillColor: f.color,
      fillOpacity: 0.1,
      weight: 2
    }).bindPopup(`<b>${f.name}</b><br>${f.radius}m`).addTo(geofenceMap);
  });
  if (geofences.length > 0) {
    const bounds = geofences.map(f => [f.center.lat, f.center.lng]);
    geofenceMap.fitBounds(L.latLngBounds(bounds), { padding: [40, 40] });
  }
}

function focusGeofence(id) {
  const f = geofences.find(g => g._id === id);
  if (!f || !geofenceMap) return;
  geofenceMap.setView([f.center.lat, f.center.lng], 13);
}

function openGeofenceModal() {
  populateDeviceSelects();
  openModal('modal-geofence');
}

async function submitGeofence(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById('fence-name').value,
    center: {
      lat: parseFloat(document.getElementById('fence-lat').value),
      lng: parseFloat(document.getElementById('fence-lng').value)
    },
    radius: parseInt(document.getElementById('fence-radius').value),
    device: document.getElementById('fence-device').value || null,
    alertOnExit: document.getElementById('fence-alert-exit').checked,
    alertOnEnter: document.getElementById('fence-alert-enter').checked
  };

  const data = await api('/api/geofences', { method: 'POST', body: JSON.stringify(payload) });
  if (data?.success) {
    showToast(`Geofence "${payload.name}" created`, 'success');
    closeModal('modal-geofence');
    e.target.reset();
    await loadGeofences();
    renderGeofencesOnMap();
    if (mainMap) renderFencesOnMainMap();
  } else {
    showToast(data?.message || 'Failed to create geofence', 'error');
  }
}

async function deleteGeofence(id, name) {
  if (!confirm(`Delete geofence "${name}"?`)) return;
  const data = await api(`/api/geofences/${id}`, { method: 'DELETE' });
  if (data?.success) {
    showToast(`Geofence "${name}" deleted`, 'warning');
    await loadGeofences();
    renderGeofencesOnMap();
    if (mainMap) renderFencesOnMainMap();
  }
}

async function toggleGeofence(id, isActive) {
  const data = await api(`/api/geofences/${id}`, { method: 'PUT', body: JSON.stringify({ isActive }) });
  if (data?.success) {
    await loadGeofences();
  }
}

// ─────────────────────────────────────────────
// Alerts
// ─────────────────────────────────────────────
function addAlert(alertData) {
  alerts.unshift(alertData);
  alertCount++;
  document.getElementById('stat-alerts').textContent = alertCount;

  // Show badge
  const badge = document.getElementById('alert-badge');
  badge.classList.remove('hidden');
  badge.textContent = alertCount;

  renderAlerts();
}

function renderAlerts() {
  const list = document.getElementById('alert-list');
  if (alerts.length === 0) {
    list.innerHTML = '<div class="empty-state">No alerts yet.</div>';
    return;
  }

  const icons = { geofence_exit: '🚨', geofence_enter: '✅', battery: '🔋' };

  list.innerHTML = alerts.map(a => `
    <div class="alert-item ${a.type}">
      <span class="alert-icon">${icons[a.type] || '🔔'}</span>
      <div class="alert-content">
        <div class="alert-message">${a.message}</div>
        <div class="alert-time">${new Date(a.timestamp).toLocaleString()}</div>
      </div>
    </div>`).join('');
}

function clearAlerts() {
  alerts = [];
  alertCount = 0;
  document.getElementById('stat-alerts').textContent = '0';
  document.getElementById('alert-badge').classList.add('hidden');
  renderAlerts();
}

// ─────────────────────────────────────────────
// Admin Panel
// ─────────────────────────────────────────────
async function loadAdminData() {
  const [statsData, usersData] = await Promise.all([
    api('/api/admin/stats'),
    api('/api/admin/users')
  ]);

  if (statsData?.success) {
    const s = statsData.stats;
    document.getElementById('admin-stats').innerHTML = `
      <div class="stat-card"><div class="stat-value">${s.totalUsers}</div><div class="stat-label">Users</div></div>
      <div class="stat-card"><div class="stat-value">${s.totalDevices}</div><div class="stat-label">Devices</div></div>
      <div class="stat-card online"><div class="stat-value">${s.onlineDevices}</div><div class="stat-label">Online Now</div></div>
      <div class="stat-card"><div class="stat-value">${s.totalPings}</div><div class="stat-label">Total Pings</div></div>`;
  }

  if (usersData?.success) {
    const tbody = document.getElementById('admin-users-tbody');
    tbody.innerHTML = usersData.users.map(u => `
      <tr>
        <td>${u.name}</td>
        <td>${u.email}</td>
        <td><span class="badge badge-${u.role}">${u.role}</span></td>
        <td><span class="badge badge-${u.isActive ? 'active' : 'inactive'}">${u.isActive ? 'Active' : 'Inactive'}</span></td>
        <td>${new Date(u.createdAt).toLocaleDateString()}</td>
        <td>
          <button class="btn-icon" onclick="toggleUserActive('${u._id}',${!u.isActive})" title="${u.isActive ? 'Deactivate' : 'Activate'}">${u.isActive ? '🚫' : '✅'}</button>
          <button class="btn-icon" onclick="promoteUser('${u._id}','${u.role}')" title="Toggle Role">👑</button>
          <button class="btn-icon" onclick="adminDeleteUser('${u._id}','${u.name}')" title="Delete">🗑️</button>
        </td>
      </tr>`).join('');
  }
}

async function toggleUserActive(userId, isActive) {
  const data = await api(`/api/admin/users/${userId}`, { method: 'PUT', body: JSON.stringify({ isActive }) });
  if (data?.success) { showToast('User status updated', 'success'); loadAdminData(); }
}

async function promoteUser(userId, currentRole) {
  const newRole = currentRole === 'admin' ? 'user' : 'admin';
  if (!confirm(`Change user role to "${newRole}"?`)) return;
  const data = await api(`/api/admin/users/${userId}`, { method: 'PUT', body: JSON.stringify({ role: newRole }) });
  if (data?.success) { showToast(`User role changed to ${newRole}`, 'info'); loadAdminData(); }
}

async function adminDeleteUser(userId, name) {
  if (!confirm(`Permanently delete user "${name}" and all their data?`)) return;
  const data = await api(`/api/admin/users/${userId}`, { method: 'DELETE' });
  if (data?.success) { showToast(`User "${name}" deleted`, 'warning'); loadAdminData(); }
}

// ─────────────────────────────────────────────
// Utility: Time Ago
// ─────────────────────────────────────────────
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─────────────────────────────────────────────
// Load historical path on startup
// ─────────────────────────────────────────────
async function loadInitialPaths() {
  for (const device of devices) {
    if (!device.lastLocation?.lat) continue;
    const data = await api(`/api/locations/${device._id}/path?hours=24`);
    if (!data?.success || data.path.length < 2) continue;
    const latlngs = data.path.map(p => [p.lat, p.lng]);
    mainPaths[device._id] = L.polyline(latlngs, {
      color: device.color || '#39d353',
      weight: 3,
      opacity: 0.6,
      dashArray: '6,4'
    }).addTo(mainMap);
  }
}

// ─────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────
async function init() {
  initUserUI();
  initMainMap();
  initSocket();

  await loadDevices();
  await loadGeofences();

  placeDevicesOnMap();
  await loadInitialPaths();
  renderAlerts();
}

init();
