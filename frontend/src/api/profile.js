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
    },

    /**
     * Detect device location via IP geolocation fallback
     * @returns {Promise<Object>} { success: true, latitude: number, longitude: number, city: string, region: string, country: string }
     */
    detectLocation: async () => {
        const response = await api.get('/api/profile/detect-location');
        return response.data;
    },

    /**
     * Server-side address geocoding fallback
     * @param {string} query
     * @returns {Promise<Object>} { success: true, latitude: number, longitude: number, display_name: string }
     */
    geocodeAddress: async (query) => {
        const response = await api.get('/api/profile/geocode', { params: { q: query } });
        return response.data;
    }
};

export default profileAPI;
