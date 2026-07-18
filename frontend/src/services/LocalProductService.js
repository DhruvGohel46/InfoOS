import { productsAPI } from '../utils/api';
import axios from 'axios';

const getLocalApiUrl = () => {
  return process.env.REACT_APP_API_URL || `http://${process.env.REACT_APP_API_HOST || 'localhost'}:${process.env.REACT_APP_API_PORT || 5050}`;
};

export const LocalProductService = {
  fetchProducts: async () => {
    const response = await productsAPI.getAllProductsWithInactive();
    return response.data.products || [];
  },

  createProduct: async (productData) => {
    const response = await productsAPI.createProduct(productData);
    return response.data.product;
  },

  updateProduct: async (productId, productData) => {
    const response = await productsAPI.updateProduct(productId, productData);
    return response.data.product;
  },

  deleteProduct: async (productId) => {
    const response = await productsAPI.deleteProduct(productId);
    return response.data;
  },

  bulkImport: async (productsList, format = 'json') => {
    // Call the local backend bulk import/sync endpoint
    const url = `${getLocalApiUrl()}/api/import-menu/bulk-json`;
    const token = sessionStorage.getItem('pos_session_token') || localStorage.getItem('pos_session_token');
    
    const response = await axios.post(url, { products: productsList }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    return response.data;
  }
};
