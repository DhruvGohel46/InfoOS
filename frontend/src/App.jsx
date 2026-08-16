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
import './styles/fonts.css';
import './styles/global.css';

// Import screens
import WorkingPOSInterface from './components/screens/Bill';
import Analytics from './components/screens/Analytics';
import ProductManagement from './components/screens/Management';
import Inventory from './components/screens/Inventory';
import Expenses from './components/screens/Expenses';
import Settings from './components/screens/Settings';
import NotificationSystem from './components/system/NotificationSystem';
import { AuthProvider, useAuth } from './context/AuthContext';
import AdminUnlockModal from './components/system/AdminUnlockModal';
import AdminRoute from './components/system/AdminRoute';
import AgentChatPanel from './components/agents/AgentChatPanel';

// Worker Pages
// Worker Pages
import WorkersDashboard from './components/workers/WorkersPage';
import WorkerList from './components/workers/WorkerList';
import WorkerProfile from './components/workers/WorkerProfile';
import Attendance from './components/workers/Attendance';
import SalaryManager from './components/workers/SalaryManager';
import { workerAPI } from './api/workers';

// Reminders
import { ReminderProvider } from './context/ReminderContext';
import { NotificationProvider, useNotifications } from './context/NotificationContext';
import NotificationCenterDrawer from './components/system/NotificationCenterDrawer';
import Reminders from './components/screens/Reminders';
import { IoAlarmOutline, IoShieldCheckmarkOutline, IoPersonOutline, IoCalendarOutline, IoSparkles } from 'react-icons/io5';

// Offline Sync
import { NetworkProvider, useNetwork } from './context/NetworkContext';
import OfflineBadge from './components/ui/OfflineBadge';
import { syncService } from './api/sync';

// POS Data Bootstrap (load-once pattern)
import { POSDataProvider, usePOSData } from './context/POSDataContext';

// Import UI components
import Button from './components/ui/Button';
import Sidebar from './components/ui/Sidebar';

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
    } catch (_) {}
  }, [_location, checkCatalogVersion]);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [posKey, setPosKey] = useState(0);
  const notificationRef = React.useRef(null);

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
      } catch {}
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
      } catch {}
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

  // Initial Stock Check
  useEffect(() => {
    // Small delay to ensure backend is ready and settings loaded
    const timer = setTimeout(() => {
      if (notificationRef.current) {
        notificationRef.current.checkStock();
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

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

  const workerNavItems = adminNavItems.filter((item) =>
    ['pos', 'summary', 'reminders'].includes(item.id)
  );

  const workerAllowedPaths = new Set(['/', '/analytics', '/reminders']);

  const navItems = isAdmin ? adminNavItems : workerNavItems;

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
  };

  return (
    <div style={{
      height: 'var(--viewport-height, 100vh)',
      display: 'flex',
      backgroundColor: 'transparent',
      color: currentTheme.colors.text.primary,
      fontFamily: currentTheme.typography.fontFamily.primary,
      overflow: 'hidden',
    }}>
      {/* Global API Error → Toast bridge */}
      <ApiErrorListener />

      {/* Search Sidebar */}
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        toggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        navItems={navItems}
        onNavigate={(item) => {
          if (!isAdmin && !workerAllowedPaths.has(item.path)) {
            openUnlock(item.path);
            navigate('/');
            return;
          }
          navigate(item.path);
        }}
      />

      {/* Main Content Area */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        position: 'relative'
      }}>
        <header
          className="glass-header"
          style={{
            height: 'var(--header-height)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 var(--spacing-6)',
            zIndex: 2000,
            flexShrink: 0,
            transition: 'filter var(--transition-normal) var(--ease-out)',
          }}
        >
          {/* Left Side - New Bill Button + Calculator */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px', width: 'auto' }} ref={calcRef}>
            <button
              onClick={() => {
                setPosKey(prev => prev + 1);
                navigate('/', { replace: true, state: {} });
              }}
              className="liquid-glass-button"
              style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--font-medium)',
                flexShrink: 0,
              }}
            >
              Start New Bill
            </button>

            {/* Calculator Toggle Button */}
            <button
              id="calc-toggle-btn"
              onClick={() => setShowCalculator(prev => !prev)}
              title="Calculator (Alt)"
              className="liquid-glass-button"
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
                <rect x="2" y="3" width="20" height="18" rx="2"/>
                <line x1="8" y1="10" x2="8" y2="10"/>
                <line x1="12" y1="10" x2="12" y2="10"/>
                <line x1="16" y1="10" x2="16" y2="10"/>
                <line x1="8" y1="14" x2="8" y2="14"/>
                <line x1="12" y1="14" x2="12" y2="14"/>
                <line x1="16" y1="14" x2="16" y2="14"/>
                <line x1="8" y1="18" x2="8" y2="18"/>
                <line x1="12" y1="18" x2="16" y2="18"/>
              </svg>
              Calculator
            </button>

            {/* AI Assistant Header Button (Owner / Admin Only) */}
            {isAdmin && (
              <button
                id="header-ai-btn"
                onClick={() => window.dispatchEvent(new CustomEvent('toggle-agent-chat'))}
                title="Ask InfoOS AI Assistant"
                className="liquid-glass-button"
                style={{
                  background: 'rgba(249,115,22,0.14)',
                  border: '1px solid rgba(249,115,22,0.4)',
                  color: '#F97316',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 'var(--font-medium)',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backdropFilter: 'var(--glass-blur)',
                  WebkitBackdropFilter: 'var(--glass-blur)',
                  boxShadow: '0 0 10px rgba(249,115,22,0.2)',
                  transition: 'all 0.2s ease',
                }}
              >
                <IoSparkles size={15} />
                <span>Ask AI</span>
              </button>
            )}

            {/* Calculator Dropdown */}
            {showCalculator && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 12px)',
                  left: 0,
                  zIndex: 9999,
                  width: '240px',
                  borderRadius: '16px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--glass-border)',
                  boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  padding: '14px',
                  animation: 'calcSlideDown 0.18s ease',
                }}
              >
                <style>{`
                  @keyframes calcSlideDown {
                    from { opacity:0; transform: translateY(-8px) scale(0.97); }
                    to   { opacity:1; transform: translateY(0) scale(1); }
                  }
                `}</style>

                {/* Display */}
                <div style={{
                  background: 'var(--bg-secondary)',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  marginBottom: '10px',
                  minHeight: '64px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  justifyContent: 'flex-end',
                  gap: '2px',
                  border: '1px solid var(--glass-border)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    fontSize: '11px',
                    color: 'var(--text-tertiary)',
                    minHeight: '16px',
                    wordBreak: 'break-all',
                    textAlign: 'right',
                    opacity: 0.7,
                  }}>{calcExpression}</div>
                  <div style={{
                    fontSize: calcDisplay.length > 10 ? '18px' : '26px',
                    fontWeight: 700,
                    color: calcResult !== null ? 'var(--primary-500)' : 'var(--text-primary)',
                    wordBreak: 'break-all',
                    textAlign: 'right',
                    transition: 'color 0.2s ease',
                    letterSpacing: '-0.5px',
                  }}>{calcDisplay}</div>
                </div>

                {/* Buttons Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                  {calcRows.map((row, ri) =>
                    row.map((btn, bi) => {
                      const isOp = ['/', '*', '-', '+', '='].includes(btn);
                      const isClear = btn === 'C';
                      const isEq = btn === '=';
                      const isZero = btn === '0';
                      return (
                        <button
                          key={`${ri}-${bi}`}
                          onClick={() => calcHandleSpecial(btn)}
                          style={{
                            gridColumn: isZero ? 'span 1' : undefined,
                            height: '48px',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            fontSize: '16px',
                            fontWeight: isOp || isClear ? 700 : 500,
                            background: isEq
                              ? 'var(--primary-500)'
                              : isClear
                              ? 'rgba(239,68,68,0.15)'
                              : isOp
                              ? 'rgba(249,115,22,0.12)'
                              : 'var(--bg-secondary)',
                            color: isEq
                              ? '#fff'
                              : isClear
                              ? '#ef4444'
                              : isOp
                              ? 'var(--primary-400)'
                              : 'var(--text-primary)',
                            border: isEq ? 'none' : '1px solid var(--glass-border)',
                            transition: 'all 0.15s ease',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.filter = 'brightness(1.2)';
                            e.currentTarget.style.transform = 'scale(1.04)';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.filter = '';
                            e.currentTarget.style.transform = '';
                          }}
                          onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.96)'; }}
                          onMouseUp={e => { e.currentTarget.style.transform = 'scale(1.04)'; }}
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

          {/* Center - Title */}
          <div style={{
            flex: 1,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
          }}>
            <h1
              style={{
                fontSize: 'var(--text-2xl)',
                fontWeight: 'var(--font-semibold)',
                letterSpacing: '0.3px',
                color: 'var(--primary-500)',
                textShadow: '0 0 12px rgba(249,115,22,0.25)',
                margin: 0,
                cursor: 'default',
                transition: 'opacity var(--transition-normal) var(--ease-out)',
                display: 'flex',
                alignItems: 'center'
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.85'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
            >
              InfoOS
              <span style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--font-normal)',
                color: 'var(--text-secondary)',
                opacity: 0.65,
                marginLeft: 'var(--spacing-2)'
              }}>
                ({settings.shop_name || 'Burger Bhau'})
              </span>
            </h1>
          </div>

          {/* Right Side - Date & Theme */}
          <div style={{
            width: '300px',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 'var(--spacing-4)'
          }}>
            {/* Date Chip */}
            <div
              className="rounded-pill"
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
                gap: 'calc(8px * var(--display-zoom))'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--glass-header)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
            >
              <IoCalendarOutline size={16} style={{ opacity: 0.7 }} />
              <span>{todayLabel}</span>
            </div>

              {/* Notification & Theme */}
            <div style={{ display: 'flex', gap: '8px', position: 'relative' }}>
              {/* Redesigned Owner/Worker pill toggle */}
              <div
                title={isAdmin ? 'Admin mode active' : 'Worker mode active'}
                style={{
                  position: 'relative',
                  width: 'calc(240px * var(--display-zoom))',
                  height: 'calc(42px * var(--display-zoom))',
                  borderRadius: 'calc(12px * var(--display-zoom))',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--glass-border)',
                  backdropFilter: 'var(--glass-blur)',
                  WebkitBackdropFilter: 'var(--glass-blur)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 'calc(4px * var(--display-zoom))',
                  boxShadow: 'var(--shadow-card)',
                }}
              >
                {/* Sliding Indicator (CSS-transition driven for zoom scaling correctness) */}
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(4px * var(--display-zoom))',
                    left: isAdmin ? 'calc(4px * var(--display-zoom))' : 'calc(120px * var(--display-zoom))',
                    width: 'calc(116px * var(--display-zoom))',
                    height: 'calc(34px * var(--display-zoom))',
                    borderRadius: 'calc(8px * var(--display-zoom))',
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
                  border: '1px solid var(--glass-border)',
                  backgroundImage: 'var(--glass-card)',
                  color: unreadCount > 0 ? '#FF7A00' : 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'all 0.2s',
                }}
                title="Open Notification Center"
              >
                <IoAlarmOutline size={22} className={unreadCount > 0 ? 'ringing' : ''} />
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: '-4px',
                    right: '-4px',
                    width: '18px',
                    height: '18px',
                    background: '#FF7A00',
                    color: '#FFFFFF',
                    borderRadius: '50%',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 0 12px rgba(255, 122, 0, 0.5)'
                  }}>
                    {unreadCount}
                  </span>
                )}
              </button>

              <button
                onClick={toggleTheme}
                className="rounded-lg"
                style={{
                  width: 'calc(40px * var(--display-zoom))',
                  height: 'calc(40px * var(--display-zoom))',
                  padding: 0,
                  backgroundImage: 'var(--glass-card)',
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  backdropFilter: 'var(--glass-blur)',
                  WebkitBackdropFilter: 'var(--glass-blur)',
                  border: '1px solid var(--glass-border)',
                  transition: 'all var(--transition-normal) var(--ease-out)',
                }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundImage = 'var(--glass-header)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundImage = 'var(--glass-card)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              {isDark ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
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


      </div> {/* End Main Content Area */}

      {/* Global Notification System */}
      <NotificationSystem ref={notificationRef} />

      {/* Global Notification Center Drawer */}
      <NotificationCenterDrawer />

      {/* Global Admin Unlock Modal */}
      <AdminUnlockModal />

      {/* Global Update Notification */}
      <UpdateNotification />

      {/* Global Admin Agentic AI Assistant */}
      <AgentChatPanel />

      {/* Startup Attendance Prompt */}
      <>
        {showAttendancePrompt && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)'
          }}>
            <div
              className="liquid-glass-card"
              style={{
                padding: 'var(--spacing-8)',
                maxWidth: '420px',
                width: '90%',
                borderRadius: '20px',
                border: isDark ? '1px solid rgba(255, 140, 0, 0.2)' : '1px solid rgba(255, 140, 0, 0.15)',
                background: isDark ? 'rgba(22, 26, 32, 0.8)' : 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                boxShadow: isDark ? '0 20px 40px rgba(0, 0, 0, 0.4)' : '0 20px 40px rgba(0, 0, 0, 0.08)'
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-4)',
                marginBottom: 'var(--spacing-5)'
              }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '14px',
                  background: 'rgba(255, 140, 0, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.5rem'
                }}>
                  ⏰
                </div>
                <div>
                  <h2 style={{
                    margin: 0,
                    color: 'var(--text-primary)',
                    fontSize: 'var(--text-xl)',
                    fontWeight: 'var(--font-semibold)',
                    letterSpacing: '0.2px',
                    lineHeight: '1.3'
                  }}>
                    Mark Attendance?
                  </h2>
                  <p style={{
                    margin: 'var(--spacing-1) 0 0 0',
                    color: 'var(--text-tertiary)',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 'var(--font-medium)'
                  }}>
                    Daily reminder
                  </p>
                </div>
              </div>
              <p style={{
                color: 'var(--text-secondary)',
                fontSize: 'var(--text-base)',
                lineHeight: '1.6',
                margin: '0 0 var(--spacing-6) 0',
                fontWeight: 'var(--font-normal)'
              }}>
                You haven't marked worker attendance for today yet. Would you like to do it now?
              </p>
              <div style={{
                display: 'flex',
                gap: 'var(--spacing-3)',
                justifyContent: 'flex-end'
              }}>
                <Button
                  variant="ghost"
                  onClick={() => setShowAttendancePrompt(false)}
                  style={{
                    padding: 'var(--spacing-3) var(--spacing-5)',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 'var(--font-medium)',
                    borderRadius: 'var(--radius-lg)'
                  }}
                >
                  Later
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    setShowAttendancePrompt(false);
                    navigate('/workers/attendance');
                  }}
                  style={{
                    background: 'var(--primary-500)',
                    border: 'none',
                    borderRadius: 'var(--radius-lg)',
                    padding: 'var(--spacing-3) var(--spacing-5)',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 'var(--font-semibold)',
                    boxShadow: '0 4px 12px rgba(255, 106, 0, 0.25)'
                  }}
                >
                  Yes, Mark Now
                </Button>
              </div>
            </div>
          </div>
        )}
      </>

      {/* Salary Day Notification */}
      <>
        {salaryNotification && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)'
          }}>
            <div
              className="liquid-glass-card"
              style={{
                padding: 'var(--spacing-8)',
                maxWidth: '420px',
                width: '90%',
                borderRadius: '20px',
                border: isDark ? '1px solid rgba(76, 175, 80, 0.2)' : '1px solid rgba(76, 175, 80, 0.15)',
                background: isDark ? 'rgba(22, 26, 32, 0.8)' : 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                boxShadow: isDark ? '0 20px 40px rgba(0, 0, 0, 0.4)' : '0 20px 40px rgba(0, 0, 0, 0.08)'
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-4)',
                marginBottom: 'var(--spacing-5)'
              }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '14px',
                  background: 'rgba(76, 175, 80, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.5rem'
                }}>
                  💰
                </div>
                <div>
                  <h2 style={{
                    margin: 0,
                    color: 'var(--text-primary)',
                    fontSize: 'var(--text-xl)',
                    fontWeight: 'var(--font-semibold)',
                    letterSpacing: '0.2px',
                    lineHeight: '1.3'
                  }}>
                    It's Salary Day!
                  </h2>
                  <p style={{
                    margin: 'var(--spacing-1) 0 0 0',
                    color: 'var(--text-tertiary)',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 'var(--font-medium)'
                  }}>
                    Monthly reminder
                  </p>
                </div>
              </div>
              <p style={{
                color: 'var(--text-secondary)',
                fontSize: 'var(--text-base)',
                lineHeight: '1.6',
                margin: '0 0 var(--spacing-6) 0',
                fontWeight: 'var(--font-normal)'
              }}>
                Today is designated salary day. Would you like to review and process worker salaries now?
              </p>
              <div style={{
                display: 'flex',
                gap: 'var(--spacing-3)',
                justifyContent: 'flex-end'
              }}>
                <Button
                  variant="ghost"
                  onClick={() => setSalaryNotification(false)}
                  style={{
                    padding: 'var(--spacing-3) var(--spacing-5)',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 'var(--font-medium)',
                    borderRadius: 'var(--radius-lg)'
                  }}
                >
                  Later
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    setSalaryNotification(false);
                    navigate('/workers/salary');
                  }}
                  style={{
                    background: 'var(--success-500)',
                    border: 'none',
                    borderRadius: 'var(--radius-lg)',
                    padding: 'var(--spacing-3) var(--spacing-5)',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 'var(--font-semibold)',
                    boxShadow: '0 4px 12px rgba(76, 175, 80, 0.25)'
                  }}
                >
                  Go to Salary Manager
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Global Reminders are now integrated into NotificationSystem */}
        
        {/* Offline Badge */}
        <OfflineBadge />

        {/* Auto-Updater Notification */}
        <UpdateNotification />

        {/* Centralized Notification Center Drawer */}
        <NotificationCenterDrawer />
      </>
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

