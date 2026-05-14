import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000/api/v1';

const api = axios.create({ baseURL: API_BASE });

// Attach access token to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Silent token refresh on 401
api.interceptors.response.use(
  response => response,
  async error => {
    const original = error.config;
    if (error.response?.status === 401 && error.response?.data?.code === 'TOKEN_EXPIRED' && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        const { data } = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken });
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// In production REACT_APP_API_URL is '/api/v1' → SERVER_BASE becomes '' (empty),
// which makes file URLs relative and resolves correctly to current origin (HTTPS).
// In dev mode REACT_APP_API_URL is unset → falls back to localhost.
const SERVER_BASE = process.env.REACT_APP_API_URL !== undefined
  ? process.env.REACT_APP_API_URL.replace('/api/v1', '')
  : 'http://localhost:3000';

/**
 * Convert a file path from the database to a full HTTP URL.
 * Handles: absolute disk paths (legacy), relative paths, and already-full URLs.
 */
export function getFileUrl(filePath) {
  if (!filePath) return '';
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) return filePath;

  let relativePath;
  if (filePath.startsWith('uploads/')) {
    relativePath = filePath;
  } else {
    const uploadsIdx = filePath.indexOf('uploads/');
    relativePath = uploadsIdx !== -1 ? filePath.substring(uploadsIdx) : filePath;
  }

  // Split into directory + filename, encode only the filename
  const lastSlash = relativePath.lastIndexOf('/');
  const dir = relativePath.substring(0, lastSlash + 1);
  const filename = relativePath.substring(lastSlash + 1);
  return `${SERVER_BASE}/${dir}${encodeURIComponent(filename)}`;
}

export default api;
