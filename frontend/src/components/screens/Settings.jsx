import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettings } from '../../context/SettingsContext';
import { useAlert as useToast } from '../../context/AlertContext';
import { useTheme } from '../../context/ThemeContext';
import '../../styles/Settings.css';
import '../../styles/typography.css'; // Import typography system
import Dropdown from '../ui/Dropdown';
import GlobalSelect from '../ui/GlobalSelect';
import GlobalTimePicker from '../ui/GlobalTimePicker';
import GlobalDatePicker from '../ui/GlobalDatePicker';
import Card from '../ui/Card'; // Import Shared Card Component
import PageContainer from '../layout/PageContainer';
import Button from '../ui/Button';
import { previewSoundFile } from '../../utils/soundService';
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
    IoCloudUploadOutline,
    IoConstructOutline,
    IoInformationCircleOutline,
    IoSparklesOutline,
    IoLogOutOutline
} from 'react-icons/io5';
import { settingsAPI } from '../../api/settings';
import { getLocalDateString } from '../../utils/api';
import { setupPin, getAuthStatus, resetPin } from '../../api/auth';
import { cloudSyncAPI, setCloudAuthToken, cloudLicenseAPI, cloudAuthAPI, restoreAuthSessionFromDisk } from '../../api/cloudApi';
import api, { summaryAPI } from '../../utils/api';
import { expensesAPI } from '../../api/expenses';
import { workerAPI } from '../../api/workers';
import { agentsAPI } from '../../api/agents';


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

    // Developer Mode State
    const [devModeEnabled, setDevModeEnabled] = useState(false);
    const [diagnosticInfo, setDiagnosticInfo] = useState(null);
    const [apiLogs, setApiLogs] = useState([]);
    const [ipcLogs, setIpcLogs] = useState([]);
    const [fileLogs, setFileLogs] = useState([]);
    const [restartingBackend, setRestartingBackend] = useState(false);

    useEffect(() => {
        const fetchDevMode = async () => {
            if (window.electronAPI && window.electronAPI.getDevMode) {
                try {
                    const enabled = await window.electronAPI.getDevMode();
                    setDevModeEnabled(enabled);
                } catch (err) {
                    console.error('Failed to read dev-mode status:', err);
                }
            }
        };
        fetchDevMode();
    }, []);

    // Diagnostics & File Logs Polling
    useEffect(() => {
        if (!devModeEnabled || activeTab !== 'advanced') return;

        const fetchDiagnosticsAndLogs = async () => {
            if (!window.electronAPI) return;
            
            try {
                if (window.electronAPI.getDiagnosticInfo) {
                    const info = await window.electronAPI.getDiagnosticInfo();
                    setDiagnosticInfo(info);
                }
                
                if (window.electronAPI.readLogs) {
                    const logs = await window.electronAPI.readLogs(100);
                    setFileLogs(logs);
                }
            } catch (err) {
                console.error('Error fetching developer diagnostics:', err);
            }
        };

        fetchDiagnosticsAndLogs();
        const interval = setInterval(fetchDiagnosticsAndLogs, 3000);

        return () => clearInterval(interval);
    }, [devModeEnabled, activeTab]);

    // ── Agentic AI System State ───────────────────────────────────────────
    const [agentConfig, setAgentConfig] = useState({
        provider: 'openai',
        model_name: 'gpt-4o-mini',
        base_url: '',
        api_key: '',
        has_api_key: false,
        enabled: true,
        max_tokens_per_response: 800,
        max_tool_rounds: 3,
        daily_request_limit: 100
    });
    const [agentPermissions, setAgentPermissions] = useState([]);
    const [agentLogs, setAgentLogs] = useState([]);
    const [testingConnection, setTestingConnection] = useState(false);
    const [agentSaving, setAgentSaving] = useState(false);
    const [logFilterAgent, setLogFilterAgent] = useState('');
    const [logFilterStatus, setLogFilterStatus] = useState('');

    const loadAgentData = useCallback(async () => {
        try {
            const [configRes, permRes, logsRes] = await Promise.all([
                agentsAPI.getConfig(),
                agentsAPI.getPermissions(),
                agentsAPI.getAuditLogs({ limit: 50 })
            ]);
            if (configRes.success && configRes.config) {
                setAgentConfig(prev => ({
                    ...prev,
                    provider: configRes.config.provider || 'openai',
                    model_name: configRes.config.model_name || 'gpt-4o-mini',
                    base_url: configRes.config.base_url || '',
                    enabled: configRes.config.enabled !== false,
                    max_tokens_per_response: configRes.config.max_tokens_per_response || 800,
                    max_tool_rounds: configRes.config.max_tool_rounds || 3,
                    daily_request_limit: configRes.config.daily_request_limit || 100,
                    has_api_key: configRes.config.has_api_key,
                    api_key: configRes.config.has_api_key ? '••••••••••••••••' : ''
                }));
            }
            if (permRes.success && permRes.permissions) {
                setAgentPermissions(permRes.permissions);
            }
            if (logsRes.success && logsRes.logs) {
                setAgentLogs(logsRes.logs);
            }
        } catch (err) {
            console.error('Failed to load agent settings:', err);
        }
    }, []);

    useEffect(() => {
        if (activeTab === 'agents') {
            loadAgentData();
        }
    }, [activeTab, loadAgentData]);

    const handleSaveAgentConfig = async () => {
        setAgentSaving(true);
        try {
            const payload = {
                provider: agentConfig.provider,
                model_name: agentConfig.model_name,
                base_url: agentConfig.base_url,
                enabled: agentConfig.enabled,
                api_key: agentConfig.api_key,
                max_tokens_per_response: parseInt(agentConfig.max_tokens_per_response, 10) || 800,
                max_tool_rounds: parseInt(agentConfig.max_tool_rounds, 10) || 3,
                daily_request_limit: parseInt(agentConfig.daily_request_limit, 10) || 100
            };
            const res = await agentsAPI.updateConfig(payload);
            showSuccess(res.message || 'AI Agent configuration saved.');
            loadAgentData();
        } catch (err) {
            showError(err.response?.data?.error || 'Failed to save agent configuration.');
        } finally {
            setAgentSaving(false);
        }
    };

    const handleTestLlmConnection = async () => {
        setTestingConnection(true);
        try {
            const payload = {
                provider: agentConfig.provider,
                model_name: agentConfig.model_name,
                base_url: agentConfig.base_url,
                api_key: agentConfig.api_key
            };
            const res = await agentsAPI.testConnection(payload);
            showSuccess(res.message || 'LLM Connection successful!');
        } catch (err) {
            showError(err.response?.data?.error || 'Connection to LLM provider failed.');
        } finally {
            setTestingConnection(false);
        }
    };

    const handleUpdateAgentPermissionTier = async (agentName, tier) => {
        const updated = agentPermissions.map(p =>
            p.agent_name === agentName ? { ...p, tier } : p
        );
        setAgentPermissions(updated);
        try {
            await agentsAPI.updatePermissions(updated);
            showSuccess(`Updated ${agentName} agent tier.`);
        } catch (err) {
            showError('Failed to update agent tier.');
            loadAgentData();
        }
    };

    const handleToggleAgentEnabled = async (agentName, enabled) => {
        const updated = agentPermissions.map(p =>
            p.agent_name === agentName ? { ...p, enabled } : p
        );
        setAgentPermissions(updated);
        try {
            await agentsAPI.updatePermissions(updated);
            showSuccess(`${agentName} agent ${enabled ? 'enabled' : 'disabled'}.`);
        } catch (err) {
            showError('Failed to toggle agent.');
            loadAgentData();
        }
    };

    const [showAdvancedTiers, setShowAdvancedTiers] = useState(false);
    const [showAuditLogs, setShowAuditLogs] = useState(false);

    // Derive active preset
    const currentPreset = (() => {
        if (!agentPermissions.length) return 'ask_always';
        const analytics = agentPermissions.find(p => p.agent_name === 'analytics')?.tier;
        const reminder = agentPermissions.find(p => p.agent_name === 'reminder')?.tier;
        const billing = agentPermissions.find(p => p.agent_name === 'billing')?.tier;
        const inventory = agentPermissions.find(p => p.agent_name === 'inventory')?.tier;
        const product = agentPermissions.find(p => p.agent_name === 'product')?.tier;

        if (analytics === 'full_autonomy' && reminder === 'full_autonomy' && billing === 'suggest_confirm' && inventory === 'suggest_confirm' && product === 'suggest_confirm') {
            return 'small_auto';
        }
        if (billing === 'suggest_confirm' && inventory === 'suggest_confirm' && product === 'suggest_confirm' && reminder === 'suggest_confirm') {
            return 'ask_always';
        }
        return 'custom';
    })();

    const handleApplyPreset = async (preset) => {
        let updated;
        if (preset === 'ask_always') {
            updated = agentPermissions.map(p => ({
                ...p,
                tier: 'suggest_confirm'
            }));
        } else if (preset === 'small_auto') {
            updated = agentPermissions.map(p => {
                if (p.agent_name === 'analytics' || p.agent_name === 'reminder') {
                    return { ...p, tier: 'full_autonomy' };
                }
                return { ...p, tier: 'suggest_confirm' };
            });
        } else {
            return;
        }

        setAgentPermissions(updated);
        try {
            await agentsAPI.updatePermissions(updated);
            showSuccess(preset === 'ask_always' ? 'Preset active: Confirm before changes.' : 'Preset active: Small tasks execute automatically.');
        } catch (err) {
            showError('Failed to update agent autonomy preset.');
            loadAgentData();
        }
    };

    const handleFilterAuditLogs = async (agent = logFilterAgent, status = logFilterStatus) => {
        try {
            const params = { limit: 50 };
            if (agent) params.agent = agent;
            if (status) params.status = status;
            const res = await agentsAPI.getAuditLogs(params);
            if (res.success && res.logs) {
                setAgentLogs(res.logs);
            }
        } catch (err) {
            console.error('Failed to filter logs:', err);
        }
    };

    // Live API & IPC Diagnostics Events Listener
    useEffect(() => {
        if (!devModeEnabled) return;

        const handleApiDiagnostic = (e) => {
            setApiLogs(prev => {
                const updated = [e.detail, ...prev];
                return updated.slice(0, 100);
            });
        };

        const handleIpcDiagnostic = (e) => {
            setIpcLogs(prev => {
                const updated = [e.detail, ...prev];
                return updated.slice(0, 100);
            });
        };

        window.addEventListener('api-diagnostic', handleApiDiagnostic);
        window.addEventListener('ipc-diagnostic', handleIpcDiagnostic);

        return () => {
            window.removeEventListener('api-diagnostic', handleApiDiagnostic);
            window.removeEventListener('ipc-diagnostic', handleIpcDiagnostic);
        };
    }, [devModeEnabled]);

    const handleDevModeToggle = async (e) => {
        const val = e.target.checked;
        setDevModeEnabled(val);
        if (window.electronAPI && window.electronAPI.setDevMode) {
            try {
                const success = await window.electronAPI.setDevMode(val);
                if (success) {
                    showSuccess(`Developer Mode: ${val ? 'Enabled' : 'Disabled'}`);
                    if (!val) {
                        setDiagnosticInfo(null);
                        setApiLogs([]);
                        setIpcLogs([]);
                        setFileLogs([]);
                    }
                } else {
                    showError('Failed to save developer mode status');
                    setDevModeEnabled(!val);
                }
            } catch (err) {
                showError('Failed to toggle Developer Mode');
                setDevModeEnabled(!val);
            }
        }
    };

    const handleOpenDevTools = async () => {
        if (window.electronAPI?.openDevTools) {
            await window.electronAPI.openDevTools();
            showSuccess('DevTools opened');
        } else {
            showError('DevTools not available');
        }
    };

    const handleReloadWindow = async () => {
        if (window.electronAPI?.reloadWindow) {
            await window.electronAPI.reloadWindow();
        } else {
            window.location.reload();
        }
    };

    const handleRestartBackend = async () => {
        const confirmed = await showConfirm({
            title: 'Restart Backend',
            description: 'Are you sure you want to restart the local POS backend? All active server connections will be temporarily closed.',
            confirmLabel: 'Restart',
            variant: 'warning',
        });
        if (!confirmed) return;

        setRestartingBackend(true);
        try {
            if (window.electronAPI?.restartBackend) {
                const res = await window.electronAPI.restartBackend();
                if (res.success) {
                    showSuccess('Backend restarted successfully');
                } else {
                    showError('Restart failed: ' + res.error);
                }
            } else {
                showError('Backend control not supported on this platform');
            }
        } catch (err) {
            showError('Restart failed: ' + err.message);
        } finally {
            setRestartingBackend(false);
        }
    };

    const handleOpenLogsFolder = async () => {
        if (window.electronAPI?.openLogsFolder) {
            const ok = await window.electronAPI.openLogsFolder();
            if (ok) showSuccess('Logs folder opened');
            else showError('Could not open logs folder');
        }
    };

    const handleOpenUserDataFolder = async () => {
        if (window.electronAPI?.openUserDataFolder) {
            const ok = await window.electronAPI.openUserDataFolder();
            if (ok) showSuccess('User data folder opened');
            else showError('Could not open user data folder');
        }
    };

    const handleClearCache = async () => {
        const confirmed = await showConfirm({
            title: 'Clear Cache',
            description: 'This will clear Electron HTTP caches and reload the application window. Continue?',
            confirmLabel: 'Clear & Reload',
            variant: 'danger',
        });
        if (!confirmed) return;

        if (window.electronAPI?.clearCache) {
            await window.electronAPI.clearCache();
        } else {
            showError('Clear cache not supported');
        }
    };

    const handleCopyDebugInfo = () => {
        if (!diagnosticInfo) {
            showError('No diagnostics info available');
            return;
        }
        const spec = {
            Diagnostics: diagnosticInfo,
            NetworkOnline: navigator.onLine,
            BrowserUserAgent: navigator.userAgent,
            Timestamp: new Date().toISOString()
        };
        navigator.clipboard.writeText(JSON.stringify(spec, null, 2));
        showSuccess('Debug Info copied to clipboard');
    };

    const handleExportDebugReport = async () => {
        if (!diagnosticInfo) {
            showError('No diagnostics info available');
            return;
        }
        
        try {
            const report = {
                spec: {
                    Diagnostics: diagnosticInfo,
                    NetworkOnline: navigator.onLine,
                    BrowserUserAgent: navigator.userAgent,
                    Timestamp: new Date().toISOString()
                },
                logs: fileLogs,
                apiHistory: apiLogs,
                ipcHistory: ipcLogs
            };
            
            const base64Data = btoa(unescape(encodeURIComponent(JSON.stringify(report, null, 2))));
            const dateStr = new Date().toISOString().split('T')[0];
            const filename = `infoos_debug_report_${dateStr}.json`;
            
            if (window.electronAPI?.saveFile) {
                const res = await window.electronAPI.saveFile(filename, base64Data);
                if (res.success) {
                    showSuccess('Debug report exported successfully');
                } else if (!res.cancelled) {
                    showError('Failed to save report: ' + res.error);
                }
            } else {
                const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                a.click();
                URL.revokeObjectURL(url);
                showSuccess('Debug report downloaded');
            }
        } catch (err) {
            showError('Export failed: ' + err.message);
        }
    };

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
        // 1. Recover session from disk if localStorage is empty (after app update or restart)
        await restoreAuthSessionFromDisk();

        let token = localStorage.getItem('cloud_auth_token');
        let email = localStorage.getItem('cloud_user_email') || '';

        // 2. Proactively refresh cloud session if online or if token is expired
        if (navigator.onLine && localStorage.getItem('cloud_refresh_token')) {
            try {
                const refreshedToken = await cloudAuthAPI.refreshSession();
                if (refreshedToken) {
                    token = refreshedToken;
                }
            } catch (refreshErr) {
                console.warn('Settings session refresh failed:', refreshErr);
            }
        }

        // 3. Check for local activation cache as offline/transient fallback
        const cache = localStorage.getItem('infoos_activation_cache');
        let cachedSub = null;
        if (cache) {
            try {
                let decrypted = '';
                if (window.electronAPI?.secureDecrypt) {
                    decrypted = await window.electronAPI.secureDecrypt(cache);
                } else {
                    decrypted = atob(cache);
                }
                cachedSub = JSON.parse(decrypted);
            } catch (e) {
                console.warn('Failed to parse cached activation:', e);
            }
        }

        if (!token && !cachedSub) {
            setCloudStatus(prev => ({ ...prev, loggedIn: false, loading: false }));
            return;
        }

        setCloudStatus(prev => ({ ...prev, loading: true }));
        if (token) setCloudAuthToken(token);

        let subStatus = 'inactive';
        let subExpiry = null;
        let role = 'standalone';

        if (token) {
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                const userId = payload.sub;
                
                // Use cloudLicenseAPI for robust subscription checking
                const subscription = await cloudLicenseAPI.getSubscription(userId, token);
                if (subscription) {
                    subStatus = subscription.status || 'inactive';
                    if (subscription.expiry_date) {
                        subExpiry = new Date(subscription.expiry_date).toLocaleDateString();
                    }
                }
            } catch (err) {
                console.error('Failed to load subscription status:', err);
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
        }

        // If network fetch failed or returned inactive (e.g. offline/timeout), fallback to valid local activation cache
        if (subStatus === 'inactive' && cachedSub && cachedSub.subscription_expiry) {
            const expiryDate = new Date(cachedSub.subscription_expiry);
            if (expiryDate > new Date()) {
                subStatus = 'active';
                subExpiry = expiryDate.toLocaleDateString();
            }
        }

        let userId = null;
        if (token) {
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                userId = payload.sub;
            } catch (e) {
                console.error('Failed to parse token payload:', e);
            }
        } else if (cachedSub) {
            userId = cachedSub.user_id;
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
            const now = new Date();
            const dayOfWeek = now.getDay();
            const daysSinceMonday = (dayOfWeek + 6) % 7;

            const currentWeekMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday);
            const currentWeekStartStr = getLocalDateString(currentWeekMonday);

            const prevWeekMonday = new Date(currentWeekMonday.getFullYear(), currentWeekMonday.getMonth(), currentWeekMonday.getDate() - 7);
            const prevWeekStartStr = getLocalDateString(prevWeekMonday);

            const weeksToSync = [prevWeekStartStr, currentWeekStartStr];
            let syncedCount = 0;

            for (const targetWeekStr of weeksToSync) {
                const summaryRes = await summaryAPI.getRangeSummary('week', targetWeekStr);
                if (summaryRes.data?.success && summaryRes.data.summary) {
                    const summary = summaryRes.data.summary;
                    const weekStartStr = summary.start_date;

                    const expenseDetails = (summary.expenses || []).map(e => ({
                        name: e.name,
                        amount: e.amount
                    }));

                    const payload = {
                        userId,
                        weekStartDate: weekStartStr,
                        totalSales: summary.total_sales,
                        totalExpenses: summary.total_expenses,
                        salesDetails: (summary.products || []).map(p => ({
                            name: p.name,
                            amount: p.total_amount
                        })),
                        expenseDetails
                    };

                    await cloudSyncAPI.syncBackup(payload);
                    syncedCount++;
                }
            }

            showSuccess(`Success! Synced ${syncedCount} weekly backup(s) (previous week starting ${prevWeekStartStr} & current week) to cloud.`);
        } catch (err) {
            console.error('Manual weekly sync failed:', err);
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
            const now = new Date();
            const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const prevMonthStartStr = getLocalDateString(prevMonthDate);
            const currentMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);
            const currentMonthStartStr = getLocalDateString(currentMonthDate);

            const monthsToSync = [prevMonthStartStr, currentMonthStartStr];
            let syncedCount = 0;

            for (const targetMonthStr of monthsToSync) {
                const summaryRes = await summaryAPI.getRangeSummary('month', targetMonthStr);
                if (summaryRes.data?.success && summaryRes.data.summary) {
                    const summary = summaryRes.data.summary;
                    const monthStartStr = summary.start_date;

                    const expenseDetails = (summary.expenses || []).map(e => ({
                        name: e.name,
                        amount: e.amount
                    }));

                    const payload = {
                        userId,
                        monthStartDate: monthStartStr,
                        totalSales: summary.total_sales,
                        totalExpenses: summary.total_expenses,
                        salesDetails: (summary.products || []).map(p => ({
                            name: p.name,
                            amount: p.total_amount
                        })),
                        expenseDetails
                    };

                    await cloudSyncAPI.syncMonthlyBackup(payload);
                    syncedCount++;
                }
            }

            showSuccess(`Success! Synced ${syncedCount} monthly backup(s) (previous month starting ${prevMonthStartStr} & current month) to cloud.`);
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
        logo_url: '',
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
        reminder_sound: 'reminder.mp3',

        // Default Group & Idle Timeout
        default_group_id: '',
        idle_timeout_enabled: 'false',
        idle_timeout_minutes: '5'
    });

    const [activeGroupsList, setActiveGroupsList] = useState([]);
    useEffect(() => {
        const loadActiveGroups = async () => {
            try {
                const res = await api.get('/api/groups?include_inactive=false');
                if (res.data?.success) {
                    setActiveGroupsList(res.data.groups || []);
                }
            } catch (e) {
                console.error('Failed to load active groups in Settings:', e);
            }
        };
        loadActiveGroups();
    }, []);

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
        previewSoundFile(formSettings.reminder_sound).catch(e => showError('Cannot play sound: ' + e.message));
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
        { id: 'agents', label: 'AI Agents', icon: IoSparklesOutline },
        { id: 'cloud', label: 'Cloud Sync & About', icon: IoCloudUploadOutline },
        { id: 'advanced', label: 'Advanced', icon: IoConstructOutline }
    ];

    if (loading) {
        return <PageContainer><Card>Loading settings...</Card></PageContainer>;
    }

    return (
        <PageContainer>
            <div className="stPage">
                <div className="stStickyHeader">
                    {/* Top Bar with Title, Logout, and Save Actions */}
                    <div className="stTopBar">
                        <div className="stTopBarLeft">
                            <div className="stTitle">System Settings</div>
                            <Button 
                                variant="secondary" 
                                style={{ borderColor: '#ef4444', color: '#ef4444', height: '36px', padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: '6px' }} 
                                onClick={() => {
                                    window.dispatchEvent(new CustomEvent('licensing-logout'));
                                }}
                            >
                                <IoLogOutOutline size={16} />
                                Logout
                            </Button>
                        </div>

                        <div className="stTopBarRight">
                            <Button 
                                variant="secondary" 
                                style={{ height: '36px', padding: '0 16px' }}
                                onClick={handleDiscard}
                            >
                                Discard Changes
                            </Button>
                            <Button
                                variant="primary"
                                style={{ height: '36px', padding: '0 18px' }}
                                onClick={handleSave}
                                loading={saving}
                            >
                                {saving ? 'Saving...' : 'Save Settings'}
                            </Button>
                        </div>
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
                                            <span className="stLabelTitle">Shop Logo</span>
                                            <span className="stLabelDesc">Logo displayed on header navigation button, bills, and reports</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                            {formSettings.logo_url ? (
                                                <div style={{
                                                    width: '54px',
                                                    height: '54px',
                                                    borderRadius: '12px',
                                                    overflow: 'hidden',
                                                    border: 'none',
                                                    background: 'var(--bg-secondary, #1a1d24)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    flexShrink: 0,
                                                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                                                }}>
                                                    <img
                                                        src={formSettings.logo_url}
                                                        alt="Shop Logo"
                                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                    />
                                                </div>
                                            ) : (
                                                <div style={{
                                                    width: '54px',
                                                    height: '54px',
                                                    borderRadius: '12px',
                                                    border: '1.5px dashed var(--border-primary, rgba(255,255,255,0.2))',
                                                    background: 'var(--bg-secondary, rgba(255,255,255,0.03))',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '4px',
                                                    color: 'var(--text-muted, #94a3b8)',
                                                    flexShrink: 0,
                                                }}>
                                                    <IoCloudUploadOutline size={18} />
                                                    <span style={{ fontSize: '10px', fontWeight: 600 }}>No Logo</span>
                                                </div>
                                            )}

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                                <label style={{
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '7px',
                                                    padding: '8px 14px',
                                                    borderRadius: '10px',
                                                    fontSize: '13px',
                                                    fontWeight: 600,
                                                    background: 'var(--primary-500, #f97316)',
                                                    color: '#FFFFFF',
                                                    boxShadow: '0 2px 6px rgba(249, 115, 22, 0.25)',
                                                    userSelect: 'none',
                                                    transition: 'opacity 0.15s ease',
                                                }}>
                                                    <IoCloudUploadOutline size={16} />
                                                    {formSettings.logo_url ? 'Change Logo' : 'Upload Logo'}
                                                    <input
                                                        type="file"
                                                        accept="image/png, image/jpeg, image/webp, image/svg+xml"
                                                        style={{ display: 'none' }}
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) {
                                                                if (file.size > 2 * 1024 * 1024) {
                                                                    showError('Logo image must be under 2MB');
                                                                    return;
                                                                }
                                                                const reader = new FileReader();
                                                                reader.onload = () => {
                                                                    handleChange('logo_url', reader.result);
                                                                    showSuccess('Logo selected! Click Save to apply.');
                                                                };
                                                                reader.readAsDataURL(file);
                                                            }
                                                        }}
                                                    />
                                                </label>

                                                {formSettings.logo_url && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleChange('logo_url', '')}
                                                        style={{
                                                            padding: '8px 12px',
                                                            borderRadius: '10px',
                                                            fontSize: '13px',
                                                            fontWeight: 600,
                                                            cursor: 'pointer',
                                                            background: 'rgba(239, 68, 68, 0.12)',
                                                            color: '#ef4444',
                                                            border: '1px solid rgba(239, 68, 68, 0.25)',
                                                            transition: 'background 0.15s ease',
                                                        }}
                                                    >
                                                        Remove
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>

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
                                        <div style={{ display: 'flex', gap: '10px', maxWidth: '580px', width: '100%' }}>
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

                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Default Item Group</span>
                                            <span className="stLabelDesc">Designate a group to open by default on the Bill Screen and Sales/Analytics Screen</span>
                                        </div>
                                        <Dropdown
                                            options={[
                                                { label: 'None (Disabled)', value: '' },
                                                ...activeGroupsList.map(g => ({
                                                    label: g.name,
                                                    value: g.id.toString()
                                                }))
                                            ]}
                                            value={formSettings.default_group_id || ''}
                                            onChange={(val) => {
                                                handleChange('default_group_id', val);
                                                if (!val) {
                                                    handleChange('idle_timeout_enabled', 'false');
                                                }
                                            }}
                                            placeholder="Select Default Group"
                                            className="stDropdown"
                                            zIndex={40}
                                        />
                                    </div>

                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Auto-Switch to Default Group on Idle</span>
                                            <span className="stLabelDesc">Automatically switch the Bill Screen back to the Default Group when inactive with an empty bill</span>
                                        </div>
                                        <label className="stToggle">
                                            <input
                                                type="checkbox"
                                                checked={formSettings.idle_timeout_enabled === 'true'}
                                                onChange={(e) => {
                                                    if (e.target.checked && (!formSettings.default_group_id || formSettings.default_group_id === '')) {
                                                        showError('Please select a Default Item Group above before enabling Idle Timeout.');
                                                        return;
                                                    }
                                                    handleChange('idle_timeout_enabled', e.target.checked ? 'true' : 'false');
                                                }}
                                            />
                                            <span className="stSlider"></span>
                                        </label>
                                    </div>

                                    {formSettings.idle_timeout_enabled === 'true' && (
                                        <div className="stFormGroup">
                                            <div className="stLabel">
                                                <span className="stLabelTitle">Idle Timeout Duration (Minutes)</span>
                                                <span className="stLabelDesc">Minutes of inactivity before returning to Default Group (1 to 60)</span>
                                            </div>
                                            <input
                                                type="number"
                                                min="1"
                                                max="60"
                                                className="stInput"
                                                style={{ width: '120px' }}
                                                value={formSettings.idle_timeout_minutes || '5'}
                                                onChange={(e) => {
                                                    const num = parseInt(e.target.value, 10);
                                                    const val = isNaN(num) ? '5' : Math.max(1, Math.min(60, num)).toString();
                                                    handleChange('idle_timeout_minutes', val);
                                                }}
                                            />
                                        </div>
                                    )}

                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Lock Group Selection (Keyboard Only)</span>
                                            <span className="stLabelDesc">Disable mouse clicks on Group selector so group can only be switched using shortcut key (Ctrl key)</span>
                                        </div>
                                        <label className="stToggle">
                                            <input
                                                type="checkbox"
                                                checked={formSettings.lock_group_select === 'true'}
                                                onChange={(e) => handleChange('lock_group_select', e.target.checked ? 'true' : 'false')}
                                            />
                                            <span className="stSlider"></span>
                                        </label>
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

                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Order Milestone Celebrations</span>
                                            <span className="stLabelDesc">Exciting confetti and victory fanfare audio on 10, 25, 50, 100, 200, 300 orders</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    window.dispatchEvent(new CustomEvent('celebrate-order-milestone', {
                                                        detail: {
                                                            count: 50,
                                                            tier: 'orange',
                                                            icon: 'star',
                                                            is_grand: false,
                                                            title: 'Half-Century Milestone!',
                                                            subtitle: '50 orders completed today. Outstanding work!'
                                                        }
                                                    }));
                                                }}
                                                style={{
                                                    padding: '6px 12px',
                                                    borderRadius: '10px',
                                                    fontSize: '12px',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                    background: 'rgba(249, 115, 22, 0.12)',
                                                    color: '#f97316',
                                                    border: '1px solid rgba(249, 115, 22, 0.3)',
                                                    transition: 'all 0.15s ease'
                                                }}
                                                title="Test Standard Milestone Celebration"
                                            >
                                                Test 50 Orders
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    window.dispatchEvent(new CustomEvent('celebrate-order-milestone', {
                                                        detail: {
                                                            count: 500,
                                                            tier: 'gold',
                                                            icon: 'trophy',
                                                            is_grand: true,
                                                            title: 'Grand Order Milestone!',
                                                            subtitle: '500 orders completed today! Legendary achievement!'
                                                        }
                                                    }));
                                                }}
                                                style={{
                                                    padding: '6px 12px',
                                                    borderRadius: '10px',
                                                    fontSize: '12px',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                    background: 'rgba(245, 158, 11, 0.14)',
                                                    color: '#d97706',
                                                    border: '1px solid rgba(245, 158, 11, 0.35)',
                                                    transition: 'all 0.15s ease'
                                                }}
                                                title="Test Grand Milestone Celebration"
                                            >
                                                Test 500 Orders
                                            </button>
                                            <label className="stToggle">
                                                <input
                                                    type="checkbox"
                                                    checked={formSettings.milestone_celebrations_enabled !== 'false'}
                                                    onChange={(e) => {
                                                        const val = e.target.checked ? 'true' : 'false';
                                                        handleChange('milestone_celebrations_enabled', val);
                                                        localStorage.setItem('disable_milestone_celebrations', e.target.checked ? 'false' : 'true');
                                                    }}
                                                />
                                                <span className="stSlider"></span>
                                            </label>
                                        </div>
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

                                    {/* Notification Cleanup Retention */}
                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Notification Auto-Cleanup</span>
                                            <span className="stLabelDesc">Automatically delete notification history older than selected timeframe</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
                                            <Dropdown
                                                options={[
                                                    { label: '7 Days', value: '7' },
                                                    { label: '30 Days', value: '30' },
                                                    { label: '90 Days', value: '90' },
                                                    { label: 'Never (Keep All)', value: 'never' }
                                                ]}
                                                value={formSettings.notification_retention || '30'}
                                                onChange={async (val) => {
                                                    handleChange('notification_retention', val);
                                                    try {
                                                        await updateSettings({ ...formSettings, notification_retention: val });
                                                        showSuccess(`Notification retention updated to ${val === 'never' ? 'Never' : val + ' days'}`);
                                                    } catch (err) {
                                                        showError('Failed to update notification retention');
                                                    }
                                                }}
                                                placeholder="Select retention timeframe"
                                                className="stDropdown"
                                                zIndex={38}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {activeTab === 'workers' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                <div style={{ marginBottom: '4px' }}>
                                    <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>Worker Configuration</h2>
                                    <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: 0 }}>Manage salary settings and worker types</p>
                                </div>

                                <div style={{
                                    padding: '24px',
                                    background: isDark ? 'var(--surface-primary)' : '#FFFFFF',
                                    border: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1',
                                    borderRadius: '16px',
                                    boxShadow: isDark ? 'none' : '0 1px 4px rgba(15, 23, 42, 0.05)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '20px'
                                }}>
                                    <div>
                                        <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>Salary Settings</h3>
                                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>Configure how worker salary payout dates are determined</p>
                                    </div>

                                    {/* Toggle: Use Common Salary Date For All Workers */}
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '16px 20px',
                                        background: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC',
                                        border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #CBD5E1',
                                        borderRadius: '14px'
                                    }}>
                                        <div style={{ flex: 1, paddingRight: '16px' }}>
                                            <div style={{ fontSize: '14.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                Use Common Salary Date For All Workers
                                            </div>
                                            <div style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginTop: '3px' }}>
                                                {(formSettings.salary_date_mode || 'GLOBAL') === 'GLOBAL'
                                                    ? 'Enabled — All workers inherit a single global monthly salary date.'
                                                    : 'Disabled — Every worker has an independent salary date configured in their profile.'}
                                            </div>
                                        </div>

                                        {/* Toggle Button */}
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                const isGlobal = (formSettings.salary_date_mode || 'GLOBAL') === 'GLOBAL';
                                                const nextMode = isGlobal ? 'WORKER' : 'GLOBAL';
                                                handleChange('salary_date_mode', nextMode);
                                                try {
                                                    await updateSettings({
                                                        ...formSettings,
                                                        salary_date_mode: nextMode
                                                    });
                                                    showSuccess(`Switched to ${nextMode === 'GLOBAL' ? 'Common Salary Date' : 'Individual Worker Salary Dates'} mode`);
                                                } catch (err) {
                                                    showError('Failed to update salary date mode');
                                                }
                                            }}
                                            style={{
                                                width: '50px',
                                                height: '28px',
                                                borderRadius: '14px',
                                                background: (formSettings.salary_date_mode || 'GLOBAL') === 'GLOBAL' ? 'linear-gradient(135deg, #FF8A00 0%, #FF6500 100%)' : (isDark ? 'rgba(255,255,255,0.18)' : '#CBD5E1'),
                                                border: 'none',
                                                cursor: 'pointer',
                                                position: 'relative',
                                                transition: 'background-color 0.2s ease',
                                                padding: '3px',
                                                flexShrink: 0
                                            }}
                                        >
                                            <div style={{
                                                width: '22px',
                                                height: '22px',
                                                borderRadius: '50%',
                                                background: '#FFFFFF',
                                                transform: (formSettings.salary_date_mode || 'GLOBAL') === 'GLOBAL' ? 'translateX(22px)' : 'translateX(0px)',
                                                transition: 'transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                                                boxShadow: '0 2px 5px rgba(0,0,0,0.3)'
                                            }} />
                                        </button>
                                    </div>

                                    {/* Dynamic Fields with Smooth Framer Motion Animations */}
                                    <AnimatePresence mode="wait">
                                        {(formSettings.salary_date_mode || 'GLOBAL') === 'GLOBAL' ? (
                                            <motion.div
                                                key="global-salary-picker"
                                                initial={{ opacity: 0, y: -8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -8 }}
                                                transition={{ duration: 0.18 }}
                                            >
                                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>Monthly Salary Date</label>
                                                <div style={{ width: '100%' }}>
                                                    <GlobalDatePicker
                                                        value={(() => {
                                                            const day = parseInt(formSettings.global_salary_day || formSettings.salary_day) || 10;
                                                            const now = new Date();
                                                            return getLocalDateString(new Date(now.getFullYear(), now.getMonth(), day));
                                                        })()}
                                                        onChange={(dateStr) => {
                                                            if (dateStr) {
                                                                const parts = dateStr.split('-');
                                                                if (parts.length === 3) {
                                                                    const day = parseInt(parts[2]);
                                                                    handleChange('global_salary_day', day.toString());
                                                                    handleChange('salary_day', day.toString());
                                                                }
                                                            }
                                                        }}
                                                        placeholder="Select Salary Day"
                                                    />
                                                    <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-tertiary)' }}>
                                                        Selected: <strong style={{ color: 'var(--text-primary)' }}>Day {formSettings.global_salary_day || formSettings.salary_day || 10}</strong> of every month
                                                    </div>
                                                </div>
                                            </motion.div>
                                        ) : (
                                            <motion.div
                                                key="worker-salary-info"
                                                initial={{ opacity: 0, y: -8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -8 }}
                                                transition={{ duration: 0.18 }}
                                                style={{
                                                    padding: '14px 18px',
                                                    background: isDark ? 'rgba(249, 115, 22, 0.08)' : '#FFF7ED',
                                                    border: isDark ? '1px solid rgba(249, 115, 22, 0.2)' : '1px solid #FDBA74',
                                                    borderRadius: '12px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '12px'
                                                }}
                                            >
                                                <IoInformationCircleOutline size={24} color="#F97316" style={{ flexShrink: 0 }} />
                                                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                                                    <strong>Individual Worker Salary Dates Active:</strong> Advance partitions are calculated dynamically using each worker's individual salary date (configured on their worker profile). If a worker does not have an individual salary date set, the system automatically falls back to that worker's Start Date (day of month).
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                <div style={{
                                    padding: '24px',
                                    background: isDark ? 'var(--surface-primary)' : '#FFFFFF',
                                    border: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1',
                                    borderRadius: '16px',
                                    boxShadow: isDark ? 'none' : '0 1px 4px rgba(15, 23, 42, 0.05)',
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
                                                                padding: '18px',
                                                                background: isDark ? 'rgba(255,138,0,0.08)' : '#FFF7ED',
                                                                border: '1.5px dashed #FF8A00',
                                                                borderRadius: '14px',
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                gap: '12px'
                                                            }}>
                                                                <div>
                                                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                                                        Name *
                                                                    </label>
                                                                    <input
                                                                        type="text"
                                                                        value={workerTypeForm.name}
                                                                        onChange={(e) => setWorkerTypeForm({ ...workerTypeForm, name: e.target.value })}
                                                                        style={{
                                                                            width: '100%',
                                                                            padding: '10px 14px',
                                                                            borderRadius: '10px',
                                                                            border: isDark ? '1px solid var(--border-secondary)' : '1px solid #CBD5E1',
                                                                            background: isDark ? 'var(--surface-secondary)' : '#FFFFFF',
                                                                            color: 'var(--text-primary)',
                                                                            fontSize: '14px',
                                                                            outline: 'none'
                                                                        }}
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                                                        Description
                                                                    </label>
                                                                    <textarea
                                                                        value={workerTypeForm.description}
                                                                        onChange={(e) => setWorkerTypeForm({ ...workerTypeForm, description: e.target.value })}
                                                                        rows={2}
                                                                        style={{
                                                                            width: '100%',
                                                                            padding: '10px 14px',
                                                                            borderRadius: '10px',
                                                                            border: isDark ? '1px solid var(--border-secondary)' : '1px solid #CBD5E1',
                                                                            background: isDark ? 'var(--surface-secondary)' : '#FFFFFF',
                                                                            color: 'var(--text-primary)',
                                                                            fontSize: '14px',
                                                                            resize: 'vertical',
                                                                            outline: 'none'
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
                                                                    <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>Active</label>
                                                                </div>
                                                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                                    <Button
                                                                        onClick={() => setEditingWorkerType(null)}
                                                                        variant="secondary"
                                                                        size="sm"
                                                                        style={{ height: '34px', padding: '0 14px' }}
                                                                    >
                                                                        Cancel
                                                                    </Button>
                                                                    <Button
                                                                        onClick={saveInlineWorkerType}
                                                                        size="sm"
                                                                        style={{ height: '34px', padding: '0 14px' }}
                                                                    >
                                                                        Save
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div
                                                                style={{
                                                                    padding: '16px 20px',
                                                                    background: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC',
                                                                    border: workerEditMode ? '1.5px dashed #FF8A00' : (isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1'),
                                                                    borderRadius: '14px',
                                                                    display: 'flex',
                                                                    justifyContent: 'space-between',
                                                                    alignItems: 'center',
                                                                    cursor: workerEditMode ? 'pointer' : 'default',
                                                                    transition: 'all 0.2s',
                                                                    boxShadow: isDark ? 'none' : '0 1px 2px rgba(15, 23, 42, 0.04)'
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
                                                                    <div style={{ fontSize: '12px', fontWeight: 600, color: type.is_active ? '#10B981' : '#EF4444', marginTop: '4px' }}>
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
                                <div style={{ marginBottom: '4px' }}>
                                    <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>Expense Configuration</h2>
                                    <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: 0 }}>Manage expense types for categorization</p>
                                </div>

                                <div style={{
                                    padding: '24px',
                                    background: isDark ? 'var(--surface-primary)' : '#FFFFFF',
                                    border: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1',
                                    borderRadius: '16px',
                                    boxShadow: isDark ? 'none' : '0 1px 4px rgba(15, 23, 42, 0.05)',
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
                                                            padding: '18px',
                                                            background: isDark ? 'rgba(255,138,0,0.08)' : '#FFF7ED',
                                                            border: '1.5px dashed #FF8A00',
                                                            borderRadius: '14px',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: '12px'
                                                        }}>
                                                            <div>
                                                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                                                    Name *
                                                                </label>
                                                                <input
                                                                    type="text"
                                                                    value={expenseTypeForm.name}
                                                                    onChange={(e) => setExpenseTypeForm({ ...expenseTypeForm, name: e.target.value })}
                                                                    style={{
                                                                        width: '100%',
                                                                        padding: '10px 14px',
                                                                        borderRadius: '10px',
                                                                        border: isDark ? '1px solid var(--border-secondary)' : '1px solid #CBD5E1',
                                                                        background: isDark ? 'var(--surface-secondary)' : '#FFFFFF',
                                                                        color: 'var(--text-primary)',
                                                                        fontSize: '14px',
                                                                        outline: 'none'
                                                                    }}
                                                                />
                                                            </div>
                                                            <div>
                                                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                                                    Description
                                                                </label>
                                                                <textarea
                                                                    value={expenseTypeForm.description}
                                                                    onChange={(e) => setExpenseTypeForm({ ...expenseTypeForm, description: e.target.value })}
                                                                    rows={2}
                                                                    style={{
                                                                        width: '100%',
                                                                        padding: '10px 14px',
                                                                        borderRadius: '10px',
                                                                        border: isDark ? '1px solid var(--border-secondary)' : '1px solid #CBD5E1',
                                                                        background: isDark ? 'var(--surface-secondary)' : '#FFFFFF',
                                                                        color: 'var(--text-primary)',
                                                                        fontSize: '14px',
                                                                        resize: 'vertical',
                                                                        outline: 'none'
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
                                                                <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>Active</label>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                                <Button
                                                                    onClick={() => setEditingExpenseType(null)}
                                                                    variant="secondary"
                                                                    size="sm"
                                                                    style={{ height: '34px', padding: '0 14px' }}
                                                                >
                                                                    Cancel
                                                                </Button>
                                                                <Button
                                                                    onClick={saveInlineExpenseType}
                                                                    size="sm"
                                                                    style={{ height: '34px', padding: '0 14px' }}
                                                                >
                                                                    Save
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div
                                                            style={{
                                                                padding: '16px 20px',
                                                                background: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC',
                                                                border: expenseEditMode ? '1.5px dashed #FF8A00' : (isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1'),
                                                                borderRadius: '14px',
                                                                display: 'flex',
                                                                justifyContent: 'space-between',
                                                                alignItems: 'center',
                                                                cursor: expenseEditMode ? 'pointer' : 'default',
                                                                transition: 'all 0.2s',
                                                                boxShadow: isDark ? 'none' : '0 1px 2px rgba(15, 23, 42, 0.04)'
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
                                                                <div style={{ fontSize: '12px', fontWeight: 600, color: type.is_active ? '#10B981' : '#EF4444', marginTop: '4px' }}>
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
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                                {/* Page Header with Status Badge */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <div>
                                        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>Security & Access</h2>
                                        <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: 0 }}>Manage authentication and access controls</p>
                                    </div>
                                    <div style={{
                                        padding: '6px 14px',
                                        borderRadius: '20px',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                        background: pinStatus.is_setup ? (isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5') : (isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2'),
                                        color: pinStatus.is_setup ? '#10B981' : '#EF4444',
                                        border: pinStatus.is_setup ? (isDark ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid #A7F3D0') : (isDark ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid #FECACA'),
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                                    }}>
                                        {pinStatus.is_setup ? '● Secured' : '○ Unsecured'}
                                    </div>
                                </div>

                                {/* Warning Banner */}
                                {formSettings.require_pin_login !== 'true' && (
                                    <div style={{
                                        padding: '14px 18px',
                                        background: isDark ? 'rgba(239, 68, 68, 0.08)' : '#FEF2F2',
                                        border: isDark ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid #FECACA',
                                        borderRadius: '12px',
                                        fontSize: '13.5px',
                                        color: isDark ? '#FCA5A5' : '#B91C1C',
                                        fontWeight: 500,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px'
                                    }}>
                                        <span>⚠️</span>
                                        <span>PIN requirement is disabled. Enable it to protect sensitive business areas and financial reports.</span>
                                    </div>
                                )}

                                {/* Settings Grid */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
                                    {/* Require PIN Toggle */}
                                    <div style={{
                                        padding: '20px 24px',
                                        background: isDark ? 'var(--surface-primary)' : '#FFFFFF',
                                        border: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1',
                                        borderRadius: '16px',
                                        boxShadow: isDark ? 'none' : '0 1px 4px rgba(15, 23, 42, 0.05)',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <div>
                                            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Require PIN for Owner Role</div>
                                            <div style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginTop: '2px' }}>Request PIN when switching to Owner role</div>
                                        </div>
                                        <label className="stToggle">
                                            <input
                                                type="checkbox"
                                                checked={formSettings.require_pin_login === 'true'}
                                                onChange={(e) => handleChange('require_pin_login', e.target.checked ? 'true' : 'false')}
                                            />
                                            <span className="stSlider"></span>
                                        </label>
                                    </div>

                                    {/* Authentication Card */}
                                    {formSettings.require_pin_login === 'true' && (
                                        <div style={{
                                            padding: '24px',
                                            background: isDark ? 'var(--surface-primary)' : '#FFFFFF',
                                            border: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1',
                                            borderRadius: '16px',
                                            boxShadow: isDark ? 'none' : '0 1px 4px rgba(15, 23, 42, 0.05)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '20px'
                                        }}>
                                            <div>
                                                <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Authentication PIN</div>
                                                <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Set or change your 4-6 digit security PIN</div>
                                            </div>

                                            {pinStatus.is_setup && pinStatus.enabled && formSettings.require_pin_login === 'true' && (
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>Current PIN</label>
                                                    <input
                                                        type="password"
                                                        inputMode="numeric"
                                                        maxLength={6}
                                                        value={pinForm.currentPin}
                                                        onChange={e => handlePinChange('currentPin', e.target.value.replace(/\D/g, ''))}
                                                        placeholder="Enter existing PIN"
                                                        className="stInput"
                                                        style={{
                                                            maxWidth: '300px'
                                                        }}
                                                    />
                                                </div>
                                            )}

                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>New PIN</label>
                                                    <input
                                                        type="password"
                                                        inputMode="numeric"
                                                        maxLength={6}
                                                        value={pinForm.newPin}
                                                        onChange={e => handlePinChange('newPin', e.target.value.replace(/\D/g, ''))}
                                                        placeholder="4–6 digits"
                                                        className="stInput"
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>Confirm PIN</label>
                                                    <input
                                                        type="password"
                                                        inputMode="numeric"
                                                        maxLength={6}
                                                        value={pinForm.confirmPin}
                                                        onChange={e => handlePinChange('confirmPin', e.target.value.replace(/\D/g, ''))}
                                                        placeholder="Repeat PIN"
                                                        className="stInput"
                                                    />
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', gap: '12px', paddingTop: '12px', borderTop: isDark ? '1px solid var(--border-secondary)' : '1px solid #F1F5F9', marginTop: '4px' }}>
                                                <Button
                                                    variant="primary"
                                                    onClick={handleSavePinChange}
                                                    loading={pinSaving}
                                                    disabled={!pinForm.newPin || !pinForm.confirmPin || pinSaving}
                                                    style={{ height: '38px', padding: '0 18px' }}
                                                >
                                                    {pinSaving ? 'Saving...' : pinStatus.is_setup ? 'Update PIN' : 'Set PIN'}
                                                </Button>

                                                {pinStatus.is_setup && (
                                                    <Button
                                                        variant="secondary"
                                                        onClick={handleResetPin}
                                                        disabled={pinSaving}
                                                        style={{ height: '38px', padding: '0 18px' }}
                                                    >
                                                        Reset
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Protected Areas Info */}
                                    <div style={{
                                        padding: '20px 24px',
                                        background: isDark ? 'var(--surface-primary)' : '#FFFFFF',
                                        border: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1',
                                        borderRadius: '16px',
                                        boxShadow: isDark ? 'none' : '0 1px 4px rgba(15, 23, 42, 0.05)'
                                    }}>
                                        <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px' }}>Protected Areas (Restricted to Owner)</div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                            {['Inventory Management', 'Sales & Analytics', 'Store Settings', 'Worker Payroll Records'].map((item, idx) => (
                                                <span key={idx} style={{
                                                    padding: '6px 14px',
                                                    background: isDark ? 'var(--bg-secondary)' : '#F1F5F9',
                                                    border: isDark ? '1px solid #3A3E48' : '1px solid #CBD5E1',
                                                    borderRadius: '10px',
                                                    fontSize: '12.5px',
                                                    fontWeight: 600,
                                                    color: isDark ? '#E2E8F0' : '#334155'
                                                }}>
                                                    🔒 {item}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'agents' && (
                            <div className="stSectionContainer">
                                <div className="stSectionTitle">
                                    <IoSparklesOutline size={22} color="var(--primary)" />
                                    AI Agents & Autonomous Assistants (BYO-Key)
                                </div>

                                <div className="stSectionContent" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    {/* Data Safety & Privacy Guarantee Banner */}
                                    <div style={{
                                        padding: '16px 20px',
                                        borderRadius: '14px',
                                        background: isDark ? 'rgba(249, 115, 22, 0.08)' : '#FFF7ED',
                                        border: isDark ? '1px solid rgba(249, 115, 22, 0.25)' : '1px solid #FDBA74',
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '14px',
                                    }}>
                                        <div style={{ fontSize: '24px', flexShrink: 0 }}>🛡️</div>
                                        <div style={{ fontSize: '13px', lineHeight: '1.5', color: 'var(--text-secondary)' }}>
                                            <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '2px' }}>
                                                Zero-Bypass Architecture & Local Key Encryption
                                            </strong>
                                            Agents never touch SQLite directly; all actions pass through the exact same validated service layers as the UI.
                                            API keys are encrypted locally at rest and never transmitted to any third party other than your chosen provider.
                                            <strong> Workers can never access agent features under any configuration.</strong>
                                        </div>
                                    </div>

                                    {/* Master Agent Switch */}
                                    <div style={{
                                        padding: '20px 24px',
                                        borderRadius: '16px',
                                        background: isDark ? 'var(--surface-primary)' : '#FFFFFF',
                                        border: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1',
                                        boxShadow: isDark ? 'none' : '0 1px 4px rgba(15, 23, 42, 0.05)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                    }}>
                                        <div>
                                            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                Master Agent Kill Switch
                                            </div>
                                            <div style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                                Instantly activate or deactivate all autonomous agent features across the entire system.
                                            </div>
                                        </div>
                                        <label className="stToggle">
                                            <input
                                                type="checkbox"
                                                checked={agentConfig.enabled}
                                                onChange={(e) => setAgentConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                                            />
                                            <span className="stSlider"></span>
                                        </label>
                                    </div>

                                    {/* Card 1 — Connect */}
                                    <div style={{
                                        padding: '24px',
                                        borderRadius: '16px',
                                        background: isDark ? 'var(--surface-primary)' : '#FFFFFF',
                                        border: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1',
                                        boxShadow: isDark ? 'none' : '0 1px 4px rgba(15, 23, 42, 0.05)',
                                    }}>
                                        <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                                            Card 1 — Connect
                                        </div>
                                        <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '18px' }}>
                                            Configure your LLM provider credentials. This one model applies to all agents throughout the entire system.
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                                            <div className="stFormGroup">
                                                <div className="stLabel">
                                                    <span className="stLabelTitle">Provider</span>
                                                    <span className="stLabelDesc">Choose your AI provider</span>
                                                </div>
                                                <GlobalSelect
                                                    options={[
                                                        { value: 'openai', label: 'OpenAI' },
                                                        { value: 'anthropic', label: 'Claude (Anthropic)' },
                                                        { value: 'google', label: 'Gemini (Google)' },
                                                        { value: 'custom_openai', label: 'Custom (Local or other)' }
                                                    ]}
                                                    value={agentConfig.provider}
                                                    onChange={(val) => {
                                                        const p = val;
                                                        let defModel = 'gpt-4o-mini';
                                                        if (p === 'anthropic') defModel = 'claude-3-5-sonnet-20241022';
                                                        else if (p === 'google') defModel = 'gemini-1.5-flash';
                                                        else if (p === 'custom_openai') defModel = 'llama3';
                                                        setAgentConfig(prev => ({ ...prev, provider: p, model_name: defModel }));
                                                    }}
                                                />
                                            </div>

                                            <div className="stFormGroup">
                                                <div className="stLabel">
                                                    <span className="stLabelTitle">Model Name</span>
                                                    <span className="stLabelDesc">User-specified model identifier</span>
                                                </div>
                                                <input
                                                    className="stInput"
                                                    value={agentConfig.model_name}
                                                    onChange={(e) => setAgentConfig(prev => ({ ...prev, model_name: e.target.value }))}
                                                    placeholder="e.g. gpt-4o-mini, claude-3-5-sonnet, gemini-1.5-flash"
                                                />
                                            </div>
                                        </div>

                                        {agentConfig.provider === 'custom_openai' && (
                                            <div className="stFormGroup" style={{ marginBottom: '16px' }}>
                                                <div className="stLabel">
                                                    <span className="stLabelTitle">Base URL</span>
                                                    <span className="stLabelDesc">Local or custom endpoint URL</span>
                                                </div>
                                                <input
                                                    className="stInput"
                                                    value={agentConfig.base_url}
                                                    onChange={(e) => setAgentConfig(prev => ({ ...prev, base_url: e.target.value }))}
                                                    placeholder="e.g. http://localhost:11434/v1 or https://api.groq.com/openai/v1"
                                                />
                                            </div>
                                        )}

                                        <div className="stFormGroup" style={{ marginBottom: '18px' }}>
                                            <div className="stLabel">
                                                <span className="stLabelTitle">API Key</span>
                                                <span className="stLabelDesc">
                                                    {agentConfig.has_api_key ? 'Encrypted key stored securely at rest' : 'Enter your provider API key'}
                                                </span>
                                            </div>
                                            <input
                                                type="password"
                                                className="stInput"
                                                value={agentConfig.api_key}
                                                onChange={(e) => setAgentConfig(prev => ({ ...prev, api_key: e.target.value }))}
                                                placeholder="sk-..."
                                            />
                                        </div>

                                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                            <Button
                                                variant="secondary"
                                                onClick={handleTestLlmConnection}
                                                loading={testingConnection}
                                                style={{ height: '38px' }}
                                            >
                                                Test Connection
                                            </Button>
                                            <Button
                                                variant="primary"
                                                onClick={handleSaveAgentConfig}
                                                loading={agentSaving}
                                                style={{ height: '38px' }}
                                            >
                                                Save AI Configuration
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Card 2 — What can it do without asking me? */}
                                    <div style={{
                                        padding: '24px',
                                        borderRadius: '16px',
                                        background: isDark ? 'var(--surface-primary)' : '#FFFFFF',
                                        border: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1',
                                        boxShadow: isDark ? 'none' : '0 1px 4px rgba(15, 23, 42, 0.05)',
                                    }}>
                                        <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                                            Card 2 — What can it do without asking me?
                                        </div>
                                        <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '18px' }}>
                                            Choose how autonomously the AI assistant operates before executing changes.
                                        </div>

                                        {/* Presets Radio Options */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '18px' }}>
                                            <label
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'flex-start',
                                                    gap: '12px',
                                                    padding: '16px 18px',
                                                    borderRadius: '12px',
                                                    background: currentPreset === 'ask_always' ? (isDark ? 'rgba(249, 115, 22, 0.12)' : '#FFF7ED') : (isDark ? 'var(--bg-secondary)' : '#F8FAFC'),
                                                    border: currentPreset === 'ask_always' ? '1.5px solid #FF8A00' : (isDark ? '1px solid var(--border-secondary)' : '1px solid #CBD5E1'),
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s ease',
                                                    boxShadow: currentPreset === 'ask_always' ? '0 2px 8px rgba(255, 138, 0, 0.15)' : 'none'
                                                }}
                                                onClick={() => handleApplyPreset('ask_always')}
                                            >
                                                <input
                                                    type="radio"
                                                    name="agent_preset"
                                                    checked={currentPreset === 'ask_always'}
                                                    onChange={() => handleApplyPreset('ask_always')}
                                                    style={{ marginTop: '3px', cursor: 'pointer', accentColor: '#FF8A00' }}
                                                />
                                                <div>
                                                    <div style={{ fontSize: '14.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                        Ask me before anything changes (default)
                                                    </div>
                                                    <div style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                                        Every agent prepares draft actions as Suggest & Confirm cards. Nothing in the database changes until you click Approve.
                                                    </div>
                                                </div>
                                            </label>

                                            <label
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'flex-start',
                                                    gap: '12px',
                                                    padding: '16px 18px',
                                                    borderRadius: '12px',
                                                    background: currentPreset === 'small_auto' ? (isDark ? 'rgba(249, 115, 22, 0.12)' : '#FFF7ED') : (isDark ? 'var(--bg-secondary)' : '#F8FAFC'),
                                                    border: currentPreset === 'small_auto' ? '1.5px solid #FF8A00' : (isDark ? '1px solid var(--border-secondary)' : '1px solid #CBD5E1'),
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s ease',
                                                    boxShadow: currentPreset === 'small_auto' ? '0 2px 8px rgba(255, 138, 0, 0.15)' : 'none'
                                                }}
                                                onClick={() => handleApplyPreset('small_auto')}
                                            >
                                                <input
                                                    type="radio"
                                                    name="agent_preset"
                                                    checked={currentPreset === 'small_auto'}
                                                    onChange={() => handleApplyPreset('small_auto')}
                                                    style={{ marginTop: '3px', cursor: 'pointer', accentColor: '#FF8A00' }}
                                                />
                                                <div>
                                                    <div style={{ fontSize: '14.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                        Let it handle small stuff automatically
                                                    </div>
                                                    <div style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                                        Reminders and Analytics execute automatically. Billing, inventory adjustments, menu updates, and expenses still ask for confirmation.
                                                    </div>
                                                </div>
                                            </label>
                                        </div>

                                        {/* Non-negotiable ceiling banner */}
                                        <div style={{
                                            fontSize: '12px',
                                            color: isDark ? '#E2E8F0' : '#475569',
                                            padding: '10px 14px',
                                            borderRadius: '10px',
                                            background: isDark ? 'rgba(255,255,255,0.04)' : '#F1F5F9',
                                            border: isDark ? '1px solid var(--border-secondary)' : '1px solid #CBD5E1',
                                            marginBottom: '16px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}>
                                            🔒 <span><strong>Non-negotiable ceiling:</strong> Payroll disbursement, old-bill voids, and hard deletes always require explicit owner confirmation regardless of preset.</span>
                                        </div>

                                        {/* Collapsible Advanced Settings Link */}
                                        <div>
                                            <button
                                                type="button"
                                                onClick={() => setShowAdvancedTiers(prev => !prev)}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    color: '#FF8A00',
                                                    fontSize: '13.5px',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    padding: '6px 0',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px'
                                                }}
                                            >
                                                <span>{showAdvancedTiers ? '▼' : '▶'}</span>
                                                <span>{showAdvancedTiers ? 'Hide Advanced Settings' : 'Advanced settings (Per-agent autonomy matrix)'}</span>
                                            </button>

                                            {showAdvancedTiers && (
                                                <div style={{ marginTop: '16px', overflowX: 'auto', borderRadius: '12px', border: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1' }}>
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                                        <thead>
                                                            <tr style={{ background: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC', borderBottom: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1', textAlign: 'left' }}>
                                                                <th style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontWeight: 600 }}>Domain Agent</th>
                                                                <th style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontWeight: 600 }}>Capabilities</th>
                                                                <th style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontWeight: 600 }}>Action Tier</th>
                                                                <th style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'center' }}>Enabled</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {agentPermissions.map((perm) => {
                                                                const isCeiling = perm.is_ceiling_locked;
                                                                return (
                                                                    <tr key={perm.agent_name} style={{ borderBottom: isDark ? '1px solid #2C2F36' : '1px solid #E2E8F0' }}>
                                                                        <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                                                                            {perm.agent_name}
                                                                            {isCeiling && (
                                                                                <span style={{ marginLeft: '6px', fontSize: '10px', padding: '2px 6px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', fontWeight: 600 }}>
                                                                                    Ceiling Locked
                                                                                </span>
                                                                            )}
                                                                        </td>
                                                                        <td style={{ padding: '12px 14px', color: 'var(--text-tertiary)', fontSize: '12px' }}>
                                                                            {perm.agent_name === 'billing' && 'Product lookup, receipt drafts, same-day voids'}
                                                                            {perm.agent_name === 'inventory' && 'Stock inquiries, adjustments, threshold updates'}
                                                                            {perm.agent_name === 'product' && 'Menu item CRUD, variations, group toggles'}
                                                                            {perm.agent_name === 'worker' && 'Attendance, salary advances, payroll review'}
                                                                            {perm.agent_name === 'expense' && 'Operational expense logging, spend analytics'}
                                                                            {perm.agent_name === 'analytics' && 'Sales summary, payment breakdown (Read-Only)'}
                                                                            {perm.agent_name === 'reminder' && 'Task scheduling, snoozing, alerts'}
                                                                        </td>
                                                                        <td style={{ padding: '12px 14px', minWidth: '220px' }}>
                                                                            <GlobalSelect
                                                                                options={[
                                                                                    { value: 'read_only', label: 'Read-Only (No Modifications)' },
                                                                                    { value: 'suggest_confirm', label: 'Suggest & Confirm (Approve/Reject)' },
                                                                                    ...(!isCeiling ? [{ value: 'full_autonomy', label: 'Full Autonomy (Auto-execute)' }] : [])
                                                                                ]}
                                                                                value={perm.tier}
                                                                                onChange={(val) => handleUpdateAgentPermissionTier(perm.agent_name, val)}
                                                                                style={{ width: '100%' }}
                                                                            />
                                                                        </td>
                                                                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={perm.enabled}
                                                                                onChange={(e) => handleToggleAgentEnabled(perm.agent_name, e.target.checked)}
                                                                                style={{ width: '16px', height: '16px', accentColor: '#FF8A00' }}
                                                                            />
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Card 3 — Usage today */}
                                    <div style={{
                                        padding: '24px',
                                        borderRadius: '16px',
                                        background: isDark ? 'var(--surface-primary)' : '#FFFFFF',
                                        border: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1',
                                        boxShadow: isDark ? 'none' : '0 1px 4px rgba(15, 23, 42, 0.05)',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                                            <div>
                                                <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                                                    AI Engine & Multi-Agent Status
                                                </h4>
                                                <div style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                                    Real-time status and operational health of Your Business AI.
                                                </div>
                                            </div>
                                            <Button variant="secondary" onClick={loadAgentData} style={{ height: '34px', fontSize: '12px' }}>
                                                Refresh Status
                                            </Button>
                                        </div>

                                        {/* Informative Verbal Summary */}
                                        <div style={{
                                            padding: '14px 18px',
                                            marginBottom: '20px',
                                            borderRadius: '12px',
                                            background: isDark ? 'rgba(255, 107, 26, 0.08)' : '#FFF7ED',
                                            border: isDark ? '1px solid rgba(255, 107, 26, 0.25)' : '1px solid #FDBA74',
                                            color: 'var(--text-primary)',
                                            fontSize: '13px',
                                            lineHeight: '1.55'
                                        }}>
                                            ⚡ <strong>Your Business AI:</strong> Connected and optimized for enterprise operations (handling 10,000+ daily orders with real-time multi-agent intelligence and automated audits).
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                                            <div style={{ padding: '14px 16px', background: isDark ? 'var(--bg-secondary)' : '#F8FAFC', borderRadius: '12px', border: isDark ? '1px solid var(--border-secondary)' : '1px solid #CBD5E1' }}>
                                                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Optimization Engine</div>
                                                <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '6px' }}>
                                                    Rolling 6-turn + Tool Caching
                                                </div>
                                            </div>
                                        </div>

                                        {/* Collapsible Audit Log Section */}
                                        <div style={{ borderTop: isDark ? '1px solid var(--border-secondary)' : '1px solid #E2E8F0', paddingTop: '16px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowAuditLogs(prev => !prev)}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        color: 'var(--text-primary)',
                                                        fontSize: '14px',
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px'
                                                    }}
                                                >
                                                    <span>{showAuditLogs ? '▼' : '▶'}</span>
                                                    <span>Audit Action Log & Cost Ledger ({agentLogs.length})</span>
                                                </button>

                                                {showAuditLogs && (
                                                    <div style={{ display: 'flex', gap: '8px', minWidth: '300px' }}>
                                                        <GlobalSelect
                                                            options={[
                                                                { value: '', label: 'All Agents' },
                                                                { value: 'billing', label: 'Billing' },
                                                                { value: 'inventory', label: 'Inventory' },
                                                                { value: 'product', label: 'Product' },
                                                                { value: 'worker', label: 'Worker' },
                                                                { value: 'expense', label: 'Expense' },
                                                                { value: 'analytics', label: 'Analytics' },
                                                                { value: 'reminder', label: 'Reminder' }
                                                            ]}
                                                            value={logFilterAgent}
                                                            onChange={(val) => {
                                                                setLogFilterAgent(val);
                                                                handleFilterAuditLogs(val, logFilterStatus);
                                                            }}
                                                            style={{ minWidth: '140px' }}
                                                        />
                                                        <GlobalSelect
                                                            options={[
                                                                { value: '', label: 'All Statuses' },
                                                                { value: 'proposed', label: 'Proposed' },
                                                                { value: 'executed', label: 'Executed' },
                                                                { value: 'rejected', label: 'Rejected' },
                                                                { value: 'failed', label: 'Failed' }
                                                            ]}
                                                            value={logFilterStatus}
                                                            onChange={(val) => {
                                                                setLogFilterStatus(val);
                                                                handleFilterAuditLogs(logFilterAgent, val);
                                                            }}
                                                            style={{ minWidth: '140px' }}
                                                        />
                                                    </div>
                                                )}
                                            </div>

                                            {showAuditLogs && (
                                                <div style={{ marginTop: '14px', maxHeight: '300px', overflowY: 'auto', borderRadius: '12px', border: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1' }}>
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                                        <thead>
                                                            <tr style={{ background: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC', borderBottom: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1', textAlign: 'left' }}>
                                                                <th style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Timestamp</th>
                                                                <th style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Agent</th>
                                                                <th style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Action Diff</th>
                                                                <th style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Tokens</th>
                                                                <th style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Est. Cost</th>
                                                                <th style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Status</th>
                                                                <th style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Actor</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {agentLogs.length === 0 ? (
                                                                <tr>
                                                                    <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-tertiary)' }}>
                                                                        No agent action logs recorded yet.
                                                                    </td>
                                                                </tr>
                                                            ) : (
                                                                agentLogs.map(l => {
                                                                    let badgeBg = 'rgba(107, 114, 128, 0.15)';
                                                                    let badgeColor = '#9CA3AF';
                                                                    if (l.status === 'executed') {
                                                                        badgeBg = 'rgba(16, 185, 129, 0.15)';
                                                                        badgeColor = '#10B981';
                                                                    } else if (l.status === 'proposed') {
                                                                        badgeBg = 'rgba(249, 115, 22, 0.15)';
                                                                        badgeColor = '#F97316';
                                                                    } else if (l.status === 'rejected') {
                                                                        badgeBg = 'rgba(239, 68, 68, 0.15)';
                                                                        badgeColor = '#EF4444';
                                                                    }

                                                                    const totalTokens = (l.input_tokens || 0) + (l.output_tokens || 0);

                                                                    return (
                                                                        <tr key={l.id} style={{ borderBottom: isDark ? '1px solid #2C2F36' : '1px solid #E2E8F0' }}>
                                                                            <td style={{ padding: '10px 12px', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                                                                                {l.created_at ? new Date(l.created_at).toLocaleString() : '-'}
                                                                            </td>
                                                                            <td style={{ padding: '10px 12px', fontWeight: 600, textTransform: 'capitalize', color: 'var(--text-primary)' }}>
                                                                                {l.agent_name}
                                                                            </td>
                                                                            <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>
                                                                                {l.diff_summary || l.tool_name}
                                                                            </td>
                                                                            <td style={{ padding: '10px 12px', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                                                                                {totalTokens > 0 ? `${totalTokens.toLocaleString()} (${l.input_tokens || 0} in / ${l.output_tokens || 0} out)` : '0 (Fast-Path)'}
                                                                            </td>
                                                                            <td style={{ padding: '10px 12px', color: '#10B981', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                                                ${(l.estimated_cost || 0).toFixed(5)}
                                                                            </td>
                                                                            <td style={{ padding: '10px 12px' }}>
                                                                                <span style={{ padding: '3px 8px', borderRadius: '6px', background: badgeBg, color: badgeColor, fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>
                                                                                    {l.status}
                                                                                </span>
                                                                            </td>
                                                                            <td style={{ padding: '10px 12px', color: 'var(--text-tertiary)' }}>
                                                                                {l.performed_by || 'admin'}
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })
                                                            )}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
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
                                background: 'rgba(15, 23, 42, 0.65)',
                                backdropFilter: 'blur(4px)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                zIndex: 1000
                            }}>
                                <div style={{
                                    background: isDark ? '#1B1D22' : '#FFFFFF',
                                    padding: '28px',
                                    borderRadius: '18px',
                                    width: '420px',
                                    maxWidth: '92%',
                                    border: isDark ? '1px solid #3A3E48' : '1px solid #CBD5E1',
                                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                                }}>
                                    <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 18px 0' }}>
                                        {editingWorkerType ? 'Edit Worker Type' : 'Add Worker Type'}
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                                Name *
                                            </label>
                                            <input
                                                type="text"
                                                value={workerTypeForm.name}
                                                onChange={(e) => setWorkerTypeForm({ ...workerTypeForm, name: e.target.value })}
                                                placeholder="e.g., Chef, Waiter, Manager"
                                                className="stInput"
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                                Description
                                            </label>
                                            <textarea
                                                value={workerTypeForm.description}
                                                onChange={(e) => setWorkerTypeForm({ ...workerTypeForm, description: e.target.value })}
                                                placeholder="Optional description"
                                                rows={3}
                                                className="stInput"
                                                style={{ resize: 'vertical' }}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <input
                                                type="checkbox"
                                                checked={workerTypeForm.is_active}
                                                onChange={(e) => setWorkerTypeForm({ ...workerTypeForm, is_active: e.target.checked })}
                                                style={{ width: '16px', height: '16px', accentColor: '#FF8A00' }}
                                            />
                                            <label style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Active</label>
                                        </div>
                                        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                            <Button
                                                onClick={() => {
                                                    setShowWorkerTypeModal(false);
                                                    setEditingWorkerType(null);
                                                    setWorkerTypeForm({ name: '', description: '', is_active: true });
                                                }}
                                                variant="secondary"
                                                style={{ flex: 1, height: '40px' }}
                                            >
                                                Cancel
                                            </Button>
                                            <Button
                                                onClick={editingWorkerType ? handleUpdateWorkerType : handleCreateWorkerType}
                                                style={{ flex: 1, height: '40px' }}
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
                                background: 'rgba(15, 23, 42, 0.65)',
                                backdropFilter: 'blur(4px)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                zIndex: 1000
                            }}>
                                <div style={{
                                    background: isDark ? '#1B1D22' : '#FFFFFF',
                                    padding: '28px',
                                    borderRadius: '18px',
                                    width: '420px',
                                    maxWidth: '92%',
                                    border: isDark ? '1px solid #3A3E48' : '1px solid #CBD5E1',
                                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                                }}>
                                    <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 18px 0' }}>
                                        {editingExpenseType ? 'Edit Expense Type' : 'Add Expense Type'}
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                                Name *
                                            </label>
                                            <input
                                                type="text"
                                                value={expenseTypeForm.name}
                                                onChange={(e) => setExpenseTypeForm({ ...expenseTypeForm, name: e.target.value })}
                                                placeholder="e.g., Utilities, Supplies, Rent"
                                                className="stInput"
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                                Description
                                            </label>
                                            <textarea
                                                value={expenseTypeForm.description}
                                                onChange={(e) => setExpenseTypeForm({ ...expenseTypeForm, description: e.target.value })}
                                                placeholder="Optional description"
                                                rows={3}
                                                className="stInput"
                                                style={{ resize: 'vertical' }}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <input
                                                type="checkbox"
                                                checked={expenseTypeForm.is_active}
                                                onChange={(e) => setExpenseTypeForm({ ...expenseTypeForm, is_active: e.target.checked })}
                                                style={{ width: '16px', height: '16px', accentColor: '#FF8A00' }}
                                            />
                                            <label style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Active</label>
                                        </div>
                                        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                            <Button
                                                onClick={() => {
                                                    setShowExpenseTypeModal(false);
                                                    setEditingExpenseType(null);
                                                    setExpenseTypeForm({ name: '', description: '', is_active: true });
                                                }}
                                                variant="secondary"
                                                style={{ flex: 1, height: '40px' }}
                                            >
                                                Cancel
                                            </Button>
                                            <Button
                                                onClick={editingExpenseType ? handleUpdateExpenseType : handleCreateExpenseType}
                                                style={{ flex: 1, height: '40px' }}
                                            >
                                                {editingExpenseType ? 'Update' : 'Create'}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'cloud' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '36px' }}>
                                {/* Cloud Sync Section */}
                                <div>
                                    <div style={{ marginBottom: '20px' }}>
                                        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>Cloud Sync</h2>
                                        <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: 0 }}>View cloud connection status and manually synchronize backups.</p>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
                                        {/* Status Card */}
                                        <div style={{
                                            padding: '24px',
                                            background: isDark ? 'var(--surface-primary)' : '#FFFFFF',
                                            border: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1',
                                            borderRadius: '16px',
                                            boxShadow: isDark ? 'none' : '0 1px 4px rgba(15, 23, 42, 0.05)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '16px'
                                        }}>
                                            <div style={{
                                                width: '52px',
                                                height: '52px',
                                                borderRadius: '14px',
                                                background: cloudStatus.loggedIn && cloudStatus.subscriptionStatus === 'active' ? 'linear-gradient(135deg, #10B981, #059669)' : 'linear-gradient(135deg, #FF8A00, #FF6500)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: 'white',
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                                            }}>
                                                <IoCloudUploadOutline size={26} />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
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
                                            background: isDark ? 'var(--surface-primary)' : '#FFFFFF',
                                            border: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1',
                                            borderRadius: '16px',
                                            boxShadow: isDark ? 'none' : '0 1px 4px rgba(15, 23, 42, 0.05)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '20px'
                                        }}>
                                            <div style={{
                                                padding: '16px 20px',
                                                background: isDark ? 'var(--bg-secondary)' : '#F8FAFC',
                                                border: isDark ? '1px solid var(--border-secondary)' : '1px solid #CBD5E1',
                                                borderRadius: '14px',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '6px'
                                            }}>
                                                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Subscription</div>
                                                <div style={{ fontSize: '15px', fontWeight: 700, color: cloudStatus.subscriptionStatus === 'active' ? '#10B981' : 'var(--text-primary)' }}>
                                                    {cloudStatus.subscriptionStatus.toUpperCase()}
                                                </div>
                                                {cloudStatus.expiry && (
                                                    <div style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>
                                                        Expires: {cloudStatus.expiry}
                                                    </div>
                                                )}
                                            </div>

                                            {cloudStatus.loggedIn && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                    <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>Manual Backups</div>
                                                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                                        <Button
                                                            variant="primary"
                                                            onClick={handleManualSync}
                                                            loading={syncingBackup}
                                                            disabled={syncingBackup || syncingMonthlyBackup}
                                                            style={{ height: '40px', padding: '0 20px' }}
                                                        >
                                                            Sync Weekly
                                                        </Button>
                                                        <Button
                                                            variant="primary"
                                                            onClick={handleMonthlySync}
                                                            loading={syncingMonthlyBackup}
                                                            disabled={syncingBackup || syncingMonthlyBackup}
                                                            style={{ height: '40px', padding: '0 20px' }}
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
                                    <div style={{ marginBottom: '20px' }}>
                                        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>About</h2>
                                        <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: 0 }}>System information and version details</p>
                                    </div>

                                    {/* Version Grid */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                                        gap: '16px',
                                        marginBottom: '24px'
                                    }}>
                                        <div style={{
                                            padding: '18px 20px',
                                            background: isDark ? 'var(--surface-primary)' : '#FFFFFF',
                                            border: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1',
                                            borderRadius: '16px',
                                            boxShadow: isDark ? 'none' : '0 1px 4px rgba(15, 23, 42, 0.05)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '4px'
                                        }}>
                                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>App Version</div>
                                            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>v{systemInfo.appVersion}</div>
                                        </div>

                                        <div style={{
                                             padding: '18px 20px',
                                             background: isDark ? 'var(--surface-primary)' : '#FFFFFF',
                                             border: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1',
                                             borderRadius: '16px',
                                             boxShadow: isDark ? 'none' : '0 1px 4px rgba(15, 23, 42, 0.05)',
                                             display: 'flex',
                                             flexDirection: 'column',
                                             gap: '4px'
                                         }}>
                                             <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Update Status</div>
                                             <div style={{ fontSize: '14.5px', fontWeight: 700, color: getStatusColor(systemInfo.updateStatus) }}>
                                                 {formatStatusText(systemInfo.updateStatus)}
                                             </div>
                                         </div>

                                        <div style={{
                                            padding: '18px 20px',
                                            background: isDark ? 'var(--surface-primary)' : '#FFFFFF',
                                            border: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1',
                                            borderRadius: '16px',
                                            boxShadow: isDark ? 'none' : '0 1px 4px rgba(15, 23, 42, 0.05)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '4px'
                                        }}>
                                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Latest</div>
                                            <div style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                {systemInfo.latestVersion && systemInfo.latestVersion !== 'unknown' ? `v${systemInfo.latestVersion}` : 'No updates'}
                                            </div>
                                        </div>

                                        <div style={{
                                            padding: '18px 20px',
                                            background: isDark ? 'var(--surface-primary)' : '#FFFFFF',
                                            border: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1',
                                            borderRadius: '16px',
                                            boxShadow: isDark ? 'none' : '0 1px 4px rgba(15, 23, 42, 0.05)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '4px'
                                        }}>
                                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Last Checked</div>
                                            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                                {systemInfo.lastChecked ? new Date(systemInfo.lastChecked).toLocaleDateString() : 'Never'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Update Controls */}
                                    <div style={{
                                        padding: '20px 24px',
                                        background: isDark ? 'var(--surface-primary)' : '#FFFFFF',
                                        border: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1',
                                        borderRadius: '16px',
                                        boxShadow: isDark ? 'none' : '0 1px 4px rgba(15, 23, 42, 0.05)',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <div>
                                            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Check for updates</div>
                                            <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Query the official release repository</div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <Button
                                                variant="secondary"
                                                onClick={handleManualCheckForUpdates}
                                                loading={checkingForUpdates}
                                                style={{ height: '38px' }}
                                            >
                                                Check Now
                                            </Button>
                                            {systemInfo.updateStatus === 'downloaded' && (
                                                <Button
                                                    variant="primary"
                                                    onClick={() => window.electronAPI.installUpdate()}
                                                    style={{ height: '38px', background: 'var(--success-500, #10b981)', borderColor: 'var(--success-500, #10b981)' }}
                                                >
                                                    Install Update
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'advanced' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                                <div>
                                    <div className="stSectionTitle">
                                        <IoConstructOutline size={22} color="var(--primary)" />
                                        Advanced Configuration
                                    </div>
                                    <div className="stSectionContent" style={{ paddingTop: '20px' }}>
                                        <div className="stFormGroup" style={{ borderBottom: devModeEnabled ? (isDark ? '1px solid var(--border-secondary)' : '1px solid #CBD5E1') : 'none' }}>
                                            <div className="stLabel">
                                                <span className="stLabelTitle">Developer Mode</span>
                                                <span className="stLabelDesc">Enable developer features, DevTools, verbose logging, and diagnostics</span>
                                            </div>
                                            <label className="stToggle">
                                                <input
                                                    type="checkbox"
                                                    checked={devModeEnabled}
                                                    onChange={handleDevModeToggle}
                                                />
                                                <span className="stSlider"></span>
                                            </label>
                                        </div>

                                        {devModeEnabled && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', marginTop: '24px' }}>
                                                {/* Developer Actions */}
                                                <div>
                                                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>Developer Actions</h3>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                                                        <Button variant="secondary" onClick={handleOpenDevTools} style={{ height: '38px' }}>
                                                            Open DevTools
                                                        </Button>
                                                        <Button variant="secondary" onClick={handleReloadWindow} style={{ height: '38px' }}>
                                                            Reload Window
                                                        </Button>
                                                        <Button variant="secondary" onClick={handleRestartBackend} loading={restartingBackend} disabled={restartingBackend} style={{ height: '38px' }}>
                                                            Restart Backend
                                                        </Button>
                                                        <Button variant="secondary" onClick={handleOpenLogsFolder} style={{ height: '38px' }}>
                                                            Open Logs Folder
                                                        </Button>
                                                        <Button variant="secondary" onClick={handleOpenUserDataFolder} style={{ height: '38px' }}>
                                                            Open User Data
                                                        </Button>
                                                        <Button variant="secondary" onClick={handleClearCache} style={{ height: '38px' }}>
                                                            Clear Cache
                                                        </Button>
                                                        <Button variant="primary" onClick={handleCopyDebugInfo} style={{ height: '38px' }}>
                                                            Copy Debug Info
                                                        </Button>
                                                        <Button variant="primary" onClick={handleExportDebugReport} style={{ height: '38px', backgroundImage: 'var(--primary-gradient)' }}>
                                                            Export Debug Report
                                                        </Button>
                                                    </div>
                                                </div>

                                                {/* System Specifications */}
                                                <div>
                                                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>System Specifications</h3>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                                                        <div style={{ padding: '18px 20px', background: isDark ? 'var(--surface-primary)' : '#FFFFFF', border: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1', borderRadius: '16px', boxShadow: isDark ? 'none' : '0 1px 4px rgba(15, 23, 42, 0.05)' }}>
                                                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>App / Build Version</div>
                                                            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '4px' }}>v{diagnosticInfo?.appVersion || 'Unknown'}</div>
                                                        </div>
                                                        <div style={{ padding: '18px 20px', background: isDark ? 'var(--surface-primary)' : '#FFFFFF', border: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1', borderRadius: '16px', boxShadow: isDark ? 'none' : '0 1px 4px rgba(15, 23, 42, 0.05)' }}>
                                                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Electron / Chrome / Node</div>
                                                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '4px' }}>
                                                                e: {diagnosticInfo?.electronVersion || '-'} | c: {diagnosticInfo?.chromeVersion || '-'} | n: {diagnosticInfo?.nodeVersion || '-'}
                                                            </div>
                                                        </div>
                                                        <div style={{ padding: '18px 20px', background: isDark ? 'var(--surface-primary)' : '#FFFFFF', border: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1', borderRadius: '16px', boxShadow: isDark ? 'none' : '0 1px 4px rgba(15, 23, 42, 0.05)' }}>
                                                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Environment</div>
                                                            <div style={{ fontSize: '15px', fontWeight: 600, color: diagnosticInfo?.environment === 'Development' ? 'var(--warning-500, #f59e0b)' : 'var(--success-500, #10b981)', marginTop: '4px' }}>
                                                                {diagnosticInfo?.environment || 'Unknown'}
                                                            </div>
                                                        </div>
                                                        <div style={{ padding: '18px 20px', background: isDark ? 'var(--surface-primary)' : '#FFFFFF', border: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1', borderRadius: '16px', boxShadow: isDark ? 'none' : '0 1px 4px rgba(15, 23, 42, 0.05)' }}>
                                                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>OS / Architecture</div>
                                                            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '4px' }}>
                                                                {diagnosticInfo?.osPlatform || '-'} ({diagnosticInfo?.osArch || '-'})
                                                            </div>
                                                        </div>
                                                        <div style={{ padding: '18px 20px', background: isDark ? 'var(--surface-primary)' : '#FFFFFF', border: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1', borderRadius: '16px', boxShadow: isDark ? 'none' : '0 1px 4px rgba(15, 23, 42, 0.05)' }}>
                                                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Backend Connection</div>
                                                            <div style={{ fontSize: '14px', fontWeight: 600, color: diagnosticInfo?.backendStatus === 'Running' ? 'var(--success-500, #10b981)' : 'var(--error-500, #ef4444)', marginTop: '4px' }}>
                                                                {diagnosticInfo?.backendStatus || 'Stopped'} ({diagnosticInfo?.backendUrl})
                                                            </div>
                                                        </div>
                                                        <div style={{ padding: '18px 20px', background: isDark ? 'var(--surface-primary)' : '#FFFFFF', border: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1', borderRadius: '16px', boxShadow: isDark ? 'none' : '0 1px 4px rgba(15, 23, 42, 0.05)' }}>
                                                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Database Status</div>
                                                            <div style={{ fontSize: '14px', fontWeight: 600, color: diagnosticInfo?.dbStatus === 'Connected' ? 'var(--success-500, #10b981)' : 'var(--error-500, #ef4444)', marginTop: '4px' }}>
                                                                {diagnosticInfo?.dbStatus || 'Missing'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Paths Section */}
                                                <div>
                                                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>System Paths</h3>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: isDark ? 'var(--surface-primary)' : '#FFFFFF', border: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1', borderRadius: '16px', padding: '18px 20px', fontSize: '13px', boxShadow: isDark ? 'none' : '0 1px 4px rgba(15, 23, 42, 0.05)' }}>
                                                        <div style={{ display: 'flex', gap: '8px' }}>
                                                            <span style={{ fontWeight: 600, width: '120px', color: 'var(--text-secondary)' }}>Database Path:</span>
                                                            <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)', wordBreak: 'break-all' }}>{diagnosticInfo?.dbPath}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '8px' }}>
                                                            <span style={{ fontWeight: 600, width: '120px', color: 'var(--text-secondary)' }}>User Data Path:</span>
                                                            <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)', wordBreak: 'break-all' }}>{diagnosticInfo?.userDataPath}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '8px' }}>
                                                            <span style={{ fontWeight: 600, width: '120px', color: 'var(--text-secondary)' }}>Log File Path:</span>
                                                            <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)', wordBreak: 'break-all' }}>{diagnosticInfo?.logPath}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Live Performance Stats */}
                                                <div>
                                                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>Performance Diagnostics</h3>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                                        <div style={{ padding: '20px', background: isDark ? 'var(--surface-primary)' : '#FFFFFF', border: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1', borderRadius: '16px', boxShadow: isDark ? 'none' : '0 1px 4px rgba(15, 23, 42, 0.05)' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>CPU Usage</span>
                                                                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{diagnosticInfo?.cpuUsage !== undefined ? diagnosticInfo.cpuUsage.toFixed(1) : '0.0'}%</span>
                                                            </div>
                                                            <div style={{ width: '100%', height: '8px', background: isDark ? 'var(--border-tertiary)' : '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                                                                <div style={{ width: `${Math.min(diagnosticInfo?.cpuUsage || 0, 100)}%`, height: '100%', backgroundImage: 'var(--primary-gradient)', transition: 'width 1s ease' }} />
                                                            </div>
                                                        </div>

                                                        <div style={{ padding: '20px', background: isDark ? 'var(--surface-primary)' : '#FFFFFF', border: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1', borderRadius: '16px', boxShadow: isDark ? 'none' : '0 1px 4px rgba(15, 23, 42, 0.05)' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>Process Memory (Heap)</span>
                                                                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                                    {diagnosticInfo?.memoryProcess ? (diagnosticInfo.memoryProcess / 1024 / 1024).toFixed(1) : '0'} MB
                                                                </span>
                                                            </div>
                                                            <div style={{ width: '100%', height: '8px', background: isDark ? 'var(--border-tertiary)' : '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                                                                <div style={{ 
                                                                    width: `${Math.min((diagnosticInfo?.memoryProcess || 0) / (diagnosticInfo?.memoryTotal || 1) * 100 * 20, 100)}%`, 
                                                                    height: '100%', 
                                                                    backgroundImage: 'var(--primary-gradient)', 
                                                                    transition: 'width 1s ease' 
                                                                }} />
                                                            </div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: 'var(--text-tertiary)', marginTop: '6px' }}>
                                                                <span>Free RAM: {diagnosticInfo?.memoryFree ? (diagnosticInfo.memoryFree / 1024 / 1024 / 1024).toFixed(1) : '0'} GB</span>
                                                                <span>Total RAM: {diagnosticInfo?.memoryTotal ? (diagnosticInfo.memoryTotal / 1024 / 1024 / 1024).toFixed(1) : '0'} GB</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Live Axios API Logs */}
                                                <div>
                                                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>Live API Transaction Logs ({apiLogs.length})</h3>
                                                    <div style={{ 
                                                        maxHeight: '220px', 
                                                        overflowY: 'auto', 
                                                        border: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1', 
                                                        borderRadius: '14px',
                                                        background: '#15161A',
                                                        padding: '14px',
                                                        fontFamily: 'monospace',
                                                        fontSize: '12px'
                                                    }}>
                                                        {apiLogs.length === 0 ? (
                                                            <div style={{ color: '#888', textAlign: 'center', padding: '20px' }}>No API traffic logged yet. Perform operations to trigger logs.</div>
                                                        ) : (
                                                            apiLogs.map((log, idx) => (
                                                                <div key={idx} style={{ 
                                                                    display: 'flex', 
                                                                    justifyContent: 'space-between', 
                                                                    padding: '4px 0', 
                                                                    borderBottom: '1px solid #242731', 
                                                                    color: log.error ? '#ff4d4d' : '#85e89d'
                                                                }}>
                                                                    <span>
                                                                        [{new Date(log.timestamp).toLocaleTimeString()}] {log.method} {log.url}
                                                                    </span>
                                                                    <span>
                                                                        {log.status} | {log.duration}ms
                                                                    </span>
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Live IPC Logs */}
                                                <div>
                                                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>Live IPC Command Logs ({ipcLogs.length})</h3>
                                                    <div style={{ 
                                                        maxHeight: '220px', 
                                                        overflowY: 'auto', 
                                                        border: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1', 
                                                        borderRadius: '14px',
                                                        background: '#15161A',
                                                        padding: '14px',
                                                        fontFamily: 'monospace',
                                                        fontSize: '12px'
                                                    }}>
                                                        {ipcLogs.length === 0 ? (
                                                            <div style={{ color: '#888', textAlign: 'center', padding: '20px' }}>No IPC communication logged yet.</div>
                                                        ) : (
                                                            ipcLogs.map((log, idx) => (
                                                                <div key={idx} style={{ 
                                                                    display: 'flex', 
                                                                    justifyContent: 'space-between', 
                                                                    padding: '4px 0', 
                                                                    borderBottom: '1px solid #242731', 
                                                                    color: log.status === 'error' ? '#ff4d4d' : '#79b8ff'
                                                                }}>
                                                                    <span>
                                                                        [{new Date(log.timestamp).toLocaleTimeString()}] ipcRenderer.{log.method}(...)
                                                                    </span>
                                                                    <span>
                                                                        {log.status === 'error' ? 'failed' : `${log.duration}ms`}
                                                                    </span>
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Real-time Log Stream */}
                                                <div>
                                                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>Real-time Application Log Stream (`app.log`)</h3>
                                                    <div style={{ 
                                                        maxHeight: '350px', 
                                                        overflowY: 'auto', 
                                                        border: isDark ? '1px solid #2C2F36' : '1px solid #CBD5E1', 
                                                        borderRadius: '14px',
                                                        background: '#0D0E11',
                                                        padding: '16px',
                                                        fontFamily: 'monospace',
                                                        fontSize: '11.5px',
                                                        whiteSpace: 'pre-wrap',
                                                        color: '#d4d4d4',
                                                        lineHeight: '1.5'
                                                    }}>
                                                        {fileLogs.length === 0 ? (
                                                            <div style={{ color: '#666', textAlign: 'center', padding: '20px' }}>Log file is empty or missing.</div>
                                                        ) : (
                                                            fileLogs.map((line, idx) => {
                                                                let color = '#d4d4d4';
                                                                if (line.includes('| ERROR')) color = '#ff4d4d';
                                                                else if (line.includes('| WARNING')) color = '#ffb347';
                                                                else if (line.includes('| DEBUG')) color = '#00ffff';
                                                                else if (line.includes('| INFO')) color = '#85e89d';
                                                                
                                                                return (
                                                                    <div key={idx} style={{ color, borderBottom: '1px solid #1a1a1a', padding: '2px 0' }}>
                                                                        {line}
                                                                    </div>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </Card>
            </div>
        </PageContainer >
    );
};

export default Settings;
