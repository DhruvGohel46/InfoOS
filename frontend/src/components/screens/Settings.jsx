import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSettings } from '../../context/SettingsContext';
import { useAlert as useToast } from '../../context/AlertContext';
import { useTheme } from '../../context/ThemeContext';
import '../../styles/Settings.css';
import '../../styles/typography.css'; // Import typography system
import Dropdown from '../ui/Dropdown';
import GlobalTimePicker from '../ui/GlobalTimePicker';
import GlobalDatePicker from '../ui/GlobalDatePicker';
import Card from '../ui/Card'; // Import Shared Card Component
import PageContainer from '../layout/PageContainer';
import Button from '../ui/Button';
import {
    IoStorefrontOutline,
    IoCardOutline,
    IoPrintOutline,
    IoAppsOutline,
    IoPeopleOutline,
    IoBusinessOutline,
    IoReceiptOutline,
    IoHardwareChipOutline,
    IoColorPaletteOutline,
    IoShieldCheckmarkOutline,
    IoVolumeHighOutline,
    IoCloudUploadOutline
} from 'react-icons/io5';
import { settingsAPI } from '../../api/settings';
import { getLocalDateString } from '../../utils/api';
import { setupPin, getAuthStatus, resetPin } from '../../api/auth';
import { cloudSyncAPI, setCloudAuthToken, cloudLicenseAPI } from '../../api/cloudApi';
import api, { summaryAPI } from '../../utils/api';
import { expensesAPI } from '../../api/expenses';
import { workerAPI } from '../../api/workers';


const Settings = () => {
    const { showSuccess, showError, showConfirm } = useToast();
    const { isDark } = useTheme();
    const { settings: globalSettings, loading, updateSettings } = useSettings();
    const location = useLocation();

    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState(() => {
        if (location.state?.tab) return location.state.tab;
        const params = new URLSearchParams(location.search);
        return params.get('tab') || 'shop';
    });
    // eslint-disable-next-line no-unused-vars
    const [workerSubTab, setWorkerSubTab] = useState(() => {
        if (location.state?.workerSubTab) return location.state.workerSubTab;
        const params = new URLSearchParams(location.search);
        return params.get('workerSubTab') || 'salary';
    });
    // eslint-disable-next-line no-unused-vars
    const [expenseSubTab, setExpenseSubTab] = useState(() => {
        if (location.state?.expenseSubTab) return location.state.expenseSubTab;
        const params = new URLSearchParams(location.search);
        return params.get('expenseSubTab') || 'types';
    });

    // Worker Types State
    const [workerTypes, setWorkerTypes] = useState([]);
    const [workerTypesLoading, setWorkerTypesLoading] = useState(false);
    const [showWorkerTypeModal, setShowWorkerTypeModal] = useState(false);
    const [workerEditMode, setWorkerEditMode] = useState(false);
    const [editingWorkerType, setEditingWorkerType] = useState(null);
    const [workerTypeForm, setWorkerTypeForm] = useState({ name: '', description: '', is_active: true });

    // Expense Types State
    const [expenseTypes, setExpenseTypes] = useState([]);
    const [expenseTypesLoading, setExpenseTypesLoading] = useState(false);
    const [showExpenseTypeModal, setShowExpenseTypeModal] = useState(false);
    const [expenseEditMode, setExpenseEditMode] = useState(false);
    const [editingExpenseType, setEditingExpenseType] = useState(null);
    const [expenseTypeForm, setExpenseTypeForm] = useState({ name: '', description: '', is_active: true });
    
    // Text scale state
    const [textScale, setTextScale] = useState(() => {
        const saved = localStorage.getItem('text_scale');
        return saved ? parseFloat(saved) : 1;
    });

    // Apply text scale to CSS variable
    useEffect(() => {
        document.documentElement.style.setProperty('--text-scale', textScale);
        localStorage.setItem('text_scale', textScale);
    }, [textScale]);

    // Display zoom state
    const [displayZoom, setDisplayZoom] = useState(() => {
        const saved = localStorage.getItem('display_zoom');
        return saved ? parseFloat(saved) : 1;
    });

    // Apply display zoom
    useEffect(() => {
        localStorage.setItem('display_zoom', displayZoom);
        if (window.electronAPI && window.electronAPI.setZoomFactor) {
            window.electronAPI.setZoomFactor(displayZoom);
            document.documentElement.style.setProperty('--display-zoom', 1);
        } else {
            document.documentElement.style.setProperty('--display-zoom', displayZoom);
        }
    }, [displayZoom]);

    // ── PIN / Security state ──────────────────────────────────────────────
    const [pinStatus, setPinStatus] = useState({ enabled: false, is_setup: false, loading: true });
    const [pinForm, setPinForm] = useState({ currentPin: '', newPin: '', confirmPin: '' });
    const [pinSaving, setPinSaving] = useState(false);

    // ── Cloud Sync & SaaS states ──────────────────────────────────────────
    const [syncingBackup, setSyncingBackup] = useState(false);
    const [syncingMonthlyBackup, setSyncingMonthlyBackup] = useState(false);
    const [cloudStatus, setCloudStatus] = useState({
        loggedIn: false,
        userId: null,
        email: '',
        subscriptionStatus: 'inactive',
        expiry: null,
        role: 'standalone',
        loading: true
    });

    // ── About & Updater State ──────────────────────────────────────────────
    const [systemInfo, setSystemInfo] = useState({
        appVersion: 'loading...',
        backendVersion: '1.0.0',
        dbSchemaVersion: 'loading...',
        latestVersion: 'unknown',
        lastChecked: null,
        updateStatus: 'idle'
    });
    const [checkingForUpdates, setCheckingForUpdates] = useState(false);

    // ── Printer Info State ──────────────────────────────────────────────────
    const [printerInfo, setPrinterInfo] = useState({
        activePrinter: '',
        availablePrinters: [],
        status: 'Unknown',
        error: null
    });
    const [printerInfoLoading, setPrinterInfoLoading] = useState(false);
    
    // Auto start on boot state
    const [autoStartEnabled, setAutoStartEnabled] = useState(false);

    useEffect(() => {
        const checkAutoStart = async () => {
            if (window.electronAPI && window.electronAPI.getAutoStart) {
                try {
                    const enabled = await window.electronAPI.getAutoStart();
                    setAutoStartEnabled(enabled);
                } catch (err) {
                    console.error('Failed to read auto-start setting:', err);
                }
            }
        };
        checkAutoStart();
    }, []);

    const handleAutoStartToggle = async (e) => {
        const val = e.target.checked;
        setAutoStartEnabled(val);
        if (window.electronAPI && window.electronAPI.setAutoStart) {
            try {
                await window.electronAPI.setAutoStart(val);
                showSuccess(`Auto-start preference updated: ${val ? 'Enabled' : 'Disabled'}`);
            } catch (err) {
                showError('Failed to change auto-start preferences');
                setAutoStartEnabled(!val); // revert
            }
        }
    };

    const loadPrinterInfo = async () => {
        setPrinterInfoLoading(true);
        try {
            const data = await settingsAPI.getPrinterInfo();
            setPrinterInfo({
                activePrinter: data.active_printer || '',
                availablePrinters: data.available_printers || [],
                status: data.status || 'Unknown',
                error: data.error || null
            });
        } catch (err) {
            console.error('Failed to load printer info:', err);
        } finally {
            setPrinterInfoLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'printer') {
            loadPrinterInfo();
        }
    }, [activeTab]);

    // Fetch local versions and updater status
    const loadSystemInfo = async () => {
        let appVer = 'unknown';
        let bVer = '1.0.0';
        let dbVer = 'initial';

        // 1. Get Electron version
        if (window.electronAPI && window.electronAPI.getAppVersion) {
            appVer = await window.electronAPI.getAppVersion();
        }

        // 2. Get backend and schema details
        try {
            const res = await api.get('/api/system/info');
            if (res.data?.success) {
                bVer = res.data.backend_version;
                dbVer = res.data.database_schema_version;
            }
        } catch (err) {
            console.error('Failed to fetch system info from backend:', err);
        }

        // 3. Get updater status
        let upState = { status: 'idle', lastChecked: null, latestVersion: 'unknown' };
        if (window.electronAPI && window.electronAPI.getUpdaterStatus) {
            try {
                upState = await window.electronAPI.getUpdaterStatus();
            } catch (upErr) {
                console.error('Failed to query updater status:', upErr);
            }
        }

        setSystemInfo({
            appVersion: appVer,
            backendVersion: bVer,
            dbSchemaVersion: dbVer,
            latestVersion: upState.latestVersion || 'unknown',
            lastChecked: upState.lastChecked,
            updateStatus: upState.status || 'idle'
        });
    };

    // Listen for updater changes
    useEffect(() => {
        if (activeTab === 'cloud') {
            loadSystemInfo();
        }
    }, [activeTab]);

    useEffect(() => {
        if (!window.electronAPI) return;

        const unsubscribeStatus = window.electronAPI.onUpdateStatusChanged((statusPayload) => {
            setSystemInfo(prev => ({
                ...prev,
                latestVersion: statusPayload.latestVersion || prev.latestVersion,
                lastChecked: statusPayload.lastChecked || prev.lastChecked,
                updateStatus: statusPayload.status || prev.updateStatus
            }));
            setCheckingForUpdates(statusPayload.status === 'checking');
        });

        return () => {
            if (unsubscribeStatus) unsubscribeStatus();
        };
    }, []);

    const handleManualCheckForUpdates = async () => {
        if (!window.electronAPI || !window.electronAPI.checkForUpdates) {
            showError('Update checking is disabled in development mode.');
            return;
        }
        setCheckingForUpdates(true);
        try {
            await window.electronAPI.checkForUpdates();
            // Safety timeout:
            setTimeout(() => setCheckingForUpdates(false), 5000);
        } catch (err) {
            showError('Manual update check failed');
            setCheckingForUpdates(false);
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'checking': return 'var(--primary-500, #3b82f6)';
            case 'available': return 'var(--warning-500, #f59e0b)';
            case 'downloading': return 'var(--primary-500, #3b82f6)';
            case 'downloaded': return 'var(--success-500, #10b981)';
            case 'error': return 'var(--error-500, #ef4444)';
            default: return 'var(--text-secondary)';
        }
    };

    const formatStatusText = (status) => {
        switch (status) {
            case 'checking': return 'Checking for updates...';
            case 'available': return 'Update available (downloading...)';
            case 'downloading': return 'Downloading update...';
            case 'downloaded': return 'Update ready (restart to apply)';
            case 'error': return 'Error checking for updates';
            default: return 'Up to date';
        }
    };

    const loadCloudProfile = async () => {
        const token = localStorage.getItem('cloud_auth_token');
        const email = localStorage.getItem('cloud_user_email') || '';
        if (!token) {
            setCloudStatus(prev => ({ ...prev, loggedIn: false, loading: false }));
            return;
        }

        setCloudStatus(prev => ({ ...prev, loading: true }));
        setCloudAuthToken(token);

        // Fetch subscription status and franchise profile independently
        // so one failure doesn't prevent the other from displaying
        let subStatus = 'inactive';
        let subExpiry = null;
        let role = 'standalone';

        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const userId = payload.sub;
            
            // Use cloudLicenseAPI for more robust subscription checking
            const subscription = await cloudLicenseAPI.getSubscription(userId, token);
            if (subscription) {
                subStatus = subscription.status || 'inactive';
                if (subscription.expiry_date) {
                    subExpiry = new Date(subscription.expiry_date).toLocaleDateString();
                }
            }
        } catch (err) {
            console.error('Failed to load subscription status:', err);
            // Fallback to cloudSyncAPI if cloudLicenseAPI fails
            try {
                const sub = await cloudSyncAPI.getSubscriptionStatus();
                subStatus = sub.subscriptionStatus || 'inactive';
                subExpiry = sub.subscriptionExpiry ? new Date(sub.subscriptionExpiry).toLocaleDateString() : null;
            } catch (fallbackErr) {
                console.error('Fallback subscription check also failed:', fallbackErr);
            }
        }

        try {
            const prof = await cloudSyncAPI.getFranchiseProfile();
            role = prof.role || 'standalone';
        } catch (err) {
            console.error('Failed to load franchise profile:', err);
        }

        let userId = null;
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            userId = payload.sub;
        } catch (e) {
            console.error('Failed to parse token payload:', e);
        }

        setCloudStatus({
            loggedIn: true,
            userId,
            email,
            subscriptionStatus: subStatus,
            expiry: subExpiry,
            role: role,
            loading: false
        });
    };

    useEffect(() => {
        loadCloudProfile();
    }, []);

    const handleManualSync = async () => {
        const token = localStorage.getItem('cloud_auth_token');
        if (!token) {
            showError('Please connect your cloud account first');
            return;
        }
        if (cloudStatus.subscriptionStatus !== 'active') {
            showError('SaaS Subscription required: Please purchase a plan on the website.');
            return;
        }

        let userId = cloudStatus.userId;
        if (!userId) {
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                userId = payload.sub;
            } catch (e) {
                console.error('Failed to parse token payload:', e);
            }
        }
        if (!userId) {
            showError('Invalid session. Please logout and log back in.');
            return;
        }

        setSyncingBackup(true);
        try {
            const todayStr = new Date().toISOString().split('T')[0];
            const summaryRes = await summaryAPI.getRangeSummary('week', todayStr);
            if (!summaryRes.data?.success) {
                throw new Error(summaryRes.data?.error || 'Failed to fetch weekly summaries');
            }

            const summary = summaryRes.data.summary;
            const weekStartStr = summary.start_date;

            // Directly sync (backend uses UPSERT to automatically replace/update the existing record)

            const expensesRes = await expensesAPI.getExpenses(200);
            const allExpenses = expensesRes.expenses || [];

            const startOfWeekTime = new Date(summary.start_date).getTime();
            const endOfWeekTime = new Date(summary.end_date).getTime() + (24 * 60 * 60 * 1000) - 1;

            const thisWeekExpenses = allExpenses.filter(e => {
                const eTime = new Date(e.date).getTime();
                return eTime >= startOfWeekTime && eTime <= endOfWeekTime;
            });

            const payload = {
                userId,
                weekStartDate: weekStartStr,
                totalSales: summary.total_sales,
                totalExpenses: summary.total_expenses,
                salesDetails: (summary.products || []).map(p => ({
                    name: p.name,
                    amount: p.total_amount
                })),
                expenseDetails: thisWeekExpenses.map(e => ({
                    name: e.title,
                    amount: e.amount
                }))
            };

            await cloudSyncAPI.syncBackup(payload);
            showSuccess(`Success! Aggregated backup for week of ${weekStartStr} synced to cloud.`);
        } catch (err) {
            console.error('Manual sync failed:', err);
            showError(err.response?.data?.error || err.message || 'Sync failed');
        } finally {
            setSyncingBackup(false);
        }
    };

    const handleMonthlySync = async () => {
        const token = localStorage.getItem('cloud_auth_token');
        if (!token) {
            showError('Offline: Please authenticate with your master franchise first.');
            return;
        }
        if (cloudStatus.subscriptionStatus !== 'active') {
            showError('SaaS Subscription required: Please purchase a plan on the website.');
            return;
        }

        let userId = cloudStatus.userId;
        if (!userId) {
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                userId = payload.sub;
            } catch (e) {
                console.error('Failed to parse token payload:', e);
            }
        }
        if (!userId) {
            showError('Invalid session. Please logout and log back in.');
            return;
        }

        setSyncingMonthlyBackup(true);
        try {
            const todayStr = new Date().toISOString().split('T')[0];
            const summaryRes = await summaryAPI.getRangeSummary('month', todayStr);
            if (!summaryRes.data?.success) {
                throw new Error(summaryRes.data?.error || 'Failed to fetch monthly summaries');
            }

            const summary = summaryRes.data.summary;
            const monthStartStr = summary.start_date;

            // Directly sync (backend uses UPSERT to automatically replace/update the existing record)

            const expensesRes = await expensesAPI.getExpenses(200);
            const allExpenses = expensesRes.expenses || [];

            const startOfMonthTime = new Date(summary.start_date).getTime();
            const endOfMonthTime = new Date(summary.end_date).getTime() + (24 * 60 * 60 * 1000) - 1;

            const thisMonthExpenses = allExpenses.filter(e => {
                const eTime = new Date(e.date).getTime();
                return eTime >= startOfMonthTime && eTime <= endOfMonthTime;
            });

            const payload = {
                userId,
                monthStartDate: monthStartStr,
                totalSales: summary.total_sales,
                totalExpenses: summary.total_expenses,
                salesDetails: (summary.products || []).map(p => ({
                    name: p.name,
                    amount: p.total_amount
                })),
                expenseDetails: thisMonthExpenses.map(e => ({
                    name: e.title,
                    amount: e.amount
                }))
            };

            await cloudSyncAPI.syncMonthlyBackup(payload);
            showSuccess(`Success! Aggregated backup for month starting ${monthStartStr} synced to cloud.`);
        } catch (err) {
            console.error('Manual monthly sync failed:', err);
            showError(err.response?.data?.error || err.message || 'Sync failed');
        } finally {
            setSyncingMonthlyBackup(false);
        }
    };

    useEffect(() => {
        getAuthStatus()
            .then(s => setPinStatus({ enabled: s.enabled, is_setup: s.is_setup, loading: false }))
            .catch(() => setPinStatus({ enabled: false, is_setup: false, loading: false }));
    }, []);

    const loadWorkerTypes = useCallback(async () => {
        setWorkerTypesLoading(true);
        try {
            const response = await workerAPI.getWorkerTypes();
            setWorkerTypes(response.worker_types || []);
        } catch (err) {
            console.error('Failed to load worker types:', err);
            showError('Failed to load worker types');
        } finally {
            setWorkerTypesLoading(false);
        }
    }, [showError]);

    const loadExpenseTypes = useCallback(async () => {
        setExpenseTypesLoading(true);
        try {
            const response = await expensesAPI.getExpenseTypes();
            setExpenseTypes(response.expense_types || []);
        } catch (err) {
            console.error('Failed to load expense types:', err);
            showError('Failed to load expense types');
        } finally {
            setExpenseTypesLoading(false);
        }
    }, [showError]);

    // Load worker types when workers tab is active
    useEffect(() => {
        if (activeTab === 'workers') {
            loadWorkerTypes();
        }
    }, [activeTab, loadWorkerTypes]);

    // Load expense types when expenses tab is active
    useEffect(() => {
        if (activeTab === 'expenses' && expenseSubTab === 'types') {
            loadExpenseTypes();
        }
    }, [activeTab, expenseSubTab, loadExpenseTypes]);

    const handleCreateWorkerType = async () => {
        if (!workerTypeForm.name.trim()) {
            showError('Worker type name is required');
            return;
        }
        try {
            await workerAPI.createWorkerType(workerTypeForm);
            showSuccess('Worker type created successfully');
            setShowWorkerTypeModal(false);
            setWorkerTypeForm({ name: '', description: '', is_active: true });
            setEditingWorkerType(null);
            loadWorkerTypes();
        } catch (err) {
            showError(err.response?.data?.error || 'Failed to create worker type');
        }
    };

    const handleUpdateWorkerType = async () => {
        if (!workerTypeForm.name.trim()) {
            showError('Worker type name is required');
            return;
        }
        try {
            await workerAPI.updateWorkerType(editingWorkerType.id, workerTypeForm);
            showSuccess('Worker type updated successfully');
            setShowWorkerTypeModal(false);
            setWorkerTypeForm({ name: '', description: '', is_active: true });
            setEditingWorkerType(null);
            loadWorkerTypes();
        } catch (err) {
            showError(err.response?.data?.error || 'Failed to update worker type');
        }
    };

    const handleDeleteWorkerType = async (id) => {
        const confirmed = await showConfirm({
            title: 'Delete Worker Type',
            description: 'Are you sure you want to delete this worker type? Workers using this type will keep their current role text.',
            confirmLabel: 'Delete',
            variant: 'danger',
        });
        if (!confirmed) return;
        try {
            await workerAPI.deleteWorkerType(id);
            showSuccess('Worker type deleted successfully');
            loadWorkerTypes();
        } catch (err) {
            showError(err.response?.data?.error || 'Failed to delete worker type');
        }
    };

    const handleCreateExpenseType = async () => {
        if (!expenseTypeForm.name.trim()) {
            showError('Expense type name is required');
            return;
        }
        try {
            await expensesAPI.createExpenseType(expenseTypeForm);
            showSuccess('Expense type created successfully');
            setShowExpenseTypeModal(false);
            setExpenseTypeForm({ name: '', description: '', is_active: true });
            setEditingExpenseType(null);
            loadExpenseTypes();
        } catch (err) {
            showError(err.response?.data?.error || 'Failed to create expense type');
        }
    };

    const handleUpdateExpenseType = async () => {
        if (!expenseTypeForm.name.trim()) {
            showError('Expense type name is required');
            return;
        }
        try {
            await expensesAPI.updateExpenseType(editingExpenseType.id, expenseTypeForm);
            showSuccess('Expense type updated successfully');
            setShowExpenseTypeModal(false);
            setExpenseTypeForm({ name: '', description: '', is_active: true });
            setEditingExpenseType(null);
            loadExpenseTypes();
        } catch (err) {
            showError(err.response?.data?.error || 'Failed to update expense type');
        }
    };

    const handleDeleteExpenseType = async (id) => {
        const confirmed = await showConfirm({
            title: 'Delete Expense Type',
            description: 'Are you sure you want to delete this expense type? Existing expenses will keep their current category text.',
            confirmLabel: 'Delete',
            variant: 'danger',
        });
        if (!confirmed) return;
        try {
            await expensesAPI.deleteExpenseType(id);
            showSuccess('Expense type deleted successfully');
            loadExpenseTypes();
        } catch (err) {
            showError(err.response?.data?.error || 'Failed to delete expense type');
        }
    };

    const openWorkerTypeModal = (type = null) => {
        if (type) {
            setEditingWorkerType(type);
            setWorkerTypeForm({
                name: type.name,
                description: type.description || '',
                is_active: type.is_active
            });
        } else {
            setEditingWorkerType(null);
            setWorkerTypeForm({ name: '', description: '', is_active: true });
        }
        setShowWorkerTypeModal(true);
    };

    const openExpenseTypeModal = (type = null) => {
        if (type) {
            setEditingExpenseType(type);
            setExpenseTypeForm({
                name: type.name,
                description: type.description || '',
                is_active: type.is_active
            });
        } else {
            setEditingExpenseType(null);
            setExpenseTypeForm({ name: '', description: '', is_active: true });
        }
        setShowExpenseTypeModal(true);
    };

    const startWorkerEditMode = () => {
        setWorkerEditMode(true);
    };

    const cancelWorkerEditMode = () => {
        setWorkerEditMode(false);
        setEditingWorkerType(null);
        setWorkerTypeForm({ name: '', description: '', is_active: true });
    };

    const startExpenseEditMode = () => {
        setExpenseEditMode(true);
    };

    const cancelExpenseEditMode = () => {
        setExpenseEditMode(false);
        setEditingExpenseType(null);
        setExpenseTypeForm({ name: '', description: '', is_active: true });
    };

    const handleInlineWorkerTypeEdit = (type) => {
        setEditingWorkerType(type);
        setWorkerTypeForm({
            name: type.name,
            description: type.description || '',
            is_active: type.is_active
        });
    };

    const handleInlineExpenseTypeEdit = (type) => {
        setEditingExpenseType(type);
        setExpenseTypeForm({
            name: type.name,
            description: type.description || '',
            is_active: type.is_active
        });
    };

    const saveInlineWorkerType = async () => {
        if (!workerTypeForm.name.trim()) {
            showError('Worker type name is required');
            return;
        }
        try {
            await workerAPI.updateWorkerType(editingWorkerType.id, workerTypeForm);
            showSuccess('Worker type updated successfully');
            setEditingWorkerType(null);
            setWorkerTypeForm({ name: '', description: '', is_active: true });
            loadWorkerTypes();
        } catch (err) {
            showError(err.response?.data?.error || 'Failed to update worker type');
        }
    };

    const saveInlineExpenseType = async () => {
        if (!expenseTypeForm.name.trim()) {
            showError('Expense type name is required');
            return;
        }
        try {
            await expensesAPI.updateExpenseType(editingExpenseType.id, expenseTypeForm);
            showSuccess('Expense type updated successfully');
            setEditingExpenseType(null);
            setExpenseTypeForm({ name: '', description: '', is_active: true });
            loadExpenseTypes();
        } catch (err) {
            showError(err.response?.data?.error || 'Failed to update expense type');
        }
    };

    const handlePinChange = (field, value) =>
        setPinForm(prev => ({ ...prev, [field]: value }));

    const handleSavePinChange = async () => {
        const { currentPin, newPin, confirmPin } = pinForm;
        if (!newPin || newPin.length < 4 || newPin.length > 6 || !/^\d+$/.test(newPin)) {
            showError('New PIN must be 4–6 numeric digits');
            return;
        }
        if (newPin !== confirmPin) {
            showError('PINs do not match');
            return;
        }
        setPinSaving(true);
        try {
            await setupPin(newPin, (pinStatus.is_setup && pinStatus.enabled) ? currentPin : null);
            showSuccess('PIN updated successfully');
            setPinForm({ currentPin: '', newPin: '', confirmPin: '' });
            setPinStatus(s => ({ ...s, is_setup: true, enabled: true }));
        } catch (err) {
            showError(err?.response?.data?.error || 'Failed to update PIN');
        } finally {
            setPinSaving(false);
        }
    };
    const handleResetPin = async () => {
        if (!window.confirm('Are you sure you want to RESET the PIN? This will disable PIN requirement and clear the current PIN.')) {
            return;
        }
        setPinSaving(true);
        try {
            await resetPin();
            showSuccess('PIN reset successfully');
            setPinForm({ currentPin: '', newPin: '', confirmPin: '' });
            setPinStatus({ enabled: false, is_setup: false, loading: false });
            // Also update formSettings to match
            handleChange('require_pin_login', 'false');
        } catch (err) {
            showError(err?.response?.data?.error || 'Failed to reset PIN');
        } finally {
            setPinSaving(false);
        }
    };
    // ────────────────────────────────────────────────────────────────────────

    const [formSettings, setFormSettings] = useState({
        // Shop
        shop_name: '',
        shop_address: '',
        shop_contact: '',
        gst_no: '',
        currency_symbol: '₹',
        shop_open_time: '',
        shop_close_time: '',

        // Billing
        bill_reset_daily: 'true',
        default_tax_rate: '0',
        tax_enabled: 'false',
        default_order_type: 'dine-in',

        // Printer
        printer_enabled: 'false',
        printer_width: '58mm',
        auto_print: 'false',

        // App
        show_product_images: 'true',
        show_all_as_favorite: 'false',
        dark_mode: 'false',
        sound_enabled: 'true',
        
        // Security
        require_pin_login: 'false',
 
        // Workers
        salary_day: '1',
 
        // Reminder Sound
        reminder_sound: 'reminder.mp3'
    });

    // Sync form with global settings when they load
    useEffect(() => {
        if (globalSettings && Object.keys(globalSettings).length > 0) {
            setFormSettings(prev => ({
                ...prev,
                ...globalSettings
            }));
        }
    }, [globalSettings]);

    const handleChange = (key, value) => {
        setFormSettings(prev => ({
            ...prev,
            [key]: value
        }));
    };

    const [uploadingSound, setUploadingSound] = useState(false);
    const handleSoundUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploadingSound(true);
        try {
            const res = await settingsAPI.uploadSound(file);
            handleChange('reminder_sound', res.filename);
            showSuccess('Sound uploaded! Click save to apply.');
        } catch (err) {
            showError(err?.response?.data?.error || 'Upload failed');
        } finally {
            setUploadingSound(false);
        }
    };

    const previewSound = () => {
        const apiUrl = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5050';
        const audio = new Audio(`${apiUrl}/api/sounds/${formSettings.reminder_sound}?v=${Date.now()}`);
        audio.play().catch(e => showError('Cannot play sound: ' + e.message));
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            let finalSettings = { ...formSettings };
            if (finalSettings.require_pin_login === 'true' && !pinStatus.is_setup) {
                finalSettings.require_pin_login = 'false';
                setFormSettings(prev => ({ ...prev, require_pin_login: 'false' }));
            }
            await updateSettings(finalSettings);
            showSuccess('Settings saved successfully');
            if (finalSettings.require_pin_login === 'false') {
                setPinStatus({ enabled: false, is_setup: false, loading: false });
                setPinForm({ currentPin: '', newPin: '', confirmPin: '' });
            }
        } catch (error) {
            showError('Failed to save settings');
            console.error(error);
        } finally {
            setSaving(false);
        }
    };

    const handleDiscard = () => {
        if (globalSettings) {
            setFormSettings(prev => ({ ...prev, ...globalSettings }));
        }
        showSuccess('Changes discarded');
    };

    const tabs = [
        { id: 'shop', label: 'Shop Details', icon: IoStorefrontOutline },
        { id: 'billing', label: 'Billing Configuration', icon: IoCardOutline },
        { id: 'printer', label: 'Printer Settings', icon: IoPrintOutline },
        { id: 'app', label: 'App Preferences', icon: IoAppsOutline },
        { id: 'workers', label: 'Worker Configuration', icon: IoPeopleOutline },
        { id: 'expenses', label: 'Expense Configuration', icon: IoReceiptOutline },
        { id: 'security', label: 'Security & Access', icon: IoShieldCheckmarkOutline },
        { id: 'cloud', label: 'Cloud Sync & About', icon: IoCloudUploadOutline }
    ];

    if (loading) {
        return <PageContainer><Card>Loading settings...</Card></PageContainer>;
    }

    return (
        <PageContainer>
            <div className="stPage">
                <div className="stStickyHeader">
                    {/* Header */}
                    <div className="stHeader">
                        <div className="stTitle">System Settings</div>
                    </div>

                    <div className="stTabs">
                        <div className="stTabList">
                            {tabs.map(tab => (
                                <button
                                    key={tab.id}
                                    className={`stTabButton ${activeTab === tab.id ? 'stTabActive' : ''}`}
                                    onClick={() => {
                                        if (activeTab === 'security' && formSettings.require_pin_login === 'true' && !pinStatus.is_setup) {
                                            handleChange('require_pin_login', 'false');
                                        }
                                        setActiveTab(tab.id);
                                    }}
                                >
                                    <tab.icon size={20} className="stTabIcon" />
                                    <span className="stTabLabel">{tab.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Using Shared Card Component for Consistency */}
                <Card
                    className="stSection"
                    padding="lg"
                    shadow="card"
                    hover={false} // Disable global hover effect
                    key={activeTab} // Retain key for animation reset on tab switch if needed
                >
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        {activeTab === 'shop' && (
                            <>
                                <div className="stSectionTitle">
                                    <IoBusinessOutline size={22} color="var(--primary)" />
                                    Store Information
                                </div>

                                <div className="stSectionContent">
                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Shop Name</span>
                                            <span className="stLabelDesc">Appears on bills and reports</span>
                                        </div>
                                        <input
                                            className="stInput"
                                            value={formSettings.shop_name || ''}
                                            onChange={(e) => handleChange('shop_name', e.target.value)}
                                            placeholder="e.g. Burger Bhau"
                                        />
                                    </div>

                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Address</span>
                                            <span className="stLabelDesc">Shop location for bill header</span>
                                        </div>
                                        <input
                                            className="stInput"
                                            value={formSettings.shop_address || ''}
                                            onChange={(e) => handleChange('shop_address', e.target.value)}
                                            placeholder="Shop address"
                                        />
                                    </div>

                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Contact Number</span>
                                            <span className="stLabelDesc">Displayed on bills</span>
                                        </div>
                                        <input
                                            className="stInput"
                                            value={formSettings.shop_contact || ''}
                                            onChange={(e) => handleChange('shop_contact', e.target.value)}
                                            placeholder="Phone number"
                                        />
                                    </div>

                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">GST / Tax ID</span>
                                            <span className="stLabelDesc">Optional tax identification number</span>
                                        </div>
                                        <input
                                            className="stInput"
                                            value={formSettings.gst_no || ''}
                                            onChange={(e) => handleChange('gst_no', e.target.value)}
                                            placeholder="GSTIN (Optional)"
                                        />
                                    </div>

                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Currency Symbol</span>
                                            <span className="stLabelDesc">Default currency for prices</span>
                                        </div>
                                        <Dropdown
                                            options={[
                                                { label: 'India (INR) - ₹', value: '₹' },
                                                { label: 'USA (USD) - $', value: '$' },
                                                { label: 'Europe (EUR) - €', value: '€' },
                                                { label: 'UK (GBP) - £', value: '£' },
                                                { label: 'Japan (JPY) - ¥', value: '¥' }
                                            ]}
                                            value={formSettings.currency_symbol || '₹'}
                                            onChange={(val) => handleChange('currency_symbol', val)}
                                            placeholder="Select Currency"
                                            className="stDropdown"
                                            zIndex={60}
                                        />
                                    </div>

                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Shop Timings</span>
                                            <span className="stLabelDesc">For automated stock alerts</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '10px', maxWidth: '440px' }}>
                                            <div style={{ flex: 1 }}>
                                                <GlobalTimePicker
                                                    value={formSettings.shop_open_time || ''}
                                                    onChange={(val) => handleChange('shop_open_time', val)}
                                                    placeholder="Open Time"
                                                />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <GlobalTimePicker
                                                    value={formSettings.shop_close_time || ''}
                                                    onChange={(val) => handleChange('shop_close_time', val)}
                                                    placeholder="Close Time"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {activeTab === 'billing' && (
                            <>
                                <div className="stSectionTitle">
                                    <IoReceiptOutline size={22} color="var(--primary)" />
                                    Billing Rules
                                </div>

                                <div className="stSectionContent">
                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Daily Bill Reset</span>
                                            <span className="stLabelDesc">Reset bill number to 1 every day</span>
                                        </div>
                                        <label className="stToggle">
                                            <input
                                                type="checkbox"
                                                checked={formSettings.bill_reset_daily === 'true'}
                                                onChange={(e) => handleChange('bill_reset_daily', e.target.checked ? 'true' : 'false')}
                                            />
                                            <span className="stSlider"></span>
                                        </label>
                                    </div>

                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Enable Tax</span>
                                            <span className="stLabelDesc">Calculate tax on bills</span>
                                        </div>
                                        <label className="stToggle">
                                            <input
                                                type="checkbox"
                                                checked={formSettings.tax_enabled === 'true'}
                                                onChange={(e) => handleChange('tax_enabled', e.target.checked ? 'true' : 'false')}
                                            />
                                            <span className="stSlider"></span>
                                        </label>
                                    </div>

                                    {formSettings.tax_enabled === 'true' && (
                                        <div className="stFormGroup">
                                            <div className="stLabel">
                                                <span className="stLabelTitle">Default Tax Rate (%)</span>
                                                <span className="stLabelDesc">Percentage added to total</span>
                                            </div>
                                            <input
                                                type="number"
                                                className="stInput"
                                                style={{ width: '100px' }}
                                                value={formSettings.default_tax_rate || ''}
                                                onChange={(e) => handleChange('default_tax_rate', e.target.value)}
                                            />
                                        </div>
                                    )}

                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Default Order Type</span>
                                            <span className="stLabelDesc">Default selection for new bills</span>
                                        </div>
                                        <Dropdown
                                            options={[
                                                { label: 'Dine In', value: 'dine-in' },
                                                { label: 'Takeaway', value: 'takeaway' }
                                            ]}
                                            value={formSettings.default_order_type || 'dine-in'}
                                            onChange={(val) => handleChange('default_order_type', val)}
                                            placeholder="Select Default"
                                            className="stDropdown"
                                            zIndex={50}
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        {activeTab === 'printer' && (
                            <>
                                <div className="stSectionTitle">
                                    <IoHardwareChipOutline size={22} color="var(--primary)" />
                                    Printer Configuration
                                </div>

                                <div className="stSectionContent">
                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Enable Thermal Printer</span>
                                            <span className="stLabelDesc">Send print commands to connected printer</span>
                                        </div>
                                        <label className="stToggle">
                                            <input
                                                type="checkbox"
                                                checked={formSettings.printer_enabled === 'true'}
                                                onChange={(e) => handleChange('printer_enabled', e.target.checked ? 'true' : 'false')}
                                            />
                                            <span className="stSlider"></span>
                                        </label>
                                    </div>

                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Auto Print</span>
                                            <span className="stLabelDesc">Print automatically after saving bill</span>
                                        </div>
                                        <label className="stToggle">
                                            <input
                                                type="checkbox"
                                                checked={formSettings.auto_print === 'true'}
                                                onChange={(e) => handleChange('auto_print', e.target.checked ? 'true' : 'false')}
                                            />
                                            <span className="stSlider"></span>
                                        </label>
                                    </div>

                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Page Width</span>
                                            <span className="stLabelDesc">Paper roll width</span>
                                        </div>
                                        <Dropdown
                                            options={[
                                                { label: '58mm', value: '58mm' },
                                                { label: '80mm', value: '80mm' }
                                            ]}
                                            value={formSettings.printer_width || '58mm'}
                                            onChange={(val) => handleChange('printer_width', val)}
                                            placeholder="Select Width"
                                            className="stDropdown"
                                            zIndex={50}
                                        />
                                    </div>

                                    {/* Active Printer Selection */}
                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Selected Printer</span>
                                            <span className="stLabelDesc">Choose active system print spooler</span>
                                        </div>
                                        <Dropdown
                                            options={[
                                                { label: 'Default Printer', value: '' },
                                                ...printerInfo.availablePrinters.map(p => ({
                                                    label: `${p.name}${p.is_thermal ? ' (Thermal)' : ''}`,
                                                    value: p.name
                                                }))
                                            ]}
                                            value={formSettings.active_printer || ''}
                                            onChange={(val) => handleChange('active_printer', val)}
                                            placeholder="Select Printer"
                                            className="stDropdown"
                                            zIndex={40}
                                        />
                                    </div>

                                    {/* Printer Connection Status Indicator */}
                                    <div className="stFormGroup" style={{ borderTop: '1px solid var(--border-primary)', paddingTop: '15px', marginTop: '10px' }}>
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Printer Connection Status</span>
                                            <span className="stLabelDesc">
                                                {printerInfo.activePrinter ? `Active Spooler: ${printerInfo.activePrinter}` : 'Auto-detect Mode'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{
                                                width: '10px',
                                                height: '10px',
                                                borderRadius: '50%',
                                                backgroundColor: printerInfo.status === 'Ready' ? '#10b981' : '#f59e0b'
                                            }} />
                                            <span style={{ fontWeight: '600', fontSize: '14px', color: printerInfo.status === 'Ready' ? '#10b981' : '#f59e0b' }}>
                                                {printerInfoLoading ? 'Checking...' : printerInfo.status}
                                            </span>
                                        </div>
                                    </div>

                                    {printerInfo.error && (
                                        <div style={{
                                            fontSize: '12px',
                                            color: '#ef4444',
                                            padding: '8px 12px',
                                            borderRadius: '8px',
                                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                            border: '1px solid rgba(239, 68, 68, 0.2)',
                                            marginTop: '10px',
                                            fontWeight: '500'
                                        }}>
                                            Warning: {printerInfo.error}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {activeTab === 'app' && (
                            <>
                                <div className="stSectionTitle">
                                    <IoColorPaletteOutline size={22} color="var(--primary)" />
                                    Application Preferences
                                </div>

                                <div className="stSectionContent">
                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Show Product Images</span>
                                            <span className="stLabelDesc">Disable to improve performance on low-end devices</span>
                                        </div>
                                        <label className="stToggle">
                                            <input
                                                type="checkbox"
                                                checked={formSettings.show_product_images !== 'false'}
                                                onChange={(e) => handleChange('show_product_images', e.target.checked ? 'true' : 'false')}
                                            />
                                            <span className="stSlider"></span>
                                        </label>
                                    </div>

                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Show All Items in POS Favorites</span>
                                            <span className="stLabelDesc">Displays all active products inside the favorites category on the Billing screen</span>
                                        </div>
                                        <label className="stToggle">
                                            <input
                                                type="checkbox"
                                                checked={formSettings.show_all_as_favorite === 'true'}
                                                onChange={(e) => handleChange('show_all_as_favorite', e.target.checked ? 'true' : 'false')}
                                            />
                                            <span className="stSlider"></span>
                                        </label>
                                    </div>

                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Dark Mode (Default)</span>
                                            <span className="stLabelDesc">Set dark mode as default on startup</span>
                                        </div>
                                        <label className="stToggle">
                                            <input
                                                type="checkbox"
                                                checked={formSettings.dark_mode === 'true'}
                                                onChange={(e) => handleChange('dark_mode', e.target.checked ? 'true' : 'false')}
                                            />
                                            <span className="stSlider"></span>
                                        </label>
                                    </div>

                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Sound Effects</span>
                                            <span className="stLabelDesc">Play sound on successful bill</span>
                                        </div>
                                        <label className="stToggle">
                                            <input
                                                type="checkbox"
                                                checked={formSettings.sound_enabled === 'true'}
                                                onChange={(e) => handleChange('sound_enabled', e.target.checked ? 'true' : 'false')}
                                            />
                                            <span className="stSlider"></span>
                                        </label>
                                    </div>

                                    {window.electronAPI && (
                                        <div className="stFormGroup">
                                            <div className="stLabel">
                                                <span className="stLabelTitle">Start with PC</span>
                                                <span className="stLabelDesc">Automatically launch InfoOS when the system boots up</span>
                                            </div>
                                            <label className="stToggle">
                                                <input
                                                    type="checkbox"
                                                    checked={autoStartEnabled}
                                                    onChange={handleAutoStartToggle}
                                                />
                                                <span className="stSlider"></span>
                                            </label>
                                        </div>
                                    )}

                                    {/* Reminder Sound Customization */}
                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Reminder Alert Sound</span>
                                            <span className="stLabelDesc">Custom sound for overdue & triggered reminders</span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
                                            <div style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                gap: '12px',
                                                background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                                                padding: '12px 16px',
                                                borderRadius: '12px',
                                                border: '1px solid var(--border-secondary)'
                                            }}>
                                                <div style={{
                                                    width: '40px',
                                                    height: '40px',
                                                    borderRadius: '10px',
                                                    background: 'var(--primary-100)',
                                                    color: 'var(--primary-600)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}>
                                                    <IoVolumeHighOutline size={24} />
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: '14px', fontWeight: 600 }}>{formSettings.reminder_sound || 'Default'}</div>
                                                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Current active sound</div>
                                                </div>
                                                <Button 
                                                    variant="secondary" 
                                                    size="sm" 
                                                    onClick={previewSound}
                                                    style={{ height: '32px', padding: '0 12px' }}
                                                >
                                                    Preview
                                                </Button>
                                            </div>

                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <label style={{ flex: 1 }}>
                                                    <input 
                                                        type="file" 
                                                        accept="audio/*" 
                                                        onChange={handleSoundUpload} 
                                                        style={{ display: 'none' }} 
                                                    />
                                                    <div style={{
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        gap: '8px',
                                                        padding: '10px',
                                                        borderRadius: '12px',
                                                        border: '2px dashed var(--border-secondary)',
                                                        fontSize: '14px',
                                                        color: 'var(--text-secondary)',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    onMouseOver={e => e.currentTarget.style.borderColor = 'var(--primary-400)'}
                                                    onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border-secondary)'}
                                                    >
                                                        <IoCloudUploadOutline size={20} />
                                                        {uploadingSound ? 'Uploading...' : 'Upload Custom MP3'}
                                                    </div>
                                                </label>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Text Size Control */}
                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Text Size</span>
                                            <span className="stLabelDesc">Adjust text scaling across the app</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
                                            <Dropdown
                                                options={[
                                                    { label: '1x (Even Smaller)', value: '0.6' },
                                                    { label: '2x (Small)', value: '0.8' },
                                                    { label: '3x (Normal)', value: '1' }
                                                ]}
                                                value={textScale.toString()}
                                                onChange={(val) => setTextScale(parseFloat(val))}
                                                placeholder="Select text size"
                                                className="stDropdown"
                                                zIndex={40}
                                            />
                                            <div style={{ 
                                                fontSize: 'var(--font-sm)', 
                                                color: isDark ? '#94a3b8' : '#64748b',
                                                marginLeft: '8px',
                                                padding: '4px 8px',
                                                borderRadius: '6px',
                                                background: isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(100, 116, 139, 0.1)'
                                            }}>
                                                Scale: {textScale === 0.6 ? '1x' : textScale === 0.8 ? '2x' : '3x'} ({(textScale * 100).toFixed(0)}%)
                                            </div>
                                        </div>
                                    </div>

                                    {/* Display Zoom Control */}
                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Display Zoom</span>
                                            <span className="stLabelDesc">Scale sections, cards and UI elements</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
                                            <Dropdown
                                                options={[
                                                    { label: '1x (Even Smaller)', value: '0.6' },
                                                    { label: '2x (Small)', value: '0.8' },
                                                    { label: '3x (Normal)', value: '1' }
                                                ]}
                                                value={displayZoom.toString()}
                                                onChange={(val) => setDisplayZoom(parseFloat(val))}
                                                placeholder="Select display zoom"
                                                className="stDropdown"
                                                zIndex={39}
                                            />
                                            <div style={{ 
                                                fontSize: 'var(--font-sm)', 
                                                color: isDark ? '#94a3b8' : '#64748b',
                                                marginLeft: '8px',
                                                padding: '4px 8px',
                                                borderRadius: '6px',
                                                background: isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(100, 116, 139, 0.1)'
                                            }}>
                                                Zoom: {displayZoom === 0.6 ? '1x' : displayZoom === 0.8 ? '2x' : '3x'} ({(displayZoom * 100).toFixed(0)}%)
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {activeTab === 'workers' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                <div style={{ marginBottom: '12px' }}>
                                    <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px 0' }}>Worker Configuration</h2>
                                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>Manage salary settings and worker types</p>
                                </div>

                                <div style={{
                                    padding: '24px',
                                    background: 'var(--surface-primary)',
                                    border: '1px solid var(--border-secondary)',
                                    borderRadius: '12px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '16px'
                                }}>
                                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Salary Settings</h3>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>Monthly Salary Date</label>
                                        <div style={{ width: '100%' }}>
                                            <GlobalDatePicker
                                                value={(() => {
                                                    const day = parseInt(formSettings.salary_day) || 1;
                                                    const now = new Date();
                                                    return getLocalDateString(new Date(now.getFullYear(), now.getMonth(), day));
                                                })()}
                                                onChange={(dateStr) => {
                                                    if (dateStr) {
                                                        const parts = dateStr.split('-');
                                                        if (parts.length === 3) {
                                                            const day = parseInt(parts[2]);
                                                            handleChange('salary_day', day.toString());
                                                        }
                                                    }
                                                }}
                                                placeholder="Select Salary Day"
                                            />
                                            <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-tertiary)' }}>
                                                Selected: <strong style={{ color: 'var(--text-primary)' }}>Day {formSettings.salary_day || 1}</strong> of every month
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div style={{
                                    padding: '24px',
                                    background: 'var(--surface-primary)',
                                    border: '1px solid var(--border-secondary)',
                                    borderRadius: '12px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '16px'
                                }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Worker Types</h3>
                                                {workerEditMode && (
                                                    <span style={{
                                                        fontSize: '12px',
                                                        fontWeight: '600',
                                                        color: '#FF8A00',
                                                        background: 'rgba(255,138,0,0.1)',
                                                        padding: '4px 12px',
                                                        borderRadius: '12px',
                                                        border: '1px solid rgba(255,138,0,0.2)'
                                                    }}>
                                                        Editing Mode
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                {!workerEditMode ? (
                                                    <>
                                                        <Button
                                                            onClick={() => openWorkerTypeModal()}
                                                            size="sm"
                                                            style={{ height: '36px' }}
                                                        >
                                                            + Add Type
                                                        </Button>
                                                        <Button
                                                            onClick={startWorkerEditMode}
                                                            variant="secondary"
                                                            size="sm"
                                                            style={{ height: '36px' }}
                                                        >
                                                            Edit
                                                        </Button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Button
                                                            onClick={cancelWorkerEditMode}
                                                            variant="secondary"
                                                            size="sm"
                                                            style={{ height: '36px' }}
                                                        >
                                                            Cancel
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {workerTypesLoading ? (
                                            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                                                Loading worker types...
                                            </div>
                                        ) : workerTypes.length === 0 ? (
                                            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                                                No worker types found. Click "Add Type" to create one.
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                {workerTypes.map((type) => (
                                                    <motion.div
                                                        layout
                                                        key={type.id}
                                                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                                    >
                                                        {editingWorkerType?.id === type.id && workerEditMode ? (
                                                            <div style={{
                                                                padding: '16px',
                                                                background: 'rgba(255,138,0,0.1)',
                                                                border: '1.5px dashed #FF8A00',
                                                                borderRadius: '8px',
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                gap: '12px'
                                                            }}>
                                                                <div>
                                                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                                                        Name *
                                                                    </label>
                                                                    <input
                                                                        type="text"
                                                                        value={workerTypeForm.name}
                                                                        onChange={(e) => setWorkerTypeForm({ ...workerTypeForm, name: e.target.value })}
                                                                        style={{
                                                                            width: '100%',
                                                                            padding: '8px',
                                                                            borderRadius: '4px',
                                                                            border: '1px solid var(--border-secondary)',
                                                                            background: 'var(--surface-secondary)',
                                                                            color: 'var(--text-primary)',
                                                                            fontSize: '14px'
                                                                        }}
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                                                        Description
                                                                    </label>
                                                                    <textarea
                                                                        value={workerTypeForm.description}
                                                                        onChange={(e) => setWorkerTypeForm({ ...workerTypeForm, description: e.target.value })}
                                                                        rows={2}
                                                                        style={{
                                                                            width: '100%',
                                                                            padding: '8px',
                                                                            borderRadius: '4px',
                                                                            border: '1px solid var(--border-secondary)',
                                                                            background: 'var(--surface-secondary)',
                                                                            color: 'var(--text-primary)',
                                                                            fontSize: '14px',
                                                                            resize: 'vertical'
                                                                        }}
                                                                    />
                                                                </div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={workerTypeForm.is_active}
                                                                        onChange={(e) => setWorkerTypeForm({ ...workerTypeForm, is_active: e.target.checked })}
                                                                        style={{ width: '16px', height: '16px' }}
                                                                    />
                                                                    <label style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Active</label>
                                                                </div>
                                                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                                    <Button
                                                                        onClick={() => setEditingWorkerType(null)}
                                                                        variant="secondary"
                                                                        size="sm"
                                                                        style={{ height: '32px', padding: '0 12px' }}
                                                                    >
                                                                        Cancel
                                                                    </Button>
                                                                    <Button
                                                                        onClick={saveInlineWorkerType}
                                                                        size="sm"
                                                                        style={{ height: '32px', padding: '0 12px' }}
                                                                    >
                                                                        Save
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div
                                                                style={{
                                                                    padding: '16px',
                                                                    background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                                                                    border: workerEditMode ? '1.5px dashed #FF8A00' : '1px solid var(--border-secondary)',
                                                                    borderRadius: '8px',
                                                                    display: 'flex',
                                                                    justifyContent: 'space-between',
                                                                    alignItems: 'center',
                                                                    cursor: workerEditMode ? 'pointer' : 'default',
                                                                    transition: 'all 0.2s'
                                                                }}
                                                                onClick={workerEditMode ? () => handleInlineWorkerTypeEdit(type) : undefined}
                                                            >
                                                                <div>
                                                                    <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                                        {type.name}
                                                                    </div>
                                                                    {type.description && (
                                                                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                                                            {type.description}
                                                                        </div>
                                                                    )}
                                                                    <div style={{ fontSize: '12px', color: type.is_active ? 'var(--success-500)' : 'var(--error-500)', marginTop: '4px' }}>
                                                                        {type.is_active ? 'Active' : 'Inactive'}
                                                                    </div>
                                                                </div>
                                                                {!workerEditMode && (
                                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                                        <Button
                                                                            onClick={(e) => { e.stopPropagation(); handleDeleteWorkerType(type.id); }}
                                                                            variant="danger"
                                                                            size="sm"
                                                                            style={{ height: '32px', padding: '0 12px' }}
                                                                        >
                                                                            Delete
                                                                        </Button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </motion.div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                            </div>
                        )}

                        {activeTab === 'expenses' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                <div style={{ marginBottom: '24px' }}>
                                    <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px 0' }}>Expense Configuration</h2>
                                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>Manage expense types for categorization</p>
                                </div>

                                <div style={{
                                    padding: '24px',
                                    background: 'var(--surface-primary)',
                                    border: '1px solid var(--border-secondary)',
                                    borderRadius: '12px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '16px'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Expense Types</h3>
                                            {expenseEditMode && (
                                                <span style={{
                                                    fontSize: '12px',
                                                    fontWeight: '600',
                                                    color: '#FF8A00',
                                                    background: 'rgba(255,138,0,0.1)',
                                                    padding: '4px 12px',
                                                    borderRadius: '12px',
                                                    border: '1px solid rgba(255,138,0,0.2)'
                                                }}>
                                                    Editing Mode
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            {!expenseEditMode ? (
                                                <>
                                                    <Button
                                                        onClick={() => openExpenseTypeModal()}
                                                        size="sm"
                                                        style={{ height: '36px' }}
                                                    >
                                                        + Add Type
                                                    </Button>
                                                    <Button
                                                        onClick={startExpenseEditMode}
                                                        variant="secondary"
                                                        size="sm"
                                                        style={{ height: '36px' }}
                                                    >
                                                        Edit
                                                    </Button>
                                                </>
                                            ) : (
                                                <>
                                                    <Button
                                                        onClick={cancelExpenseEditMode}
                                                        variant="secondary"
                                                        size="sm"
                                                        style={{ height: '36px' }}
                                                    >
                                                        Cancel
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {expenseTypesLoading ? (
                                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                                            Loading expense types...
                                        </div>
                                    ) : expenseTypes.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                                            No expense types found. Click "Add Type" to create one.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            {expenseTypes.map((type) => (
                                                <motion.div
                                                    layout
                                                    key={type.id}
                                                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                                >
                                                    {editingExpenseType?.id === type.id && expenseEditMode ? (
                                                        <div style={{
                                                            padding: '16px',
                                                            background: 'rgba(255,138,0,0.1)',
                                                            border: '1.5px dashed #FF8A00',
                                                            borderRadius: '8px',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: '12px'
                                                        }}>
                                                            <div>
                                                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                                                    Name *
                                                                </label>
                                                                <input
                                                                    type="text"
                                                                    value={expenseTypeForm.name}
                                                                    onChange={(e) => setExpenseTypeForm({ ...expenseTypeForm, name: e.target.value })}
                                                                    style={{
                                                                        width: '100%',
                                                                        padding: '8px',
                                                                        borderRadius: '4px',
                                                                        border: '1px solid var(--border-secondary)',
                                                                        background: 'var(--surface-secondary)',
                                                                        color: 'var(--text-primary)',
                                                                        fontSize: '14px'
                                                                    }}
                                                                />
                                                            </div>
                                                            <div>
                                                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                                                    Description
                                                                </label>
                                                                <textarea
                                                                    value={expenseTypeForm.description}
                                                                    onChange={(e) => setExpenseTypeForm({ ...expenseTypeForm, description: e.target.value })}
                                                                    rows={2}
                                                                    style={{
                                                                        width: '100%',
                                                                        padding: '8px',
                                                                        borderRadius: '4px',
                                                                        border: '1px solid var(--border-secondary)',
                                                                        background: 'var(--surface-secondary)',
                                                                        color: 'var(--text-primary)',
                                                                        fontSize: '14px',
                                                                        resize: 'vertical'
                                                                    }}
                                                                />
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={expenseTypeForm.is_active}
                                                                    onChange={(e) => setExpenseTypeForm({ ...expenseTypeForm, is_active: e.target.checked })}
                                                                    style={{ width: '16px', height: '16px' }}
                                                                />
                                                                <label style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Active</label>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                                <Button
                                                                    onClick={() => setEditingExpenseType(null)}
                                                                    variant="secondary"
                                                                    size="sm"
                                                                    style={{ height: '32px', padding: '0 12px' }}
                                                                >
                                                                    Cancel
                                                                </Button>
                                                                <Button
                                                                    onClick={saveInlineExpenseType}
                                                                    size="sm"
                                                                    style={{ height: '32px', padding: '0 12px' }}
                                                                >
                                                                    Save
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div
                                                            style={{
                                                                padding: '16px',
                                                                background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                                                                border: expenseEditMode ? '1.5px dashed #FF8A00' : '1px solid var(--border-secondary)',
                                                                borderRadius: '8px',
                                                                display: 'flex',
                                                                justifyContent: 'space-between',
                                                                alignItems: 'center',
                                                                cursor: expenseEditMode ? 'pointer' : 'default',
                                                                transition: 'all 0.2s'
                                                            }}
                                                            onClick={expenseEditMode ? () => handleInlineExpenseTypeEdit(type) : undefined}
                                                        >
                                                            <div>
                                                                <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                                    {type.name}
                                                                </div>
                                                                {type.description && (
                                                                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                                                        {type.description}
                                                                    </div>
                                                                )}
                                                                <div style={{ fontSize: '12px', color: type.is_active ? 'var(--success-500)' : 'var(--error-500)', marginTop: '4px' }}>
                                                                    {type.is_active ? 'Active' : 'Inactive'}
                                                                </div>
                                                            </div>
                                                            {!expenseEditMode && (
                                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                                    <Button
                                                                        onClick={(e) => { e.stopPropagation(); handleDeleteExpenseType(type.id); }}
                                                                        variant="danger"
                                                                        size="sm"
                                                                        style={{ height: '32px', padding: '0 12px' }}
                                                                    >
                                                                        Delete
                                                                    </Button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </motion.div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'security' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                                {/* Page Header with Status Badge */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <div>
                                        <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px 0' }}>Security & Access</h2>
                                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>Manage authentication and access controls</p>
                                    </div>
                                    <div style={{
                                        padding: '6px 12px',
                                        borderRadius: '20px',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                        background: pinStatus.is_setup ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                        color: pinStatus.is_setup ? '#10B981' : '#EF4444',
                                        border: pinStatus.is_setup ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)'
                                    }}>
                                        {pinStatus.is_setup ? 'Secured' : 'Unsecured'}
                                    </div>
                                </div>

                                {/* Warning Banner */}
                                {formSettings.require_pin_login !== 'true' && (
                                    <div style={{
                                        padding: '12px 16px',
                                        background: 'rgba(239, 68, 68, 0.05)',
                                        border: '1px solid rgba(239, 68, 68, 0.15)',
                                        borderRadius: '8px',
                                        fontSize: '13px',
                                        color: 'var(--text-primary)'
                                    }}>
                                        PIN requirement is disabled. Enable it to protect sensitive areas.
                                    </div>
                                )}

                                {/* Settings Grid */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
                                    {/* Require PIN Toggle */}
                                    <div style={{
                                        padding: '16px',
                                        background: 'var(--surface-primary)',
                                        border: '1px solid var(--border-secondary)',
                                        borderRadius: '8px',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <div>
                                            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Require PIN for Owner Role</div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>Request PIN when switching to Owner role</div>
                                        </div>
                                        <label style={{
                                            position: 'relative',
                                            display: 'inline-block',
                                            width: '44px',
                                            height: '24px'
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={formSettings.require_pin_login === 'true'}
                                                onChange={(e) => handleChange('require_pin_login', e.target.checked ? 'true' : 'false')}
                                                style={{ opacity: 0, width: 0, height: 0 }}
                                            />
                                            <span style={{
                                                position: 'absolute',
                                                cursor: 'pointer',
                                                top: 0, left: 0, right: 0, bottom: 0,
                                                backgroundColor: formSettings.require_pin_login === 'true' ? 'var(--primary-500)' : 'var(--border-secondary)',
                                                transition: '0.2s',
                                                borderRadius: '24px'
                                            }}>
                                                <span style={{
                                                    position: 'absolute',
                                                    content: '""',
                                                    height: '18px',
                                                    width: '18px',
                                                    left: formSettings.require_pin_login === 'true' ? '24px' : '3px',
                                                    bottom: '3px',
                                                    backgroundColor: 'white',
                                                    transition: '0.2s',
                                                    borderRadius: '50%'
                                                }}></span>
                                            </span>
                                        </label>
                                    </div>

                                    {/* Authentication Card */}
                                    {formSettings.require_pin_login === 'true' && (
                                        <div style={{
                                            padding: '24px',
                                            background: 'var(--surface-primary)',
                                            border: '1px solid var(--border-secondary)',
                                            borderRadius: '8px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '24px'
                                        }}>
                                            <div>
                                                <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Authentication PIN</div>
                                                <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Set or change your 4-6 digit security PIN</div>
                                            </div>

                                            {pinStatus.is_setup && pinStatus.enabled && formSettings.require_pin_login === 'true' && (
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>Current PIN</label>
                                                    <input
                                                        type="password"
                                                        inputMode="numeric"
                                                        maxLength={6}
                                                        value={pinForm.currentPin}
                                                        onChange={e => handlePinChange('currentPin', e.target.value.replace(/\D/g, ''))}
                                                        placeholder="Enter existing PIN"
                                                        style={{
                                                            width: '100%',
                                                            maxWidth: '300px',
                                                            padding: '10px 12px',
                                                            background: 'var(--bg-primary)',
                                                            border: '1px solid var(--border-secondary)',
                                                            borderRadius: '6px',
                                                            color: 'var(--text-primary)',
                                                            fontSize: '14px',
                                                            outline: 'none'
                                                        }}
                                                    />
                                                </div>
                                            )}

                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>New PIN</label>
                                                    <input
                                                        type="password"
                                                        inputMode="numeric"
                                                        maxLength={6}
                                                        value={pinForm.newPin}
                                                        onChange={e => handlePinChange('newPin', e.target.value.replace(/\D/g, ''))}
                                                        placeholder="4–6 digits"
                                                        style={{
                                                            width: '100%',
                                                            padding: '10px 12px',
                                                            background: 'var(--bg-primary)',
                                                            border: '1px solid var(--border-secondary)',
                                                            borderRadius: '6px',
                                                            color: 'var(--text-primary)',
                                                            fontSize: '14px',
                                                            outline: 'none'
                                                        }}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>Confirm PIN</label>
                                                    <input
                                                        type="password"
                                                        inputMode="numeric"
                                                        maxLength={6}
                                                        value={pinForm.confirmPin}
                                                        onChange={e => handlePinChange('confirmPin', e.target.value.replace(/\D/g, ''))}
                                                        placeholder="Repeat PIN"
                                                        style={{
                                                            width: '100%',
                                                            padding: '10px 12px',
                                                            background: 'var(--bg-primary)',
                                                            border: '1px solid var(--border-secondary)',
                                                            borderRadius: '6px',
                                                            color: 'var(--text-primary)',
                                                            fontSize: '14px',
                                                            outline: 'none'
                                                        }}
                                                    />
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', gap: '12px', paddingTop: '8px', borderTop: '1px solid var(--border-secondary)', marginTop: '8px' }}>
                                                <Button
                                                    variant="primary"
                                                    onClick={handleSavePinChange}
                                                    loading={pinSaving}
                                                    disabled={!pinForm.newPin || !pinForm.confirmPin || pinSaving}
                                                    style={{ height: '36px' }}
                                                >
                                                    {pinSaving ? 'Saving...' : pinStatus.is_setup ? 'Update PIN' : 'Set PIN'}
                                                </Button>

                                                {pinStatus.is_setup && (
                                                    <Button
                                                        variant="secondary"
                                                        onClick={handleResetPin}
                                                        disabled={pinSaving}
                                                        style={{ height: '36px' }}
                                                    >
                                                        Reset
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Protected Areas Info */}
                                    <div style={{
                                        padding: '16px',
                                        background: 'var(--surface-primary)',
                                        border: '1px solid var(--border-secondary)',
                                        borderRadius: '8px'
                                    }}>
                                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px' }}>Protected Areas</div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                            {['Inventory', 'Analytics', 'Settings', 'Worker Records'].map((item, idx) => (
                                                <span key={idx} style={{
                                                    padding: '4px 10px',
                                                    background: 'var(--bg-secondary)',
                                                    borderRadius: '4px',
                                                    fontSize: '12px',
                                                    color: 'var(--text-tertiary)'
                                                }}>
                                                    {item}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Worker Type Modal */}
                        {showWorkerTypeModal && (
                            <div style={{
                                position: 'fixed',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                background: 'rgba(0,0,0,0.5)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                zIndex: 1000
                            }}>
                                <div style={{
                                    background: 'var(--surface-primary)',
                                    padding: '24px',
                                    borderRadius: '12px',
                                    width: '400px',
                                    maxWidth: '90%',
                                    border: '1px solid var(--border-secondary)'
                                }}>
                                    <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px 0' }}>
                                        {editingWorkerType ? 'Edit Worker Type' : 'Add Worker Type'}
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                                Name *
                                            </label>
                                            <input
                                                type="text"
                                                value={workerTypeForm.name}
                                                onChange={(e) => setWorkerTypeForm({ ...workerTypeForm, name: e.target.value })}
                                                placeholder="e.g., Chef, Waiter, Manager"
                                                style={{
                                                    width: '100%',
                                                    padding: '10px',
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--border-secondary)',
                                                    background: 'var(--surface-secondary)',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '14px'
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                                Description
                                            </label>
                                            <textarea
                                                value={workerTypeForm.description}
                                                onChange={(e) => setWorkerTypeForm({ ...workerTypeForm, description: e.target.value })}
                                                placeholder="Optional description"
                                                rows={3}
                                                style={{
                                                    width: '100%',
                                                    padding: '10px',
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--border-secondary)',
                                                    background: 'var(--surface-secondary)',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '14px',
                                                    resize: 'vertical'
                                                }}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <input
                                                type="checkbox"
                                                checked={workerTypeForm.is_active}
                                                onChange={(e) => setWorkerTypeForm({ ...workerTypeForm, is_active: e.target.checked })}
                                                style={{ width: '16px', height: '16px' }}
                                            />
                                            <label style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Active</label>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                            <Button
                                                onClick={() => {
                                                    setShowWorkerTypeModal(false);
                                                    setEditingWorkerType(null);
                                                    setWorkerTypeForm({ name: '', description: '', is_active: true });
                                                }}
                                                variant="secondary"
                                                style={{ flex: 1 }}
                                            >
                                                Cancel
                                            </Button>
                                            <Button
                                                onClick={editingWorkerType ? handleUpdateWorkerType : handleCreateWorkerType}
                                                style={{ flex: 1 }}
                                            >
                                                {editingWorkerType ? 'Update' : 'Create'}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Expense Type Modal */}
                        {showExpenseTypeModal && (
                            <div style={{
                                position: 'fixed',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                background: 'rgba(0,0,0,0.5)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                zIndex: 1000
                            }}>
                                <div style={{
                                    background: 'var(--surface-primary)',
                                    padding: '24px',
                                    borderRadius: '12px',
                                    width: '400px',
                                    maxWidth: '90%',
                                    border: '1px solid var(--border-secondary)'
                                }}>
                                    <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px 0' }}>
                                        {editingExpenseType ? 'Edit Expense Type' : 'Add Expense Type'}
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                                Name *
                                            </label>
                                            <input
                                                type="text"
                                                value={expenseTypeForm.name}
                                                onChange={(e) => setExpenseTypeForm({ ...expenseTypeForm, name: e.target.value })}
                                                placeholder="e.g., Utilities, Supplies, Rent"
                                                style={{
                                                    width: '100%',
                                                    padding: '10px',
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--border-secondary)',
                                                    background: 'var(--surface-secondary)',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '14px'
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                                Description
                                            </label>
                                            <textarea
                                                value={expenseTypeForm.description}
                                                onChange={(e) => setExpenseTypeForm({ ...expenseTypeForm, description: e.target.value })}
                                                placeholder="Optional description"
                                                rows={3}
                                                style={{
                                                    width: '100%',
                                                    padding: '10px',
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--border-secondary)',
                                                    background: 'var(--surface-secondary)',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '14px',
                                                    resize: 'vertical'
                                                }}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <input
                                                type="checkbox"
                                                checked={expenseTypeForm.is_active}
                                                onChange={(e) => setExpenseTypeForm({ ...expenseTypeForm, is_active: e.target.checked })}
                                                style={{ width: '16px', height: '16px' }}
                                            />
                                            <label style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Active</label>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                            <Button
                                                onClick={() => {
                                                    setShowExpenseTypeModal(false);
                                                    setEditingExpenseType(null);
                                                    setExpenseTypeForm({ name: '', description: '', is_active: true });
                                                }}
                                                variant="secondary"
                                                style={{ flex: 1 }}
                                            >
                                                Cancel
                                            </Button>
                                            <Button
                                                onClick={editingExpenseType ? handleUpdateExpenseType : handleCreateExpenseType}
                                                style={{ flex: 1 }}
                                            >
                                                {editingExpenseType ? 'Update' : 'Create'}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'cloud' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '48px' }}>
                                {/* Cloud Sync Section */}
                                <div>
                                    <div style={{ marginBottom: '24px' }}>
                                        <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px 0' }}>Cloud Sync</h2>
                                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>View cloud connection status and manually synchronize backups.</p>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '32px' }}>
                                        {/* Status Card */}
                                        <div style={{
                                            padding: '24px',
                                            background: 'var(--surface-primary)',
                                            border: '1px solid var(--border-secondary)',
                                            borderRadius: '12px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '16px'
                                        }}>
                                            <div style={{
                                                width: '48px',
                                                height: '48px',
                                                borderRadius: '12px',
                                                background: cloudStatus.loggedIn && cloudStatus.subscriptionStatus === 'active' ? 'var(--success-500)' : 'var(--primary-500)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: 'white'
                                            }}>
                                                <IoCloudUploadOutline size={24} />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                    {cloudStatus.loggedIn ? 'Connected' : 'Not Connected'}
                                                </div>
                                                <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                                                    {cloudStatus.loggedIn ? cloudStatus.email : 'Sign in to enable cloud sync'}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Subscription & Sync Controls */}
                                        <div style={{
                                            padding: '24px',
                                            background: 'var(--surface-primary)',
                                            border: '1px solid var(--border-secondary)',
                                            borderRadius: '12px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '24px'
                                        }}>
                                            <div style={{
                                                padding: '16px',
                                                background: 'var(--bg-secondary)',
                                                borderRadius: '8px',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '8px'
                                            }}>
                                                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subscription</div>
                                                <div style={{ fontSize: '14px', fontWeight: 600, color: cloudStatus.subscriptionStatus === 'active' ? 'var(--success-500)' : 'var(--text-primary)' }}>
                                                    {cloudStatus.subscriptionStatus.toUpperCase()}
                                                </div>
                                                {cloudStatus.expiry && (
                                                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                                        Expires: {cloudStatus.expiry}
                                                    </div>
                                                )}
                                            </div>

                                            {cloudStatus.loggedIn && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>Manual Backups</div>
                                                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                                        <Button
                                                            variant="primary"
                                                            onClick={handleManualSync}
                                                            loading={syncingBackup}
                                                            disabled={syncingBackup || syncingMonthlyBackup}
                                                            style={{ height: '40px' }}
                                                        >
                                                            Sync Weekly
                                                        </Button>
                                                        <Button
                                                            variant="primary"
                                                            onClick={handleMonthlySync}
                                                            loading={syncingMonthlyBackup}
                                                            disabled={syncingBackup || syncingMonthlyBackup}
                                                            style={{ height: '40px' }}
                                                        >
                                                            Sync Monthly
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* About Section */}
                                <div>
                                    <div style={{ marginBottom: '24px' }}>
                                        <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px 0' }}>About</h2>
                                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>System information and version details</p>
                                    </div>

                                    {/* Version Grid */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                                        gap: '16px',
                                        marginBottom: '32px'
                                    }}>
                                        <div style={{
                                            padding: '16px',
                                            background: 'var(--surface-primary)',
                                            border: '1px solid var(--border-secondary)',
                                            borderRadius: '8px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '4px'
                                        }}>
                                            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>App Version</div>
                                            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>v{systemInfo.appVersion}</div>
                                        </div>

                                        <div style={{
                                             padding: '16px',
                                             background: 'var(--surface-primary)',
                                             border: '1px solid var(--border-secondary)',
                                             borderRadius: '8px',
                                             display: 'flex',
                                             flexDirection: 'column',
                                             gap: '4px'
                                         }}>
                                             <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Update Status</div>
                                            <div style={{ fontSize: '14px', fontWeight: 600, color: getStatusColor(systemInfo.updateStatus) }}>
                                                {formatStatusText(systemInfo.updateStatus)}
                                            </div>
                                        </div>

                                        <div style={{
                                            padding: '16px',
                                            background: 'var(--surface-primary)',
                                            border: '1px solid var(--border-secondary)',
                                            borderRadius: '8px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '4px'
                                        }}>
                                            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Latest</div>
                                            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                {systemInfo.latestVersion && systemInfo.latestVersion !== 'unknown' ? `v${systemInfo.latestVersion}` : 'No updates'}
                                            </div>
                                        </div>

                                        <div style={{
                                            padding: '16px',
                                            background: 'var(--surface-primary)',
                                            border: '1px solid var(--border-secondary)',
                                            borderRadius: '8px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '4px'
                                        }}>
                                            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last Checked</div>
                                            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                                {systemInfo.lastChecked ? new Date(systemInfo.lastChecked).toLocaleDateString() : 'Never'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Update Controls */}
                                    <div style={{
                                        padding: '16px',
                                        background: 'var(--surface-primary)',
                                        border: '1px solid var(--border-secondary)',
                                        borderRadius: '8px',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <div>
                                            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Check for updates</div>
                                            <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Query the official release repository</div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <Button
                                                variant="secondary"
                                                onClick={handleManualCheckForUpdates}
                                                loading={checkingForUpdates}
                                                style={{ height: '36px' }}
                                            >
                                                Check Now
                                            </Button>
                                            {systemInfo.updateStatus === 'downloaded' && (
                                                <Button
                                                    variant="primary"
                                                    onClick={() => window.electronAPI.installUpdate()}
                                                    style={{ height: '36px', background: 'var(--success-500, #10b981)', borderColor: 'var(--success-500, #10b981)' }}
                                                >
                                                    Install Update
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="stActions">
                            <Button 
                                variant="secondary" 
                                style={{ marginRight: 'auto', borderColor: '#ef4444', color: '#ef4444' }} 
                                onClick={() => {
                                    window.dispatchEvent(new CustomEvent('licensing-logout'));
                                }}
                            >
                                Logout
                            </Button>
                            <Button variant="secondary" onClick={handleDiscard}>Discard Changes</Button>
                            <Button
                                variant="primary"
                                onClick={handleSave}
                                loading={saving}
                            >
                                {saving ? 'Saving...' : 'Save Settings'}
                            </Button>
                        </div>
                    </motion.div>
                </Card>
            </div>
        </PageContainer >
    );
};

export default Settings;
