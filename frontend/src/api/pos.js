import api from '../utils/api';

/**
 * POS Bootstrap API
 * 
 * Single endpoint that loads everything the POS screen needs in one request.
 * Replaces 5+ separate API calls with a single aggregated call.
 */
export const posAPI = {
    /**
     * Bootstrap POS — load all required data in one shot.
     * 
     * Response:
     * {
     *   products: [...],        // active products with stock
     *   categories: [...],      // active categories
     *   workers: [...],         // active workers
     *   settings: {...},        // all settings
     *   next_bill_number: 42    // next bill number
     * }
     */
    bootstrap: async () => {
        const response = await api.get('/api/pos/bootstrap');
        return response.data;
    },

    /**
     * Lightweight refresh — only products with stock levels.
     * Called after bill creation to update stock badges without
     * reloading the entire bootstrap payload.
     */
    refreshProducts: async () => {
        const response = await api.get('/api/products?include_stock=true');
        return response.data;
    },
};

export default posAPI;
