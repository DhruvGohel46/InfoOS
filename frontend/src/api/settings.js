import api from '../utils/api';

export const settingsAPI = {
    /**
     * Get all settings
     * @returns {Promise<Object>} Object containing all settings key-value pairs
     */
    getAllSettings: async () => {
        const response = await api.get('/api/settings');
        return response.data;
    },

    /**
     * Update settings (bulk or single)
     * @param {Object|Array} settings - Object with key-value pairs or array of setting objects
     * @returns {Promise<Object>} Response from the server
     */
    updateSettings: async (settings) => {
        const response = await api.put('/api/settings', settings);
        return response.data;
    },

    /**
     * Upload a custom reminder sound
     * @param {File} file - The sound file to upload
     * @returns {Promise<Object>} Response from the server
     */
    uploadSound: async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await api.post('/api/settings/upload-sound', formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });
        return response.data;
    },

    /**
     * Get available printers and current active printer info
     * @returns {Promise<Object>} Object containing active_printer, available_printers, status, error
     */
    getPrinterInfo: async () => {
        const response = await api.get('/api/settings/printer-info');
        return response.data;
    }
};
