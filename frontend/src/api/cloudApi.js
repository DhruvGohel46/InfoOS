import axios from 'axios';

// Load variables from React process.env with default placeholders
const CLOUD_API_URL = process.env.REACT_APP_CLOUD_API_URL || 'https://your-cloud-backend.onrender.com/api';
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || 'https://dummy-project.supabase.co';
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || 'dummy-anon-key-content-for-compilation';

// 1. Axios Instance for Express Cloud Backend
export const cloudApi = axios.create({
  baseURL: CLOUD_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 20000, // 20s timeout
});

// Request interceptor to dynamically attach the cloud JWT
let _cloudToken = localStorage.getItem('cloud_auth_token') || null;

export const setCloudAuthToken = (token) => {
  _cloudToken = token;
  if (token) {
    localStorage.setItem('cloud_auth_token', token);
    cloudApi.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    localStorage.removeItem('cloud_auth_token');
    delete cloudApi.defaults.headers.common['Authorization'];
  }
};

// Initialize authorization headers if token exists on load
if (_cloudToken) {
  cloudApi.defaults.headers.common['Authorization'] = `Bearer ${_cloudToken}`;
}

// 2. Axios Instance for direct Supabase Auth REST calls (avoids installing heavy SDK)
const supabaseApi = axios.create({
  baseURL: SUPABASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
  },
  timeout: 15000,
});

// 3. Supabase direct Auth REST endpoints
export const cloudAuthAPI = {
  /**
   * Log in via Supabase Auth REST API
   */
  login: async (email, password) => {
    try {
      const response = await supabaseApi.post('/auth/v1/token?grant_type=password', {
        email,
        password,
      });
      return { success: true, data: response.data };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error_description || error.response?.data?.error || error.message || 'Login failed',
      };
    }
  },
};

// 4. Cloud Backend sync endpoints
export const cloudSyncAPI = {
  /**
   * Get subscription status of logged-in user
   */
  getSubscriptionStatus: async () => {
    const { data } = await cloudApi.get('/subscription/status');
    return data;
  },

  /**
   * Get franchise role profile of logged-in user
   */
  getFranchiseProfile: async () => {
    const { data } = await cloudApi.get('/franchise/profile');
    return data;
  },

  /**
   * Sync weekly aggregated sales/expense backup to the cloud backend
   */
  syncBackup: async (backupPayload) => {
    const { data } = await cloudApi.post('/backup/sync', backupPayload);
    return data;
  },
};
