import api from './api';

export const expensesAPI = {
    // Get all expenses (with optional limit)
    getExpenses: async (limit = 100) => {
        try {
            const response = await api.get(`/api/expenses`, { params: { limit } });
            return response.data;
        } catch (error) {
            console.error('Error fetching expenses:', error);
            throw error;
        }
    },

    // Get specific expense by ID
    getExpense: async (id) => {
        try {
            const response = await api.get(`/api/expenses/${id}`);
            return response.data;
        } catch (error) {
            console.error(`Error fetching expense ${id}:`, error);
            throw error;
        }
    },

    // Create a new expense
    createExpense: async (expenseData) => {
        try {
            const response = await api.post(`/api/expenses`, expenseData);
            return response.data;
        } catch (error) {
            console.error('Error creating expense:', error);
            throw error;
        }
    },

    // Update an existing expense
    updateExpense: async (id, expenseData) => {
        try {
            const response = await api.put(`/api/expenses/${id}`, expenseData);
            return response.data;
        } catch (error) {
            console.error(`Error updating expense ${id}:`, error);
            throw error;
        }
    },

    // Delete an expense
    deleteExpense: async (id) => {
        try {
            const response = await api.delete(`/api/expenses/${id}`);
            return response.data;
        } catch (error) {
            console.error(`Error deleting expense ${id}:`, error);
            throw error;
        }
    },

    // Expense Types
    getExpenseTypes: async () => {
        try {
            const response = await api.get('/api/expense-types');
            return response.data;
        } catch (error) {
            console.error('Error fetching expense types:', error);
            throw error;
        }
    },

    getExpenseType: async (id) => {
        try {
            const response = await api.get(`/api/expense-types/${id}`);
            return response.data;
        } catch (error) {
            console.error(`Error fetching expense type ${id}:`, error);
            throw error;
        }
    },

    createExpenseType: async (data) => {
        try {
            const response = await api.post('/api/expense-types', data);
            return response.data;
        } catch (error) {
            console.error('Error creating expense type:', error);
            throw error;
        }
    },

    updateExpenseType: async (id, data) => {
        try {
            const response = await api.put(`/api/expense-types/${id}`, data);
            return response.data;
        } catch (error) {
            console.error(`Error updating expense type ${id}:`, error);
            throw error;
        }
    },

    deleteExpenseType: async (id) => {
        try {
            const response = await api.delete(`/api/expense-types/${id}`);
            return response.data;
        } catch (error) {
            console.error(`Error deleting expense type ${id}:`, error);
            throw error;
        }
    }
};
