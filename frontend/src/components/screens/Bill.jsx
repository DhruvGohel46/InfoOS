/**
 * =============================================================================
 * POINT OF SALE / BILLING INTERFACE - BILL.JSX
 * =============================================================================
 * 
 * ROLE: Main Point of Sale (POS) system for product billing and order management
 * 
 * RESPONSIBILITIES:
 * - Product catalog display with category filtering
 * - Shopping cart management and order processing
 * - Bill creation with multiple payment options
 * - Real-time order calculations and tax handling
 * - Product search and selection interface
 * - Print and save bill functionality
 * 
 * KEY FEATURES:
 * - Product grid with hover effects and category indicators
 * - Dynamic shopping cart with add/remove/update operations
 * - Multiple payment methods (Cash, Card, UPI)
 * - Real-time total calculations with tax
 * - Bill printing and saving capabilities
 * - Responsive design for tablets and desktops
 * 
 * COMPONENTS:
 * - ProductCard: Individual product display with hover effects
 * - ShoppingCart: Order management interface
 * - PaymentModal: Payment method selection
 * - BillPreview: Bill preview before printing
 * 
 * STATE MANAGEMENT:
 * - orderItems: Current shopping cart items
 * - selectedCategory: Active product category filter
 * - searchQuery: Product search functionality
 * - paymentMethod: Selected payment option
 * 
 * API INTEGRATION:
 * - productsAPI: Product catalog management
 * - billingAPI: Bill creation and management
 * - formatCurrency: Currency formatting utility
 * 
 * DESIGN PATTERNS:
 * - Functional component with multiple hooks
 * - Event-driven architecture for user interactions
 * - Theme-aware styling with hover states
 * - Framer Motion animations for interactions
 * - Responsive grid layout for products
 * 
 * USER WORKFLOW:
 * 1. Select products from catalog
 * 2. Add to shopping cart
 * 3. Review order and select payment method
 * 4. Create and save/print bill
 * 5. Auto-navigate back to products
 * =============================================================================
 */
import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { useSettings } from '../../context/SettingsContext';
import { useAlert } from '../../context/AlertContext';
import { usePOSData } from '../../context/POSDataContext';
import { useNetwork } from '../../context/NetworkContext';
import { useDebounce } from '../../hooks/useDebounce';
import { productsAPI, billingAPI, categoriesAPI } from '../../utils/api';
import { syncService } from '../../api/sync';
import { handleAPIError, formatCurrency } from '../../utils/api';
import { CATEGORY_COLORS } from '../../utils/constants';
import { printerService } from '../../services/printerService';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Input from '../ui/Input';
import SearchBar from '../ui/SearchBar';
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
  const showImages = settings?.show_product_images !== 'false';
  const { showSuccess, showWarning } = useAlert();
  const { isOnline } = useNetwork();

  // ── POS Data from global context (load-once pattern) ──
  const {
    products: bootstrapProducts,
    categories: bootstrapCategories,
    bootstrapLoading,
    refreshProducts
  } = usePOSData();

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([{ id: 'favorites', name: '★ Favorites' }]);
  const [selectedCategory, setSelectedCategory] = useState('favorites');
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300); // Debounced search
  const [visibleCount, setVisibleCount] = useState(50); // For lazy rendering
  const [orderItems, setOrderItems] = useState([]);
  const observerTarget = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearPassword, setClearPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printStatus, setPrintStatus] = useState('');

  // Edit Mode State
  const location = useLocation();
  const navigate = useNavigate();
  const [editingBill, setEditingBill] = useState(null);

  // Ref to prevent multiple rapid clicks
  const lastClickTime = useRef(0);

  // ── Sync from bootstrap context ──
  useEffect(() => {
    if (bootstrapProducts.length > 0) {
      setProducts(bootstrapProducts);
      setLoading(false);
    }
  }, [bootstrapProducts]);

  useEffect(() => {
    if (bootstrapCategories.length > 0) {
      setCategories([
        { id: 'favorites', name: '★ Favorites' },
        ...bootstrapCategories.map(c => ({ id: c.id, name: c.name }))
      ]);
    }
  }, [bootstrapCategories]);

  useEffect(() => {
    setLoading(bootstrapLoading);
  }, [bootstrapLoading]);

  useEffect(() => {
    // Check for edit mode
    if (location.state?.bill) {
      const bill = location.state.bill;
      setEditingBill(bill);
      setOrderItems(bill.items || []);
    }
  }, [location.state]);

  // Fallback: direct API call if bootstrap doesn't have data
  const loadProducts = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await productsAPI.getAllProducts({ include_stock: true });
      setProducts(response.data.products || []);
    } catch (err) {
      const apiError = handleAPIError(err);
      setError(apiError.message);
    } finally {
      setLoading(false);
    }
  };

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
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          setVisibleCount(prev => Math.min(prev + 50, filteredProducts.length));
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => {
      if (observerTarget.current) {
        observer.unobserve(observerTarget.current);
      }
    };
  }, [observerTarget, filteredProducts.length]);

  const handleAddItem = (product, event) => {
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

    setOrderItems(prev => {
      const existingIndex = prev.findIndex(item => item.product_id === product.product_id);

      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex].quantity += 1;
        return updated;
      } else {
        return [...prev, { ...product, quantity: 1 }];
      }
    });
  };

  const updateQuantity = (productId, quantity) => {
    if (quantity <= 0) {
      setOrderItems(prev => prev.filter(item => item.product_id !== productId));
    } else {
      setOrderItems(prev =>
        prev.map(item =>
          item.product_id === productId
            ? { ...item, quantity }
            : item
        )
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
        products: orderItems.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity
        })),
        print: false,
        customer_name: editingBill ? editingBill.customer_name : ''
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
          products: orderItems.map(item => ({
            product_id: item.product_id,
            quantity: item.quantity
          })),
          print: false,
          customer_name: ''
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
      showWarning('Printer error. Please check connections.');
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
      
      setPrintStatus('Cutting & Preparing KOT...');
      await new Promise(r => setTimeout(r, 1500)); // Buffer wait
      
      setPrintStatus('Printing KOT...');
      await printerService.printKOT(billNo);
      
      showSuccess('Bill & KOT printed successfully');
    } catch (err) {
      showWarning('Sequence interrupted. Check printer.');
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
        products: orderItems.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity
        })),
        print: false, // We handle printing manually for better control
        customer_name: editingBill ? editingBill.customer_name : ''
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

  const mainContainerStyle = {
    display: 'flex',
    height: '100%',
    backgroundColor: 'transparent', // Allow global background to show through
    fontFamily: currentTheme.typography.fontFamily.primary,
    overflow: 'hidden',
    boxSizing: 'border-box',
  };

  const leftSidebarStyle = {
    width: 'calc(180px * var(--display-zoom))', // Reduced from 240px
    backgroundColor: 'var(--glass-sidebar)',
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
    backgroundColor: currentTheme.colors.background, // Global background
  };

  // rightSectionStyle is unused now as we inlined it to fix nesting, but keeping for safety if referenced elsewhere or cleanup later.
  const rightSectionStyle = {
    width: '400px',
    backgroundColor: currentTheme.colors.surface,
    borderLeft: `1px solid ${currentTheme.colors.border}`,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  };

  return (
    <div style={mainContainerStyle}>
      <div className="glass-sidebar" style={leftSidebarStyle}>
        <div style={{
          padding: 'var(--spacing-5)',
          borderBottom: '1px solid var(--glass-border)',
        }}>
          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search items..."
          />
        </div>

        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: 'var(--spacing-3)',
        }}>
          <h4 style={{
            fontSize: 'var(--text-xs)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--text-secondary)',
            marginBottom: 'var(--spacing-3)',
            paddingLeft: 'var(--spacing-2)',
            fontWeight: 'var(--font-semibold)'
          }}>Categories</h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
            {categories.map((category) => {
              const isActive = selectedCategory === category.id;
              return (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                  className="rounded-lg glass-card"
                  style={{
                    position: 'relative',
                    width: '100%',
                    height: 'calc(48px * var(--display-zoom))', // Reduced from 56px
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--spacing-2)', // Reduced from 3
                    padding: '0 var(--spacing-2)', // Reduced from 3
                    backgroundColor: isActive ? 'var(--primary-500)' : 'transparent',
                    backgroundImage: isActive ? 'none' : 'var(--glass-card)',
                    border: isActive ? '1px solid var(--primary-500)' : '1px solid var(--glass-border)',
                    cursor: 'pointer',
                    color: isActive ? 'var(--text-inverse)' : 'var(--text-secondary)',
                    transition: 'all var(--transition-normal) var(--ease-out)',
                    textAlign: 'left',
                    backdropFilter: 'var(--glass-blur)',
                    WebkitBackdropFilter: 'var(--glass-blur)',
                    overflow: 'hidden' // Ensures the indicator fully conforms to the button's rounded corners
                  }}
                >
                  {isActive && (
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: 'calc(4px * var(--display-zoom))', // Scaled width
                        backgroundColor: 'var(--text-inverse)',
                        borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                      }}
                    />
                  )}

                  <div style={{
                    width: 'calc(28px * var(--display-zoom))', // Reduced from 32px
                    height: 'calc(28px * var(--display-zoom))', // Reduced from 32px
                     borderRadius: 'var(--radius-md)',
                      backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : 'transparent',
                      backgroundImage: isActive ? 'none' : 'var(--glass-card)',
                     display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isActive ? 'var(--text-inverse)' : 'var(--text-secondary)',
                    fontSize: 'calc(11px * var(--text-scale))', // Slightly smaller
                    fontWeight: 'var(--font-semibold)',
                    transition: 'all var(--transition-normal) var(--ease-out)',
                    border: isActive ? '1px solid rgba(255,255,255,0.3)' : '1px solid var(--glass-border)',
                    boxShadow: isActive ? 'none' : 'var(--shadow-button)',
                  }}>
                    {category.name.charAt(0)}
                  </div>

                  <span style={{
                    fontSize: 'var(--text-sm)', // Use token which supports text-scale
                    fontWeight: isActive ? 'var(--font-semibold)' : 'var(--font-medium)',
                    color: isActive ? 'var(--text-inverse)' : 'var(--text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {category.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={middleSectionStyle} className="reminders-scroll">
        <div style={{
          padding: 0, // Handled by Grid gap
          minHeight: 'calc(100% - 1rem)',
        }}>
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
                gridTemplateColumns: 'repeat(auto-fill, minmax(calc(160px * var(--display-zoom)), 1fr))', // Reduced from 200px
                gap: 'var(--spacing-4)', // Slightly tighter gap
                padding: '4px'
              }}
            >
              {displayedProducts.map((product) => (
                <div
                    key={product.product_id}
                >
                    <div 
                        className="glass-card lift-3d"
                        onClick={(e) => handleAddItem(product, e)}
                        style={{
                            padding: 'calc(10px * var(--display-zoom))',
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            cursor: product.stock_status === 'Out of Stock' ? 'not-allowed' : 'pointer',
                            opacity: product.stock_status === 'Out of Stock' ? 0.6 : 1,
                            position: 'relative',
                            overflow: 'hidden'
                        }}
                    >
                        
                        {/* Image Container */}
                        <div style={{
                            aspectRatio: '1/1',
                            width: '100%',
                            marginBottom: 'calc(10px * var(--display-zoom))',
                            borderRadius: 'calc(12px * var(--display-zoom))',
                            overflow: 'hidden',
                            backgroundColor: 'rgba(255,255,255,0.03)',
                            padding: 'calc(12px * var(--display-zoom))',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid var(--glass-border)',
                            position: 'relative',
                            zIndex: 2
                        }}>
                            {product.stock_status === 'Out of Stock' && (
                                <div style={{
                                    position: 'absolute', top: '8px', left: '8px',
                                    backgroundColor: 'var(--error-500)', color: 'white',
                                    fontSize: 'calc(10px * var(--text-scale))', fontWeight: 800,
                                    padding: '2px 6px', borderRadius: '4px', zIndex: 10,
                                    boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)'
                                }}>OUT</div>
                            )}

                            {product.image_filename ? (
                                <img
                                    src={productsAPI.getImageUrl(product.image_filename, product.updated_at)}
                                    alt={product.name}
                                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                    loading="lazy"
                                />
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.3 }}>
                                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                        <circle cx="8.5" cy="8.5" r="1.5" />
                                        <path d="M21 15l-5-5L5 21" />
                                    </svg>
                                    <span style={{ fontSize: 'calc(10px * var(--text-scale))', color: 'var(--text-muted)', fontWeight: 500 }}>No Image</span>
                                </div>
                            )}
                        </div>

                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 2 }}>
                            <h4 style={{
                                fontSize: 'calc(14px * var(--text-scale))',
                                fontWeight: 700,
                                color: 'var(--text-primary)',
                                margin: '0 0 6px 0',
                                lineHeight: 1.25,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                WebkitLineClamp: 2,
                                display: '-webkit-box',
                                WebkitBoxOrient: 'vertical',
                            }}>
                                {product.name}
                            </h4>
                            <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{
                                    fontSize: 'calc(15px * var(--text-scale))',
                                    fontWeight: 800,
                                    color: 'var(--primary-500)',
                                    textShadow: '0 0 10px rgba(249,115,22,0.15)'
                                }}>
                                    {formatCurrency(product.price)}
                                </span>

                                {/* Add Button */}
                                <div
                                    style={{
                                        width: 'calc(28px * var(--display-zoom))', 
                                        height: 'calc(28px * var(--display-zoom))',
                                        backgroundColor: 'var(--primary-500)',
                                        borderRadius: '50%',
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center',
                                        boxShadow: '0 4px 12px rgba(249,115,22,0.3)',
                                        color: 'white',
                                        transition: 'background-color 0.2s'
                                    }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                                        <path d="M12 5V19M5 12H19" />
                                    </svg>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
              ))}
              
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
          // No border bottom here, we want it clean
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
                fontSize: currentTheme.typography.fontSize.xs,
                fontWeight: currentTheme.typography.fontWeight.semibold,
                color: currentTheme.colors.text.secondary,
                marginBottom: currentTheme.spacing[3],
                paddingBottom: currentTheme.spacing[2],
                borderBottom: `1px solid ${currentTheme.colors.border}`,
                letterSpacing: currentTheme.typography.letterSpacing.wide,
              }}>
                <div>ITEMS</div>
                <div style={{ textAlign: 'center' }}>QTY.</div>
                <div style={{ textAlign: 'right' }}>PRICE</div>
              </div>

              {orderItems.map((item) => (
                <div key={item.product_id} style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr',
                  alignItems: 'center',
                  padding: `${currentTheme.spacing[2]} 0`,
                  borderBottom: `1px solid ${currentTheme.colors.border}`,
                }}>
                  <div>
                    <div style={{
                      fontSize: currentTheme.typography.fontSize.sm,
                      fontWeight: currentTheme.typography.fontWeight.medium,
                      color: currentTheme.colors.text.primary,
                    }}>
                      {item.name}
                    </div>
                    <div style={{
                      fontSize: currentTheme.typography.fontSize.xs,
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
                      gap: currentTheme.spacing[1],
                    }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                        style={{ minWidth: '28px', padding: '0' }}
                      >
                        −
                      </Button>
                      <span style={{ minWidth: '30px', textAlign: 'center' }}>
                        {item.quantity}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                        style={{ minWidth: '28px', padding: '0' }}
                      >
                        +
                      </Button>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    {formatCurrency(item.price * item.quantity)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{
          borderTop: `1px solid ${currentTheme.colors.border}`,
          padding: currentTheme.spacing[4],
        }}>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: currentTheme.spacing[3],
            padding: 'calc(16px * var(--display-zoom))',
            backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F6F7F9', // Glass-like strip
            borderRadius: '12px',
            border: isDark ? '1px solid rgba(255,255,255,0.03)' : 'none'
          }}>
            <span style={{
              fontSize: 'calc(14px * var(--text-scale))',
              color: currentTheme.colors.text.secondary,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>Total Amount</span>
            <span style={{
              fontSize: 'calc(24px * var(--text-scale))',
              fontFamily: 'monospace', // Tabular nums
              fontWeight: 700,
              color: currentTheme.colors.text.primary
            }}>
              {formatCurrency(calculateTotal())}
            </span>
          </div>

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'calc(10px * var(--display-zoom))',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'calc(10px * var(--display-zoom))' }}>
               <Button variant="secondary" onClick={handleSaveOrder} size="lg" fullWidth disabled={isPrinting}>
                {editingBill ? 'Update Only' : 'Save Only'}
              </Button>
              <Button variant="primary" onClick={() => handleSaveAndPrintOrder('bill')} size="lg" fullWidth disabled={isPrinting}>
                {isPrinting && printStatus.includes('Bill') ? 'Printing...' : 'Print Bill'}
              </Button>
            </div>
            
            <Button 
              variant="primary" 
              onClick={() => handleSaveAndPrintOrder('both')} 
              size="lg" 
              fullWidth 
              disabled={isPrinting}
              style={{
                background: 'linear-gradient(135deg, var(--primary-500) 0%, #f97316 100%)',
                boxShadow: '0 4px 15px rgba(249, 115, 22, 0.3)',
                height: 'calc(54px * var(--display-zoom))',
                fontSize: 'calc(16px * var(--text-scale))',
                fontWeight: 800
              }}
            >
              {isPrinting ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div className="animate-spin" style={{ width: '18px', height: '18px', border: '3px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%' }}></div>
                  {printStatus || 'Processing...'}
                </div>
              ) : (
                'BILL & KOT'
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
    </div >
  );
};

export default WorkingPOSInterface;
