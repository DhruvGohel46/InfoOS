/**
 * =============================================================================
 * ALERT CONTEXT — Unified Alert System for ReBill
 * =============================================================================
 * 
 * Provides: Toast notifications, Confirmation modals, Inline alerts
 * Accessible globally via useAlert() hook
 * =============================================================================
 */
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import ToastItem from '../components/common/ToastItem';
import ConfirmModal from '../components/common/ConfirmModal';
import '../styles/AlertSystem.css';

const AlertContext = createContext();

export const useAlert = () => {
    const context = useContext(AlertContext);
    if (!context) {
        throw new Error('useAlert must be used within an AlertProvider');
    }
    return context;
};

// Keep backward compatibility with useToast
export const useToast = () => {
    const context = useAlert();
    return context;
};

let toastIdCounter = 0;

export const AlertProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);
    const [confirmState, setConfirmState] = useState(null);
    const confirmResolveRef = useRef(null);

    // ─── Toast API ───

    const addToast = useCallback((optionsOrTitle, possibleDesc, possibleType) => {
        let toastObj = {};
        if (typeof optionsOrTitle === 'object' && optionsOrTitle !== null) {
            toastObj = { ...optionsOrTitle };
        } else {
            // Support addToast('Title/Message', 'Description', 'type')
            toastObj = {
                title: optionsOrTitle,
                description: possibleDesc || '',
                type: possibleType || 'info',
            };
        }

        const {
            type = 'info',
            title,
            description,
            duration = 4000,
            action,
            recordNotification = true,
            category,
            action_route,
            metadata,
        } = toastObj;

        const id = `toast-${++toastIdCounter}-${Date.now()}`;
        const newToast = { id, type, title, description, duration, action };

        setToasts(prev => {
            const updated = [newToast, ...prev];
            // Max 4 visible at once
            return updated.slice(0, 4);
        });

        // Bridge with Notification Center if recordNotification is enabled
        if (recordNotification !== false) {
            const notifTitle = title || (type === 'success' ? 'Success' : type === 'error' ? 'Error' : type === 'warning' ? 'Warning' : 'Notification');
            const notifMsg = description || (typeof optionsOrTitle === 'string' ? optionsOrTitle : title || '');
            if (notifMsg) {
                try {
                    window.dispatchEvent(new CustomEvent('app-record-notification', {
                        detail: {
                            title: notifTitle,
                            message: notifMsg,
                            type: category || (type === 'error' ? 'errors' : 'system'),
                            priority: type === 'error' ? 'error' : type === 'warning' ? 'warning' : type === 'success' ? 'success' : 'info',
                            action_route: action_route || null,
                            metadata: metadata || null,
                        }
                    }));
                } catch (e) {
                    console.error('Error dispatching notification event:', e);
                }
            }
        }

        return id;
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    // Shorthand helpers with metadata support
    const showSuccess = useCallback((message, durationOrOptions, possibleOptions) => {
        let duration = 4000;
        let opts = {};
        if (typeof durationOrOptions === 'number') {
            duration = durationOrOptions;
            if (possibleOptions && typeof possibleOptions === 'object') opts = possibleOptions;
        } else if (typeof durationOrOptions === 'object' && durationOrOptions !== null) {
            opts = durationOrOptions;
            if (opts.duration) duration = opts.duration;
        }
        return addToast({
            type: 'success',
            title: opts.title || 'Success',
            description: message,
            duration,
            category: opts.category,
            action_route: opts.action_route,
            recordNotification: opts.recordNotification ?? true,
            ...opts,
        });
    }, [addToast]);

    const showError = useCallback((message, durationOrOptions, possibleOptions) => {
        let duration = 5000;
        let opts = {};
        if (typeof durationOrOptions === 'number') {
            duration = durationOrOptions;
            if (possibleOptions && typeof possibleOptions === 'object') opts = possibleOptions;
        } else if (typeof durationOrOptions === 'object' && durationOrOptions !== null) {
            opts = durationOrOptions;
            if (opts.duration) duration = opts.duration;
        }
        return addToast({
            type: 'error',
            title: opts.title || 'Error',
            description: message,
            duration,
            category: opts.category || 'errors',
            action_route: opts.action_route,
            recordNotification: opts.recordNotification ?? true,
            ...opts,
        });
    }, [addToast]);

    const showWarning = useCallback((message, durationOrOptions, possibleOptions) => {
        let duration = 4500;
        let opts = {};
        if (typeof durationOrOptions === 'number') {
            duration = durationOrOptions;
            if (possibleOptions && typeof possibleOptions === 'object') opts = possibleOptions;
        } else if (typeof durationOrOptions === 'object' && durationOrOptions !== null) {
            opts = durationOrOptions;
            if (opts.duration) duration = opts.duration;
        }
        return addToast({
            type: 'warning',
            title: opts.title || 'Warning',
            description: message,
            duration,
            category: opts.category,
            action_route: opts.action_route,
            recordNotification: opts.recordNotification ?? true,
            ...opts,
        });
    }, [addToast]);

    const showInfo = useCallback((message, durationOrOptions, possibleOptions) => {
        let duration = 4000;
        let opts = {};
        if (typeof durationOrOptions === 'number') {
            duration = durationOrOptions;
            if (possibleOptions && typeof possibleOptions === 'object') opts = possibleOptions;
        } else if (typeof durationOrOptions === 'object' && durationOrOptions !== null) {
            opts = durationOrOptions;
            if (opts.duration) duration = opts.duration;
        }
        return addToast({
            type: 'info',
            title: opts.title || 'Info',
            description: message,
            duration,
            category: opts.category,
            action_route: opts.action_route,
            recordNotification: opts.recordNotification ?? true,
            ...opts,
        });
    }, [addToast]);

    // ─── Confirmation Modal API ───

    const showConfirm = useCallback(({
        title = 'Are you sure?',
        description = '',
        confirmLabel = 'Confirm',
        cancelLabel = 'Cancel',
        variant = 'danger', // danger | warning | primary | info
        icon,
    }) => {
        return new Promise((resolve) => {
            confirmResolveRef.current = resolve;
            setConfirmState({
                title,
                description,
                confirmLabel,
                cancelLabel,
                variant,
                icon,
            });
        });
    }, []);

    const handleConfirm = useCallback(() => {
        if (confirmResolveRef.current) {
            confirmResolveRef.current(true);
            confirmResolveRef.current = null;
        }
        setConfirmState(null);
    }, []);

    const handleCancel = useCallback(() => {
        if (confirmResolveRef.current) {
            confirmResolveRef.current(false);
            confirmResolveRef.current = null;
        }
        setConfirmState(null);
    }, []);

    const value = {
        // Toast API
        addToast,
        removeToast,
        showSuccess,
        showError,
        showWarning,
        showInfo,
        // Confirm Modal API
        showConfirm,
    };

    return (
        <AlertContext.Provider value={value}>
            {children}

            {/* Toast Portal */}
            {createPortal(
                <div className="rb-toast-container">
                    <AnimatePresence mode="popLayout" initial={false}>
                        {toasts.map((toast) => (
                            <ToastItem
                                key={toast.id}
                                toast={toast}
                                onClose={() => removeToast(toast.id)}
                            />
                        ))}
                    </AnimatePresence>
                </div>,
                document.body
            )}

            {/* Confirm Modal Portal */}
            {createPortal(
                <AnimatePresence>
                    {confirmState && (
                        <ConfirmModal
                            {...confirmState}
                            onConfirm={handleConfirm}
                            onCancel={handleCancel}
                        />
                    )}
                </AnimatePresence>,
                document.body
            )}
        </AlertContext.Provider>
    );
};
