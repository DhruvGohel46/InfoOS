/**
 * =============================================================================
 * AUTH API MODULE — auth.js
 * =============================================================================
 * Centralizes all /api/auth/* calls and token management.
 * Token is kept in-memory (_authToken) + sessionStorage for page refresh.
 * It is NEVER written to localStorage to reduce XSS risk.
 * =============================================================================
 */
import axios from 'axios';
import { setAuthToken } from './api';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5050';

// Bare axios (no interceptors) — auth calls must not trigger the api-error event
const rawHttp = axios.create({ baseURL: API_BASE_URL, timeout: 10000 });

const SESSION_KEY = 'pos_session_token';

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

/** Persist token in memory + sessionStorage */
export const persistToken = (token) => {
  setAuthToken(token);                     // attaches to all future api.js calls
  sessionStorage.setItem(SESSION_KEY, token);
};

/** Clear token from memory + sessionStorage */
export const clearToken = () => {
  setAuthToken(null);
  sessionStorage.removeItem(SESSION_KEY);
};

/** Returns stored token or null */
export const getStoredToken = () => sessionStorage.getItem(SESSION_KEY);

/**
 * Decode JWT payload without verification (verification is backend's job).
 * Used purely to check local expiry.
 */
export const decodeToken = (token) => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
};

/** Returns true if token exists and has not expired locally */
export const isTokenValid = (token) => {
  if (!token) return false;
  const payload = decodeToken(token);
  if (!payload?.exp) return false;
  // Give 60s leeway for clock skew
  return payload.exp * 1000 > Date.now() + 60_000;
};

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

/**
 * GET /api/auth/status
 * Returns { enabled, is_setup }
 */
export const getAuthStatus = async () => {
  const { data } = await rawHttp.get('/api/auth/status');
  return data; // { success, enabled, is_setup }
};

/**
 * POST /api/auth/login  { pin }
 * Returns { success, token }
 */
export const loginWithPin = async (pin) => {
  const { data } = await rawHttp.post('/api/auth/login', { pin });
  return data;
};

/**
 * POST /api/auth/setup  { pin, current_pin? }
 * First-time setup or PIN change.
 * Returns { success, token, message }
 */
export const setupPin = async (pin, currentPin = null) => {
  const body = { pin };
  if (currentPin) body.current_pin = currentPin;
  const { data } = await rawHttp.post('/api/auth/setup', body);
  return data;
};

/**
 * POST /api/auth/reset
 * Clears the PIN and disables PIN requirement.
 * Returns { success, message }
 */
export const resetPin = async () => {
  const { data } = await rawHttp.post('/api/auth/reset');
  return data;
};

/**
 * GET /api/auth/verify
 * Ping to check if stored token is still accepted by server.
 * Returns { success } or throws 401.
 */
export const verifyToken = async (token) => {
  const { data } = await rawHttp.get('/api/auth/verify', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
};
