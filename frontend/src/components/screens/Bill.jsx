import React, { useState, useEffect, useRef } from 'react';
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
  IoTimeOutline
} from 'react-icons/io5';
import { motion, Reorder } from 'framer-motion';
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
  const [activeField, setActiveField] = useState(null); // 'table' | 'kot' | 'customer' | 'mobile' | null

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
        showSuccess('Bill updated successfully');
        window.dispatchEvent(new CustomEvent('bill-updated', { detail: { bill_no: editingBill.bill_no, payment_status: paymentStatus } }));
        window.dispatchEvent(new CustomEvent('live-orders-refresh'));
        navigate(location.state?.from || '/analytics');
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
      refreshProducts();
      if (editingBill) navigate(location.state?.from || '/analytics');



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
    setActiveField(null);
  };

  const confirmClear = () => {
    resetBillState();
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



  const leftSidebarStyle = {

    width: 'calc(216px * var(--display-zoom))', // Decreased to 0.9x (from 240px) for better screen space balance
    background: isDark ? 'linear-gradient(180deg, #1E1E22 0%, #17171A 100%)' : '#FFFFFF',
    borderRight: isDark ? '1px solid var(--glass-border)' : '1px solid #E2E8F0',
    boxShadow: isDark ? 'none' : '2px 0 10px rgba(15, 23, 42, 0.04)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    zIndex: 2,
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

          padding: '24px 20px',

          borderBottom: '1px solid var(--glass-border)',

          display: 'flex',

          flexDirection: 'column',

          gap: '16px'

        }}>

          <div style={{

            position: 'relative',

            width: '100%'

          }}>

            <SearchBar
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Search categories..."
              style={{
                height: '48px',
                borderRadius: '14px',
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

          padding: '0 20px 16px 20px'

        }}>

          <div style={{

            display: 'flex',

            justifyContent: 'space-between',

            alignItems: 'center',

            marginBottom: '16px',

            marginTop: '24px',

            paddingLeft: '4px'

          }}>

            <h4 style={{

              fontSize: '14px',

              fontWeight: '600',

              letterSpacing: '0.5px',

              color: 'var(--text-secondary)',

              margin: 0

            }}>Categories</h4>

          </div>



          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {isEditMode ? (
              <>
                {/* Favorites is always static and not draggable */}
                <div
                  className="rounded-lg glass-card"
                  style={{
                    position: 'relative',
                    width: '100%',
                    height: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '0 16px',
                    backgroundColor: selectedCategory === 'favorites' ? (isDark ? '#2B2B2B' : '#E2E8F0') : (isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'),
                    border: isDark ? '1px solid rgba(255,255,255,0.04)' : '1px solid #E2E8F0',
                    borderRadius: '16px',
                    color: 'var(--text-muted)',
                    opacity: 0.5,
                    overflow: 'hidden'
                  }}
                >
                  <span style={{ fontSize: '16px', fontWeight: '500' }}>★ Favorites</span>
                </div>

                {/* Draggable categories list */}
                <Reorder.Group axis="y" values={editableCategories} onReorder={setEditableCategories} style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: 0, margin: 0, listStyle: 'none' }}>
                  {editableCategories.map((category) => {
                    const catColor = getCategoryColor(category, bootstrapCategories);
                    return (
                      <Reorder.Item key={category.id} value={category} style={{ listStyleType: 'none' }}>
                        <div
                          className="rounded-lg glass-card"
                          style={{
                            position: 'relative',
                            width: '100%',
                            height: '40px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '0 16px',
                            backgroundColor: isDark ? '#2B2B2B' : '#F1F5F9',
                            border: isDark ? '1px dashed rgba(255,255,255,0.2)' : '1px dashed #CBD5E1',
                            borderRadius: '16px',
                            cursor: 'grab',
                            color: 'var(--text-secondary)',
                            overflow: 'hidden'
                          }}
                        >
                          <IoMoveOutline style={{ opacity: 0.6, fontSize: '18px', color: '#FF8A00' }} />
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
                            fontSize: '16px',
                            fontWeight: '500',
                            color: 'var(--text-secondary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
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
                      height: '40px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '0 16px',
                      background: isActive ? 'linear-gradient(180deg, #FF8A00 0%, #FF6500 100%)' : (isDark ? '#2B2B2B' : '#FFFFFF'),
                      border: isActive ? '1px solid #FF8A00' : (isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #CBD5E1'),
                      borderRadius: '16px',
                      cursor: 'pointer',
                      color: isActive ? '#ffffff' : (isDark ? 'var(--text-secondary)' : '#334155'),
                      fontWeight: isActive ? 700 : 600,
                      transition: 'all 180ms cubic-bezier(0.16, 1, 0.3, 1)',
                      textAlign: 'left',
                      boxShadow: isActive ? '0 6px 18px rgba(255,107,0,0.30)' : (isDark ? 'none' : '0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)')
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = isDark ? '#333333' : '#F8FAFC';
                        e.currentTarget.style.borderColor = isDark ? '#5a5a5a' : '#FF8A00';
                        e.currentTarget.style.boxShadow = isDark ? 'none' : '0 3px 8px rgba(15, 23, 42, 0.08)';
                        e.currentTarget.style.transform = 'translateX(3px)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = isDark ? '#2B2B2B' : '#FFFFFF';
                        e.currentTarget.style.borderColor = isDark ? 'rgba(255,255,255,0.08)' : '#CBD5E1';
                        e.currentTarget.style.boxShadow = isDark ? 'none' : '0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)';
                        e.currentTarget.style.transform = 'translateX(0)';
                      }
                    }}
                  >

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
                          zIndex: 0,
                        }}
                      />
                    )}

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flex: 1,
                      overflow: 'hidden',
                      position: 'relative',
                      zIndex: 1,
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
                        fontSize: '16px',
                        fontWeight: '500',
                        color: isActive ? '#ffffff' : (isDark ? 'var(--text-secondary)' : '#334155'),
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
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
          padding: '16px 20px 20px 20px',
          borderTop: isDark ? '1px solid var(--glass-border)' : '1px solid #E2E8F0',
          background: isDark ? 'rgba(0,0,0,0.15)' : '#F8FAFC',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
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
                        borderTop: !isEditMode && isFavoritesView && catColor
                          ? `3.5px solid ${catColor.hex}`
                          : undefined,
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
                            e.currentTarget.style.borderTopColor = catColor.hex;
                            e.currentTarget.style.borderRightColor = `${catColor.hex}90`;
                            e.currentTarget.style.borderBottomColor = `${catColor.hex}90`;
                            e.currentTarget.style.borderLeftColor = `${catColor.hex}90`;
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
                            e.currentTarget.style.borderTopColor = catColor.hex;
                            e.currentTarget.style.borderRightColor = isDark ? `${catColor.hex}45` : `${catColor.hex}55`;
                            e.currentTarget.style.borderBottomColor = isDark ? `${catColor.hex}45` : `${catColor.hex}55`;
                            e.currentTarget.style.borderLeftColor = isDark ? `${catColor.hex}45` : `${catColor.hex}55`;
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

          {/* Order Type Toggle Selector */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'calc(8px * var(--display-zoom, 1))',
            marginBottom: 'calc(12px * var(--display-zoom, 1))'
          }}>
            <button
              onClick={() => setOrderType('dine-in')}
              style={{
                padding: 'calc(7px * var(--display-zoom, 1))',
                borderRadius: '10px',
                border: orderType === 'dine-in' ? '2px solid #EA580C' : (isDark ? '1px solid var(--glass-border)' : '1.5px solid #CBD5E1'),
                backgroundColor: orderType === 'dine-in' ? (isDark ? 'rgba(249, 115, 22, 0.16)' : '#FFF7ED') : (isDark ? 'transparent' : '#FFFFFF'),
                color: orderType === 'dine-in' ? '#EA580C' : (isDark ? 'var(--text-secondary)' : '#475569'),
                fontWeight: 750,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: isDark ? 'none' : (orderType === 'dine-in' ? '0 2px 6px rgba(234, 88, 12, 0.15)' : '0 1px 2px rgba(15, 23, 42, 0.04)'),
              }}
            >
              Dine In
            </button>
            <button
              onClick={() => setOrderType('takeaway')}
              style={{
                padding: 'calc(7px * var(--display-zoom, 1))',
                borderRadius: '10px',
                border: orderType === 'takeaway' ? '2px solid #EA580C' : (isDark ? '1px solid var(--glass-border)' : '1.5px solid #CBD5E1'),
                backgroundColor: orderType === 'takeaway' ? (isDark ? 'rgba(249, 115, 22, 0.16)' : '#FFF7ED') : (isDark ? 'transparent' : '#FFFFFF'),
                color: orderType === 'takeaway' ? '#EA580C' : (isDark ? 'var(--text-secondary)' : '#475569'),
                fontWeight: 750,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: isDark ? 'none' : (orderType === 'takeaway' ? '0 2px 6px rgba(234, 88, 12, 0.15)' : '0 1px 2px rgba(15, 23, 42, 0.04)'),
              }}
            >
              Takeaway
            </button>
          </div>

          {/* 4 Option Buttons: Table Number | KOT Number | Customer Name | Mobile Number */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '5px',
            marginBottom: 'calc(8px * var(--display-zoom, 1))'
          }}>
            {/* Table Number Button */}
            <button
              onClick={() => setActiveField(activeField === 'table' ? null : 'table')}
              style={{
                padding: 'calc(6px * var(--display-zoom, 1)) 2px',
                borderRadius: '8px',
                border: activeField === 'table'
                  ? '2px solid #EA580C'
                  : tableNumber
                    ? '1.5px solid #EA580C'
                    : isDark ? '1px solid var(--glass-border)' : '1.5px solid #CBD5E1',
                backgroundColor: activeField === 'table'
                  ? (isDark ? 'rgba(249, 115, 22, 0.16)' : '#FFF7ED')
                  : tableNumber
                    ? (isDark ? 'rgba(249, 115, 22, 0.1)' : '#FFF7ED')
                    : isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF',
                boxShadow: isDark ? 'none' : '0 1px 2px rgba(15, 23, 42, 0.04)',
                color: (activeField === 'table' || tableNumber) ? '#EA580C' : (isDark ? 'var(--text-secondary)' : '#334155'),
                fontWeight: 750,
                fontSize: '11.5px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px'
              }}
              title={tableNumber ? `Table: ${tableNumber}` : 'Table Number'}
            >
              {tableNumber ? `T: ${tableNumber}` : 'Table No'}
            </button>

            {/* KOT Number Button */}
            <button
              onClick={() => setActiveField(activeField === 'kot' ? null : 'kot')}
              style={{
                padding: 'calc(6px * var(--display-zoom, 1)) 2px',
                borderRadius: '8px',
                border: activeField === 'kot'
                  ? '2px solid #EA580C'
                  : kotNumber
                    ? '1.5px solid #EA580C'
                    : isDark ? '1px solid var(--glass-border)' : '1.5px solid #CBD5E1',
                backgroundColor: activeField === 'kot'
                  ? (isDark ? 'rgba(249, 115, 22, 0.16)' : '#FFF7ED')
                  : kotNumber
                    ? (isDark ? 'rgba(249, 115, 22, 0.1)' : '#FFF7ED')
                    : isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF',
                boxShadow: isDark ? 'none' : '0 1px 2px rgba(15, 23, 42, 0.04)',
                color: (activeField === 'kot' || kotNumber) ? '#EA580C' : (isDark ? 'var(--text-secondary)' : '#334155'),
                fontWeight: 750,
                fontSize: '11.5px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px'
              }}
              title={kotNumber ? `KOT: ${kotNumber}` : 'KOT Number'}
            >
              {kotNumber ? `KOT: ${kotNumber}` : 'KOT No'}
            </button>

            {/* Customer Name Button */}
            <button
              onClick={() => setActiveField(activeField === 'customer' ? null : 'customer')}
              style={{
                padding: 'calc(6px * var(--display-zoom, 1)) 2px',
                borderRadius: '8px',
                border: activeField === 'customer'
                  ? '2px solid #EA580C'
                  : customerName
                    ? '1.5px solid #EA580C'
                    : isDark ? '1px solid var(--glass-border)' : '1.5px solid #CBD5E1',
                backgroundColor: activeField === 'customer'
                  ? (isDark ? 'rgba(249, 115, 22, 0.16)' : '#FFF7ED')
                  : customerName
                    ? (isDark ? 'rgba(249, 115, 22, 0.1)' : '#FFF7ED')
                    : isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF',
                boxShadow: isDark ? 'none' : '0 1px 2px rgba(15, 23, 42, 0.04)',
                color: (activeField === 'customer' || customerName) ? '#EA580C' : (isDark ? 'var(--text-secondary)' : '#334155'),
                fontWeight: 750,
                fontSize: '11.5px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px'
              }}
              title={customerName ? `Name: ${customerName}` : 'Customer Name'}
            >
              {customerName ? `Name: ${customerName}` : 'Cus.Name'}
            </button>

            {/* Mobile Number Button */}
            <button
              onClick={() => setActiveField(activeField === 'mobile' ? null : 'mobile')}
              style={{
                padding: 'calc(6px * var(--display-zoom, 1)) 2px',
                borderRadius: '8px',
                border: activeField === 'mobile'
                  ? '2px solid #EA580C'
                  : customerMobile
                    ? '1.5px solid #EA580C'
                    : isDark ? '1px solid var(--glass-border)' : '1.5px solid #CBD5E1',
                backgroundColor: activeField === 'mobile'
                  ? (isDark ? 'rgba(249, 115, 22, 0.16)' : '#FFF7ED')
                  : customerMobile
                    ? (isDark ? 'rgba(249, 115, 22, 0.1)' : '#FFF7ED')
                    : isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF',
                boxShadow: isDark ? 'none' : '0 1px 2px rgba(15, 23, 42, 0.04)',
                color: (activeField === 'mobile' || customerMobile) ? '#EA580C' : (isDark ? 'var(--text-secondary)' : '#334155'),
                fontWeight: 750,
                fontSize: '11.5px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px'
              }}
              title={customerMobile ? `Mobile: ${customerMobile}` : 'Mobile Number'}
            >
              {customerMobile ? `Mob: ${customerMobile}` : 'Cus.Num'}
            </button>
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
            <button
              type="button"
              onClick={() => setPaymentStatus('paid')}
              style={{
                flex: 1,
                padding: '6px 10px',
                fontSize: '12px',
                fontWeight: 750,
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                background: paymentStatus === 'paid'
                  ? 'linear-gradient(135deg, #10B981, #059669)'
                  : 'transparent',
                color: paymentStatus === 'paid' ? '#FFFFFF' : (isDark ? '#94A3B8' : '#64748B'),
                boxShadow: paymentStatus === 'paid' ? '0 2px 8px rgba(16, 185, 129, 0.3)' : 'none'
              }}
            >
              <IoCheckmarkCircle size={14} /> Paid
            </button>
            <button
              type="button"
              onClick={() => setPaymentStatus('pending')}
              style={{
                flex: 1,
                padding: '6px 10px',
                fontSize: '12px',
                fontWeight: 750,
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                background: paymentStatus === 'pending'
                  ? 'linear-gradient(135deg, #F59E0B, #D97706)'
                  : 'transparent',
                color: paymentStatus === 'pending' ? '#FFFFFF' : (isDark ? '#94A3B8' : '#64748B'),
                boxShadow: paymentStatus === 'pending' ? '0 2px 8px rgba(245, 158, 11, 0.3)' : 'none'
              }}
            >
              <IoTimeOutline size={14} /> Mark Pending
            </button>
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

                  BILL & KOT

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

