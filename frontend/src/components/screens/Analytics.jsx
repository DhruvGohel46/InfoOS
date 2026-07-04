/**
 * =============================================================================
 * ANALYTICS DASHBOARD — REDESIGNED
 * =============================================================================
 *
 * Two-tab layout: Report (default) | Transactions
 *   - Report: KPI bar, Day/Week/Month range toggle, interactive bar + pie charts,
 *             download section (daily/monthly/weekly Excel)
 *   - Transactions: sortable table of all bills with Edit/Cancel actions
 *
 * Dependencies: recharts, framer-motion, react-icons
 * =============================================================================
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend,
    ResponsiveContainer, PieChart, Pie, Cell, Sector
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import api, { summaryAPI, reportsAPI, billingAPI, getLocalDateString, groupsAPI, categoriesAPI } from '../../utils/api';
import { formatCurrency, handleAPIError, downloadFile } from '../../utils/api';
import { usePOSData } from '../../context/POSDataContext';
import { useDebounce } from '../../hooks/useDebounce';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Skeleton from '../ui/Skeleton';
import GlobalDatePicker from '../ui/GlobalDatePicker';
import PageContainer from '../layout/PageContainer';
import GlobalSelect from '../ui/GlobalSelect';
import {
    IoBarChartOutline,
    IoReceiptOutline,
    IoDownloadOutline,
    IoCalendarOutline,
    IoRefreshOutline,
    IoTodayOutline,
    IoTrashOutline,
    IoCreateOutline,
    IoCloseCircleOutline,
    IoWalletOutline,
    IoBusinessOutline,
    IoConstructOutline,
    IoPeopleOutline,
    IoCartOutline,
    IoFlashOutline,
    IoHomeOutline,
    IoBusOutline,
    IoTrendingUpOutline,
    IoStatsChartOutline
} from 'react-icons/io5';
import { FiDollarSign } from 'react-icons/fi';
import '../../styles/Analytics.css';

// ─── Color palette for charts ───
const CHART_COLORS = [
    '#6366F1', '#10B981', '#F59E0B', '#3B82F6', '#EF4444',
    '#8B5CF6', '#EC4899', '#06B6D4', '#F43F5E', '#14B8A6',
    '#A855F7', '#FB923C', '#22D3EE', '#84CC16', '#E11D48',
];

// ─── Custom Tooltip for Bar Chart ───
const BarTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;
    const d = payload[0].payload;
    return (
        <div className="analytics-tooltip">
            <div className="analytics-tooltip-label">{d.name}</div>
            <div className="analytics-tooltip-value">
                Amount: {formatCurrency(d.total_amount)}
            </div>
            <div className="analytics-tooltip-value">
                Qty: {d.quantity} units
            </div>
        </div>
    );
};

// ─── Custom Active Shape for Pie Chart ───
const renderActiveShape = (props) => {
    const {
        cx, cy, innerRadius, outerRadius, startAngle, endAngle,
        fill, payload, percent
    } = props;
    return (
        <g>
            <Sector
                cx={cx} cy={cy}
                innerRadius={innerRadius - 4}
                outerRadius={outerRadius + 8}
                startAngle={startAngle} endAngle={endAngle}
                fill={fill}
            />
            <text x={cx} y={cy - 16} textAnchor="middle" fill="var(--text-primary)"
                style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                {payload.name}
            </text>
            <text x={cx} y={cy + 8} textAnchor="middle" fill="var(--text-secondary)"
                style={{ fontSize: '1rem', fontWeight: 600 }}>
                {formatCurrency(payload.total_amount || payload.value || 0)}
            </text>
            <text x={cx} y={cy + 28} textAnchor="middle" fill="var(--text-secondary)"
                style={{ fontSize: '0.9rem' }}>
                {(percent * 100).toFixed(1)}%
            </text>
        </g>
    );
};

// ─── Helpers ───


// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════
const Analytics = () => {
    const navigate = useNavigate();
    const { isDark } = useTheme();
    const { isAdmin } = useAuth();
    const {
        refreshAll: refreshPOSData,
        cachedAnalytics,
        preloadAnalytics
    } = usePOSData();

    // ─── Tabs ───
    const [activeTab, setActiveTab] = useState('transactions');
    const tabs = [
        { id: 'transactions', label: 'Transactions', icon: IoReceiptOutline },
        { id: 'sales_history', label: 'Sales History', icon: IoBarChartOutline },
        { id: 'expenses_history', label: 'Expenses History', icon: IoWalletOutline },
        { id: 'reports_hub', label: 'Reports Hub', icon: IoDownloadOutline },
    ];
    const visibleTabs = isAdmin ? tabs : tabs.filter((tab) => tab.id === 'transactions');

    useEffect(() => {
        if (!isAdmin) {
            setActiveTab('transactions');
        }
    }, [isAdmin]);

    // ─── Summary / Product Sales ───
    const [summary, setSummary] = useState(null);
    const [productSales, setProductSales] = useState([]);
    const [selectedDate, setSelectedDate] = useState(getLocalDateString());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // ─── Groups for filtering ───
    const [groups, setGroups] = useState([]);
    const [selectedGroupId, setSelectedGroupId] = useState('all');
    const [categories, setCategories] = useState([]);

    // ─── Range toggle ───
    const [viewRange, setViewRange] = useState('day');       // 'day' | 'week' | 'month' | 'year'
    const [rangeProductSales, setRangeProductSales] = useState([]);
    const [viewRangeProductSales, setViewRangeProductSales] = useState([]);
    const [rangeSummary, setRangeSummary] = useState(null);
    const [rangeLoading, setRangeLoading] = useState(false);

    // ─── Debounced Date for Range Loading ───
    const debouncedDate = useDebounce(selectedDate, 300);

    // ─── Sync from Context on Mount / Refresh ───
    useEffect(() => {
        if (!isAdmin) {
            setLoading(false);
            setSummary(null);
            setProductSales([]);
            return;
        }
        if (selectedDate === getLocalDateString() && cachedAnalytics?.data) {
            setSummary(cachedAnalytics.data);
            setLoading(false);
        } else {
            loadSummary(selectedDate);
            loadProductSales(selectedDate);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate, cachedAnalytics, isAdmin]);

    // ─── Load groups and categories on mount ───
    useEffect(() => {
        const loadData = async () => {
            try {
                const [groupsRes, catsRes] = await Promise.all([
                    groupsAPI.getAllGroups(false),
                    categoriesAPI.getAllCategories(false)
                ]);
                setGroups(groupsRes.data.groups || []);
                setCategories(catsRes.data.categories || []);
            } catch (err) {
                console.error('Failed to load data:', err);
            }
        };
        loadData();
    }, []);

    // ─── Reload data when group changes ───
    useEffect(() => {
        if (isAdmin) {
            loadProductSales(selectedDate);
            loadRangeData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedGroupId]);

    // ─── Reports / Download ───
    const [downloading, setDownloading] = useState({});
    const [dailyReportDate, setDailyReportDate] = useState(getLocalDateString());
    const [exportMonth, setExportMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [exportWeekDate, setExportWeekDate] = useState(getLocalDateString());

    // ─── Bills / Transactions ───
    const [bills, setBills] = useState([]);
    const [loadingBills, setLoadingBills] = useState(false);
    const [selectedBillDate, setSelectedBillDate] = useState(getLocalDateString());
    const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });

    // ─── Clear Data Modal ───
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [clearPassword, setClearPassword] = useState('');
    const [showClearPassword, setShowClearPassword] = useState(false);
    const [clearingData, setClearingData] = useState(false);

    // ─── Cancel Bill Modal ───
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    const [selectedBill, setSelectedBill] = useState(null);

    // ─── Expenses Tab ───
    const [expenseRange, setExpenseRange] = useState('week'); // 'week' | 'month' | 'year'
    const [rangeExpenses, setRangeExpenses] = useState([]);
    // eslint-disable-next-line no-unused-vars
    const [loadingExpenses, setLoadingExpenses] = useState(false);
    const [expenseSearchQuery] = useState('');

    // ─── Pie chart active sector ───
    const [activePieIndex, setActivePieIndex] = useState(-1);

    const safeSummary = summary || {};

    // ═══════════════ DATA LOADING ═══════════════

    useEffect(() => {
        if (!isAdmin) return;
        loadSummary(selectedDate);
        loadProductSales(selectedDate);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate, isAdmin]);

    useEffect(() => {
        loadBills(selectedBillDate);
    }, [selectedBillDate]);

    useEffect(() => {
        if (!isAdmin) return;
        if (activeTab === 'expenses_history') {
            loadRangeExpenses(expenseRange);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, expenseRange, isAdmin, selectedDate]);

    // Aggregate range data when viewRange or selectedDate changes
    useEffect(() => {
        if (!isAdmin) return;
        if (viewRange === 'day') {
            setRangeProductSales(productSales);
            setRangeSummary(summary);
        } else {
            loadRangeData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewRange, debouncedDate, productSales, summary, isAdmin]);

    async function loadSummary(date) {
        try {
            setLoading(true);
            setError('');
            const response = date
                ? await summaryAPI.getSummaryForDate(date)
                : await summaryAPI.getTodaySummary();
            setSummary(response.data.summary);
        } catch (err) {
            const apiError = handleAPIError(err);
            setError(apiError.message);
        } finally {
            setLoading(false);
        }
    }

    async function loadProductSales(date) {
        try {
            const response = await summaryAPI.getProductSales(date);
            if (response.data?.success) {
                let sales = response.data.product_sales || [];
                // Filter by group if selected
                if (selectedGroupId !== 'all') {
                    const groupCategories = categories
                        .filter(cat => cat.group_id === parseInt(selectedGroupId))
                        .map(cat => cat.id);
                    sales = sales.filter(item => {
                        // Filter by category_id if available in the data
                        if (item.category_id) {
                            return groupCategories.includes(item.category_id);
                        }
                        return true; // If no category_id, include it (fallback)
                    });
                }
                setProductSales(sales);
            }
        } catch (err) {
            console.error('Error loading product sales:', err);
        }
    }

    async function loadRangeData() {
        try {
            setRangeLoading(true);

            let start, end;
            const refDate = new Date(selectedDate);

            if (viewRange === 'week') {
                const day = refDate.getDay() || 7;
                const s = new Date(refDate);
                s.setDate(refDate.getDate() - (day - 1));
                const e = new Date(s);
                e.setDate(s.getDate() + 6);
                start = s.toISOString().split('T')[0];
                end = e.toISOString().split('T')[0];
            } else if (viewRange === 'month') {
                start = `${refDate.getFullYear()}-${String(refDate.getMonth() + 1).padStart(2, '0')}-01`;
                const lastDay = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0).getDate();
                end = `${refDate.getFullYear()}-${String(refDate.getMonth() + 1).padStart(2, '0')}-${lastDay}`;
            } else { // year
                start = `${refDate.getFullYear()}-01-01`;
                end = `${refDate.getFullYear()}-12-31`;
            }

            // Fetch aggregated stats for the chart
            const [aggRes, rangeRes] = await Promise.all([
                summaryAPI.getAggregatedSummary(start, end),
                summaryAPI.getRangeSummary(viewRange, selectedDate)
            ]);

            if (aggRes.data.success) {
                const daily = aggRes.data.daily;

                // Map daily data to what charts expect
                let mappedDaily = daily.map(d => ({
                    name: d.date.split('-').slice(1).join('/'), // MM/DD
                    total_amount: d.total_sales,
                    quantity: d.total_orders
                }));

                setRangeProductSales(mappedDaily);
            }

            if (rangeRes.data.success && rangeRes.data.summary) {
                const summaryObj = rangeRes.data.summary;
                let rawProducts = summaryObj.products || [];

                // Filter products by selected group if active
                if (selectedGroupId !== 'all') {
                    const groupCategories = categories
                        .filter(cat => cat.group_id === parseInt(selectedGroupId))
                        .map(cat => cat.id);
                    rawProducts = rawProducts.filter(item => {
                        if (item.category_id) {
                            return groupCategories.includes(item.category_id);
                        }
                        // Fallback filter by normalizing category comparison if needed
                        return true;
                    });
                }

                // Map fields to match Top Selling Products layout expects
                const mappedProducts = rawProducts.map(p => ({
                    name: p.name,
                    quantity: p.quantity,
                    total_amount: p.total_amount
                }));

                setViewRangeProductSales(mappedProducts);

                // Set aggregated totals from the full range summary to include category totals
                setRangeSummary({
                    total_sales: summaryObj.total_sales,
                    total_expenses: summaryObj.total_expenses,
                    net_profit: summaryObj.net_profit,
                    total_bills: summaryObj.total_bills,
                    category_totals: summaryObj.category_totals || {}
                });
            }
        } catch (err) {
            console.error('Error loading range data:', err);
        } finally {
            setRangeLoading(false);
        }
    }

    async function loadBills(date) {
        try {
            setLoadingBills(true);
            const targetDate = date || new Date().toISOString().split('T')[0];
            const response = await api.get(`/api/bill/date/${targetDate}`);
            if (response.data.success) {
                const sorted = response.data.bills.sort((a, b) => {
                    const dateA = new Date(a.created_at || 0);
                    const dateB = new Date(b.created_at || 0);
                    return dateB - dateA || b.bill_no - a.bill_no;
                });
                setBills(sorted);
            }
        } catch (err) {
            console.error('Error loading bills:', err);
        } finally {
            setLoadingBills(false);
        }
    }

    async function loadRangeExpenses() {
        try {
            setLoadingExpenses(true);
            const response = await api.get('/api/expenses', {
                params: {
                    range: expenseRange,
                    date: selectedDate
                }
            });
            setRangeExpenses(response.data.expenses || []);
        } catch (err) {
            console.error('Error loading expenses:', err);
        } finally {
            setLoadingExpenses(false);
        }
    }

    // ═══════════════ HANDLERS ═══════════════

    const handleEditBill = (bill) => {
        if (bill.status === 'CANCELLED') return;
        navigate('/bill', { state: { bill } });
    };

    const handleCancelBillConfirm = async () => {
        try {
            if (!selectedBill) return;
            const response = await billingAPI.cancelBill(selectedBill.bill_no);
            if (response.data.success) {
                setShowCancelConfirm(false);
                setSelectedBill(null);
                await Promise.all([
                    loadBills(selectedBillDate),
                    loadSummary(selectedDate),
                    loadProductSales(selectedDate),
                ]);
            }
        } catch (err) {
            const apiError = handleAPIError(err);
            setError(apiError.message);
        }
    };

    const handleDownload = async (reportType, reportName, filename, date = null) => {
        try {
            setDownloading(prev => ({ ...prev, [reportType]: true }));
            setError('');
            let response;
            if (reportType === 'excel') {
                response = await reportsAPI.exportTodayExcel('detailed', date);
            } else if (reportType === 'csv') {
                response = await reportsAPI.exportTodayCSV();
            } else if (reportType === 'expense_excel') {
                // Here 'date' is used as the range (today/week/month/year)
                response = await reportsAPI.exportExpensesExcel(date);
            }
            if (response && response.data) downloadFile(response.data, filename);
        } catch (err) {
            const apiError = handleAPIError(err);
            setError(apiError.message);
        } finally {
            setDownloading(prev => ({ ...prev, [reportType]: false }));
        }
    };

    const handleMonthlyExport = async () => {
        try {
            setDownloading(prev => ({ ...prev, monthly: true }));
            setError('');
            const [yearStr, monthStr] = String(exportMonth).split('-');
            const response = await reportsAPI.exportMonthlyExcel(Number(monthStr), Number(yearStr));
            if (response && response.data) {
                downloadFile(response.data, `Monthly_Sales_Report_${monthStr}_${yearStr}.xlsx`);
            }
        } catch (err) {
            const apiError = handleAPIError(err);
            setError(apiError.message);
        } finally {
            setDownloading(prev => ({ ...prev, monthly: false }));
        }
    };

    const handleWeeklyExport = async () => {
        try {
            setDownloading(prev => ({ ...prev, weekly: true }));
            setError('');
            const response = await reportsAPI.exportWeeklyExcel(exportWeekDate);
            const d = new Date(exportWeekDate);
            const day = d.getDay() || 7;
            if (day !== 1) d.setHours(-24 * (day - 1));
            const start = new Date(d);
            const end = new Date(d);
            end.setDate(end.getDate() + 6);
            const sStr = `${String(start.getDate()).padStart(2, '0')}${String(start.getMonth() + 1).padStart(2, '0')}${start.getFullYear()}`;
            const eStr = `${String(end.getDate()).padStart(2, '0')}${String(end.getMonth() + 1).padStart(2, '0')}${end.getFullYear()}`;
            const filename = `Weekly_Sales_Report_${sStr}_to_${eStr}.xlsx`;
            if (response && response.data) downloadFile(response.data, filename);
        } catch (err) {
            const apiError = handleAPIError(err);
            setError(apiError.message);
        } finally {
            setDownloading(prev => ({ ...prev, weekly: false }));
        }
    };

    const handleClearBills = async () => {
        try {
            setClearingData(true);
            setError('');
            const response = await billingAPI.clearAllBills(clearPassword);
            if (response.data?.success) {
                setShowClearConfirm(false);
                setClearPassword('');
                await loadSummary(selectedDate);
                await loadProductSales(selectedDate);
                await loadBills(selectedBillDate);
            } else {
                throw new Error(response.data?.message || 'Failed to clear bills data');
            }
        } catch (err) {
            const apiError = handleAPIError(err);
            setError(apiError.message);
        } finally {
            setClearingData(false);
        }
    };

    // ─── Sort helpers ───
    // eslint-disable-next-line no-unused-vars
    const handleSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    const sortedBills = useMemo(() => {
        const arr = [...bills];
        const { key, direction } = sortConfig;
        arr.sort((a, b) => {
            let aVal, bVal;
            switch (key) {
                case 'bill_no':
                    aVal = a.bill_no; bVal = b.bill_no; break;
                case 'created_at':
                    aVal = new Date(a.created_at || 0).getTime();
                    bVal = new Date(b.created_at || 0).getTime(); break;
                case 'total_amount':
                    aVal = Number(a.total_amount); bVal = Number(b.total_amount); break;
                case 'status':
                    aVal = a.status || 'ACTIVE'; bVal = b.status || 'ACTIVE'; break;
                case 'items':
                    aVal = a.items?.length || 0; bVal = b.items?.length || 0; break;
                default:
                    return 0;
            }
            if (aVal < bVal) return direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return direction === 'asc' ? 1 : -1;
            return 0;
        });
        return arr;
    }, [bills, sortConfig]);

    // ─── Time formatting ───
    const formatTime = (timestamp) => {
        if (!timestamp) return 'N/A';
        try {
            const d = new Date(timestamp.replace(' ', 'T'));
            return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
        } catch { return timestamp; }
    };

    const formatDate = (timestamp) => {
        if (!timestamp) return 'N/A';
        try {
            return new Date(timestamp.replace(' ', 'T')).toLocaleDateString();
        } catch { return timestamp.split(' ')[0]; }
    };

    const getExpenseIcon = (category) => {
        switch (category) {
            case 'Salary': return <IoPeopleOutline />;
            case 'Wages': return <IoPeopleOutline />;
            case 'Advance': return <IoWalletOutline />;
            case 'Utilities': return <IoFlashOutline />;
            case 'Electric Bill': return <IoFlashOutline />;
            case 'Rent': return <IoHomeOutline />;
            case 'Supplies': return <IoCartOutline />;
            case 'Equipment': return <IoConstructOutline />;
            case 'Transport': return <IoBusOutline />;
            case 'Maintenance': return <IoConstructOutline />;
            case 'Other': return <IoBusinessOutline />;
            default: return <FiDollarSign />;
        }
    };

    // ─── Accent Color System based on Bill Number ───
    const getAccentColor = (billNo) => {
        const colors = [
            '#FF7A00', // Orange (primary)
            '#3B82F6', // Blue
            '#A855F7', // Purple
            '#14B8A6', // Teal
            '#22C55E', // Green
            '#F59E0B', // Amber
            '#EC4899', // Pink
            '#6366F1', // Indigo
        ];
        return colors[billNo % colors.length];
    };

    // ─── Calculate summary metrics ───
    // eslint-disable-next-line no-unused-vars
    const summaryMetrics = useMemo(() => {
        const totalBills = bills.length;
        const totalRevenue = bills.reduce((sum, bill) => sum + (bill.total_amount || 0), 0);
        const totalItems = bills.reduce((sum, bill) => sum + (bill.items?.length || 0), 0);
        const averageBill = totalBills > 0 ? totalRevenue / totalBills : 0;

        return {
            totalBills,
            totalRevenue,
            totalItems,
            averageBill
        };
    }, [bills]);



    const filteredRangeExpenses = useMemo(() => {
        if (!expenseSearchQuery) return rangeExpenses;
        const query = expenseSearchQuery.toLowerCase();
        return rangeExpenses.filter(exp =>
            exp.title.toLowerCase().includes(query) ||
            exp.category.toLowerCase().includes(query) ||
            String(exp.amount).includes(query)
        );
    }, [rangeExpenses, expenseSearchQuery]);

    // Decide which data to render in charts
    const chartProductSales = viewRange === 'day' ? productSales : rangeProductSales;
    const chartSummary = viewRange === 'day' ? safeSummary : (rangeSummary || safeSummary);

    // ═══════════════ RENDER ═══════════════

    // Loading skeleton
    if (loading && !summary) {
        return (
            <PageContainer>
                <div style={{ padding: '32px' }}>
                    <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between' }}>
                        <Skeleton height="60px" width="35%" borderRadius="16px" />
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <Skeleton height="44px" width="120px" borderRadius="12px" />
                            <Skeleton height="44px" width="120px" borderRadius="12px" />
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '20px' }}>
                        <Skeleton height="380px" borderRadius="16px" />
                        <Skeleton height="380px" borderRadius="16px" />
                    </div>
                </div>
            </PageContainer>
        );
    }

    // Error state
    if (error && !summary) {
        return (
            <PageContainer>
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', minHeight: '60vh', padding: '32px',
                }}>
                    <div style={{
                        background: 'var(--surface-primary)', border: '1px solid var(--error-500, #ef4444)',
                        borderRadius: '14px', padding: '32px', textAlign: 'center', maxWidth: '400px',
                    }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--error-500, #ef4444)', marginBottom: '8px' }}>
                            Error Loading Data
                        </div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                            {error}
                        </div>
                        <Button onClick={() => { setError(''); loadSummary(selectedDate); }} variant="primary" size="sm">
                            Try Again
                        </Button>
                    </div>
                </div>
            </PageContainer>
        );
    }

    return (
        <PageContainer>
            {/* ════════════════ HEADER ════════════════ */}
            <motion.div
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="analytics-header-glass"
            >
                <div className="analytics-header-top">
                    {/* Left: Title + Tabs */}
                    <div className="analytics-header-left">
                        <h1 className="analytics-title">Analytics</h1>
                        <div className="analytics-tab-bar">
                            {visibleTabs.map((tab) => (
                                <motion.button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`analytics-tab-btn ${activeTab === tab.id ? 'analytics-tab-btn--active' : ''}`}
                                    whileTap={{ scale: 0.97 }}
                                >
                                    <tab.icon size={17} />
                                    {tab.label}
                                </motion.button>
                            ))}
                        </div>
                    </div>

                    {/* Right: Action buttons */}
                    <div className="analytics-actions">
                        {isAdmin && (
                            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                                <Button
                                    onClick={() => setShowClearConfirm(true)}
                                    variant="error"
                                    size="lg"
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                                >
                                    <IoTrashOutline size={18} />
                                    Clear Data
                                </Button>
                            </motion.div>
                        )}
                        <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                            <Button
                                onClick={() => {
                                    refreshPOSData(); // Context refresh (boostrap + cache invalidation)
                                    if (isAdmin) {
                                        loadSummary(selectedDate);
                                        loadProductSales(selectedDate);
                                        loadRangeData();
                                        preloadAnalytics();
                                    }
                                    loadBills(selectedBillDate);
                                }}
                                variant="secondary"
                                size="lg"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    background: 'var(--primary-500)',
                                    color: '#fff'
                                }}
                            >
                                <IoRefreshOutline size={18} />
                                Refresh
                            </Button>
                        </motion.div>
                    </div>
                </div>
            </motion.div>

            {/* ════════════════ TAB CONTENT ════════════════ */}
            <div className="analytics-tab-content">
                <AnimatePresence mode="wait">
                    {/* ──────────── SALES HISTORY TAB ──────────── */}
                    {activeTab === 'sales_history' && (
                        <motion.div
                            key="sales_history"
                            initial={{ opacity: 0, x: -12 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 12 }}
                            transition={{ duration: 0.3 }}
                        >
                            {/* Range Filters */}
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: '20px',
                                marginBottom: '20px',
                                flexWrap: 'wrap'
                            }}>
                                <div className="analytics-range-bar" style={{ margin: 0 }}>
                                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                        <div className="analytics-range-toggle">
                                            {['day', 'week', 'month', 'year'].map((r) => (
                                                <button
                                                    key={r}
                                                    className={`range-btn ${viewRange === r ? 'range-btn--active' : ''}`}
                                                    onClick={() => setViewRange(r)}
                                                >
                                                    {r === 'day' ? 'Today' : r.charAt(0).toUpperCase() + r.slice(1)}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="analytics-range-date">
                                            <IoCalendarOutline size={18} color="var(--text-secondary)" />
                                            <GlobalDatePicker
                                                value={selectedDate}
                                                onChange={(val) => setSelectedDate(val)}
                                                placeholder="Select Date"
                                                className="report-select-override"
                                            />
                                        </div>
                                        <div style={{ minWidth: '160px' }}>
                                            <GlobalSelect
                                                options={[{ label: 'All Groups', value: 'all' }, ...groups.map(g => ({ label: g.name, value: g.id }))]}
                                                value={selectedGroupId}
                                                onChange={setSelectedGroupId}
                                                placeholder="Filter by Group"
                                                className="report-select-override"
                                                direction="bottom"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* KPI Metrics Row */}
                            <div className="kpi-cards-grid">
                                <motion.div className="kpi-card" whileHover={{ y: -2 }}>
                                    <div className="kpi-card-icon-wrap" style={{ background: 'rgba(255, 122, 0, 0.1)', color: '#FF7A00' }}>
                                        <FiDollarSign />
                                    </div>
                                    <div className="kpi-card-info">
                                        <span className="kpi-card-title">Revenue</span>
                                        <span className="kpi-card-value">{formatCurrency(chartSummary.total_sales || 0)}</span>
                                        <span className="kpi-card-trend"><IoTrendingUpOutline style={{ marginRight: 2 }} /> Gross sales</span>
                                    </div>
                                </motion.div>

                                <motion.div className="kpi-card" whileHover={{ y: -2 }}>
                                    <div className="kpi-card-icon-wrap" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6' }}>
                                        <IoReceiptOutline />
                                    </div>
                                    <div className="kpi-card-info">
                                        <span className="kpi-card-title">Orders</span>
                                        <span className="kpi-card-value">{chartSummary.total_bills || 0}</span>
                                        <span className="kpi-card-trend">Bills processed</span>
                                    </div>
                                </motion.div>

                                <motion.div className="kpi-card" whileHover={{ y: -2 }}>
                                    <div className="kpi-card-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10B981' }}>
                                        <IoCartOutline />
                                    </div>
                                    <div className="kpi-card-info">
                                        <span className="kpi-card-title">Items Sold</span>
                                        <span className="kpi-card-value">
                                            {viewRange === 'day' 
                                                ? (productSales.reduce((acc, curr) => acc + (curr.quantity || 0), 0))
                                                : (rangeProductSales.reduce((acc, curr) => acc + (curr.quantity || 0), 0) || '—')
                                            }
                                        </span>
                                        <span className="kpi-card-trend">Units sold</span>
                                    </div>
                                </motion.div>

                                <motion.div className="kpi-card" whileHover={{ y: -2 }}>
                                    <div className="kpi-card-icon-wrap" style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8B5CF6' }}>
                                        <IoStatsChartOutline />
                                    </div>
                                    <div className="kpi-card-info">
                                        <span className="kpi-card-title">Avg Bill</span>
                                        <span className="kpi-card-value">
                                            {chartSummary.total_bills > 0 
                                                ? formatCurrency(Math.round((chartSummary.total_sales || 0) / chartSummary.total_bills)) 
                                                : formatCurrency(0)
                                            }
                                        </span>
                                        <span className="kpi-card-trend">Per transaction</span>
                                    </div>
                                </motion.div>
                            </div>

                            {/* Charts Grid */}
                            {rangeLoading ? (
                                <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '20px', marginBottom: '28px' }}>
                                    <Skeleton height="360px" borderRadius="16px" />
                                    <Skeleton height="360px" borderRadius="16px" />
                                </div>
                            ) : chartProductSales.length > 0 ? (
                                <div className="analytics-charts-grid-wrap">
                                    <div className="analytics-charts-grid">
                                        {/* Bar Chart */}
                                        <motion.div
                                            className="analytics-chart-card"
                                            initial={{ opacity: 0, y: 16 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.5, delay: 0.1 }}
                                        >
                                            <div style={{ marginBottom: 16 }}>
                                                <h3 className="chart-card-title" style={{ margin: 0 }}>Product Sales</h3>
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Top selling products this {viewRange}</span>
                                            </div>
                                            <ResponsiveContainer width="100%" height={290}>
                                                <BarChart
                                                    data={chartProductSales.slice(0, 10)}
                                                    margin={{ top: 8, right: 16, left: 0, bottom: 20 }}
                                                    barCategoryGap="25%"
                                                >
                                                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} vertical={false} />
                                                    <XAxis
                                                        dataKey="name"
                                                        tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                                                        tickFormatter={(tick) => tick.length > 12 ? `${tick.substring(0, 10)}...` : tick}
                                                        axisLine={false}
                                                        tickLine={false}
                                                    />
                                                    <YAxis
                                                        tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                                                        tickFormatter={(v) => `₹${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`}
                                                        axisLine={false}
                                                        tickLine={false}
                                                    />
                                                    <RechartsTooltip content={<BarTooltip />} cursor={{ fill: 'rgba(255, 122, 0, 0.04)' }} />
                                                    <Bar 
                                                        dataKey="total_amount" 
                                                        radius={[4, 4, 0, 0]} 
                                                        animationDuration={800}
                                                        fill="#3B82F6" 
                                                    >
                                                        {chartProductSales.slice(0, 10).map((entry, index) => (
                                                            <Cell 
                                                                key={`cell-${index}`} 
                                                                fill="#3B82F6"
                                                                style={{ transition: 'fill 0.2s ease' }}
                                                                onMouseEnter={(e) => { e.target.setAttribute('fill', '#FF7A00'); }}
                                                                onMouseLeave={(e) => { e.target.setAttribute('fill', '#3B82F6'); }}
                                                            />
                                                        ))}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </motion.div>

                                        {/* Doughnut Chart */}
                                        <motion.div
                                            className="analytics-chart-card"
                                            initial={{ opacity: 0, y: 16 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.5, delay: 0.2 }}
                                        >
                                            <div style={{ marginBottom: 16 }}>
                                                <h3 className="chart-card-title" style={{ margin: 0 }}>Category Share</h3>
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Revenue contribution by category</span>
                                            </div>
                                            <div style={{ width: '100%', height: '290px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {Object.keys(chartSummary.category_totals || {}).length > 0 ? (
                                                    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                                                        <ResponsiveContainer width="100%" height="100%">
                                                            <PieChart>
                                                                <Pie
                                                                    activeIndex={activePieIndex}
                                                                    activeShape={renderActiveShape}
                                                                    onMouseEnter={(_, index) => setActivePieIndex(index)}
                                                                    onMouseLeave={() => setActivePieIndex(-1)}
                                                                    data={Object.entries(chartSummary.category_totals || {}).map(([name, val]) => ({ name, total_amount: val }))}
                                                                    dataKey="total_amount"
                                                                    nameKey="name"
                                                                    cx="50%" cy="50%" innerRadius={70} outerRadius={95} paddingAngle={4}
                                                                    isAnimationActive={false}
                                                                >
                                                                    {Object.entries(chartSummary.category_totals || {}).map((_, i) => (
                                                                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                                                    ))}
                                                                </Pie>
                                                                <RechartsTooltip formatter={(v) => formatCurrency(v)} />
                                                            </PieChart>
                                                        </ResponsiveContainer>
                                                    </div>
                                                ) : (
                                                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No Category details found</div>
                                                )}
                                            </div>
                                        </motion.div>
                                    </div>

                                    {/* Top Selling Products List Section */}
                                    <motion.div 
                                        className="analytics-chart-card"
                                        style={{ width: '100%', overflow: 'hidden' }}
                                        initial={{ opacity: 0, y: 16 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.5, delay: 0.3 }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                            <div>
                                                <h3 className="chart-card-title" style={{ margin: 0 }}>Top Selling Products</h3>
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Performance leaderboard for selected duration</span>
                                            </div>
                                        </div>
                                        <div style={{ overflowX: 'auto' }}>
                                            <table className="transactions-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                <thead>
                                                    <tr>
                                                        <th style={{ background: 'transparent', padding: '12px 16px' }}>Rank</th>
                                                        <th style={{ background: 'transparent', padding: '12px 16px' }}>Product Name</th>
                                                        <th style={{ background: 'transparent', padding: '12px 16px', textAlign: 'center' }}>Qty Sold</th>
                                                        <th style={{ background: 'transparent', padding: '12px 16px', textAlign: 'right' }}>Total Revenue</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(viewRange === 'day' ? productSales : viewRangeProductSales).slice(0, 5).map((item, idx) => (
                                                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                            <td style={{ padding: '12px 16px', fontWeight: 700, color: idx === 0 ? '#FF7A00' : 'var(--text-secondary)' }}>#{idx + 1}</td>
                                                            <td style={{ padding: '12px 16px', fontWeight: 600 }}>{item.name}</td>
                                                            <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600 }}>{item.quantity}</td>
                                                            <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--primary-500)' }}>{formatCurrency(item.total_amount)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </motion.div>
                                </div>
                            ) : (
                                <div className="analytics-empty" style={{ padding: '60px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: '16px' }}>
                                    <div className="analytics-empty-icon" style={{ fontSize: '3rem', marginBottom: '16px' }}>📊</div>
                                    <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '8px' }}>No sales found</h3>
                                    <p style={{ color: 'var(--text-secondary)', maxWidth: '340px', margin: '0 auto 20px' }}>
                                        Change the date filter or create your first bill.
                                    </p>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* ──────────── TRANSACTIONS TAB ──────────── */}
                    {activeTab === 'transactions' && (
                        <motion.div
                            key="transactions"
                            initial={{ opacity: 0, x: -12 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 12 }}
                            transition={{ duration: 0.3 }}
                        >
                            {/* Floating Toolbar */}
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: '20px',
                                marginBottom: '24px',
                                padding: '14px 20px',
                                background: 'rgba(32,33,36,0.8)',
                                backdropFilter: 'blur(20px)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: '18px',
                                flexWrap: 'wrap'
                            }}>
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    <button
                                        onClick={() => setSelectedBillDate(new Date().toISOString().split('T')[0])}
                                        style={{
                                            padding: '10px 16px',
                                            background: selectedBillDate === new Date().toISOString().split('T')[0] ? '#FF7A00' : 'rgba(255,255,255,0.05)',
                                            border: selectedBillDate === new Date().toISOString().split('T')[0] ? 'none' : '1px solid rgba(255,255,255,0.08)',
                                            borderRadius: '12px',
                                            color: selectedBillDate === new Date().toISOString().split('T')[0] ? '#FFFFFF' : 'rgba(255,255,255,0.7)',
                                            fontSize: '14px',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            transition: 'all 180ms ease-out',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}
                                    >
                                        <IoTodayOutline size={16} />
                                        Today
                                    </button>
                                    <input
                                        type="date"
                                        value={selectedBillDate}
                                        onChange={(e) => setSelectedBillDate(e.target.value)}
                                        style={{
                                            padding: '10px 16px',
                                            background: 'rgba(255,255,255,0.05)',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            borderRadius: '12px',
                                            color: 'rgba(255,255,255,0.7)',
                                            fontSize: '14px',
                                            cursor: 'pointer',
                                            outline: 'none'
                                        }}
                                    />
                                    <button
                                        onClick={() => loadBills(selectedBillDate)}
                                        disabled={loadingBills}
                                        style={{
                                            padding: '10px 16px',
                                            background: 'rgba(255,255,255,0.05)',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            borderRadius: '12px',
                                            color: 'rgba(255,255,255,0.7)',
                                            fontSize: '14px',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            transition: 'all 180ms ease-out',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}
                                    >
                                        <IoRefreshOutline
                                            size={16}
                                            style={{ animation: loadingBills ? 'spin 1s linear infinite' : 'none' }}
                                        />
                                        Refresh
                                    </button>
                                </div>
                            </div>

                            {/* Transaction Cards Grid */}
                            {bills.length > 0 ? (
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                                    gap: '20px',
                                    padding: '24px'
                                }}>
                                    {sortedBills.map((bill, index) => {
                                        const accentColor = getAccentColor(bill.bill_no);
                                        const isCancelled = bill.status === 'CANCELLED';
                                        const statusText = (!bill.status || bill.status === 'ACTIVE') ? 'CONFIRMED' : bill.status;
                                        
                                        return (
                                            <motion.div
                                                key={bill.bill_no}
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ duration: 0.4, delay: index * 0.05 }}
                                                whileHover={{ y: -4, transition: { duration: 0.18, ease: 'easeOut' } }}
                                                style={{
                                                    padding: '20px',
                                                    background: `linear-gradient(180deg, ${accentColor}08 0%, transparent 100%)`,
                                                    border: '1px solid rgba(255,255,255,0.08)',
                                                    borderRadius: '20px',
                                                    boxShadow: '0 15px 40px rgba(0,0,0,0.35)',
                                                    cursor: isCancelled ? 'default' : 'pointer',
                                                    transition: 'all 180ms ease-out',
                                                    position: 'relative',
                                                    overflow: 'hidden'
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (!isCancelled) {
                                                        e.currentTarget.style.borderColor = accentColor;
                                                        e.currentTarget.style.boxShadow = `0 20px 50px ${accentColor}20`;
                                                    }
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                                                    e.currentTarget.style.boxShadow = '0 15px 40px rgba(0,0,0,0.35)';
                                                }}
                                                onClick={() => !isCancelled && handleEditBill(bill)}
                                            >
                                                {/* Top Section */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                        <div style={{
                                                            width: 44, height: 44, borderRadius: '14px',
                                                            background: `${accentColor}15`,
                                                            border: `1px solid ${accentColor}30`,
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            color: accentColor
                                                        }}>
                                                            <IoReceiptOutline size={22} />
                                                        </div>
                                                        <div>
                                                            <div style={{ fontSize: '18px', fontWeight: 700, color: accentColor, marginBottom: '2px' }}>
                                                                #{bill.bill_no}
                                                            </div>
                                                            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>
                                                                {formatDate(bill.created_at)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>
                                                        {formatTime(bill.created_at)}
                                                    </div>
                                                </div>

                                                {/* Horizontal Divider */}
                                                <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '12px 0' }} />

                                                {/* Middle Section */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                                    <div>
                                                        <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>
                                                            Items
                                                        </div>
                                                        <div style={{ fontSize: '18px', fontWeight: 600, color: '#FFFFFF' }}>
                                                            {bill.items?.length || 0}
                                                        </div>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>
                                                            Amount
                                                        </div>
                                                        <div style={{ fontSize: '22px', fontWeight: 700, color: accentColor }}>
                                                            {formatCurrency(bill.total_amount)}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Status Pill */}
                                                <div style={{ marginBottom: '16px' }}>
                                                    <span style={{
                                                        padding: '6px 14px',
                                                        borderRadius: '20px',
                                                        fontSize: '12px',
                                                        fontWeight: 600,
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.5px',
                                                        background: isCancelled 
                                                            ? 'rgba(239,68,68,0.15)' 
                                                            : 'rgba(34,197,94,0.15)',
                                                        color: isCancelled 
                                                            ? '#EF4444' 
                                                            : '#22C55E',
                                                        border: isCancelled 
                                                            ? '1px solid rgba(239,68,68,0.3)' 
                                                            : '1px solid rgba(34,197,94,0.3)'
                                                    }}>
                                                        {statusText}
                                                    </span>
                                                </div>

                                                {/* Action Buttons */}
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleEditBill(bill); }}
                                                        disabled={isCancelled}
                                                        style={{
                                                            flex: 1,
                                                            padding: '10px 14px',
                                                            background: 'rgba(255,255,255,0.05)',
                                                            border: '1px solid rgba(255,255,255,0.08)',
                                                            borderRadius: '12px',
                                                            color: 'rgba(255,255,255,0.7)',
                                                            fontSize: '13px',
                                                            fontWeight: 600,
                                                            cursor: isCancelled ? 'not-allowed' : 'pointer',
                                                            transition: 'all 180ms ease-out',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            gap: '6px',
                                                            opacity: isCancelled ? 0.5 : 1
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            if (!isCancelled) {
                                                                e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                                                            }
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                                                        }}
                                                    >
                                                        <IoCreateOutline size={14} />
                                                        Edit
                                                    </button>
                                                    {isAdmin && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedBill(bill);
                                                                setShowCancelConfirm(true);
                                                            }}
                                                            disabled={isCancelled}
                                                            style={{
                                                                flex: 1,
                                                                padding: '10px 14px',
                                                                background: 'rgba(239,68,68,0.05)',
                                                                border: '1px solid rgba(239,68,68,0.15)',
                                                                borderRadius: '12px',
                                                                color: 'rgba(239,68,68,0.8)',
                                                                fontSize: '13px',
                                                            fontWeight: 600,
                                                            cursor: isCancelled ? 'not-allowed' : 'pointer',
                                                            transition: 'all 180ms ease-out',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            gap: '6px',
                                                            opacity: isCancelled ? 0.5 : 1
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            if (!isCancelled) {
                                                                e.currentTarget.style.background = 'rgba(239,68,68,0.1)';
                                                            }
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.background = 'rgba(239,68,68,0.05)';
                                                        }}
                                                    >
                                                        <IoCloseCircleOutline size={14} />
                                                        Cancel
                                                    </button>
                                                    )}
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="analytics-empty">
                                    <div className="analytics-empty-icon">🧾</div>
                                    <h3>{loadingBills ? 'Loading transactions...' : 'No bills found'}</h3>
                                    <p>
                                        {loadingBills
                                            ? 'Please wait while we fetch the latest data.'
                                            : `No transactions for ${selectedBillDate === new Date().toISOString().split('T')[0] ? 'today' : selectedBillDate}. Your transaction history will appear here once orders are processed.`}
                                    </p>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* ──────────── EXPENSES HISTORY TAB ──────────── */}
                    {activeTab === 'expenses_history' && (
                        <motion.div
                            key="expenses_history"
                            initial={{ opacity: 0, x: -12 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 12 }}
                            transition={{ duration: 0.3 }}
                            className="expenses-history-view"
                        >
                            {/* Range Toggle for Expenses */}
                            <div className="analytics-range-bar" style={{ marginBottom: '20px' }}>
                                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                    <div className="analytics-range-toggle">
                                        {['day', 'week', 'month', 'year'].map((r) => (
                                            <button
                                                key={r}
                                                className={`range-btn ${expenseRange === r ? 'range-btn--active' : ''}`}
                                                onClick={() => setExpenseRange(r)}
                                            >
                                                {r === 'day' ? 'Today' : r.charAt(0).toUpperCase() + r.slice(1)}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="analytics-range-date">
                                        <IoCalendarOutline size={18} color="var(--text-secondary)" />
                                        <GlobalDatePicker
                                            value={selectedDate}
                                            onChange={(val) => setSelectedDate(val)}
                                            placeholder="Select Date"
                                            className="report-select-override"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Expense Chart View ONLY */}
                            <div className="analytics-charts-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 300px' }}>
                                {/* Left: Expanded Breakdown Chart */}
                                <div className="analytics-chart-card" style={{ padding: '32px', minHeight: '520px', display: 'flex', flexDirection: 'column' }}>
                                    <h3 className="chart-card-title" style={{ fontSize: '1.4rem' }}>Expense Distribution & Trends</h3>
                                    <div style={{ flex: 1, width: '100%', height: '400px' }}>
                                        {filteredRangeExpenses.length > 0 ? (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        activeIndex={activePieIndex}
                                                        activeShape={renderActiveShape}
                                                        onMouseEnter={(_, index) => setActivePieIndex(index)}
                                                        onMouseLeave={() => setActivePieIndex(-1)}
                                                        data={Object.entries(
                                                            filteredRangeExpenses.reduce((acc, curr) => {
                                                                acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
                                                                return acc;
                                                            }, {})
                                                        ).map(([name, value]) => ({ name, value }))}
                                                        dataKey="value"
                                                        nameKey="name"
                                                        cx="50%" cy="50%" innerRadius={100} outerRadius={160} paddingAngle={2}
                                                        stroke="none"
                                                        isAnimationActive={false}
                                                    >
                                                        {Object.entries(
                                                            filteredRangeExpenses.reduce((acc, curr) => {
                                                                acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
                                                                return acc;
                                                            }, {})
                                                        ).map((_, i) => (
                                                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                                        ))}
                                                    </Pie>
                                                    <RechartsTooltip formatter={(v) => formatCurrency(v)} />
                                                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '16px' }} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        ) : (
                                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
                                                <div style={{ textAlign: 'center' }}>
                                                    <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📉</div>
                                                    <div>No expense data for this range</div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', justifyContent: 'center', marginTop: '20px' }}>
                                        {Object.entries(
                                            filteredRangeExpenses.reduce((acc, curr) => {
                                                acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
                                                return acc;
                                            }, {})
                                        ).slice(0, 4).map(([name, value], i) => (
                                            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ width: 16, height: 16, borderRadius: '50%', background: CHART_COLORS[i % CHART_COLORS.length] }} />
                                                <span style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>{name}: <b>{formatCurrency(value)}</b></span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Right: Summary Metrics */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    <Card style={{ padding: '24px', background: isDark ? 'rgba(79, 70, 229, 0.08)' : 'rgba(79, 70, 229, 0.04)', border: '1px solid rgba(79, 70, 229, 0.1)' }}>
                                        <div style={{ fontSize: '1.2rem', color: 'var(--text-tertiary)', marginBottom: '8px' }}>Total Outflow</div>
                                        <div style={{ fontSize: '2.8rem', fontWeight: 800, color: 'var(--error-500)' }}>
                                            {formatCurrency(filteredRangeExpenses.reduce((acc, curr) => acc + curr.amount, 0))}
                                        </div>
                                        <div style={{ fontSize: '1.1rem', color: 'var(--text-muted)', marginTop: '4px' }}>Across {filteredRangeExpenses.length} categories</div>
                                    </Card>

                                    <Card style={{ padding: '24px' }}>
                                        <div style={{ fontSize: '1.2rem', color: 'var(--text-tertiary)', marginBottom: '12px' }}>Highest Spending</div>
                                        {filteredRangeExpenses.length > 0 ? (
                                            (() => {
                                                const highest = Object.entries(
                                                    filteredRangeExpenses.reduce((acc, curr) => {
                                                        acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
                                                        return acc;
                                                    }, {})
                                                ).sort((a, b) => b[1] - a[1])[0];
                                                return (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                                        <div style={{ width: 42, height: 42, borderRadius: '12px', background: 'rgba(239, 68, 68, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EF4444', fontSize: '1.2rem' }}>
                                                            {getExpenseIcon(highest[0])}
                                                        </div>
                                                        <div>
                                                            <div style={{ fontWeight: 700, fontSize: '1.6rem' }}>{highest[0]}</div>
                                                            <div style={{ fontSize: '1.3rem', opacity: 0.8, marginTop: '4px' }}>{formatCurrency(highest[1])}</div>
                                                        </div>
                                                    </div>
                                                );
                                            })()
                                        ) : 'N/A'}
                                    </Card>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* ──────────── REPORTS HUB TAB ──────────── */}
                    {activeTab === 'reports_hub' && (
                        <motion.div
                            key="reports_hub"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.25, ease: 'easeOut' }}
                            style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
                        >
                            {/* Premium Header */}
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                borderBottom: '1px solid var(--border-secondary)',
                                paddingBottom: '16px',
                                marginBottom: '4px'
                            }}>
                                <div>
                                    <h2 style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, tracking: '-0.02em' }}>
                                        Reports Download Center
                                    </h2>
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                                        Generate and export sales, expense, and financial reports.
                                    </p>
                                </div>
                                <button
                                    onClick={() => setShowClearConfirm(true)}
                                    style={{
                                        background: 'transparent',
                                        border: '1px solid rgba(239, 68, 68, 0.4)',
                                        color: '#EF4444',
                                        borderRadius: '8px',
                                        padding: '8px 16px',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        transition: 'all 200ms ease',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = '#EF4444';
                                        e.currentTarget.style.color = '#ffffff';
                                        e.currentTarget.style.borderColor = '#EF4444';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'transparent';
                                        e.currentTarget.style.color = '#EF4444';
                                        e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                                    }}
                                >
                                    <IoTrashOutline size={14} /> Clear All Data
                                </button>
                            </div>

                            {/* Full-width Responsive Grid Layout */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
                                gap: '16px',
                                width: '100%'
                            }}>
                                {[
                                    {
                                        id: 'excel',
                                        title: 'Daily Sales Report',
                                        badge: 'Sales',
                                        desc: 'Detailed breakdown of items sold, summaries, and profits for a specific date.',
                                        color: '#3B82F6',
                                        icon: <IoTodayOutline size={16} />,
                                        control: <GlobalDatePicker value={dailyReportDate} onChange={setDailyReportDate} />,
                                        actionText: downloading.excel ? 'Generating...' : 'Download Excel',
                                        action: () => handleDownload('excel', '', `Daily_Sales_${dailyReportDate}.xlsx`, dailyReportDate),
                                        disabled: downloading.excel
                                    },
                                    {
                                        id: 'weekly',
                                        title: 'Weekly Sales Summary',
                                        badge: 'Sales',
                                        desc: 'Aggregated product overview and revenues from Monday to Sunday.',
                                        color: '#F59E0B',
                                        icon: <IoCalendarOutline size={16} />,
                                        control: <GlobalDatePicker value={exportWeekDate} onChange={setExportWeekDate} />,
                                        actionText: downloading.weekly ? 'Generating...' : 'Download Excel',
                                        action: handleWeeklyExport,
                                        disabled: downloading.weekly
                                    },
                                    {
                                        id: 'monthly',
                                        title: 'Monthly Sales Summary',
                                        badge: 'Sales',
                                        desc: 'Monthly product-wise totals and overall gross sales report.',
                                        color: '#10B981',
                                        icon: <IoBarChartOutline size={16} />,
                                        control: <input type="month" className="transactions-date-input" value={exportMonth} onChange={(e) => setExportMonth(e.target.value)} style={{ width: '130px', padding: '6px 10px', height: '34px', background: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', borderRadius: '6px', color: 'var(--text-primary)', outline: 'none' }} />,
                                        actionText: downloading.monthly ? 'Generating...' : 'Download Excel',
                                        action: handleMonthlyExport,
                                        disabled: downloading.monthly
                                    },
                                    {
                                        id: 'expense_weekly',
                                        title: 'Weekly Expense Report',
                                        badge: 'Expenses',
                                        desc: 'Categorized business outflows and details recorded for the current week.',
                                        color: '#FF8C42',
                                        icon: <IoWalletOutline size={16} />,
                                        actionText: 'Download',
                                        action: () => handleDownload('expense_excel', '', 'Weekly_Expenses.xlsx', 'week')
                                    },
                                    {
                                        id: 'expense_monthly',
                                        title: 'Monthly Expense Report',
                                        badge: 'Expenses',
                                        desc: 'Detailed monthly accounting report for utility, supplier and operational costs.',
                                        color: '#06B6D4',
                                        icon: <IoStatsChartOutline size={16} />,
                                        actionText: 'Download',
                                        action: () => handleDownload('expense_excel', '', 'Monthly_Expenses.xlsx', 'month')
                                    },
                                    {
                                        id: 'expense_yearly',
                                        title: 'Yearly Expense Audit',
                                        badge: 'Audit',
                                        desc: 'Year-to-date business expenses breakdown and category summaries.',
                                        color: '#8B5CF6',
                                        icon: <IoBusinessOutline size={16} />,
                                        actionText: 'Download',
                                        action: () => handleDownload('expense_excel', '', 'Yearly_Expenses.xlsx', 'year')
                                    }
                                ].map((report) => (
                                    <div
                                        key={report.id}
                                        style={{
                                            background: 'var(--surface-primary)',
                                            border: '1px solid var(--border-secondary)',
                                            borderRadius: '12px',
                                            padding: '12px 16px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '16px',
                                            transition: 'all 200ms ease'
                                        }}
                                        className="report-item-hover-border"
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                                            <div style={{
                                                width: '34px',
                                                height: '34px',
                                                borderRadius: '8px',
                                                background: `${report.color}15`,
                                                color: report.color,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0
                                            }}>
                                                {report.icon}
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontWeight: 650, fontSize: '0.92rem', color: 'var(--text-primary)' }}>{report.title}</span>
                                                    <span style={{
                                                        fontSize: '0.68rem',
                                                        fontWeight: 700,
                                                        padding: '2px 6px',
                                                        borderRadius: '4px',
                                                        background: 'rgba(255,255,255,0.05)',
                                                        border: '1px solid var(--border-secondary)',
                                                        color: 'var(--text-secondary)',
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.02em'
                                                    }}>{report.badge}</span>
                                                </div>
                                                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.3, maxWidth: '340px' }}>{report.desc}</p>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                                            {report.control && <div style={{ transform: 'scale(0.9)', transformOrigin: 'right' }}>{report.control}</div>}
                                            <button
                                                onClick={report.action}
                                                disabled={report.disabled}
                                                style={{
                                                    height: '32px',
                                                    padding: '0 14px',
                                                    borderRadius: '6px',
                                                    background: 'transparent',
                                                    border: '1px solid var(--primary-500)',
                                                    color: 'var(--primary-500)',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 650,
                                                    cursor: 'pointer',
                                                    transition: 'all 200ms ease',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.background = 'var(--primary-500)';
                                                    e.currentTarget.style.color = '#ffffff';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = 'transparent';
                                                    e.currentTarget.style.color = 'var(--primary-500)';
                                                }}
                                            >
                                                <IoDownloadOutline size={13} />
                                                {report.actionText}
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {/* MASTER FINANCIAL SHEET FEATURED CARD */}
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <div style={{
                                        background: 'rgba(255, 140, 66, 0.04)',
                                        border: '1.5px solid var(--primary-500)',
                                        borderRadius: '12px',
                                        padding: '16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '16px',
                                        boxShadow: '0 4px 20px -8px rgba(255, 140, 66, 0.2)'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1 }}>
                                            <div style={{
                                                width: '40px',
                                                height: '40px',
                                                borderRadius: '8px',
                                                background: 'var(--primary-500)',
                                                color: '#ffffff',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0,
                                                boxShadow: '0 4px 12px rgba(255, 140, 66, 0.3)'
                                            }}>
                                                <IoBarChartOutline size={20} />
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontWeight: 750, fontSize: '1.05rem', color: '#ffffff' }}>Master Financial Sheet</span>
                                                    <span style={{
                                                        fontSize: '0.65rem',
                                                        fontWeight: 800,
                                                        padding: '2px 8px',
                                                        borderRadius: '4px',
                                                        background: 'var(--primary-500)',
                                                        color: '#ffffff',
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.04em'
                                                    }}>Most Used</span>
                                                </div>
                                                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.35 }}>Combined Sales & Expense Audit (Yearly summary format).</p>
                                            </div>
                                        </div>
                                        <button
                                            style={{
                                                height: '38px',
                                                padding: '0 18px',
                                                borderRadius: '8px',
                                                background: 'var(--primary-500)',
                                                border: 'none',
                                                color: '#ffffff',
                                                fontSize: '0.85rem',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                boxShadow: '0 4px 12px rgba(255, 140, 66, 0.25)',
                                                transition: 'all 200ms ease',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.transform = 'translateY(-1px)';
                                                e.currentTarget.style.boxShadow = '0 6px 16px rgba(255, 140, 66, 0.35)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.transform = 'none';
                                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 140, 66, 0.25)';
                                            }}
                                        >
                                            <IoDownloadOutline size={15} />
                                            Generate Report
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ════════════════ CLEAR DATA MODAL ════════════════ */}
            <AnimatePresence>
                {isAdmin && showClearConfirm && (
                    <motion.div
                        className="pmOverlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => { setShowClearConfirm(false); setClearPassword(''); }}
                    >
                        <motion.div
                            className="pmDialog"
                            initial={{ y: 20, scale: 0.95, opacity: 0 }}
                            animate={{ y: 0, scale: 1, opacity: 1 }}
                            exit={{ y: 20, scale: 0.95, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="pmDialogTitle">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                Clear All Data?
                            </div>
                            <div className="pmDialogBody">
                                This will permanently delete all bills and sales data. This action cannot be undone.
                                <div style={{ marginTop: '16px', position: 'relative' }}>
                                    <input
                                        type={showClearPassword ? 'text' : 'password'}
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        maxLength={6}
                                        className="pmInput"
                                        placeholder="Enter Owner PIN to confirm"
                                        value={clearPassword}
                                        onChange={(e) => setClearPassword(e.target.value.replace(/\D/g, ''))}
                                        onKeyPress={(e) => e.key === 'Enter' && handleClearBills()}
                                        autoFocus
                                        style={{ width: '100%', textAlign: 'center', paddingRight: '40px' }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowClearPassword(!showClearPassword)}
                                        style={{
                                            position: 'absolute', right: '8px', top: '50%',
                                            transform: 'translateY(-50%)', background: 'none',
                                            border: 'none', cursor: 'pointer', padding: '4px',
                                            display: 'flex', alignItems: 'center', opacity: 0.6,
                                        }}
                                    >
                                        {showClearPassword ? (
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 3l18 18M10.584 10.587a2 2 0 002.828 2.826M9.363 5.365A9.466 9.466 0 0112 5c7 0 10 7 10 7a13.16 13.16 0 01-1.658 2.366M6.632 6.632A9.466 9.466 0 005 12s3 7 7 7a9.466 9.466 0 005.368-1.632" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                        ) : (
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" /></svg>
                                        )}
                                    </button>
                                </div>
                            </div>
                            <div className="pmDialogActions">
                                <button
                                    className="pmDialogBtn"
                                    onClick={() => { setShowClearConfirm(false); setClearPassword(''); }}
                                >
                                    Cancel
                                </button>
                                <button className="pmDialogBtn pmDialogBtnPrimary" onClick={handleClearBills}>
                                    {clearingData ? 'Clearing...' : 'Clear All Data'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ════════════════ CANCEL BILL MODAL ════════════════ */}
            <AnimatePresence>
                {isAdmin && showCancelConfirm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(5px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001,
                        }}
                        onClick={() => setShowCancelConfirm(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                            style={{
                                background: 'var(--surface-primary)',
                                borderRadius: '16px',
                                padding: '32px',
                                maxWidth: '400px',
                                width: '90%',
                                border: '1px solid var(--border-primary)',
                                boxShadow: isDark
                                    ? '0 25px 50px -12px rgba(0,0,0,0.5)'
                                    : '0 25px 50px -12px rgba(0,0,0,0.25)',
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                                <div style={{
                                    width: '48px', height: '48px', borderRadius: '12px',
                                    background: 'rgba(239,68,68,0.1)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <IoTrashOutline size={22} color="#ef4444" />
                                </div>
                                <div>
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0, marginBottom: '4px' }}>
                                        Cancel Bill
                                    </h3>
                                    <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0 }}>
                                        Caution: This affects sales reports
                                    </p>
                                </div>
                            </div>

                            <div style={{ marginBottom: '24px' }}>
                                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                    Are you sure you want to cancel <strong>Bill #{selectedBill?.bill_no}</strong>?
                                </p>
                                <ul style={{ margin: '12px 0 0 12px', paddingLeft: '16px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                    <li>Bill amount will be deducted from sales totals.</li>
                                    <li>Bill status will change to "CANCELLED".</li>
                                </ul>
                            </div>

                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                <Button
                                    onClick={() => setShowCancelConfirm(false)}
                                    variant="secondary"
                                    style={{
                                        background: 'var(--bg-primary)',
                                        border: '1px solid var(--border-primary)',
                                        color: 'var(--text-secondary)',
                                        borderRadius: '12px',
                                        padding: '12px 24px',
                                        fontWeight: 500,
                                    }}
                                >
                                    Keep Bill
                                </Button>
                                <Button
                                    onClick={handleCancelBillConfirm}
                                    variant="secondary"
                                    style={{
                                        background: 'var(--error-500, #EF4444)',
                                        border: '1px solid var(--error-500, #EF4444)',
                                        color: '#ffffff',
                                        borderRadius: '12px',
                                        padding: '12px 24px',
                                        fontWeight: 500,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                    }}
                                >
                                    <IoTrashOutline size={16} />
                                    Confirm Cancel
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </PageContainer>
    );
};

export default Analytics;
