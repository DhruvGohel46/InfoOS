/**
 * =============================================================================
 * MAIN APPLICATION COMPONENT - APP.JSX
 * =============================================================================
 * 
 * ROLE: Central application entry point and routing controller
 * 
 * RESPONSIBILITIES:
 * - Theme management and dark/light mode switching
 * - Screen navigation between POS, Analytics, and Management modules
 * - Bill notification system with auto-dismiss functionality
 * - Global layout structure and responsive design
 * - State management for current screen and bill notifications
 * 
 * KEY FEATURES:
 * - ThemeProvider wrapper for consistent theming
 * - Navigation system with screen state management
 * - Bill creation notification with glassmorphism design
 * - Auto-dismiss notifications (5 seconds)
 * - Responsive layout with proper spacing
 * 
 * SCREENS:
 * - 'pos': Point of Sale / Billing interface
 * - 'summary': Analytics dashboard with reports
 * - 'management': Product management system
 * 
 * COMPONENTS USED:
 * - WorkingPOSInterface: Main billing/POS functionality
 * - Reports: Analytics and reporting dashboard
 * - ProductManagement: Product CRUD operations
 * 
 * STATE MANAGEMENT:
 * - currentScreen: Active screen identifier
 * - lastBill: Bill notification data for display
 * - Theme context integration
 * 
 * DESIGN PATTERNS:
 * - Functional component with hooks
 * - Conditional rendering based on screen state
 * - Framer Motion animations for notifications
 * - Theme-aware styling throughout
 * =============================================================================
 */
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ThemeProvider } from './context/ThemeContext';
import { AlertProvider, useAlert } from './context/AlertContext';
import { SettingsProvider, useSettings } from './context/SettingsContext';
import { useTheme } from './context/ThemeContext';
import './styles/typography.css'; // Import global typography system

import { formatCurrency } from './utils/api';
import { playNotificationSound } from './utils/soundService';
import './styles/fonts.css';
import './styles/global.css';

// Import screens
import WorkingPOSInterface from './components/screens/Bill';
import Analytics from './components/screens/Analytics';
import ProductManagement from './components/screens/Management';
import Inventory from './components/screens/Inventory';
import Expenses from './components/screens/Expenses';
import Settings from './components/screens/Settings';
import LiveOrders from './components/screens/LiveOrders';
import NotificationSystem from './components/system/NotificationSystem';
import { AuthProvider, useAuth } from './context/AuthContext';
import AdminUnlockModal from './components/system/AdminUnlockModal';
import AdminRoute from './components/system/AdminRoute';
import AgentChatPanel from './components/agents/AgentChatPanel';
import AiHeaderButton from './components/ui/AiHeaderButton';
import infoosLogo from './assets/logo.png';

// Worker Pages
// Worker Pages
import WorkersDashboard from './components/workers/WorkersPage';
import WorkerList from './components/workers/WorkerList';
import WorkerProfile from './components/workers/WorkerProfile';
import Attendance from './components/workers/Attendance';
import SalaryManager from './components/workers/SalaryManager';
import { workerAPI } from './api/workers';

// Reminders & Celebrations
import { ReminderProvider } from './context/ReminderContext';
import ReminderAlert from './components/ui/ReminderAlert';
import OrderCelebrationModal from './components/common/OrderCelebrationModal';
import { NotificationProvider, useNotifications } from './context/NotificationContext';
import NotificationCenterDrawer from './components/system/NotificationCenterDrawer';
import Reminders from './components/screens/Reminders';
import { IoNotifications, IoNotificationsOutline, IoShieldCheckmarkOutline, IoPersonOutline, IoCalendarOutline } from 'react-icons/io5';

// Offline Sync
import { NetworkProvider, useNetwork } from './context/NetworkContext';
import OfflineBadge from './components/ui/OfflineBadge';
import { syncService } from './api/sync';

// POS Data Bootstrap (load-once pattern)
import { POSDataProvider, usePOSData } from './context/POSDataContext';

// Import UI components
import ShopMenuDropdown from './components/ui/ShopMenuDropdown';

// System components (production hardening)
import ErrorBoundary from './components/system/ErrorBoundary';
import ApiErrorListener from './components/system/ApiErrorListener';
import UpdateNotification from './components/system/UpdateNotification';
import LicensingGate from './components/system/LicensingGate';

// ─── Restore zoom/scale CSS vars immediately on every page load ───────────────
// These vars are set by Settings.jsx but only applied while that component is
// mounted. We re-read localStorage here so they survive a hard refresh.
(function restoreDisplayPrefs() {
  try {
    const zoom = localStorage.getItem('display_zoom');
    const scale = localStorage.getItem('text_scale');
    if (zoom) {
      if (window.electronAPI && window.electronAPI.setZoomFactor) {
        window.electronAPI.setZoomFactor(parseFloat(zoom));
        document.documentElement.style.setProperty('--display-zoom', 1);
      } else {
        document.documentElement.style.setProperty('--display-zoom', zoom);
      }
    }
    if (scale) document.documentElement.style.setProperty('--text-scale', scale);
  } catch (_) { }
})();

function AppContent() {
  const { currentTheme, toggleTheme, isDark } = useTheme();
  const { settings } = useSettings();
  const { isOnline } = useNetwork();
  const { isAdmin, openUnlock, lockToWorker, pendingPath } = useAuth();
  const { unreadCount, toggleCenter } = useNotifications();
  const { addToast, showWarning, showSuccess: alertSuccess } = useAlert();
  const { checkCatalogVersion } = usePOSData();

  const navigate = useNavigate();
  // eslint-disable-next-line no-unused-vars
  const _location = useLocation();

  // Re-apply display zoom and text scale on every location (route) change
  useEffect(() => {
    try {
      const zoom = localStorage.getItem('display_zoom');
      const scale = localStorage.getItem('text_scale');
      if (zoom) {
        if (window.electronAPI && window.electronAPI.setZoomFactor) {
          window.electronAPI.setZoomFactor(parseFloat(zoom));
          document.documentElement.style.setProperty('--display-zoom', 1);
        } else {
          document.documentElement.style.setProperty('--display-zoom', zoom);
        }
      }
      if (scale) {
        document.documentElement.style.setProperty('--text-scale', scale);
      }
      checkCatalogVersion();
    } catch (_) { }
  }, [_location, checkCatalogVersion]);

  // Sidebar removed — navigation is now in the header ShopMenuDropdown
  const [posKey, setPosKey] = useState(0);

  // ── Calculator State ──
  const [showCalculator, setShowCalculator] = useState(false);
  const [calcDisplay, setCalcDisplay] = useState('0');
  const [calcExpression, setCalcExpression] = useState('');
  const [calcResult, setCalcResult] = useState(null);
  const [calcJustEvaluated, setCalcJustEvaluated] = useState(false);
  const calcRef = React.useRef(null);

  // Close calculator on outside click
  useEffect(() => {
    if (!showCalculator) return;
    const handler = (e) => {
      if (calcRef.current && !calcRef.current.contains(e.target)) {
        setShowCalculator(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showCalculator]);

  // Alt key shortcut to toggle calculator
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Alt' && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
        e.preventDefault();
        setShowCalculator(prev => !prev);
      }
    };
    document.addEventListener('keyup', handler);
    return () => document.removeEventListener('keyup', handler);
  }, []);

  // Keyboard calculations listener when calculator is open
  useEffect(() => {
    if (!showCalculator) return;

    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
      document.activeElement.blur();
    }

    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const key = e.key;

      if (key === 'Escape') {
        e.preventDefault();
        setShowCalculator(false);
        return;
      }

      if (/^[0-9]$/.test(key)) {
        e.preventDefault();
        calcHandleSpecial(key);
      } else if (key === '.' || key === ',') {
        e.preventDefault();
        calcHandleSpecial('.');
      } else if (['+', '-', '*', '/'].includes(key)) {
        e.preventDefault();
        calcHandleSpecial(key);
      } else if (key === 'x' || key === 'X') {
        e.preventDefault();
        calcHandleSpecial('*');
      } else if (key === '=' || key === 'Enter') {
        e.preventDefault();
        calcHandleSpecial('=');
      } else if (key === 'Backspace') {
        e.preventDefault();
        calcHandleSpecial('⌫');
      } else if (key === 'Delete' || key === 'c' || key === 'C') {
        e.preventDefault();
        calcHandleSpecial('C');
      } else if (key === '%') {
        e.preventDefault();
        calcHandleSpecial('%');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCalculator, calcDisplay, calcExpression, calcJustEvaluated]);

  const calcHandleInput = (value) => {
    if (value === 'C') {
      setCalcDisplay('0');
      setCalcExpression('');
      setCalcResult(null);
      setCalcJustEvaluated(false);
      return;
    }
    if (value === '⌫') {
      setCalcDisplay(prev => {
        const next = prev.length > 1 ? prev.slice(0, -1) : '0';
        return next;
      });
      if (calcJustEvaluated) { setCalcJustEvaluated(false); setCalcResult(null); }
      return;
    }
    if (value === '=') {
      try {
        const expr = calcExpression + calcDisplay;
        // Safe evaluation: only digits, operators, dot, parentheses
        if (!/^[0-9+\-*/.()\s]+$/.test(expr)) return;
        // eslint-disable-next-line no-new-func
        const result = Function('"use strict"; return (' + expr + ')')();
        const formatted = parseFloat(result.toFixed(10)).toString();
        setCalcResult(formatted);
        setCalcDisplay(formatted);
        setCalcExpression(expr + ' =');
        setCalcJustEvaluated(true);
      } catch { }
      return;
    }
    const isOp = ['+', '-', '*', '/'].includes(value);
    if (calcJustEvaluated && !isOp) {
      setCalcExpression('');
      setCalcDisplay(value === '.' ? '0.' : value);
      setCalcJustEvaluated(false);
      setCalcResult(null);
      return;
    }
    if (calcJustEvaluated && isOp) {
      setCalcExpression(calcDisplay);
      setCalcDisplay(value);
      setCalcJustEvaluated(false);
      setCalcResult(null);
      return;
    }
    if (isOp) {
      setCalcExpression(prev => prev + calcDisplay);
      setCalcDisplay(value);
      return;
    }
    if (value === '.' && calcDisplay.includes('.')) return;
    setCalcDisplay(prev => prev === '0' && value !== '.' ? value : prev + value);
  };

  const calcRows = [
    ['C', '⌫', '%', '/'],
    ['7', '8', '9', '*'],
    ['4', '5', '6', '-'],
    ['1', '2', '3', '+'],
    ['+/-', '0', '.', '='],
  ];

  const calcHandleSpecial = (val) => {
    if (val === '%') {
      try {
        const num = parseFloat(calcDisplay);
        if (!isNaN(num)) setCalcDisplay((num / 100).toString());
      } catch { }
      return;
    }
    if (val === '+/-') {
      setCalcDisplay(prev => {
        const n = parseFloat(prev);
        if (!isNaN(n)) return (-n).toString();
        return prev;
      });
      return;
    }
    calcHandleInput(val);
  };

  const [showAttendancePrompt, setShowAttendancePrompt] = useState(false);

  // Check Attendance & Salary on Mount
  useEffect(() => {
    const checkStatus = async () => {
      try {
        // 1. Attendance Check
        const status = await workerAPI.checkAttendanceStatus();
        if (!status.is_marked) {
          setShowAttendancePrompt(true);
        }

        // 2. Salary Day Check
        if (settings?.salary_day) {
          const today = new Date();
          if (today.getDate() === parseInt(settings.salary_day)) {
            const salaryStatus = await workerAPI.checkMonthlySalaryStatus(today.getMonth() + 1, today.getFullYear());
            if (salaryStatus.data && !salaryStatus.data.all_paid) {
              setSalaryNotification(true);
            }
          }
        }
      } catch (e) {
        console.error('Initial checks failed', e);
      }
    };
    setTimeout(checkStatus, 3000);
  }, [settings?.salary_day]);

  // Handle Offline Sync
  useEffect(() => {
    if (isOnline) {
      syncService.syncOfflineBills().then(count => {
        if (count > 0) {
          alertSuccess(`Successfully synced ${count} offline bill(s)`);
        }
      });
      // Automatically sync weekly/monthly reports
      syncService.syncWeeklyAndMonthlyReports();
    }
  }, [isOnline, alertSuccess]);

  const [salaryNotification, setSalaryNotification] = useState(false);

  // Handle auto-updater installation safety confirmations and postpones
  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubscribeInstallRequest = window.electronAPI.onInstallRequest(() => {
      const activeTasks = window.posActiveTasks ? Array.from(window.posActiveTasks) : [];

      const checkAndRespond = async () => {
        // Also check if printing is currently running at the OS level
        const printingOs = window.electronAPI.isPrinting ? await window.electronAPI.isPrinting() : false;

        const tasks = [...activeTasks];
        if (printingOs && !tasks.includes('printing')) {
          tasks.push('printing');
        }

        if (tasks.length > 0) {
          const taskLabels = tasks.map(t => {
            if (t === 'cart') return 'Open Bill (Cart)';
            if (t === 'printing') return 'Printing Receipt/KOT';
            if (t === 'sync') return 'Cloud Synchronization';
            return t;
          });
          const reason = `Critical operations are active: ${taskLabels.join(', ')}`;
          window.electronAPI.sendInstallResponse(false, reason);
          showWarning(`Update Delayed: ${reason}. Please finish your active tasks first.`);
        } else {
          // Safe to install
          window.electronAPI.sendInstallResponse(true, 'Safe');
        }
      };

      checkAndRespond();
    });

    const unsubscribePostponed = window.electronAPI.onUpdatePostponed((data) => {
      showWarning(`Update Postponed: ${data.reason}.`);
    });

    return () => {
      unsubscribeInstallRequest();
      unsubscribePostponed();
    };
  }, [showWarning]);


  // Settings are now loaded globally by SettingsProvider

  // eslint-disable-next-line no-unused-vars
  const _getActiveTab = (pathname) => {
    if (pathname === '/') return 'pos';
    if (pathname.startsWith('/live')) return 'live';
    if (pathname.startsWith('/analytics')) return 'summary';
    if (pathname.startsWith('/management')) return 'management';
    if (pathname.startsWith('/groups')) return 'groups';
    if (pathname.startsWith('/workers')) return 'workers';
    if (pathname.startsWith('/inventory')) return 'inventory';
    if (pathname.startsWith('/expenses')) return 'expenses';
    if (pathname.startsWith('/settings')) return 'settings';
    return 'pos';
  };

  const iconTransition = { duration: 0.5, ease: "easeInOut" };
  const iconVariants = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: { pathLength: 1, opacity: 1 }
  };

  const adminNavItems = [
    {
      id: 'pos',
      label: 'Bill',
      path: '/',
      icon: (
        <motion.svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <motion.path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" variants={iconVariants} initial="hidden" animate="visible" transition={iconTransition} />
          <motion.path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" variants={iconVariants} initial="hidden" animate="visible" transition={iconTransition} />
          <motion.path d="M16 13H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" variants={iconVariants} initial="hidden" animate="visible" transition={iconTransition} />
          <motion.path d="M16 17H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" variants={iconVariants} initial="hidden" animate="visible" transition={iconTransition} />
          <motion.path d="M10 9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" variants={iconVariants} initial="hidden" animate="visible" transition={iconTransition} />
        </motion.svg>
      )
    },
    {
      id: 'summary',
      label: 'Analytics',
      path: '/analytics',
      icon: (
        <motion.svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <motion.path d="M18 20V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" variants={iconVariants} initial="hidden" animate="visible" transition={iconTransition} />
          <motion.path d="M12 20V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" variants={iconVariants} initial="hidden" animate="visible" transition={iconTransition} />
          <motion.path d="M6 20V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" variants={iconVariants} initial="hidden" animate="visible" transition={iconTransition} />
        </motion.svg>
      )
    },
    {
      id: 'workers',
      label: 'Workers',
      path: '/workers',
      icon: (
        <motion.svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <motion.path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" variants={iconVariants} initial="hidden" animate="visible" transition={iconTransition} />
          <motion.circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" as={motion.circle} variants={iconVariants} initial="hidden" animate="visible" transition={iconTransition} />
          <motion.path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" variants={iconVariants} initial="hidden" animate="visible" transition={iconTransition} />
          <motion.path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" variants={iconVariants} initial="hidden" animate="visible" transition={iconTransition} />
        </motion.svg>
      )
    },
    {
      id: 'inventory',
      label: 'Inventory',
      path: '/inventory',
      icon: (
        <motion.svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <motion.path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" variants={iconVariants} initial="hidden" animate="visible" transition={iconTransition} />
          <motion.rect x="8" y="2" width="8" height="4" rx="1" ry="1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" variants={iconVariants} initial="hidden" animate="visible" transition={iconTransition} />
          <motion.path d="M9 12h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" variants={iconVariants} initial="hidden" animate="visible" transition={iconTransition} />
          <motion.path d="M9 16h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" variants={iconVariants} initial="hidden" animate="visible" transition={iconTransition} />
        </motion.svg>
      )
    },
    {
      id: 'expenses',
      label: 'Expenses',
      path: '/expenses',
      icon: (
        <motion.svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <motion.path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" variants={iconVariants} initial="hidden" animate="visible" transition={iconTransition} />
          <motion.path d="M3 6h18" variants={iconVariants} initial="hidden" animate="visible" transition={iconTransition} />
          <motion.path d="M16 10a4 4 0 0 1-8 0" variants={iconVariants} initial="hidden" animate="visible" transition={iconTransition} />
        </motion.svg>
      )
    },
    {
      id: 'management',
      label: 'Management',
      path: '/management',
      icon: (
        <motion.svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <motion.path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" variants={iconVariants} initial="hidden" animate="visible" transition={iconTransition} />
          <motion.path d="M3.27 6.96L12 12.01l8.73-5.05" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" variants={iconVariants} initial="hidden" animate="visible" transition={iconTransition} />
          <motion.path d="M12 22.08V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" variants={iconVariants} initial="hidden" animate="visible" transition={iconTransition} />
        </motion.svg>
      )
    },
    {
      id: 'reminders',
      label: 'Reminders',
      path: '/reminders',
      icon: (
        <motion.svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <motion.circle cx="12" cy="12" r="10" variants={iconVariants} initial="hidden" animate="visible" transition={iconTransition} />
          <motion.polyline points="12 6 12 12 16 14" variants={iconVariants} initial="hidden" animate="visible" transition={iconTransition} />
        </motion.svg>
      )
    },
    {
      id: 'settings',
      label: 'Settings',
      path: '/settings',
      icon: (
        <motion.svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <motion.circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" variants={iconVariants} initial="hidden" animate="visible" transition={iconTransition} />
          <motion.path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" variants={iconVariants} initial="hidden" animate="visible" transition={iconTransition} />
        </motion.svg>
      )
    },
  ];


  const workerAllowedPaths = new Set(['/', '/live', '/analytics', '/reminders']);

  const navItems = isAdmin
    ? adminNavItems
    : adminNavItems.filter((item) => workerAllowedPaths.has(item.path));

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: '2-digit',
  });



  const handleBillCreated = (bill) => {
    addToast({
      type: 'success',
      title: 'Bill Created Successfully!',
      description: `Bill ${bill.bill_no} — Total: ${formatCurrency(bill.total)}`,
      duration: 5000,
    });

    // Play notification chime on successful bill creation
    playNotificationSound().catch(() => {});
  };

  return (
    <div style={{
      height: 'var(--viewport-height, 100vh)',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'transparent',
      color: currentTheme.colors.text.primary,
      fontFamily: currentTheme.typography.fontFamily.primary,
      overflow: 'hidden',
    }}>
      {/* Global API Error → Toast bridge */}
      <ApiErrorListener />

      {/* Main Header Area  */}
      <header
        className="glass-header"
        style={{
          height: 'var(--header-height)',
          minHeight: 'var(--header-height)',
          maxHeight: 'var(--header-height)',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 var(--spacing-6)',
          zIndex: 2000,
          flexShrink: 0,
          position: 'relative',
          transition: 'filter var(--transition-normal) var(--ease-out)',
          background: isDark
            ? 'linear-gradient(180deg, rgba(28, 32, 44, 0.82) 0%, rgba(14, 16, 22, 0.76) 100%)'
            : 'linear-gradient(180deg, rgba(255, 255, 255, 0.88) 0%, rgba(248, 250, 252, 0.78) 100%)',
          backdropFilter: 'blur(36px) saturate(210%)',
          WebkitBackdropFilter: 'blur(36px) saturate(210%)',
          borderBottom: isDark
            ? '1px solid rgba(255, 255, 255, 0.12)'
            : '1px solid rgba(226, 232, 240, 0.75)',
          boxShadow: isDark
            ? '0 8px 32px -4px rgba(0, 0, 0, 0.50), inset 0 1px 1px 0 rgba(255, 255, 255, 0.20)'
            : '0 8px 24px -4px rgba(15, 23, 42, 0.06), inset 0 1px 1px 0 rgba(255, 255, 255, 0.90)',
        }}
      >
        {/* Left Side - Shop Menu + New Bill Button + Calculator */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px', width: 'auto' }} ref={calcRef}>
          {/* Shop Menu Dropdown (replaces sidebar) */}
          <ShopMenuDropdown
            navItems={navItems}
            onNavigate={(item) => {
              if (!isAdmin && !workerAllowedPaths.has(item.path)) {
                openUnlock(item.path);
                return;
              }
              navigate(item.path);
            }}
          />
          <button
            onClick={() => {
              setPosKey(prev => prev + 1);
              navigate('/', { replace: true, state: {} });
            }}
            className="liquid-glass-button header-btn-newbill"
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--font-medium)',
              flexShrink: 0,
            }}
          >
            <span className="header-newbill-full">Start New Bill</span>
            <span className="header-newbill-short">New Bill</span>
          </button>

          {/* Calculator Toggle Button */}
          <button
            id="calc-toggle-btn"
            onClick={() => setShowCalculator(prev => !prev)}
            title="Calculator (Alt)"
            className="liquid-glass-button header-btn-calc"
            style={{
              background: showCalculator ? 'rgba(249,115,22,0.2)' : 'var(--bg-secondary)',
              border: showCalculator ? '1px solid var(--primary-500)' : '1px solid var(--glass-border)',
              color: showCalculator ? 'var(--primary-400)' : 'var(--text-primary)',
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--font-medium)',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backdropFilter: 'var(--glass-blur)',
              WebkitBackdropFilter: 'var(--glass-blur)',
              boxShadow: showCalculator ? '0 0 14px rgba(249,115,22,0.35)' : 'var(--shadow-sm)',
              transition: 'all 0.2s ease',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <rect x="2" y="3" width="20" height="18" rx="2" />
              <line x1="8" y1="10" x2="8" y2="10" />
              <line x1="12" y1="10" x2="12" y2="10" />
              <line x1="16" y1="10" x2="16" y2="10" />
              <line x1="8" y1="14" x2="8" y2="14" />
              <line x1="12" y1="14" x2="12" y2="14" />
              <line x1="16" y1="14" x2="16" y2="14" />
              <line x1="8" y1="18" x2="8" y2="18" />
              <line x1="12" y1="18" x2="16" y2="18" />
            </svg>
            <span className="header-calc-label">Calculator</span>
          </button>

          {/* AI Assistant Header Button (Owner / Admin Only) with Custom Outline */}
          {isAdmin && (
            <AiHeaderButton
              onClick={() => window.dispatchEvent(new CustomEvent('toggle-agent-chat'))}
              isDark={isDark}
            />
          )}

          {/* Calculator Dropdown (Premium 24px Glassmorphism & High-Contrast Display) */}
          {showCalculator && (
            <div
              ref={calcRef}
              style={{
                position: 'absolute',
                top: 'calc(100% + 12px)',
                left: 0,
                zIndex: 9999,
                width: '272px',
                borderRadius: '24px',
                background: 'var(--bg-primary, #18191D)',
                border: '1.5px solid var(--glass-border, rgba(255, 255, 255, 0.12))',
                boxShadow: '0 24px 60px -12px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.05)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                padding: '16px',
                animation: 'calcSlideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <style>{`
                  @keyframes calcSlideDown {
                    from { opacity: 0; transform: translateY(-10px) scale(0.96); }
                    to   { opacity: 1; transform: translateY(0) scale(1); }
                  }
                  .calc-btn-item {
                    transition: all 0.16s cubic-bezier(0.16, 1, 0.3, 1) !important;
                    user-select: none;
                  }
                  .calc-btn-item:active {
                    transform: scale(0.92) !important;
                  }
                  .calc-btn-item:hover {
                    filter: brightness(1.18);
                  }
                `}</style>

              {/* Display Screen */}
              <div
                style={{
                  background: 'var(--bg-secondary, #111215)',
                  borderRadius: '16px',
                  padding: '12px 16px',
                  marginBottom: '12px',
                  minHeight: '74px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  justifyContent: 'flex-end',
                  gap: '4px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  overflow: 'hidden',
                  boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.4)'
                }}
              >
                <div
                  style={{
                    fontSize: '12px',
                    color: 'var(--text-tertiary, #94A3B8)',
                    minHeight: '18px',
                    wordBreak: 'break-all',
                    textAlign: 'right',
                    fontFamily: 'monospace',
                    fontWeight: 600,
                    opacity: 0.85,
                  }}
                >
                  {calcExpression}
                </div>
                <div
                  style={{
                    fontSize: calcDisplay.length > 9 ? '22px' : '28px',
                    fontWeight: 900,
                    color: calcResult !== null ? '#FF6B1A' : 'var(--text-primary, #FFFFFF)',
                    wordBreak: 'break-all',
                    textAlign: 'right',
                    fontFamily: 'monospace',
                    lineHeight: 1.1,
                    letterSpacing: '-0.03em',
                    transition: 'color 0.2s ease',
                  }}
                >
                  {calcDisplay}
                </div>
              </div>

              {/* Buttons Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                {calcRows.map((row, ri) =>
                  row.map((btn, bi) => {
                    const isOp = ['/', '*', '-', '+'].includes(btn);
                    const isClear = btn === 'C';
                    const isEq = btn === '=';
                    const isBack = btn === '⌫';
                    const isPercent = btn === '%';
                    const isSign = btn === '+/-';

                    let btnBg = 'var(--bg-secondary, #1E1F24)';
                    let btnColor = 'var(--text-primary, #F1F5F9)';
                    let btnBorder = '1px solid rgba(255, 255, 255, 0.06)';
                    let btnShadow = '0 2px 4px rgba(0,0,0,0.15)';

                    if (isEq) {
                      btnBg = 'linear-gradient(135deg, #FF6B1A 0%, #EA580C 100%)';
                      btnColor = '#FFFFFF';
                      btnBorder = 'none';
                      btnShadow = '0 4px 14px rgba(255, 107, 26, 0.4)';
                    } else if (isClear) {
                      btnBg = 'rgba(239, 68, 68, 0.14)';
                      btnColor = '#EF4444';
                      btnBorder = '1px solid rgba(239, 68, 68, 0.28)';
                    } else if (isOp) {
                      btnBg = 'rgba(255, 107, 26, 0.12)';
                      btnColor = '#FF6B1A';
                      btnBorder = '1px solid rgba(255, 107, 26, 0.25)';
                    } else if (isBack || isPercent || isSign) {
                      btnBg = 'rgba(255, 255, 255, 0.05)';
                      btnColor = 'var(--text-secondary, #CBD5E1)';
                      btnBorder = '1px solid rgba(255, 255, 255, 0.08)';
                    }

                    return (
                      <button
                        key={`${ri}-${bi}`}
                        type="button"
                        className="calc-btn-item"
                        onClick={() => calcHandleSpecial(btn)}
                        style={{
                          height: '46px',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          fontSize: isOp || isEq ? '18px' : '15px',
                          fontWeight: isOp || isClear || isEq ? 850 : 650,
                          fontFamily: !isOp && !isClear && !isBack && !isSign && !isPercent ? 'monospace' : 'inherit',
                          background: btnBg,
                          color: btnColor,
                          border: btnBorder,
                          boxShadow: btnShadow,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {btn}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Center - Title (True Center Aligned with InfoOS Logo Symbol) */}
        <div className="header-center-branding" style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          maxWidth: 'calc(100% - 500px)',
          pointerEvents: 'none',
          zIndex: 1,
        }}>
          <h1
            style={{
              fontSize: 'calc(1.35rem * var(--display-zoom))',
              fontWeight: 'var(--font-semibold)',
              letterSpacing: '0.3px',
              color: 'var(--primary-500)',
              textShadow: '0 0 12px rgba(249,115,22,0.25)',
              margin: 0,
              cursor: 'default',
              transition: 'opacity var(--transition-normal) var(--ease-out)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              pointerEvents: 'auto',
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
          >
            <img
              src={infoosLogo}
              alt="InfoOS"
              style={{
                width: 'calc(24px * var(--display-zoom))',
                height: 'calc(24px * var(--display-zoom))',
                objectFit: 'contain',
                flexShrink: 0,
                filter: 'drop-shadow(0 2px 6px rgba(249, 115, 22, 0.35))'
              }}
            />
            <span className="header-brand-name">InfoOS</span>
            <span className="header-shop-subtitle" style={{
              fontSize: 'calc(0.85rem * var(--display-zoom))',
              fontWeight: 'var(--font-normal)',
              color: 'var(--text-secondary)',
              opacity: 0.65,
              marginLeft: '4px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              ({settings.shop_name || 'Burger Bhau'})
            </span>
          </h1>
        </div>

        {/* Right Side - Date & Theme */}
        <div className="header-right-group" style={{
          width: 'auto',
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 'var(--spacing-4)',
          flexShrink: 0
        }}>
          {/* Date Chip */}
          <div
            className="rounded-pill header-date-chip"
            style={{
              height: 'calc(42px * var(--display-zoom))',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 calc(16px * var(--display-zoom))',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--glass-border)',
              fontSize: 'calc(13px * var(--display-zoom))',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              cursor: 'default',
              transition: 'all 0.2s ease',
              backdropFilter: 'var(--glass-blur)',
              WebkitBackdropFilter: 'var(--glass-blur)',
              boxShadow: 'var(--shadow-sm)',
              whiteSpace: 'nowrap',
              gap: 'calc(8px * var(--display-zoom))',
              flexShrink: 0
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--glass-header)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
          >
            <IoCalendarOutline size={16} style={{ opacity: 0.7 }} />
            <span className="header-date-text-full">{todayLabel}</span>
            <span className="header-date-text-short">{todayLabel.replace(/^[A-Za-z]+,\s*/, '')}</span>
          </div>

          {/* Notification & Theme */}
          <div style={{ display: 'flex', gap: '8px', position: 'relative' }}>
            {/* Owner/Worker pill toggle */}
            <div
              className="header-role-switch"
              title={isAdmin ? 'Admin mode active' : 'Worker mode active'}
              style={{
                position: 'relative',
                width: 'calc(240px * var(--display-zoom))',
                height: 'calc(42px * var(--display-zoom))',
                borderRadius: 'calc(48px * var(--display-zoom))',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--glass-border)',
                backdropFilter: 'var(--glass-blur)',
                WebkitBackdropFilter: 'var(--glass-blur)',
                display: 'flex',
                alignItems: 'center',
                padding: 'calc(4px * var(--display-zoom))',
                boxShadow: 'var(--shadow-card)',
                flexShrink: 0
              }}
            >
              {/* Sliding Indicator (CSS-transition driven for zoom scaling correctness) */}
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(4px * var(--display-zoom))',
                  left: isAdmin ? 'calc(4px * var(--display-zoom))' : 'calc(50% + 1px)',
                  width: 'calc(50% - calc(5px * var(--display-zoom)))',
                  height: 'calc(34px * var(--display-zoom))',
                  borderRadius: 'calc(48px* var(--display-zoom))',
                  background: 'var(--primary-500)',
                  boxShadow: '0 4px 12px rgba(249, 115, 22, 0.2)',
                  zIndex: 1,
                  transition: 'left 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
              />

              <button
                onClick={() => {
                  if (!isAdmin) openUnlock(pendingPath || null);
                }}
                style={{
                  position: 'relative',
                  zIndex: 2,
                  flex: 1,
                  height: '100%',
                  border: 'none',
                  borderRadius: 'calc(48px* var(--display-zoom))',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: 'calc(13px * var(--display-zoom))',
                  fontWeight: 700,
                  color: isAdmin ? 'var(--text-inverse)' : 'var(--text-tertiary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 'calc(6px * var(--display-zoom))',
                  transition: 'color 0.2s ease',
                }}
              >
                <IoShieldCheckmarkOutline size={16} />
                Owner
              </button>

              <button
                onClick={() => {
                  if (isAdmin) {
                    lockToWorker();
                    navigate('/');
                  }
                }}
                style={{
                  position: 'relative',
                  zIndex: 2,
                  flex: 1,
                  height: '100%',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: 'calc(13px * var(--display-zoom))',
                  borderRadius: 'calc(48px* var(--display-zoom))',
                  fontWeight: 700,
                  color: !isAdmin ? 'var(--text-inverse)' : 'var(--text-tertiary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 'calc(6px * var(--display-zoom))',
                  transition: 'color 0.2s ease',
                }}
              >
                <IoPersonOutline size={16} />
                Worker
              </button>
            </div>

            {/* Notification Center Bell Button */}
            <button
              id="infoos-notification-bell-btn"
              onClick={toggleCenter}
              className="rounded-lg"
              style={{
                width: 'calc(40px * var(--display-zoom))',
                height: 'calc(40px * var(--display-zoom))',
                border: unreadCount > 0
                  ? (isDark ? '1.5px solid rgba(255, 150, 40, 0.75)' : '1.5px solid #FF8A00')
                  : (isDark ? '1px solid var(--glass-border)' : '1px solid #CBD5E1'),
                background: unreadCount > 0
                  ? (isDark
                    ? 'linear-gradient(135deg, rgba(255, 140, 30, 0.28) 0%, rgba(255, 100, 0, 0.14) 50%, rgba(180, 60, 0, 0.24) 100%)'
                    : '#FFF7ED')
                  : (isDark ? 'var(--glass-card)' : '#FFFFFF'),
                color: unreadCount > 0 ? '#FF7A00' : (isDark ? 'var(--text-primary)' : '#475569'),
                boxShadow: unreadCount > 0
                  ? (isDark
                    ? '0 0 16px rgba(255, 122, 0, 0.55), 0 0 32px rgba(255, 122, 0, 0.25), inset 0 1.5px 2px rgba(255, 255, 255, 0.4), inset 0 -2px 5px rgba(0, 0, 0, 0.4)'
                    : '0 2px 8px rgba(249, 115, 22, 0.18)')
                  : (isDark ? 'none' : '0 1px 2px rgba(15, 23, 42, 0.04)'),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                position: 'relative',
                transform: unreadCount > 0 ? 'translateY(-1px)' : 'none',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                if (unreadCount > 0) {
                  e.currentTarget.style.transform = 'translateY(-2px) scale(1.03)';
                  e.currentTarget.style.boxShadow = isDark
                    ? '0 0 20px rgba(255, 122, 0, 0.75), 0 0 36px rgba(255, 122, 0, 0.35)'
                    : '0 4px 12px rgba(249, 115, 22, 0.28)';
                  if (!isDark) e.currentTarget.style.background = '#FFEDD5';
                } else {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  if (!isDark) {
                    e.currentTarget.style.background = '#F8FAFC';
                    e.currentTarget.style.borderColor = '#94A3B8';
                  }
                }
              }}
              onMouseLeave={(e) => {
                if (unreadCount > 0) {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = isDark
                    ? '0 0 16px rgba(255, 122, 0, 0.55), 0 0 32px rgba(255, 122, 0, 0.25), inset 0 1.5px 2px rgba(255, 255, 255, 0.4), inset 0 -2px 5px rgba(0, 0, 0, 0.4)'
                    : '0 2px 8px rgba(249, 115, 22, 0.18)';
                  if (!isDark) e.currentTarget.style.background = '#FFF7ED';
                } else {
                  e.currentTarget.style.transform = 'translateY(0)';
                  if (!isDark) {
                    e.currentTarget.style.background = '#FFFFFF';
                    e.currentTarget.style.borderColor = '#CBD5E1';
                  }
                }
              }}
              title={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
            >
              {unreadCount > 0 ? (
                <IoNotifications
                  size={20}
                  style={{
                    color: isDark ? '#FF7A00' : '#FF6B00',
                    filter: isDark ? 'drop-shadow(0 0 6px rgba(255, 122, 0, 0.7))' : 'none',
                    transition: 'all 0.2s ease',
                  }}
                />
              ) : (
                <IoNotificationsOutline
                  size={20}
                  style={{
                    color: isDark ? 'var(--text-primary)' : '#475569',
                    transition: 'all 0.2s ease',
                  }}
                />
              )}
            </button>

            <button
              onClick={toggleTheme}
              className="rounded-lg"
              style={{
                width: 'calc(40px * var(--display-zoom))',
                height: 'calc(40px * var(--display-zoom))',
                padding: 0,
                background: isDark ? 'var(--glass-card)' : '#FFFFFF',
                color: isDark ? 'var(--text-primary)' : '#334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                border: isDark ? '1px solid var(--glass-border)' : '1px solid #CBD5E1',
                boxShadow: isDark ? 'none' : '0 1px 2px rgba(15, 23, 42, 0.04)',
                transition: 'all var(--transition-normal) var(--ease-out)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                if (!isDark) {
                  e.currentTarget.style.background = '#F8FAFC';
                  e.currentTarget.style.borderColor = '#94A3B8';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                if (!isDark) {
                  e.currentTarget.style.background = '#FFFFFF';
                  e.currentTarget.style.borderColor = '#CBD5E1';
                }
              }}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDark ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1E293B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{
        flex: 1,
        display: 'flex', // Enable flex for children to stretch
        flexDirection: 'column',
        minHeight: 0,
        margin: 0,
        padding: 0,
        overflow: 'hidden', // Disable global scroll, handle per-screen
        position: 'relative'
      }}>
        <Routes>
          <Route path="/" element={<WorkingPOSInterface key={posKey} onBillCreated={handleBillCreated} />} />
          <Route path="/live" element={<LiveOrders />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/inventory" element={<AdminRoute><Inventory /></AdminRoute>} />
          <Route path="/management" element={<AdminRoute><ProductManagement /></AdminRoute>} />

          {/* Worker Routes */}
          <Route path="/workers" element={<AdminRoute><WorkersDashboard /></AdminRoute>} />
          <Route path="/workers/list" element={<AdminRoute><WorkerList /></AdminRoute>} /> {/* Optional alias if needed, but dashboard is main entry */}
          <Route path="/workers/:id" element={<AdminRoute><WorkerProfile /></AdminRoute>} />
          <Route path="/workers/attendance" element={<AdminRoute><Attendance /></AdminRoute>} />
          <Route path="/workers/salary" element={<AdminRoute><SalaryManager /></AdminRoute>} />

          <Route path="/expenses" element={<AdminRoute><Expenses /></AdminRoute>} />
          <Route path="/reminders" element={<Reminders />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<WorkingPOSInterface key={posKey} onBillCreated={handleBillCreated} />} />
        </Routes>
      </main>




      {/* Global Notification System */}
      <NotificationSystem />

      {/* Global Ringing Reminder Alert Overlay */}
      <ReminderAlert />

      {/* Global Notification Center Drawer */}
      <NotificationCenterDrawer />

      {/* Global Admin Unlock Modal */}
      <AdminUnlockModal />

      {/* Global Update Notification */}
      <UpdateNotification />

      {/* Global Admin Agentic AI Assistant */}
      <AgentChatPanel />
      {showAttendancePrompt && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: isDark ? 'rgba(8, 9, 13, 0.72)' : 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          padding: '16px'
        }}>
          <div
            style={{
              padding: '28px 30px',
              maxWidth: '440px',
              width: '100%',
              borderRadius: '24px',
              border: isDark ? '1px solid rgba(255, 107, 26, 0.25)' : '1.5px solid #E2E8F0',
              background: isDark ? 'linear-gradient(165deg, #161A26 0%, #0E1018 100%)' : '#FFFFFF',
              boxShadow: isDark
                ? '0 24px 60px -10px rgba(0, 0, 0, 0.8), 0 0 30px rgba(255, 107, 26, 0.08)'
                : '0 20px 50px -10px rgba(15, 23, 42, 0.15), 0 0 1px 1px rgba(0, 0, 0, 0.04)',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              marginBottom: '16px'
            }}>
              <div style={{
                width: '50px',
                height: '50px',
                borderRadius: '16px',
                background: isDark ? 'rgba(255, 107, 26, 0.15)' : '#FFF7ED',
                border: isDark ? '1px solid rgba(255, 107, 26, 0.3)' : '1.5px solid #FDBA74',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 4px 12px rgba(255, 107, 26, 0.15)'
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div>
                <h2 style={{
                  margin: 0,
                  color: isDark ? '#FFFFFF' : '#0F172A',
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  lineHeight: '1.3'
                }}>
                  Mark Attendance?
                </h2>
                <p style={{
                  margin: '2px 0 0 0',
                  color: '#EA580C',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em'
                }}>
                  Daily Reminder
                </p>
              </div>
            </div>
            <p style={{
              color: isDark ? '#94A3B8' : '#475569',
              fontSize: '0.92rem',
              lineHeight: '1.6',
              margin: '0 0 24px 0',
              fontWeight: 500
            }}>
              You haven't marked worker attendance for today yet. Would you like to do it now?
            </p>
            <div style={{
              display: 'flex',
              gap: '10px',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => setShowAttendancePrompt(false)}
                style={{
                  padding: '10px 20px',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  borderRadius: '12px',
                  border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1.5px solid #CBD5E1',
                  background: isDark ? 'rgba(255, 255, 255, 0.04)' : '#F8FAFC',
                  color: isDark ? '#E2E8F0' : '#475569',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                Later
              </button>
              <button
                onClick={() => {
                  setShowAttendancePrompt(false);
                  navigate('/workers/attendance');
                }}
                style={{
                  background: 'linear-gradient(135deg, #FF6B1A 0%, #EA580C 100%)',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '10px 22px',
                  fontSize: '0.88rem',
                  fontWeight: 800,
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(255, 107, 26, 0.35)',
                  transition: 'all 0.15s ease'
                }}
              >
                Yes, Mark Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Salary Day Notification */}
      {salaryNotification && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: isDark ? 'rgba(8, 9, 13, 0.72)' : 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          padding: '16px'
        }}>
          <div
            style={{
              padding: '28px 30px',
              maxWidth: '440px',
              width: '100%',
              borderRadius: '24px',
              border: isDark ? '1px solid rgba(16, 185, 129, 0.25)' : '1.5px solid #E2E8F0',
              background: isDark ? 'linear-gradient(165deg, #161A26 0%, #0E1018 100%)' : '#FFFFFF',
              boxShadow: isDark
                ? '0 24px 60px -10px rgba(0, 0, 0, 0.8), 0 0 30px rgba(16, 185, 129, 0.08)'
                : '0 20px 50px -10px rgba(15, 23, 42, 0.15), 0 0 1px 1px rgba(0, 0, 0, 0.04)',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              marginBottom: '16px'
            }}>
              <div style={{
                width: '50px',
                height: '50px',
                borderRadius: '16px',
                background: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
                border: isDark ? '1px solid rgba(16, 185, 129, 0.3)' : '1.5px solid #A7F3D0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.15)'
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                  <line x1="2" y1="10" x2="22" y2="10" />
                </svg>
              </div>
              <div>
                <h2 style={{
                  margin: 0,
                  color: isDark ? '#FFFFFF' : '#0F172A',
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  lineHeight: '1.3'
                }}>
                  It's Salary Day!
                </h2>
                <p style={{
                  margin: '2px 0 0 0',
                  color: '#059669',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em'
                }}>
                  Monthly Reminder
                </p>
              </div>
            </div>
            <p style={{
              color: isDark ? '#94A3B8' : '#475569',
              fontSize: '0.92rem',
              lineHeight: '1.6',
              margin: '0 0 24px 0',
              fontWeight: 500
            }}>
              Today is designated salary day. Would you like to review and process worker salaries now?
            </p>
            <div style={{
              display: 'flex',
              gap: '10px',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => setSalaryNotification(false)}
                style={{
                  padding: '10px 20px',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  borderRadius: '12px',
                  border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1.5px solid #CBD5E1',
                  background: isDark ? 'rgba(255, 255, 255, 0.04)' : '#F8FAFC',
                  color: isDark ? '#E2E8F0' : '#475569',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                Later
              </button>
              <button
                onClick={() => {
                  setSalaryNotification(false);
                  navigate('/workers/salary');
                }}
                style={{
                  background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '10px 22px',
                  fontSize: '0.88rem',
                  fontWeight: 800,
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                  transition: 'all 0.15s ease'
                }}
              >
                Process Salaries
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Reminder Alarm Modal */}
      <ReminderAlert />

      {/* Exciting Order Milestone Celebration Modal & Confetti */}
      <OrderCelebrationModal />

      {/* Offline Badge */}
      <OfflineBadge />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AlertProvider>
          <SettingsProvider>
            <NetworkProvider>
              <POSDataProvider>
                <NotificationProvider>
                  <ReminderProvider>
                    <HashRouter>
                      <AuthProvider>
                        <LicensingGate>
                          <AppContent />
                        </LicensingGate>
                      </AuthProvider>
                    </HashRouter>
                  </ReminderProvider>
                </NotificationProvider>
              </POSDataProvider>
            </NetworkProvider>
          </SettingsProvider>
        </AlertProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

