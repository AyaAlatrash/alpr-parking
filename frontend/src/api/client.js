import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000';

const client = axios.create({ baseURL: API_BASE });

// Attach JWT to every request
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-logout on 401
client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default client;

// ---- Auth ----
export const login = (username, password) =>
  client.post('/auth/login', { username, password });

// ---- Stats ----
export const fetchStats = () =>
  client.get('/api/stats');

// ---- Detections ----
export const fetchDetections = (params = {}) =>
  client.get('/api/detections', { params });

export const deleteDetection = (id) =>
  client.delete(`/api/detections/${id}`);

// ---- Vehicles (Whitelist) ----
export const fetchVehicles = () =>
  client.get('/api/vehicles');

export const addVehicle = (data) =>
  client.post('/api/vehicles', data);

export const deleteVehicle = (plate) =>
  client.delete(`/api/vehicles/${encodeURIComponent(plate)}`);

// ---- Settings ----
export const fetchSettings  = ()     => client.get('/api/settings');
export const saveSettings   = (data) => client.post('/api/settings', data);
export const testTelegram   = (data) => client.post('/api/settings/test-telegram', data);

// ---- Camera Stream URL ----
export const CAMERA_FEED_URL = `${API_BASE}/camera-feed`;
export const IMAGE_BASE_URL = API_BASE;
