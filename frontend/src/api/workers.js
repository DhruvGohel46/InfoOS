import api from '../utils/api';

export const workerAPI = {
    // Workers
    getStats: async () => {
        const response = await api.get('/api/workers/stats');
        return response.data;
    },

    getWorkers: async (status = 'active') => {
        const response = await api.get(`/api/workers?status=${status}`);
        return response.data;
    },

    createWorker: async (data) => {
        const response = await api.post('/api/workers', data);
        return response.data;
    },

    getWorker: async (id) => {
        const response = await api.get(`/api/workers/${id}`);
        return response.data;
    },

    updateWorker: async (id, data) => {
        const response = await api.put(`/api/workers/${id}`, data);
        return response.data;
    },

    deleteWorker: async (id) => {
        const response = await api.delete(`/api/workers/${id}`);
        return response.data;
    },

    // Advances
    addAdvance: async (id, data) => {
        const response = await api.post(`/api/workers/${id}/advance`, data);
        return response.data;
    },

    getAdvances: async (id) => {
        const response = await api.get(`/api/workers/${id}/advances`);
        return response.data;
    },

    // Salary
    generateSalary: async (id, month, year) => {
        const response = await api.post(`/api/workers/${id}/generate-salary`, { month, year });
        return response.data;
    },

    getSalaryHistory: async (id) => {
        const response = await api.get(`/api/workers/${id}/salary-history`);
        return response.data;
    },

    markPaid: async (paymentId) => {
        const response = await api.post(`/api/salary/${paymentId}/pay`);
        return response.data;
    },

    // Attendance
    getWorkerAttendance: async (id) => {
        const response = await api.get(`/api/workers/${id}/attendance`);
        return response.data;
    },

    markAttendance: async (id, data) => {
        const response = await api.post(`/api/workers/${id}/attendance`, data);
        return response.data;
    },

    updateAttendance: async (id, data) => {
        const response = await api.put(`/api/workers/${id}/attendance`, data);
        return response.data;
    },

    bulkMarkPresent: async () => {
        const response = await api.post('/api/workers/attendance/bulk');
        return response.data;
    },

    checkAttendanceStatus: async () => {
        const response = await api.get('/api/workers/attendance/status');
        return response.data;
    },

    checkMonthlySalaryStatus: async (month, year) => {
        const response = await api.get(`/api/workers/salary/status?month=${month}&year=${year}`);
        return response.data;
    },

    getWorkerExpenses: async (id) => {
        const response = await api.get(`/api/workers/${id}/expenses`);
        return response.data;
    }
};
