import axios from 'axios';

// Base URL for API calls
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5050';
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

// Request interceptor for logging
api.interceptors.request.use(
  (config) => {
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
// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    console.error('API Response Error:', error);
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

// Billing APIs
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
  printBill: (billNo) => api.post(`/api/bill/print/${billNo}`),

  // Print KOT for existing bill
  printKOT: (billNo) => api.post(`/api/bill/print-kot/${billNo}`),

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
  // Export today's sales (or specific date) as Excel/CSV
  exportTodayExcel: (reportType = 'detailed', date = null) => {
    let url = `/api/reports/excel/today?type=${reportType}`;
    if (date) {
      url += `&date=${date}`;
    }
    return api.get(url, { responseType: 'blob' });
  },

  // Export monthly sales as Excel
  exportMonthlyExcel: (month, year) =>
    api.get(`/api/reports/excel/monthly?month=${month}&year=${year}`, { responseType: 'blob' }),

  // Export weekly sales as Excel (by reference date)
  exportWeeklyExcel: (date) =>
    api.get(`/api/reports/excel/weekly?date=${date}`, { responseType: 'blob' }),

  // Export expenses as Excel
  exportExpensesExcel: (range = 'today') =>
    api.get(`/api/reports/excel/expenses?range=${range}`, { responseType: 'blob' }),

  // Export today's bills as XML
  exportTodayXML: () =>
    api.get('/api/reports/xml/today', { responseType: 'blob' }),

  // Preview Excel data without downloading
  previewExcel: () => api.get('/api/reports/preview/excel'),

  // Preview XML data without downloading
  previewXML: () => api.get('/api/reports/preview/xml'),

  // Get list of available reports
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
    // Server responded with error status
    return {
      message: error.response.data.message || 'Server error occurred',
      status: error.response.status,
      data: error.response.data,
      type: 'server_error'
    };
  } else if (error.request) {
    // Request was made but no response received
    return {
      message: 'Network error - Unable to connect to server',
      status: 0,
      data: null,
      type: 'network_error'
    };
  } else {
    // Something else happened
    return {
      message: error.message || 'Unknown error occurred',
      status: -1,
      data: null,
      type: 'unknown_error'
    };
  }
};

// Utility function to download files from blob responses
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

// Utility function to format currency
let currentCurrencySymbol = '₹';

export const setCurrencySymbol = (symbol) => {
  if (symbol) currentCurrencySymbol = symbol;
};

export const formatCurrency = (amount) => {
  // Use custom formatting to support arbitrary symbols
  return `${currentCurrencySymbol}${Number(amount).toFixed(2)}`;
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
  createInventoryItem: (data) => api.post('/api/inventory/create', data),

  // Update item
  updateInventoryItem: (id, data) => api.put(`/api/inventory/${id}`, data),

  // Adjust stock
  adjustStock: (data) => api.post('/api/inventory/adjust', data),

  // Delete item
  deleteInventoryItem: (id) => api.delete(`/api/inventory/${id}`),

  // Get Low Stock Items
  getLowStock: () => api.get('/api/inventory/low-stock'),
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

export default api;
