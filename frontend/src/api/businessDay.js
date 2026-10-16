import api from '../utils/api';

export const businessDayAPI = {
    /**
     * Get live status of business day: current operational shift date, countdown, and active override.
     */
    getStatus: async () => {
        const response = await api.get('/api/business-day/status');
        return response.data;
    },

    /**
     * Get default settings and all configured overrides.
     */
    getSettings: async () => {
        const response = await api.get('/api/business-day/settings');
        return response.data;
    },

    /**
     * Update default operational times (cutoff_time, open_time, close_time).
     */
    updateSettings: async (settings) => {
        const response = await api.put('/api/business-day/settings', settings);
        return response.data;
    },

    /**
     * Get list of temporary schedule overrides.
     */
    listOverrides: async () => {
        const response = await api.get('/api/business-day/overrides');
        return response.data;
    },

    /**
     * Save (create or update) a temporary schedule override.
     */
    saveOverride: async (overrideData) => {
        const response = await api.post('/api/business-day/overrides', overrideData);
        return response.data;
    },

    /**
     * Delete a temporary schedule override.
     */
    deleteOverride: async (overrideId) => {
        const response = await api.delete(`/api/business-day/overrides/${overrideId}`);
        return response.data;
    }
};

export default businessDayAPI;
