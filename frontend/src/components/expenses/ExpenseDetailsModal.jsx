import React from 'react';
import { motion } from 'framer-motion';
import Button from '../ui/Button';
import { formatCurrency } from '../../utils/api';
import { FiX, FiCalendar, FiCreditCard, FiAlignLeft, FiEdit2, FiTrash2, FiUser, FiTag, FiDollarSign } from 'react-icons/fi';

export default function ExpenseDetailsModal({ expense, onClose, onEdit, onDelete }) {
  if (!expense) return null;

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // eslint-disable-next-line no-unused-vars
  const formatTime = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-GB', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)', padding: 'var(--spacing-4)'
    }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="liquid-glass-card"
        style={{
          width: '100%', maxWidth: '550px', maxHeight: '90vh',
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
        {/* Header */}
        <div style={{
          padding: 'var(--spacing-8) var(--spacing-8) var(--spacing-6) var(--spacing-8)',
          borderBottom: '1px solid var(--glass-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          background: 'linear-gradient(to right, rgba(249, 115, 22, 0.05), transparent)'
        }}>
          <div>
            <div style={{ 
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '4px 12px', borderRadius: 'var(--radius-full)',
              background: 'rgba(255, 255, 255, 0.05)', color: 'var(--primary-400)',
              fontSize: 'var(--text-xs)', fontWeight: '700', textTransform: 'uppercase',
              letterSpacing: '0.05em', marginBottom: 'var(--spacing-3)'
            }}>
              <FiTag size={12} /> {expense.category}
            </div>
            <h2 style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              {expense.title}
            </h2>
          </div>
          <button 
            onClick={onClose} 
            className="icon-button"
            style={{ 
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '50%',
              padding: '8px'
            }}
          >
            <FiX size={20} />
          </button>
        </div>

        <div style={{ padding: 'var(--spacing-8)', overflowY: 'auto', flex: 1 }}>
          {/* Main Info Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-8)', marginBottom: 'var(--spacing-8)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--spacing-3)' }}>
              <div style={{ 
                width: '32px', height: '32px', borderRadius: '8px', 
                background: 'rgba(255, 255, 255, 0.03)', display: 'flex', 
                alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' 
              }}>
                <FiCalendar />
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontWeight: '600', textTransform: 'uppercase', marginBottom: '2px' }}>Date</div>
                <div style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{formatDate(expense.date)}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--spacing-3)' }}>
              <div style={{ 
                width: '32px', height: '32px', borderRadius: '8px', 
                background: 'rgba(255, 255, 255, 0.03)', display: 'flex', 
                alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' 
              }}>
                <FiCreditCard />
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontWeight: '600', textTransform: 'uppercase', marginBottom: '2px' }}>Payment Method</div>
                <div style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{expense.payment_method}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--spacing-3)' }}>
              <div style={{ 
                width: '32px', height: '32px', borderRadius: '8px', 
                background: 'rgba(255, 255, 255, 0.03)', display: 'flex', 
                alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' 
              }}>
                <FiUser />
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontWeight: '600', textTransform: 'uppercase', marginBottom: '2px' }}>Recipient / Worker</div>
                <div style={{ color: expense.worker_name ? 'var(--text-primary)' : 'var(--text-tertiary)', fontWeight: '600' }}>
                  {expense.worker_name || 'None linked'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--spacing-3)' }}>
              <div style={{ 
                width: '32px', height: '32px', borderRadius: '8px', 
                background: 'rgba(255, 255, 255, 0.03)', display: 'flex', 
                alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' 
              }}>
                <FiDollarSign />
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontWeight: '600', textTransform: 'uppercase', marginBottom: '2px' }}>Total Amount</div>
                <div style={{ color: 'var(--primary-400)', fontSize: 'var(--text-xl)', fontWeight: '800' }}>{formatCurrency(expense.amount)}</div>
              </div>
            </div>
          </div>

          {/* Notes Section */}
          <div style={{ 
            padding: 'var(--spacing-6)',
            background: 'rgba(255, 255, 255, 0.02)',
            borderRadius: 'var(--radius-2xl)',
            border: '1px solid var(--glass-border)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--spacing-3)' }}>
              <FiAlignLeft /> Notes & Remarks
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
              {expense.notes || 'No notes provided for this expense.'}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{
          padding: 'var(--spacing-6) var(--spacing-8)',
          borderTop: '1px solid var(--glass-border)',
          background: 'rgba(255, 255, 255, 0.02)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={onEdit}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 20px', borderRadius: 'var(--radius-xl)',
                background: 'rgba(249, 115, 22, 0.1)', color: 'var(--primary-400)',
                border: '1px solid rgba(249, 115, 22, 0.2)', fontWeight: '600',
                cursor: 'pointer', transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.background = 'rgba(249, 115, 22, 0.15)'}
              onMouseLeave={(e) => e.target.style.background = 'rgba(249, 115, 22, 0.1)'}
            >
              <FiEdit2 size={16} /> Edit Record
            </button>
            <button
              onClick={onDelete}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 20px', borderRadius: 'var(--radius-xl)',
                background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.2)', fontWeight: '600',
                cursor: 'pointer', transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.background = 'rgba(239, 68, 68, 0.15)'}
              onMouseLeave={(e) => e.target.style.background = 'rgba(239, 68, 68, 0.1)'}
            >
              <FiTrash2 size={16} /> Delete
            </button>
          </div>
          <Button 
            variant="ghost" 
            onClick={onClose}
            style={{ borderRadius: 'var(--radius-xl)' }}
          >
            Close
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
