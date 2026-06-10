import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { inventoryAPI, productsAPI } from '../../api/api';
import { useAlert } from '../../context/AlertContext';
import Button from '../ui/Button';
import GlobalSelect from '../ui/GlobalSelect';
import { FiPlus, FiEdit2, FiTrash2, FiSearch, FiPackage, FiAlertTriangle, FiTrendingUp, FiX } from 'react-icons/fi';
import '../../styles/Inventory.css';

const InventoryStats = ({ metrics }) => {
    const items = [
        { label: 'Total Products', value: metrics.totalItems, color: '#3b82f6', icon: <FiPackage /> },
        { label: 'Low Stock', value: metrics.lowStock, color: metrics.lowStock > 0 ? '#ef4444' : '#10b981', icon: <FiAlertTriangle /> },
        { label: 'Inventory Value', value: `₹${metrics.totalValue.toLocaleString()}`, color: '#10b981', icon: <FiTrendingUp /> },
    ];

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inventory-stats-bar"
            style={{
              display: 'flex',
              gap: 'var(--spacing-4)',
              width: '100%'
            }}
        >
            {items.map((item) => (
                <div 
                  key={item.label} 
                  className="inventory-stat-card"
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
    );
};

const Inventory = () => {
    const { showSuccess, showError, showWarning, showConfirm } = useAlert();

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState([]);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('ALL');

    // Modals
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);

    // Form Data
    const [formData, setFormData] = useState({
        name: '',
        type: 'DIRECT_SALE',
        unit: 'piece',
        stock: 0,
        unit_price: 0,
        alert_threshold: 10,
        product_id: ''
    });

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
        const lowStock = items.filter(i => i.stock <= i.alert_threshold && i.stock > 0).length;
        const totalValue = items.reduce((acc, curr) => {
            let price = curr.unit_price || 0;
            if (curr.type === 'DIRECT_SALE' && curr.product_id) {
                const p = products.find(x => x.product_id === curr.product_id);
                if (p) price = p.price;
            }
            return acc + (curr.stock * price);
        }, 0);
        return { totalItems, lowStock, totalValue };
    }, [items, products]);

    // Filtering & Sorting
    const filteredItems = useMemo(() => {
        return items.filter(item => {
            const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesType = filterType === 'ALL' || item.type === filterType;
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
            product_id: item.product_id || ''
        });
        setShowAddModal(true);
    };

    const handleQuickStock = async (e, item, amount) => {
        e.stopPropagation(); // prevent row click
        if (item.is_locked) return;

        // Optimistically update stock in UI state to prevent flickering
        setItems(prevItems => prevItems.map(i => {
            if (i.id === item.id) {
                const newStock = i.stock + amount;
                let newStatus = "In Stock";
                if (newStock <= 0) newStatus = "Out of Stock";
                else if (newStock <= i.alert_threshold) newStatus = "Low Stock";
                return { ...i, stock: newStock, status: newStatus };
            }
            return i;
        }));

        try {
            await inventoryAPI.adjustStock(item.id, amount);
            showSuccess('Stock updated');
            loadInventory(true); // silent background load
        } catch (err) {
            showError('Failed to update stock');
            loadInventory();
        }
    };

    const handleDelete = async (e, id) => {
        e.stopPropagation();
        const confirmed = await showConfirm({
            title: 'Delete Inventory Item',
            description: 'This item will be permanently removed from your inventory.',
            confirmLabel: 'Delete',
            cancelLabel: 'Cancel',
            variant: 'danger',
        });
        if (!confirmed) return;
        try {
            await inventoryAPI.deleteInventory(id);
            showSuccess('Item deleted');
            loadInventory(true); // silent background load
        } catch (err) {
            showError('Failed to delete');
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            let payload = { ...formData };
            if (payload.type === 'DIRECT_SALE' && payload.product_id) {
                const p = products.find(x => x.product_id === payload.product_id);
                if (p) payload.name = p.name;
            }

            if (selectedItem) {
                // Optimistically update existing item
                setItems(prevItems => prevItems.map(i => {
                    if (i.id === selectedItem.id) {
                        let newStatus = "In Stock";
                        if (payload.stock <= 0) newStatus = "Out of Stock";
                        else if (payload.stock <= payload.alert_threshold) newStatus = "Low Stock";
                        return { ...i, ...payload, status: newStatus };
                    }
                    return i;
                }));
                await inventoryAPI.updateInventory(selectedItem.id, payload);
                showSuccess('Inventory updated');
            } else {
                await inventoryAPI.createInventory(payload);
                showSuccess('Inventory created');
            }
            setShowAddModal(false);
            loadInventory(true); // silent background load
        } catch (err) {
            showError('Failed to save');
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
            product_id: ''
        });
    };

    const getStockColor = (item) => {
        if (item.stock <= 0) return '#ef4444'; // Red
        if (item.stock <= item.alert_threshold) return '#f59e0b'; // Orange
        return '#22c55e'; // Green
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel inventory-panel"
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                margin: 'var(--spacing-4)',
                borderRadius: 'var(--radius-3xl)',
                overflow: 'hidden',
                background: 'var(--glass-panel)',
                border: '1px solid var(--glass-border)',
                boxShadow: 'var(--shadow-xl)',
            }}
        >
            {/* Header */}
            <div className="inventory-header" style={{
                padding: 'var(--spacing-8) var(--spacing-8) var(--spacing-6) var(--spacing-8)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
            }}>
                <div>
                    <h2 className="inventory-title" style={{ fontSize: 'var(--text-3xl)', fontWeight: '700', margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                        Inventory
                    </h2>
                    <p className="inventory-subtitle" style={{ margin: 'var(--spacing-1) 0 0 0', color: 'var(--text-secondary)', fontSize: 'var(--text-lg)' }}>
                        Manage and track your product stock levels
                    </p>
                </div>
                <Button
                    variant="primary"
                    onClick={handleAddClick}
                    className="inventory-add-btn"
                    style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 'var(--spacing-2)',
                        padding: 'var(--spacing-3) var(--spacing-6)',
                        borderRadius: 'var(--radius-xl)',
                        fontSize: 'var(--text-base)',
                        fontWeight: '600'
                    }}
                >
                    <FiPlus size={20} /> Add Product
                </Button>
            </div>

            {/* Controls: Search & Filter */}
            <div className="inventory-controls" style={{
                padding: '0 var(--spacing-8) var(--spacing-6) var(--spacing-8)',
                display: 'flex',
                gap: 'var(--spacing-4)',
                alignItems: 'center',
            }}>
                <div className="inventory-search">
                    <FiSearch className="inventory-search-icon" />
                    <input
                        className="inventory-search-input"
                        type="text" 
                        placeholder="Search inventory..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                
                <div className="inventory-filters">
                    {['ALL', 'DIRECT_SALE', 'RAW_MATERIAL'].map(type => (
                        <button
                            key={type}
                            onClick={() => setFilterType(type)}
                            className={`inventory-filter-btn ${filterType === type ? 'is-active' : ''}`}
                        >
                            {type === 'ALL' ? 'All' : type === 'DIRECT_SALE' ? 'Direct Sale' : 'Raw Material'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Stats Bar */}
            <div style={{ padding: '0 var(--spacing-8) var(--spacing-4) var(--spacing-8)' }}>
                <InventoryStats metrics={metrics} />
            </div>

            {/* Table-like List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--spacing-8) var(--spacing-8) var(--spacing-8)' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 'var(--spacing-12)' }}>
                        <div className="spinner" style={{ marginBottom: 'var(--spacing-4)' }}></div>
                        Loading inventory...
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div style={{ 
                        textAlign: 'center', 
                        color: 'var(--text-tertiary)', 
                        padding: 'var(--spacing-12)',
                        background: 'var(--glass-card)',
                        borderRadius: 'var(--radius-2xl)',
                        border: '1px dashed var(--glass-border)'
                    }}>
                        No inventory items found matching your criteria.
                    </div>
                ) : (
                    <div className="inventory-list">
                        {/* Table Header */}
                        <div className="inventory-table-head">
                            <div className="head-icon"></div>
                            <div className="head-name">Product Name</div>
                            <div className="head-stock">Stock Level</div>
                            <div className="head-health">Health</div>
                            <div className="head-status">Status</div>
                            <div className="head-actions"></div>
                        </div>

                        {filteredItems.map((item) => (
                            <motion.div
                                key={item.id}
                                layout
                                whileHover={{ y: -2 }}
                                onClick={() => handleRowClick(item)}
                                className={`inventory-row ${item.is_locked ? 'is-locked' : ''}`}
                            >
                                {/* Icon */}
                                <div className="inventory-icon">
                                    <FiPackage />
                                </div>

                                {/* Name */}
                                <div className="inventory-name">
                                    <h3>{item.name}</h3>
                                    <span className="inventory-type-tag">
                                        {item.type === 'DIRECT_SALE' ? 'Direct Sale' : 'Material'}
                                    </span>
                                </div>

                                {/* Stock Level */}
                                <div className="inventory-stock">
                                    <span className="inventory-stock-number">{item.stock}</span>
                                    <span className="inventory-stock-unit">{item.unit}s</span>
                                </div>

                                {/* Health Bar */}
                                <div className="inventory-health">
                                    <div className="inventory-stock-bar-bg">
                                        <motion.div
                                            className="inventory-stock-bar-fill"
                                            initial={{ width: 0 }}
                                            animate={{ width: `${Math.min((item.stock / (item.max_stock_history || 100)) * 100, 100)}%` }}
                                            transition={{ duration: 1, ease: "easeOut" }}
                                            style={{ backgroundColor: getStockColor(item) }}
                                        />
                                    </div>
                                    {item.stock <= item.alert_threshold && (
                                        <span className="inventory-low-stock-alert">
                                            Low Stock Alert
                                        </span>
                                    )}
                                </div>

                                {/* Status */}
                                <div className="inventory-status">
                                    <span className={`inventory-status-pill ${item.product_status === 'inactive' ? 'inactive' : 'active'}`}>
                                        {item.product_status === 'inactive' ? 'Inactive' : 'Active'}
                                    </span>
                                </div>

                                {/* Actions */}
                                <div className="inventory-actions">
                                    <button
                                        className="inventory-action-adjust-btn"
                                        onClick={(e) => handleQuickStock(e, item, -1)}
                                        disabled={item.is_locked}
                                        title="Quick Reduce -1"
                                    >
                                        -
                                    </button>
                                    <button
                                        className="inventory-action-adjust-btn"
                                        onClick={(e) => handleQuickStock(e, item, 1)}
                                        disabled={item.is_locked}
                                        title="Quick Add +1"
                                    >
                                        +
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleRowClick(item);
                                        }}
                                        disabled={item.is_locked}
                                        className="icon-button"
                                        style={{ color: 'var(--primary-400)' }}
                                        title="Edit"
                                    >
                                        <FiEdit2 size={16} />
                                    </button>
                                    <button
                                        onClick={(e) => handleDelete(e, item.id)}
                                        className="icon-button"
                                        style={{ color: '#ff4d4d' }}
                                        title="Delete"
                                    >
                                        <FiTrash2 size={16} />
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal */}
            <AnimatePresence>
                {showAddModal && (
                    <div style={{
                      position: 'fixed', inset: 0, zIndex: 1000,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
                      WebkitBackdropFilter: 'blur(8px)', padding: 'var(--spacing-4)'
                    }}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="liquid-glass-card"
                            style={{
                              width: '100%', maxWidth: '600px', maxHeight: '95vh',
                              display: 'flex', flexDirection: 'column',
                              borderRadius: 'var(--radius-3xl)',
                              backgroundColor: 'rgba(24, 24, 27, 0.95)',
                              border: '1px solid var(--glass-border)',
                              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                              overflow: 'hidden',
                              zIndex: 1001,
                              fontFamily: 'Inter, system-ui, sans-serif'
                            }}
                        >
                            {/* Modal Header */}
                            <div style={{
                              padding: 'var(--spacing-6) var(--spacing-8)',
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              background: 'linear-gradient(to right, rgba(249, 115, 22, 0.1), transparent)',
                              borderBottom: '1px solid var(--glass-border)'
                            }}>
                              <div>
                                <h2 style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                                  {selectedItem ? 'Edit Inventory Item' : 'Add Inventory Item'}
                                </h2>
                                <p style={{ margin: 'var(--spacing-1) 0 0 0', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
                                  Fill in the details to track your product stock levels
                                </p>
                              </div>
                              <button 
                                onClick={() => setShowAddModal(false)} 
                                className="icon-button"
                                style={{ 
                                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                  borderRadius: '50%',
                                  padding: '8px',
                                  border: 'none',
                                  color: 'var(--text-primary)',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                              >
                                <FiX size={20} />
                              </button>
                            </div>

                            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                              <div style={{ padding: 'var(--spacing-8)', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
                                
                                {/* Form Group: Type */}
                                <div className="form-group">
                                  <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-3)' }}>
                                    Type
                                  </label>
                                  <GlobalSelect
                                    value={formData.type}
                                    onChange={(val) => setFormData({ ...formData, type: val })}
                                    options={[
                                      { label: 'Direct Sale Product', value: 'DIRECT_SALE' },
                                      { label: 'Raw Material', value: 'RAW_MATERIAL' }
                                    ]}
                                  />
                                </div>

                                {/* Form Group: Product Select or Name input */}
                                {formData.type === 'DIRECT_SALE' ? (
                                  <div className="form-group">
                                    <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-3)' }}>
                                      Select Product
                                    </label>
                                    <GlobalSelect
                                      value={formData.product_id}
                                      onChange={(val) => setFormData({ ...formData, product_id: val })}
                                      options={products.filter(p => p.active).map(p => ({ label: p.name, value: p.product_id }))}
                                      placeholder="-- Select Product --"
                                    />
                                  </div>
                                ) : (
                                  <div className="form-group">
                                    <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-3)' }}>
                                      Item Name
                                    </label>
                                    <input
                                      value={formData.name}
                                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                                      required
                                      placeholder="e.g. Tomato Sauce, Cheese Slice"
                                      style={{
                                        width: '100%', padding: '16px',
                                        background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)',
                                        borderRadius: 'var(--radius-xl)', color: 'var(--text-primary)',
                                        fontSize: 'var(--text-base)', outline: 'none', transition: 'all 0.2s',
                                        boxSizing: 'border-box'
                                      }}
                                      onFocus={(e) => e.target.style.borderColor = 'var(--primary-500)'}
                                      onBlur={(e) => e.target.style.borderColor = 'var(--glass-border)'}
                                    />
                                  </div>
                                )}

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-6)' }}>
                                  {/* Current Stock */}
                                  <div className="form-group">
                                    <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-3)' }}>
                                      Current Stock
                                    </label>
                                    <input
                                      type="number"
                                      value={formData.stock}
                                      onChange={e => setFormData({ ...formData, stock: parseFloat(e.target.value) })}
                                      required
                                      style={{
                                        width: '100%', padding: '16px',
                                        background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)',
                                        borderRadius: 'var(--radius-xl)', color: 'var(--text-primary)',
                                        fontSize: 'var(--text-base)', outline: 'none',
                                        boxSizing: 'border-box'
                                      }}
                                      onFocus={(e) => e.target.style.borderColor = 'var(--primary-500)'}
                                      onBlur={(e) => e.target.style.borderColor = 'var(--glass-border)'}
                                    />
                                  </div>

                                  {/* Unit */}
                                  <div className="form-group">
                                    <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-3)' }}>
                                      Unit
                                    </label>
                                    <GlobalSelect
                                      value={formData.unit}
                                      onChange={(val) => setFormData({ ...formData, unit: val })}
                                      direction="top"
                                      options={[
                                        { label: 'Piece', value: 'piece' },
                                        { label: 'Kg', value: 'kg' },
                                        { label: 'Litre', value: 'litre' },
                                        { label: 'Packet', value: 'packet' },
                                        { label: 'Box', value: 'box' }
                                      ]}
                                    />
                                  </div>
                                </div>

                                {/* Low Stock Alert Threshold */}
                                <div className="form-group">
                                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-sm)', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-3)' }}>
                                    <span>Low Stock Alert Threshold</span>
                                    <span style={{
                                      background: 'rgba(245, 158, 11, 0.1)',
                                      color: '#fbbf24',
                                      padding: '2px 8px',
                                      borderRadius: 'var(--radius-lg)',
                                      fontSize: 'var(--text-xs)',
                                      fontWeight: 600
                                    }}>
                                      {formData.alert_threshold} units
                                    </span>
                                  </label>
                                  <input
                                    type="range"
                                    min="1"
                                    max="100"
                                    value={formData.alert_threshold}
                                    onChange={e => setFormData({ ...formData, alert_threshold: parseInt(e.target.value) })}
                                    style={{
                                      width: '100%',
                                      height: '6px',
                                      background: '#334155',
                                      borderRadius: '3px',
                                      accentColor: '#f59e0b',
                                      cursor: 'pointer',
                                      marginTop: '8px',
                                      appearance: 'auto'
                                    }}
                                  />
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '10px', color: '#64748b' }}>
                                    <span>1</span>
                                    <span>50</span>
                                    <span>100</span>
                                  </div>
                                </div>

                              </div>

                              {/* Modal Footer */}
                              <div style={{
                                padding: 'var(--spacing-6) var(--spacing-8)',
                                borderTop: '1px solid var(--glass-border)',
                                background: 'rgba(255, 255, 255, 0.02)',
                                display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-3)'
                              }}>
                                <Button 
                                  variant="ghost" 
                                  type="button" 
                                  onClick={() => setShowAddModal(false)}
                                  style={{ padding: '12px 24px', borderRadius: 'var(--radius-xl)' }}
                                >
                                  Cancel
                                </Button>
                                <Button 
                                  variant="primary" 
                                  type="submit" 
                                  style={{ padding: '12px 32px', borderRadius: 'var(--radius-xl)', fontWeight: '700' }}
                                >
                                  Save Changes
                                </Button>
                              </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default Inventory;
