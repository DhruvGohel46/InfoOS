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
import GlobalSelect from '../ui/GlobalSelect';
import {
  IoSaveOutline,
  IoPrintOutline,
  IoReceiptOutline,
  IoDocumentTextOutline,
  IoMoveOutline,
  IoCheckmarkDoneOutline,
  IoCloseOutline,
  IoCreateOutline
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

    // Products: filter products for the current selected category
    const activeProds = products.filter(product => 
      selectedCategory === 'favorites' 
        ? !!product.favorite 
        : (product.category_id === selectedCategory || product.category === selectedCategory)
    );
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

      setOrderItems((bill.items || []).map((item) => ({

        ...item,

        line_key: getCartLineKey(item.product_id, item.variation_id),

      })));

      setOrderType(bill.order_type || 'dine-in');

      setTableNumber(bill.table_no || '');

    }

  }, [location.state]);



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

    if (selectedCategory === 'favorites') {

      categoryMatch = !!product.favorite;

    } else {

      categoryMatch = product.category_id === selectedCategory ||

        product.category === selectedCategory;

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

        customer_name: editingBill ? editingBill.customer_name : '',

        order_type: orderType,

        table_no: orderType === 'dine-in' ? tableNumber : ''

      };



      if (editingBill) {

        await billingAPI.updateBill(editingBill.bill_no, billData);

        showSuccess('Bill updated successfully');

        navigate('/analytics');

      } else {

        // Handle Offline State

        if (!isOnline) {

          syncService.addToQueue(billData);

          setOrderItems([]);

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

        setOrderItems([]);

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

          customer_name: '',

          order_type: orderType,

          table_no: orderType === 'dine-in' ? tableNumber : ''

        };

        syncService.addToQueue(billData);

        setOrderItems([]);

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

      

      if (type === 'bill') {

        await printerService.printBill(billNo);

      } else {

        await printerService.printKOT(billNo);

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

      await printerService.printBill(billNo);

      

      setPrintStatus('Preparing KOT...');

      await printerService.printKOT(billNo);

      

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

        customer_name: editingBill ? editingBill.customer_name : '',

        order_type: orderType,

        table_no: orderType === 'dine-in' ? tableNumber : ''

      };



      let billNo;

      if (editingBill) {

        await billingAPI.updateBill(editingBill.bill_no, billData);

        billNo = editingBill.bill_no;

      } else {

        if (!isOnline) {

          syncService.addToQueue(billData);

          setOrderItems([]);

          showWarning('Offline mode. Bill saved locally.');

          return;

        }



        const response = await billingAPI.createBill(billData);

        billNo = response.data.bill.bill_no;

      }



      // Execute Printing Workflow

      if (mode === 'both') {

        await handleBillAndKOT(billNo);

      } else if (mode === 'bill') {

        await handlePrintOnly(billNo, 'bill');

      } else if (mode === 'kot') {

        await handlePrintOnly(billNo, 'kot');

      }



      setOrderItems([]);

      if (onBillCreated && !editingBill) {

        onBillCreated({ bill_no: billNo, total: calculateTotal() });

      }

      refreshProducts();

      if (editingBill) navigate('/analytics');



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



  const confirmClear = () => {

    setOrderItems([]);

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

    background: isDark ? 'linear-gradient(180deg, #1E1E22 0%, #17171A 100%)' : 'linear-gradient(180deg, #FFFFFF 0%, #F1F5F9 100%)',

    borderRight: '1px solid var(--glass-border)',

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

    backgroundColor: isDark ? '#0f0f11' : '#F4F6F8', // Recreate exactly: Background #0f0f11

  };







  return (

    <div style={mainContainerStyle}>

      <div className="glass-sidebar" style={leftSidebarStyle}>

        <div style={{

          padding: '24px 20px',

          borderBottom: '1px solid var(--glass-border)',

          display: 'flex',

          flexDirection: 'column',

          gap: '24px'

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

                background: 'rgba(255,255,255,0.05)',

                border: '1px solid rgba(255,255,255,0.08)'

              }}

            />

          </div>



          {/* Item Groups Dropdown Selector */}

          <div style={{ width: '100%' }}>

            <GlobalSelect

              options={[

                { label: 'All Groups', value: 'all' },

                ...groups.map(group => ({

                  label: group.name,

                  value: group.id.toString()

                }))

              ]}

              value={selectedGroupId}

              onChange={(val) => setSelectedGroupId(val)}

              placeholder="Select Group"

            />

          </div>

        </div>



        <div className="pos-sidebar-scroll" style={{

          flex: 1,

          overflowY: 'auto',

          padding: '0 20px'

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
                  {editableCategories.map((category) => (
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
                  ))}
                </Reorder.Group>
              </>
            ) : (
              categories.map((category) => {
                const isActive = selectedCategory === category.id;
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
                      border: isActive ? '1px solid #FF8A00' : (isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #E2E8F0'),
                      borderRadius: '16px',
                      cursor: 'pointer',
                      color: isActive ? '#ffffff' : 'var(--text-secondary)',
                      transition: 'all 180ms cubic-bezier(0.16, 1, 0.3, 1)',
                      textAlign: 'left',
                      overflow: 'hidden',
                      boxShadow: isActive ? '0 8px 24px rgba(255,120,0,0.25)' : 'none'
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = isDark ? '#333333' : '#F1F5F9';
                        e.currentTarget.style.transform = 'translateX(3px)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = isDark ? '#2B2B2B' : '#FFFFFF';
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
                        }}
                      />
                    )}

                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                      flex: 1
                    }}>
                      <span style={{
                        fontSize: '16px',
                        fontWeight: '500',
                        color: isActive ? '#ffffff' : 'var(--text-secondary)',
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
            <div style={{ display: 'flex', gap: '10px' }}>
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

                gridTemplateColumns: 'repeat(auto-fill, minmax(calc(160px * var(--display-zoom)), 1fr))',

                gap: '16px',

                padding: '4px'

              }}

            >

              {(isEditMode ? editableProducts : displayedProducts).map((product) => {
                const productVariations = getProductVariations(product);
                const hasTwoVariations = productVariations.length === 2;

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
                        maxWidth: 'calc(250px * var(--display-zoom))',
                        display: 'flex',
                        flexDirection: 'column',
                        cursor: isEditMode ? 'grab' : (product.stock_status === 'Out of Stock' ? 'not-allowed' : (hasTwoVariations ? 'default' : 'pointer')),
                        opacity: product.stock_status === 'Out of Stock' ? 0.6 : 1,
                        position: 'relative',
                        boxSizing: 'border-box',
                        borderRadius: '20px',
                        background: isDark ? '#212121b3' : '#FFFFFF',
                        border: isEditMode ? '1.5px dashed #FF8A00' : (isDark ? '1px solid #4a4a4a' : '1px solid #E2E8F0'),
                        boxShadow: isEditMode ? '0 8px 24px rgba(255,138,0,0.15)' : 'inset 0 1px 0 rgba(255,255,255,0.05)',
                        transition: 'border-color 150ms ease, transform 150ms ease',
                        transform: isEditMode ? 'scale(1.03)' : 'none'
                      }}
                      onMouseEnter={(e) => {
                        if (!isEditMode) e.currentTarget.style.borderColor = isDark ? '#5a5a5a' : '#CBD5E1';
                      }}
                      onMouseLeave={(e) => {
                        if (!isEditMode) e.currentTarget.style.borderColor = isDark ? '#4a4a4a' : '#E2E8F0';
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

                      {/* Image Container */}
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
                              maxWidth: '72%',
                              maxHeight: '72%',
                              objectFit: 'contain',
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

                      {/* Product Name */}
                      <h4 style={{
                        fontFamily: 'Inter, system-ui',
                        fontSize: '16px',
                        fontWeight: 700,
                        color: isDark ? '#F2F2F2' : '#111827',
                        margin: '12px 0 10px 0',
                        textAlign: 'left',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {product.name}
                      </h4>

                      {/* Options or Single Price */}
                      {hasTwoVariations ? (
                        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
                                  height: '64px',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  padding: '0 12px',
                                  borderRadius: '12px',
                                  border: isDark ? '1px solid #555' : '1px solid #e2e8f0',
                                  background: isDark ? '#2d2d2d' : '#f8fafc',
                                  boxSizing: 'border-box',
                                  cursor: isEditMode ? 'default' : 'pointer',
                                  fontFamily: 'Inter, system-ui',
                                  transition: 'border-color 150ms ease'
                                }}
                                onMouseEnter={(e) => {
                                  if (!isEditMode) e.currentTarget.style.borderColor = isDark ? '#777' : '#cbd5e1';
                                }}
                                onMouseLeave={(e) => {
                                  if (!isEditMode) e.currentTarget.style.borderColor = isDark ? '#555' : '#e2e8f0';
                                }}
                              >
                                <div style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'flex-start',
                                  textAlign: 'left',
                                  fontWeight: 700,
                                  fontSize: '15px',
                                  color: isDark ? '#ECECEC' : '#111827',
                                  lineHeight: '1.2'
                                }}>
                                  {nameParts.map((part, index) => (
                                    <span key={index}>{part}</span>
                                  ))}
                                </div>
                                <div style={{
                                  fontWeight: 700,
                                  fontSize: '18px',
                                  color: '#ff6b00',
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
                            fontSize: '16px',
                            color: '#ff6b00',
                            fontFamily: 'Inter, system-ui'
                          }}>
                            {formatProductPriceLabel(product, formatCurrency, orderType)}
                          </span>

                          <div
                            style={{
                              width: '28px', 
                              height: '28px',
                              backgroundColor: '#ff6b00',
                              borderRadius: '50%',
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center',
                              color: 'white',
                              cursor: isEditMode ? 'default' : 'pointer'
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
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

        borderLeft: '1px solid var(--glass-border)',

        display: 'flex',

        flexDirection: 'column',

        height: '100%',

        overflow: 'hidden',

        boxShadow: 'var(--shadow-modal)',

        zIndex: 10,

        backgroundImage: 'var(--glass-modal)',

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

            borderBottom: `1px solid ${currentTheme.colors.border}`,

          }}>

            <h3 style={{

              margin: 0,

              fontSize: '18px',

              fontWeight: 700,

              color: currentTheme.colors.text.primary,

            }}>

              {editingBill ? `Editing #${editingBill.bill_no}` : 'Current Bill'}

              <span style={{ fontSize: '13px', color: currentTheme.colors.text.tertiary, fontWeight: 500, marginLeft: '8px' }}>

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

              }}

            >

              <TrashIcon color="currentColor" />

              <span style={{ fontSize: '0.8rem' }}>Clear All</span>

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

                padding: 'calc(5px * var(--display-zoom, 1))',

                borderRadius: '8px',

                border: orderType === 'dine-in' ? '2px solid var(--primary-500)' : '1px solid var(--glass-border)',

                backgroundColor: orderType === 'dine-in' ? 'rgba(249, 115, 22, 0.1)' : 'transparent',

                color: orderType === 'dine-in' ? 'var(--primary-500)' : 'var(--text-secondary)',

                fontWeight: 600,

                fontSize: '12.5px',

                cursor: 'pointer',

                transition: 'all 0.2s',

                display: 'flex',

                alignItems: 'center',

                justifyContent: 'center',

                gap: '6px'

              }}

            >

              Dine In

            </button>

            <button

              onClick={() => setOrderType('takeaway')}

              style={{

                padding: 'calc(5px * var(--display-zoom, 1))',

                borderRadius: '8px',

                border: orderType === 'takeaway' ? '2px solid var(--primary-500)' : '1px solid var(--glass-border)',

                backgroundColor: orderType === 'takeaway' ? 'rgba(249, 115, 22, 0.1)' : 'transparent',

                color: orderType === 'takeaway' ? 'var(--primary-500)' : 'var(--text-secondary)',

                fontWeight: 600,

                fontSize: '12.5px',

                cursor: 'pointer',

                transition: 'all 0.2s',

                display: 'flex',

                alignItems: 'center',

                justifyContent: 'center',

                gap: '6px'

              }}

            >

              Takeaway

            </button>

          </div>



          {/* Table Number Input for Dine In */}

          {orderType === 'dine-in' && (

            <div style={{

              display: 'flex',

              alignItems: 'center',

              gap: '6px',

              marginBottom: 'calc(8px * var(--display-zoom, 1))',

              padding: 'calc(5px * var(--display-zoom, 1))',

              borderRadius: '8px',

              backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#f3f4f6',

              border: '1px solid var(--glass-border)'

            }}>

              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Table Number:</span>

              <input

                type="text"

                value={tableNumber}

                onChange={(e) => setTableNumber(e.target.value)}

                placeholder="Optional (e.g. 5)"

                style={{

                  flex: 1,

                  padding: '3px 6px',

                  borderRadius: '6px',

                  border: '1px solid var(--glass-border)',

                  backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'white',

                  color: 'var(--text-primary)',

                  fontSize: '12px',

                  fontWeight: 600,

                  outline: 'none',

                }}

              />

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

              <div style={{ fontSize: '16px', fontWeight: 600, color: currentTheme.colors.text.primary }}>

                Your cart is empty

              </div>

              <div style={{ fontSize: '13px', opacity: 0.6, marginTop: '4px' }}>

                Add items to create a bill

              </div>

            </div>

          ) : (

            <div>

              <div style={{

                display: 'grid',

                gridTemplateColumns: '2fr 1fr 1fr',

                fontSize: '11px',

                fontWeight: currentTheme.typography.fontWeight.semibold,

                color: currentTheme.colors.text.secondary,

                marginBottom: '6px',

                paddingBottom: '4px',

                borderBottom: `1px solid ${currentTheme.colors.border}`,

                letterSpacing: currentTheme.typography.letterSpacing.wide,

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

                  padding: '3px 0',

                  borderBottom: `1px solid ${currentTheme.colors.border}`,

                }}>

                  <div>

                    <div style={{

                      fontSize: '12.5px',

                      fontWeight: currentTheme.typography.fontWeight.medium,

                      color: currentTheme.colors.text.primary,

                    }}>

                      {item.name}

                    </div>

                    <div style={{

                      fontSize: '10.5px',

                      color: currentTheme.colors.text.secondary,

                    }}>

                      {formatCurrency(item.price)} each

                    </div>

                  </div>



                  <div style={{ textAlign: 'center' }}>

                    <div style={{

                      display: 'flex',

                      alignItems: 'center',

                      justifyContent: 'center',

                      gap: '2px',

                    }}>

                      <Button

                        variant="ghost"

                        size="sm"

                        onClick={() => updateQuantity(lineKey, item.quantity - 1)}

                        style={{ minWidth: '22px', padding: '0', height: '22px', fontSize: '11px' }}

                      >

                        −

                      </Button>

                      <span style={{ minWidth: '24px', textAlign: 'center', fontSize: '12px' }}>

                        {item.quantity}

                      </span>

                      <Button

                        variant="ghost"

                        size="sm"

                        onClick={() => updateQuantity(lineKey, item.quantity + 1)}

                        style={{ minWidth: '22px', padding: '0', height: '22px', fontSize: '11px' }}

                      >

                        +

                      </Button>

                    </div>

                  </div>



                  <div style={{ textAlign: 'right', fontSize: '12.5px', fontFamily: 'monospace' }}>

                    {formatCurrency(item.price * item.quantity)}

                  </div>

                </div>

              );})}

            </div>

          )}

        </div>



        <div style={{

          borderTop: `1px solid ${currentTheme.colors.border}`,

          padding: '12px 16px',

          backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#F8F9FA'

        }}>



          {/* Total Amount Card */}

          <div style={{

            display: 'flex',

            justifyContent: 'space-between',

            alignItems: 'center',

            marginBottom: '12px',

            padding: '12px 16px',

            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF',

            borderRadius: '12px',

            border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #E5E7EB',

            boxShadow: isDark ? '0 2px 10px rgba(0,0,0,0.2)' : '0 2px 10px rgba(0,0,0,0.04)'

          }}>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

              <div style={{

                width: '30px',

                height: '30px',

                borderRadius: '8px',

                background: 'rgba(249, 115, 22, 0.1)',

                display: 'flex',

                alignItems: 'center',

                justifyContent: 'center',

                flexShrink: 0

              }}>

                <IoReceiptOutline size={16} color="#F97316" />

              </div>

              <span style={{

                fontSize: '11px',

                color: currentTheme.colors.text.secondary,

                fontWeight: 600,

                textTransform: 'uppercase',

                letterSpacing: '0.08em'

              }}>Total Amount</span>

            </div>

            <span style={{

              fontSize: '24px',

              fontFamily: 'monospace',

              fontWeight: 800,

              color: currentTheme.colors.text.primary,

              letterSpacing: '-0.5px'

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

                fontWeight: 600,

                display: 'flex',

                alignItems: 'center',

                justifyContent: 'center',

                gap: '6px',

                transition: 'all 0.2s ease'

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

                fontWeight: 600,

                display: 'flex',

                alignItems: 'center',

                justifyContent: 'center',

                gap: '6px',

                transition: 'all 0.2s ease'

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

                fontWeight: 600,

                display: 'flex',

                alignItems: 'center',

                justifyContent: 'center',

                gap: '6px',

                transition: 'all 0.2s ease'

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

                fontSize: '13px',

                fontWeight: 700,

                display: 'flex',

                alignItems: 'center',

                justifyContent: 'center',

                gap: '6px',

                background: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',

                boxShadow: '0 2px 10px rgba(249, 115, 22, 0.3)',

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

