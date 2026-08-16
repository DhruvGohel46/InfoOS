import api from '../utils/api';

export const notificationAPI = {
  getNotifications: async (params = {}) => {
    const response = await api.get('/api/notifications', { params });
    return response.data;
  },

  createNotification: async (data) => {
    const response = await api.post('/api/notifications', data);
    return response.data;
  },

  updateStatus: async (id, status) => {
    const response = await api.put(`/api/notifications/${id}/status`, { status });
    return response.data;
  },

  markAllRead: async () => {
    const response = await api.post('/api/notifications/mark-all-read');
    return response.data;
  },

  runCleanup: async () => {
    const response = await api.post('/api/notifications/cleanup');
    return response.data;
  },

  deleteNotification: async (id) => {
    const response = await api.delete(`/api/notifications/${id}`);
    return response.data;
  },

  clearAll: async () => {
    const response = await api.delete('/api/notifications/clear-all');
    return response.data;
  },
};
