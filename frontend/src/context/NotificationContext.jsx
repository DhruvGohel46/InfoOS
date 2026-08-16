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

  // Load notifications from API
  const fetchNotifications = useCallback(async (params = {}) => {
    try {
      setLoading(true);
      const queryParams = {
        limit: 100,
        ...params
      };

      if (filterType === 'unread') {
        queryParams.status = 'unread';
      } else if (filterType === 'completed') {
        queryParams.status = 'completed';
      } else if (filterType !== 'all') {
        queryParams.type = filterType;
      }

      if (filterStatus !== 'all') {
        queryParams.status = filterStatus;
      }

      if (searchTerm) {
        queryParams.search = searchTerm;
      }

      const res = await notificationAPI.getNotifications(queryParams);

      if (res.success) {
        setNotifications(res.notifications || []);
        setUnreadCount(res.unread_count || 0);
        setTotalCount(res.total_count || 0);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [filterType, filterStatus, searchTerm]);

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
  const createNotification = useCallback(async (data) => {
    try {
      const res = await notificationAPI.createNotification(data);
      if (res.success && res.notification) {
        const notif = res.notification;
        setNotifications(prev => [notif, ...prev]);
        setUnreadCount(prev => prev + 1);
        setTotalCount(prev => prev + 1);
        showPopup(notif);
        return notif;
      }
    } catch (err) {
      console.error('Failed to create notification:', err);
      // Fallback local temp popup if offline
      showPopup({
        id: Date.now().toString(),
        title: data.title,
        message: data.message,
        type: data.type || 'system',
        priority: data.priority || 'info',
        status: 'unread',
        created_at: new Date().toISOString()
      });
    }
  }, [showPopup]);

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

  const toggleCenter = useCallback(() => {
    setIsCenterOpen(prev => !prev);
  }, []);

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      totalCount,
      activePopups,
      isCenterOpen,
      setIsCenterOpen,
      toggleCenter,
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
