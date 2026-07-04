import axios from 'axios';

// Base URL for API calls
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5050';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000, // 15s — extended for report generation endpoints
});

// ---------------------------------------------------------------------------
// REQUEST INTERCEPTOR
// ---------------------------------------------------------------------------
// Stub for future JWT authentication (Section 3).
// When auth is enabled, this attaches the Bearer token to every request.
let _authToken = null;

export const setAuthToken = (token) => {
  _authToken = token;
};

api.interceptors.request.use(
  (config) => {
    const token = _authToken || sessionStorage.getItem('pos_session_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ---------------------------------------------------------------------------
// RETRY INTERCEPTOR (For GET requests)
// ---------------------------------------------------------------------------
api.interceptors.response.use(undefined, (err) => {
  const { config } = err;
  if (!config || config.method !== 'get') return Promise.reject(err);
  
  // Only retry network errors or 5xx
  const status = err.response?.status;
  if (status && status < 500 && status !== 408) return Promise.reject(err);

  config.__retryCount = config.__retryCount || 0;
  if (config.__retryCount >= 3) return Promise.reject(err);
  
  config.__retryCount += 1;
  const backoff = new Promise(resolve => setTimeout(resolve, 1000 * config.__retryCount));
  return backoff.then(() => api(config));
});

// ---------------------------------------------------------------------------
// RESPONSE INTERCEPTOR
// ---------------------------------------------------------------------------
// Dispatches a custom 'api-error' DOM event on any non-2xx response.
// ApiErrorListener.jsx listens for this event and shows a toast via AlertContext.
api.interceptors.response.use(
  (response) => response, // Pass through successful responses
  (error) => {
    const isNetworkError = !error.response;
    const status = error.response?.status || 0;
    const serverMessage =
      error.response?.data?.error ||
      error.response?.data?.message ||
      '';

    let message;
    if (isNetworkError) {
      message = 'Unable to connect to the server. Please check if the backend is running.';
    } else if (status === 400) {
      message = serverMessage || 'The request was invalid. Please check your input and try again.';
    } else if (status === 401) {
      message = serverMessage || 'Your session has expired. Please log in again.';
    } else if (status === 403) {
      message = serverMessage || 'You do not have permission to perform this action.';
    } else if (status === 404) {
      message = serverMessage || 'The requested item was not found.';
    } else if (status === 408) {
      message = 'The request timed out. Please try again.';
    } else if (status === 409) {
      message = serverMessage || 'A conflict occurred. The item may have been modified by someone else.';
    } else if (status === 422) {
      message = serverMessage || 'The provided data is invalid. Please check your input.';
    } else if (status === 429) {
      message = 'Too many requests. Please wait a moment and try again.';
    } else if (status >= 500) {
      message = serverMessage || 'Something went wrong on the server. Please try again later.';
    } else {
      message = serverMessage || error.message || 'An unexpected error occurred. Please try again.';
    }

    // Dispatch custom event for ApiErrorListener
    window.dispatchEvent(
      new CustomEvent('api-error', {
        detail: { message, status, isNetworkError },
      })
    );

    // Log to Electron IPC if available
    if (window.electronAPI?.writeLog) {
      try {
        window.electronAPI.writeLog({
          level: 'error',
          source: 'Axios',
          message,
          url: error.config?.url,
          method: error.config?.method,
          status,
          timestamp: new Date().toISOString(),
        });
      } catch (_) {
        // IPC not available
      }
    }

    return Promise.reject(error);
  }
);

// Product Management APIs
export const productsAPI = {
  // Get all products
  // Get all products (supports include_stock=true)
  getAllProducts: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/api/products?${query}`);
  },

  getAllProductsWithInactive: () => api.get('/api/products?include_inactive=true'),

  // Create new product
  createProduct: (productData) => api.post('/api/products', productData),

  // Update product
  updateProduct: (productId, productData) => api.put(`/api/products/${productId}`, productData),

  // Get specific product
  getProduct: (productId) => api.get(`/api/products/${productId}`),
};

// Billing APIs
export const billingAPI = {
  // Create new bill
  createBill: (billData) => api.post('/api/bill/create', billData),

  // Get specific bill
  getBill: (billNo) => api.get(`/api/bill/${billNo}`),

  // Get today's bills
  getTodayBills: () => api.get('/api/bill/today'),

  // Get next bill number
  getNextBillNumber: () => api.get('/api/bill/next-number'),

  // Print bill
  printBill: (billNo) => api.post(`/api/bill/print/${billNo}`),
};

// Summary APIs
export const summaryAPI = {
  // Get today's summary
  getTodaySummary: () => api.get('/api/summary/today'),

  // Get summary for specific date
  getSummaryForDate: (dateStr) => api.get(`/api/summary/date/${dateStr}`),

  // Get top selling products
  getTopSellingProducts: (limit = 10) => api.get(`/api/summary/top-products?limit=${limit}`),

  // Get quick stats
  getQuickStats: () => api.get('/api/summary/quick-stats'),

  // Get range-based summary (Week/Month/Year)
  getRangeSummary: (range, date) => api.get('/api/summary/range', { params: { range, date } }),
};

// Reports APIs
export const reportsAPI = {
  // Export today's Excel report
  exportTodayExcel: (reportType = 'detailed') =>
    api.get(`/api/reports/excel/today?type=${reportType}`, { responseType: 'blob' }),

  // Export today's CSV report
  exportTodayCSV: (reportType = 'simple') =>
    api.get(`/api/reports/excel/today?type=${reportType}`, { responseType: 'blob' }),

  // Export today's XML report
  exportTodayXML: () =>
    api.get('/api/reports/xml/today', { responseType: 'blob' }),

  // Preview Excel data
  previewExcel: () => api.get('/api/reports/preview/excel'),

  // Preview XML data
  previewXML: () => api.get('/api/reports/preview/xml'),

  // Get available reports
  getAvailableReports: () => api.get('/api/reports/available-reports'),
};

// Inventory APIs
export const inventoryAPI = {
  // Get all inventory
  getAllInventory: () => api.get('/api/inventory'),

  // Get specific item
  getInventoryItem: (id) => api.get(`/api/inventory/${id}`),

  // Create item
  createInventory: (data) => api.post('/api/inventory/create', data),

  // Update item
  updateInventory: (id, data) => api.put(`/api/inventory/${id}`, data),

  // Adjust stock
  adjustStock: (id, adjustment) => api.post('/api/inventory/adjust', { id, adjustment }),

  // Delete item
  deleteInventory: (id) => api.delete(`/api/inventory/${id}`),
};

// System APIs
export const systemAPI = {
  // Health check
  healthCheck: () => api.get('/health'),

  // Get server info
  getServerInfo: () => api.get('/'),
};

// Logs APIs
export const logsAPI = {
  /**
   * GET /api/logs/recent
   * @param {number} lines  - number of log lines to return (max 1000)
   * @param {string} level  - optional filter: 'WARNING' | 'ERROR' | 'CRITICAL'
   */
  getRecentLogs: (lines = 200, level = '') =>
    api.get(`/api/logs/recent?lines=${lines}${level ? `&level=${level}` : ''}`),

  /**
   * POST /api/logs/write — HTTP fallback for non-Electron environments.
   * @param {string} level
   * @param {string} source
   * @param {string} message
   */
  writeFrontendLog: (level, source, message) =>
    api.post('/api/logs/write', { level, source, message }),
};

// ---------------------------------------------------------------------------
// Frontend logger utility
// Writes to Electron IPC first (if available), then HTTP fallback.
// Usage: import { flog } from './api'; flog.warn('Products', 'Load failed');
// ---------------------------------------------------------------------------
const _ipc = () => window.electronAPI?.writeLog;

export const flog = {
  _send(level, source, message) {
    const payload = { level, source, message, timestamp: new Date().toISOString() };
    if (_ipc()) {
      try { _ipc()(payload); return; } catch (_) {}
    }
    // HTTP fallback (fire and forget)
    logsAPI.writeFrontendLog(level, source, message).catch(() => {});
  },
  debug:    (source, msg) => flog._send('debug',    source, msg),
  info:     (source, msg) => flog._send('info',     source, msg),
  warn:     (source, msg) => flog._send('warning',  source, msg),
  error:    (source, msg) => flog._send('error',    source, msg),
};


// Utility function to handle API errors
export const handleAPIError = (error) => {
  if (error.response) {
    const status = error.response.status;
    const serverMsg = error.response.data?.message || error.response.data?.error || '';

    let message;
    if (status === 400) {
      message = serverMsg || 'The request was invalid. Please check your input and try again.';
    } else if (status === 401) {
      message = serverMsg || 'Your session has expired. Please log in again.';
    } else if (status === 403) {
      message = serverMsg || 'You do not have permission to perform this action.';
    } else if (status === 404) {
      message = serverMsg || 'The requested item was not found.';
    } else if (status === 408) {
      message = 'The request timed out. Please try again.';
    } else if (status === 409) {
      message = serverMsg || 'A conflict occurred. The item may have been modified by someone else.';
    } else if (status === 422) {
      message = serverMsg || 'The provided data is invalid. Please check your input.';
    } else if (status === 429) {
      message = 'Too many requests. Please wait a moment and try again.';
    } else if (status >= 500) {
      message = serverMsg || 'Something went wrong on the server. Please try again later.';
    } else {
      message = serverMsg || 'An unexpected error occurred.';
    }

    return {
      message,
      status,
      data: error.response.data,
    };
  } else if (error.request) {
    return {
      message: 'Unable to connect to the server. Please check if the backend is running.',
      status: 0,
      data: null,
    };
  } else {
    return {
      message: error.message || 'An unexpected error occurred. Please try again.',
      status: -1,
      data: null,
    };
  }
};

// Utility function to download files
export const downloadFile = (blob, filename) => {
  if (window.electronAPI && window.electronAPI.saveFile) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Data = reader.result.split(',')[1];
        await window.electronAPI.saveFile(filename, base64Data);
      } catch (err) {
        console.error('Failed to save file via Electron IPC:', err);
      }
    };
    reader.readAsDataURL(blob);
  } else {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }
};

// Generic API request function
export const apiRequest = async (method, url, data = null) => {
  try {
    const config = {
      method,
      url,
    };
    
    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      config.data = data;
    }
    
    const response = await api(config);
    
    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    console.error(`API ${method} ${url} failed:`, error);
    
    return {
      success: false,
      error: error.response?.data?.message || error.message || 'Request failed',
      status: error.response?.status || 0,
    };
  }
};

export default api;
