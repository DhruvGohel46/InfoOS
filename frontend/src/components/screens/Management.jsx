import React, { useState, useEffect, useRef } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnimation } from '../../hooks/useAnimation';
import { FiSearch, FiPackage, FiTrendingUp, FiAlertTriangle, FiGrid, FiDownload, FiUpload, FiRefreshCw } from 'react-icons/fi';
import { productsAPI, categoriesAPI, importMenuAPI, handleAPIError, formatCurrency } from '../../utils/api';
import { useAlert as useToast } from '../../context/AlertContext';
import GroupManagement from './GroupManagement';
import '../../styles/Management.css';
import { useSettings } from '../../context/SettingsContext';
import GlobalSelect from '../ui/GlobalSelect';
import PageContainer from '../layout/PageContainer';
import { createEmptyVariation, sanitizeVariationsForSave } from '../../utils/productVariations';
import { usePOSData } from '../../context/POSDataContext';
import { useTheme } from '../../context/ThemeContext';

// Centralised Product Services
import { LocalProductService } from '../../services/LocalProductService';
import { OnlineProductService } from '../../services/OnlineProductService';
import { ExportService } from '../../services/ExportService';
import { ImportService } from '../../services/ImportService';
import { cloudSyncAPI } from '../../api/cloudApi';

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

const ProductManagement = ({ activeTab, setActiveTab }) => {
  const { staggerContainer, staggerItem } = useAnimation();
  const { showSuccess, showError } = useToast();
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

  // Franchise & Online Mode states
  const [isOnlineMode, setIsOnlineMode] = useState(() => {
    return localStorage.getItem('franchise_online_mode') === 'true';
  });
  const [cloudRole, setCloudRole] = useState('standalone');
  const [importingFromFranchise, setImportingFromFranchise] = useState(false);
  const [publishingMenu, setPublishingMenu] = useState(false);

  useEffect(() => {
    localStorage.setItem('franchise_online_mode', isOnlineMode);
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnlineMode]);

  useEffect(() => {
    const fetchRole = async () => {
      const token = localStorage.getItem('cloud_auth_token');
      if (token) {
        try {
          const prof = await cloudSyncAPI.getFranchiseProfile();
          setCloudRole(prof.role || 'standalone');
        } catch (e) {
          console.error("Failed to load cloud role:", e);
        }
      }
    };
    fetchRole();
  }, []);

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

  // Real-time listener for group & product catalog updates
  useEffect(() => {
    const handleCatalogUpdate = () => {
      loadProducts();
      loadCategories();
    };
    window.addEventListener('pos-catalog-updated', handleCatalogUpdate);
    return () => window.removeEventListener('pos-catalog-updated', handleCatalogUpdate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProducts = async () => {
    try {
      setError('');
      setLoading(true);
      if (isOnlineMode) {
        const cloudProducts = await OnlineProductService.fetchProducts();
        const normalized = cloudProducts.map(p => ({
          product_id: p.id,
          name: p.name,
          price: p.price,
          category: p.category,
          category_name: p.category,
          image_filename: p.image,
          active: p.available,
          variations: p.variants || []
        }));
        setProducts(normalized);
      } else {
        const localProducts = await LocalProductService.fetchProducts();
        setProducts(localProducts);
      }
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

      if (isOnlineMode) {
        const cloudProductData = {
          name: productData.name,
          price: productData.price,
          category: productData.category || 'General',
          description: productData.description || '',
          image_url: productData.image_url || '',
          variants: productData.variations || [],
          addons: [],
          is_available: productData.active !== undefined ? !!productData.active : true
        };

        const prodDesc = `"${formData.name}" (₹${formData.price}${formData.category ? `, ${formData.category}` : ''})`;

        if (editingProduct) {
          await OnlineProductService.updateProduct(editingProduct.product_id, cloudProductData);
          showSuccess(`Cloud product ${prodDesc} updated successfully`, {
            title: 'Product Updated',
            category: 'inventory',
            action_route: '/management'
          });
        } else {
          await OnlineProductService.createProduct(cloudProductData);
          showSuccess(`Cloud product ${prodDesc} created successfully`, {
            title: 'Product Created',
            category: 'inventory',
            action_route: '/management'
          });
        }
      } else {
        const prodDesc = `"${formData.name}" (₹${formData.price}${formData.category ? `, ${formData.category}` : ''})`;

        if (editingProduct) {
          await LocalProductService.updateProduct(editingProduct.product_id, productData);

          // Handle Image Update (offline local SQLite only)
          if (imageToDelete) {
            await productsAPI.deleteImage(editingProduct.product_id);
          }

          if (selectedImage) {
            setImageUploading(true);
            setImageProcessing(true);
            try {
              const formDataImg = new FormData();
              formDataImg.append('image', selectedImage);
              const res = await productsAPI.uploadImage(editingProduct.product_id, formDataImg);
              if (res && res.data && res.data.background_removed === false) {
                showSuccess(`Product ${prodDesc} updated (original image saved, background removal unavailable)`, {
                  title: 'Product Updated',
                  category: 'inventory',
                  action_route: '/management'
                });
              } else {
                showSuccess(`Product ${prodDesc} updated successfully with background-removed image!`, {
                  title: 'Product Updated',
                  category: 'inventory',
                  action_route: '/management'
                });
              }
            } finally {
              setImageUploading(false);
              setImageProcessing(false);
            }
          } else {
            showSuccess(`Product ${prodDesc} updated successfully`, {
              title: 'Product Updated',
              category: 'inventory',
              action_route: '/management'
            });
          }

        } else {
          const id = generateProductId(formData.name, formData.category);
          const newProduct = { ...productData, product_id: id };
          await LocalProductService.createProduct(newProduct);

          if (selectedImage) {
            setImageUploading(true);
            setImageProcessing(true);
            try {
              const formDataImg = new FormData();
              formDataImg.append('image', selectedImage);
              const res = await productsAPI.uploadImage(id, formDataImg);
              if (res && res.data && res.data.background_removed === false) {
                showSuccess(`New product ${prodDesc} created (original image saved)`, {
                  title: 'Product Created',
                  category: 'inventory',
                  action_route: '/management'
                });
              } else {
                showSuccess(`New product ${prodDesc} created with background-removed image!`, {
                  title: 'Product Created',
                  category: 'inventory',
                  action_route: '/management'
                });
              }
            } finally {
              setImageUploading(false);
              setImageProcessing(false);
            }
          } else {
            showSuccess(`New product ${prodDesc} created successfully`, {
              title: 'Product Created',
              category: 'inventory',
              action_route: '/management'
            });
          }
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
      const prodName = `"${product.name}"`;
      if (isOnlineMode) {
        await OnlineProductService.updateProduct(product.product_id, { is_available: true });
        showSuccess(`Cloud product ${prodName} reactivated`, {
          title: 'Product Reactivated',
          category: 'inventory',
          action_route: '/management'
        });
      } else {
        await LocalProductService.updateProduct(product.product_id, { active: true });
        showSuccess(`Product ${prodName} reactivated successfully`, {
          title: 'Product Reactivated',
          category: 'inventory',
          action_route: '/management'
        });
      }
      await loadProducts();
      checkCatalogVersion();
    } catch (err) {
      const apiError = handleAPIError(err);
      setError(apiError.message);
    }
  };

  const handleDisable = async (product) => {
    try {
      const prodName = `"${product.name}"`;
      if (isOnlineMode) {
        await OnlineProductService.updateProduct(product.product_id, { is_available: false });
        showSuccess(`Cloud product ${prodName} deactivated`, {
          title: 'Product Disabled',
          category: 'inventory',
          action_route: '/management'
        });
      } else {
        await LocalProductService.updateProduct(product.product_id, { active: false });
        showSuccess(`Product ${prodName} disabled`, {
          title: 'Product Disabled',
          category: 'inventory',
          action_route: '/management'
        });
      }
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
      const prodName = `"${itemToDelete.name || 'Product'}"`;
      if (isOnlineMode) {
        await OnlineProductService.deleteProduct(itemToDelete.product_id);
        showSuccess(`Cloud product ${prodName} permanently deleted`, {
          title: 'Product Deleted',
          category: 'inventory',
          action_route: '/management'
        });
      } else {
        await productsAPI.deleteProductPermanently(itemToDelete.product_id, deletePassword);
        showSuccess(`Product ${prodName} permanently deleted`, {
          title: 'Product Deleted',
          category: 'inventory',
          action_route: '/management'
        });
      }
      setShowPasswordModal(false);
      setItemToDelete(null);
      setDeletePassword('');
      await loadProducts();
      checkCatalogVersion();
    } catch (err) {
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

  const handleExportMenu = () => {
    try {
      ExportService.exportMenu(categories, products);
      showSuccess("Menu exported successfully as JSON!");
    } catch (err) {
      setError(err.message || "Failed to export menu.");
    }
  };

  const handleImportFromFranchise = async () => {
    setImportingFromFranchise(true);
    setError('');
    try {
      const response = await OnlineProductService.downloadMenu();
      if (response.success) {
        const importResult = await ImportService.importMenuFromFranchise(response);
        showSuccess(`Menu imported successfully from master franchise: ${importResult.master_name}.`);
        await loadProducts();
        checkCatalogVersion();
      } else {
        if (response.error_code === 'STANDALONE_NOT_ALLOWED') {
          showError('Menu Import Failed\nThis store is registered as a Standalone store and cannot import a Master Franchise menu.');
        } else if (response.error_code === 'MASTER_MENU_NOT_FOUND') {
          showError('No Menu Available\nYour Master Franchise has not uploaded a menu yet. Please contact the franchise administrator.');
        } else {
          showError(response.message || 'Import failed.');
        }
      }
    } catch (err) {
      if (err.response?.data?.error_code === 'STANDALONE_NOT_ALLOWED') {
        showError('Menu Import Failed\nThis store is registered as a Standalone store and cannot import a Master Franchise menu.');
      } else if (err.response?.data?.error_code === 'MASTER_MENU_NOT_FOUND') {
        showError('No Menu Available\nYour Master Franchise has not uploaded a menu yet. Please contact the franchise administrator.');
      } else {
        showError(err.response?.data?.error || err.message || 'Franchise import failed');
      }
    } finally {
      setImportingFromFranchise(false);
    }
  };

  const handlePublishMenu = async () => {
    setPublishingMenu(true);
    setError('');
    try {
      const versionStr = new Date().toISOString().split('T')[0].replace(/-/g, '.');
      // Export current menu structure
      const variants = [];
      const addons = [];
      products.forEach(p => {
        const pId = p.product_id || '';
        if (Array.isArray(p.variations)) {
          p.variations.forEach(v => {
            variants.push({ id: v.id || `${pId}_var_${v.name}`, product_id: pId, name: v.name, price: v.price });
          });
        }
      });

      const menuPackage = {
        categories: categories.map(c => ({ id: c.id, name: c.name })),
        subcategories: [],
        products: products.map(p => ({
          id: p.product_id || '',
          product_code: p.product_code || p.sku || '',
          name: p.name || '',
          category: p.category || p.category_name || '',
          description: p.description || '',
          price: p.price,
          image: p.image_filename || '',
          variants: p.variations || [],
          addons: [],
          available: p.active !== undefined ? !!p.active : true
        })),
        variants,
        addons
      };

      await OnlineProductService.uploadMenu({
        menu_version: versionStr,
        menu: menuPackage
      });
      showSuccess(`Menu snapshot version ${versionStr} published to outlets successfully.`);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Menu publication failed');
    } finally {
      setPublishingMenu(false);
    }
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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      ref={topRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        gap: '16px'
      }}
    >
      {/* Header Card with Unified Navigation */}
      <div style={{
        padding: '18px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: isDark
          ? 'linear-gradient(165deg, #18191D 0%, #111215 100%)'
          : '#FFFFFF',
        border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #E2E8F0',
        borderRadius: '24px',
        margin: '0 0 8px 0',
        boxShadow: isDark
          ? '0 10px 30px -8px rgba(0, 0, 0, 0.5)'
          : '0 4px 20px -2px rgba(15, 23, 42, 0.05), 0 0 1px 1px rgba(0, 0, 0, 0.02)',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        {/* Left: Title + Segmented Navigation Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{
              fontSize: '1.65rem',
              fontWeight: '900',
              margin: 0,
              color: isDark ? '#FFFFFF' : '#0F172A',
              letterSpacing: '-0.02em'
            }}>
              Management
            </h1>
          </div>

          {setActiveTab && (
            <div style={{
              display: 'inline-flex',
              background: isDark ? '#1C1D22' : '#F1F5F9',
              borderRadius: '999px',
              padding: '4px',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #CBD5E1',
              gap: '4px'
            }}>
              <button
                type="button"
                onClick={() => setActiveTab('products')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 18px',
                  background: activeTab === 'products'
                    ? 'linear-gradient(135deg, #FF6B1A 0%, #EA580C 100%)'
                    : 'transparent',
                  border: 'none',
                  borderRadius: '999px',
                  color: activeTab === 'products' ? '#FFFFFF' : (isDark ? '#94A3B8' : '#64748B'),
                  fontWeight: activeTab === 'products' ? 750 : 600,
                  fontSize: '0.86rem',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  boxShadow: activeTab === 'products' ? '0 3px 10px rgba(255, 107, 26, 0.35)' : 'none'
                }}
              >
                <FiPackage size={16} /> Products Catalog
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('groups')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 18px',
                  background: activeTab === 'groups'
                    ? 'linear-gradient(135deg, #FF6B1A 0%, #EA580C 100%)'
                    : 'transparent',
                  border: 'none',
                  borderRadius: '999px',
                  color: activeTab === 'groups' ? '#FFFFFF' : (isDark ? '#94A3B8' : '#64748B'),
                  fontWeight: activeTab === 'groups' ? 750 : 600,
                  fontSize: '0.86rem',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  boxShadow: activeTab === 'groups' ? '0 3px 10px rgba(255, 107, 26, 0.35)' : 'none'
                }}
              >
                <FiGrid size={16} /> Category & Groups
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Mode Switcher */}
          <div style={{
            display: 'flex',
            backgroundColor: isDark ? '#1C1D22' : '#F1F5F9',
            padding: '3px',
            borderRadius: '12px',
            border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #CBD5E1',
            marginRight: '6px'
          }}>
            <button
              type="button"
              onClick={() => setIsOnlineMode(false)}
              style={{
                padding: '6px 14px',
                borderRadius: '9px',
                fontSize: '12px',
                fontWeight: '700',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: !isOnlineMode ? '#FF6B1A' : 'transparent',
                color: !isOnlineMode ? '#FFFFFF' : (isDark ? '#94A3B8' : '#64748B'),
                boxShadow: !isOnlineMode ? '0 2px 8px rgba(255, 107, 26, 0.3)' : 'none',
                transition: 'all 0.18s ease'
              }}
            >
              Offline
            </button>
            <button
              type="button"
              onClick={() => {
                if (!localStorage.getItem('cloud_auth_token')) {
                  showError("Please authenticate in Settings first to enable Online mode.");
                  return;
                }
                setIsOnlineMode(true);
              }}
              style={{
                padding: '6px 14px',
                borderRadius: '9px',
                fontSize: '12px',
                fontWeight: '700',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: isOnlineMode ? '#FF6B1A' : 'transparent',
                color: isOnlineMode ? '#FFFFFF' : (isDark ? '#94A3B8' : '#64748B'),
                boxShadow: isOnlineMode ? '0 2px 8px rgba(255, 107, 26, 0.3)' : 'none',
                transition: 'all 0.18s ease'
              }}
            >
              Online
            </button>
          </div>

          {/* Action Buttons */}
          {!isOnlineMode ? (
            <>
              <button
                type="button"
                onClick={handleExportMenu}
                title="Export entire SQLite menu to JSON package"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                  padding: '0 16px',
                  height: '40px',
                  borderRadius: '12px',
                  fontSize: '0.84rem',
                  fontWeight: '700',
                  border: isDark ? '1px solid rgba(16, 185, 129, 0.35)' : '1.5px solid #86EFAC',
                  background: isDark ? 'rgba(16, 185, 129, 0.1)' : '#F0FDF4',
                  color: isDark ? '#34D399' : '#16A34A',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease'
                }}
              >
                <FiDownload size={15} /> Export Menu
              </button>
              <button
                type="button"
                onClick={openImportModal}
                title="Bulk import products from CSV / XLSX"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                  padding: '0 16px',
                  height: '40px',
                  borderRadius: '12px',
                  fontSize: '0.84rem',
                  fontWeight: '700',
                  border: isDark ? '1px solid rgba(59, 130, 246, 0.35)' : '1.5px solid #93C5FD',
                  background: isDark ? 'rgba(59, 130, 246, 0.1)' : '#EFF6FF',
                  color: isDark ? '#60A5FA' : '#2563EB',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease'
                }}
              >
                <FiUpload size={15} /> Bulk Ingest
              </button>
            </>
          ) : (
            <>
              {cloudRole === 'franchise' && (
                <button
                  type="button"
                  onClick={handleImportFromFranchise}
                  disabled={importingFromFranchise}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '7px',
                    padding: '0 16px',
                    height: '40px',
                    borderRadius: '12px',
                    fontSize: '0.84rem',
                    fontWeight: '700',
                    border: '1px solid rgba(139, 92, 246, 0.35)',
                    background: 'rgba(139, 92, 246, 0.1)',
                    color: '#A78BFA',
                    cursor: 'pointer',
                    transition: 'all 0.18s ease'
                  }}
                >
                  <FiDownload size={15} /> {importingFromFranchise ? "Importing..." : "Import Franchise Menu"}
                </button>
              )}
              {cloudRole === 'master' && (
                <button
                  type="button"
                  onClick={handlePublishMenu}
                  disabled={publishingMenu}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '7px',
                    padding: '0 16px',
                    height: '40px',
                    borderRadius: '12px',
                    fontSize: '0.84rem',
                    fontWeight: '700',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    background: 'rgba(245, 158, 11, 0.1)',
                    color: '#FBBF24',
                    cursor: 'pointer',
                    transition: 'all 0.18s ease'
                  }}
                >
                  <FiUpload size={15} /> {publishingMenu ? "Publishing..." : "Publish Menu"}
                </button>
              )}
            </>
          )}

          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            disabled={showAddForm}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '0 20px',
              height: '40px',
              borderRadius: '14px',
              fontSize: '0.88rem',
              fontWeight: '800',
              border: 'none',
              background: 'linear-gradient(135deg, #FF6B1A 0%, #EA580C 100%)',
              color: '#FFFFFF',
              boxShadow: '0 6px 20px rgba(255, 107, 26, 0.35)',
              cursor: showAddForm ? 'not-allowed' : 'pointer',
              opacity: showAddForm ? 0.6 : 1,
              transition: 'all 0.18s ease'
            }}
          >
            <IconPlus aria-hidden="true" /> Add Product
          </button>
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
                borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #E2E8F0',
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
                      background: importStep === step.key ? 'rgba(249,115,22,0.15)' : (isDark ? 'rgba(255,255,255,0.03)' : '#F1F5F9'),
                      color: importStep === step.key ? '#f97316' : 'var(--text-secondary)',
                      border: importStep === step.key ? '1px solid rgba(249,115,22,0.3)' : (isDark ? '1px solid rgba(255,255,255,0.05)' : '1px solid #CBD5E1'),
                      transition: 'all 0.2s',
                    }}>{step.label}</div>
                    {i < 2 && <div style={{ width: '24px', height: '1px', background: isDark ? 'rgba(255,255,255,0.1)' : '#CBD5E1' }} />}
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
                      background: isDark ? 'rgba(255, 255, 255, 0.02)' : '#F8FAFC',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.05)' : '1.5px solid #E2E8F0',
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
                          padding: '8px 16px', background: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF',
                          border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #CBD5E1', borderRadius: '8px',
                          color: 'var(--text-primary)', fontSize: '12px', fontWeight: '600',
                          textDecoration: 'none', transition: 'all 0.2s'
                        }} onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.1)' : '#F1F5F9'}
                          onMouseLeave={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF'}>
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
                      background: isDark ? 'rgba(255,255,255,0.01)' : '#F8FAFC',
                      border: isDark ? '1px solid rgba(255,255,255,0.04)' : '1.5px solid #E2E8F0',
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
                        <li>Variations (e.g. Regular/Large) can be added via <code style={{ background: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0', padding: '2px 6px', borderRadius: '4px' }}>variation(1)</code>. Set as <strong style={{ color: '#f59e0b' }}>None</strong> for standalone items.</li>
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
                        border: `2px dashed ${importDragging ? '#f97316' : importFile ? 'rgba(52,211,153,0.4)' : (isDark ? 'rgba(255,255,255,0.1)' : '#CBD5E1')}`,
                        borderRadius: 'var(--radius-2xl)',
                        padding: 'var(--spacing-5)',
                        display: 'flex',
                        justifyContent: "center",
                        alignItems: 'center',
                        flexDirection: 'column',
                        gap: '8px',
                        cursor: 'pointer',
                        background: importDragging ? 'rgba(249,115,22,0.04)' : importFile ? 'rgba(52,211,153,0.02)' : (isDark ? 'rgba(255,255,255,0.01)' : '#F8FAFC'),
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
                            background: isDark ? 'rgba(255,255,255,0.02)' : '#F8FAFC',
                            borderRadius: 'var(--radius-xl)',
                            border: isDark ? '1px solid rgba(255,255,255,0.05)' : '1.5px solid #E2E8F0'
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
                borderTop: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #E2E8F0',
                background: isDark ? 'rgba(255,255,255,0.01)' : '#F8FAFC',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                flexShrink: 0,
              }}>
                <button
                  onClick={closeImportModal}
                  style={{
                    background: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF',
                    border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1.5px solid #CBD5E1',
                    borderRadius: '8px', padding: '10px 20px', color: 'var(--text-secondary)',
                    cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9'}
                  onMouseLeave={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF'}
                >
                  {importStep === 'result' ? 'Close' : 'Cancel'}
                </button>

                <div style={{ display: 'flex', gap: '12px' }}>
                  {importStep === 'upload' && (
                    <button
                      onClick={() => setImportStep('guide')}
                      style={{ background: isDark ? 'transparent' : '#FFFFFF', border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1.5px solid #CBD5E1', borderRadius: '8px', padding: '10px 20px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
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
        padding: '0 0 16px 0',
        display: 'flex',
        gap: '14px',
        alignItems: 'center',
        flexWrap: 'wrap',
        position: 'relative',
        zIndex: 100,
      }}>
        {/* Search Input */}
        <div className="inventory-search" style={{ flex: '1 1 260px' }}>
          <FiSearch className="inventory-search-icon" />
          <input
            className="inventory-search-input"
            type="text"
            placeholder="Search by name, ID or category…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              background: isDark ? '#16171B' : '#FFFFFF',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #CBD5E1',
              color: isDark ? '#FFFFFF' : '#0F172A'
            }}
          />
        </div>

        {/* Category Filter */}
        <div style={{ minWidth: '180px' }}>
          <GlobalSelect
            options={[{ label: 'All Categories', value: 'all' }, ...categories.map(cat => ({ label: cat.name, value: cat.id }))]}
            value={categoryFilter}
            onChange={(val) => setCategoryFilter(val)}
            placeholder="Filter Category"
            className="pmDropdown"
            direction="bottom"
          />
        </div>

        {/* Segmented Filter Pills */}
        <div style={{
          display: 'inline-flex',
          background: isDark ? '#16171B' : '#F1F5F9',
          border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #CBD5E1',
          borderRadius: '14px',
          padding: '3px',
          gap: '3px'
        }}>
          <button
            onClick={() => setProductViewTab('active')}
            style={{
              padding: '7px 16px',
              border: 'none',
              borderRadius: '10px',
              fontSize: '0.84rem',
              fontWeight: '700',
              background: productViewTab === 'active' ? '#FF6B1A' : 'transparent',
              color: productViewTab === 'active' ? '#FFFFFF' : (isDark ? '#94A3B8' : '#64748B'),
              cursor: 'pointer',
              transition: 'all 0.18s ease',
              boxShadow: productViewTab === 'active' ? '0 2px 8px rgba(255, 107, 26, 0.3)' : 'none'
            }}
          >
            Active ({products.filter(p => p.active).length})
          </button>
          <button
            onClick={() => setProductViewTab('inactive')}
            style={{
              padding: '7px 16px',
              border: 'none',
              borderRadius: '10px',
              fontSize: '0.84rem',
              fontWeight: '700',
              background: productViewTab === 'inactive' ? '#FF6B1A' : 'transparent',
              color: productViewTab === 'inactive' ? '#FFFFFF' : (isDark ? '#94A3B8' : '#64748B'),
              cursor: 'pointer',
              transition: 'all 0.18s ease',
              boxShadow: productViewTab === 'inactive' ? '0 2px 8px rgba(255, 107, 26, 0.3)' : 'none'
            }}
          >
            Inactive ({products.filter(p => !p.active).length})
          </button>
        </div>

        {/* Refresh */}
        <button
          onClick={loadProducts}
          disabled={loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            height: '42px',
            padding: '0 16px',
            borderRadius: '14px',
            border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #CBD5E1',
            background: isDark ? '#16171B' : '#FFFFFF',
            color: isDark ? '#FFFFFF' : '#0F172A',
            fontSize: '0.86rem',
            fontWeight: '700',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.18s ease'
          }}
        >
          <FiRefreshCw className={loading ? 'spinner' : ''} size={15} />
          Refresh
        </button>
      </div>

      {/* Stats Bar */}
      <div style={{ padding: '0 0 18px 0' }}>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', width: '100%' }}
        >
          {[
            { label: 'Total Catalog', value: filteredProducts.length, color: '#3B82F6', icon: <FiPackage size={20} /> },
            { label: 'Active in Menu', value: products.filter(p => p.active).length, color: '#10B981', icon: <FiTrendingUp size={20} /> },
            { label: 'Disabled / Hidden', value: products.filter(p => !p.active).length, color: '#F59E0B', icon: <FiAlertTriangle size={20} /> },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '18px 22px',
                background: isDark ? 'linear-gradient(165deg, #18191E 0%, #121316 100%)' : '#FFFFFF',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #E2E8F0',
                borderRadius: '24px',
                boxShadow: isDark
                  ? '0 10px 30px -8px rgba(0, 0, 0, 0.5)'
                  : '0 4px 20px -2px rgba(15, 23, 42, 0.05), 0 0 1px 1px rgba(0, 0, 0, 0.02)',
              }}
            >
              <div style={{
                width: '46px',
                height: '46px',
                borderRadius: '15px',
                background: `${item.color}15`,
                border: `1px solid ${item.color}30`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: item.color,
                flexShrink: 0
              }}>
                {item.icon}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.06em', color: isDark ? '#94A3B8' : '#64748B' }}>
                  {item.label}
                </span>
                <span style={{ fontSize: '1.45rem', fontWeight: '850', color: isDark ? '#FFFFFF' : '#0F172A', letterSpacing: '-0.02em' }}>
                  {item.value}
                </span>
              </div>
            </div>
          ))}
        </motion.div>
      </div>

      {/* Scrollable Content */}
      <div style={{ flex: 1, padding: '0 0 24px 0', position: 'relative', zIndex: 10 }}>

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
                        <div
                          className={`pmCard ${!product.active ? 'pmCardInactive' : ''}`}
                          style={{
                            background: isDark
                              ? 'linear-gradient(165deg, #18191E 0%, #121316 100%)'
                              : '#FFFFFF',
                            border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #E2E8F0',
                            borderRadius: '24px',
                            padding: '20px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            boxShadow: isDark
                              ? '0 10px 30px -8px rgba(0, 0, 0, 0.5)'
                              : '0 4px 20px -2px rgba(15, 23, 42, 0.05), 0 0 1px 1px rgba(0, 0, 0, 0.02)',
                            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                            minHeight: showImages ? '220px' : 'auto',
                            position: 'relative'
                          }}
                        >
                          {showImages && (
                            <div style={{
                              width: '100%',
                              height: '140px',
                              borderRadius: '18px',
                              background: isDark ? '#141518' : '#F8FAFC',
                              border: isDark ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid #E2E8F0',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              overflow: 'hidden',
                              marginBottom: '14px',
                              position: 'relative'
                            }}>
                              {product.image_filename ? (
                                <img
                                  src={productsAPI.getImageUrl(product.image_filename, product.updated_at)}
                                  alt={product.name}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.3s ease' }}
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    e.target.nextSibling.style.display = 'flex';
                                  }}
                                />
                              ) : null}
                              <div style={{ display: product.image_filename ? 'none' : 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', color: isDark ? '#64748B' : '#94A3B8' }}>
                                <FiPackage size={28} />
                                <span style={{ fontSize: '11px', fontWeight: 600 }}>No Image</span>
                              </div>
                            </div>
                          )}

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, justifyContent: 'space-between' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                                <h4 style={{
                                  fontSize: '1.02rem',
                                  fontWeight: '800',
                                  margin: 0,
                                  color: isDark ? '#FFFFFF' : '#0F172A',
                                  letterSpacing: '-0.01em',
                                  lineHeight: 1.3
                                }}>
                                  {product.name}
                                </h4>
                                <motion.button
                                  whileHover={{ scale: 1.2 }}
                                  whileTap={{ scale: 0.85 }}
                                  onClick={(e) => { e.stopPropagation(); handleToggleFavorite(product); }}
                                  title={product.favorite ? 'Remove from Favorites' : 'Add to Favorites'}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: '2px',
                                    color: product.favorite ? '#EF4444' : (isDark ? '#64748B' : '#94A3B8'),
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                  }}
                                >
                                  <IconHeart filled={product.favorite} />
                                </motion.button>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                                <div style={{ fontSize: '1.18rem', fontWeight: '850', color: '#FF6B1A', letterSpacing: '-0.02em' }}>
                                  {formatCurrency(product.price)}
                                </div>
                                <div style={{
                                  fontSize: '0.68rem',
                                  fontWeight: '750',
                                  padding: '3px 9px',
                                  borderRadius: '999px',
                                  background: isDark ? 'rgba(255, 107, 26, 0.12)' : '#FFF7ED',
                                  border: isDark ? '1px solid rgba(255, 107, 26, 0.3)' : '1px solid #FDBA74',
                                  color: isDark ? '#FF8C42' : '#EA580C',
                                  letterSpacing: '0.04em',
                                  textTransform: 'uppercase'
                                }}>
                                  {product.category_name || product.category || 'Standard'}
                                </div>
                              </div>

                              {Array.isArray(product.variations) && product.variations.length > 0 && (
                                <div style={{ fontSize: '0.74rem', color: isDark ? '#94A3B8' : '#64748B', fontWeight: 650, marginTop: '4px' }}>
                                  {product.variations.length} variation{product.variations.length === 1 ? '' : 's'} available
                                </div>
                              )}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '10px', borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid #F1F5F9' }}>
                              <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                fontSize: '0.78rem',
                                padding: '6px 12px',
                                borderRadius: '10px',
                                background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#F8FAFC'
                              }}>
                                <span style={{ color: isDark ? '#94A3B8' : '#64748B', fontWeight: 600 }}>Stock</span>
                                <span style={{
                                  fontWeight: '800',
                                  color: (product.stock === 0 || product.stock_status === 'Out of Stock') ? '#EF4444' :
                                    product.stock_status === 'Low Stock' ? '#F59E0B' : '#10B981'
                                }}>
                                  {product.stock !== undefined ? product.stock : 'Active'}
                                </span>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: product.active ? '1fr 1fr' : '1fr 1fr', gap: '8px' }}>
                                <button
                                  className="pmActionBtn"
                                  onClick={() => handleEdit(product)}
                                  style={{
                                    height: '36px',
                                    borderRadius: '12px',
                                    background: isDark ? 'rgba(59, 130, 246, 0.1)' : '#EFF6FF',
                                    border: isDark ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid #BFDBFE',
                                    color: isDark ? '#60A5FA' : '#2563EB',
                                    fontWeight: 750,
                                    fontSize: '0.80rem',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px'
                                  }}
                                >
                                  <IconEdit /> Edit
                                </button>
                                {product.active ? (
                                  <button
                                    className="pmActionBtn"
                                    onClick={() => handleDisable(product)}
                                    title="Deactivate"
                                    style={{
                                      height: '36px',
                                      borderRadius: '12px',
                                      background: isDark ? 'rgba(245, 158, 11, 0.1)' : '#FFFBEB',
                                      border: isDark ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid #FDE68A',
                                      color: isDark ? '#FBBF24' : '#D97706',
                                      fontWeight: 750,
                                      fontSize: '0.80rem',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '6px'
                                    }}
                                  >
                                    <IconPower /> Disable
                                  </button>
                                ) : (
                                  <button
                                    className="pmActionBtn"
                                    onClick={() => handleReactivate(product)}
                                    title="Reactivate"
                                    style={{
                                      height: '36px',
                                      borderRadius: '12px',
                                      background: isDark ? 'rgba(16, 185, 129, 0.1)' : '#F0FDF4',
                                      border: isDark ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid #BBF7D0',
                                      color: isDark ? '#34D399' : '#16A34A',
                                      fontWeight: 750,
                                      fontSize: '0.80rem',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '6px'
                                    }}
                                  >
                                    <IconPower /> Enable
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
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
              backgroundColor: isDark ? 'rgba(0, 0, 0, 0.65)' : 'rgba(15, 23, 42, 0.45)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)'
            }}
          >
            <motion.div
              className="liquid-glass-card"
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.96 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'relative',
                width: '90%',
                maxWidth: '460px',
                padding: 'var(--spacing-8)',
                borderRadius: '24px',
                backgroundColor: isDark ? 'rgba(22, 26, 32, 0.95)' : '#FFFFFF',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: isDark ? '1px solid rgba(239, 68, 68, 0.25)' : '1.5px solid #FECACA',
                boxShadow: isDark
                  ? '0 25px 60px -10px rgba(0, 0, 0, 0.75), 0 0 1px 1px rgba(255, 255, 255, 0.08)'
                  : '0 20px 50px -10px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(226, 232, 240, 0.8)'
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-4)',
                marginBottom: 'var(--spacing-5)'
              }}>
                <div style={{
                  width: 'calc(58px * var(--display-zoom))',
                  height: 'calc(58px * var(--display-zoom))',
                  borderRadius: 'calc(18px * var(--display-zoom))',
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.14)' : '#FEF2F2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#EF4444',
                  border: isDark ? '1px solid rgba(239, 68, 68, 0.25)' : '1.5px solid #FECACA',
                  flexShrink: 0
                }}>
                  <IconTrash style={{ width: 'calc(24px * var(--display-zoom))', height: 'calc(24px * var(--display-zoom))' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{
                    margin: 0,
                    color: isDark ? '#FFFFFF' : '#0F172A',
                    fontSize: 'calc(var(--text-xl) * 1)',
                    fontWeight: '700',
                    letterSpacing: '-0.01em',
                    lineHeight: '1.3'
                  }}>
                    Permanent Deletion
                  </h3>
                  <p style={{
                    margin: 'calc(var(--spacing-1) * 1) 0 0 0',
                    color: isDark ? '#94A3B8' : '#64748B',
                    fontSize: 'calc(var(--text-sm) * 1)',
                    fontWeight: '600'
                  }}>
                    Admin authentication required
                  </p>
                </div>
              </div>

              <div style={{ marginBottom: 'var(--spacing-6)' }}>
                <p style={{
                  color: isDark ? '#CBD5E1' : '#334155',
                  fontSize: 'var(--text-base)',
                  lineHeight: '1.6',
                  margin: '0 0 var(--spacing-4) 0',
                  fontWeight: '400'
                }}>
                  You are about to <strong style={{ color: '#EF4444', fontWeight: '700' }}>permanently delete</strong> "{itemToDelete?.name}".
                </p>

                <div style={{
                  background: isDark ? 'rgba(239, 68, 68, 0.08)' : '#FEF2F2',
                  border: isDark ? '1px solid rgba(239, 68, 68, 0.2)' : '1.5px solid #FECACA',
                  padding: 'var(--spacing-3)',
                  borderRadius: 'var(--radius-lg)',
                  marginTop: 'var(--spacing-3)',
                  fontSize: 'var(--text-sm)',
                  color: isDark ? '#F87171' : '#B91C1C',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 'var(--spacing-2)'
                }}>
                  <span style={{ fontSize: '1rem', marginTop: '1px' }}>⚠️</span>
                  <div>
                    <strong style={{ display: 'block', marginBottom: 'var(--spacing-1)', fontWeight: '700' }}>
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
                    fontWeight: '600',
                    color: isDark ? '#F1F5F9' : '#0F172A'
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
                      border: error && error.includes('Password')
                        ? '1px solid var(--error-500)'
                        : isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1.5px solid #CBD5E1',
                      background: isDark ? '#1C1D22' : '#F8FAFC',
                      color: isDark ? '#FFFFFF' : '#0F172A',
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
                        e.target.style.borderColor = isDark ? 'rgba(255, 255, 255, 0.1)' : '#CBD5E1';
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
                    padding: 'calc(10px * var(--display-zoom)) calc(20px * var(--display-zoom))',
                    fontSize: 'var(--text-sm)',
                    fontWeight: '600',
                    borderRadius: '14px',
                    background: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
                    color: isDark ? '#E2E8F0' : '#334155',
                    border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1.5px solid #CBD5E1',
                    cursor: 'pointer',
                    boxShadow: isDark ? 'none' : '0 1px 2px rgba(15, 23, 42, 0.04)',
                    transition: 'all var(--transition-normal) var(--ease-out)'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmPermanentDelete}
                  style={{
                    padding: 'calc(10px * var(--display-zoom)) calc(22px * var(--display-zoom))',
                    fontSize: 'var(--text-sm)',
                    fontWeight: '700',
                    borderRadius: '14px',
                    background: '#EF4444',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all var(--transition-normal) var(--ease-out)',
                    boxShadow: '0 4px 14px rgba(239, 68, 68, 0.35)'
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
        {/* Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'products' && (
            <motion.div
              key="products"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
              style={{ width: '100%' }}
            >
              <ProductManagement activeTab={activeTab} setActiveTab={setActiveTab} />
            </motion.div>
          )}
          {activeTab === 'groups' && (
            <motion.div
              key="groups"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
              style={{ width: '100%' }}
            >
              <GroupManagement activeTab={activeTab} setActiveTab={setActiveTab} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageContainer>
  );
};

export default Management;
