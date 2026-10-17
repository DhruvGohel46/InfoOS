import api from '../utils/api';

export const profileAPI = {
    /**
     * Get shop profile and AI grounding context from profile.db
     * @returns {Promise<Object>} { success: true, profile: Object, ai_context: string }
     */
    getProfile: async () => {
        const response = await api.get('/api/profile');
        return response.data;
    },

    /**
     * Update shop profile in profile.db
     * @param {Object} data - Profile fields to update
     * @returns {Promise<Object>} { success: true, message: string, profile: Object, ai_context: string }
     */
    updateProfile: async (data) => {
        const response = await api.put('/api/profile', data);
        return response.data;
    }
};

export default profileAPI;
