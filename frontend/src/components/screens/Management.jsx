import React, { useState, useEffect, useRef } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import { removeBackground } from '@imgly/background-removal';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnimation } from '../../hooks/useAnimation';
import { FiSearch, FiPackage, FiTrendingUp, FiAlertTriangle } from 'react-icons/fi';
import { productsAPI, categoriesAPI, importMenuAPI, handleAPIError, formatCurrency } from '../../utils/api';
import { useAlert as useToast } from '../../context/AlertContext';
import GroupManagement from './GroupManagement';
import '../../styles/Management.css';
import { useSettings } from '../../context/SettingsContext';
import GlobalSelect from '../ui/GlobalSelect';
import PageContainer from '../layout/PageContainer';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { createEmptyVariation, sanitizeVariationsForSave } from '../../utils/productVariations';
import { usePOSData } from '../../context/POSDataContext';
import { useTheme } from '../../context/ThemeContext';

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
  const { checkCatalogVersion } = usePOSData();
  const { isDark } = useTheme();
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
  const [imageProcessing, setImageProcessing] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    takeaway_price: '',
    category_id: '',
    category: '', // Legacy support
    image_filename: null,
    active: true
  });
  const [selectedImage, setSelectedImage] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [imageToDelete, setImageToDelete] = useState(false);
  const [variations, setVariations] = useState([]);

  // ── Import Modal State ──────────────────────────────────────────────────────
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState('guide'); // 'guide' | 'upload' | 'result'
  const [importFile, setImportFile] = useState(null);
  const [importDragging, setImportDragging] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const importFileInputRef = useRef(null);

  // ── Import Handlers ─────────────────────────────────────────────────────────
  const openImportModal = () => {
    setImportStep('guide');
    setImportFile(null);
    setImportResult(null);
    setShowImportModal(true);
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    if (importResult?.stats?.created > 0) {
      // Reload products if anything was created
      loadProducts();
      loadCategories();
      checkCatalogVersion();
    }
  };

  const handleImportFileDrop = (e) => {
    e.preventDefault();
    setImportDragging(false);
    const file = e.dataTransfer?.files?.[0] || e.target?.files?.[0];
    if (file) setImportFile(file);
  };

  const handleImportSubmit = async () => {
    if (!importFile) return;
    setImportLoading(true);
    try {
      const res = await importMenuAPI.importFile(importFile);
      setImportResult(res.data);
      setImportStep('result');
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        'Import failed. Check the file format and try again.';
      setImportResult({ success: false, message: msg, stats: null });
      setImportStep('result');
    } finally {
      setImportLoading(false);
    }
  };

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
      takeaway_price: '',
      category_id: categories.length > 0 ? categories[0].id : '',
      category: categories.length > 0 ? categories[0].name : '',
      active: true
    });
    setEditingProduct(null);
    setSelectedImage(null);
    setPreviewImage(null);
    setImageToDelete(false);
    setVariations([]);
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
        takeaway_price: formData.takeaway_price ? parseFloat(formData.takeaway_price) : null,
        category_id: parseInt(formData.category_id),
        variations: sanitizeVariationsForSave(variations),
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
            const res = await productsAPI.uploadImage(editingProduct.product_id, formData);
            if (res && res.data && res.data.background_removed === false) {
              showSuccess('Product updated, but background removal was unavailable. Original image saved.');
            } else {
              showSuccess('Product updated successfully with background-removed image!');
            }
          } finally {
            setImageUploading(false);
          }
        } else {
          showSuccess('Product updated successfully');
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
            const res = await productsAPI.uploadImage(id, formData);
            if (res && res.data && res.data.background_removed === false) {
              showSuccess('Product created, but background removal was unavailable. Original image saved.');
            } else {
              showSuccess('Product created successfully with background-removed image!');
            }
          } finally {
            setImageUploading(false);
          }
        } else {
          showSuccess('Product created successfully');
        }
      }
      resetForm();
      await loadProducts();
      checkCatalogVersion();
    } catch (err) {
      const apiError = handleAPIError(err);
      setError(apiError.message);
    }
  };

  const handleReactivate = async (product) => {
    try {
      await productsAPI.updateProduct(product.product_id, { active: true });
      showSuccess('Product reactivated successfully');
      await loadProducts();
      checkCatalogVersion();
    } catch (err) {
      const apiError = handleAPIError(err);
      setError(apiError.message);
    }
  };


  const handleDisable = async (product) => {
    try {
      await productsAPI.updateProduct(product.product_id, { active: false });
      showSuccess('Product disabled');
      await loadProducts();
      checkCatalogVersion();
    } catch (err) {
      const apiError = handleAPIError(err);
      setError(apiError.message);
    }
  };

  const handleDeleteDirect = async (product) => {
    try {
      await productsAPI.deleteProductPermanently(product.product_id);
      showSuccess('Product permanently deleted');
      await loadProducts();
      checkCatalogVersion();
    } catch (err) {
      const apiError = handleAPIError(err);
      setError(apiError.message);
    }
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
      await loadProducts();
      checkCatalogVersion();
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
  const handleImageChange = async (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPreviewImage(URL.createObjectURL(file));
      setImageProcessing(true);

      // Determine public path for loading model assets locally
      const isWeb = window.location.protocol === 'http:' || window.location.protocol === 'https:';
      const base = !isWeb
        ? window.location.href.substring(0, window.location.href.lastIndexOf('/'))
        : window.location.origin;
      const publicPath = `${base}/assets/ai/`;

      try {
        const processedBlob = await removeBackground(file, { publicPath });
        const processedFile = new File([processedBlob], file.name.replace(/\.[^/.]+$/, "") + ".png", { type: "image/png" });
        setSelectedImage(processedFile);
        setPreviewImage(URL.createObjectURL(processedFile));
        setImageToDelete(false);
      } catch (err) {
        console.error("Client-side background removal failed:", err);
        setSelectedImage(file);
      } finally {
        setImageProcessing(false);
      }
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
      takeaway_price: product.takeaway_price || '',
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
    setVariations(Array.isArray(product.variations) ? product.variations.map(v => ({ ...v })) : []);

    setShowAddForm(true);

    // Scroll to top
    if (topRef.current) {
      topRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // eslint-disable-next-line no-unused-vars
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

  const handleVariationChange = (index, field, value) => {
    setVariations(prev => prev.map((item, i) => (
      i === index ? { ...item, [field]: value } : item
    )));
  };

  const handleAddVariation = () => {
    setVariations(prev => [...prev, createEmptyVariation()]);
  };

  const handleRemoveVariation = (index) => {
    setVariations(prev => prev.filter((_, i) => i !== index));
  };

  const handleMoveVariation = (index, direction) => {
    setVariations(prev => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const updated = [...prev];
      [updated[index], updated[nextIndex]] = [updated[nextIndex], updated[index]];
      return updated;
    });
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

  const groupedProducts = (() => {
    const groups = {};
    categories.forEach(cat => {
      groups[cat.id] = {
        name: cat.name,
        products: []
      };
    });
    const OTHER_KEY = 'other';
    groups[OTHER_KEY] = {
      name: 'Other Category',
      products: []
    };
    filteredProducts.forEach(product => {
      const catId = product.category_id;
      if (catId && groups[catId]) {
        groups[catId].products.push(product);
      } else {
        groups[OTHER_KEY].products.push(product);
      }
    });
    return groups;
  })();

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
        overflow: 'visible',
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
        <div style={{ display: 'flex', gap: 'var(--spacing-3)', alignItems: 'center' }}>
          <button
            onClick={openImportModal}
            title="Bulk import products from CSV / XLSX"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-2)',
              padding: 'var(--spacing-3) var(--spacing-5)',
              borderRadius: 'var(--radius-xl)',
              fontSize: 'var(--text-sm)',
              fontWeight: '600',
              border: '1px solid rgba(99,179,237,0.35)',
              background: 'rgba(99,179,237,0.08)',
              color: '#63b3ed',
              cursor: 'pointer',
              transition: 'all 0.2s',
              letterSpacing: '0.01em',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,179,237,0.18)'; e.currentTarget.style.borderColor = 'rgba(99,179,237,0.6)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,179,237,0.08)'; e.currentTarget.style.borderColor = 'rgba(99,179,237,0.35)'; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Add Product in Bulk
          </button>
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
      </div>

      {/* ── Import Menu Modal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showImportModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--spacing-4)'
          }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
              style={{
                width: '100%', maxWidth: '720px', maxHeight: '90vh',
                display: 'flex', flexDirection: 'column',
                borderRadius: '22px',
                backgroundColor: isDark 
                  ? 'rgba(22, 26, 32, 0.95)' 
                  : 'rgba(255, 255, 255, 0.98)',
                border: isDark 
                  ? '1px solid rgba(255, 255, 255, 0.08)' 
                  : '1px solid rgba(0, 0, 0, 0.08)',
                boxShadow: isDark
                  ? '0 30px 80px rgba(0, 0, 0, 0.55)'
                  : '0 20px 60px rgba(0, 0, 0, 0.15)',
                color: 'var(--text-primary)',
                overflow: 'hidden',
              }}
            >
              {/* Modal Top Bar */}
              <div style={{
                padding: 'var(--spacing-6) var(--spacing-8)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                flexShrink: 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-4)' }}>
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                      {importStep === 'guide' ? 'Bulk Menu Ingestion' : importStep === 'upload' ? 'Upload Menu File' : 'Import Report'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                      {importStep === 'guide' ? 'Follow the column format guidelines below' : importStep === 'upload' ? 'Choose a .csv or .xlsx menu spreadsheet' : 'Ingestion complete. View stats below'}
                    </div>
                  </div>
                </div>
                <button onClick={closeImportModal} style={{
                  background: 'transparent', border: 'none',
                  color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '24px',
                  transition: 'opacity 0.2s', opacity: 0.7
                }} onMouseEnter={e => e.currentTarget.style.opacity = 1}
                  onMouseLeave={e => e.currentTarget.style.opacity = 0.7}>
                  ×
                </button>
              </div>

              {/* Step Indicator */}
              <div style={{
                display: 'flex', gap: '8px', padding: '0 var(--spacing-8)', paddingTop: 'var(--spacing-6)',
                flexShrink: 0,
              }}>
                {[{ key: 'guide', label: '1. Format Guide' }, { key: 'upload', label: '2. Upload' }, { key: 'result', label: '3. Status' }].map((step, i) => (
                  <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      padding: '6px 14px', borderRadius: '30px',
                      fontSize: '12px', fontWeight: '600',
                      background: importStep === step.key ? 'rgba(249,115,22,0.15)' : 'rgba(255,255,255,0.03)',
                      color: importStep === step.key ? '#f97316' : 'var(--text-secondary)',
                      border: importStep === step.key ? '1px solid rgba(249,115,22,0.3)' : '1px solid rgba(255,255,255,0.05)',
                      transition: 'all 0.2s',
                    }}>{step.label}</div>
                    {i < 2 && <div style={{ width: '24px', height: '1px', background: 'rgba(255,255,255,0.1)' }} />}
                  </div>
                ))}
              </div>

              {/* Modal Body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--spacing-6) var(--spacing-8) var(--spacing-8)' }}>

                {/* ── STEP 1: Format Guide ── */}
                {importStep === 'guide' && (
                  <div>
                    {/* Downloads Section */}
                    <div style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      borderRadius: 'var(--radius-xl)',
                      padding: 'var(--spacing-5)',
                      marginBottom: 'var(--spacing-6)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '12px'
                    }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>Need a Menu Template?</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>Download the pre-formatted templates to start.</div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <a href={importMenuAPI.getSampleCsvUrl()} download style={{
                          padding: '8px 16px', background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
                          color: 'var(--text-primary)', fontSize: '12px', fontWeight: '600',
                          textDecoration: 'none', transition: 'all 0.2s'
                        }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}>
                          CSV Template
                        </a>
                        <a href={importMenuAPI.getSampleXlsxUrl()} download style={{
                          padding: '8px 16px', background: 'rgba(249,115,22,0.12)',
                          border: '1px solid rgba(249,115,22,0.3)', borderRadius: '8px',
                          color: 'var(--text-primary)', fontSize: '12px', fontWeight: '600',
                          textDecoration: 'none', transition: 'all 0.2s'
                        }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(249,115,22,0.2)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'rgba(249,115,22,0.12)'}>
                          Excel Template
                        </a>
                      </div>
                    </div>

                    {/* Guideline Rules */}
                    <div style={{
                      background: 'rgba(255,255,255,0.01)',
                      border: '1px solid rgba(255,255,255,0.04)',
                      borderRadius: 'var(--radius-xl)',
                      padding: 'var(--spacing-6)',
                      color: 'var(--text-secondary)',
                      lineHeight: '1.7',
                      fontSize: '13px'
                    }}>
                      <div style={{ color: 'var(--text-primary)', fontWeight: '700', fontSize: '15px', marginBottom: '12px' }}>File Guidelines</div>
                      <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <li>File must contain these exact headers: <strong style={{ color: 'var(--text-primary)' }}>Item Name</strong>, <strong style={{ color: 'var(--text-primary)' }}>Category</strong>, <strong style={{ color: 'var(--text-primary)' }}>Group</strong>, and <strong style={{ color: 'var(--text-primary)' }}>Price</strong>.</li>
                        <li>New <strong style={{ color: '#f97316' }}>Groups</strong> and <strong style={{ color: '#f97316' }}>Categories</strong> are automatically created on import.</li>
                        <li>Existing products with the same name are skipped to prevent duplicates.</li>
                        <li>Variations (e.g. Regular/Large) can be added via <code style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: '4px' }}>variation(1)</code>. Set as <strong style={{ color: '#f59e0b' }}>None</strong> for standalone items.</li>
                        <li>Currency characters like ₹ and $ are auto-stripped during ingestion.</li>
                      </ul>
                    </div>
                  </div>
                )}

                {/* ── STEP 2: Upload ── */}
                {importStep === 'upload' && (
                  <div>
                    <div
                      onDragOver={e => { e.preventDefault(); setImportDragging(true); }}
                      onDragLeave={() => setImportDragging(false)}
                      onDrop={handleImportFileDrop}
                      onClick={() => importFileInputRef.current?.click()}
                      style={{
                        border: `2px dashed ${importDragging ? '#f97316' : importFile ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.1)'}`,
                        borderRadius: 'var(--radius-2xl)',
                        padding: 'var(--spacing-5)',
                        display: 'flex',
                        justifyContent: "center",
                        alignItems: 'center',
                        flexDirection: 'column',
                        gap: '8px',
                        cursor: 'pointer',
                        background: importDragging ? 'rgba(249,115,22,0.04)' : importFile ? 'rgba(52,211,153,0.02)' : 'rgba(255,255,255,0.01)',
                        transition: 'all 0.2s',
                        marginBottom: 'var(--spacing-6)'
                      }}
                    >
                      <input
                        ref={importFileInputRef}
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        style={{ display: 'none' }}
                        onChange={handleImportFileDrop}
                      />
                      {importFile ? (
                        <>
                          <div style={{ fontSize: '40px', marginBottom: '12px' }}></div>
                          <div style={{ fontWeight: '700', color: '#34d399', fontSize: '16px', marginBottom: '4px' }}>{importFile.name}</div>
                          <div style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>{(importFile.size / 1024).toFixed(1)} KB — click to choose another file</div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: '40px', marginBottom: '12px' }}></div>
                          <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '16px', marginBottom: '4px' }}>Drag & Drop Menu File</div>
                          <div style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>Supports <strong style={{ color: '#f97316' }}>.csv</strong> and <strong style={{ color: '#f97316' }}>.xlsx</strong> files</div>
                        </>
                      )}
                    </div>

                    {importFile && (
                      <div style={{
                        background: 'rgba(249,115,22,0.08)',
                        border: '1px solid rgba(249,115,22,0.15)',
                        borderRadius: 'var(--radius-xl)',
                        padding: 'var(--spacing-4)',
                        fontSize: '12px',
                        color: 'var(--text-secondary)'
                      }}>
                        ⚠️ <strong style={{ color: 'var(--text-primary)' }}>Notice:</strong> Double check details inside the file before starting. Already existing item records will not be overwritten.
                      </div>
                    )}
                  </div>
                )}

                {/* ── STEP 3: Result ── */}
                {importStep === 'result' && importResult && (
                  <div>
                    <div style={{
                      padding: 'var(--spacing-5)',
                      borderRadius: 'var(--radius-xl)',
                      marginBottom: 'var(--spacing-6)',
                      background: importResult.success ? 'rgba(52,211,153,0.08)' : 'rgba(239,68,68,0.08)',
                      border: `1px solid ${importResult.success ? 'rgba(52,211,153,0.2)' : 'rgba(239,68,68,0.2)'}`,
                      color: importResult.success ? '#34d399' : '#f87171',
                      fontSize: '14px', fontWeight: '600',
                    }}>
                      {importResult.message}
                    </div>

                    {importResult.stats && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: 'var(--spacing-6)' }}>
                        {[
                          { label: 'Imported', value: importResult.stats.created, color: '#34d399' },
                          { label: 'Skipped', value: importResult.stats.skipped, color: '#f59e0b' },
                          { label: 'Failed', value: importResult.stats.errors, color: '#f87171' },
                        ].map(s => (
                          <div key={s.label} style={{
                            textAlign: 'center', padding: '16px 8px',
                            background: 'rgba(255,255,255,0.02)',
                            borderRadius: 'var(--radius-xl)',
                            border: '1px solid rgba(255,255,255,0.05)'
                          }}>
                            <div style={{ fontSize: '24px', fontWeight: '800', color: s.color }}>{s.value}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '4px' }}>{s.label}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {importResult.details && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {importResult.details.created?.length > 0 && (
                          <details open style={{ borderRadius: 'var(--radius-lg)', border: '1px solid rgba(52,211,153,0.15)', background: 'rgba(52,211,153,0.02)' }}>
                            <summary style={{ padding: '10px 14px', cursor: 'pointer', fontWeight: '700', color: '#34d399', fontSize: '12px' }}>✓ Created ({importResult.details.created.length})</summary>
                            <div style={{ padding: '0 14px 10px', maxHeight: '120px', overflowY: 'auto' }}>
                              {importResult.details.created.map((item, i) => (
                                <div key={i} style={{ fontSize: '11px', color: 'var(--text-secondary)', padding: '3px 0' }}>{item.row}: {item.name}</div>
                              ))}
                            </div>
                          </details>
                        )}
                        {importResult.details.skipped?.length > 0 && (
                          <details style={{ borderRadius: 'var(--radius-lg)', border: '1px solid rgba(245,158,11,0.15)', background: 'rgba(245,158,11,0.02)' }}>
                            <summary style={{ padding: '10px 14px', cursor: 'pointer', fontWeight: '700', color: '#f59e0b', fontSize: '12px' }}>⏭ Skipped ({importResult.details.skipped.length})</summary>
                            <div style={{ padding: '0 14px 10px', maxHeight: '120px', overflowY: 'auto' }}>
                              {importResult.details.skipped.map((item, i) => (
                                <div key={i} style={{ fontSize: '11px', color: 'var(--text-secondary)', padding: '3px 0' }}>{item.row}: {item.name || '(Blank name)'} — {item.reason}</div>
                              ))}
                            </div>
                          </details>
                        )}
                        {importResult.details.errors?.length > 0 && (
                          <details style={{ borderRadius: 'var(--radius-lg)', border: '1px solid rgba(239,68,68,0.15)', background: 'rgba(239,68,68,0.02)' }}>
                            <summary style={{ padding: '10px 14px', cursor: 'pointer', fontWeight: '700', color: '#f87171', fontSize: '12px' }}>✗ Errors ({importResult.details.errors.length})</summary>
                            <div style={{ padding: '0 14px 10px', maxHeight: '120px', overflowY: 'auto' }}>
                              {importResult.details.errors.map((item, i) => (
                                <div key={i} style={{ fontSize: '11px', color: '#f87171', padding: '3px 0' }}>{item.row}: {item.name} — {item.reason}</div>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer Buttons */}
              <div style={{
                padding: 'var(--spacing-5) var(--spacing-8)',
                borderTop: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.01)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                flexShrink: 0,
              }}>
                <button
                  onClick={closeImportModal}
                  style={{
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px', padding: '10px 20px', color: 'var(--text-secondary)',
                    cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                >
                  {importStep === 'result' ? 'Close' : 'Cancel'}
                </button>

                <div style={{ display: 'flex', gap: '12px' }}>
                  {importStep === 'upload' && (
                    <button
                      onClick={() => setImportStep('guide')}
                      style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '10px 20px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
                    >
                      Back
                    </button>
                  )}
                  {importStep === 'result' && importResult?.stats?.created > 0 && (
                    <button
                      onClick={() => { setImportStep('guide'); setImportFile(null); setImportResult(null); }}
                      style={{ background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: '8px', padding: '10px 20px', color: '#f97316', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
                    >
                      Import Another
                    </button>
                  )}
                  {importStep === 'guide' && (
                    <button
                      onClick={() => setImportStep('upload')}
                      style={{ background: '#ff7300e7', border: 'none', borderRadius: '8px', padding: '10px 24px', color: '#ffffff', cursor: 'pointer', fontSize: '13px', fontWeight: '700', transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(255, 151, 54, 0.25)' }}
                    >
                      Continue
                    </button>
                  )}
                  {importStep === 'upload' && (
                    <button
                      onClick={handleImportSubmit}
                      disabled={!importFile || importLoading}
                      style={{
                        background: importFile && !importLoading ? 'linear-gradient(135deg, #FFB869 0%, #FF9736 100%)' : 'rgba(255,255,255,0.05)',
                        border: 'none',
                        borderRadius: '8px', padding: '10px 24px',
                        color: importFile && !importLoading ? '#ffffff' : 'rgba(255,255,255,0.3)',
                        cursor: importFile && !importLoading ? 'pointer' : 'not-allowed',
                        fontSize: '13px', fontWeight: '700',
                        display: 'flex', alignItems: 'center', gap: '8px',
                        transition: 'all 0.2s',
                        boxShadow: importFile && !importLoading ? '0 4px 12px rgba(255, 151, 54, 0.25)' : 'none'
                      }}
                    >
                      {importLoading ? (
                        <>
                          <div style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #ffffff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                          Importing...
                        </>
                      ) : 'Start Import'}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Controls: Search & Filters */}
      <div style={{
        padding: '0 var(--spacing-8) var(--spacing-6) var(--spacing-8)',
        display: 'flex',
        gap: 'var(--spacing-4)',
        alignItems: 'center',
        flexWrap: 'wrap',
        position: 'relative',
        zIndex: 100,
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
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--spacing-8) var(--spacing-8) var(--spacing-8)', position: 'relative', zIndex: 10 }}>

        {/* Add/Edit Form */}
        <AnimatePresence>
          {showAddForm && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="pmFormWrap" style={{ marginBottom: 'var(--spacing-6)', overflow: 'visible' }}>
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
                    <div className="pmLabel">Price (Dine-in)</div>
                    <input className="pmInput" type="number" step="0.01" value={formData.price} onChange={(e) => handleInputChange('price', e.target.value)} required />
                  </div>
                  <div className="pmField">
                    <div className="pmLabel">Takeaway Add-on Charges (Optional)</div>
                    <input className="pmInput" type="number" step="0.01" value={formData.takeaway_price} onChange={(e) => handleInputChange('takeaway_price', e.target.value)} placeholder="0.00 if empty" />
                  </div>
                  <div className="pmField" style={{ position: 'relative', zIndex: 10 }}>
                    <div className="pmLabel">Category</div>
                    <GlobalSelect
                      options={categories.map(cat => ({ label: cat.name, value: cat.id }))}
                      value={formData.category_id}
                      onChange={(val) => handleInputChange('category_id', val)}
                      placeholder="Select Category"
                      className="pmDropdown"
                      direction="bottom"
                    />
                  </div>
                </div>

                <div className="pmVariationsCard">
                  <div className="pmVariationsHeader">
                    <div>
                      <div className="pmLabel" style={{ marginBottom: '4px' }}>Variations</div>
                      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
                        Optional sizes or pack options with their own selling price.
                      </div>
                    </div>
                    <button type="button" className="pmSecondaryBtn" onClick={handleAddVariation}>
                      <IconPlus aria-hidden="true" /> Add Variation
                    </button>
                  </div>

                  {variations.length > 0 ? (
                    <div className="pmVariationsList">
                      {variations.map((variation, index) => (
                        <div key={variation.id || index} className="pmVariationRow">
                          <input
                            className="pmInput"
                            value={variation.name}
                            onChange={(e) => handleVariationChange(index, 'name', e.target.value)}
                            placeholder="Variation name (e.g. 250 ml)"
                          />
                          <input
                            className="pmInput"
                            type="number"
                            step="0.01"
                            min="0"
                            value={variation.price}
                            onChange={(e) => handleVariationChange(index, 'price', e.target.value)}
                            placeholder="Price"
                          />
                          <div className="pmVariationActions">
                            <button
                              type="button"
                              className="pmActionBtn"
                              onClick={() => handleMoveVariation(index, -1)}
                              disabled={index === 0}
                              title="Move up"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="pmActionBtn"
                              onClick={() => handleMoveVariation(index, 1)}
                              disabled={index === variations.length - 1}
                              title="Move down"
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              className="pmActionBtn pmActionDanger"
                              onClick={() => handleRemoveVariation(index)}
                              title="Delete variation"
                            >
                              <IconTrash />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="pmVariationsEmpty">
                      No variations added. Product will use the base price above.
                    </div>
                  )}
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
                      {(imageUploading || imageProcessing) && (
                        <div style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          backgroundColor: 'rgba(0, 0, 0, 0.7)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
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
                          {imageProcessing && (
                            <span style={{ fontSize: '10px', color: 'white', fontWeight: 600 }}>Removing BG...</span>
                          )}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(24px * var(--display-zoom))' }}>
            {Object.keys(groupedProducts).map(catId => {
              const group = groupedProducts[catId];
              if (group.products.length === 0) return null;

              return (
                <div key={catId} className="pmCategorySection" style={{ display: 'flex', flexDirection: 'column', gap: 'calc(12px * var(--display-zoom))' }}>
                  <h3 className="pmCategorySectionTitle" style={{
                    fontSize: 'calc(18px * var(--text-scale))',
                    fontWeight: '700',
                    color: 'var(--text-primary)',
                    margin: 'calc(16px * var(--display-zoom)) 0 0 0',
                    paddingBottom: 'calc(8px * var(--display-zoom))',
                    borderBottom: '1px solid var(--border-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'calc(8px * var(--display-zoom))'
                  }}>
                    <FiPackage style={{ color: 'var(--brand-primary)', opacity: 0.8 }} />
                    {group.name}
                    <span style={{
                      fontSize: 'calc(11px * var(--text-scale))',
                      fontWeight: '600',
                      color: 'var(--text-tertiary)',
                      background: 'var(--bg-secondary)',
                      padding: 'calc(2px * var(--display-zoom)) calc(8px * var(--display-zoom))',
                      borderRadius: 'var(--radius-full)',
                      marginLeft: 'calc(8px * var(--display-zoom))',
                      border: '1px solid var(--border-primary)'
                    }}>
                      {group.products.length} item{group.products.length === 1 ? '' : 's'}
                    </span>
                  </h3>

                  <motion.div className="pmGrid" variants={staggerContainer} initial="initial" animate="animate">
                    {group.products.map((product) => (
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
                                {Array.isArray(product.variations) && product.variations.length > 0 && (
                                  <div style={{ fontSize: 'calc(11px * var(--text-scale))', color: 'var(--text-tertiary)', fontWeight: 600 }}>
                                    {product.variations.length} variation{product.variations.length === 1 ? '' : 's'}
                                  </div>
                                )}
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
                                  <button className="pmActionBtn pmActionDanger" onClick={() => handleDisable(product)} title="Deactivate" style={{ justifyContent: 'center' }}>
                                    <IconPower /> {showImages ? 'Disable' : ''}
                                  </button>
                                ) : (
                                  <>
                                    <button className="pmActionBtn pmActionReactivate" onClick={() => handleReactivate(product)} title="Reactivate" style={{ color: '#10B981', borderColor: 'rgba(16, 185, 129, 0.3)', background: 'rgba(16, 185, 129, 0.1)', justifyContent: 'center' }}>
                                      <IconPower /> {showImages ? 'Enable' : ''}
                                    </button>
                                    <button className="pmActionBtn" onClick={() => handleDeleteDirect(product)} title="Delete Permanently" style={{
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
                </div>
              );
            })}
          </div>
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
                    Enter Owner PIN
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter PIN..."
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
  const { isDark } = useTheme();
  const [activeTab, setActiveTab] = useState('products');

  return (
    <PageContainer>
      <div className="pmPage">
        {/* Header - Centered Toggle Button / Pill Navigation */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: 'calc(24px * var(--display-zoom))',
          width: '100%'
        }}>
          <div style={{
            display: 'inline-flex',
            background: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
            borderRadius: '999px',
            padding: '4px',
            border: '1px solid var(--glass-border)',
            gap: '2px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)'
          }}>
            <button
              onClick={() => setActiveTab('products')}
              style={{
                padding: '8px 24px',
                background: activeTab === 'products' ? '#F97316' : 'transparent',
                border: 'none',
                borderRadius: '999px',
                color: activeTab === 'products' ? 'white' : 'var(--text-secondary)',
                fontWeight: activeTab === 'products' ? 600 : 500,
                fontSize: '14px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                outline: 'none',
                boxShadow: activeTab === 'products' ? '0 2px 8px rgba(249, 115, 22, 0.3)' : 'none'
              }}
            >
              Products
            </button>
            <button
              onClick={() => setActiveTab('groups')}
              style={{
                padding: '8px 24px',
                background: activeTab === 'groups' ? '#F97316' : 'transparent',
                border: 'none',
                borderRadius: '999px',
                color: activeTab === 'groups' ? 'white' : 'var(--text-secondary)',
                fontWeight: activeTab === 'groups' ? 600 : 500,
                fontSize: '14px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                outline: 'none',
                boxShadow: activeTab === 'groups' ? '0 2px 8px rgba(249, 115, 22, 0.3)' : 'none'
              }}
            >
              Groups
            </button>
          </div>
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
          {activeTab === 'groups' && (
            <motion.div
              key="groups"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
            >
              <GroupManagement />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageContainer>
  );
};

export default Management;
