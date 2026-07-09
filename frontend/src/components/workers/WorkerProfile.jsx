import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import { useSettings } from '../../context/SettingsContext';
import { workerAPI } from '../../api/workers';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Input from '../ui/Input';
import { formatCurrency } from '../../utils/api';
import { motion, AnimatePresence } from 'framer-motion';
import { IoArrowBack, IoTrash, IoCall, IoCash, IoBriefcase, IoCalendar, IoCheckmarkCircle, IoWarning, IoTime, IoCreateOutline } from 'react-icons/io5';
import AddWorkerModal from './AddWorkerModal';
import '../../styles/Workers.css';

const WorkerProfile = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { currentTheme, isDark } = useTheme();
    const { showSuccess, showError, showConfirm } = useAlert();
    const { settings } = useSettings();

    const formatDate = (dateInput) => {
        if (!dateInput) return '';
        const date = new Date(dateInput);
        if (isNaN(date.getTime())) return '';
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    };

    const [worker, setWorker] = useState(null);
    const [advances, setAdvances] = useState([]);
    const [salaryHistory, setSalaryHistory] = useState([]);
    const [showEditModal, setShowEditModal] = useState(false);
    const [attendance, setAttendance] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [totalPaid, setTotalPaid] = useState(0);
    const [activeTab, setActiveTab] = useState('attendance');
    const [loading, setLoading] = useState(true);

    // Advance Form
    const [advanceAmount, setAdvanceAmount] = useState('');
    const [advanceReason, setAdvanceReason] = useState('');
    const [submittingAdvance, setSubmittingAdvance] = useState(false);

    // Group advances by their month cycles based on settings.salary_day
    const groupedAdvances = useMemo(() => {
        const groups = {};
        const salaryDay = settings?.salary_day ? parseInt(settings.salary_day) : 1;

        advances.forEach(adv => {
            const d = new Date(adv.date);
            let cycleMonth, cycleYear;
            
            if (d.getDate() >= salaryDay) {
                cycleMonth = d.getMonth() + 1;
                cycleYear = d.getFullYear();
            } else {
                cycleMonth = d.getMonth();
                cycleYear = d.getFullYear();
                if (cycleMonth === 0) {
                    cycleMonth = 12;
                    cycleYear -= 1;
                }
            }

            const key = `${cycleYear}-${cycleMonth}`;
            if (!groups[key]) {
                const nextM = cycleMonth + 1 <= 12 ? cycleMonth + 1 : 1;
                const nextY = cycleMonth + 1 <= 12 ? cycleYear : cycleYear + 1;
                
                const start = new Date(cycleYear, cycleMonth - 1, salaryDay);
                const end = new Date(nextY, nextM - 1, salaryDay - 1);
                
                const rangeStr = `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
                const name = new Date(cycleYear, cycleMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' });

                groups[key] = {
                    key,
                    name,
                    range: rangeStr,
                    year: cycleYear,
                    month: cycleMonth,
                    items: [],
                    total: 0
                };
            }
            groups[key].items.push(adv);
            groups[key].total += adv.amount;
        });

        return Object.values(groups).sort((a, b) => {
            if (a.year !== b.year) return b.year - a.year;
            return b.month - a.month;
        });
    }, [advances, settings?.salary_day]);

    const loadData = React.useCallback(async () => {
        setLoading(true);
        try {
            const [w, a, s, att, exp] = await Promise.all([
                workerAPI.getWorker(id),
                workerAPI.getAdvances(id),
                workerAPI.getSalaryHistory(id),
                workerAPI.getWorkerAttendance(id),
                workerAPI.getWorkerExpenses(id)
            ]);
            setWorker(w);
            setAdvances(a || []);
            setSalaryHistory(s || []);
            setAttendance(att || []);
            setExpenses(exp?.expenses || []);
            setTotalPaid(exp?.total_paid || 0);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        loadData();
    }, [id, loadData]);

    useEffect(() => {
        const handleAttendanceUpdated = () => {
            loadData();
        };
        window.addEventListener('worker-attendance-updated', handleAttendanceUpdated);
        return () => {
            window.removeEventListener('worker-attendance-updated', handleAttendanceUpdated);
        };
    }, [loadData]);

    const handleAddAdvance = async (e) => {
        e.preventDefault();
        setSubmittingAdvance(true);
        try {
            await workerAPI.addAdvance(id, { amount: advanceAmount, reason: advanceReason });
            setAdvanceAmount('');
            setAdvanceReason('');
            loadData();
        } catch (error) {
            showError('Failed to add advance');
        } finally {
            setSubmittingAdvance(false);
        }
    };

    const handleGenerateSpecificSalary = async (month, year) => {
        const confirmed = await showConfirm({
            title: 'Generate Salary?',
            description: `Generate the salary for ${month}/${year}? This will deduct advances inside that period.`,
            confirmLabel: 'Generate',
            cancelLabel: 'Cancel',
            variant: 'primary',
        });
        if (!confirmed) return;
        try {
            await workerAPI.generateSalary(id, month, year);
            loadData();
            showSuccess('Salary generated successfully');
        } catch (error) {
            showError('Failed to generate salary: ' + (error.response?.data?.error || error.message));
        }
    };

    const handleDeleteWorker = async () => {
        const confirmed = await showConfirm({
            title: 'Delete Worker',
            description: 'Are you sure you want to delete this worker? This action cannot be undone.',
            confirmLabel: 'Delete',
            cancelLabel: 'Cancel',
            variant: 'danger',
        });
        if (confirmed) {
            try {
                await workerAPI.deleteWorker(worker.worker_id);
                navigate('/workers');
            } catch (e) {
                showError('Failed to delete worker');
            }
        }
    }

    const calculateScore = () => {
        if (!attendance || !attendance.length) return 100;
        const present = attendance.filter(a => a.status === 'Present').length;
        return Math.round((present / attendance.length) * 100);
    };

    const getMissingCycles = () => {
        const missing = [];
        if (!worker || !worker.current_cycle) return missing;
        
        const currentStart = new Date(worker.current_cycle.start);
        const currentMonth = currentStart.getMonth() + 1;
        const currentYear = currentStart.getFullYear();
        
        let latestYear = 0;
        let latestMonth = 0;
        
        if (salaryHistory && salaryHistory.length > 0) {
            latestYear = salaryHistory[0].year;
            latestMonth = salaryHistory[0].month;
        } else {
            const joinDate = new Date(worker.join_date || worker.joinDate);
            latestYear = joinDate.getFullYear();
            latestMonth = joinDate.getMonth(); // start from join month
            if (latestMonth === 0) {
                latestMonth = 12;
                latestYear -= 1;
            }
        }
        
        let y = latestYear;
        let m = latestMonth + 1;
        if (m > 12) { m = 1; y += 1; }
        
        // Helper function outside the loop to check if salary exists to avoid no-loop-func
        const hasSalaryFor = (monthVal, yearVal) => {
            return salaryHistory.some(p => p.month === monthVal && p.year === yearVal);
        };
        
        while (y < currentYear || (y === currentYear && m <= currentMonth)) {
            if (!hasSalaryFor(m, y)) {
                missing.push({ month: m, year: y, isCurrent: (y === currentYear && m === currentMonth) });
            }
            m++;
            if (m > 12) { m = 1; y++; }
        }
        
        if (!missing.some(p => p.month === currentMonth && p.year === currentYear) && 
            !hasSalaryFor(currentMonth, currentYear)) {
              missing.push({ month: currentMonth, year: currentYear, isCurrent: true });
        }
        
        // Keep to 12 max to prevent massive lists if history is very old
        if (missing.length > 12) {
            missing.splice(0, missing.length - 12);
        }
        
        return missing.sort((a,b) => {
            if (a.year !== b.year) return b.year - a.year;
            return b.month - a.month;
        });
    };

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: currentTheme.colors.text.secondary }}>
            Loading Profile...
        </div>
    );

    if (!worker) return (
        <div style={{ padding: '24px', textAlign: 'center', color: currentTheme.colors.text.secondary }}>
            Worker not found
        </div>
    );

    // eslint-disable-next-line no-unused-vars
    const _score = calculateScore();

    // Tab Components
    const TabButton = ({ id, label, icon: Icon }) => (
        <motion.button
            onClick={() => setActiveTab(id)}
            className={`wpTabButton ${activeTab === id ? 'wpTabActive' : ''}`}
            whileHover={{ y: -1 }} // Tactile hover
            transition={{ duration: 0.2 }}
        >
            {Icon && <Icon size={18} />}
            {label}
            {activeTab === id && (
                <motion.div
                    layoutId="activeTab"
                    style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: '2px', // Tactile underline
                        background: '#F97316',
                        borderRadius: '2px',
                    }}
                    transition={{ duration: 0.18 }}
                />
            )}
        </motion.button>
    );

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel workers-panel"
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
            {/* ── Top Nav ── */}
            <div style={{
                padding: 'var(--spacing-6) var(--spacing-8)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid var(--glass-border)',
                flexShrink: 0,
            }}>
                <Button
                    onClick={() => navigate('/workers')}
                    variant="ghost"
                    style={{ paddingLeft: 0, display: 'flex', alignItems: 'center', gap: '8px', color: currentTheme.colors.text.secondary }}
                >
                    <IoArrowBack size={20} />
                    Back to List
                </Button>
                <Button
                    onClick={handleDeleteWorker}
                    variant="ghost"
                    style={{
                        color: '#EF4444',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'rgba(239, 68, 68, 0.12)',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        transition: 'background 0.2s'
                    }}
                    whileHover={{ backgroundColor: 'rgba(239, 68, 68, 0.2)' }}
                    whileTap={{ scale: 0.96 }}
                >
                    <IoTrash size={18} />
                    Delete Worker
                </Button>
            </div>

            {/* ── Scrollable Body ── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--spacing-6) var(--spacing-8) var(--spacing-8)' }}>

            {/* Profile Header Card */}
            <motion.div 
                className="wpHeader" 
                whileHover={{ y: -4, boxShadow: isDark ? '0 20px 50px rgba(255, 122, 0, 0.15)' : '0 20px 50px rgba(0, 0, 0, 0.08)' }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                style={{
                    display: 'grid',
                    gridTemplateColumns: '130px 1.2fr 1.3fr 1.8fr',
                    gap: '24px',
                    alignItems: 'center',
                    padding: '30px',
                    background: isDark 
                        ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.01) 100%)' 
                        : 'linear-gradient(135deg, rgba(255, 255, 255, 0.7) 0%, rgba(255, 255, 255, 0.4) 100%)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '28px',
                    marginBottom: '28px',
                    boxShadow: isDark 
                        ? '0 12px 36px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255,255,255,0.06)' 
                        : '0 12px 36px rgba(0, 0, 0, 0.04), inset 0 1px 1px rgba(255,255,255,0.8)',
                    backdropFilter: 'blur(24px)',
                    WebkitBackdropFilter: 'blur(24px)',
                    position: 'relative',
                    overflow: 'hidden',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
            >
                {/* 1st Section: Square Curved border rectangular photo frame */}
                <div style={{
                    width: '130px',
                    height: '130px',
                    borderRadius: '20px',
                    background: 'linear-gradient(135deg, var(--primary-500) 0%, #FF8A00 100%)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '3rem',
                    fontWeight: 800,
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: '0 8px 25px rgba(255, 122, 0, 0.25)',
                    border: '2px solid rgba(255, 255, 255, 0.15)',
                    flexShrink: 0,
                    cursor: 'pointer'
                }}>
                    {worker.photo ? (
                        <motion.img 
                            src={worker.photo} 
                            alt={worker.name} 
                            whileHover={{ scale: 1.1 }}
                            transition={{ duration: 0.4, ease: 'easeOut' }}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                        />
                    ) : (
                        <motion.span
                            whileHover={{ scale: 1.1 }}
                            transition={{ duration: 0.3 }}
                        >
                            {worker.name.charAt(0).toUpperCase()}
                        </motion.span>
                    )}
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        backgroundImage: 'linear-gradient(145deg, transparent, rgba(0,0,0,0.15))',
                        pointerEvents: 'none'
                    }} />
                </div>

                {/* 2nd Section: Name & type/role */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    justifyContent: 'center',
                    gap: '12px',
                    minWidth: 0
                }}>
                    <h1 style={{
                        fontSize: '1.9rem',
                        fontWeight: 900,
                        margin: 0,
                        color: 'var(--text-primary)',
                        letterSpacing: '-0.75px',
                        lineHeight: 1.1
                    }}>
                        {worker.name}
                    </h1>
                    
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '14px',
                        color: 'var(--text-secondary)',
                        fontWeight: 500
                    }}>
                        <IoBriefcase style={{ color: 'var(--primary-500)', flexShrink: 0 }} size={16} />
                        <span>{worker.role}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span className={`wpStatusBadge ${worker.status === 'active' ? 'wpStatusActive' : 'wpStatusInactive'}`}>
                            {worker.status.toUpperCase()}
                        </span>
                        
                        <Button
                            size="sm"
                            onClick={() => setShowEditModal(true)}
                            variant="secondary"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '4px 10px',
                                fontSize: '11px',
                                height: 'auto',
                                borderRadius: '8px',
                                background: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
                                border: '1px solid var(--glass-border)',
                                color: 'var(--text-primary)',
                                cursor: 'pointer'
                            }}
                        >
                            <IoCreateOutline size={13} />
                            Edit Details
                        </Button>
                    </div>
                </div>

                {/* 3rd Section: Phone, Salary, Joined */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    justifyContent: 'center',
                    gap: '14px',
                    borderLeft: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                    paddingLeft: '32px',
                    height: '80%'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        <IoCall style={{ color: 'var(--primary-500)', flexShrink: 0 }} size={16} />
                        <span style={{ fontWeight: 600 }}>{worker.phone || 'No Phone'}</span>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        <IoCash style={{ color: 'var(--primary-500)', flexShrink: 0 }} size={16} />
                        <span style={{ fontWeight: 700, color: 'var(--primary-500)' }}>
                            {formatCurrency(worker.salary)}/mo
                        </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        <IoCalendar style={{ color: 'var(--primary-500)', flexShrink: 0 }} size={16} />
                        <span style={{ fontWeight: 600 }}>
                            Joined {formatDate(worker.join_date || worker.joinDate)}
                        </span>
                    </div>
                </div>

                {/* 4th Section: Stats Info capsules */}
                {(() => {
                    const presentDays = attendance.filter(a => a.status === 'Present').length;
                    const currentCycleAdvance = worker.current_cycle?.advance || 0;
                    const hasAdvance = currentCycleAdvance > 0;
                    const items = [
                        { label: 'Attendance', value: `${presentDays} Days`, color: '#3B82F6' },
                        { label: 'Daily Wage', value: formatCurrency(worker.salary / 30), color: '#10B981' },
                        { label: 'Advances', value: formatCurrency(currentCycleAdvance), color: hasAdvance ? '#EF4444' : '#71717A', isRed: hasAdvance },
                        { label: 'Lifetime Paid', value: formatCurrency(totalPaid), color: '#F97316' },
                    ];
                    return (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            gap: '8px',
                            borderLeft: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                            paddingLeft: '32px',
                            height: '80%'
                        }}>
                            {items.map((item) => (
                                <motion.div 
                                    key={item.label} 
                                    whileHover={{ x: 4, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)' }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        fontSize: '12px',
                                        padding: '6px 12px',
                                        borderRadius: '10px',
                                        background: isDark ? 'rgba(255, 255, 255, 0.01)' : 'rgba(0, 0, 0, 0.01)',
                                        border: '1px solid rgba(255, 255, 255, 0.02)',
                                        boxSizing: 'border-box',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{
                                            width: '6px', height: '6px', borderRadius: '50%',
                                            background: item.color, display: 'inline-block', flexShrink: 0
                                        }} />
                                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                                            {item.label}
                                        </span>
                                    </div>
                                    <span style={{
                                        fontWeight: 750,
                                        color: item.isRed ? '#EF4444' : (isDark ? '#FAFAFA' : '#111827'),
                                        fontVariantNumeric: 'tabular-nums'
                                    }}>
                                        {item.value}
                                    </span>
                                </motion.div>
                            ))}
                        </div>
                    );
                })()}
            </motion.div>

            {/* Navigation Tabs */}
            <div style={{
                borderBottom: `1px solid ${currentTheme.colors.border}`,
                marginBottom: '24px',
                display: 'flex',
                gap: '8px'
            }}>
                <TabButton id="attendance" label="Attendance" icon={IoTime} />
                <TabButton id="advances" label="Advances" icon={IoWarning} />
                <TabButton id="salary" label="Salary History" icon={IoCash} />
                <TabButton id="expenses" label="Expenses" icon={IoBriefcase} />
            </div>

            {/* Tab Content Area */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                >
                    {activeTab === 'attendance' && (
                        <Card title="Attendance Log" style={{ overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead style={{ background: isDark ? 'rgba(255,255,255,0.02)' : '#F9FAFB' }}>
                                    <tr>
                                        <th style={{ padding: '16px', textAlign: 'left', fontSize: '0.75rem', textTransform: 'uppercase', color: currentTheme.colors.text.tertiary }}>Date</th>
                                        <th style={{ padding: '16px', textAlign: 'left', fontSize: '0.75rem', textTransform: 'uppercase', color: currentTheme.colors.text.tertiary }}>Status</th>
                                        <th style={{ padding: '16px', textAlign: 'left', fontSize: '0.75rem', textTransform: 'uppercase', color: currentTheme.colors.text.tertiary }}>Check In</th>
                                        <th style={{ padding: '16px', textAlign: 'left', fontSize: '0.75rem', textTransform: 'uppercase', color: currentTheme.colors.text.tertiary }}>Check Out</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {attendance.map((a, i) => (
                                        <tr key={i} style={{ borderBottom: `1px solid ${currentTheme.colors.border}` }}>
                                            <td style={{ padding: '16px', fontWeight: 500 }}>{formatDate(a.date)}</td>
                                            <td style={{ padding: '16px' }}>
                                                <span style={{
                                                    padding: '4px 10px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600,
                                                    background: a.status === 'Present' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                                    color: a.status === 'Present' ? '#16A34A' : '#DC2626'
                                                }}>
                                                    {a.status}
                                                </span>
                                            </td>
                                            <td style={{ padding: '16px', color: currentTheme.colors.text.secondary }}>{a.check_in || '-'}</td>
                                            <td style={{ padding: '16px', color: currentTheme.colors.text.secondary }}>{a.check_out || '-'}</td>
                                        </tr>
                                    ))}
                                    {attendance.length === 0 && (
                                        <tr>
                                            <td colSpan="4" style={{ padding: '40px', textAlign: 'center', color: currentTheme.colors.text.secondary }}>
                                                No attendance records found
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </Card>
                    )}

                    {activeTab === 'advances' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
                            <Card title="Advance History" style={{ overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead style={{ background: isDark ? 'rgba(255,255,255,0.02)' : '#F9FAFB' }}>
                                        <tr>
                                            <th style={{ padding: '16px', textAlign: 'left', fontSize: '0.75rem', textTransform: 'uppercase', color: currentTheme.colors.text.tertiary }}>Date</th>
                                            <th style={{ padding: '16px', textAlign: 'left', fontSize: '0.75rem', textTransform: 'uppercase', color: currentTheme.colors.text.tertiary }}>Reason</th>
                                            <th style={{ padding: '16px', textAlign: 'right', fontSize: '0.75rem', textTransform: 'uppercase', color: currentTheme.colors.text.tertiary }}>Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {groupedAdvances.map((group) => (
                                            <React.Fragment key={group.key}>
                                                {/* Cycle Month Group Header Row */}
                                                <tr style={{ background: isDark ? 'rgba(255,255,255,0.03)' : '#F3F4F6', borderBottom: `1px solid ${currentTheme.colors.border}` }}>
                                                    <td colSpan="2" style={{ padding: '12px 16px', fontWeight: 700, color: currentTheme.colors.text.primary }}>
                                                        {group.name} <span style={{ fontWeight: 500, fontSize: '0.85rem', color: currentTheme.colors.text.tertiary, marginLeft: '8px' }}>({group.range})</span>
                                                    </td>
                                                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#EF4444' }}>
                                                        Total: {formatCurrency(group.total)}
                                                    </td>
                                                </tr>
                                                {/* Group Items */}
                                                {group.items.map((adv, idx) => (
                                                    <tr key={`${group.key}-${idx}`} style={{ borderBottom: `1px solid ${currentTheme.colors.border}` }}>
                                                        <td style={{ padding: '16px 16px 16px 28px', fontWeight: 500 }}>
                                                            {formatDate(adv.date)}
                                                        </td>
                                                        <td style={{ padding: '16px', color: currentTheme.colors.text.secondary }}>
                                                            {adv.reason || '—'}
                                                        </td>
                                                        <td style={{ padding: '16px', textAlign: 'right', fontWeight: 600, color: currentTheme.colors.text.primary }}>
                                                            {formatCurrency(adv.amount)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </React.Fragment>
                                        ))}
                                        {advances.length === 0 && (
                                            <tr>
                                                <td colSpan="3" style={{ padding: '40px', textAlign: 'center', color: currentTheme.colors.text.secondary }}>
                                                    No advances found
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </Card>

                            <Card title="Add New Advance">
                                <form onSubmit={handleAddAdvance} style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '8px' }}>
                                    <Input
                                        label="Amount (₹)"
                                        type="number"
                                        value={advanceAmount}
                                        onChange={e => setAdvanceAmount(e.target.value)}
                                        required
                                        icon={<IoCash />}
                                    />
                                    <Input
                                        label="Reason"
                                        value={advanceReason}
                                        onChange={e => setAdvanceReason(e.target.value)}
                                        placeholder="e.g. Medical Emergency (Optional)"
                                    />
                                    <Button
                                        variant="primary"
                                        type="submit"
                                        loading={submittingAdvance}
                                        style={{
                                            background: '#EF4444',
                                            border: 'none',
                                            marginTop: '8px',
                                            justifyContent: 'center'
                                        }}
                                    >
                                        Deduct Advance
                                    </Button>
                                </form>
                            </Card>
                        </div>
                    )}

                    {activeTab === 'salary' && (
                        <Card style={{ overflow: 'hidden' }}>
                            <table className="wpTable">
                                <thead>
                                    <tr>
                                        <th>Period</th>
                                        <th>Base Salary</th>
                                        <th>Deductions</th>
                                        <th>Final Pay</th>
                                        <th>Status</th>
                                        <th style={{ textAlign: 'right' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {getMissingCycles().map(cycle => (
                                        <tr key={`missing-${cycle.year}-${cycle.month}`} style={{ background: isDark ? 'rgba(249, 115, 22, 0.05)' : '#FFF7ED' }}>
                                            <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                                {new Date(cycle.year, cycle.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
                                                {cycle.isCurrent ? ' (Current)' : ' (Missing)'}
                                            </td>
                                            <td style={{ color: 'var(--text-secondary)' }}>{formatCurrency(worker.salary)}</td>
                                            <td style={{ color: '#EF4444' }}>
                                                {cycle.isCurrent ? `- ${formatCurrency(worker.current_cycle?.advance || 0)}` : 'On generation'}
                                            </td>
                                            <td style={{ color: '#10B981', fontWeight: 700, fontSize: '1.05rem' }}>
                                                {cycle.isCurrent ? formatCurrency(worker.current_cycle?.net_payable || worker.salary) : 'TBD'}
                                            </td>
                                            <td>
                                                <span style={{
                                                    padding: '4px 12px', borderRadius: '99px', fontSize: '0.8rem', fontWeight: 600,
                                                    background: 'rgba(245, 158, 11, 0.1)',
                                                    color: '#F59E0B',
                                                    display: 'inline-flex', alignItems: 'center', gap: '4px'
                                                }}>
                                                    <IoTime /> Un-generated
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleGenerateSpecificSalary(cycle.month, cycle.year)}
                                                    style={{ background: '#10B981', border: 'none', color: 'white' }}
                                                >
                                                    Generate
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}

                                    {salaryHistory.map((pay, i) => (
                                        <tr key={i}>
                                            <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                                {new Date(pay.year, pay.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
                                            </td>
                                            <td style={{ color: 'var(--text-secondary)' }}>{formatCurrency(pay.base_salary)}</td>
                                            <td style={{ color: '#EF4444' }}>- {formatCurrency(pay.advance_deduction)}</td>
                                            <td style={{ color: '#10B981', fontWeight: 700, fontSize: '1.05rem' }}>{formatCurrency(pay.final_salary)}</td>
                                            <td>
                                                <span style={{
                                                    padding: '4px 12px', borderRadius: '99px', fontSize: '0.8rem', fontWeight: 600,
                                                    background: pay.paid ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                                                    color: pay.paid ? '#16A34A' : '#F59E0B',
                                                    display: 'inline-flex', alignItems: 'center', gap: '4px'
                                                }}>
                                                    {pay.paid ? <IoCheckmarkCircle /> : <IoTime />}
                                                    {pay.paid ? 'Paid' : 'Unpaid'}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                {!pay.paid && (
                                                    <Button
                                                        size="sm"
                                                        onClick={async () => {
                                                            try {
                                                                await workerAPI.markPaid(pay.payment_id);
                                                                loadData();
                                                            } catch (e) { showError('Failed to mark paid'); }
                                                        }}
                                                        style={{ background: '#10B981', border: 'none', color: 'white' }}
                                                    >
                                                        Mark Paid
                                                    </Button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Card>
                    )}

                    {activeTab === 'expenses' && (
                        <Card title="Linked Business Expenses" style={{ overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead style={{ background: isDark ? 'rgba(255,255,255,0.02)' : '#F9FAFB' }}>
                                    <tr>
                                        <th style={{ padding: '16px', textAlign: 'left', fontSize: '0.75rem', textTransform: 'uppercase', color: currentTheme.colors.text.tertiary }}>Date</th>
                                        <th style={{ padding: '16px', textAlign: 'left', fontSize: '0.75rem', textTransform: 'uppercase', color: currentTheme.colors.text.tertiary }}>Description</th>
                                        <th style={{ padding: '16px', textAlign: 'left', fontSize: '0.75rem', textTransform: 'uppercase', color: currentTheme.colors.text.tertiary }}>Category</th>
                                        <th style={{ padding: '16px', textAlign: 'right', fontSize: '0.75rem', textTransform: 'uppercase', color: currentTheme.colors.text.tertiary }}>Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {expenses.map((exp) => (
                                        <tr key={exp.id} style={{ borderBottom: `1px solid ${currentTheme.colors.border}` }}>
                                            <td style={{ padding: '16px', fontWeight: 500 }}>{new Date(exp.date).toLocaleDateString()}</td>
                                            <td style={{ padding: '16px', color: currentTheme.colors.text.primary }}>{exp.title}</td>
                                            <td style={{ padding: '16px' }}>
                                                <span style={{
                                                    padding: '4px 10px', borderRadius: '6px', fontSize: '0.8rem', 
                                                    background: 'rgba(249, 115, 22, 0.1)', color: '#F97316'
                                                }}>
                                                    {exp.category}
                                                </span>
                                            </td>
                                            <td style={{ padding: '16px', textAlign: 'right', fontWeight: 700, color: currentTheme.colors.text.primary }}>
                                                {formatCurrency(exp.amount)}
                                            </td>
                                        </tr>
                                    ))}
                                    {expenses.length === 0 && (
                                        <tr>
                                            <td colSpan="4" style={{ padding: '40px', textAlign: 'center', color: currentTheme.colors.text.secondary }}>
                                                No expenses linked to this worker
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                                {expenses.length > 0 && (
                                    <tfoot style={{ background: isDark ? 'rgba(249, 115, 22, 0.03)' : '#FFF7ED' }}>
                                        <tr>
                                            <td colSpan="3" style={{ padding: '16px', textAlign: 'right', fontWeight: 700, color: currentTheme.colors.text.secondary }}>Total Lifetime Payout</td>
                                            <td style={{ padding: '16px', textAlign: 'right', fontWeight: 800, color: '#F97316', fontSize: '1.1rem' }}>
                                                {formatCurrency(totalPaid)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </Card>
                    )}
                </motion.div>
            </AnimatePresence>

            </div>{/* end scrollable body */}

            {/* Edit Worker Details Modal */}
            <AddWorkerModal
                open={showEditModal}
                onClose={() => setShowEditModal(false)}
                onSaved={() => {
                    setShowEditModal(false);
                    loadData(); // Reload profile details
                }}
                initialData={worker}
            />
        </motion.div>
    );
};

export default WorkerProfile;
