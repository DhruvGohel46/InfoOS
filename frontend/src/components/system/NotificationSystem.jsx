import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
// removed framer-motion
import { inventoryAPI } from '../../utils/api';
import { useSettings } from '../../context/SettingsContext';

// Icons
const AlertIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>
);

const XIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
);

const NotificationSystem = forwardRef((props, ref) => {
    const [notifications, setNotifications] = useState([]);
    const { settings } = useSettings();

    // Expose methods to parent via ref
    useImperativeHandle(ref, () => ({
        addNotification: (notification) => {
            const id = Date.now() + Math.random();
            setNotifications(prev => [{ ...notification, id }, ...prev]);

            // Auto dismiss after 6 seconds
            setTimeout(() => {
                removeNotification(id);
            }, 6000);
        },
        checkStock: () => checkLowStock()
    }));

    const removeNotification = (id) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    const checkLowStock = async () => {
        try {
            const response = await inventoryAPI.getLowStock();
            if (response.data.success && response.data.low_stock_items.length > 0) {
                const items = response.data.low_stock_items;

                // Group by status
                const outOfStock = items.filter(i => i.stock <= 0);
                const lowStock = items.filter(i => i.stock > 0);

                // Show Out of Stock Alert (Critical)
                if (outOfStock.length > 0) {
                    const message = outOfStock.length === 1
                        ? `${outOfStock[0].name} is Out of Stock!`
                        : `${outOfStock.length} items are Out of Stock!`;

                    addSystemNotification({
                        title: 'Out of Stock Alert',
                        message: message,
                        type: 'critical',
                        items: outOfStock.slice(0, 3).map(i => i.name)
                    });
                }

                // Show Low Stock Alert (Warning)
                if (lowStock.length > 0) {
                    const message = lowStock.length === 1
                        ? `${lowStock[0].name} is Low on Stock (${lowStock[0].stock} left)`
                        : `${lowStock.length} items are running low`;

                    addSystemNotification({
                        title: 'Low Stock Warning',
                        message: message,
                        type: 'warning'
                    });
                }
            }
        } catch (error) {
            console.error("Failed to check stock:", error);
        }
    };

    const addSystemNotification = (notif) => {
        const id = Date.now() + Math.random();
        setNotifications(prev => [{ ...notif, id }, ...prev]);
        setTimeout(() => removeNotification(id), 6000);
    };

    // --- AUTOMATED CHECKS ---

    useEffect(() => {
        // 1. App Start / Page Load Check
        // Check local storage for last check date
        const lastCheck = localStorage.getItem('last_stock_check_date');
        const today = new Date().toDateString();

        if (lastCheck !== today) {
            console.log("First stock check of the day...");
            checkLowStock();
            localStorage.setItem('last_stock_check_date', today);
        }

        // 2. Shop Open/Close Logic
        // We set an interval to check current time against shop settings
        const timeCheckInterval = setInterval(() => {
            if (settings?.shop_open_time || settings?.shop_close_time) {
                const now = new Date();
                const currentTime = now.toTimeString().slice(0, 5); // HH:MM

                // Check if we already alerted for this specific time today
                const lastTimeAlert = localStorage.getItem('last_time_alert');
                const lastTimeAlertDate = localStorage.getItem('last_time_alert_date');

                if (lastTimeAlertDate === today && lastTimeAlert === currentTime) {
                    return; // Already alerted this minute
                }

                if (currentTime === settings.shop_open_time) {
                    addSystemNotification({ title: 'Shop Open', message: 'Checking opening stock...', type: 'info' });
                    checkLowStock();
                    localStorage.setItem('last_time_alert', currentTime);
                    localStorage.setItem('last_time_alert_date', today);
                }

                if (currentTime === settings.shop_close_time) {
                    addSystemNotification({ title: 'Shop Closing', message: 'Final stock summary', type: 'info' });
                    checkLowStock();
                    localStorage.setItem('last_time_alert', currentTime);
                    localStorage.setItem('last_time_alert_date', today);
                }
            }
        }, 30000); // Check every 30 seconds

        return () => clearInterval(timeCheckInterval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settings]);

    return (
        <div style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            pointerEvents: 'none' // Allow clicking through container
        }}>
            <>
                {notifications.map(n => (
                    <div
                        key={n.id}
                        style={{
                            minWidth: '320px',
                            maxWidth: '400px',
                            background: n.type === 'critical' ? '#3A1C1C' : (n.type === 'warning' ? '#3A2A1C' : 'rgba(30, 41, 59, 0.95)'),
                            border: `1px solid ${n.type === 'critical' ? '#EF4444' : (n.type === 'warning' ? '#F59E0B' : 'rgba(255,255,255,0.1)')}`,
                            color: n.type === 'critical' ? '#xFCA5A5' : (n.type === 'warning' ? '#FCD34D' : '#fff'),
                            borderRadius: '12px',
                            padding: '16px',
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
                            backdropFilter: 'blur(10px)',
                            pointerEvents: 'auto',
                            position: 'relative',
                            overflow: 'hidden'
                        }}
                    >
                        {/* Auto-dismiss progress bar (visual only) */}
                        <div
                            style={{
                                position: 'absolute',
                                bottom: 0,
                                left: 0,
                                height: '3px',
                                background: n.type === 'critical' ? '#EF4444' : (n.type === 'warning' ? '#F59E0B' : '#3B82F6')
                            }}
                        />

                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                            <div style={{
                                color: n.type === 'critical' ? '#EF4444' : (n.type === 'warning' ? '#F59E0B' : '#3B82F6'),
                                marginTop: '2px'
                            }}>
                                <AlertIcon />
                            </div>
                            <div style={{ flex: 1 }}>
                                <h4 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 600, color: '#fff' }}>
                                    {n.title}
                                </h4>
                                <p style={{ margin: 0, fontSize: '13px', opacity: 0.9, color: 'rgba(255,255,255,0.8)' }}>
                                    {n.message}
                                </p>
                                {n.items && (
                                    <div style={{ marginTop: '8px', fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                                        {n.items.join(', ')} ...
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={() => removeNotification(n.id)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'rgba(255,255,255,0.5)',
                                    cursor: 'pointer',
                                    padding: '4px',
                                    borderRadius: '4px',
                                    display: 'flex',
                                    alignItems: 'center'
                                }}
                            >
                                <XIcon />
                            </button>
                        </div>
                    </div>
                ))}
            </>
        </div>
    );
});

export default NotificationSystem;
