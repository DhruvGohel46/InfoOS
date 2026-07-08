import axios from 'axios';

// Load variables from React process.env with default placeholders
const CLOUD_API_URL = process.env.REACT_APP_CLOUD_API_URL || 
  (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3000/api'
    : 'https://your-cloud-backend.onrender.com/api');
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

cloudApi.interceptors.request.use(
  (config) => {
    const token = _cloudToken || localStorage.getItem('cloud_auth_token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

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
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  },
  timeout: 15000,
});

// 3. Supabase direct Auth REST endpoints
export const cloudAuthAPI = {
  /**
   * Log in via Supabase Auth REST API
   */
  login: async (email, password) => {
    if (SUPABASE_URL.includes('dummy-project.supabase.co')) {
      console.log('Using dummy Supabase URL. Bypassing login with mock token.');
      const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
      const expTime = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60); // 1 year expiry
      const payload = btoa(JSON.stringify({
        sub: "dev-user-id-placeholder",
        email: email,
        exp: expTime,
        role: "authenticated"
      }));
      const mockToken = `${header}.${payload}.mocksignature`;

      return {
        success: true,
        data: {
          access_token: mockToken,
          user: {
            id: "dev-user-id-placeholder",
            email: email,
            email_confirmed_at: new Date().toISOString()
          }
        }
      };
    }

    try {
      const response = await supabaseApi.post('/auth/v1/token?grant_type=password', {
        email,
        password,
      });
      return { success: true, data: response.data };
    } catch (error) {
      const status = error.response?.status;
      const errorCode = error.response?.data?.error;
      const errorDesc = error.response?.data?.error_description || error.response?.data?.msg || '';

      // Map common Supabase auth errors to user-friendly messages
      let friendlyMessage;
      if (!error.response) {
        friendlyMessage = 'Unable to reach the authentication server. Please check your internet connection and try again.';
      } else if (status === 400) {
        if (errorCode === 'invalid_grant' || errorDesc.toLowerCase().includes('invalid login')) {
          friendlyMessage = 'Incorrect email or password. Please check your credentials and try again.';
        } else if (errorDesc.toLowerCase().includes('email not confirmed')) {
          friendlyMessage = 'Your email address has not been verified. Please check your inbox for a verification link.';
        } else if (errorDesc.toLowerCase().includes('user not found')) {
          friendlyMessage = 'No account found with this email address. Please sign up first.';
        } else {
          friendlyMessage = errorDesc || 'Incorrect email or password. Please try again.';
        }
      } else if (status === 422) {
        friendlyMessage = 'Please enter a valid email address and password.';
      } else if (status === 429) {
        friendlyMessage = 'Too many login attempts. Please wait a few minutes before trying again.';
      } else if (status >= 500) {
        friendlyMessage = 'The authentication service is temporarily unavailable. Please try again later.';
      } else {
        friendlyMessage = errorDesc || error.message || 'Login failed. Please try again.';
      }

      return {
        success: false,
        error: friendlyMessage,
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

  /**
   * Sync monthly aggregated sales/expense backup to the cloud backend
   */
  syncMonthlyBackup: async (backupPayload) => {
    const { data } = await cloudApi.post('/backup/sync-monthly', backupPayload);
    return data;
  },

  /**
   * Check if weekly report backup already exists on Supabase for given user and start date
   */
  checkWeeklyReportExists: async (userId, weekStartDate, token) => {
    if (SUPABASE_URL.includes('dummy-project.supabase.co')) {
      return false;
    }
    try {
      const response = await axios.get(`${SUPABASE_URL}/rest/v1/weekly_backups`, {
        params: {
          user_id: `eq.${userId}`,
          week_start_date: `eq.${weekStartDate}`,
          select: 'id'
        },
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`
        }
      });
      return response.data && response.data.length > 0;
    } catch (error) {
      console.error('checkWeeklyReportExists REST error:', error.response?.data || error.message);
      return false;
    }
  },

  /**
   * Check if monthly report backup already exists on Supabase for given user and start date
   */
  checkMonthlyReportExists: async (userId, monthStartDate, token) => {
    if (SUPABASE_URL.includes('dummy-project.supabase.co')) {
      return false;
    }
    try {
      const response = await axios.get(`${SUPABASE_URL}/rest/v1/monthly_backups`, {
        params: {
          user_id: `eq.${userId}`,
          month_start_date: `eq.${monthStartDate}`,
          select: 'id'
        },
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`
        }
      });
      return response.data && response.data.length > 0;
    } catch (error) {
      console.error('checkMonthlyReportExists REST error:', error.response?.data || error.message);
      return false;
    }
  },
};

// 5. Direct Supabase PostgREST Licensing queries
export const cloudLicenseAPI = {
  /**
   * Get user profile (role, subscription_status) from profiles table
   */
  getProfile: async (userId, token) => {
    if (SUPABASE_URL.includes('dummy-project.supabase.co')) {
      return { id: userId, role: 'standalone', subscription_status: 'active', subscription_expiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() };
    }
    try {
      const response = await axios.get(`${SUPABASE_URL}/rest/v1/profiles`, {
        params: {
          id: `eq.${userId}`,
          select: 'id,role,subscription_status,subscription_expiry'
        },
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`
        }
      });
      return response.data?.[0] || null;
    } catch (error) {
      console.error('getProfile REST error:', error.response?.data || error.message);
      return null;
    }
  },

  getSubscription: async (userId, token) => {
    if (SUPABASE_URL.includes('dummy-project.supabase.co')) {
      console.log('Using dummy Supabase URL. Bypassing subscription check.');
      return {
        id: "dev-subscription-id",
        user_id: userId,
        status: "active",
        expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        device_fingerprint: null,
        device_name: null
      };
    }

    try {
      const response = await axios.get(`${SUPABASE_URL}/rest/v1/subscriptions`, {
        params: {
          user_id: `eq.${userId}`,
          select: '*'
        },
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`
        }
      });
      const subscription = response.data?.[0] || null;

      // If no subscription row found, check if the user has an active profile
      // (master/franchise roles may have subscription_status in profiles but no subscriptions row)
      if (!subscription) {
        const profile = await cloudLicenseAPI.getProfile(userId, token);
        if (profile && profile.subscription_status === 'active') {
          return {
            id: `profile-${profile.id}`,
            user_id: userId,
            status: 'active',
            expiry_date: profile.subscription_expiry || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            device_fingerprint: null,
            device_name: null,
            _fromProfile: true
          };
        }
      }

      return subscription;
    } catch (error) {
      console.error('getSubscription REST error:', error.response?.data || error.message);
      const status = error.response?.status;
      let msg;
      if (!error.response) {
        msg = 'Unable to verify your subscription. Please check your internet connection.';
      } else if (status === 401 || status === 403) {
        msg = 'Your session has expired. Please log in again to continue.';
      } else if (status >= 500) {
        msg = 'The subscription service is temporarily unavailable. Please try again later.';
      } else {
        msg = error.response?.data?.message || 'Unable to verify your subscription. Please try again.';
      }
      throw new Error(msg);
    }
  },

  registerDevice: async (userId, token, fingerprint, deviceName) => {
    if (SUPABASE_URL.includes('dummy-project.supabase.co')) {
      console.log('Using dummy Supabase URL. Bypassing device registration.');
      return {
        id: "dev-subscription-id",
        user_id: userId,
        status: "active",
        expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        device_fingerprint: fingerprint,
        device_name: deviceName
      };
    }

    try {
      const response = await axios.patch(`${SUPABASE_URL}/rest/v1/subscriptions`, 
        {
          device_fingerprint: fingerprint,
          device_name: deviceName,
          updated_at: new Date().toISOString()
        },
        {
          params: {
            user_id: `eq.${userId}`
          },
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${token}`,
            'Prefer': 'return=representation' // Request Supabase to return the updated record
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('registerDevice REST error:', error.response?.data || error.message);
      const status = error.response?.status;
      let msg;
      if (!error.response) {
        msg = 'Unable to register this device. Please check your internet connection.';
      } else if (status === 401 || status === 403) {
        msg = 'Your session has expired. Please log in again to register this device.';
      } else if (status === 409) {
        msg = 'This subscription is already linked to another device. Please contact support.';
      } else if (status >= 500) {
        msg = 'The registration service is temporarily unavailable. Please try again later.';
      } else {
        msg = error.response?.data?.message || 'Device registration failed. Please try again.';
      }
      throw new Error(msg);
    }
  },

  unlinkDevice: async (userId, token) => {
    if (SUPABASE_URL.includes('dummy-project.supabase.co')) {
      return { success: true };
    }
    try {
      await axios.patch(`${SUPABASE_URL}/rest/v1/subscriptions`, 
        {
          device_fingerprint: null,
          device_name: null,
          updated_at: new Date().toISOString()
        },
        {
          params: {
            user_id: `eq.${userId}`
          },
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${token}`
          }
        }
      );
      return { success: true };
    } catch (error) {
      console.error('unlinkDevice REST error:', error.response?.data || error.message);
      const status = error.response?.status;
      let msg;
      if (!error.response) {
        msg = 'Unable to reset device link. Please check your internet connection.';
      } else if (status === 401 || status === 403) {
        msg = 'Your session has expired. Please log in again to reset the device.';
      } else if (status >= 500) {
        msg = 'The registration service is temporarily unavailable. Please try again later.';
      } else {
        msg = error.response?.data?.message || 'Device reset failed. Please try again.';
      }
      throw new Error(msg);
    }
  }
};
