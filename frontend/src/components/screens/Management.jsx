import React, { useState, useEffect, useRef } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnimation } from '../../hooks/useAnimation';
import { FiSearch, FiPackage, FiTrendingUp, FiAlertTriangle } from 'react-icons/fi';
import { productsAPI, categoriesAPI, handleAPIError, formatCurrency } from '../../utils/api';
import { useAlert as useToast } from '../../context/AlertContext';
import CategoryManagement from './CategoryManagement';
import '../../styles/Management.css';
import { useSettings } from '../../context/SettingsContext';
import GlobalSelect from '../ui/GlobalSelect';
import PageContainer from '../layout/PageContainer';
import Card from '../ui/Card';
import Button from '../ui/Button';

const IconPlus = (props) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const IconEdit = (props) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M12 20H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconPower = (props) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M12 2v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M6.38 6.38a9 9 0 1 0 11.24 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconImage = (props) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke="currentColor" strokeWidth="2" />
    <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
    <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconTrash = (props) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M3 6H5H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 6V4C8 2.89543 8.89543 2 10 2H14C15.1046 2 16 2.89543 16 4V6M19 6V20C19 21.1046 19.1046 22 18 22H6C4.89543 22 4 21.1046 4 20V6H19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconHeart = ({ filled, ...props }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path
      d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill={filled ? 'currentColor' : 'none'}
    />
  </svg>
);

const ProductManagement = () => {
  const { staggerContainer, staggerItem } = useAnimation();
  const { showSuccess } = useToast();
  const { settings } = useSettings();
  const showImages = settings?.show_product_images !== 'false';
  const topRef = useRef(null);

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [pendingDeactivate, setPendingDeactivate] = useState(null);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [productViewTab, setProductViewTab] = useState('active'); // active | inactive
  const [imageUploading, setImageUploading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    category_id: '',
    category: '', // Legacy support
    image_filename: null,
    active: true
  });
  const [selectedImage, setSelectedImage] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [imageToDelete, setImageToDelete] = useState(false);

  // Favorite toggle handler
  const handleToggleFavorite = async (product) => {
    try {
      const newFavorite = !product.favorite;
      await productsAPI.toggleFavorite(product.product_id, newFavorite);
      // Optimistically update local state
      setProducts(prev =>
        prev.map(p =>
          p.product_id === product.product_id ? { ...p, favorite: newFavorite } : p
        )
      );
    } catch (err) {
      const apiError = handleAPIError(err);
      setError(apiError.message);
    }
  };

  // Password Modal State
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [itemToDelete, setItemToDelete] = useState(null);

  // Load data on mount
  useEffect(() => {
    loadProducts();
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProducts = async () => {
    try {
      setError('');
      setLoading(true);
      // Fetch with stock data
      const response = await productsAPI.getAllProducts({ include_inactive: true, include_stock: true });
      setProducts(response.data.products || []);
    } catch (err) {
      const apiError = handleAPIError(err);
      setError(apiError.message);
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const response = await categoriesAPI.getAllCategories();
      const cats = response.data.categories || [];
      setCategories(cats);
      // If categories available, set default for form if empty
      if (cats.length > 0 && !formData.category_id) {
        setFormData(prev => ({
          ...prev,
          category_id: cats[0].id,
          category: cats[0].name
        }));
      }
    } catch (err) {
      console.error('Error loading categories:', err);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      price: '',
      category_id: categories.length > 0 ? categories[0].id : '',
      category: categories.length > 0 ? categories[0].name : '',
      active: true
    });
    setEditingProduct(null);
    setSelectedImage(null);
    setPreviewImage(null);
    setImageToDelete(false);
    setShowAddForm(false);
  };

  const handleInputChange = (field, value) => {
    if (field === 'category_id') {
      const cat = categories.find(c => c.id === parseInt(value));
      setFormData(prev => ({
        ...prev,
        category_id: value,
        category: cat ? cat.name : ''
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

  const generateProductId = (name, categoryName) => {
    const categoryCode = (categoryName || 'OTHE').toUpperCase().slice(0, 4).padEnd(4, 'X');
    // Using simple random for demo, real system would check DB for uniqueness
    const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${categoryCode}${randomNum}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setError('');
      const productData = {
        ...formData,
        price: parseFloat(formData.price),
        category_id: parseInt(formData.category_id)
      };

      if (editingProduct) {
        await productsAPI.updateProduct(editingProduct.product_id, productData);

        // Handle Image Update
        if (imageToDelete) {
          await productsAPI.deleteImage(editingProduct.product_id);
        }

        if (selectedImage) {
          setImageUploading(true);
          try {
            const formData = new FormData();
            formData.append('image', selectedImage);
            await productsAPI.uploadImage(editingProduct.product_id, formData);
          } finally {
            setImageUploading(false);
          }
        }

      } else {
        // Auto-generate ID if name and category are present
        const id = generateProductId(formData.name, formData.category);
        const newProduct = { ...productData, product_id: id };
        await productsAPI.createProduct(newProduct);

        if (selectedImage) {
          setImageUploading(true);
          try {
            const formData = new FormData();
            formData.append('image', selectedImage);
            await productsAPI.uploadImage(id, formData);
          } finally {
            setImageUploading(false);
          }
        }
      }
      resetForm();
      loadProducts();
    } catch (err) {
      const apiError = handleAPIError(err);
      setError(apiError.message);
    }
  };

  const handleReactivate = async (product) => {
    try {
      await productsAPI.updateProduct(product.product_id, { active: true });
      showSuccess('Product reactivated successfully');
      loadProducts();
    } catch (err) {
      const apiError = handleAPIError(err);
      setError(apiError.message);
    }
  }


  const handlePermanentDelete = (product) => {
    setItemToDelete(product);
    setDeletePassword('');
    setShowPasswordModal(true);
  };

  const confirmPermanentDelete = async (e) => {
    e.preventDefault();
    if (!itemToDelete) return;

    try {
      await productsAPI.deleteProductPermanently(itemToDelete.product_id, deletePassword);
      showSuccess('Product permanently deleted');
      setShowPasswordModal(false);
      setItemToDelete(null);
      setDeletePassword('');
      loadProducts();
    } catch (err) {
      // If 401, it's invalid password
      if (err.response && err.response.status === 401) {
        setError("Invalid Password. Authorization failed.");
      } else {
        const apiError = handleAPIError(err);
        setError(apiError.message);
      }
    }
  };

  const cancelPermanentDelete = () => {
    setShowPasswordModal(false);
    setItemToDelete(null);
    setDeletePassword('');
    setError('');
  };
  const handleImageChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedImage(file);
      setPreviewImage(URL.createObjectURL(file));
      setImageToDelete(false);
    }
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setPreviewImage(null);
    setImageToDelete(true);
    // If it's a file input, reset it? We can't easily, but state controls the submission
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      price: product.price,
      category_id: product.category_id || '',
      category: product.category || '',
      image_filename: product.image_filename,
      active: product.active
    });

    if (product.image_filename) {
      setPreviewImage(productsAPI.getImageUrl(product.image_filename, product.updated_at));
    } else {
      setPreviewImage(null);
    }
    setSelectedImage(null);
    setImageToDelete(false);

    setShowAddForm(true);

    // Scroll to top
    if (topRef.current) {
      topRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const onRequestDeactivate = (product) => setPendingDeactivate(product);
  const onCloseDeactivate = () => setPendingDeactivate(null);

  const handleConfirmDeactivate = async () => {
    if (!pendingDeactivate) return;
    try {
      setError('');
      await productsAPI.updateProduct(pendingDeactivate.product_id, { active: false });
      setPendingDeactivate(null);
      loadProducts();
    } catch (err) {
      const apiError = handleAPIError(err);
      setError(apiError.message);
    }
  };

  const filteredProducts = products
    .filter((p) => {
      if (productViewTab === 'active') return !!p.active;
      return !p.active;
    })
    .filter((p) => {
      const searchMatch = !debouncedQuery ||
        p.name.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
        p.product_id.toLowerCase().includes(debouncedQuery.toLowerCase());
      return searchMatch;
    })
    .filter((p) => (categoryFilter === 'all' ? true : p.category_id === parseInt(categoryFilter)));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel pm-inventory-panel"
      ref={topRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        borderRadius: 'var(--radius-3xl)',
        overflow: 'hidden',
        background: 'var(--glass-panel)',
        border: '1px solid var(--glass-border)',
        boxShadow: 'var(--shadow-xl)',
      }}
    >
      {/* Header */}
      <div style={{
        padding: 'var(--spacing-8) var(--spacing-8) var(--spacing-6) var(--spacing-8)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
      }}>
        <div>
          <h2 style={{ fontSize: 'var(--text-3xl)', fontWeight: '700', margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.02em', textShadow: '0 10px 30px rgba(0, 0, 0, 0.25)' }}>
            {productViewTab === 'active' ? 'Active Products' : 'Inactive Products'}
          </h2>
          <p style={{ margin: 'var(--spacing-1) 0 0 0', color: 'var(--text-secondary)', fontSize: 'var(--text-lg)', opacity: 0.75 }}>
            Manage your product catalog and pricing
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => setShowAddForm(true)}
          disabled={showAddForm}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 'var(--spacing-2)',
            padding: 'var(--spacing-3) var(--spacing-6)',
            borderRadius: 'var(--radius-xl)',
            fontSize: 'var(--text-base)',
            fontWeight: '600',
            boxShadow: '0 8px 18px rgba(249, 115, 22, 0.25)',
          }}
        >
          <IconPlus aria-hidden="true" /> Add Product
        </Button>
      </div>

      {/* Controls: Search & Filters */}
      <div style={{
        padding: '0 var(--spacing-8) var(--spacing-6) var(--spacing-8)',
        display: 'flex',
        gap: 'var(--spacing-4)',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        {/* Search */}
        <div className="inventory-search">
          <FiSearch className="inventory-search-icon" />
          <input
            className="inventory-search-input"
            type="text"
            placeholder="Search by name or ID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* Category Filter */}
        <div style={{ minWidth: '160px' }}>
          <GlobalSelect
            options={[{ label: 'All categories', value: 'all' }, ...categories.map(cat => ({ label: cat.name, value: cat.id }))]}
            value={categoryFilter}
            onChange={(val) => setCategoryFilter(val)}
            placeholder="Filter Category"
            className="pmDropdown"
            direction="top"
          />
        </div>

        {/* View Tabs */}
        <div className="inventory-filters">
          <button
            onClick={() => setProductViewTab('active')}
            className={`inventory-filter-btn ${productViewTab === 'active' ? 'is-active' : ''}`}
          >
            Active
          </button>
          <button
            onClick={() => setProductViewTab('inactive')}
            className={`inventory-filter-btn ${productViewTab === 'inactive' ? 'is-active' : ''}`}
          >
            Inactive
          </button>
        </div>

        {/* Refresh */}
        <Button
          variant="secondary"
          onClick={loadProducts}
          icon={loading ? <div className="spinner" /> : null}
          style={{ borderRadius: 'var(--radius-xl)' }}
        >
          Refresh
        </Button>
      </div>

      {/* Stats Bar */}
      <div style={{ padding: '0 var(--spacing-8) var(--spacing-4) var(--spacing-8)' }}>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ display: 'flex', gap: 'var(--spacing-4)', width: '100%' }}
        >
          {[
            { label: 'Total Products', value: filteredProducts.length, color: '#3b82f6', icon: <FiPackage /> },
            { label: 'Active', value: products.filter(p => p.active).length, color: '#10b981', icon: <FiTrendingUp /> },
            { label: 'Inactive', value: products.filter(p => !p.active).length, color: '#f59e0b', icon: <FiAlertTriangle /> },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-4)',
                padding: 'var(--spacing-4) var(--spacing-6)',
                background: 'color-mix(in srgb, var(--glass-card) 92%, transparent)',
                border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-2xl)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
              }}
            >
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: `color-mix(in srgb, ${item.color} 15%, transparent)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: item.color,
                fontSize: '1.2rem',
                border: `1px solid color-mix(in srgb, ${item.color} 20%, transparent)`,
              }}>
                {item.icon}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)' }}>{item.label}</span>
                <span style={{ fontSize: 'var(--text-xl)', fontWeight: '800', color: 'var(--text-primary)', marginTop: '2px' }}>{item.value}</span>
              </div>
            </div>
          ))}
        </motion.div>
      </div>

      {/* Scrollable Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--spacing-8) var(--spacing-8) var(--spacing-8)' }}>

        {/* Add/Edit Form */}
        <AnimatePresence>
          {showAddForm && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="pmFormWrap" style={{ marginBottom: 'var(--spacing-6)' }}>
              <div className="pmFormHeader">
                <div className="pmFormTitle">{editingProduct ? 'Edit Product' : 'Add New Product'}</div>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="pmFormGrid">
                  <div className="pmField">
                    <div className="pmLabel">Product Name</div>
                    <input className="pmInput" value={formData.name} onChange={(e) => handleInputChange('name', e.target.value)} required />
                  </div>
                  <div className="pmField">
                    <div className="pmLabel">Price</div>
                    <input className="pmInput" type="number" step="0.01" value={formData.price} onChange={(e) => handleInputChange('price', e.target.value)} required />
                  </div>
                  <div className="pmField">
                    <div className="pmLabel">Category</div>
                    <GlobalSelect
                      options={categories.map(cat => ({ label: cat.name, value: cat.id }))}
                      value={formData.category_id}
                      onChange={(val) => handleInputChange('category_id', val)}
                      placeholder="Select Category"
                      className="pmDropdown"
                      direction="top"
                    />
                  </div>
                </div>

                <div className="pmField" style={{ gridColumn: '1 / -1' }}>
                  <div className="pmLabel">Product Image (Optional)</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'calc(20px * var(--display-zoom))' }}>
                    <div style={{
                      width: 'calc(80px * var(--display-zoom))',
                      height: 'calc(80px * var(--display-zoom))',
                      borderRadius: 'calc(8px * var(--display-zoom))',
                      border: '1px dashed var(--border-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      backgroundColor: 'var(--bg-secondary)',
                      position: 'relative'
                    }}>
                      {imageUploading && (
                        <div style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          backgroundColor: 'rgba(0, 0, 0, 0.7)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 10
                        }}>
                          <div style={{
                            width: 'calc(24px * var(--display-zoom))',
                            height: 'calc(24px * var(--display-zoom))',
                            border: '3px solid rgba(255, 255, 255, 0.3)',
                            borderTop: '3px solid white',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite'
                          }} />
                        </div>
                      )}
                      {previewImage ? (
                        <img src={previewImage} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <IconImage style={{ color: 'var(--text-tertiary)' }} />
                      )}
                    </div>

                    <div style={{ flex: 1 }}>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        style={{ marginBottom: 'calc(10px * var(--display-zoom))', display: 'block', width: '100%' }}
                      />
                      {(previewImage && (selectedImage || formData.image_filename)) && (
                        <button
                          type="button"
                          onClick={handleRemoveImage}
                          className="pmActionBtn pmActionDanger"
                          style={{ padding: 'calc(4px * var(--display-zoom)) calc(8px * var(--display-zoom))', fontSize: 'calc(12px * var(--text-scale))' }}
                        >
                          Remove Image
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pmFormActions">
                  <button type="button" className="pmSecondaryBtn" onClick={resetForm}>Cancel</button>
                  <button type="submit" className="pmPrimaryCta" disabled={imageUploading}>
                    {imageUploading ? (
                      <>
                        <div style={{
                          width: 'calc(16px * var(--display-zoom))',
                          height: 'calc(16px * var(--display-zoom))',
                          border: '2px solid rgba(255, 255, 255, 0.3)',
                          borderTop: '2px solid white',
                          borderRadius: '50%',
                          animation: 'spin 1s linear infinite',
                          marginRight: 'calc(8px * var(--display-zoom))'
                        }} />
                        Processing Image...
                      </>
                    ) : (
                      editingProduct ? 'Update Product' : 'Add Product'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        {error && <div className="pmError" style={{ marginBottom: 'var(--spacing-4)' }}>{error}</div>}

        {/* Product count hint */}
        <div style={{ marginBottom: 'var(--spacing-4)', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
          {loading ? 'Refreshing…' : `${filteredProducts.length} products shown`}
        </div>

        {/* Products Grid */}
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 'var(--spacing-12)' }}>
            <div className="spinner" style={{ marginBottom: 'var(--spacing-4)' }}></div>
            Loading products…
          </div>
        ) : filteredProducts.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            color: 'var(--text-tertiary)', 
            padding: 'var(--spacing-12)',
            background: 'var(--glass-card)',
            borderRadius: 'var(--radius-2xl)',
            border: '1px dashed var(--glass-border)'
          }}>
            No matching products found.
          </div>
        ) : (
          <motion.div className="pmGrid" variants={staggerContainer} initial="initial" animate="animate">
            {filteredProducts.map((product) => (
              <motion.div
                key={product.product_id}
                variants={staggerItem}
              >
                <Card
                  className={`pmCard ${!product.active ? 'pmCardInactive' : ''} card-zoom`}
                  padding={showImages ? 'calc(20px * var(--display-zoom))' : 'calc(16px * var(--display-zoom))'}
                  hover={true}
                  style={{
                    minHeight: showImages ? '180px' : 'auto',
                    marginBottom: '0'
                  }}
                >
                  {showImages && (
                    <div className="pmCardImageContainer">
                      {product.image_filename ? (
                        <img
                          src={productsAPI.getImageUrl(product.image_filename, product.updated_at)}
                          alt={product.name}
                          className="pmCardImage"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div className="pmCardImagePlaceholder" style={{ display: product.image_filename ? 'none' : 'flex', position: product.image_filename ? 'absolute' : 'relative', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span>No Image</span>
                      </div>
                    </div>
                  )}

                  <div className="pmCardContent" style={{ padding: showImages ? 'calc(16px * var(--display-zoom))' : '0 0 calc(8px * var(--display-zoom)) 0', gap: showImages ? 'calc(12px * var(--display-zoom))' : 'calc(8px * var(--display-zoom))' }}>
                    <div className="pmCardHeader">
                      <div className="pmName" title={product.name} style={{ fontSize: showImages ? 'calc(16px * var(--text-scale))' : 'calc(17px * var(--text-scale))', WebkitLineClamp: showImages ? 2 : 1 }}>{product.name}</div>
                      <div className="pmPriceRow">
                        <div className="pmPrice">{formatCurrency(product.price)}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'calc(6px * var(--display-zoom))' }}>
                          <div className="pmBadge">{product.category_name || product.category || 'Other'}</div>
                          <motion.button
                            className="pmFavoriteBtn"
                            whileHover={{ scale: 1.2 }}
                            whileTap={{ scale: 0.85 }}
                            onClick={(e) => { e.stopPropagation(); handleToggleFavorite(product); }}
                            title={product.favorite ? 'Remove from Favorites' : 'Add to Favorites'}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: 'calc(4px * var(--display-zoom))',
                              color: product.favorite ? '#EF4444' : 'var(--text-tertiary)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'color 0.2s ease',
                            }}
                          >
                            <IconHeart filled={product.favorite} />
                          </motion.button>
                        </div>
                      </div>
                    </div>

                    {showImages && (
                      <div className="pmMetaRow" style={{ justifyContent: 'center', width: '100%' }}>
                        <div className="pmId">ID: {product.product_id}</div>
                      </div>
                    )}

                    <div className={`pmActions ${showImages ? 'pmActionsWithBorder' : ''}`}>
                      <div className="pmStockRow">
                        <span className="pmStockLabel">Stock</span>
                        <span className="pmStockValue" style={{
                          color: (product.stock === 0 || product.stock_status === 'Out of Stock') ? '#EF4444' :
                            product.stock_status === 'Low Stock' ? '#F59E0B' : '#10B981'
                        }}>
                          {product.stock !== undefined ? product.stock : '-'}
                        </span>
                      </div>

                      <div className="pmButtonGrid">
                        <button className="pmActionBtn" onClick={() => handleEdit(product)} style={{ justifyContent: 'center' }}>
                          <IconEdit /> {showImages ? 'Edit' : ''}
                        </button>
                        {product.active ? (
                          <button className="pmActionBtn pmActionDanger" onClick={() => onRequestDeactivate(product)} title="Deactivate" style={{ justifyContent: 'center' }}>
                            <IconPower /> {showImages ? 'Disable' : ''}
                          </button>
                        ) : (
                          <>
                            <button className="pmActionBtn pmActionReactivate" onClick={() => handleReactivate(product)} title="Reactivate" style={{ color: '#10B981', borderColor: 'rgba(16, 185, 129, 0.3)', background: 'rgba(16, 185, 129, 0.1)', justifyContent: 'center' }}>
                              <IconPower /> {showImages ? 'Enable' : ''}
                            </button>
                            <button className="pmActionBtn" onClick={() => handlePermanentDelete(product)} title="Delete Permanently" style={{
                              color: '#EF4444',
                              borderColor: 'rgba(239, 68, 68, 0.3)',
                              background: 'rgba(239, 68, 68, 0.1)',
                              justifyContent: 'center',
                              gridColumn: '1 / -1'
                            }}>
                              <IconTrash /> {showImages ? 'Delete Permanently' : ''}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* Password Confirmation Modal */}
      <AnimatePresence>
        {showPasswordModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={cancelPermanentDelete}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(22, 26, 32, 0.8)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)'
            }}
          >
            <motion.div
              className="liquid-glass-card"
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'relative',
                width: '90%',
                maxWidth: '460px',
                padding: 'var(--spacing-8)',
                borderRadius: '20px',
                backgroundColor: 'rgba(22, 26, 32, 0.8)',
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)'
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-4)',
                marginBottom: 'var(--spacing-5)'
              }}>
                <div style={{
                  width: 'calc(48px * var(--display-zoom))',
                  height: 'calc(48px * var(--display-zoom))',
                  borderRadius: 'calc(14px * var(--display-zoom))',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--error-500)',
                  flexShrink: 0
                }}>
                  <IconTrash style={{ width: 'calc(24px * var(--display-zoom))', height: 'calc(24px * var(--display-zoom))' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{
                    margin: 0,
                    color: 'var(--text-primary)',
                    fontSize: 'calc(var(--text-xl) * 1)',
                    fontWeight: 'var(--font-semibold)',
                    letterSpacing: '0.2px',
                    lineHeight: '1.3'
                  }}>
                    Permanent Deletion
                  </h3>
                  <p style={{
                    margin: 'calc(var(--spacing-1) * 1) 0 0 0',
                    color: 'var(--text-tertiary)',
                    fontSize: 'calc(var(--text-sm) * 1)',
                    fontWeight: 'var(--font-medium)'
                  }}>
                    Admin authentication required
                  </p>
                </div>
              </div>

              <div style={{ marginBottom: 'var(--spacing-6)' }}>
                <p style={{
                  color: 'var(--text-secondary)',
                  fontSize: 'var(--text-base)',
                  lineHeight: '1.6',
                  margin: '0 0 var(--spacing-4) 0',
                  fontWeight: 'var(--font-normal)'
                }}>
                  You are about to <strong style={{ color: 'var(--error-500)' }}>permanently delete</strong> "{itemToDelete?.name}".
                </p>
                
                <div style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.15)',
                  padding: 'var(--spacing-3)',
                  borderRadius: 'var(--radius-lg)',
                  marginTop: 'var(--spacing-3)',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--error-600)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 'var(--spacing-2)'
                }}>
                  <span style={{ fontSize: '1rem', marginTop: '1px' }}>⚠️</span>
                  <div>
                    <strong style={{ display: 'block', marginBottom: 'var(--spacing-1)', fontWeight: 'var(--font-semibold)' }}>
                      Irreversible Action
                    </strong>
                    This will remove the product, all sales history, and inventory records. This cannot be undone.
                  </div>
                </div>

                <div style={{ marginTop: 'var(--spacing-5)' }}>
                  <label style={{
                    display: 'block',
                    fontSize: 'var(--text-sm)',
                    marginBottom: 'var(--spacing-2)',
                    fontWeight: 'var(--font-semibold)',
                    color: 'var(--text-primary)'
                  }}>
                    Enter Admin Password
                  </label>
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Type password..."
                    autoFocus
                    style={{
                      width: '100%',
                      padding: 'var(--spacing-3)',
                      fontSize: 'var(--text-base)',
                      borderRadius: 'var(--radius-lg)',
                      border: error && error.includes('Password') ? '1px solid var(--error-500)' : '1px solid var(--glass-border)',
                      backgroundImage: 'var(--glass-card)',
                      color: 'var(--text-primary)',
                      transition: 'all var(--transition-normal) var(--ease-out)',
                      outline: 'none'
                    }}
                    onFocus={(e) => {
                      if (!error || !error.includes('Password')) {
                        e.target.style.borderColor = 'var(--primary-500)';
                        e.target.style.boxShadow = '0 0 0 3px rgba(255, 106, 0, 0.1)';
                      }
                    }}
                    onBlur={(e) => {
                      if (!error || !error.includes('Password')) {
                        e.target.style.borderColor = 'var(--glass-border)';
                        e.target.style.boxShadow = 'none';
                      }
                    }}
                  />
                </div>
              </div>

              <div style={{
                display: 'flex',
                gap: 'var(--spacing-3)',
                justifyContent: 'flex-end'
              }}>
                <button
                  onClick={cancelPermanentDelete}
                  style={{
                    padding: 'var(--spacing-3) var(--spacing-5)',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 'var(--font-medium)',
                    borderRadius: 'var(--radius-lg)',
                    backgroundImage: 'var(--glass-card)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--glass-border)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-normal) var(--ease-out)'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmPermanentDelete}
                  style={{
                    padding: 'var(--spacing-3) var(--spacing-5)',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 'var(--font-semibold)',
                    borderRadius: 'var(--radius-lg)',
                    background: 'var(--error-500)',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all var(--transition-normal) var(--ease-out)',
                    boxShadow: '0 4px 12px rgba(239, 68, 68, 0.25)'
                  }}
                >
                  Delete Permanently
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Deactivate Modal */}
      <AnimatePresence>
        {pendingDeactivate && (
          <motion.div className="pmOverlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCloseDeactivate}>
            <motion.div className="pmDialog" initial={{ y: 20, scale: 0.95, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 20, scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
              <div className="pmDialogTitle">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Deactivate product?
              </div>
              <div className="pmDialogBody">
                Are you sure you want to deactivate "{pendingDeactivate.name}"? It will be hidden from the POS screen but can be reactivated later.
              </div>
              <div className="pmDialogActions">
                <button className="pmDialogBtn" onClick={onCloseDeactivate}>Cancel</button>
                <button className="pmDialogBtn pmDialogBtnPrimary" onClick={handleConfirmDeactivate}>Deactivate</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const Management = () => {
  const [activeTab, setActiveTab] = useState('products');

  return (
    <PageContainer>
      <div className="pmPage">
        {/* Header - Simple Tab Navigation */}
        <div style={{
          display: 'flex',
          marginBottom: 'calc(20px * var(--display-zoom))',
          borderBottom: '1px solid var(--border-primary)',
          gap: 'calc(24px * var(--display-zoom))'
        }}>
          <button
            onClick={() => setActiveTab('products')}
            style={{
              padding: 'calc(12px * var(--display-zoom)) calc(4px * var(--display-zoom))',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'products' ? '2px solid #F97316' : '2px solid transparent',
              color: activeTab === 'products' ? '#F97316' : 'var(--text-secondary)',
              fontWeight: activeTab === 'products' ? 600 : 500,
              fontSize: 'calc(16px * var(--text-scale))',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Products
          </button>
          <button
            onClick={() => setActiveTab('categories')}
            style={{
              padding: 'calc(12px * var(--display-zoom)) calc(4px * var(--display-zoom))',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'categories' ? '2px solid #F97316' : '2px solid transparent',
              color: activeTab === 'categories' ? '#F97316' : 'var(--text-secondary)',
              fontWeight: activeTab === 'categories' ? 600 : 500,
              fontSize: 'calc(16px * var(--text-scale))',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Categories
          </button>
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'products' && (
            <motion.div
              key="products"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
            >
              <ProductManagement />
            </motion.div>
          )}

          {activeTab === 'categories' && (
            <motion.div
              key="categories"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              <CategoryManagement />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageContainer>
  );
};

export default Management;
