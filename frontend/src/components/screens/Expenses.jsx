import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAlert } from '../../context/AlertContext';
import { expensesAPI } from '../../api/expenses';
import { formatCurrency } from '../../utils/api';
import Button from '../ui/Button';
import ExpenseFormModal from '../expenses/ExpenseFormModal';
import ExpenseDetailsModal from '../expenses/ExpenseDetailsModal';
import { FiPlus, FiShoppingBag, FiTruck, FiTool, FiZap, FiEdit2, FiTrash2, FiSearch, FiUser, FiHome, FiCreditCard, FiDollarSign } from 'react-icons/fi';
import '../../styles/Expenses.css';

export default function Expenses() {
  const { addToast } = useAlert();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expenseTypes, setExpenseTypes] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState(['All']);

  useEffect(() => {
    fetchExpenses();
    fetchExpenseTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchExpenseTypes = async () => {
    try {
      const res = await expensesAPI.getExpenseTypes();
      if (res.success) {
        const types = (res.expense_types || [])
          .filter(t => t.is_active)
          .map(t => t.name);
        if (!types.includes('Salary')) {
          types.push('Salary');
        }
        setExpenseTypes(types);
      }
    } catch (e) {
      console.error('Error fetching expense types:', e);
    }
  };

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      const res = await expensesAPI.getExpenses();
      if (res.success) {
        setExpenses(res.expenses);
      } else {
        addToast({ type: 'error', title: 'Failed to load expenses' });
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Error fetching expenses' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateExpense = async (expenseData) => {
    try {
      const res = await expensesAPI.createExpense(expenseData);
      if (res.success) {
        addToast({ type: 'success', title: 'Expense recorded successfully' });
        setIsFormOpen(false);
        fetchExpenses();
      } else {
        addToast({ type: 'error', title: res.message || 'Error recording expense' });
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Error recording expense' });
    }
  };

  const handleUpdateExpense = async (expenseData) => {
    try {
      const res = await expensesAPI.updateExpense(editingExpense.id, expenseData);
      if (res.success) {
        addToast({ type: 'success', title: 'Expense updated successfully' });
        setEditingExpense(null);
        fetchExpenses();
      } else {
        addToast({ type: 'error', title: res.message || 'Error updating expense' });
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Error updating expense' });
    }
  };

  const handleDeleteExpense = async (expenseId) => {
    if (!window.confirm('Are you sure you want to delete this expense record?')) return;
    try {
      const res = await expensesAPI.deleteExpense(expenseId);
      if (res.success) {
        addToast({ type: 'success', title: 'Expense deleted' });
        fetchExpenses();
      } else {
        addToast({ type: 'error', title: res.message || 'Error deleting expense' });
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Error deleting expense' });
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  };

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'Salary': return <FiUser />;
      case 'Utilities': return <FiZap />;
      case 'Rent': return <FiHome />;
      case 'Supplies': return <FiShoppingBag />;
      case 'Equipment': return <FiTool />;
      case 'Transport': return <FiTruck />;
      case 'Maintenance': return <FiTool />;
      default: return <FiDollarSign />;
    }
  };

  const filteredExpenses = expenses
    .filter(expense => {
      const matchesSearch = expense.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (expense.worker_name && expense.worker_name.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory = selectedCategories.includes('All') || selectedCategories.includes(expense.category);
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      const dateA = new Date(a.date || a.created_at || 0);
      const dateB = new Date(b.date || b.created_at || 0);
      return dateB - dateA || b.id - a.id;
    });

  const categories = ['All', ...expenseTypes];

  const handleFilterClick = (cat) => {
    if (cat === 'All') {
      setSelectedCategories(['All']);
    } else {
      setSelectedCategories(prev => {
        let next;
        if (prev.includes(cat)) {
          next = prev.filter(c => c !== cat);
        } else {
          next = [...prev.filter(c => c !== 'All'), cat];
        }
        return next.length === 0 ? ['All'] : next;
      });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel expenses-panel"
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
      <div className="expenses-header" style={{
        padding: 'var(--spacing-8) var(--spacing-8) var(--spacing-6) var(--spacing-8)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
      }}>
        <div>
          <h2 className="expenses-title" style={{ fontSize: 'var(--text-3xl)', fontWeight: '700', margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Expenses
          </h2>
          <p className="expenses-subtitle" style={{ margin: 'var(--spacing-1) 0 0 0', color: 'var(--text-secondary)', fontSize: 'var(--text-lg)' }}>
            Track business spending and operational costs
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => setIsFormOpen(true)}
          className="expenses-add-btn"
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
          <FiPlus size={20} /> Add Expense
        </Button>
      </div>

      {/* Controls: Search & Filter */}
      <div className="expenses-controls" style={{
        padding: '0 var(--spacing-8) var(--spacing-6) var(--spacing-8)',
        display: 'flex',
        gap: 'var(--spacing-4)',
        alignItems: 'center',
      }}>
        <div className="expenses-search">
          <FiSearch className="expenses-search-icon" />
          <input
            className="expenses-search-input"
            type="text" 
            placeholder="Search expenses or workers..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="expenses-filters">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => handleFilterClick(cat)}
              className={`expenses-filter-btn ${selectedCategories.includes(cat) ? 'is-active' : ''}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Expenses Table */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--spacing-8) var(--spacing-8) var(--spacing-8)' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 'var(--spacing-12)' }}>
            <div className="spinner" style={{ marginBottom: 'var(--spacing-4)' }}></div>
            Loading expenses...
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            color: 'var(--text-tertiary)', 
            padding: 'var(--spacing-12)',
            background: 'var(--glass-card)',
            borderRadius: 'var(--radius-2xl)',
            border: '1px dashed var(--glass-border)'
          }}>
            No expenses found matching your criteria.
          </div>
        ) : (
          <div className="expenses-list">
            {/* Table Header */}
            <div className="expenses-table-head">
              <div className="head-date">Date</div>
              <div className="head-title">Title</div>
              <div className="head-category">Category</div>
              <div className="head-worker">Worker</div>
              <div className="head-payment">Payment</div>
              <div className="head-amount">Amount</div>
              <div className="head-actions"></div>
            </div>

            {filteredExpenses.map((expense) => (
              <motion.div
                key={expense.id}
                layout
                whileHover={{ y: -2 }}
                onClick={() => setSelectedExpense(expense)}
                className="expense-row"
              >

                {/* Date */}
                <div className="expense-date">
                  {formatDate(expense.date)}
                </div>

                {/* Title */}
                <div className="expense-title">
                  <h3>
                    {expense.title}
                  </h3>
                </div>

                {/* Category */}
                <div className="expense-category">
                  <span className="expense-category-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    {getCategoryIcon(expense.category)}
                    <span>{expense.category}</span>
                  </span>
                </div>

                {/* Worker */}
                <div className="expense-worker">
                  {expense.worker_name ? (
                    <>
                      <FiUser size={14} className="expense-worker-icon" />
                      {expense.worker_name}
                    </>
                  ) : (
                    <span style={{ opacity: 0.3 }}>—</span>
                  )}
                </div>

                {/* Payment */}
                <div className="expense-payment">
                  <FiCreditCard size={14} className="expense-payment-icon" />
                  {expense.payment_method}
                </div>

                {/* Amount */}
                <div className="expense-amount">
                  {formatCurrency(expense.amount)}
                </div>
                
                {/* Actions */}
                <div className="expense-actions">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingExpense(expense);
                    }}
                    className="icon-button"
                    style={{ color: 'var(--primary-400)' }}
                  >
                    <FiEdit2 size={16} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteExpense(expense.id);
                    }}
                    className="icon-button"
                    style={{ color: '#ff4d4d' }}
                  >
                    <FiTrash2 size={16} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {(isFormOpen || editingExpense) && (
        <ExpenseFormModal 
          initialData={editingExpense}
          onClose={() => {
            setIsFormOpen(false);
            setEditingExpense(null);
          }} 
          onSubmit={editingExpense ? handleUpdateExpense : handleCreateExpense} 
        />
      )}

      {selectedExpense && (
        <ExpenseDetailsModal 
          expense={selectedExpense} 
          onClose={() => setSelectedExpense(null)} 
          onEdit={() => {
            setEditingExpense(selectedExpense);
            setSelectedExpense(null);
          }}
          onDelete={() => {
            handleDeleteExpense(selectedExpense.id);
            setSelectedExpense(null);
          }}
        />
      )}
    </motion.div>
  );
}
