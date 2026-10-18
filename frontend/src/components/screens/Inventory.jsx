import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { inventoryAPI, productsAPI, formatCurrency } from '../../utils/api';
import { useAlert } from '../../context/AlertContext';
import { useTheme } from '../../context/ThemeContext';
import PageContainer from '../layout/PageContainer';
import GlobalSelect from '../ui/GlobalSelect';
import {
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiPackage,
  FiAlertTriangle,
  FiTrendingUp,
  FiRefreshCw,
  FiX,
  FiCheckCircle,
  FiXCircle,
  FiCalendar,
  FiLayers,
  FiClock
} from 'react-icons/fi';
import '../../styles/Inventory.css';

const staggerContainer = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.04
    }
  }
};

const staggerItem = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22 } }
};

export default function Inventory() {
  const { showSuccess, showError, showWarning, showConfirm } = useAlert();
  const { isDark } = useTheme();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('ALL');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  // Batch & Expiry Modals
  const [batchModalItem, setBatchModalItem] = useState(null);
  const [batchMode, setBatchMode] = useState('batch'); // 'single' | 'batch'
  const [batchForm, setBatchForm] = useState({
    quantity: 1,
    expiry_date: '',
    batch_number: '',
    cost_per_unit: ''
  });
  const [viewBatchesItem, setViewBatchesItem] = useState(null);
  const [itemBatches, setItemBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(false);

  // Form Data
  const [formData, setFormData] = useState({
    name: '',
    type: 'DIRECT_SALE',
    unit: 'piece',
    stock: 0,
    unit_price: 0,
    alert_threshold: 10,
    product_id: '',
    expiry_date: '',
    default_batch_size: 1
  });

  const getSafeNumberValue = (val, defaultVal = '') => {
    if (val === null || val === undefined || val === '') return defaultVal;
    const num = parseFloat(val);
    return isNaN(num) ? defaultVal : num;
  };

  useEffect(() => {
    loadInventory();
    loadProducts();
  }, []);

  const loadInventory = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await inventoryAPI.getAllInventory();
      setItems(res.data.inventory || []);
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadProducts = async () => {
    try {
      const res = await productsAPI.getAllProducts({ include_inactive: true });
      setProducts(res.data.products || []);
    } catch (err) {
      console.error(err);
    }
  };

  // Metrics
  const metrics = useMemo(() => {
    const totalItems = items.length;
    const lowStock = items.filter((i) => i.stock <= i.alert_threshold && i.stock > 0).length;
    const outOfStock = items.filter((i) => i.stock <= 0).length;
    const expired = items.filter((i) => i.expiry_status === 'Expired').length;
    const expiringSoon = items.filter((i) => i.expiry_status === 'Expiring Soon').length;
    const totalValue = items.reduce((acc, curr) => {
      let price = curr.unit_price || 0;
      if (curr.type === 'DIRECT_SALE' && curr.product_id) {
        const p = products.find((x) => x.product_id === curr.product_id);
        if (p) price = p.price;
      }
      return acc + curr.stock * price;
    }, 0);
    return { totalItems, lowStock, outOfStock, totalValue, expired, expiringSoon };
  }, [items, products]);

  // Filtering & Sorting
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.unit && item.unit.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.expiry_date && item.expiry_date.includes(searchTerm));

      let matchesType = true;
      if (filterType === 'DIRECT_SALE') matchesType = item.type === 'DIRECT_SALE';
      else if (filterType === 'RAW_MATERIAL') matchesType = item.type === 'RAW_MATERIAL';
      else if (filterType === 'LOW_STOCK') matchesType = item.stock <= item.alert_threshold && item.stock > 0;
      else if (filterType === 'OUT_OF_STOCK') matchesType = item.stock <= 0;
      else if (filterType === 'EXPIRING') matchesType = item.expiry_status === 'Expired' || item.expiry_status === 'Expiring Soon';

      return matchesSearch && matchesType;
    });
  }, [items, searchTerm, filterType]);

  // Handlers
  const handleAddClick = () => {
    setSelectedItem(null);
    resetForm();
    setShowAddModal(true);
  };

  const handleRowClick = (item) => {
    if (item.is_locked) {
      showWarning('Item is locked (inactive product).');
      return;
    }
    setSelectedItem(item);
    setFormData({
      name: item.name,
      type: item.type,
      unit: item.unit,
      stock: item.stock,
      unit_price: item.unit_price || 0,
      alert_threshold: item.alert_threshold,
      product_id: item.product_id || '',
      expiry_date: item.expiry_date || '',
      default_batch_size: item.default_batch_size || 1
    });
    setShowAddModal(true);
  };

  const openBatchModal = (e, item) => {
    if (e) e.stopPropagation();
    if (item.is_locked) {
      showWarning('Item is locked (inactive product).');
      return;
    }
    setBatchModalItem(item);
    setBatchMode('batch');
    const defaultBatch = item.default_batch_size && Number(item.default_batch_size) > 1
      ? Number(item.default_batch_size)
      : 10;
    setBatchForm({
      quantity: defaultBatch,
      expiry_date: '',
      batch_number: '',
      cost_per_unit: item.unit_price || ''
    });
  };

  const handleBatchSubmit = async (e) => {
    e.preventDefault();
    if (!batchModalItem) return;

    const qty = parseFloat(batchForm.quantity);
    if (!qty || qty <= 0) {
      showError('Quantity must be greater than 0');
      return;
    }

    try {
      await inventoryAPI.addBatch({
        inventory_id: batchModalItem.id,
        quantity: qty,
        expiry_date: batchForm.expiry_date || null,
        batch_number: batchForm.batch_number ? batchForm.batch_number.trim() : null,
        cost_per_unit: batchForm.cost_per_unit ? parseFloat(batchForm.cost_per_unit) : null
      });

      const modeText = batchMode === 'single' ? 'Single unit' : `Batch of ${qty} units`;
      const expText = batchForm.expiry_date ? ` (Exp: ${batchForm.expiry_date})` : '';
      showSuccess(`Added ${modeText} to "${batchModalItem.name}"${expText}`, {
        title: 'Stock Added',
        category: 'inventory',
        action_route: '/inventory'
      });

      setBatchModalItem(null);
      loadInventory(true);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to add batch stock';
      showError(msg);
    }
  };

  const handleOpenBatches = async (e, item) => {
    if (e) e.stopPropagation();
    setViewBatchesItem(item);
    setLoadingBatches(true);
    try {
      const res = await inventoryAPI.getBatches(item.id);
      setItemBatches(res.data.batches || []);
    } catch (err) {
      showError('Failed to load item batches');
    } finally {
      setLoadingBatches(false);
    }
  };

  const handleDeleteBatch = async (batchId) => {
    const confirmed = await showConfirm({
      title: 'Delete Batch',
      description: 'Are you sure you want to delete this batch? The batch quantity will be subtracted from total stock.',
      confirmLabel: 'Delete Batch',
      cancelLabel: 'Cancel',
      variant: 'danger'
    });
    if (!confirmed) return;
    try {
      await inventoryAPI.deleteBatch(batchId);
      showSuccess('Batch deleted and inventory updated');
      if (viewBatchesItem) {
        const res = await inventoryAPI.getBatches(viewBatchesItem.id);
        setItemBatches(res.data.batches || []);
      }
      loadInventory(true);
    } catch (err) {
      showError('Failed to delete batch');
    }
  };

  const handleQuickStock = async (e, item, amount) => {
    e.stopPropagation();
    if (item.is_locked) return;

    const newStock = Math.max(0, item.stock + amount);
    const changeStr = amount > 0 ? `+${amount}` : `${amount}`;
    const unitStr = item.unit ? ` ${item.unit}` : ' unit';

    setItems((prevItems) =>
      prevItems.map((i) => {
        if (i.id === item.id) {
          let newStatus = 'In Stock';
          if (newStock <= 0) newStatus = 'Out of Stock';
          else if (newStock <= i.alert_threshold) newStatus = 'Low Stock';
          return { ...i, stock: newStock, status: newStatus };
        }
        return i;
      })
    );

    try {
      await inventoryAPI.adjustStock(item.id, amount);
      showSuccess(
        `Stock for "${item.name}" ${amount > 0 ? 'increased' : 'decreased'} by ${changeStr}${unitStr} (New stock: ${newStock}${unitStr})`,
        {
          title: 'Stock Updated',
          category: 'inventory',
          action_route: '/inventory'
        }
      );
      loadInventory(true);
    } catch (err) {
      showError(`Failed to update stock for "${item.name}"`);
      loadInventory();
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    const targetItem = items.find((i) => i.id === id);
    const itemName = targetItem ? targetItem.name : 'Inventory Item';
    const confirmed = await showConfirm({
      title: 'Delete Inventory Item',
      description: `Are you sure you want to delete "${itemName}"? This item will be permanently removed from your inventory.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger'
    });
    if (!confirmed) return;
    try {
      await inventoryAPI.deleteInventory(id);
      showSuccess(`"${itemName}" was permanently deleted from inventory`, {
        title: 'Inventory Item Deleted',
        category: 'inventory',
        action_route: '/inventory'
      });
      loadInventory(true);
    } catch (err) {
      showError(`Failed to delete "${itemName}"`);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      let payload = { ...formData };
      payload.stock = isNaN(parseFloat(payload.stock)) ? 0 : parseFloat(payload.stock);
      payload.alert_threshold = isNaN(parseInt(payload.alert_threshold)) ? 0 : parseInt(payload.alert_threshold);
      payload.default_batch_size = isNaN(parseFloat(payload.default_batch_size)) ? 1 : parseFloat(payload.default_batch_size);
      payload.expiry_date = payload.expiry_date || null;

      if (payload.type === 'DIRECT_SALE' && payload.product_id) {
        const p = products.find((x) => x.product_id === payload.product_id);
        if (p) payload.name = p.name;
      }

      const unitStr = payload.unit ? ` ${payload.unit}` : '';

      if (selectedItem) {
        setItems((prevItems) =>
          prevItems.map((i) => {
            if (i.id === selectedItem.id) {
              let newStatus = 'In Stock';
              if (payload.stock <= 0) newStatus = 'Out of Stock';
              else if (payload.stock <= payload.alert_threshold) newStatus = 'Low Stock';
              return { ...i, ...payload, status: newStatus };
            }
            return i;
          })
        );
        await inventoryAPI.updateInventory(selectedItem.id, payload);
        showSuccess(
          `Inventory item "${payload.name}" updated (Stock: ${payload.stock}${unitStr}, Alert Threshold: ${payload.alert_threshold})`,
          {
            title: 'Inventory Item Updated',
            category: 'inventory',
            action_route: '/inventory'
          }
        );
      } else {
        await inventoryAPI.createInventory(payload);
        showSuccess(`New inventory item "${payload.name}" created (Initial Stock: ${payload.stock}${unitStr})`, {
          title: 'Inventory Item Created',
          category: 'inventory',
          action_route: '/inventory'
        });
      }
      setShowAddModal(false);
      loadInventory(true);
    } catch (err) {
      showError(`Failed to save "${formData.name || 'inventory item'}"`);
      loadInventory();
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'DIRECT_SALE',
      unit: 'piece',
      stock: 0,
      unit_price: 0,
      alert_threshold: 10,
      product_id: '',
      expiry_date: '',
      default_batch_size: 1
    });
  };

  const getStockColor = (item) => {
    if (item.stock <= 0) return '#EF4444';
    if (item.stock <= item.alert_threshold) return '#F59E0B';
    return '#10B981';
  };

  const filterTabs = [
    { key: 'ALL', label: 'All Items', count: items.length },
    { key: 'DIRECT_SALE', label: 'Direct Sale', count: items.filter((i) => i.type === 'DIRECT_SALE').length },
    { key: 'RAW_MATERIAL', label: 'Raw Material', count: items.filter((i) => i.type === 'RAW_MATERIAL').length },
    { key: 'LOW_STOCK', label: 'Low Stock', count: metrics.lowStock },
    { key: 'EXPIRING', label: 'Expiring Soon', count: metrics.expired + metrics.expiringSoon },
    { key: 'OUT_OF_STOCK', label: 'Out of Stock', count: metrics.outOfStock }
  ];

  return (
    <PageContainer>
      <div className="inventory-page-wrap">
        {/* ─── Unified Header Card (24px Curve, Black-Grey) ─── */}
        <div
          style={{
            padding: '18px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: isDark ? 'linear-gradient(165deg, #18191D 0%, #111215 100%)' : '#FFFFFF',
            border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #E2E8F0',
            borderRadius: '24px',
            boxShadow: isDark
              ? '0 10px 30px -8px rgba(0, 0, 0, 0.5)'
              : '0 4px 20px -2px rgba(15, 23, 42, 0.05), 0 0 1px 1px rgba(0, 0, 0, 0.02)',
            flexWrap: 'wrap',
            gap: '16px'
          }}
        >
          <div>
            <h1
              style={{
                fontSize: '1.65rem',
                fontWeight: '900',
                margin: 0,
                color: isDark ? '#FFFFFF' : '#0F172A',
                letterSpacing: '-0.02em',
                lineHeight: 1.2
              }}
            >
              Inventory
            </h1>
            <p
              style={{
                margin: '4px 0 0 0',
                color: isDark ? '#94A3B8' : '#64748B',
                fontSize: '0.88rem',
                fontWeight: 500
              }}
            >
              Manage real-time stock levels, raw material quantities, and low stock reorder alerts
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => loadInventory()}
              disabled={loading}
              title="Refresh inventory"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                height: '40px',
                padding: '0 16px',
                borderRadius: '12px',
                fontSize: '0.84rem',
                fontWeight: '700',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #CBD5E1',
                background: isDark ? '#16171B' : '#FFFFFF',
                color: isDark ? '#FFFFFF' : '#0F172A',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.18s ease',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
            >
              <FiRefreshCw className={loading ? 'spinner' : ''} size={15} /> Refresh
            </button>

            <button
              type="button"
              onClick={handleAddClick}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                height: '40px',
                padding: '0 20px',
                borderRadius: '14px',
                fontSize: '0.88rem',
                fontWeight: 800,
                border: 'none',
                background: 'linear-gradient(135deg, #FF6B1A 0%, #EA580C 100%)',
                color: '#FFFFFF',
                boxShadow: '0 6px 20px rgba(255, 107, 26, 0.35)',
                cursor: 'pointer',
                transition: 'all 0.18s ease',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
            >
              <FiPlus size={18} /> Add Inventory Item
            </button>
          </div>
        </div>

        {/* ─── Metric Summary Cards (3-Column Modern Glass) ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
          {[
            {
              label: 'Total Items',
              value: metrics.totalItems,
              subtext: `${items.filter((i) => i.type === 'DIRECT_SALE').length} direct, ${items.filter((i) => i.type === 'RAW_MATERIAL').length} materials`,
              color: '#3B82F6',
              icon: <FiPackage size={22} />
            },
            {
              label: 'Low & Out of Stock',
              value: `${metrics.lowStock + metrics.outOfStock}`,
              subtext: `${metrics.lowStock} low, ${metrics.outOfStock} out of stock`,
              color: metrics.lowStock + metrics.outOfStock > 0 ? '#EF4444' : '#10B981',
              icon: <FiAlertTriangle size={22} />
            },
            {
              label: 'Expiring / Expired',
              value: `${metrics.expired + metrics.expiringSoon}`,
              subtext: `${metrics.expired} expired, ${metrics.expiringSoon} within 7 days`,
              color: metrics.expired > 0 ? '#EF4444' : metrics.expiringSoon > 0 ? '#F59E0B' : '#10B981',
              icon: <FiClock size={22} />
            },
            {
              label: 'Estimated Stock Value',
              value: formatCurrency(metrics.totalValue),
              subtext: 'Calculated from inventory pricing',
              color: '#10B981',
              icon: <FiTrendingUp size={22} />
            }
          ].map((card, idx) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '18px 22px',
                background: isDark ? 'linear-gradient(165deg, #18191D 0%, #111215 100%)' : '#FFFFFF',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #E2E8F0',
                borderRadius: '24px',
                boxShadow: isDark
                  ? '0 10px 30px -8px rgba(0, 0, 0, 0.5)'
                  : '0 4px 20px -2px rgba(15, 23, 42, 0.05), 0 0 1px 1px rgba(0, 0, 0, 0.02)'
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '16px',
                  background: `${card.color}15`,
                  border: `1px solid ${card.color}30`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: card.color,
                  flexShrink: 0
                }}
              >
                {card.icon}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: '800',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: isDark ? '#94A3B8' : '#64748B'
                  }}
                >
                  {card.label}
                </span>
                <span
                  style={{
                    fontSize: '1.45rem',
                    fontWeight: '850',
                    color: isDark ? '#FFFFFF' : '#0F172A',
                    letterSpacing: '-0.02em'
                  }}
                >
                  {card.value}
                </span>
                <span
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: isDark ? '#64748B' : '#94A3B8',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {card.subtext}
                </span>
              </div>
            </motion.div>
          ))}
        </div>

        {/* ─── Controls: Search & Filter Tabs ─── */}
        <div
          style={{
            display: 'flex',
            gap: '14px',
            alignItems: 'center',
            flexWrap: 'wrap',
            zIndex: 10
          }}
        >
          {/* Search Bar */}
          <div className="inventory-search" style={{ flex: '1 1 280px' }}>
            <FiSearch className="inventory-search-icon" size={16} />
            <input
              className="inventory-search-input"
              type="text"
              placeholder="Search inventory items by name, unit..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                height: '42px',
                borderRadius: '14px',
                background: isDark ? '#16171B' : '#FFFFFF',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #CBD5E1',
                color: isDark ? '#FFFFFF' : '#0F172A',
                fontSize: '0.90rem',
                fontWeight: 600
              }}
            />
          </div>

          {/* Filter Pills */}
          <div
            style={{
              display: 'inline-flex',
              background: isDark ? '#16171B' : '#F1F5F9',
              borderRadius: '14px',
              padding: '3px',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #CBD5E1',
              gap: '3px',
              overflowX: 'auto',
              maxWidth: '100%'
            }}
          >
            {filterTabs.map((tab) => {
              const isActive = filterType === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setFilterType(tab.key)}
                  style={{
                    position: 'relative',
                    padding: '7px 16px',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '0.84rem',
                    fontWeight: '700',
                    background: 'transparent',
                    color: isActive ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    flexShrink: 0
                  }}
                >
                  {isActive && (
                    <motion.div
                      layoutId="inventory-filter-active-pill"
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(135deg, #FF6B1A 0%, #EA580C 100%)',
                        borderRadius: '10px',
                        boxShadow: '0 2px 8px rgba(255, 107, 26, 0.3)',
                        zIndex: 1
                      }}
                    />
                  )}
                  <span style={{ position: 'relative', zIndex: 2 }}>{tab.label}</span>
                  <span
                    style={{
                      position: 'relative',
                      zIndex: 2,
                      fontSize: '0.72rem',
                      padding: '1px 6px',
                      borderRadius: '999px',
                      background: isActive ? 'rgba(0, 0, 0, 0.25)' : isDark ? '#1F2026' : '#E2E8F0',
                      color: isActive ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B',
                      fontWeight: 800
                    }}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── Inventory List / Table ─── */}
        <div style={{ flex: 1, paddingBottom: '24px' }}>
          {loading ? (
            <div
              style={{
                padding: '60px',
                textAlign: 'center',
                color: isDark ? '#94A3B8' : '#64748B',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px'
              }}
            >
              <div className="spinner" />
              <span style={{ fontWeight: 600 }}>Loading inventory items...</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div
              style={{
                padding: '50px 30px',
                textAlign: 'center',
                background: isDark ? '#16171B' : '#FFFFFF',
                border: isDark ? '2px dashed rgba(255, 255, 255, 0.08)' : '2px dashed #CBD5E1',
                borderRadius: '24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px'
              }}
            >
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '18px',
                  background: 'rgba(255, 107, 26, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FF6B1A'
                }}
              >
                <FiPackage size={26} />
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: isDark ? '#FFFFFF' : '#0F172A' }}>
                No Inventory Items Found
              </div>
              <p style={{ fontSize: '0.88rem', color: isDark ? '#94A3B8' : '#64748B', margin: 0, maxWidth: '420px' }}>
                {searchTerm || filterType !== 'ALL'
                  ? 'No inventory records match your active search or filter selection.'
                  : 'Start tracking stock levels, packaging materials, and ingredients.'}
              </p>
              {!searchTerm && filterType === 'ALL' && (
                <button
                  onClick={handleAddClick}
                  style={{
                    marginTop: '8px',
                    padding: '10px 24px',
                    borderRadius: '12px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #FF6B1A 0%, #EA580C 100%)',
                    color: '#FFFFFF',
                    fontWeight: 750,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(255, 107, 26, 0.3)'
                  }}
                >
                  Create First Item
                </button>
              )}
            </div>
          ) : (
            <motion.div
              variants={staggerContainer}
              initial="initial"
              animate="animate"
              style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
            >
              {/* Table Header */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.7fr 110px 1.2fr 130px 110px 200px',
                  gap: '16px',
                  padding: '8px 24px',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: isDark ? '#64748B' : '#94A3B8'
                }}
                className="inventory-table-desktop-header"
              >
                <div>Item Name / Type</div>
                <div>Stock Level</div>
                <div>Health Bar</div>
                <div>Expiry Date</div>
                <div>Status</div>
                <div style={{ textAlign: 'right' }}>Quick Adjust & Actions</div>
              </div>

              {/* Rows */}
              {filteredItems.map((item) => {
                const isLow = item.stock <= item.alert_threshold && item.stock > 0;
                const isOut = item.stock <= 0;
                const stockColor = getStockColor(item);

                return (
                  <motion.div
                    key={item.id}
                    variants={staggerItem}
                    whileHover={{ y: -2 }}
                    onClick={() => handleRowClick(item)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.7fr 110px 1.2fr 130px 110px 200px',
                      gap: '16px',
                      alignItems: 'center',
                      padding: '16px 24px',
                      background: isDark ? 'linear-gradient(165deg, #18191D 0%, #111215 100%)' : '#FFFFFF',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #E2E8F0',
                      borderRadius: '20px',
                      boxShadow: isDark
                        ? '0 6px 20px -6px rgba(0, 0, 0, 0.4)'
                        : '0 2px 10px rgba(15, 23, 42, 0.04)',
                      cursor: 'pointer',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      opacity: item.is_locked ? 0.6 : 1
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255, 107, 26, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0';
                    }}
                  >
                    {/* Item Name & Type */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                      <div
                        style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '12px',
                          background:
                            item.type === 'DIRECT_SALE'
                              ? 'rgba(59, 130, 246, 0.12)'
                              : 'rgba(249, 115, 22, 0.12)',
                          border:
                            item.type === 'DIRECT_SALE'
                              ? '1px solid rgba(59, 130, 246, 0.25)'
                              : '1px solid rgba(249, 115, 22, 0.25)',
                          color: item.type === 'DIRECT_SALE' ? '#3B82F6' : '#FF6B1A',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                      >
                        <FiPackage size={18} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span
                          style={{
                            fontSize: '0.98rem',
                            fontWeight: 800,
                            color: isDark ? '#FFFFFF' : '#0F172A',
                            letterSpacing: '-0.01em',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {item.name}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', flexWrap: 'wrap' }}>
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 750,
                              padding: '2px 8px',
                              borderRadius: '999px',
                              background:
                                item.type === 'DIRECT_SALE'
                                  ? 'rgba(59, 130, 246, 0.1)'
                                  : 'rgba(249, 115, 22, 0.1)',
                              color: item.type === 'DIRECT_SALE' ? '#3B82F6' : '#FF6B1A',
                              whiteSpace: 'nowrap',
                              display: 'inline-flex',
                              alignItems: 'center'
                            }}
                          >
                            {item.type === 'DIRECT_SALE' ? 'Direct Sale' : 'Raw Material'}
                          </span>
                          {item.batch_count > 0 && (
                            <button
                              type="button"
                              onClick={(e) => handleOpenBatches(e, item)}
                              style={{
                                padding: '1px 7px',
                                borderRadius: '6px',
                                border: isDark ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid #A7F3D0',
                                background: isDark ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5',
                                color: isDark ? '#34D399' : '#059669',
                                fontSize: '0.68rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                              title="Click to view batches for this item"
                            >
                              <FiLayers size={10} />
                              <span>{item.batch_count} {item.batch_count === 1 ? 'batch' : 'batches'}</span>
                            </button>
                          )}
                          {item.unit_price > 0 && (
                            <span style={{ fontSize: '0.75rem', color: isDark ? '#64748B' : '#94A3B8', fontWeight: 600 }}>
                              • {formatCurrency(item.unit_price)}/unit
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Stock Level Badge */}
                    <div>
                      <span
                        style={{
                          fontSize: '0.86rem',
                          fontWeight: 850,
                          padding: '5px 12px',
                          borderRadius: '999px',
                          background: isDark ? '#1C1D22' : '#F1F5F9',
                          border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #CBD5E1',
                          color: isDark ? '#FFFFFF' : '#0F172A',
                          whiteSpace: 'nowrap',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          flexShrink: 0
                        }}
                      >
                        <span style={{ color: stockColor, fontWeight: 900 }}>{item.stock}</span>
                        <span style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: '0.78rem', fontWeight: 600 }}>
                          {item.unit}s
                        </span>
                      </span>
                    </div>

                    {/* Health Bar */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <div
                        style={{
                          width: '100%',
                          height: '7px',
                          borderRadius: '999px',
                          background: isDark ? '#1F2026' : '#E2E8F0',
                          overflow: 'hidden',
                          position: 'relative'
                        }}
                      >
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{
                            width: `${Math.min((item.stock / (item.alert_threshold * 3 || 100)) * 100, 100)}%`
                          }}
                          transition={{ duration: 0.6, ease: 'easeOut' }}
                          style={{
                            height: '100%',
                            background: stockColor,
                            borderRadius: '999px'
                          }}
                        />
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '0.72rem',
                          color: isDark ? '#64748B' : '#94A3B8',
                          fontWeight: 600,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        <span>Alert at ≤ {item.alert_threshold}</span>
                        {isOut ? (
                          <span style={{ color: '#EF4444', fontWeight: 750 }}>Out</span>
                        ) : isLow ? (
                          <span style={{ color: '#F59E0B', fontWeight: 750 }}>Low</span>
                        ) : (
                          <span style={{ color: '#10B981', fontWeight: 750 }}>Good</span>
                        )}
                      </div>
                    </div>

                    {/* Expiry Column */}
                    <div>
                      {item.expiry_date ? (
                        <div
                          onClick={(e) => {
                            if (item.batch_count > 0) handleOpenBatches(e, item);
                          }}
                          style={{
                            display: 'inline-flex',
                            flexDirection: 'column',
                            gap: '2px',
                            cursor: item.batch_count > 0 ? 'pointer' : 'default'
                          }}
                          title={item.batch_count > 0 ? 'Click to inspect individual batches' : `Nearest expiry: ${item.expiry_date}`}
                        >
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 9px',
                              borderRadius: '999px',
                              background:
                                item.expiry_status === 'Expired'
                                  ? 'rgba(239, 68, 68, 0.12)'
                                  : item.expiry_status === 'Expiring Soon'
                                  ? 'rgba(245, 158, 11, 0.12)'
                                  : 'rgba(16, 185, 129, 0.1)',
                              border:
                                item.expiry_status === 'Expired'
                                  ? '1px solid rgba(239, 68, 68, 0.3)'
                                  : item.expiry_status === 'Expiring Soon'
                                  ? '1px solid rgba(245, 158, 11, 0.3)'
                                  : '1px solid rgba(16, 185, 129, 0.25)',
                              color:
                                item.expiry_status === 'Expired'
                                  ? '#EF4444'
                                  : item.expiry_status === 'Expiring Soon'
                                  ? '#F59E0B'
                                  : '#10B981',
                              fontSize: '0.74rem',
                              fontWeight: 800,
                              whiteSpace: 'nowrap'
                            }}
                          >
                            <FiCalendar size={11} />
                            {item.expiry_status === 'Expired'
                              ? 'Expired'
                              : item.expiry_status === 'Expiring Soon'
                              ? `${item.days_to_expiry}d left`
                              : item.expiry_date}
                          </span>
                          <span style={{ fontSize: '0.68rem', color: isDark ? '#64748B' : '#94A3B8', fontWeight: 600 }}>
                            {item.expiry_date}
                          </span>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.74rem', color: isDark ? '#64748B' : '#94A3B8', fontWeight: 600 }}>
                          No Expiry
                        </span>
                      )}
                    </div>

                    {/* Status Capsule */}
                    <div>
                      {isOut ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 10px',
                            borderRadius: '999px',
                            background: 'rgba(239, 68, 68, 0.12)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            color: '#EF4444',
                            fontSize: '0.75rem',
                            fontWeight: 750,
                            whiteSpace: 'nowrap',
                            flexShrink: 0
                          }}
                        >
                          <FiXCircle size={12} /> Out of Stock
                        </span>
                      ) : isLow ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 10px',
                            borderRadius: '999px',
                            background: 'rgba(245, 158, 11, 0.12)',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                            color: '#F59E0B',
                            fontSize: '0.75rem',
                            fontWeight: 750,
                            whiteSpace: 'nowrap',
                            flexShrink: 0
                          }}
                        >
                          <FiAlertTriangle size={12} /> Low Stock
                        </span>
                      ) : (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 10px',
                            borderRadius: '999px',
                            background: 'rgba(16, 185, 129, 0.12)',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            color: '#10B981',
                            fontSize: '0.75rem',
                            fontWeight: 750,
                            whiteSpace: 'nowrap',
                            flexShrink: 0
                          }}
                        >
                          <FiCheckCircle size={12} /> In Stock
                        </span>
                      )}
                    </div>

                    {/* Quick Adjust & Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '6px' }}>
                      {/* Stepper buttons */}
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          background: isDark ? '#1C1D22' : '#F1F5F9',
                          borderRadius: '8px',
                          border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #CBD5E1',
                          overflow: 'hidden'
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={(e) => handleQuickStock(e, item, -1)}
                          disabled={item.is_locked || item.stock <= 0}
                          title="Quick Reduce 1"
                          style={{
                            width: '28px',
                            height: '28px',
                            border: 'none',
                            background: 'transparent',
                            color: isDark ? '#FFFFFF' : '#0F172A',
                            fontWeight: 800,
                            fontSize: '1rem',
                            cursor: item.is_locked || item.stock <= 0 ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background 0.15s ease'
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          -
                        </button>
                        <div
                          style={{
                            width: '1px',
                            height: '16px',
                            background: isDark ? 'rgba(255, 255, 255, 0.1)' : '#CBD5E1'
                          }}
                        />
                        <button
                          type="button"
                          onClick={(e) => handleQuickStock(e, item, 1)}
                          disabled={item.is_locked}
                          title="Quick Add 1"
                          style={{
                            width: '28px',
                            height: '28px',
                            border: 'none',
                            background: 'transparent',
                            color: isDark ? '#FFFFFF' : '#0F172A',
                            fontWeight: 800,
                            fontSize: '1rem',
                            cursor: item.is_locked ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background 0.15s ease'
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(16, 185, 129, 0.15)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          +
                        </button>
                      </div>

                      {/* Add Batch Button */}
                      <button
                        type="button"
                        onClick={(e) => openBatchModal(e, item)}
                        disabled={item.is_locked}
                        title="Add Stock / Batch with Expiry"
                        style={{
                          height: '30px',
                          padding: '0 8px',
                          borderRadius: '8px',
                          border: isDark ? '1px solid rgba(255, 107, 26, 0.35)' : '1px solid #FDBA74',
                          background: isDark ? 'rgba(255, 107, 26, 0.12)' : '#FFF7ED',
                          color: '#FF6B1A',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontWeight: 800,
                          fontSize: '0.72rem',
                          cursor: item.is_locked ? 'not-allowed' : 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = isDark ? 'rgba(255, 107, 26, 0.22)' : '#FFEDD5';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = isDark ? 'rgba(255, 107, 26, 0.12)' : '#FFF7ED';
                        }}
                      >
                        <FiPlus size={12} />
                        <span>Batch</span>
                      </button>

                      {/* Edit Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRowClick(item);
                        }}
                        disabled={item.is_locked}
                        title="Edit Item"
                        style={{
                          width: '30px',
                          height: '30px',
                          borderRadius: '8px',
                          border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #CBD5E1',
                          background: isDark ? '#1C1D22' : '#F8FAFC',
                          color: isDark ? '#94A3B8' : '#64748B',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: item.is_locked ? 'not-allowed' : 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#3B82F6';
                          e.currentTarget.style.borderColor = '#3B82F6';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = isDark ? '#94A3B8' : '#64748B';
                          e.currentTarget.style.borderColor = isDark ? 'rgba(255, 255, 255, 0.08)' : '#CBD5E1';
                        }}
                      >
                        <FiEdit2 size={13} />
                      </button>

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={(e) => handleDelete(e, item.id)}
                        title="Delete Item"
                        style={{
                          width: '30px',
                          height: '30px',
                          borderRadius: '8px',
                          border: '1px solid rgba(239, 68, 68, 0.25)',
                          background: 'rgba(239, 68, 68, 0.08)',
                          color: '#EF4444',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
                        }}
                      >
                        <FiTrash2 size={13} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </div>

        {/* ─── Add/Edit Modal (24px Continuous Curved Black-Grey) ─── */}
        <AnimatePresence>
          {showAddModal && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                padding: '16px'
              }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                style={{
                  width: '100%',
                  maxWidth: '560px',
                  maxHeight: '92vh',
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: '24px',
                  background: isDark ? 'linear-gradient(165deg, #18191D 0%, #111215 100%)' : '#FFFFFF',
                  border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #E2E8F0',
                  boxShadow: isDark ? '0 25px 50px -12px rgba(0, 0, 0, 0.7)' : '0 20px 40px -10px rgba(15, 23, 42, 0.12)',
                  overflow: 'hidden',
                  zIndex: 1001
                }}
              >
                {/* Modal Header */}
                <div
                  style={{
                    padding: '20px 24px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: isDark
                      ? 'linear-gradient(to right, rgba(255, 107, 26, 0.08), transparent)'
                      : 'linear-gradient(to right, #FFF7ED, #FFFFFF)',
                    borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #F1F5F9'
                  }}
                >
                  <div>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: '1.25rem',
                        fontWeight: '850',
                        color: isDark ? '#FFFFFF' : '#0F172A',
                        letterSpacing: '-0.02em'
                      }}
                    >
                      {selectedItem ? 'Edit Inventory Item' : 'Add Inventory Item'}
                    </h2>
                    <p style={{ margin: '3px 0 0 0', color: isDark ? '#94A3B8' : '#64748B', fontSize: '0.82rem', fontWeight: 500 }}>
                      Configure stock thresholds, units, and replenishment quantities
                    </p>
                  </div>
                  <button
                    onClick={() => setShowAddModal(false)}
                    style={{
                      background: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9',
                      border: 'none',
                      borderRadius: '50%',
                      width: '34px',
                      height: '34px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isDark ? '#94A3B8' : '#64748B',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <FiX size={18} />
                  </button>
                </div>

                <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                  <div style={{ padding: '22px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Item Type */}
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '0.80rem',
                          fontWeight: '750',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          color: isDark ? '#94A3B8' : '#64748B',
                          marginBottom: '6px'
                        }}
                      >
                        Item Type
                      </label>
                      <GlobalSelect
                        value={formData.type}
                        onChange={(val) => setFormData({ ...formData, type: val })}
                        options={[
                          { label: 'Direct Sale Product (POS Catalog Item)', value: 'DIRECT_SALE' },
                          { label: 'Raw Material (Packaging, Ingredients, etc.)', value: 'RAW_MATERIAL' }
                        ]}
                        disabled={selectedItem !== null}
                      />
                    </div>

                    {/* Product Select or Name input */}
                    {formData.type === 'DIRECT_SALE' ? (
                      <div>
                        <label
                          style={{
                            display: 'block',
                            fontSize: '0.80rem',
                            fontWeight: '750',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            color: isDark ? '#94A3B8' : '#64748B',
                            marginBottom: '6px'
                          }}
                        >
                          Select Linked Product *
                        </label>
                        <GlobalSelect
                          value={formData.product_id}
                          onChange={(val) => setFormData({ ...formData, product_id: val })}
                          options={products
                            .filter(
                              (p) =>
                                p.active &&
                                (!items.some((item) => item.product_id === p.product_id) ||
                                  (selectedItem && selectedItem.product_id === p.product_id))
                            )
                            .map((p) => ({ label: `${p.name} (₹${p.price})`, value: p.product_id }))}
                          placeholder="-- Choose product from catalog --"
                          disabled={selectedItem !== null}
                        />
                      </div>
                    ) : (
                      <div>
                        <label
                          style={{
                            display: 'block',
                            fontSize: '0.80rem',
                            fontWeight: '750',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            color: isDark ? '#94A3B8' : '#64748B',
                            marginBottom: '6px'
                          }}
                        >
                          Item Name *
                        </label>
                        <input
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          required
                          placeholder="e.g. Tomato Ketchup, Burger Buns, Paper Cups"
                          style={{
                            width: '100%',
                            padding: '10px 14px',
                            background: isDark ? '#16171B' : '#F8FAFC',
                            border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #CBD5E1',
                            borderRadius: '12px',
                            color: isDark ? '#FFFFFF' : '#0F172A',
                            fontSize: '0.90rem',
                            fontWeight: 600,
                            outline: 'none',
                            transition: 'all 0.2s'
                          }}
                        />
                      </div>
                    )}

                    {/* Stock & Unit Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                      {/* Current Stock */}
                      <div>
                        <label
                          style={{
                            display: 'block',
                            fontSize: '0.80rem',
                            fontWeight: '750',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            color: isDark ? '#94A3B8' : '#64748B',
                            marginBottom: '6px'
                          }}
                        >
                          Current Stock Quantity *
                        </label>
                        <input
                          type="number"
                          value={getSafeNumberValue(formData.stock)}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormData({ ...formData, stock: val === '' ? '' : parseFloat(val) });
                          }}
                          required
                          placeholder="0"
                          min="0"
                          step="any"
                          style={{
                            width: '100%',
                            padding: '10px 14px',
                            background: isDark ? '#16171B' : '#F8FAFC',
                            border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #CBD5E1',
                            borderRadius: '12px',
                            color: isDark ? '#FFFFFF' : '#0F172A',
                            fontSize: '0.92rem',
                            fontWeight: 800,
                            outline: 'none'
                          }}
                        />
                      </div>

                      {/* Unit */}
                      <div>
                        <label
                          style={{
                            display: 'block',
                            fontSize: '0.80rem',
                            fontWeight: '750',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            color: isDark ? '#94A3B8' : '#64748B',
                            marginBottom: '6px'
                          }}
                        >
                          Unit of Measurement
                        </label>
                        <GlobalSelect
                          value={formData.unit}
                          onChange={(val) => setFormData({ ...formData, unit: val })}
                          options={[
                            { label: 'Piece (pcs)', value: 'piece' },
                            { label: 'Kilogram (kg)', value: 'kg' },
                            { label: 'Gram (g)', value: 'gram' },
                            { label: 'Litre (L)', value: 'litre' },
                            { label: 'Millilitre (ml)', value: 'ml' },
                            { label: 'Packet (pkt)', value: 'packet' },
                            { label: 'Box (box)', value: 'box' },
                            { label: 'Can (can)', value: 'can' }
                          ]}
                        />
                      </div>
                    </div>

                    {/* Low Stock Alert Threshold */}
                    <div
                      style={{
                        padding: '14px 16px',
                        background: isDark ? '#16171B' : '#F8FAFC',
                        borderRadius: '14px',
                        border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #E2E8F0'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span
                          style={{
                            fontSize: '0.80rem',
                            fontWeight: '750',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            color: isDark ? '#94A3B8' : '#64748B'
                          }}
                        >
                          Low Stock Alert Threshold
                        </span>
                        <span
                          style={{
                            background: 'rgba(245, 158, 11, 0.15)',
                            color: '#F59E0B',
                            padding: '2px 10px',
                            borderRadius: '999px',
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {getSafeNumberValue(formData.alert_threshold, 1)} {formData.unit}s
                        </span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="100"
                        value={getSafeNumberValue(formData.alert_threshold, 1)}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormData({ ...formData, alert_threshold: val === '' ? 1 : parseInt(val) });
                        }}
                        style={{
                          width: '100%',
                          height: '6px',
                          background: isDark ? '#2D3039' : '#CBD5E1',
                          borderRadius: '3px',
                          accentColor: '#FF6B1A',
                          cursor: 'pointer'
                        }}
                      />
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginTop: '4px',
                          fontSize: '11px',
                          color: isDark ? '#64748B' : '#94A3B8',
                          fontWeight: 600
                        }}
                      >
                        <span>1</span>
                        <span>50</span>
                        <span>100</span>
                      </div>
                    </div>

                    {/* Expiry Date & Preset Batch Size Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                      {/* Expiry Date */}
                      <div>
                        <label
                          style={{
                            display: 'block',
                            fontSize: '0.80rem',
                            fontWeight: '750',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            color: isDark ? '#94A3B8' : '#64748B',
                            marginBottom: '6px'
                          }}
                        >
                          Expiry Date (Optional)
                        </label>
                        <input
                          type="date"
                          value={formData.expiry_date || ''}
                          onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                          style={{
                            width: '100%',
                            padding: '10px 14px',
                            background: isDark ? '#16171B' : '#F8FAFC',
                            border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #CBD5E1',
                            borderRadius: '12px',
                            color: isDark ? '#FFFFFF' : '#0F172A',
                            fontSize: '0.90rem',
                            fontWeight: 600,
                            outline: 'none'
                          }}
                        />
                      </div>

                      {/* Default Batch Size */}
                      <div>
                        <label
                          style={{
                            display: 'block',
                            fontSize: '0.80rem',
                            fontWeight: '750',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            color: isDark ? '#94A3B8' : '#64748B',
                            marginBottom: '6px'
                          }}
                        >
                          Preset Batch Size (Units)
                        </label>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          value={getSafeNumberValue(formData.default_batch_size, 1)}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormData({ ...formData, default_batch_size: val === '' ? 1 : parseFloat(val) });
                          }}
                          placeholder="e.g. 5, 10 or 12"
                          style={{
                            width: '100%',
                            padding: '10px 14px',
                            background: isDark ? '#16171B' : '#F8FAFC',
                            border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #CBD5E1',
                            borderRadius: '12px',
                            color: isDark ? '#FFFFFF' : '#0F172A',
                            fontSize: '0.90rem',
                            fontWeight: 600,
                            outline: 'none'
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Modal Footer */}
                  <div
                    style={{
                      padding: '16px 24px',
                      borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #F1F5F9',
                      background: isDark ? 'rgba(0, 0, 0, 0.2)' : '#F8FAFC',
                      display: 'flex',
                      justifyContent: 'flex-end',
                      gap: '10px'
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      style={{
                        padding: '9px 20px',
                        borderRadius: '12px',
                        border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1.5px solid #CBD5E1',
                        background: 'transparent',
                        color: isDark ? '#94A3B8' : '#64748B',
                        fontWeight: 700,
                        fontSize: '0.86rem',
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      style={{
                        padding: '9px 24px',
                        borderRadius: '12px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #FF6B1A 0%, #EA580C 100%)',
                        color: '#FFFFFF',
                        fontWeight: 800,
                        fontSize: '0.86rem',
                        boxShadow: '0 4px 14px rgba(255, 107, 26, 0.3)',
                        cursor: 'pointer'
                      }}
                    >
                      {selectedItem ? 'Update Item' : 'Save Item'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ─── Add Batch / Stock Intake Modal ─── */}
        <AnimatePresence>
          {batchModalItem && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                padding: '16px'
              }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                style={{
                  width: '100%',
                  maxWidth: '520px',
                  borderRadius: '24px',
                  background: isDark ? 'linear-gradient(165deg, #18191D 0%, #111215 100%)' : '#FFFFFF',
                  border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #E2E8F0',
                  boxShadow: isDark ? '0 25px 50px -12px rgba(0, 0, 0, 0.7)' : '0 20px 40px -10px rgba(15, 23, 42, 0.12)',
                  overflow: 'hidden',
                  zIndex: 1001
                }}
              >
                {/* Header */}
                <div
                  style={{
                    padding: '20px 24px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: isDark
                      ? 'linear-gradient(to right, rgba(255, 107, 26, 0.1), transparent)'
                      : 'linear-gradient(to right, #FFF7ED, #FFFFFF)',
                    borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #F1F5F9'
                  }}
                >
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1.20rem', fontWeight: 850, color: isDark ? '#FFFFFF' : '#0F172A' }}>
                      Add Stock & Expiry — {batchModalItem.name}
                    </h2>
                    <p style={{ margin: '3px 0 0 0', color: isDark ? '#94A3B8' : '#64748B', fontSize: '0.82rem', fontWeight: 500 }}>
                      Current Stock: {batchModalItem.stock} {batchModalItem.unit}s
                    </p>
                  </div>
                  <button
                    onClick={() => setBatchModalItem(null)}
                    style={{
                      background: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9',
                      border: 'none',
                      borderRadius: '50%',
                      width: '34px',
                      height: '34px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isDark ? '#94A3B8' : '#64748B',
                      cursor: 'pointer'
                    }}
                  >
                    <FiX size={18} />
                  </button>
                </div>

                <form onSubmit={handleBatchSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Mode Toggle: Single Product vs Batch */}
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '0.80rem',
                          fontWeight: '750',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          color: isDark ? '#94A3B8' : '#64748B',
                          marginBottom: '8px'
                        }}
                      >
                        Intake Mode
                      </label>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '8px',
                          background: isDark ? '#16171B' : '#F1F5F9',
                          padding: '4px',
                          borderRadius: '12px',
                          border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #E2E8F0'
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setBatchMode('single');
                            setBatchForm({ ...batchForm, quantity: 1 });
                          }}
                          style={{
                            padding: '8px 12px',
                            borderRadius: '9px',
                            border: 'none',
                            fontWeight: 750,
                            fontSize: '0.82rem',
                            cursor: 'pointer',
                            background: batchMode === 'single' ? '#FF6B1A' : 'transparent',
                            color: batchMode === 'single' ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B',
                            boxShadow: batchMode === 'single' ? '0 2px 8px rgba(255, 107, 26, 0.3)' : 'none',
                            transition: 'all 0.18s ease'
                          }}
                        >
                          Single Item (1 Unit)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setBatchMode('batch');
                            const preset = batchModalItem.default_batch_size && Number(batchModalItem.default_batch_size) > 1
                              ? Number(batchModalItem.default_batch_size)
                              : 10;
                            setBatchForm({ ...batchForm, quantity: preset });
                          }}
                          style={{
                            padding: '8px 12px',
                            borderRadius: '9px',
                            border: 'none',
                            fontWeight: 750,
                            fontSize: '0.82rem',
                            cursor: 'pointer',
                            background: batchMode === 'batch' ? '#FF6B1A' : 'transparent',
                            color: batchMode === 'batch' ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B',
                            boxShadow: batchMode === 'batch' ? '0 2px 8px rgba(255, 107, 26, 0.3)' : 'none',
                            transition: 'all 0.18s ease'
                          }}
                        >
                          Batch / Multiple Units
                        </button>
                      </div>
                    </div>

                    {/* If Batch mode: Quick Presets */}
                    {batchMode === 'batch' && (
                      <div>
                        <label
                          style={{
                            display: 'block',
                            fontSize: '0.80rem',
                            fontWeight: '750',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            color: isDark ? '#94A3B8' : '#64748B',
                            marginBottom: '6px'
                          }}
                        >
                          Quick Batch Quantity Presets
                        </label>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {batchModalItem.default_batch_size && Number(batchModalItem.default_batch_size) > 1 && (
                            <button
                              type="button"
                              onClick={() => setBatchForm({ ...batchForm, quantity: Number(batchModalItem.default_batch_size) })}
                              style={{
                                padding: '6px 12px',
                                borderRadius: '8px',
                                border: batchForm.quantity === Number(batchModalItem.default_batch_size)
                                  ? '1.5px solid #FF6B1A'
                                  : isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #CBD5E1',
                                background: batchForm.quantity === Number(batchModalItem.default_batch_size)
                                  ? 'rgba(255, 107, 26, 0.15)'
                                  : isDark ? '#1C1D22' : '#F8FAFC',
                                color: batchForm.quantity === Number(batchModalItem.default_batch_size)
                                  ? '#FF6B1A'
                                  : isDark ? '#FFFFFF' : '#0F172A',
                                fontWeight: 800,
                                fontSize: '0.78rem',
                                cursor: 'pointer'
                              }}
                            >
                              ⭐ Preset ({batchModalItem.default_batch_size})
                            </button>
                          )}
                          {[5, 10, 20, 50].map((presetQty) => (
                            <button
                              key={presetQty}
                              type="button"
                              onClick={() => setBatchForm({ ...batchForm, quantity: presetQty })}
                              style={{
                                padding: '6px 12px',
                                borderRadius: '8px',
                                border: batchForm.quantity === presetQty
                                  ? '1.5px solid #FF6B1A'
                                  : isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #CBD5E1',
                                background: batchForm.quantity === presetQty
                                  ? 'rgba(255, 107, 26, 0.15)'
                                  : isDark ? '#1C1D22' : '#F8FAFC',
                                color: batchForm.quantity === presetQty
                                  ? '#FF6B1A'
                                  : isDark ? '#FFFFFF' : '#0F172A',
                                fontWeight: 800,
                                fontSize: '0.78rem',
                                cursor: 'pointer'
                              }}
                            >
                              +{presetQty} Units
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Quantity Input */}
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '0.80rem',
                          fontWeight: '750',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          color: isDark ? '#94A3B8' : '#64748B',
                          marginBottom: '6px'
                        }}
                      >
                        Quantity to Add ({batchModalItem.unit}s) *
                      </label>
                      <input
                        type="number"
                        min="0.01"
                        step="any"
                        required
                        value={batchForm.quantity}
                        onChange={(e) => setBatchForm({ ...batchForm, quantity: e.target.value })}
                        disabled={batchMode === 'single'}
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          background: isDark ? '#16171B' : '#F8FAFC',
                          border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #CBD5E1',
                          borderRadius: '12px',
                          color: isDark ? '#FFFFFF' : '#0F172A',
                          fontSize: '0.94rem',
                          fontWeight: 800,
                          outline: 'none'
                        }}
                      />
                    </div>

                    {/* Expiry Date Input */}
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '0.80rem',
                          fontWeight: '750',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          color: isDark ? '#94A3B8' : '#64748B',
                          marginBottom: '6px'
                        }}
                      >
                        Expiry Date *
                      </label>
                      <input
                        type="date"
                        required
                        value={batchForm.expiry_date}
                        onChange={(e) => setBatchForm({ ...batchForm, expiry_date: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          background: isDark ? '#16171B' : '#F8FAFC',
                          border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #CBD5E1',
                          borderRadius: '12px',
                          color: isDark ? '#FFFFFF' : '#0F172A',
                          fontSize: '0.90rem',
                          fontWeight: 700,
                          outline: 'none'
                        }}
                      />
                    </div>

                    {/* Batch Number & Unit Cost Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
                      <div>
                        <label
                          style={{
                            display: 'block',
                            fontSize: '0.80rem',
                            fontWeight: '750',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            color: isDark ? '#94A3B8' : '#64748B',
                            marginBottom: '6px'
                          }}
                        >
                          Batch / Lot # (Optional)
                        </label>
                        <input
                          type="text"
                          value={batchForm.batch_number}
                          onChange={(e) => setBatchForm({ ...batchForm, batch_number: e.target.value })}
                          placeholder="e.g. BATCH-2026-01"
                          style={{
                            width: '100%',
                            padding: '10px 14px',
                            background: isDark ? '#16171B' : '#F8FAFC',
                            border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #CBD5E1',
                            borderRadius: '12px',
                            color: isDark ? '#FFFFFF' : '#0F172A',
                            fontSize: '0.86rem',
                            fontWeight: 600,
                            outline: 'none'
                          }}
                        />
                      </div>
                      <div>
                        <label
                          style={{
                            display: 'block',
                            fontSize: '0.80rem',
                            fontWeight: '750',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            color: isDark ? '#94A3B8' : '#64748B',
                            marginBottom: '6px'
                          }}
                        >
                          Cost / Unit (₹)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={batchForm.cost_per_unit}
                          onChange={(e) => setBatchForm({ ...batchForm, cost_per_unit: e.target.value })}
                          placeholder="0.00"
                          style={{
                            width: '100%',
                            padding: '10px 14px',
                            background: isDark ? '#16171B' : '#F8FAFC',
                            border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #CBD5E1',
                            borderRadius: '12px',
                            color: isDark ? '#FFFFFF' : '#0F172A',
                            fontSize: '0.86rem',
                            fontWeight: 600,
                            outline: 'none'
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div
                    style={{
                      padding: '16px 24px',
                      borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #F1F5F9',
                      background: isDark ? 'rgba(0, 0, 0, 0.2)' : '#F8FAFC',
                      display: 'flex',
                      justifyContent: 'flex-end',
                      gap: '10px'
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setBatchModalItem(null)}
                      style={{
                        padding: '9px 20px',
                        borderRadius: '12px',
                        border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1.5px solid #CBD5E1',
                        background: 'transparent',
                        color: isDark ? '#94A3B8' : '#64748B',
                        fontWeight: 700,
                        fontSize: '0.86rem',
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      style={{
                        padding: '9px 24px',
                        borderRadius: '12px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #FF6B1A 0%, #EA580C 100%)',
                        color: '#FFFFFF',
                        fontWeight: 800,
                        fontSize: '0.86rem',
                        boxShadow: '0 4px 14px rgba(255, 107, 26, 0.3)',
                        cursor: 'pointer'
                      }}
                    >
                      {batchMode === 'single' ? 'Add Single Item' : `Add Batch of ${batchForm.quantity || 0}`}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ─── View Batches Drawer/Modal ─── */}
        <AnimatePresence>
          {viewBatchesItem && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                padding: '16px'
              }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                style={{
                  width: '100%',
                  maxWidth: '620px',
                  maxHeight: '85vh',
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: '24px',
                  background: isDark ? 'linear-gradient(165deg, #18191D 0%, #111215 100%)' : '#FFFFFF',
                  border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #E2E8F0',
                  boxShadow: isDark ? '0 25px 50px -12px rgba(0, 0, 0, 0.7)' : '0 20px 40px -10px rgba(15, 23, 42, 0.12)',
                  overflow: 'hidden',
                  zIndex: 1001
                }}
              >
                {/* Header */}
                <div
                  style={{
                    padding: '20px 24px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: isDark
                      ? 'linear-gradient(to right, rgba(59, 130, 246, 0.1), transparent)'
                      : 'linear-gradient(to right, #EFF6FF, #FFFFFF)',
                    borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #F1F5F9'
                  }}
                >
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 850, color: isDark ? '#FFFFFF' : '#0F172A' }}>
                      Batches Breakdown — {viewBatchesItem.name}
                    </h2>
                    <p style={{ margin: '3px 0 0 0', color: isDark ? '#94A3B8' : '#64748B', fontSize: '0.82rem', fontWeight: 500 }}>
                      Total Stock: {viewBatchesItem.stock} {viewBatchesItem.unit}s across {itemBatches.length} active {itemBatches.length === 1 ? 'batch' : 'batches'}
                    </p>
                  </div>
                  <button
                    onClick={() => setViewBatchesItem(null)}
                    style={{
                      background: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9',
                      border: 'none',
                      borderRadius: '50%',
                      width: '34px',
                      height: '34px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isDark ? '#94A3B8' : '#64748B',
                      cursor: 'pointer'
                    }}
                  >
                    <FiX size={18} />
                  </button>
                </div>

                {/* Body */}
                <div style={{ padding: '20px 24px', flex: 1, overflowY: 'auto' }}>
                  {loadingBatches ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: isDark ? '#94A3B8' : '#64748B' }}>
                      <div className="spinner" style={{ marginBottom: '8px' }} />
                      <div>Loading batches...</div>
                    </div>
                  ) : itemBatches.length === 0 ? (
                    <div
                      style={{
                        padding: '40px 20px',
                        textAlign: 'center',
                        color: isDark ? '#94A3B8' : '#64748B',
                        background: isDark ? '#16171B' : '#F8FAFC',
                        borderRadius: '16px',
                        border: isDark ? '1px dashed rgba(255, 255, 255, 0.08)' : '1px dashed #CBD5E1'
                      }}
                    >
                      <FiLayers size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: isDark ? '#FFFFFF' : '#0F172A' }}>
                        No Individual Batches Recorded
                      </div>
                      <p style={{ fontSize: '0.82rem', margin: '4px 0 0 0' }}>
                        Current balance of {viewBatchesItem.stock} {viewBatchesItem.unit}s is tracked as bulk inventory. Add new deliveries as batches to track precise expiry dates.
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {itemBatches.map((batch) => {
                        const isExpired = batch.days_to_expiry !== null && batch.days_to_expiry < 0;
                        const isSoon = batch.days_to_expiry !== null && batch.days_to_expiry >= 0 && batch.days_to_expiry <= 7;

                        return (
                          <div
                            key={batch.id}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '14px 16px',
                              borderRadius: '14px',
                              background: isDark ? '#16171B' : '#F8FAFC',
                              border: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid #E2E8F0'
                            }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontWeight: 800, fontSize: '0.94rem', color: isDark ? '#FFFFFF' : '#0F172A' }}>
                                  {batch.batch_number || `Batch #${batch.id}`}
                                </span>
                                <span
                                  style={{
                                    fontSize: '0.74rem',
                                    fontWeight: 800,
                                    padding: '2px 8px',
                                    borderRadius: '999px',
                                    background: isDark ? '#23252E' : '#E2E8F0',
                                    color: isDark ? '#FFFFFF' : '#0F172A'
                                  }}
                                >
                                  {batch.quantity} {viewBatchesItem.unit}s
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.76rem', color: isDark ? '#94A3B8' : '#64748B' }}>
                                {batch.expiry_date ? (
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      color: isExpired ? '#EF4444' : isSoon ? '#F59E0B' : '#10B981',
                                      fontWeight: 700
                                    }}
                                  >
                                    <FiCalendar size={12} />
                                    Exp: {batch.expiry_date}
                                    {isExpired ? ' (Expired)' : isSoon ? ` (${batch.days_to_expiry}d left)` : ''}
                                  </span>
                                ) : (
                                  <span>No expiry</span>
                                )}
                                {batch.cost_per_unit > 0 && (
                                  <span>• Cost: ₹{batch.cost_per_unit}</span>
                                )}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleDeleteBatch(batch.id)}
                              title="Delete this batch"
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '8px',
                                border: '1px solid rgba(239, 68, 68, 0.25)',
                                background: 'rgba(239, 68, 68, 0.08)',
                                color: '#EF4444',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)')}
                              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)')}
                            >
                              <FiTrash2 size={13} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div
                  style={{
                    padding: '16px 24px',
                    borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #F1F5F9',
                    background: isDark ? 'rgba(0, 0, 0, 0.2)' : '#F8FAFC',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      const item = viewBatchesItem;
                      setViewBatchesItem(null);
                      openBatchModal(null, item);
                    }}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '10px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #FF6B1A 0%, #EA580C 100%)',
                      color: '#FFFFFF',
                      fontWeight: 800,
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    <FiPlus size={14} /> Add Another Batch
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewBatchesItem(null)}
                    style={{
                      padding: '8px 18px',
                      borderRadius: '10px',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1.5px solid #CBD5E1',
                      background: 'transparent',
                      color: isDark ? '#94A3B8' : '#64748B',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      cursor: 'pointer'
                    }}
                  >
                    Close
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </PageContainer>
  );
}
