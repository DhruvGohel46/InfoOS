import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { useSettings } from '../../context/SettingsContext';
import { useAlert } from '../../context/AlertContext';
import { usePOSData } from '../../context/POSDataContext';
import { useNetwork } from '../../context/NetworkContext';
import { useDebounce } from '../../hooks/useDebounce';
import { productsAPI, billingAPI, groupsAPI, categoriesAPI } from '../../utils/api';
import { syncService } from '../../api/sync';
import { handleAPIError, formatCurrency } from '../../utils/api';
import { printerService } from '../../services/printerService';
import Button from '../ui/Button';
import Card from '../ui/Card';
import SearchBar from '../ui/SearchBar';
import VariationPickerModal from '../billing/VariationPickerModal';
import GroupSelector from '../common/GroupSelector';
import {
  IoSaveOutline,
  IoPrintOutline,
  IoReceiptOutline,
  IoDocumentTextOutline,
  IoMoveOutline,
  IoCheckmarkDoneOutline,
  IoCloseOutline,
  IoCreateOutline,
  IoRestaurantOutline,
  IoCheckmarkCircle,
  IoTimeOutline,
  IoRefreshOutline,
  IoArrowForward
} from 'react-icons/io5';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import {
  buildCartItem,
  formatProductPriceLabel,
  getCartLineKey,
  getProductVariations,
  mapBillPayloadItems,

} from '../../utils/productVariations';
import '../../styles/Management.css';

const TrashIcon = ({ color }) => (

  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color }}>

    <path d="M3 6H5H21M8 6V20C8 21.1046 8.89543 22 10 22H14C15.1046 22 16 21.1046 16 20V6M19 6V20C19 21.1046 19.1046 22 18 22H10C8.89543 22 8 21.1046 8 20V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

    <path d="M10 11L14 11M10 15L14 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

  </svg>

);



// ── Category Color System for Favorites & POS ──
const CATEGORY_COLORS = [
  { hex: '#10B981', name: 'Emerald' },
  { hex: '#0284C7', name: 'Sky' },
  { hex: '#8B5CF6', name: 'Violet' },
  { hex: '#F59E0B', name: 'Amber' },
  { hex: '#EC4899', name: 'Pink' },
  { hex: '#0D9488', name: 'Teal' },
  { hex: '#F43F5E', name: 'Rose' },
  { hex: '#6366F1', name: 'Indigo' },
  { hex: '#FF6B1A', name: 'Orange' },
  { hex: '#06B6D4', name: 'Cyan' },
  { hex: '#16A34A', name: 'Green' },
  { hex: '#A855F7', name: 'Purple' },
  { hex: '#2563EB', name: 'Blue' },
  { hex: '#E11D48', name: 'Crimson' },
  { hex: '#D97706', name: 'Ochre' },
  { hex: '#059669', name: 'Forest' }
];

const getCategoryColor = (category, allCategories = []) => {
  if (!category) {
    return { hex: '#64748B', name: 'Slate' };
  }
  if (category.color && typeof category.color === 'string' && category.color.startsWith('#')) {
    return { hex: category.color, name: category.name || 'Custom' };
  }
  const cleanCats = Array.isArray(allCategories)
    ? allCategories.filter(c => c && c.id !== 'favorites')
    : [];
  const catIdx = cleanCats.findIndex(
    c => c && (String(c.id) === String(category.id) || c.name === category.name)
  );
  if (catIdx !== -1) {
    return CATEGORY_COLORS[catIdx % CATEGORY_COLORS.length];
  }
  const str = String(category.name || category.id || '');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return CATEGORY_COLORS[Math.abs(hash) % CATEGORY_COLORS.length];
};

const WorkingPOSInterface = ({ onBillCreated }) => {
  const { currentTheme, isDark } = useTheme();

  const { settings } = useSettings();

  const { showSuccess, showWarning } = useAlert();

  const { isOnline } = useNetwork();



  // ── POS Data from global context (load-once pattern) ──

  const {

    products: bootstrapProducts,

    categories: bootstrapCategories,

    bootstrapLoading,

    refreshProducts,

    checkCatalogVersion,

    refreshAll

  } = usePOSData();



  const [products, setProducts] = useState([]);

  const [categories, setCategories] = useState([{ id: 'favorites', name: '★ Favorites' }]);

  const [groups, setGroups] = useState([]);

  const [selectedGroupId, setSelectedGroupId] = useState(() => localStorage.getItem('lastSelectedGroupId') || 'all');

  const [orderType, setOrderType] = useState('dine-in');

  const [tableNumber, setTableNumber] = useState('');

  const [kotNumber, setKotNumber] = useState('');

  const [customerName, setCustomerName] = useState('');

  const [customerMobile, setCustomerMobile] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('paid'); // 'paid' | 'pending'
  const [activeField, setActiveField] = useState('table'); // 'table' | 'kot' | 'customer' | 'mobile'

  const [selectedCategory, setSelectedCategory] = useState('favorites');

  const [searchTerm, setSearchTerm] = useState('');

  const debouncedSearch = useDebounce(searchTerm, 300); // Debounced search

  const [visibleCount, setVisibleCount] = useState(50); // For lazy rendering

  const [orderItems, setOrderItems] = useState([]);

  const observerTarget = useRef(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState('');

  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const [isPrinting, setIsPrinting] = useState(false);

  const [printStatus, setPrintStatus] = useState('');

  const [variationModalProduct, setVariationModalProduct] = useState(null);



  // Edit Mode State

  const location = useLocation();

  const navigate = useNavigate();

  const [editingBill, setEditingBill] = useState(null);

  // Recent 5 Bills Modal State & Logic
  const [showRecentBills, setShowRecentBills] = useState(false);
  const [recentBills, setRecentBills] = useState([]);
  const [loadingRecentBills, setLoadingRecentBills] = useState(false);

  const fetchRecentBills = async () => {
    try {
      setLoadingRecentBills(true);
      const res = await billingAPI.getTodayBills();
      const allBills = res.data?.bills || [];
      const sorted = [...allBills].sort((a, b) => {
        if (b.bill_no && a.bill_no) return b.bill_no - a.bill_no;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      });
      setRecentBills(sorted.slice(0, 5));
    } catch (err) {
      console.error('Failed to fetch recent bills:', err);
      showWarning('Could not load recent bills');
    } finally {
      setLoadingRecentBills(false);
    }
  };

  const handleOpenRecentBills = () => {
    fetchRecentBills();
    setShowRecentBills(true);
  };

  const handleSelectRecentBill = (bill) => {
    let parsedItems = [];
    try {
      const rawItems = bill.items || bill.products || [];
      parsedItems = typeof rawItems === 'string' ? JSON.parse(rawItems) : rawItems;
    } catch (e) {
      parsedItems = [];
    }

    setEditingBill(bill);
    setOrderItems((parsedItems || []).map((item) => ({
      ...item,
      line_key: getCartLineKey(item.product_id, item.variation_id),
    })));

    setOrderType(bill.order_type || 'dine-in');
    setTableNumber(bill.table_no || '');
    setCustomerName(bill.customer_name || '');
    setCustomerMobile(bill.customer_mobile || bill.customer_phone || '');
    const loadedStatus = String(bill.payment_status || (bill.amount_pending > 0 ? 'pending' : 'paid')).toLowerCase();
    setPaymentStatus(loadedStatus === 'pending' ? 'pending' : 'paid');
    setKotNumber(bill.kot_no || bill.custom_kot_no || '');

    setShowRecentBills(false);
    showSuccess(`Loaded Bill ${bill.bill_no} for editing`);
  };

  const formatBillTime = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr.replace(' ', 'T'));
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return dateStr;
    }
  };

  // Ref to prevent multiple rapid clicks
  const lastClickTime = useRef(0);



  // Check catalog version on mount/load

  useEffect(() => {

    if (checkCatalogVersion) {

      checkCatalogVersion();

    }

  }, [checkCatalogVersion]);



  // Track active cart and printing tasks for update manager safety guards

  useEffect(() => {

    if (!window.posActiveTasks) window.posActiveTasks = new Set();

    if (orderItems.length > 0) {

      window.posActiveTasks.add('cart');

    } else {

      window.posActiveTasks.delete('cart');

    }

  }, [orderItems]);



  useEffect(() => {

    if (!window.posActiveTasks) window.posActiveTasks = new Set();

    if (isPrinting) {

      window.posActiveTasks.add('printing');

    } else {

      window.posActiveTasks.delete('printing');

    }

  }, [isPrinting]);

  // ── Edit Layout Mode States & Functions ──
  const [isEditMode, setIsEditMode] = useState(false);
  const [editableCategories, setEditableCategories] = useState([]);
  const [editableProducts, setEditableProducts] = useState([]);
  const [draggedProductId, setDraggedProductId] = useState(null);
  const [savingLayout, setSavingLayout] = useState(false);

  const startEditMode = () => {
    // Categories: filter out favorites, and filter by selected group if not 'all'
    let activeCats = bootstrapCategories.filter(c => c.id !== 'favorites');
    if (selectedGroupId !== 'all') {
      activeCats = activeCats.filter(c => c.group_id === parseInt(selectedGroupId));
    }
    setEditableCategories(activeCats);

    // Products: filter products for the current selected category & group
    const showAllAsFavorite = settings?.show_all_as_favorite === 'true';
    const activeProds = products.filter(product => {
      let groupMatch = true;
      if (selectedGroupId !== 'all') {
        const pCat = bootstrapCategories.find(c => c.id === product.category_id || c.name === product.category);
        groupMatch = pCat ? pCat.group_id === parseInt(selectedGroupId) : false;
      }

      let categoryMatch;
      if (selectedCategory === 'favorites') {
        categoryMatch = showAllAsFavorite ? true : !!product.favorite;
      } else {
        categoryMatch = product.category_id === selectedCategory || product.category === selectedCategory;
      }

      return categoryMatch && groupMatch;
    });

    setEditableProducts(activeProds);
    setIsEditMode(true);
  };

  const cancelEditMode = () => {
    setIsEditMode(false);
    setEditableCategories([]);
    setEditableProducts([]);
  };

  const saveLayout = async () => {
    try {
      setSavingLayout(true);

      const categoryOrders = editableCategories.map((cat, index) => ({
        id: cat.id,
        display_order: index
      }));

      const productOrders = editableProducts.map((prod, index) => ({
        product_id: prod.product_id,
        display_order: index
      }));

      const promises = [];
      if (categoryOrders.length > 0) {
        promises.push(categoriesAPI.reorderCategories(categoryOrders));
      }
      if (productOrders.length > 0) {
        promises.push(productsAPI.reorderProducts(productOrders));
      }

      if (promises.length > 0) {
        await Promise.all(promises);
      }

      await refreshAll();
      showSuccess('Layout reordered successfully');
      setIsEditMode(false);
    } catch (err) {
      console.error('Failed to save layout order:', err);
      showWarning(err.message || 'Failed to save layout reordering');
    } finally {
      setSavingLayout(false);
    }
  };

  const handleProductDragStart = (e, productId) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', productId);
    setDraggedProductId(productId);
  };

  const handleProductDragOver = (e, targetId) => {
    e.preventDefault();
    if (!draggedProductId || draggedProductId === targetId) return;

    const draggedIndex = editableProducts.findIndex(p => p.product_id === draggedProductId);
    const targetIndex = editableProducts.findIndex(p => p.product_id === targetId);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      const updatedProducts = [...editableProducts];
      const [removed] = updatedProducts.splice(draggedIndex, 1);
      updatedProducts.splice(targetIndex, 0, removed);
      setEditableProducts(updatedProducts);
    }
  };

  const handleProductDragEnd = () => {
    setDraggedProductId(null);
  };





  // ── Sync from bootstrap context ──

  useEffect(() => {

    if (bootstrapProducts.length > 0) {

      setProducts(bootstrapProducts);

      setLoading(false);

    }

  }, [bootstrapProducts]);



  // Load groups on mount

  useEffect(() => {

    const loadGroups = async () => {

      try {

        const response = await groupsAPI.getAllGroups(false); // active only

        setGroups(response.data.groups || []);

      } catch (err) {

        console.error('Failed to load groups in POS:', err);

      }

    };

    loadGroups();

  }, []);



  // Save selected group to localStorage

  useEffect(() => {

    localStorage.setItem('lastSelectedGroupId', selectedGroupId);

  }, [selectedGroupId]);



  // ── Auto-Open Default Group on Idle Timeout ──
  useEffect(() => {
    if (settings?.idle_timeout_enabled !== 'true' || !settings?.default_group_id) {
      return;
    }

    const defaultGroupId = settings.default_group_id.toString();
    const timeoutMinutes = parseInt(settings.idle_timeout_minutes, 10) || 5;
    const timeoutMs = Math.max(1, timeoutMinutes) * 60 * 1000;

    let timerId = null;

    const resetTimer = () => {
      if (timerId) clearTimeout(timerId);

      timerId = setTimeout(() => {
        // Trigger condition: cart/orderItems is empty AND no active modal open AND not already default group
        const isCartEmpty = orderItems.length === 0;
        const hasOpenModal = Boolean(
          variationModalProduct || showClearConfirm || isPrinting || editingBill
        );
        const isAlreadyDefault = (selectedGroupId || '').toString() === defaultGroupId;

        if (isCartEmpty && !hasOpenModal) {
          if (!isAlreadyDefault) {
            // Verify default group is active
            const isGroupValid =
              groups.length === 0 ||
              groups.some((g) => g.id.toString() === defaultGroupId && g.is_active !== false);
            if (isGroupValid) {
              setSelectedGroupId(defaultGroupId);
            }
          }
        } else {
          // If cart has items or modal is open, do not auto-switch; reset timer
          resetTimer();
        }
      }, timeoutMs);
    };

    // User activity listeners
    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    const handleActivity = () => {
      resetTimer();
    };

    activityEvents.forEach((evt) => window.addEventListener(evt, handleActivity, { passive: true }));
    resetTimer();

    return () => {
      if (timerId) clearTimeout(timerId);
      activityEvents.forEach((evt) => window.removeEventListener(evt, handleActivity));
    };
  }, [
    settings?.idle_timeout_enabled,
    settings?.default_group_id,
    settings?.idle_timeout_minutes,
    orderItems.length,
    selectedGroupId,
    groups,
    variationModalProduct,
    showClearConfirm,
    isPrinting,
    editingBill,
  ]);



  // ── Keyboard shortcut to cycle Categories (Tab key / Shift+Tab) ──

  useEffect(() => {

    const handleKeyDown = (e) => {

      // Ignore keypress if user is currently typing in an input, textarea, or contenteditable element

      const activeElem = document.activeElement;

      const isTyping = activeElem && (

        activeElem.tagName === 'INPUT' ||

        activeElem.tagName === 'TEXTAREA' ||

        activeElem.isContentEditable

      );

      if (isTyping) return;



      if (e.key === 'Tab') {

        if (!categories || categories.length === 0) return;

        e.preventDefault();



        setSelectedCategory((prevCategory) => {

          const currentIndex = categories.findIndex(

            c => c.id.toString() === (prevCategory !== null && prevCategory !== undefined ? prevCategory.toString() : '')

          );



          if (currentIndex === -1) {

            return categories[0].id;

          } else {

            const step = e.shiftKey ? -1 : 1;

            const nextIndex = (currentIndex + step + categories.length) % categories.length;

            return categories[nextIndex].id;

          }

        });

      }

    };



    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);

  }, [categories]);



  // Filter categories based on selected group

  useEffect(() => {

    let filtered = [...bootstrapCategories];

    if (selectedGroupId !== 'all') {

      filtered = bootstrapCategories.filter(c => c.group_id === parseInt(selectedGroupId));

    }



    const nextCategories = [

      { id: 'favorites', name: '★ Favorites' },

      ...filtered.map(c => ({ id: c.id, name: c.name }))

    ];

    setCategories(nextCategories);



    // If the currently selected category is not in the new categories list,

    // default back to 'favorites'

    const exists = nextCategories.some(c => c.id === selectedCategory);

    if (!exists) {

      setSelectedCategory('favorites');

    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrapCategories, selectedGroupId, selectedCategory]);



  useEffect(() => {

    setLoading(bootstrapLoading);

  }, [bootstrapLoading]);



  // Set default order type from settings

  useEffect(() => {

    if (!editingBill && settings && settings.default_order_type) {

      setOrderType(settings.default_order_type);

    }

  }, [settings, editingBill]);



  useEffect(() => {
    // Check for edit mode
    if (location.state?.bill) {
      const bill = location.state.bill;
      setEditingBill(bill);

      let parsedItems = [];
      try {
        const rawItems = bill.items || bill.products || [];
        parsedItems = typeof rawItems === 'string' ? JSON.parse(rawItems) : rawItems;
      } catch (e) {
        parsedItems = [];
      }

      setOrderItems((parsedItems || []).map((item) => ({
        ...item,
        line_key: getCartLineKey(item.product_id, item.variation_id),
      })));

      setOrderType(bill.order_type || 'dine-in');
      setTableNumber(bill.table_no || '');
      setCustomerName(bill.customer_name || '');
      setCustomerMobile(bill.customer_mobile || bill.customer_phone || '');
      const loadedStatus = String(bill.payment_status || (bill.amount_pending > 0 ? 'pending' : 'paid')).toLowerCase();
      setPaymentStatus(loadedStatus === 'pending' ? 'pending' : 'paid');
      setKotNumber(bill.kot_no || bill.custom_kot_no || '');

      // Clear location state so that it doesn't reload on subsequent clicks/refreshes
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);



  // Recalculate cart item prices when order type changes

  useEffect(() => {

    if (orderItems.length === 0) return;



    setOrderItems(prevItems =>

      prevItems.map(item => {

        const product = products.find(p => p.product_id === item.product_id);

        if (!product) return item;



        const variation = item.variation_id

          ? product.variations?.find(v => v.id === item.variation_id)

          : null;



        const isTakeaway = orderType === 'takeaway';

        const takeawayAddon = isTakeaway && product.takeaway_price ? Number(product.takeaway_price) : 0;

        const basePrice = variation ? Number(variation.price) : Number(product.price);

        const newPrice = basePrice + takeawayAddon;



        return {

          ...item,

          price: newPrice

        };

      })

    );

  }, [orderType, products, orderItems.length]);







  const filteredProducts = products.filter(product => {
    let categoryMatch;

    // Group filter match
    let groupMatch = true;
    if (selectedGroupId !== 'all') {
      // Find category of the product to check if it belongs to selected group
      const pCat = bootstrapCategories.find(c => c.id === product.category_id || c.name === product.category);
      groupMatch = pCat ? pCat.group_id === parseInt(selectedGroupId) : false;
    }

    if (selectedCategory === 'favorites') {
      const showAllAsFavorite = settings?.show_all_as_favorite === 'true';
      categoryMatch = showAllAsFavorite ? true : !!product.favorite;
      // Filter favorites by group
      categoryMatch = categoryMatch && groupMatch;
    } else {
      categoryMatch = product.category_id === selectedCategory ||
        product.category === selectedCategory;
      // Normally group filter aligns with selectedCategory because categories are filtered, but check anyway
      categoryMatch = categoryMatch && groupMatch;
    }

    const searchMatch = product.name.toLowerCase().includes(debouncedSearch.toLowerCase());
    return categoryMatch && searchMatch;
  });

  const displayedProducts = filteredProducts.slice(0, visibleCount);



  // Reset visible count when filters change

  useEffect(() => {

    setVisibleCount(50);

  }, [debouncedSearch, selectedCategory]);



  // Intersection Observer for infinite scrolling

  useEffect(() => {

    const currentTarget = observerTarget.current;

    const observer = new IntersectionObserver(

      entries => {

        if (entries[0].isIntersecting) {

          setVisibleCount(prev => Math.min(prev + 50, filteredProducts.length));

        }

      },

      { threshold: 0.1 }

    );



    if (currentTarget) {

      observer.observe(currentTarget);

    }



    return () => {

      if (currentTarget) {

        observer.unobserve(currentTarget);

      }

    };

  }, [filteredProducts.length]);



  const handleAddItem = (product, event, selectedVariation = null) => {

    // Prevent event bubbling

    if (event) {

      event.stopPropagation();

      event.preventDefault();

    }



    if (product.stock_status === 'Out of Stock') return;



    const now = Date.now();



    // Prevent multiple clicks within 200ms

    if (now - lastClickTime.current < 200) {

      return;

    }



    lastClickTime.current = now;



    const productVariations = getProductVariations(product);



    if (!selectedVariation && productVariations.length === 1) {

      selectedVariation = productVariations[0];

    }



    if (!selectedVariation && productVariations.length >= 3) {

      setVariationModalProduct(product);

      return;

    }



    setVariationModalProduct(null);



    const cartItem = buildCartItem(product, selectedVariation, orderType);

    const lineKey = cartItem.line_key || getCartLineKey(product.product_id, selectedVariation?.id);



    setOrderItems(prev => {

      const existingIndex = prev.findIndex(item => (

        item.line_key

          ? item.line_key === lineKey

          : getCartLineKey(item.product_id, item.variation_id) === lineKey

      ));



      if (existingIndex >= 0) {

        const updated = [...prev];

        updated[existingIndex].quantity += 1;

        return updated;

      }



      return [...prev, cartItem];

    });

  };



  const handleVariationSelect = (product, variation) => {

    handleAddItem(product, null, variation);

  };



  const updateQuantity = (lineKey, quantity) => {

    if (quantity <= 0) {

      setOrderItems(prev => prev.filter(item => (

        item.line_key

          ? item.line_key !== lineKey

          : getCartLineKey(item.product_id, item.variation_id) !== lineKey

      )));

    } else {

      setOrderItems(prev =>

        prev.map(item => {

          const itemKey = item.line_key || getCartLineKey(item.product_id, item.variation_id);

          return itemKey === lineKey ? { ...item, quantity } : item;

        })

      );

    }

  };



  const calculateTotal = () => {

    return orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  };



  const handleSaveOrder = async () => {

    if (orderItems.length === 0) {

      setError('Please add items to the order');

      return;

    }



    try {

      setError('');



      const billData = {
        products: mapBillPayloadItems(orderItems),
        print: false,
        customer_name: customerName || (editingBill ? editingBill.customer_name : ''),
        customer_mobile: customerMobile || (editingBill ? editingBill.customer_mobile || editingBill.customer_phone : ''),
        order_type: orderType,
        table_no: tableNumber || (editingBill ? editingBill.table_no : ''),
        payment_status: paymentStatus,
        payment_method: editingBill?.payment_method || 'CASH',
        amount_paid: paymentStatus === 'paid' ? calculateTotal() : 0,
        amount_pending: paymentStatus === 'pending' ? calculateTotal() : 0,
        kot_no: kotNumber,
        custom_kot_no: kotNumber
      };

      if (editingBill) {
        await billingAPI.updateBill(editingBill.bill_no, billData);
        showSuccess(`Bill #${editingBill.bill_no} updated successfully`);
        window.dispatchEvent(new CustomEvent('bill-updated', { detail: { bill_no: editingBill.bill_no, payment_status: paymentStatus } }));
        window.dispatchEvent(new CustomEvent('live-orders-refresh'));
        if (location.state?.from) {
          navigate(location.state.from);
        } else {
          resetBillState();
        }
      } else {
        // Handle Offline State
        if (!isOnline) {
          syncService.addToQueue(billData);
          resetBillState();
          showWarning('You are offline. Bill saved locally and will sync automatically.');
          if (onBillCreated) {
            onBillCreated({
              bill_no: 'OFFLINE',
              total: calculateTotal()
            });
          }
          return;
        }

        const response = await billingAPI.createBill(billData);
        resetBillState();
        const createdBillData = { ...response.data.bill, milestone: response.data.milestone };
        window.dispatchEvent(new CustomEvent('bill-created', { detail: createdBillData }));
        if (response.data.milestone && response.data.milestone.reached) {
          window.dispatchEvent(new CustomEvent('celebrate-order-milestone', { detail: response.data.milestone }));
        }
        window.dispatchEvent(new CustomEvent('live-orders-refresh'));
        if (onBillCreated) {
          onBillCreated({
            bill_no: response.data.bill.bill_no,
            total: calculateTotal()
          });
        }
        // Refresh stock levels via global context (single targeted refresh)

        refreshProducts();

      }



    } catch (err) {

      const isNetworkError = !err.response;

      if (isNetworkError && !editingBill) {

        // Fallback catch if network drops mid-request

        const billData = {

          products: mapBillPayloadItems(orderItems),

          print: false,

          customer_name: customerName || '',

          customer_mobile: customerMobile || '',

          order_type: orderType,

          table_no: tableNumber || '',

          kot_no: kotNumber,

          custom_kot_no: kotNumber

        };

        syncService.addToQueue(billData);

        resetBillState();

        showWarning('Network dropped. Bill saved locally and will sync automatically.');

        return;

      }



      const apiError = handleAPIError(err);

      setError(apiError.message);

    }

  };



  const handlePrintOnly = async (billNo, type = 'bill') => {

    try {

      setIsPrinting(true);

      setPrintStatus(type === 'bill' ? 'Printing Bill...' : 'Printing KOT...');

      const printOpts = {
        kot_no: kotNumber,
        customer_name: customerName,
        customer_mobile: customerMobile,
        table_no: tableNumber
      };

      if (type === 'bill') {

        await printerService.printBill(billNo, printOpts);

      } else {

        await printerService.printKOT(billNo, printOpts);

      }



      showSuccess(`${type.toUpperCase()} printed successfully`);

    } catch (err) {

      showWarning(err.message || 'Printer error. Please check connections.');

    } finally {

      setIsPrinting(false);

      setPrintStatus('');

    }

  };



  const handleBillAndKOT = async (billNo) => {

    try {

      setIsPrinting(true);

      setPrintStatus('Printing Bill...');

      const printOpts = {
        kot_no: kotNumber,
        customer_name: customerName,
        customer_mobile: customerMobile,
        table_no: tableNumber
      };

      await printerService.printBill(billNo, printOpts);



      setPrintStatus('Preparing KOT...');

      await printerService.printKOT(billNo, printOpts);



      showSuccess('Bill & KOT printed successfully');

    } catch (err) {

      showWarning(err.message || 'Sequence interrupted. Check printer.');

    } finally {

      setIsPrinting(false);

      setPrintStatus('');

    }

  };



  const handleSaveAndPrintOrder = async (mode = 'both') => {

    if (orderItems.length === 0) {

      setError('Please add items to the order');

      return;

    }



    try {

      setError('');

      setIsPrinting(true);

      setPrintStatus('Saving Bill...');



      const billData = {
        products: mapBillPayloadItems(orderItems),
        print: false, // We handle printing manually for better control
        customer_name: customerName || (editingBill ? editingBill.customer_name : ''),
        customer_mobile: customerMobile || (editingBill ? editingBill.customer_mobile || editingBill.customer_phone : ''),
        order_type: orderType,
        table_no: tableNumber || (editingBill ? editingBill.table_no : ''),
        payment_status: paymentStatus,
        payment_method: editingBill?.payment_method || 'CASH',
        amount_paid: paymentStatus === 'paid' ? calculateTotal() : 0,
        amount_pending: paymentStatus === 'pending' ? calculateTotal() : 0,
        kot_no: kotNumber,
        custom_kot_no: kotNumber
      };

      let billNo;
      if (editingBill) {
        await billingAPI.updateBill(editingBill.bill_no, billData);
        billNo = editingBill.bill_no;
        window.dispatchEvent(new CustomEvent('bill-updated', { detail: { bill_no: editingBill.bill_no, payment_status: paymentStatus } }));
        window.dispatchEvent(new CustomEvent('live-orders-refresh'));
      } else {
        if (!isOnline) {
          syncService.addToQueue(billData);
          resetBillState();
          showWarning('Offline mode. Bill saved locally.');
          return;
        }

        const response = await billingAPI.createBill(billData);
        billNo = response.data.bill.bill_no;
        const createdBillData = { ...response.data.bill, milestone: response.data.milestone };
        window.dispatchEvent(new CustomEvent('bill-created', { detail: createdBillData }));
        if (response.data.milestone && response.data.milestone.reached) {
          window.dispatchEvent(new CustomEvent('celebrate-order-milestone', { detail: response.data.milestone }));
        }
        window.dispatchEvent(new CustomEvent('live-orders-refresh'));
      }

      // Execute Printing Workflow
      if (mode === 'both') {
        await handleBillAndKOT(billNo);
      } else if (mode === 'bill') {
        await handlePrintOnly(billNo, 'bill');
      } else if (mode === 'kot') {
        await handlePrintOnly(billNo, 'kot');
      }

      resetBillState();
      if (onBillCreated && !editingBill) {
        onBillCreated({ bill_no: billNo, total: calculateTotal() });
      }
      if (editingBill) {
        if (location.state?.from) {
          navigate(location.state.from);
        } else {
          resetBillState();
        }
      }



    } catch (err) {

      const apiError = handleAPIError(err);

      setError(apiError.message);

    } finally {

      setIsPrinting(false);

      setPrintStatus('');

    }

  };



  const handleClearClick = () => {

    if (orderItems.length > 0) {

      setShowClearConfirm(true);

    }

  };



  const resetBillState = () => {
    setOrderItems([]);
    setOrderType(settings?.default_order_type || 'dine-in');
    setTableNumber('');
    setKotNumber('');
    setCustomerName('');
    setCustomerMobile('');
    setPaymentStatus('paid');
    setActiveField('table');
    setEditingBill(null);
  };

  const confirmClear = () => {
    resetBillState();
    setEditingBill(null);
    setShowClearConfirm(false);
  };



  const cancelClear = () => {

    setShowClearConfirm(false);

  };



  // Helper function to get product count for a category
  // eslint-disable-next-line no-unused-vars
  const getCategoryProductCount = (categoryName) => {

    if (categoryName === '★ Favorites') {

      return products.filter(p => p.favorite).length;

    }

    const categoryProducts = products.filter(

      product => product.category_id === categoryName || product.category === categoryName

    );

    return categoryProducts.length;

  };



  const mainContainerStyle = {

    display: 'flex',

    height: '100%',

    backgroundColor: 'transparent', // Allow global background to show through

    fontFamily: currentTheme.typography.fontFamily.primary,

    overflow: 'hidden',

    boxSizing: 'border-box',

  };



  // Calculate dynamic width based on the longest category name, clamped between a minimum and maximum width
  const dynamicSidebarWidth = useMemo(() => {
    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (context) {
        context.font = '500 14px sans-serif';
        let maxTextWidth = 0;
        categories.forEach(cat => {
          const text = cat.name || '';
          const metrics = context.measureText(text);
          if (metrics.width > maxTextWidth) {
            maxTextWidth = metrics.width;
          }
        });
        // 20px (sidebar padding: 10px each side) + 24px (button padding: 12px each side) + 16px (dot/gap) + 12px safety/scrollbar
        const totalNeeded = Math.ceil(maxTextWidth + 72);
        const clamped = Math.min(Math.max(totalNeeded, 136), 210);
        return `calc(${clamped}px * var(--display-zoom))`;
      }
    } catch (e) {
      // fallback
    }
    let maxLen = 10;
    categories.forEach(cat => {
      if (cat.name && cat.name.length > maxLen) maxLen = cat.name.length;
    });
    const clamped = Math.min(Math.max(Math.round(maxLen * 8 + 68), 136), 210);
    return `calc(${clamped}px * var(--display-zoom))`;
  }, [categories]);

  const leftSidebarStyle = {
    width: dynamicSidebarWidth,
    minWidth: 'calc(136px * var(--display-zoom))',
    maxWidth: 'calc(210px * var(--display-zoom))',
    background: isDark ? 'linear-gradient(180deg, #1E1E22 0%, #17171A 100%)' : '#FFFFFF',
    borderRight: isDark ? '1px solid var(--glass-border)' : '1px solid #E2E8F0',
    boxShadow: isDark ? 'none' : '2px 0 10px rgba(15, 23, 42, 0.04)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    zIndex: 2,
    flexShrink: 0,
    boxSizing: 'border-box',
    transition: 'width 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
  };

  const middleSectionStyle = {
    flex: 1,
    padding: currentTheme.spacing[6],
    overflowY: 'auto',
    height: '100%',
    backgroundColor: isDark ? '#0f0f11' : '#F1F5F9', // High contrast background so white product cards stand out
  };








  return (

    <div style={mainContainerStyle}>

      <div className="glass-sidebar" style={leftSidebarStyle}>

        <div style={{
          padding: '16px 10px',
          borderBottom: '1px solid var(--glass-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          minWidth: 0,
          width: '100%',
          boxSizing: 'border-box'
        }}>
          <div style={{
            position: 'relative',
            width: '100%',
            minWidth: 0
          }}>
            <SearchBar
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Search..."
              style={{
                height: '42px',
                borderRadius: '12px',
                background: isDark ? 'rgba(255,255,255,0.05)' : '#F8FAFC',
                border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #CBD5E1',
                boxShadow: isDark ? 'none' : 'inset 0 1px 2px rgba(15, 23, 42, 0.04)'
              }}
            />
          </div>
        </div>

        <div className="pos-sidebar-scroll" style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '0 10px 16px 10px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
            marginTop: '16px',
            paddingLeft: '4px'
          }}>
            <h4 style={{
              fontSize: '13px',
              fontWeight: '600',
              letterSpacing: '0.5px',
              color: 'var(--text-secondary)',
              margin: 0
            }}>Categories</h4>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {isEditMode ? (
              <>
                {/* Favorites is always static and not draggable */}
                <div
                  className="rounded-lg glass-card"
                  style={{
                    position: 'relative',
                    width: '100%',
                    minHeight: '40px',
                    height: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    backgroundColor: selectedCategory === 'favorites' ? (isDark ? '#2B2B2B' : '#E2E8F0') : (isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'),
                    border: isDark ? '1px solid rgba(255,255,255,0.04)' : '1px solid #E2E8F0',
                    borderRadius: '14px',
                    color: 'var(--text-muted)',
                    opacity: 0.5,
                    overflow: 'hidden'
                  }}
                >
                  <span style={{ fontSize: '14px', fontWeight: '500', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: '1.25' }}>★ Favorites</span>
                </div>

                {/* Draggable categories list */}
                <Reorder.Group axis="y" values={editableCategories} onReorder={setEditableCategories} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: 0, margin: 0, listStyle: 'none' }}>
                  {editableCategories.map((category) => {
                    const catColor = getCategoryColor(category, bootstrapCategories);
                    return (
                      <Reorder.Item key={category.id} value={category} style={{ listStyleType: 'none' }}>
                        <div
                          className="rounded-lg glass-card"
                          style={{
                            position: 'relative',
                            width: '100%',
                            minHeight: '40px',
                            height: 'auto',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 12px',
                            backgroundColor: isDark ? '#2B2B2B' : '#F1F5F9',
                            border: isDark ? '1px dashed rgba(255,255,255,0.2)' : '1px dashed #CBD5E1',
                            borderRadius: '14px',
                            cursor: 'grab',
                            color: 'var(--text-secondary)',
                            overflow: 'hidden'
                          }}
                        >
                          <IoMoveOutline style={{ opacity: 0.6, fontSize: '16px', color: '#FF8A00', flexShrink: 0 }} />
                          <span
                            style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              backgroundColor: catColor.hex,
                              flexShrink: 0
                            }}
                          />
                          <span style={{
                            fontSize: '14px',
                            fontWeight: '500',
                            color: 'var(--text-secondary)',
                            whiteSpace: 'normal',
                            wordBreak: 'break-word',
                            lineHeight: '1.25'
                          }}>
                            {category.name}
                          </span>
                        </div>
                      </Reorder.Item>
                    );
                  })}
                </Reorder.Group>
              </>
            ) : (
              categories.map((category) => {
                const isActive = selectedCategory === category.id;
                const isFav = category.id === 'favorites';
                const catColor = !isFav ? getCategoryColor(category, bootstrapCategories) : null;
                return (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className="rounded-lg glass-card"
                    style={{
                      position: 'relative',
                      width: '100%',
                      minHeight: '40px',
                      height: 'auto',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      background: 'transparent',
                      border: isActive ? '1px solid transparent' : (isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #CBD5E1'),
                      borderRadius: '14px',
                      cursor: 'pointer',
                      color: isActive ? '#ffffff' : (isDark ? 'var(--text-secondary)' : '#334155'),
                      fontWeight: isActive ? 700 : 600,
                      transition: 'color 180ms ease',
                      textAlign: 'left'
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = isDark ? '#333333' : '#F8FAFC';
                        e.currentTarget.style.borderColor = isDark ? '#5a5a5a' : '#FF8A00';
                        e.currentTarget.style.boxShadow = isDark ? 'none' : '0 3px 8px rgba(15, 23, 42, 0.08)';
                        e.currentTarget.style.transform = 'translateX(2px)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.borderColor = isDark ? 'rgba(255,255,255,0.08)' : '#CBD5E1';
                        e.currentTarget.style.boxShadow = 'none';
                        e.currentTarget.style.transform = 'translateX(0)';
                      }
                    }}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="pos-category-active-pill"
                        transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                        style={{
                          position: 'absolute',
                          inset: 0,
                          borderRadius: '14px',
                          background: 'linear-gradient(180deg, #FF8A00 0%, #FF6500 100%)',
                          border: '1px solid #FF8A00',
                          boxShadow: '0 6px 18px rgba(255,107,0,0.30)',
                          zIndex: 1
                        }}
                      />
                    )}

                    {isActive && (
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: '4px',
                          height: '20px',
                          backgroundColor: '#ffffff',
                          borderRadius: '0 2px 2px 0',
                          zIndex: 2,
                        }}
                      />
                    )}

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flex: 1,
                      minWidth: 0,
                      position: 'relative',
                      zIndex: 2,
                    }}>
                      {!isFav && catColor && (
                        <span
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: isActive ? '#ffffff' : catColor.hex,
                            flexShrink: 0,
                            boxShadow: isActive ? '0 0 0 2px rgba(255,255,255,0.3)' : `0 0 8px ${catColor.hex}80`,
                            opacity: isActive ? 0.9 : 1,
                          }}
                        />
                      )}
                      <span style={{
                        fontSize: '14px',
                        fontWeight: '500',
                        color: isActive ? '#ffffff' : (isDark ? 'var(--text-secondary)' : '#334155'),
                        whiteSpace: 'normal',
                        wordBreak: 'break-word',
                        lineHeight: '1.25'
                      }}>
                        {category.name}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

        </div>

        {/* Item Groups Dropdown Selector - Relocated to Bottom of Sidebar */}
        <div style={{
          padding: '12px 10px 16px 10px',
          borderTop: isDark ? '1px solid var(--glass-border)' : '1px solid #E2E8F0',
          background: isDark ? 'rgba(0,0,0,0.15)' : '#F8FAFC',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          minWidth: 0,
          width: '100%',
          boxSizing: 'border-box'
        }}>
          <GroupSelector
            groups={groups}
            value={selectedGroupId}
            onChange={(val) => setSelectedGroupId(val)}
            placeholder="Select Group"
            direction="top"
          />
        </div>

      </div>



      <div style={middleSectionStyle} className="reminders-scroll">

        <div style={{

          padding: 0, // Handled by Grid gap

          minHeight: 'calc(100% - 1rem)',

        }}>

          {/* Edit Layout Header Bar */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            padding: '4px 8px 12px 8px',
            borderBottom: '1px solid rgba(255,255,255,0.06)'
          }}>
            <h2 style={{
              fontSize: '20px',
              fontWeight: '700',
              color: 'var(--text-primary)',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              {selectedCategory === 'favorites'
                ? '★ Favorites'
                : (bootstrapCategories.find(c => c.id === selectedCategory)?.name || 'Products')}
              {isEditMode && (
                <span style={{
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#FF8A00',
                  background: 'rgba(255,138,0,0.1)',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,138,0,0.2)'
                }}>
                  Editing Layout
                </span>
              )}
            </h2>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              {/* Recent 5 Bills Trigger Button */}
              <button
                type="button"
                onClick={handleOpenRecentBills}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 14px',
                  background: isDark
                    ? 'rgba(255, 255, 255, 0.05)'
                    : '#FFFFFF',
                  border: isDark
                    ? '1px solid rgba(255, 255, 255, 0.1)'
                    : '1.5px solid #CBD5E1',
                  borderRadius: '12px',
                  color: isDark ? '#E2E8F0' : '#1E293B',
                  fontSize: '13.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: isDark ? 'none' : '0 1px 3px rgba(15, 23, 42, 0.06)',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.borderColor = '#FF6B1A';
                  e.currentTarget.style.color = '#FF6B1A';
                  e.currentTarget.style.boxShadow = '0 3px 10px rgba(255, 107, 26, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.borderColor = isDark ? 'rgba(255, 255, 255, 0.1)' : '#CBD5E1';
                  e.currentTarget.style.color = isDark ? '#E2E8F0' : '#1E293B';
                  e.currentTarget.style.boxShadow = isDark ? 'none' : '0 1px 3px rgba(15, 23, 42, 0.06)';
                }}
                title="View recent 5 bills and tap to load order"
              >
                <IoTimeOutline size={16} style={{ color: '#FF6B1A' }} />
                <span>Recent Bills</span>
              </button>

              <button
                type="button"
                onClick={() => navigate('/live')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  background: isDark
                    ? 'linear-gradient(135deg, rgba(255, 107, 26, 0.15) 0%, rgba(234, 88, 12, 0.25) 100%)'
                    : '#FFF7ED',
                  border: '1.5px solid rgba(255, 107, 26, 0.4)',
                  borderRadius: '12px',
                  color: '#FF6B1A',
                  fontSize: '13.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 2px 10px rgba(255, 107, 26, 0.15)',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 4px 14px rgba(255, 107, 26, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 10px rgba(255, 107, 26, 0.15)';
                }}
                title="Open Real-time Live Orders & Active Table Board"
              >
                <div className="live-pulse-dot" style={{ width: '8px', height: '8px' }} />
                <span>Live Board</span>
                <IoRestaurantOutline size={15} />
              </button>

              {!isEditMode ? (
                <button
                  onClick={startEditMode}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '10px',
                    color: 'var(--text-secondary)',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }}
                >
                  <IoCreateOutline size={16} />
                  Edit Layout
                </button>
              ) : (
                <>
                  <button
                    onClick={cancelEditMode}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      background: 'rgba(239,68,68,0.1)',
                      border: '1px solid rgba(239,68,68,0.2)',
                      borderRadius: '10px',
                      color: '#EF4444',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(239,68,68,0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(239,68,68,0.1)';
                    }}
                  >
                    <IoCloseOutline size={16} />
                    Cancel
                  </button>
                  <button
                    onClick={saveLayout}
                    disabled={savingLayout}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      background: 'linear-gradient(180deg, #FF8A00 0%, #FF6500 100%)',
                      border: 'none',
                      borderRadius: '10px',
                      color: '#ffffff',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(255,120,0,0.25)',
                      transition: 'all 0.2s ease',
                      opacity: savingLayout ? 0.7 : 1
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.filter = 'brightness(1.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.filter = 'brightness(1)';
                    }}
                  >
                    <IoCheckmarkDoneOutline size={16} />
                    {savingLayout ? 'Saving...' : 'Done'}
                  </button>
                </>
              )}
            </div>
          </div>

          {loading ? (

            <div style={{

              display: 'grid',

              gridTemplateColumns: 'repeat(auto-fill, minmax(calc(180px * var(--display-zoom)), 1fr))',

              gap: 'var(--spacing-4)',

            }}>

              {[...Array(8)].map((_, i) => (

                <div key={i} className="glass-card animate-pulse" style={{

                  height: 'calc(200px * var(--display-zoom))',

                  borderRadius: 'var(--radius-lg)',

                }} />

              ))}

            </div>

          ) : filteredProducts.length === 0 ? (

            <div style={{

              display: 'flex',

              flexDirection: 'column',

              alignItems: 'center',

              justifyContent: 'center',

              padding: 'var(--spacing-12)',

              color: 'var(--text-secondary)',

              height: '100%',

              textAlign: 'center'

            }}>

              {/* Empty State - Same as before but cleaner */}

              <div style={{

                width: 'calc(80px * var(--display-zoom))',

                height: 'calc(80px * var(--display-zoom))',

                borderRadius: '50%',

                backgroundImage: 'var(--glass-card)',

                display: 'flex',

                alignItems: 'center',

                justifyContent: 'center',

                marginBottom: 'var(--spacing-6)',

                border: '1px solid var(--glass-border)'

              }}>

                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>

                  <circle cx="11" cy="11" r="8"></circle>

                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>

                </svg>

              </div>

              <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--spacing-2)' }}>

                No products found

              </h3>

              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>

                Try adjusting your search or filters.

              </p>

            </div>

          ) : (

            <div

              style={{

                display: 'grid',

                gridTemplateColumns: 'repeat(auto-fill, minmax(calc(135px * var(--display-zoom)), 1fr))',

                gap: '16px',

                padding: '4px'

              }}

            >

              {(isEditMode ? editableProducts : displayedProducts).map((product) => {
                const productVariations = getProductVariations(product);
                const hasTwoVariations = productVariations.length === 2;
                const isFavoritesView = selectedCategory === 'favorites';
                const productCategory = bootstrapCategories.find(
                  c => String(c.id) === String(product.category_id) || c.name === product.category
                );
                const catColor = isFavoritesView ? getCategoryColor(productCategory, bootstrapCategories) : null;

                return (
                  <motion.div
                    layout
                    key={product.product_id}
                    draggable={isEditMode}
                    onDragStart={isEditMode ? (e) => handleProductDragStart(e, product.product_id) : undefined}
                    onDragOver={isEditMode ? (e) => handleProductDragOver(e, product.product_id) : undefined}
                    onDragEnd={isEditMode ? handleProductDragEnd : undefined}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    style={{ position: 'relative' }}
                  >
                    <div
                      onClick={isEditMode ? undefined : (e) => {
                        if (!hasTwoVariations) {
                          handleAddItem(product, e);
                        }
                      }}
                      style={{
                        padding: '16px 10px 10px 10px',
                        maxWidth: 'calc(170px * var(--display-zoom))',
                        width: '100%',
                        margin: '0 auto',
                        display: 'flex',
                        flexDirection: 'column',
                        cursor: isEditMode ? 'grab' : (product.stock_status === 'Out of Stock' ? 'not-allowed' : (hasTwoVariations ? 'default' : 'pointer')),
                        opacity: product.stock_status === 'Out of Stock' ? 0.6 : 1,
                        position: 'relative',
                        boxSizing: 'border-box',
                        borderRadius: '20px',
                        background: isFavoritesView && catColor
                          ? (isDark
                              ? `linear-gradient(180deg, ${catColor.hex}18 0%, #212121e6 50%)`
                              : `linear-gradient(180deg, ${catColor.hex}12 0%, #FFFFFF 50%)`)
                          : (isDark ? '#212121b3' : '#FFFFFF'),
                        border: isEditMode
                          ? '1.5px dashed #FF8A00'
                          : (isFavoritesView && catColor
                              ? (isDark ? `1.5px solid ${catColor.hex}45` : `1.5px solid ${catColor.hex}55`)
                              : (isDark ? '1px solid #4a4a4a' : '1px solid #CBD5E1')),
                        boxShadow: isEditMode
                          ? '0 8px 24px rgba(255,138,0,0.15)'
                          : (isFavoritesView && catColor
                              ? (isDark
                                  ? `0 4px 14px ${catColor.hex}22, 0 2px 8px rgba(0,0,0,0.25)`
                                  : `0 4px 14px ${catColor.hex}18, 0 2px 8px -2px rgba(15, 23, 42, 0.08)`)
                              : (isDark ? '0 2px 8px rgba(0,0,0,0.25)' : '0 2px 8px -2px rgba(15, 23, 42, 0.08), 0 1px 3px -1px rgba(15, 23, 42, 0.05)')),
                        transition: 'border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease',
                        transform: isEditMode ? 'scale(1.03)' : 'none'
                      }}
                      onMouseEnter={(e) => {
                        if (!isEditMode) {
                          if (isFavoritesView && catColor) {
                            e.currentTarget.style.borderColor = `${catColor.hex}90`;
                            e.currentTarget.style.boxShadow = isDark
                              ? `0 8px 24px ${catColor.hex}35, 0 2px 8px rgba(0,0,0,0.3)`
                              : `0 8px 24px -2px ${catColor.hex}28, 0 2px 8px rgba(15, 23, 42, 0.08)`;
                          } else {
                            e.currentTarget.style.borderColor = isDark ? '#5a5a5a' : '#FF8A00';
                            e.currentTarget.style.boxShadow = isDark
                              ? '0 6px 16px rgba(0,0,0,0.30)'
                              : '0 8px 20px -4px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(255, 107, 0, 0.25)';
                          }
                          e.currentTarget.style.transform = 'translateY(-2px)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isEditMode) {
                          if (isFavoritesView && catColor) {
                            e.currentTarget.style.borderColor = isDark ? `${catColor.hex}45` : `${catColor.hex}55`;
                            e.currentTarget.style.boxShadow = isDark
                              ? `0 4px 14px ${catColor.hex}22, 0 2px 8px rgba(0,0,0,0.25)`
                              : `0 4px 14px ${catColor.hex}18, 0 2px 8px -2px rgba(15, 23, 42, 0.08)`;
                          } else {
                            e.currentTarget.style.borderColor = isDark ? '#4a4a4a' : '#CBD5E1';
                            e.currentTarget.style.boxShadow = isDark
                              ? '0 2px 8px rgba(0,0,0,0.25)'
                              : '0 2px 8px -2px rgba(15, 23, 42, 0.08), 0 1px 3px -1px rgba(15, 23, 42, 0.05)';
                          }
                          e.currentTarget.style.transform = 'none';
                        }
                      }}
                    >

                      {/* Drag handle overlay in edit mode */}
                      {isEditMode && (
                        <div style={{
                          position: 'absolute',
                          top: '10px',
                          right: '10px',
                          backgroundColor: 'rgba(255, 138, 0, 0.2)',
                          color: '#FF8A00',
                          padding: '4px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 10
                        }}>
                          <IoMoveOutline size={16} />
                        </div>
                      )}

                      {/* Out of stock indicator if images are hidden */}
                      {product.stock_status === 'Out of Stock' && settings?.show_product_images === 'false' && (
                        <div style={{
                          position: 'absolute',
                          top: '12px',
                          right: '12px',
                          backgroundColor: 'var(--error-500)',
                          color: 'white',
                          fontSize: '9px',
                          fontWeight: 800,
                          padding: '1px 5px',
                          borderRadius: '4px',
                          zIndex: 10
                        }}>OUT</div>
                      )}


                      {/* Image Container */}
                      {settings?.show_product_images !== 'false' && (
                        <div style={{
                          height: '100px',
                          width: '100%',
                          boxSizing: 'border-box',
                          background: isDark ? '#2d2d2d' : '#f3f4f6',
                          borderRadius: '14px',
                          border: isDark ? '1px solid #5a5a5a' : '1px solid #e2e8f0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          position: 'relative',
                          overflow: 'hidden',
                          zIndex: 2
                        }}>
                          {product.stock_status === 'Out of Stock' && (
                            <div style={{
                              position: 'absolute',
                              backgroundColor: 'var(--error-500)',
                              color: 'white',
                              fontSize: '9px',
                              fontWeight: 800,
                              padding: '1px 5px',
                              borderRadius: '4px',
                              zIndex: 10
                            }}>OUT</div>
                          )}

                          {product.image_filename ? (
                            <img
                              src={productsAPI.getImageUrl(product.image_filename, product.updated_at)}
                              alt={product.name}
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'contain',
                                transform: 'scale(1.25)',
                                transition: 'transform 0.2s ease'
                              }}
                              loading="lazy"
                            />
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.15 }}>
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <path d="M21 15l-5-5L5 21" />
                              </svg>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Product Name */}
                      <h4 style={{
                        fontFamily: 'Inter, system-ui',
                        fontSize: '14px',
                        fontWeight: 700,
                        color: isDark ? '#F2F2F2' : '#111827',
                        margin: '10px 0 8px 0',
                        textAlign: 'left',
                        whiteSpace: 'normal',
                        wordBreak: 'break-word',
                      }}>
                        {product.name}
                      </h4>

                      {/* Options or Single Price */}
                      {hasTwoVariations ? (
                        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {productVariations.map((variation) => {
                            const nameParts = variation.name.split(' ');
                            return (
                              <button
                                key={variation.id}
                                type="button"
                                onClick={isEditMode ? undefined : (e) => {
                                  e.stopPropagation();
                                  handleVariationSelect(product, variation);
                                }}
                                style={{
                                  width: '100%',
                                  height: '52px',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  padding: '0 8px',
                                  borderRadius: '12px',
                                  border: isDark ? '1px solid #555' : '1px solid #CBD5E1',
                                  background: isDark ? '#2d2d2d' : '#F8FAFC',
                                  boxShadow: isDark ? 'none' : '0 1px 2px rgba(15, 23, 42, 0.04)',
                                  boxSizing: 'border-box',
                                  cursor: isEditMode ? 'default' : 'pointer',
                                  fontFamily: 'Inter, system-ui',
                                  transition: 'all 150ms ease'
                                }}
                                onMouseEnter={(e) => {
                                  if (!isEditMode) {
                                    e.currentTarget.style.borderColor = isFavoritesView && catColor ? catColor.hex : (isDark ? '#777' : '#FF8A00');
                                    e.currentTarget.style.boxShadow = isDark ? 'none' : (isFavoritesView && catColor ? `0 2px 6px ${catColor.hex}30` : '0 2px 6px rgba(255, 107, 0, 0.2)');
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!isEditMode) {
                                    e.currentTarget.style.borderColor = isDark ? '#555' : '#CBD5E1';
                                    e.currentTarget.style.boxShadow = isDark ? 'none' : '0 1px 2px rgba(15, 23, 42, 0.04)';
                                  }
                                }}
                              >

                                <div style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'flex-start',
                                  textAlign: 'left',
                                  fontWeight: 700,
                                  fontSize: '12px',
                                  color: isDark ? '#ECECEC' : '#111827',
                                  lineHeight: '1.2'
                                }}>
                                  {nameParts.map((part, index) => (
                                    <span key={index}>{part}</span>
                                  ))}
                                </div>
                                <div style={{
                                  fontWeight: 700,
                                  fontSize: '14px',
                                  color: isFavoritesView && catColor ? catColor.hex : '#ff6b00',
                                  textAlign: 'right'
                                }}>
                                  {formatCurrency(variation.price)}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 6px 4px' }}>
                          <span style={{
                            fontWeight: 700,
                            fontSize: '14px',
                            color: isFavoritesView && catColor ? catColor.hex : '#ff6b00',
                            fontFamily: 'Inter, system-ui'
                          }}>
                            {formatProductPriceLabel(product, formatCurrency, orderType)}
                          </span>

                          <div
                            style={{
                              width: '26px',
                              height: '26px',
                              backgroundColor: isFavoritesView && catColor ? catColor.hex : '#ff6b00',
                              borderRadius: '50%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'white',
                              cursor: isEditMode ? 'default' : 'pointer',
                              boxShadow: isFavoritesView && catColor ? `0 2px 8px ${catColor.hex}55` : 'none',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                              <path d="M12 5V19M5 12H19" />
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}



              {/* Invisible sentinel for intersection observer */}

              {visibleCount < filteredProducts.length && (

                <div ref={observerTarget} style={{ height: '20px', width: '100%' }}></div>

              )}

            </div>

          )}

        </div>

      </div>



      <div className="glass-panel" style={{
        width: 'calc(400px * var(--display-zoom))',
        borderLeft: isDark ? '1px solid var(--glass-border)' : '1px solid #E2E8F0',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        boxShadow: isDark ? 'var(--shadow-modal)' : '-4px 0 20px rgba(15, 23, 42, 0.05)',
        zIndex: 10,
        backgroundColor: isDark ? 'transparent' : '#FFFFFF',
        backgroundImage: isDark ? 'var(--glass-modal)' : 'none',
        backdropFilter: 'var(--glass-blur-strong)',
        WebkitBackdropFilter: 'var(--glass-blur-strong)',
      }}>


        <div style={{

          flex: 1,

          padding: currentTheme.spacing[4],

          overflowY: 'auto',

        }}>

          {/* Header for Right Section */}

          <div style={{

            display: 'flex',

            justifyContent: 'space-between',

            alignItems: 'center',

            marginBottom: currentTheme.spacing[4],

            paddingBottom: currentTheme.spacing[3],

            borderBottom: isDark ? `1px solid ${currentTheme.colors.border}` : '1.5px solid #E2E8F0',
          }}>
            <h3 style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: 800,
              color: isDark ? '#F8FAFC' : '#0F172A',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              letterSpacing: '-0.3px',
            }}>
              {editingBill ? `Editing ${editingBill.bill_no}` : 'Current Bill'}
              <span style={{
                fontSize: '11.5px',
                background: isDark ? 'rgba(255, 107, 26, 0.15)' : '#FFF7ED',
                border: isDark ? '1px solid rgba(255, 107, 26, 0.3)' : '1px solid #FDBA74',
                color: '#EA580C',
                fontWeight: 750,
                padding: '2px 8px',
                borderRadius: '12px',
              }}>
                {orderItems.length} items
              </span>
            </h3>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearClick}
              disabled={orderItems.length === 0}
              style={{
                color: orderItems.length === 0 ? currentTheme.colors.text.disabled : (isDark ? '#ef4444' : '#dc2626'),
                opacity: orderItems.length === 0 ? 0.5 : 1,
                padding: '4px 8px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontWeight: 700,
              }}
            >
              <TrashIcon color="currentColor" />
              <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>Clear All</span>
            </Button>
          </div>

          {/* Active Editing Indicator Banner */}
          {editingBill && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              marginBottom: '12px',
              borderRadius: '10px',
              background: isDark ? 'rgba(255, 107, 26, 0.15)' : '#FFF7ED',
              border: '1.5px solid rgba(255, 107, 26, 0.35)',
              boxShadow: '0 2px 8px rgba(255, 107, 26, 0.1)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#EA580C',
                  boxShadow: '0 0 6px rgba(234, 88, 12, 0.8)'
                }} />
                <div>
                  <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#EA580C' }}>
                    Editing Bill {editingBill.bill_no}
                  </div>
                  <div style={{ fontSize: '11px', color: isDark ? '#94A3B8' : '#64748B' }}>
                    Modify items, table or payment then update
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  resetBillState();
                  setEditingBill(null);
                }}
                style={{
                  background: isDark ? '#26272C' : '#FFFFFF',
                  border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1.5px solid #CBD5E1',
                  borderRadius: '8px',
                  padding: '4px 10px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  color: isDark ? '#F1F5F9' : '#334155',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                title="Cancel edit mode and start a new blank bill"
              >
                Cancel Edit
              </button>
            </div>
          )}

          {/* Order Type Toggle Selector */}
          <div style={{
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'calc(6px * var(--display-zoom, 1))',
            padding: 'calc(4px * var(--display-zoom, 1))',
            borderRadius: '12px',
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#F1F5F9',
            border: isDark ? '1px solid var(--glass-border)' : '1px solid #CBD5E1',
            marginBottom: 'calc(12px * var(--display-zoom, 1))'
          }}>
            {[
              { id: 'dine-in', label: 'Dine In' },
              { id: 'takeaway', label: 'Takeaway' }
            ].map(type => {
              const isSelected = orderType === type.id;
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setOrderType(type.id)}
                  style={{
                    position: 'relative',
                    padding: 'calc(7px * var(--display-zoom, 1))',
                    borderRadius: '9px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: isSelected ? '#EA580C' : (isDark ? 'var(--text-secondary)' : '#475569'),
                    fontWeight: 750,
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    outline: 'none',
                    userSelect: 'none'
                  }}
                >
                  {isSelected && (
                    <motion.div
                      layoutId="pos-order-type-indicator"
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '9px',
                        backgroundColor: isDark ? 'rgba(249, 115, 22, 0.18)' : '#FFFFFF',
                        border: '2px solid #EA580C',
                        boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 6px rgba(234, 88, 12, 0.15)',
                        zIndex: 1
                      }}
                    />
                  )}
                  <span style={{ position: 'relative', zIndex: 2 }}>
                    {type.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 4 Option Buttons: Table Number | KOT Number | Customer Name | Mobile Number */}
          <div style={{
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '5px',
            padding: '3px',
            borderRadius: '10px',
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#F1F5F9',
            border: isDark ? '1px solid var(--glass-border)' : '1.5px solid #CBD5E1',
            marginBottom: 'calc(8px * var(--display-zoom, 1))'
          }}>
            {[
              { id: 'table', label: tableNumber ? `T: ${tableNumber}` : 'Table No', title: tableNumber ? `Table: ${tableNumber}` : 'Table Number', hasVal: !!tableNumber },
              { id: 'kot', label: kotNumber ? `KOT: ${kotNumber}` : 'KOT No', title: kotNumber ? `KOT: ${kotNumber}` : 'KOT Number', hasVal: !!kotNumber },
              { id: 'customer', label: customerName ? `Name: ${customerName}` : 'Cus.Name', title: customerName ? `Name: ${customerName}` : 'Customer Name', hasVal: !!customerName },
              { id: 'mobile', label: customerMobile ? `Mob: ${customerMobile}` : 'Cus.Num', title: customerMobile ? `Mobile: ${customerMobile}` : 'Mobile Number', hasVal: !!customerMobile },
            ].map(f => {
              const isActive = activeField === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setActiveField(f.id)}
                  style={{
                    position: 'relative',
                    padding: 'calc(6px * var(--display-zoom, 1)) 2px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: isActive ? '#EA580C' : (f.hasVal ? '#EA580C' : (isDark ? 'var(--text-secondary)' : '#475569')),
                    fontWeight: 750,
                    fontSize: '11.5px',
                    cursor: 'pointer',
                    outline: 'none',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '2px',
                    userSelect: 'none'
                  }}
                  title={f.title}
                >
                  {isActive && (
                    <motion.div
                      layoutId="pos-active-field-indicator"
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '8px',
                        backgroundColor: isDark ? 'rgba(249, 115, 22, 0.18)' : '#FFFFFF',
                        border: '2px solid #EA580C',
                        boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 6px rgba(234, 88, 12, 0.15)',
                        zIndex: 1
                      }}
                    />
                  )}
                  <span style={{
                    position: 'relative',
                    zIndex: 2,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px'
                  }}>
                    {!isActive && f.hasVal && (
                      <span style={{
                        width: '5px',
                        height: '5px',
                        borderRadius: '50%',
                        backgroundColor: '#EA580C',
                        flexShrink: 0
                      }} />
                    )}
                    {f.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Value Entry Bar (Opens down when any of the 4 buttons is tapped) */}
          {activeField && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: 'calc(8px * var(--display-zoom, 1))',
              padding: 'calc(6px * var(--display-zoom, 1)) 10px',
              borderRadius: '8px',
              backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F1F5F9',
              border: isDark ? '1px solid var(--glass-border)' : '1.5px solid #CBD5E1'
            }}>
              <span style={{ fontSize: '11.5px', fontWeight: 700, color: isDark ? 'var(--text-secondary)' : '#334155', minWidth: '70px' }}>
                {activeField === 'table' && 'Table No:'}
                {activeField === 'kot' && 'KOT No:'}
                {activeField === 'customer' && 'Customer Name:'}
                {activeField === 'mobile' && 'Customer Mobile Number:'}
              </span>

              {activeField === 'table' && (
                <input
                  type="text"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  placeholder="Optional (e.g. 5)"
                  autoFocus
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: isDark ? '1px solid var(--glass-border)' : '1px solid #CBD5E1',
                    backgroundColor: isDark ? 'rgba(0,0,0,0.25)' : '#FFFFFF',
                    color: isDark ? '#FFFFFF' : '#0F172A',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    outline: 'none',
                  }}
                />
              )}

              {activeField === 'kot' && (
                <input
                  type="text"
                  value={kotNumber}
                  onChange={(e) => setKotNumber(e.target.value)}
                  placeholder="Optional (e.g. 101)"
                  autoFocus
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: isDark ? '1px solid var(--glass-border)' : '1px solid #CBD5E1',
                    backgroundColor: isDark ? 'rgba(0,0,0,0.25)' : '#FFFFFF',
                    color: isDark ? '#FFFFFF' : '#0F172A',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    outline: 'none',
                  }}
                />
              )}

              {activeField === 'customer' && (
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Optional (e.g. John Doe)"
                  autoFocus
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: isDark ? '1px solid var(--glass-border)' : '1px solid #CBD5E1',
                    backgroundColor: isDark ? 'rgba(0,0,0,0.25)' : '#FFFFFF',
                    color: isDark ? '#FFFFFF' : '#0F172A',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    outline: 'none',
                  }}
                />
              )}

              {activeField === 'mobile' && (
                <input
                  type="text"
                  value={customerMobile}
                  onChange={(e) => setCustomerMobile(e.target.value)}
                  placeholder="Optional (e.g. 98765XXXXX)"
                  autoFocus
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: isDark ? '1px solid var(--glass-border)' : '1px solid #CBD5E1',
                    backgroundColor: isDark ? 'rgba(0,0,0,0.25)' : '#FFFFFF',
                    color: isDark ? '#FFFFFF' : '#0F172A',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    outline: 'none',
                  }}
                />
              )}

              {/* Clear button if active field has value */}
              {((activeField === 'table' && tableNumber) ||
                (activeField === 'kot' && kotNumber) ||
                (activeField === 'customer' && customerName) ||
                (activeField === 'mobile' && customerMobile)) && (
                  <button
                    onClick={() => {
                      if (activeField === 'table') setTableNumber('');
                      if (activeField === 'kot') setKotNumber('');
                      if (activeField === 'customer') setCustomerName('');
                      if (activeField === 'mobile') setCustomerMobile('');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: isDark ? 'var(--text-secondary)' : '#64748B',
                      cursor: 'pointer',
                      fontSize: '14px',
                      padding: '0 4px',
                      lineHeight: 1
                    }}
                    title="Clear"
                  >
                    ✕
                  </button>
                )}
            </div>
          )}

          {orderItems.length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: currentTheme.spacing[8],
              color: currentTheme.colors.text.secondary,
              height: '60%'
            }}>
              {/* Bobbing Animation */}
              <div
                style={{
                  width: '64px', height: '64px',
                  borderRadius: '16px',
                  backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F6F7F9',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '16px'
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
                  <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
                </svg>
              </div>
              <div style={{ fontSize: '16px', fontWeight: 750, color: isDark ? '#FFFFFF' : '#0F172A' }}>
                Your cart is empty
              </div>
              <div style={{ fontSize: '13px', color: isDark ? 'rgba(255,255,255,0.5)' : '#64748B', marginTop: '4px', fontWeight: 500 }}>
                Add items to create a bill
              </div>
            </div>
          ) : (
            <div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr',
                fontSize: '11px',
                fontWeight: 800,
                color: isDark ? '#94A3B8' : '#475569',
                marginBottom: '8px',
                paddingBottom: '6px',
                paddingRight: '10px',
                borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1.5px solid #E2E8F0',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}>
                <div>ITEMS</div>
                <div style={{ textAlign: 'center' }}>QTY.</div>
                <div style={{ textAlign: 'right' }}>PRICE</div>
              </div>

              {orderItems.map((item) => {
                const lineKey = item.line_key || getCartLineKey(item.product_id, item.variation_id);
                return (
                  <div key={lineKey} style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 1fr',
                    alignItems: 'center',
                    padding: '6px 0',
                    paddingRight: '10px',
                    borderBottom: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #F1F5F9',
                  }}>
                    <div>
                      <div style={{
                        fontSize: '13.5px',
                        fontWeight: 750,
                        color: isDark ? '#F8FAFC' : '#0F172A',
                        letterSpacing: '-0.2px',
                        lineHeight: 1.3,
                      }}>
                        {item.name}
                      </div>
                      <div style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: isDark ? '#94A3B8' : '#64748B',
                        marginTop: '1px',
                      }}>
                        {formatCurrency(item.price)} each
                      </div>
                    </div>

                    <div style={{ textAlign: 'center' }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                      }}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => updateQuantity(lineKey, item.quantity - 1)}
                          style={{
                            minWidth: '24px',
                            width: '24px',
                            height: '24px',
                            padding: 0,
                            borderRadius: '6px',
                            fontSize: '13px',
                            fontWeight: 800,
                            background: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
                            border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #CBD5E1',
                            color: isDark ? '#FFFFFF' : '#0F172A'
                          }}
                        >
                          −
                        </Button>
                        <span style={{
                          minWidth: '24px',
                          textAlign: 'center',
                          fontSize: '13px',
                          fontWeight: 800,
                          color: isDark ? '#FFFFFF' : '#0F172A',
                          fontVariantNumeric: 'tabular-nums'
                        }}>
                          {item.quantity}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => updateQuantity(lineKey, item.quantity + 1)}
                          style={{
                            minWidth: '24px',
                            width: '24px',
                            height: '24px',
                            padding: 0,
                            borderRadius: '6px',
                            fontSize: '13px',
                            fontWeight: 800,
                            background: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
                            border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #CBD5E1',
                            color: isDark ? '#FFFFFF' : '#0F172A'
                          }}
                        >
                          +
                        </Button>
                      </div>
                    </div>

                    <div style={{
                      textAlign: 'right',
                      fontSize: '17.5px',
                      fontWeight: 700,
                      color: isDark ? '#F8FAFC' : '#0F172A',
                      fontVariantNumeric: 'tabular-nums'
                    }}>
                      {formatCurrency(item.price * item.quantity)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{
          borderTop: isDark ? `1px solid ${currentTheme.colors.border}` : '1.5px solid #E2E8F0',
          padding: '12px 16px',
          backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#F8FAFC'
        }}>
          {/* Payment Status Selector (Paid / Pending) */}
          <div style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            marginBottom: '10px',
            padding: '4px',
            borderRadius: '10px',
            background: isDark ? 'rgba(255, 255, 255, 0.04)' : '#EDF2F7',
            border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #CBD5E1'
          }}>
            {[
              {
                id: 'paid',
                label: 'Paid',
                icon: IoCheckmarkCircle,
                gradient: 'linear-gradient(135deg, #10B981, #059669)',
                shadow: '0 2px 8px rgba(16, 185, 129, 0.35)'
              },
              {
                id: 'pending',
                label: 'Mark Pending',
                icon: IoTimeOutline,
                gradient: 'linear-gradient(135deg, #F59E0B, #D97706)',
                shadow: '0 2px 8px rgba(245, 158, 11, 0.35)'
              }
            ].map(status => {
              const isSelected = paymentStatus === status.id;
              const StatusIcon = status.icon;
              return (
                <button
                  key={status.id}
                  type="button"
                  onClick={() => setPaymentStatus(status.id)}
                  style={{
                    position: 'relative',
                    flex: 1,
                    padding: '6px 10px',
                    fontSize: '12px',
                    fontWeight: 750,
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px',
                    background: 'transparent',
                    color: isSelected ? '#FFFFFF' : (isDark ? '#94A3B8' : '#64748B'),
                    outline: 'none',
                    userSelect: 'none'
                  }}
                >
                  {isSelected && (
                    <motion.div
                      layoutId="pos-payment-status-pill"
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '8px',
                        background: status.gradient,
                        boxShadow: status.shadow,
                        zIndex: 1
                      }}
                    />
                  )}
                  <span style={{
                    position: 'relative',
                    zIndex: 2,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}>
                    <StatusIcon size={14} /> {status.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Total Amount Card */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
            padding: '12px 16px',
            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF',
            borderRadius: '12px',
            border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1.5px solid #CBD5E1',
            boxShadow: isDark ? '0 2px 10px rgba(0,0,0,0.2)' : '0 2px 8px rgba(15, 23, 42, 0.05)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(249, 115, 22, 0.12)',
                border: '1px solid rgba(249, 115, 22, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <IoReceiptOutline size={18} color="#EA580C" />
              </div>
              <span style={{
                fontSize: '11.5px',
                color: isDark ? '#94A3B8' : '#475569',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.08em'
              }}>Total Amount</span>
            </div>
            <span style={{
              fontSize: '26px',
              fontFamily: "var(--font-primary, 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif)",
              fontWeight: 700,
              color: isDark ? '#FFFFFF' : '#0F172A',
              letterSpacing: '-0.02em',
              fontVariantNumeric: 'tabular-nums'
            }}>
              {formatCurrency(calculateTotal())}
            </span>
          </div>

          {/* Action Buttons Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px'
          }}>
            {/* Row 1 */}
            <Button
              variant="secondary"
              onClick={handleSaveOrder}
              fullWidth
              disabled={isPrinting}
              icon={<IoSaveOutline size={16} />}
              style={{
                height: '42px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 750,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'all 0.2s ease',
                background: isDark ? undefined : '#FFFFFF',
                border: isDark ? undefined : '1.5px solid #CBD5E1',
                color: isDark ? undefined : '#1E293B',
                boxShadow: isDark ? 'none' : '0 1px 2px rgba(15, 23, 42, 0.04)',
              }}
            >
              {editingBill ? 'Update Only' : 'Save Only'}
            </Button>

            <Button
              variant="secondary"
              onClick={() => handleSaveAndPrintOrder('kot')}
              fullWidth
              disabled={isPrinting}
              icon={<IoPrintOutline size={16} />}
              style={{
                height: '42px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 750,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'all 0.2s ease',
                background: isDark ? undefined : '#FFFFFF',
                border: isDark ? undefined : '1.5px solid #CBD5E1',
                color: isDark ? undefined : '#1E293B',
                boxShadow: isDark ? 'none' : '0 1px 2px rgba(15, 23, 42, 0.04)',
              }}
            >
              {isPrinting && printStatus.toLowerCase().includes('kot') ? 'KOT...' : 'Print KOT'}
            </Button>

            {/* Row 2 */}
            <Button
              variant="secondary"
              onClick={() => handleSaveAndPrintOrder('bill')}
              fullWidth
              disabled={isPrinting}
              icon={<IoDocumentTextOutline size={16} />}
              style={{
                height: '42px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 750,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'all 0.2s ease',
                background: isDark ? undefined : '#FFFFFF',
                border: isDark ? undefined : '1.5px solid #CBD5E1',
                color: isDark ? undefined : '#1E293B',
                boxShadow: isDark ? 'none' : '0 1px 2px rgba(15, 23, 42, 0.04)',
              }}
            >
              {isPrinting && printStatus.toLowerCase().includes('bill') && !printStatus.toLowerCase().includes('kot') ? 'Bill...' : 'Print Bill'}
            </Button>

            <Button
              variant="primary"
              onClick={() => handleSaveAndPrintOrder('both')}
              fullWidth
              disabled={isPrinting}
              style={{
                height: '42px',
                borderRadius: '10px',
                fontSize: '13.5px',
                fontWeight: 800,
                letterSpacing: '0.02em',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                background: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',
                boxShadow: '0 3px 12px rgba(249, 115, 22, 0.35)',
                transition: 'all 0.2s ease'

              }}

              onMouseEnter={(e) => {

                e.currentTarget.style.transform = 'translateY(-1px)';

                e.currentTarget.style.boxShadow = '0 4px 15px rgba(249, 115, 22, 0.4)';

              }}

              onMouseLeave={(e) => {

                e.currentTarget.style.transform = 'translateY(0)';

                e.currentTarget.style.boxShadow = '0 2px 10px rgba(249, 115, 22, 0.3)';

              }}

            >

              {isPrinting && (printStatus.toLowerCase().includes('bill') || printStatus.toLowerCase().includes('kot')) ? (

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

                  <div className="animate-spin" style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%' }}></div>

                  Printing...

                </div>

              ) : (

                <>

                  <IoReceiptOutline size={16} />

                  {editingBill ? 'UPDATE & KOT' : 'BILL & KOT'}

                </>

              )}

            </Button>

          </div>

        </div>

      </div>



      {

        error && (

          <div style={{

            position: 'fixed',

            bottom: currentTheme.spacing[4],

            left: '50%',

            transform: 'translateX(-50%)',

            zIndex: 1000,

          }}>

            <Card variant="error" padding="md">

              <div style={{

                fontSize: currentTheme.typography.fontSize.sm,

                color: currentTheme.colors.error[600],

                fontWeight: currentTheme.typography.fontWeight.medium,

              }}>{error}</div>

            </Card>

          </div>

        )

      }



      {/* Clear Confirmation Modal */}

      <>

        {showClearConfirm && (

          <div

            className="pmOverlay"

            onClick={cancelClear}

          >

            <div

              className="pmDialog"

              onClick={(e) => e.stopPropagation()}

            >

              <div className="pmDialogTitle">

                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">

                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

                </svg>

                Clear Current Bill?

              </div>

              <div className="pmDialogBody">

                This will remove all items from the current order. This action cannot be undone.

              </div>

              <div className="pmDialogActions">

                <button className="pmDialogBtn" onClick={cancelClear}>

                  Cancel

                </button>

                <button className="pmDialogBtn pmDialogBtnPrimary" onClick={confirmClear}>

                  Yes, Clear Bill

                </button>

              </div>

            </div>

          </div>

        )}

      </>

      {/* Recent 5 Bills Modal */}
      <AnimatePresence>
        {showRecentBills && (
          <div
            className="pmOverlay"
            onClick={() => setShowRecentBills(false)}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              backdropFilter: 'blur(6px)',
              zIndex: 1200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px'
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 15 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: '580px',
                maxHeight: '85vh',
                backgroundColor: isDark ? '#18191E' : '#FFFFFF',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #E2E8F0',
                borderRadius: '20px',
                boxShadow: '0 24px 60px rgba(0, 0, 0, 0.4)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}
            >
              {/* Modal Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '18px 22px',
                borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #E2E8F0',
                background: isDark ? 'rgba(255, 255, 255, 0.02)' : '#F8FAFC'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: 'rgba(255, 107, 26, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#FF6B1A'
                  }}>
                    <IoReceiptOutline size={20} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: isDark ? '#FFFFFF' : '#0F172A' }}>
                      Recent 5 Bills (Today)
                    </h3>
                    <p style={{ margin: 0, fontSize: '12px', color: isDark ? '#94A3B8' : '#64748B' }}>
                      Tap any order to load it into POS for editing or updating
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={fetchRecentBills}
                    disabled={loadingRecentBills}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '8px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      color: isDark ? '#94A3B8' : '#64748B',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.15s ease'
                    }}
                    title="Refresh recent bills"
                    onMouseEnter={(e) => e.currentTarget.style.color = '#FF6B1A'}
                    onMouseLeave={(e) => e.currentTarget.style.color = isDark ? '#94A3B8' : '#64748B'}
                  >
                    <IoRefreshOutline size={20} className={loadingRecentBills ? 'animate-spin' : ''} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRecentBills(false)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '8px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      color: isDark ? '#94A3B8' : '#64748B',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.15s ease'
                    }}
                    title="Close"
                    onMouseEnter={(e) => e.currentTarget.style.color = '#EF4444'}
                    onMouseLeave={(e) => e.currentTarget.style.color = isDark ? '#94A3B8' : '#64748B'}
                  >
                    <IoCloseOutline size={22} />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div style={{
                padding: '16px 20px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                {loadingRecentBills ? (
                  <div style={{
                    padding: '40px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px',
                    color: isDark ? '#94A3B8' : '#64748B'
                  }}>
                    <div className="animate-spin" style={{ width: '28px', height: '28px', border: '3px solid rgba(255, 107, 26, 0.2)', borderTopColor: '#FF6B1A', borderRadius: '50%' }} />
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>Loading recent bills...</span>
                  </div>
                ) : recentBills.length === 0 ? (
                  <div style={{
                    padding: '40px 20px',
                    textAlign: 'center',
                    color: isDark ? '#94A3B8' : '#64748B',
                    fontSize: '14px',
                    fontWeight: 600
                  }}>
                    No bills recorded for today yet.
                  </div>
                ) : (
                  recentBills.map((bill) => {
                    let items = [];
                    try {
                      const raw = bill.items || bill.products || [];
                      items = typeof raw === 'string' ? JSON.parse(raw) : raw;
                    } catch (_) {
                      items = [];
                    }

                    const isPaid = (bill.payment_status || '').toLowerCase() === 'paid' || bill.amount_pending === 0;
                    const itemsSummary = items.slice(0, 4).map(i => `${i.product_name || i.name} ×${i.quantity || 1}`).join(', ') + (items.length > 4 ? ` +${items.length - 4} more` : '');

                    return (
                      <div
                        key={bill.id || bill.bill_no}
                        onClick={() => handleSelectRecentBill(bill)}
                        style={{
                          padding: '14px 16px',
                          borderRadius: '14px',
                          border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1.5px solid #CBD5E1',
                          background: isDark ? '#1F2026' : '#FFFFFF',
                          boxShadow: isDark ? 'none' : '0 2px 6px rgba(15, 23, 42, 0.04)',
                          cursor: 'pointer',
                          transition: 'all 0.18s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = '#FF6B1A';
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 6px 18px rgba(255, 107, 26, 0.15)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = isDark ? 'rgba(255,255,255,0.08)' : '#CBD5E1';
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = isDark ? 'none' : '0 2px 6px rgba(15, 23, 42, 0.04)';
                        }}
                      >
                        {/* Top row: Bill No, Time, Badges */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '15px', fontWeight: 800, color: isDark ? '#FFFFFF' : '#0F172A' }}>
                              Bill {bill.bill_no}
                            </span>
                            {(bill.kot_no || bill.custom_kot_no) && (
                              <span style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '1px 6px',
                                borderRadius: '6px',
                                background: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9',
                                color: isDark ? '#94A3B8' : '#64748B'
                              }}>
                                KOT {bill.kot_no || bill.custom_kot_no}
                              </span>
                            )}
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: '6px',
                              textTransform: 'capitalize',
                              background: bill.order_type === 'takeaway' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(168, 85, 247, 0.12)',
                              color: bill.order_type === 'takeaway' ? '#3B82F6' : '#A855F7'
                            }}>
                              {bill.order_type || 'dine-in'}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '12px', color: isDark ? '#94A3B8' : '#64748B' }}>
                              {formatBillTime(bill.created_at)}
                            </span>
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 800,
                              padding: '2px 8px',
                              borderRadius: '999px',
                              background: isPaid ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                              color: isPaid ? '#10B981' : '#F59E0B'
                            }}>
                              {isPaid ? 'PAID' : 'PENDING'}
                            </span>
                          </div>
                        </div>

                        {/* Customer / Table info */}
                        {(bill.customer_name || bill.table_no) && (
                          <div style={{ fontSize: '12px', color: isDark ? '#CBD5E1' : '#475569', fontWeight: 600 }}>
                            {bill.table_no ? `Table ${bill.table_no}` : ''}
                            {bill.table_no && bill.customer_name ? ' • ' : ''}
                            {bill.customer_name ? `${bill.customer_name}` : ''}
                            {bill.customer_mobile ? ` (${bill.customer_mobile})` : ''}
                          </div>
                        )}

                        {/* Items preview */}
                        {itemsSummary && (
                          <div style={{
                            fontSize: '12px',
                            color: isDark ? '#94A3B8' : '#64748B',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}>
                            {itemsSummary}
                          </div>
                        )}

                        {/* Bottom row: Total & Callout */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginTop: '4px',
                          paddingTop: '6px',
                          borderTop: isDark ? '1px dashed rgba(255,255,255,0.06)' : '1px dashed #E2E8F0'
                        }}>
                          <div style={{ fontSize: '15px', fontWeight: 800, color: '#FF6B1A' }}>
                            {formatCurrency(bill.total || bill.total_amount || 0)}
                          </div>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '12px',
                            fontWeight: 700,
                            color: '#FF6B1A'
                          }}>
                            <span>Load Order</span>
                            <IoArrowForward size={14} />
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <VariationPickerModal

        product={variationModalProduct}

        open={!!variationModalProduct}

        onClose={() => setVariationModalProduct(null)}

        onSelect={(variation) => handleVariationSelect(variationModalProduct, variation)}

      />

    </div >

  );

};



export default WorkingPOSInterface;

