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
    if (_authToken) {
      config.headers.Authorization = `Bearer ${_authToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ---------------------------------------------------------------------------
// RETRY INTERCEPTOR (For GET requests)
// ---------------------------------------------------------------------------
api.interceptors.response.use(undefined, (err) => {
  const { config, message } = err;
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
      message = 'Network error — Unable to connect to server';
    } else if (status === 401) {
      message = serverMessage || 'Authentication required';
    } else if (status === 404) {
      message = serverMessage || 'Resource not found';
    } else if (status >= 500) {
      message = serverMessage || 'Server error — please try again';
    } else {
      message = serverMessage || error.message || 'Request failed';
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
    // Server responded with error status
    return {
      message: error.response.data.message || 'Server error',
      status: error.response.status,
      data: error.response.data,
    };
  } else if (error.request) {
    // Request was made but no response received
    return {
      message: 'Network error - Unable to connect to server',
      status: 0,
      data: null,
    };
  } else {
    // Something else happened
    return {
      message: error.message || 'Unknown error occurred',
      status: -1,
      data: null,
    };
  }
};

// Utility function to download files
export const downloadFile = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
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
