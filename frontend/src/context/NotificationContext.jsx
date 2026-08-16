import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { notificationAPI } from '../api/notificationAPI';

const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [activePopups, setActivePopups] = useState([]);
  const [isCenterOpen, setIsCenterOpen] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  // Load all notifications from API without restricting by UI tab filters
  const fetchNotifications = useCallback(async (params = {}) => {
    try {
      setLoading(true);
      const queryParams = {
        limit: 100,
        ...params
      };

      const res = await notificationAPI.getNotifications(queryParams);

      if (res && res.success) {
        setNotifications(res.notifications || []);
        setUnreadCount(res.unread_count ?? (res.notifications || []).filter(n => n.status === 'unread').length);
        setTotalCount(res.total_count ?? (res.notifications || []).length);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(() => fetchNotifications(), 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Trigger a temporary visual toast popup
  const showPopup = useCallback((notif) => {
    const popupId = notif.id || (Date.now() + Math.random());
    const popupItem = { ...notif, popupId };

    setActivePopups(prev => [popupItem, ...prev.slice(0, 4)]);

    // Auto-remove temporary popup after 6 seconds (DOES NOT DELETE FROM NOTIFICATION CENTER)
    setTimeout(() => {
      setActivePopups(prev => prev.filter(p => p.popupId !== popupId));
    }, 6000);
  }, []);

  const removePopup = useCallback((popupId) => {
    setActivePopups(prev => prev.filter(p => p.popupId !== popupId));
  }, []);

  // Create & persist new notification
  const createNotification = useCallback(async (data, options = {}) => {
    try {
      const res = await notificationAPI.createNotification(data);
      if (res && res.success && res.notification) {
        const notif = res.notification;
        setNotifications(prev => [notif, ...prev.filter(n => n.id !== notif.id)]);
        setUnreadCount(prev => prev + 1);
        setTotalCount(prev => prev + 1);
        if (!options.skipPopup && !data.skipPopup) {
          showPopup(notif);
        }
        return notif;
      }
    } catch (err) {
      console.error('Failed to create notification in DB:', err);
      // Fallback local temp notification if offline
      const fallbackNotif = {
        id: Date.now().toString(),
        title: data.title || 'Notification',
        message: data.message,
        type: data.type || 'system',
        priority: data.priority || 'info',
        status: 'unread',
        created_at: new Date().toISOString(),
        action_route: data.action_route || null,
        metadata: data.metadata || null,
      };
      setNotifications(prev => [fallbackNotif, ...prev]);
      setUnreadCount(prev => prev + 1);
      setTotalCount(prev => prev + 1);
      if (!options.skipPopup && !data.skipPopup) {
        showPopup(fallbackNotif);
      }
      return fallbackNotif;
    }
  }, [showPopup]);

  // Listen for global app-record-notification events from AlertContext
  useEffect(() => {
    const handleRecordNotification = (event) => {
      const data = event.detail;
      if (!data || !data.message) return;
      createNotification(data, { skipPopup: true });
    };

    window.addEventListener('app-record-notification', handleRecordNotification);
    return () => window.removeEventListener('app-record-notification', handleRecordNotification);
  }, [createNotification]);

  // Mark single notification as read
  const markAsRead = useCallback(async (id) => {
    try {
      const target = notifications.find(n => n.id === id);
      const isCurrentlyUnread = target?.status === 'unread';

      setNotifications(prev => prev.map(n => n.id === id ? { ...n, status: 'read', read_at: new Date().toISOString() } : n));
      if (isCurrentlyUnread) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }

      await notificationAPI.updateStatus(id, 'read');
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  }, [notifications]);

  // Mark single notification as completed (Fixes Reminder DONE button)
  const markAsCompleted = useCallback(async (id) => {
    try {
      const target = notifications.find(n => n.id === id);
      const isCurrentlyUnread = target?.status === 'unread';

      setNotifications(prev => prev.map(n => n.id === id ? { ...n, status: 'completed', completed_at: new Date().toISOString() } : n));
      if (isCurrentlyUnread) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }

      await notificationAPI.updateStatus(id, 'completed');
    } catch (err) {
      console.error('Failed to mark completed:', err);
    }
  }, [notifications]);

  // Dismiss notification
  const dismissNotification = useCallback(async (id) => {
    try {
      const target = notifications.find(n => n.id === id);
      const isCurrentlyUnread = target?.status === 'unread';

      setNotifications(prev => prev.map(n => n.id === id ? { ...n, status: 'dismissed', dismissed_at: new Date().toISOString() } : n));
      if (isCurrentlyUnread) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }

      await notificationAPI.updateStatus(id, 'dismissed');
    } catch (err) {
      console.error('Failed to dismiss notification:', err);
    }
  }, [notifications]);

  // Mark all unread as read
  const markAllAsRead = useCallback(async () => {
    try {
      setNotifications(prev => prev.map(n => n.status === 'unread' ? { ...n, status: 'read', read_at: new Date().toISOString() } : n));
      setUnreadCount(0);
      await notificationAPI.markAllRead();
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  }, []);

  // Delete notification permanently
  const deleteNotification = useCallback(async (id) => {
    try {
      const target = notifications.find(n => n.id === id);
      if (target?.status === 'unread') {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
      setNotifications(prev => prev.filter(n => n.id !== id));
      setTotalCount(prev => Math.max(0, prev - 1));

      await notificationAPI.deleteNotification(id);
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  }, [notifications]);

  // Clear all notifications
  const clearAllNotifications = useCallback(async () => {
    setNotifications([]);
    setUnreadCount(0);
    setTotalCount(0);
    try {
      await notificationAPI.clearAll();
    } catch (err) {
      console.warn('Failed to clear notifications on backend:', err);
    }
  }, []);

  // Automatically remove bill created notifications older than 1 hour
  useEffect(() => {
    const purgeExpiredBills = () => {
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      setNotifications(prev => {
        let countRemoved = 0;
        let unreadRemoved = 0;
        const remaining = prev.filter(n => {
          const isBillNotif = n.type === 'billing' || n.type === 'bill' || n.title?.toLowerCase().includes('bill');
          if (!isBillNotif) return true;
          const notifTime = n.created_at ? new Date(n.created_at).getTime() : 0;
          const isExpired = notifTime < oneHourAgo;
          if (isExpired) {
            countRemoved++;
            if (n.status === 'unread') unreadRemoved++;
            return false;
          }
          return true;
        });

        if (countRemoved > 0) {
          if (unreadRemoved > 0) setUnreadCount(c => Math.max(0, c - unreadRemoved));
          setTotalCount(t => Math.max(0, t - countRemoved));
          return remaining;
        }
        return prev;
      });
    };

    purgeExpiredBills();
    const interval = setInterval(purgeExpiredBills, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  const toggleCenter = useCallback(() => {
    setIsCenterOpen(prev => {
      const next = !prev;
      if (next) {
        fetchNotifications();
      }
      return next;
    });
  }, [fetchNotifications]);

  const openCenter = useCallback(() => {
    setIsCenterOpen(true);
    fetchNotifications();
  }, [fetchNotifications]);

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      totalCount,
      activePopups,
      isCenterOpen,
      setIsCenterOpen,
      toggleCenter,
      openCenter,
      filterType,
      setFilterType,
      filterStatus,
      setFilterStatus,
      searchTerm,
      setSearchTerm,
      loading,
      fetchNotifications,
      createNotification,
      markAsRead,
      markAsCompleted,
      dismissNotification,
      markAllAsRead,
      deleteNotification,
      clearAllNotifications,
      showPopup,
      removePopup
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used within NotificationProvider');
  return context;
};
