import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Button from '../ui/Button';
import { GlobalSelect, GlobalDatePicker } from '../ui';
import { formatCurrency } from '../../utils/api';
import { workerAPI } from '../../api/workers';
import { FiX, FiInfo, FiDollarSign, FiTag, FiUser, FiCreditCard, FiCalendar, FiMessageSquare } from 'react-icons/fi';

export default function ExpenseFormModal({ onClose, onSubmit, initialData = null }) {
  const [formData, setFormData] = useState({
    title: '',
    category: 'Other',
    amount: '',
    payment_method: 'Cash',
    worker_id: '',
    date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  const [workers, setWorkers] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingWorkers, setLoadingWorkers] = useState(false);

  useEffect(() => {
    fetchWorkers();
    if (initialData) {
      setFormData({
        title: initialData.title || '',
        category: initialData.category || 'Other',
        amount: initialData.amount || '',
        payment_method: initialData.payment_method || 'Cash',
        worker_id: initialData.worker_id || '',
        date: initialData.date ? new Date(initialData.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        notes: initialData.notes || ''
      });
    }
  }, [initialData]);

  const fetchWorkers = async () => {
    try {
      setLoadingWorkers(true);
      const res = await workerAPI.getWorkers();
      if (Array.isArray(res)) {
        setWorkers(res.map(w => ({ value: w.worker_id, label: w.name })));
      }
    } catch (e) {
      console.error('Failed to fetch workers', e);
    } finally {
      setLoadingWorkers(false);
    }
  };

  const categoryOptions = [
    { value: 'Salary', label: 'Salary' },
    { value: 'Utilities', label: 'Utilities' },
    { value: 'Rent', label: 'Rent' },
    { value: 'Maintenance', label: 'Maintenance' },
    { value: 'Supplies', label: 'Supplies' },
    { value: 'Equipment', label: 'Equipment' },
    { value: 'Transport', label: 'Transport' },
    { value: 'Other', label: 'Other' }
  ];

  const paymentOptions = [
    { value: 'Cash', label: 'Cash' },
    { value: 'UPI', label: 'UPI' },
    { value: 'Card', label: 'Card' },
    { value: 'Bank Transfer', label: 'Bank Transfer' },
    { value: 'Other', label: 'Other' }
  ];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (Number(formData.amount) <= 0) return;
    
    setIsSubmitting(true);
    try {
      await onSubmit({
        ...formData,
        amount: Number(formData.amount),
        worker_id: formData.worker_id || null
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
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
          width: '100%', maxWidth: '520px', maxHeight: '95vh',
          display: 'flex', flexDirection: 'column',
          borderRadius: 'var(--radius-2xl)',
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
          padding: 'var(--spacing-4) var(--spacing-6)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'linear-gradient(to right, rgba(249, 115, 22, 0.1), transparent)',
          borderBottom: '1px solid var(--glass-border)'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 'var(--text-xl)', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              {initialData ? 'Update' : 'Record'} Expense
            </h2>
            <p style={{ margin: 'var(--spacing-1) 0 0 0', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
              Fill in the details to track your business spending
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="icon-button"
            style={{ 
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '50%',
              padding: '6px'
            }}
          >
            <FiX size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div style={{ padding: 'var(--spacing-6)', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
            
            {/* Title Section */}
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-xs)', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-2)' }}>
                <FiInfo size={13} style={{ color: 'var(--primary-400)' }} />
                Expense Title
              </label>
              <input
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                required
                placeholder="e.g. March Electricity Bill, Shop Maintenance"
                style={{
                  width: '100%', padding: '12px',
                  background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)',
                  borderRadius: 'var(--radius-lg)', color: 'var(--text-primary)',
                  fontSize: 'var(--text-sm)', outline: 'none', transition: 'all 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--primary-500)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--glass-border)'}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-4)' }}>
              {/* Category */}
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-xs)', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-2)' }}>
                  <FiTag size={13} style={{ color: 'var(--primary-400)' }} />
                  Category
                </label>
                <GlobalSelect
                  options={categoryOptions}
                  value={formData.category}
                  onChange={(val) => handleInputChange({ target: { name: 'category', value: val } })}
                />
              </div>

              {/* Amount */}
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-xs)', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-2)' }}>
                  <FiDollarSign size={13} style={{ color: 'var(--primary-400)' }} />
                  Amount (₹)
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary-400)', fontWeight: '700' }}>₹</span>
                  <input
                    type="number"
                    name="amount"
                    min="0"
                    step="0.01"
                    value={formData.amount}
                    onChange={handleInputChange}
                    placeholder="0.00"
                    required
                    style={{
                      width: '100%', padding: '12px 12px 12px 24px',
                      background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)',
                      borderRadius: 'var(--radius-lg)', color: 'var(--text-primary)',
                      fontSize: 'var(--text-sm)', fontWeight: '700', outline: 'none'
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--primary-500)'}
                    onBlur={(e) => e.target.style.borderColor = 'var(--glass-border)'}
                  />
                </div>
              </div>

              {/* Worker Selection */}
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-xs)', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-2)' }}>
                  <FiUser size={13} style={{ color: 'var(--primary-400)' }} />
                  Link to Worker (Optional)
                </label>
                <GlobalSelect
                  options={[{ value: '', label: 'None' }, ...workers]}
                  value={formData.worker_id}
                  placeholder={loadingWorkers ? 'Loading workers...' : 'Select a worker'}
                  onChange={(val) => handleInputChange({ target: { name: 'worker_id', value: val } })}
                />
              </div>

              {/* Payment Method */}
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-xs)', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-2)' }}>
                  <FiCreditCard size={13} style={{ color: 'var(--primary-400)' }} />
                  Payment Method
                </label>
                <GlobalSelect
                  options={paymentOptions}
                  value={formData.payment_method}
                  onChange={(val) => handleInputChange({ target: { name: 'payment_method', value: val } })}
                />
              </div>

              {/* Date Selection */}
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-xs)', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-2)' }}>
                  <FiCalendar size={13} style={{ color: 'var(--primary-400)' }} />
                  Date
                </label>
                <GlobalDatePicker
                  value={formData.date}
                  onChange={(val) => handleInputChange({ target: { name: 'date', value: val } })}
                />
              </div>
            </div>

            {/* Notes Section */}
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-xs)', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-2)' }}>
                <FiMessageSquare size={13} style={{ color: 'var(--primary-400)' }} />
                Notes
              </label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleInputChange}
                placeholder="Add any additional details or context..."
                rows={2}
                style={{
                  width: '100%', padding: '12px',
                  background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)',
                  borderRadius: 'var(--radius-lg)', color: 'var(--text-primary)',
                  fontSize: 'var(--text-xs)', outline: 'none', transition: 'all 0.2s', resize: 'none'
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--primary-500)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--glass-border)'}
              />
            </div>

          </div>

          {/* Modal Footer */}
          <div style={{
            padding: 'var(--spacing-4) var(--spacing-6)',
            borderTop: '1px solid var(--glass-border)',
            background: 'rgba(255, 255, 255, 0.02)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div>
              <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', marginRight: 'var(--spacing-3)' }}>Amount Due</span>
              <strong style={{ color: 'var(--primary-500)', fontSize: 'var(--text-2xl)', fontWeight: '800' }}>
                {formatCurrency(Number(formData.amount) || 0)}
              </strong>
            </div>
            
            <div style={{ display: 'flex', gap: 'var(--spacing-3)' }}>
              <Button 
                variant="ghost" 
                type="button" 
                onClick={onClose}
                style={{ padding: '12px 24px', borderRadius: 'var(--radius-xl)' }}
              >
                Cancel
              </Button>
              <Button 
                variant="primary" 
                type="submit" 
                disabled={isSubmitting || !formData.title || Number(formData.amount) <= 0}
                style={{ padding: '12px 32px', borderRadius: 'var(--radius-xl)', fontWeight: '700' }}
              >
                {isSubmitting ? 'Saving...' : initialData ? 'Update Expense' : 'Confirm Expense'}
              </Button>
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
