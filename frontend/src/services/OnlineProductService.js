import axios from 'axios';

const getRenderApi = () => {
  const token = sessionStorage.getItem('pos_session_token') || localStorage.getItem('pos_session_token');
  const baseUrl = localStorage.getItem('render_api_url') || 'https://your-cloud-backend.onrender.com/api';
  
  return axios.create({
    baseURL: baseUrl,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    timeout: 20000
  });
};

export const OnlineProductService = {
  fetchProducts: async () => {
    const api = getRenderApi();
    const response = await api.get('/franchise/products');
    return response.data.products || [];
  },

  createProduct: async (productData) => {
    const api = getRenderApi();
    const response = await api.post('/franchise/products', productData);
    return response.data.product;
  },

  updateProduct: async (productId, productData) => {
    const api = getRenderApi();
    const response = await api.put(`/franchise/products/${productId}`, productData);
    return response.data.product;
  },

  deleteProduct: async (productId) => {
    const api = getRenderApi();
    const response = await api.delete(`/franchise/products/${productId}`);
    return response.data;
  },

  bulkUpload: async (products) => {
    const api = getRenderApi();
    const response = await api.post('/franchise/products/bulk', { products });
    return response.data;
  },

  uploadMenu: async (menuPackage) => {
    const api = getRenderApi();
    const response = await api.post('/franchise/menu/upload', menuPackage);
    return response.data;
  },

  downloadMenu: async () => {
    const api = getRenderApi();
    const response = await api.post('/franchise/menu/import');
    return response.data; // contains success, master_name, menu_version, menu
  }
};
