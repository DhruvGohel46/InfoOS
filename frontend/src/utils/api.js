import axios from 'axios';

// Base URL for API calls - support both dev and production
const API_BASE_URL = process.env.REACT_APP_API_URL || `http://${process.env.REACT_APP_API_HOST || 'localhost'}:${process.env.REACT_APP_API_PORT || 5050}`;
const SESSION_KEY = 'pos_session_token';
let _authToken = null;

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // Increased from 10s to 30s to handle slower backend startup
});

// Request interceptor for logging & auth
api.interceptors.request.use(
  (config) => {
    config.metadata = { startTime: performance.now() };
    // Keep compatibility with auth module: prefer in-memory token, fallback to session.
    const token = _authToken || sessionStorage.getItem(SESSION_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

export const setAuthToken = (token) => {
  _authToken = token;
};

// RETRY INTERCEPTOR (For GET requests)
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

// RESPONSE INTERCEPTOR (Error handling, event dispatch, & Electron logging)
api.interceptors.response.use(
  (response) => {
    try {
      const startTime = response.config?.metadata?.startTime;
      const duration = startTime ? (performance.now() - startTime) : 0;
      window.dispatchEvent(new CustomEvent('api-diagnostic', {
        detail: {
          method: response.config?.method?.toUpperCase() || 'GET',
          url: response.config?.url || '',
          status: response.status,
          duration: parseFloat(duration.toFixed(1)),
          timestamp: new Date().toISOString()
        }
      }));
    } catch (_) { }
    return response;
  },
  (error) => {
    const isNetworkError = !error.response;
    const status = error.response?.status || 0;

    // HTTP 304 Not Modified is NOT an error — do not dispatch api-error toasts
    if (status === 304) {
      return Promise.resolve(error.response || { status: 304, data: null });
    }

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

    try {
      const startTime = error.config?.metadata?.startTime;
      const duration = startTime ? (performance.now() - startTime) : 0;
      window.dispatchEvent(new CustomEvent('api-diagnostic', {
        detail: {
          method: error.config?.method?.toUpperCase() || 'GET',
          url: error.config?.url || '',
          status: status || 'NETWORK_ERROR',
          duration: parseFloat(duration.toFixed(1)),
          timestamp: new Date().toISOString(),
          error: message || error.message
        }
      }));
    } catch (_) { }

    return Promise.reject(error);
  }
);

// Product Management APIs
export const productsAPI = {
  // Get all active products (for POS)
  getAllProducts: (params = {}) => api.get('/api/products', { params }),

  // Get all products including inactive ones (for management)
  getAllProductsWithInactive: () => api.get('/api/products?include_inactive=true&include_deleted=true'),

  // Create new product
  createProduct: (productData) => api.post('/api/products', productData),

  // Update existing product
  updateProduct: (productId, productData) => api.put(`/api/products/${productId}`, productData),

  // Soft delete product (Deactivate)
  deleteProduct: (productId) => {
    console.log('API deleteProduct called with ID:', productId);
    return api.delete(`/api/products/${productId}`);
  },

  // Alias for backward compatibility
  setOutOfStock: (productId) => {
    return api.delete(`/api/products/${productId}`);
  },

  // Set product as active (Reactivate)
  setActive: (productId) => {
    return api.put(`/api/products/${productId}`, { active: true });
  },

  // Permanently delete product (Hard Delete)
  deleteProductPermanently: (productId, password) => {
    return api.delete(`/api/products/${productId}?permanent=true`, {
      headers: {
        'x-admin-password': password
      }
    });
  },

  // Image Management
  uploadImage: (productId, formData) => {
    return api.post(`/api/products/${productId}/image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  deleteImage: (productId) => api.delete(`/api/products/${productId}/image`),

  getImageUrl: (filename, updatedAt) => {
    if (!filename) return null;
    const v = updatedAt ? `?v=${new Date(updatedAt).getTime()}` : '';
    return `${API_BASE_URL}/api/images/${filename}${v}`;
  },

  // Toggle favorite status
  toggleFavorite: (productId, isFavorite) =>
    api.put(`/api/products/${productId}`, { favorite: isFavorite }),

  // Reorder products
  reorderProducts: (orders) => api.put('/api/products/reorder', { orders }),
};

// Category Management APIs
export const categoriesAPI = {
  // Get all categories
  getAllCategories: (includeInactive = false) =>
    api.get(`/api/categories?include_inactive=${includeInactive}`),

  // Create new category
  createCategory: (data) => api.post('/api/categories', data),

  // Update existing category
  updateCategory: (id, data) => api.put(`/api/categories/${id}`, data),

  // Secure remove or deactivate
  deleteCategory: (id) => api.delete(`/api/categories/${id}`),

  // Check usage
  checkUsage: (id) => api.get(`/api/categories/${id}/usage`),

  // Reorder categories
  reorderCategories: (orders) => api.put('/api/categories/reorder', { orders }),
};

// Group Management APIs
export const groupsAPI = {
  getAllGroups: (includeInactive = false) =>
    api.get(`/api/groups?include_inactive=${includeInactive}`),

  createGroup: (data) => api.post('/api/groups', data),

  updateGroup: (id, data) => api.put(`/api/groups/${id}`, data),

  deleteGroup: (id, action = '', moveTo = '') => {
    let url = `/api/groups/${id}`;
    const params = [];
    if (action) params.push(`action=${action}`);
    if (moveTo) params.push(`move_to=${moveTo}`);
    if (params.length > 0) {
      url += `?${params.join('&')}`;
    }
    return api.delete(url);
  },

  getGroupCategories: (id) => api.get(`/api/groups/${id}/categories`),
};

// Menu Import API
export const importMenuAPI = {
  /**
   * Upload a .csv or .xlsx menu file for bulk product import.
   * @param {File} file - The file object from an <input type="file">
   * @param {function} onUploadProgress - Optional axios progress callback
   */
  importFile: (file, onUploadProgress) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/api/import-menu', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000, // 2 min — large files may take time
      onUploadProgress,
    });
  },

  getSampleCsvUrl: () => `${API_BASE_URL}/api/import-menu/sample-csv`,
  getSampleXlsxUrl: () => `${API_BASE_URL}/api/import-menu/sample-xlsx`,
};


export const billingAPI = {
  // Create new bill with products
  createBill: (billData) => api.post('/api/bill/create', billData),

  // Get specific bill by number
  getBill: (billNo) => api.get(`/api/bill/${billNo}`),

  // Get all bills for today
  getTodayBills: () => api.get('/api/bill/today'),

  // Get bills for a specific date
  getBillsByDate: (date) => api.get(`/api/bill/date/${date}`),

  // Get next bill number for today
  getNextBillNumber: () => api.get('/api/bill/next-number'),

  // Print existing bill
  printBill: (billNo, payload = {}) => api.post(`/api/bill/print/${billNo}`, payload),

  // Print KOT for existing bill
  printKOT: (billNo, payload = {}) => api.post(`/api/bill/print-kot/${billNo}`, payload),

  // Management: Get all bills including cancelled
  getAllBills: () => api.get('/api/bill/management/all'),

  // Management: Cancel a bill
  cancelBill: (billNo) => api.put(`/api/bill/${billNo}/cancel`),

  // Management: Update a bill
  updateBill: (billNo, billData) => api.put(`/api/bill/${billNo}/update`, billData),

  // Management: Clear all bills
  clearAllBills: (password) =>
    api.delete('/api/bill/clear', {
      data: { password }
    }),

  // Live Order View & Drag-to-Merge
  getLiveOrders: (version = '') =>
    api.get(`/api/bill/live${version ? `?version=${version}` : ''}`, {
      validateStatus: (status) => (status >= 200 && status < 300) || status === 304,
    }),
  mergeOrders: (billIds) => api.post('/api/bill/merge', { bill_ids: billIds }),
  settleMergeGroup: (groupId, payments) => api.post(`/api/bill/merge/${groupId}/settle`, { payments }),
  settleBill: (billId, payments) => api.post(`/api/bill/${billId}/settle`, { payments }),
  splitMergeGroup: (groupId) => api.post(`/api/bill/merge/${groupId}/split`),
};

// Summary APIs
export const summaryAPI = {
  // Get comprehensive today's summary
  getTodaySummary: () => api.get('/api/summary/today'),

  // Get summary for specific date
  getSummaryForDate: (dateStr) => api.get(`/api/summary/date/${dateStr}`),

  // Get top selling products
  getTopSellingProducts: (limit = 10) => api.get(`/api/summary/top-products?limit=${limit}`),

  // Get quick dashboard stats
  getQuickStats: () => api.get('/api/summary/quick-stats'),

  // Get range-based summary (Week/Month/Year)
  getRangeSummary: (range, date) => api.get('/api/summary/range', { params: { range, date } }),

  // Get product-wise sales (optionally for specific date)
  getProductSales: (date = null) =>
    api.get('/api/summary/product-sales', { params: date ? { date } : {} }),

  // Get pre-aggregated summary by date range
  getAggregatedSummary: (start, end) =>
    api.get('/api/summary/aggregated', { params: { start, end } }),
};

// Reports APIs
export const reportsAPI = {
  // 1. Daily Sales Report
  exportDailySalesExcel: (date = null) => {
    const url = date ? `/api/reports/excel/daily?date=${date}` : '/api/reports/excel/daily';
    return api.get(url, { responseType: 'blob' });
  },

  // 2. Weekly Sales Summary
  exportWeeklySalesExcel: (date = null) => {
    const url = date ? `/api/reports/excel/weekly?date=${date}` : '/api/reports/excel/weekly';
    return api.get(url, { responseType: 'blob' });
  },

  // 3. Monthly Sales Summary
  exportMonthlySalesExcel: (month, year) =>
    api.get(`/api/reports/excel/monthly?month=${month}&year=${year}`, { responseType: 'blob' }),

  // 4. Weekly Expense Report
  exportWeeklyExpensesExcel: (date = null) => {
    const url = date ? `/api/reports/excel/expenses/weekly?date=${date}` : '/api/reports/excel/expenses/weekly';
    return api.get(url, { responseType: 'blob' });
  },

  // 5. Monthly Expense Report
  exportMonthlyExpensesExcel: (month, year) =>
    api.get(`/api/reports/excel/expenses/monthly?month=${month}&year=${year}`, { responseType: 'blob' }),

  // 6. Yearly Expense Audit
  exportYearlyExpensesExcel: (year) =>
    api.get(`/api/reports/excel/expenses/yearly?year=${year}`, { responseType: 'blob' }),

  // 7. Master Financial Sheet
  exportMasterFinancialExcel: (year) =>
    api.get(`/api/reports/excel/master-financial?year=${year}`, { responseType: 'blob' }),

  // Legacy & helper aliases
  exportTodayExcel: (reportType = 'detailed', date = null) => {
    const url = date ? `/api/reports/excel/daily?date=${date}` : '/api/reports/excel/daily';
    return api.get(url, { responseType: 'blob' });
  },
  exportTodayCSV: () => api.get('/api/reports/csv/today', { responseType: 'blob' }),
  exportExpensesExcel: (range = 'today') => api.get(`/api/reports/excel/expenses?range=${range}`, { responseType: 'blob' }),
  exportWeeklyExcel: (date) => api.get(`/api/reports/excel/weekly?date=${date}`, { responseType: 'blob' }),
  exportMonthlyExcel: (month, year) => api.get(`/api/reports/excel/monthly?month=${month}&year=${year}`, { responseType: 'blob' }),
  previewExcel: () => api.get('/api/reports/preview/excel'),
  previewXML: () => api.get('/api/reports/preview/xml'),
  getAvailableReports: () => api.get('/api/reports/available-reports'),
};

// System APIs
export const systemAPI = {
  // Check system health
  healthCheck: () => api.get('/health'),

  // Get server information
  getServerInfo: () => api.get('/'),
};

// Utility function to handle API errors consistently
export const handleAPIError = (error) => {
  if (error.response) {
    const status = error.response.status;
    const serverMsg = error.response.data?.message || error.response.data?.error || '';

    // Map status codes to user-friendly messages
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
      type: 'server_error'
    };
  } else if (error.request) {
    // Request was made but no response received
    return {
      message: 'Unable to connect to the server. Please check if the backend is running.',
      status: 0,
      data: null,
      type: 'network_error'
    };
  } else {
    // Something else happened
    return {
      message: error.message || 'An unexpected error occurred. Please try again.',
      status: -1,
      data: null,
      type: 'unknown_error'
    };
  }
};

// Utility function to download files from blob responses
export const downloadFile = (blob, filename) => {
  if (blob && blob.type === 'application/json') {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const errorData = JSON.parse(reader.result);
        alert(errorData.message || errorData.error || 'Failed to download report.');
      } catch (err) {
        alert('Failed to download report.');
      }
    };
    reader.readAsText(blob);
    return;
  }

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

// Utility function to format currency
let currentCurrencySymbol = '₹';

export const setCurrencySymbol = (symbol) => {
  if (symbol) currentCurrencySymbol = symbol;
};

export const formatIndianNumber = (amount) => {
  if (amount === null || amount === undefined || isNaN(Number(amount))) {
    return '0';
  }
  const num = Number(amount);
  const isNegative = num < 0;
  const absNum = Math.abs(num);
  const formatted = absNum.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
  return `${isNegative ? '-' : ''}${formatted}`;
};

export const formatCurrency = (amount) => {
  if (amount === null || amount === undefined || isNaN(Number(amount))) {
    return `${currentCurrencySymbol}0`;
  }
  const num = Number(amount);
  const isNegative = num < 0;
  const absNum = Math.abs(num);
  const formatted = absNum.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
  return `${isNegative ? '-' : ''}${currentCurrencySymbol}${formatted}`;
};

/**
 * Returns current local date in YYYY-MM-DD format
 * Robust replacement for toISOString().split('T')[0] which returns UTC
 */
export const getLocalDateString = (dateObj = new Date()) => {
  const offset = dateObj.getTimezoneOffset();
  const localDate = new Date(dateObj.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
};

// Inventory APIs
export const inventoryAPI = {
  // Get all inventory
  getAllInventory: () => api.get('/api/inventory'),

  // Create item
  createInventory: (data) => api.post('/api/inventory/create', data),
  createInventoryItem: (data) => api.post('/api/inventory/create', data),

  // Update item
  updateInventory: (id, data) => api.put(`/api/inventory/${id}`, data),
  updateInventoryItem: (id, data) => api.put(`/api/inventory/${id}`, data),

  // Adjust stock
  adjustStock: (id, adjustment, expiry_date = null, batch_number = null) =>
    api.post('/api/inventory/adjust', { id, adjustment, expiry_date, batch_number }),

  // Delete item
  deleteInventory: (id) => api.delete(`/api/inventory/${id}`),
  deleteInventoryItem: (id) => api.delete(`/api/inventory/${id}`),

  // Get Low Stock Items
  getLowStock: () => api.get('/api/inventory/low-stock'),

  // Batches & Expiry
  getBatches: (inventoryId) => api.get(`/api/inventory/batches/${inventoryId}`),
  addBatch: (data) => api.post('/api/inventory/batches', data),
  deleteBatch: (batchId) => api.delete(`/api/inventory/batches/${batchId}`),
  getExpiring: (days = 7) => api.get(`/api/inventory/expiring?days=${days}`),
};

// Worker Management APIs (Refactored)
export const workerAPI = {
  // Stats
  getStats: () => api.get('/api/workers/stats'),

  // CRUD
  getWorkers: () => api.get('/api/workers'),
  createWorker: (data) => api.post('/api/workers', data),
  getWorker: (id) => api.get(`/api/workers/${id}`),
  updateWorker: (id, data) => api.put(`/api/workers/${id}`, data),
  deleteWorker: (id) => api.delete(`/api/workers/${id}`),

  // Advances
  addAdvance: (id, data) => api.post(`/api/workers/${id}/advance`, data),
  getAdvances: (id) => api.get(`/api/workers/${id}/advances`),

  // Salary
  generateSalary: (id, month, year) => api.post(`/api/workers/${id}/generate-salary`, { month, year }),
  getSalaryHistory: (id) => api.get(`/api/workers/${id}/salary-history`),
  markPaid: (paymentId) => api.post(`/api/salary/${paymentId}/pay`),
  checkMonthlySalaryStatus: (month, year) => api.get(`/api/workers/salary/status?month=${month}&year=${year}`),

  // Attendance
  getWorkerAttendance: (id) => api.get(`/api/workers/${id}/attendance`),
  markAttendance: (id, data) => api.post(`/api/workers/${id}/attendance`, data),
  bulkMarkPresent: () => api.post('/api/workers/attendance/bulk'),
  checkAttendanceStatus: () => api.get('/api/workers/attendance/status'),
};

export const logsAPI = {
  getRecentLogs: (lines = 200, level = '') =>
    api.get(`/api/logs/recent?lines=${lines}${level ? `&level=${level}` : ''}`),
  writeFrontendLog: (level, source, message) =>
    api.post('/api/logs/write', { level, source, message }),
};

const _ipc = () => window.electronAPI?.writeLog;

export const flog = {
  _send(level, source, message) {
    const payload = { level, source, message, timestamp: new Date().toISOString() };
    if (_ipc()) {
      try { _ipc()(payload); return; } catch (_) { }
    }
    // HTTP fallback (fire and forget)
    logsAPI.writeFrontendLog(level, source, message).catch(() => { });
  },
  debug: (source, msg) => flog._send('debug', source, msg),
  info: (source, msg) => flog._send('info', source, msg),
  warn: (source, msg) => flog._send('warning', source, msg),
  error: (source, msg) => flog._send('error', source, msg),
};

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

export const formatDate = (dateInput) => {
  if (!dateInput) return '';
  const date = typeof dateInput === 'string' && dateInput.includes(' ')
    ? new Date(dateInput.replace(' ', 'T'))
    : new Date(dateInput);
  if (isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};
export default api;
