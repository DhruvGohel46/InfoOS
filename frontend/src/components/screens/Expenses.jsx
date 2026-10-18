import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useAlert } from '../../context/AlertContext';
import { useTheme } from '../../context/ThemeContext';
import { expensesAPI } from '../../api/expenses';
import { reportsAPI, formatCurrency } from '../../utils/api';
import PageContainer from '../layout/PageContainer';
import ExpenseFormModal from '../expenses/ExpenseFormModal';
import ExpenseDetailsModal from '../expenses/ExpenseDetailsModal';
import {
  FiPlus,
  FiShoppingBag,
  FiTruck,
  FiTool,
  FiZap,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiUser,
  FiHome,
  FiCreditCard,
  FiDollarSign,
  FiCalendar,
  FiDownload,
  FiRefreshCw,
  FiTrendingDown
} from 'react-icons/fi';
import '../../styles/Expenses.css';

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

export default function Expenses() {
  const { addToast } = useAlert();
  const { isDark } = useTheme();

  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expenseTypes, setExpenseTypes] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [exporting, setExporting] = useState(false);

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
        setExpenses(res.expenses || []);
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
        const title = expenseData.title || expenseData.category || 'General Expense';
        const amount = expenseData.amount ? formatCurrency(expenseData.amount) : '';
        addToast({
          type: 'success',
          title: 'Expense Recorded',
          description: `Expense of ${amount} recorded for "${title}"`,
          category: 'expenses',
          action_route: '/expenses'
        });
        setIsFormOpen(false);
        fetchExpenses();
      } else {
        addToast({ type: 'error', title: 'Error Recording Expense', description: res.message || 'Could not record expense' });
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Error Recording Expense', description: 'Failed to record expense' });
    }
  };

  const handleUpdateExpense = async (expenseData) => {
    try {
      const res = await expensesAPI.updateExpense(editingExpense.id, expenseData);
      if (res.success) {
        const title = expenseData.title || editingExpense?.title || 'Expense';
        const amount = expenseData.amount ? formatCurrency(expenseData.amount) : '';
        addToast({
          type: 'success',
          title: 'Expense Updated',
          description: `Expense "${title}" updated to ${amount}`,
          category: 'expenses',
          action_route: '/expenses'
        });
        setEditingExpense(null);
        fetchExpenses();
      } else {
        addToast({ type: 'error', title: 'Error Updating Expense', description: res.message || 'Could not update expense' });
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Error Updating Expense', description: 'Failed to update expense' });
    }
  };

  const handleDeleteExpense = async (expenseId) => {
    const target = expenses.find(e => e.id === expenseId);
    const expTitle = target ? `"${target.title || target.category || 'Expense'}" (${formatCurrency(target.amount || 0)})` : 'this expense record';
    if (!window.confirm(`Are you sure you want to delete ${expTitle}?`)) return;
    try {
      const res = await expensesAPI.deleteExpense(expenseId);
      if (res.success) {
        addToast({
          type: 'success',
          title: 'Expense Deleted',
          description: `Expense record ${expTitle} was removed`,
          category: 'expenses',
          action_route: '/expenses'
        });
        fetchExpenses();
      } else {
        addToast({ type: 'error', title: 'Error Deleting Expense', description: res.message || 'Could not delete expense' });
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Error Deleting Expense', description: 'Failed to delete expense' });
    }
  };

  const handleExportExpenses = async () => {
    try {
      setExporting(true);
      const today = new Date().toISOString().split('T')[0];
      const res = await reportsAPI.exportWeeklyExpensesExcel(today);
      if (res && res.data) {
        const url = window.URL.createObjectURL(new Blob([res.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `InfoOS_Expenses_${today}.xlsx`);
        document.body.appendChild(link);
        link.click();
        link.parentNode.removeChild(link);
        addToast({ type: 'success', title: 'Expenses Exported Successfully' });
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Export Failed', description: 'Could not generate expenses excel report' });
    } finally {
      setExporting(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const getCategoryTheme = (category) => {
    switch (category) {
      case 'Salary':
        return { color: '#3B82F6', icon: <FiUser size={16} /> };
      case 'Utilities':
        return { color: '#F59E0B', icon: <FiZap size={16} /> };
      case 'Rent':
        return { color: '#8B5CF6', icon: <FiHome size={16} /> };
      case 'Supplies':
        return { color: '#10B981', icon: <FiShoppingBag size={16} /> };
      case 'Equipment':
        return { color: '#EC4899', icon: <FiTool size={16} /> };
      case 'Transport':
        return { color: '#06B6D4', icon: <FiTruck size={16} /> };
      case 'Maintenance':
        return { color: '#F97316', icon: <FiTool size={16} /> };
      default:
        return { color: '#64748B', icon: <FiDollarSign size={16} /> };
    }
  };

  // Metrics Calculations
  const metrics = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const todayStr = now.toISOString().split('T')[0];

    let totalAmount = 0;
    let thisMonthAmount = 0;
    let todayAmount = 0;
    const categoryTotals = {};

    expenses.forEach((exp) => {
      const amt = Number(exp.amount) || 0;
      totalAmount += amt;

      const expDate = new Date(exp.date || exp.created_at || now);
      if (expDate.getMonth() === currentMonth && expDate.getFullYear() === currentYear) {
        thisMonthAmount += amt;
      }

      const expDateStr = exp.date ? exp.date.split('T')[0] : '';
      if (expDateStr === todayStr) {
        todayAmount += amt;
      }

      const cat = exp.category || 'Other';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
    });

    let topCatName = 'None';
    let topCatAmount = 0;
    Object.entries(categoryTotals).forEach(([cat, amt]) => {
      if (amt > topCatAmount) {
        topCatAmount = amt;
        topCatName = cat;
      }
    });

    return {
      totalAmount,
      thisMonthAmount,
      todayAmount,
      totalCount: expenses.length,
      topCategory: topCatName,
      topCatAmount
    };
  }, [expenses]);

  const categoriesList = useMemo(() => {
    const list = ['All', ...expenseTypes];
    return Array.from(new Set(list));
  }, [expenseTypes]);

  const filteredExpenses = useMemo(() => {
    return expenses
      .filter((expense) => {
        const matchesSearch =
          (expense.title && expense.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (expense.worker_name && expense.worker_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (expense.notes && expense.notes.toLowerCase().includes(searchQuery.toLowerCase()));
        const matchesCategory = selectedCategory === 'All' || expense.category === selectedCategory;
        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => {
        const dateA = new Date(a.date || a.created_at || 0);
        const dateB = new Date(b.date || b.created_at || 0);
        return dateB - dateA || b.id - a.id;
      });
  }, [expenses, searchQuery, selectedCategory]);

  return (
    <PageContainer>
      <div className="expenses-page-wrap">
        {/* ─── Unified Header Card (24px Curve, Black-Grey) ─── */}
        <div
          style={{
            padding: '18px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: isDark
              ? 'linear-gradient(165deg, #18191D 0%, #111215 100%)'
              : '#FFFFFF',
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
              Expenses
            </h1>
            <p
              style={{
                margin: '4px 0 0 0',
                color: isDark ? '#94A3B8' : '#64748B',
                fontSize: '0.88rem',
                fontWeight: 500
              }}
            >
              Track operational spending, vendor payments, and staff salary payouts
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={fetchExpenses}
              disabled={loading}
              title="Refresh expenses data"
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
                transition: 'all 0.18s ease'
              }}
            >
              <FiRefreshCw className={loading ? 'spinner' : ''} size={15} /> Refresh
            </button>

            <button
              type="button"
              onClick={handleExportExpenses}
              disabled={exporting || expenses.length === 0}
              title="Export all expense records to Excel"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                height: '40px',
                padding: '0 16px',
                borderRadius: '12px',
                fontSize: '0.84rem',
                fontWeight: '700',
                border: isDark ? '1px solid rgba(16, 185, 129, 0.35)' : '1.5px solid #86EFAC',
                background: isDark ? 'rgba(16, 185, 129, 0.1)' : '#F0FDF4',
                color: isDark ? '#34D399' : '#16A34A',
                cursor: exporting ? 'not-allowed' : 'pointer',
                transition: 'all 0.18s ease'
              }}
            >
              <FiDownload size={15} /> {exporting ? 'Exporting...' : 'Export Excel'}
            </button>

            <button
              type="button"
              onClick={() => setIsFormOpen(true)}
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
                transition: 'all 0.18s ease'
              }}
            >
              <FiPlus size={18} /> Add Expense
            </button>
          </div>
        </div>

        {/* ─── Metric Summary Cards (2-Column Modern Glass) ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
          {[
            {
              label: 'This Month Spending',
              value: formatCurrency(metrics.thisMonthAmount),
              subtext: 'Current billing cycle',
              color: '#3B82F6',
              icon: <FiCalendar size={22} />
            },
            {
              label: 'Today Spending',
              value: formatCurrency(metrics.todayAmount),
              subtext: `Top category: ${metrics.topCategory}`,
              color: '#10B981',
              icon: <FiTrendingDown size={22} />
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
                padding: '14px 20px',
                background: isDark
                  ? 'linear-gradient(165deg, #18191D 0%, #111215 100%)'
                  : '#FFFFFF',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #E2E8F0',
                borderRadius: '20px',
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
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  flexWrap: 'wrap',
                  flex: 1,
                  minWidth: 0
                }}
              >
                <span
                  style={{
                    fontSize: '0.76rem',
                    fontWeight: '800',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: isDark ? '#94A3B8' : '#64748B',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {card.label}:
                </span>
                <span
                  style={{
                    fontSize: '1.40rem',
                    fontWeight: '850',
                    color: isDark ? '#FFFFFF' : '#0F172A',
                    letterSpacing: '-0.02em',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {card.value}
                </span>
                <span
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: isDark ? '#94A3B8' : '#64748B',
                    background: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
                    padding: '3px 10px',
                    borderRadius: '8px',
                    whiteSpace: 'nowrap',
                    marginLeft: 'auto'
                  }}
                >
                  {card.subtext}
                </span>
              </div>
            </motion.div>
          ))}
        </div>

        {/* ─── Controls: Search & Category Filter Pills ─── */}
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
          <div className="expenses-search" style={{ flex: '1 1 280px' }}>
            <FiSearch className="expenses-search-icon" size={16} />
            <input
              className="expenses-search-input"
              type="text"
              placeholder="Search expenses by title, notes, or worker..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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
            {categoriesList.map((cat) => {
              const isActive = selectedCategory === cat;
              const count = cat === 'All' ? expenses.length : expenses.filter((e) => e.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
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
                    flexShrink: 0
                  }}
                >
                  {isActive && (
                    <motion.div
                      layoutId="expenses-category-active-pill"
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
                  <span style={{ position: 'relative', zIndex: 2 }}>
                    {cat} ({count})
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── Expenses List / Cards ─── */}
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
              <span style={{ fontWeight: 600 }}>Loading expense records...</span>
            </div>
          ) : filteredExpenses.length === 0 ? (
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
                <FiDollarSign size={26} />
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: isDark ? '#FFFFFF' : '#0F172A' }}>
                No Expenses Found
              </div>
              <p style={{ fontSize: '0.88rem', color: isDark ? '#94A3B8' : '#64748B', margin: 0, maxWidth: '420px' }}>
                {searchQuery || selectedCategory !== 'All'
                  ? 'No expense records matched your active filters or search terms.'
                  : 'Start recording operational outflows, vendor utility payments, and staff wages.'}
              </p>
              {!searchQuery && selectedCategory === 'All' && (
                <button
                  onClick={() => setIsFormOpen(true)}
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
                  Record First Expense
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
              {/* Header Titles */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '130px 1.8fr 140px 140px 140px 150px 90px',
                  gap: '16px',
                  padding: '8px 24px',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: isDark ? '#64748B' : '#94A3B8'
                }}
                className="expenses-table-desktop-header"
              >
                <div>Date</div>
                <div>Title / Notes</div>
                <div>Category</div>
                <div>Worker</div>
                <div>Payment Mode</div>
                <div style={{ textAlign: 'right' }}>Amount</div>
                <div style={{ textAlign: 'right' }}>Actions</div>
              </div>

              {/* Rows */}
              {filteredExpenses.map((expense) => {
                const catTheme = getCategoryTheme(expense.category);
                return (
                  <motion.div
                    key={expense.id}
                    variants={staggerItem}
                    whileHover={{ y: -2 }}
                    onClick={() => setSelectedExpense(expense)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '130px 1.8fr 140px 140px 140px 150px 90px',
                      gap: '16px',
                      alignItems: 'center',
                      padding: '16px 24px',
                      background: isDark
                        ? 'linear-gradient(165deg, #18191D 0%, #111215 100%)'
                        : '#FFFFFF',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #E2E8F0',
                      borderRadius: '20px',
                      boxShadow: isDark
                        ? '0 6px 20px -6px rgba(0, 0, 0, 0.4)'
                        : '0 2px 10px rgba(15, 23, 42, 0.04)',
                      cursor: 'pointer',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255, 107, 26, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0';
                    }}
                  >
                    {/* Date */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: isDark ? '#94A3B8' : '#64748B', fontSize: '0.86rem', fontWeight: 600 }}>
                      <FiCalendar size={14} style={{ opacity: 0.6 }} />
                      {formatDate(expense.date || expense.created_at)}
                    </div>

                    {/* Title & Notes */}
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
                        {expense.title}
                      </span>
                      {expense.notes && (
                        <span
                          style={{
                            fontSize: '0.80rem',
                            color: isDark ? '#64748B' : '#94A3B8',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            marginTop: '2px'
                          }}
                        >
                          {expense.notes}
                        </span>
                      )}
                    </div>

                    {/* Category Capsule */}
                    <div>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '5px 12px',
                          borderRadius: '999px',
                          background: `${catTheme.color}15`,
                          border: `1px solid ${catTheme.color}30`,
                          color: catTheme.color,
                          fontSize: '0.80rem',
                          fontWeight: 750
                        }}
                      >
                        {catTheme.icon}
                        {expense.category}
                      </span>
                    </div>

                    {/* Worker */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.86rem', color: isDark ? '#CBD5E1' : '#334155', fontWeight: 600 }}>
                      {expense.worker_name ? (
                        <>
                          <FiUser size={14} style={{ color: '#FF6B1A' }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {expense.worker_name}
                          </span>
                        </>
                      ) : (
                        <span style={{ opacity: 0.35 }}>—</span>
                      )}
                    </div>

                    {/* Payment Mode */}
                    <div>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 10px',
                          borderRadius: '8px',
                          background: isDark ? '#1C1D22' : '#F1F5F9',
                          border: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid #CBD5E1',
                          color: isDark ? '#94A3B8' : '#475569',
                          fontSize: '0.80rem',
                          fontWeight: 650
                        }}
                      >
                        <FiCreditCard size={13} style={{ opacity: 0.7 }} />
                        {expense.payment_method || 'Cash'}
                      </span>
                    </div>

                    {/* Amount */}
                    <div style={{ textAlign: 'right', fontSize: '1.15rem', fontWeight: 900, color: '#FF6B1A', letterSpacing: '-0.02em' }}>
                      {formatCurrency(expense.amount)}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingExpense(expense);
                        }}
                        title="Edit Expense"
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #CBD5E1',
                          background: isDark ? '#1C1D22' : '#F8FAFC',
                          color: isDark ? '#94A3B8' : '#64748B',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
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
                        <FiEdit2 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteExpense(expense.id);
                        }}
                        title="Delete Expense"
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
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
                        }}
                      >
                        <FiTrash2 size={14} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </div>

        {/* ─── Form & Details Modals ─── */}
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
      </div>
    </PageContainer>
  );
}
