import React, { useRef, useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../../context/NotificationContext';
import { useReminders } from '../../context/ReminderContext';
import { useTheme } from '../../context/ThemeContext';
import {
  IoClose,
  IoCheckmarkDoneCircleOutline,
  IoSearchOutline,
  IoCheckmarkCircle,
  IoAlertCircleOutline,
  IoWarningOutline,
  IoInformationCircleOutline,
  IoAlarmOutline,
  IoCubeOutline,
  IoFastFoodOutline,
  IoCloudDownloadOutline,
  IoSyncOutline,
  IoCloudUploadOutline,
  IoPeopleOutline,
  IoPrintOutline,
  IoShieldCheckmarkOutline,
  IoTrashOutline,
  IoOpenOutline,
  IoRefreshOutline,
  IoReceiptOutline,
  IoWalletOutline,
} from 'react-icons/io5';

const getCategoryIcon = (type, priority) => {
  switch (type) {
    case 'reminder':
    case 'reminders': return <IoAlarmOutline size={18} />;
    case 'inventory': return <IoCubeOutline size={18} />;
    case 'billing':
    case 'bill': return <IoReceiptOutline size={18} />;
    case 'expenses':
    case 'expense': return <IoWalletOutline size={18} />;
    case 'bakery': return <IoFastFoodOutline size={18} />;
    case 'update': return <IoCloudDownloadOutline size={18} />;
    case 'sync': return <IoSyncOutline size={18} />;
    case 'backup': return <IoCloudUploadOutline size={18} />;
    case 'worker':
    case 'workers':
    case 'salary':
    case 'attendance': return <IoPeopleOutline size={18} />;
    case 'printer': return <IoPrintOutline size={18} />;
    case 'license':
    case 'db': return <IoShieldCheckmarkOutline size={18} />;
    default:
      if (priority === 'critical' || priority === 'error') return <IoAlertCircleOutline size={18} />;
      if (priority === 'warning') return <IoWarningOutline size={18} />;
      return <IoInformationCircleOutline size={18} />;
  }
};

const getPriorityColor = (priority) => {
  switch (priority) {
    case 'critical':
    case 'error': return '#EF4444';
    case 'warning': return '#F59E0B';
    case 'success': return '#10B981';
    default: return '#FF7A00';
  }
};

// Date Grouping Helper
const groupNotificationsByDate = (notifList) => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const startOfWeek = startOfToday - 6 * 24 * 60 * 60 * 1000;

  const today = [];
  const yesterday = [];
  const thisWeek = [];
  const older = [];

  notifList.forEach((notif) => {
    const time = notif.created_at ? new Date(notif.created_at).getTime() : Date.now();
    if (time >= startOfToday) {
      today.push(notif);
    } else if (time >= startOfYesterday) {
      yesterday.push(notif);
    } else if (time >= startOfWeek) {
      thisWeek.push(notif);
    } else {
      older.push(notif);
    }
  });

  const sections = [];
  if (today.length > 0) sections.push({ id: 'today', title: 'Today', items: today });
  if (yesterday.length > 0) sections.push({ id: 'yesterday', title: 'Yesterday', items: yesterday });
  if (thisWeek.length > 0) sections.push({ id: 'thisWeek', title: 'Earlier this week', items: thisWeek });
  if (older.length > 0) sections.push({ id: 'older', title: 'Older', items: older });

  return sections;
};

const NotificationCenterDrawer = () => {
  const {
    notifications,
    unreadCount,
    isCenterOpen,
    setIsCenterOpen,
    searchTerm,
    setSearchTerm,
    loading,
    fetchNotifications,
    markAsRead,
    markAsCompleted,
    deleteNotification,
    clearAllNotifications,
  } = useNotifications();

  const { dismissReminder, fetchReminders } = useReminders();
  const { theme, isDarkMode } = useTheme();
  const navigate = useNavigate();
  const drawerRef = useRef(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [clearedFeedback, setClearedFeedback] = useState(false);
  const [hoveredCardId, setHoveredCardId] = useState(null);

  const isDark = isDarkMode !== false && theme !== 'light';

  // Dynamic Theme Colors
  const colors = useMemo(() => ({
    drawerBg: isDark ? '#111215' : '#FFFFFF',
    drawerBorder: isDark ? '1.5px solid rgba(255, 255, 255, 0.10)' : '1.5px solid rgba(0, 0, 0, 0.08)',
    drawerShadow: isDark
      ? '0 24px 64px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06) inset'
      : '0 20px 50px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04) inset',
    headerBorder: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.06)',
    textPrimary: isDark ? '#F9FAFB' : '#111827',
    textSecondary: isDark ? '#9CA3AF' : '#4B5563',
    textMuted: isDark ? '#6B7280' : '#9CA3AF',
    searchBg: isDark ? '#18191E' : '#F3F4F6',
    searchBorder: isDark ? '1px solid rgba(255, 255, 255, 0.09)' : '1px solid rgba(0, 0, 0, 0.08)',
    searchColor: isDark ? '#FFFFFF' : '#111827',
    sectionHeaderColor: isDark ? '#9CA3AF' : '#6B7280',
    cardBgUnread: isDark ? '#18191E' : '#FFF9F5',
    cardBgRead: isDark ? '#131418' : '#FFFFFF',
    cardBorderUnread: isDark ? '1.5px solid rgba(255, 122, 0, 0.38)' : '1.5px solid rgba(255, 122, 0, 0.45)',
    cardBorderRead: isDark ? '1px solid rgba(255, 255, 255, 0.07)' : '1px solid rgba(0, 0, 0, 0.08)',
    cardHoverBg: isDark ? '#1E1F26' : '#F9FAFB',
    cardHoverBorder: isDark ? 'rgba(255, 122, 0, 0.55)' : 'rgba(255, 122, 0, 0.65)',
    btnHoverBg: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    emptyBg: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
  }), [isDark]);

  // Close drawer on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (isCenterOpen && drawerRef.current && !drawerRef.current.contains(e.target)) {
        const bell = document.getElementById('infoos-notification-bell-btn');
        if (bell && bell.contains(e.target)) return;
        setIsCenterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isCenterOpen, setIsCenterOpen]);

  // Close drawer on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isCenterOpen) {
        setIsCenterOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCenterOpen, setIsCenterOpen]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchNotifications();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const handleClearAllClick = async () => {
    await clearAllNotifications();
    setClearedFeedback(true);
    setTimeout(() => setClearedFeedback(false), 1800);
  };

  // Filter list (Flat list, chronological order, instant search)
  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (n.status === 'dismissed') return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchTitle = n.title?.toLowerCase().includes(q);
        const matchMsg = n.message?.toLowerCase().includes(q);
        if (!matchTitle && !matchMsg) return false;
      }
      return true;
    });
  }, [notifications, searchTerm]);

  // Group notifications into time sections
  const groupedSections = useMemo(() => {
    return groupNotificationsByDate(filteredNotifications);
  }, [filteredNotifications]);

  const handleCardClick = (notif) => {
    if (notif.status === 'unread') {
      markAsRead(notif.id);
    }
    if (notif.action_route) {
      setIsCenterOpen(false);
      navigate(notif.action_route);
    }
  };

  const handleDoneClick = async (e, notif) => {
    e.stopPropagation();
    await markAsCompleted(notif.id);

    if (notif.related_id) {
      try {
        await dismissReminder(notif.related_id);
        fetchReminders?.();
      } catch (err) {
        console.error('Error completing associated reminder:', err);
      }
    }
  };

  const handleDeleteClick = async (e, notifId) => {
    e.stopPropagation();
    await deleteNotification(notifId);
  };

  return (
    <AnimatePresence>
      {isCenterOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9990,
          pointerEvents: 'none',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}>
          {/* Backdrop overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'absolute',
              inset: 0,
              background: isDark ? 'rgba(0, 0, 0, 0.55)' : 'rgba(0, 0, 0, 0.30)',
              backdropFilter: 'blur(3px)',
              pointerEvents: 'auto',
            }}
            onClick={() => setIsCenterOpen(false)}
          />

          {/* Drawer Card Panel */}
          <motion.div
            ref={drawerRef}
            initial={{ opacity: 0, x: 70, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 50, scale: 0.98 }}
            transition={{ type: 'spring', damping: 26, stiffness: 260, mass: 0.85 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: '68px',
              right: '20px',
              width: '440px',
              maxHeight: 'calc(100vh - 84px)',
              height: '720px',
              background: colors.drawerBg,
              border: colors.drawerBorder,
              borderRadius: '20px',
              boxShadow: colors.drawerShadow,
              display: 'flex',
              flexDirection: 'column',
              pointerEvents: 'auto',
              overflow: 'hidden',
              WebkitFontSmoothing: 'antialiased',
            }}
          >
            {/* ── Sticky Header Area ── */}
            <div style={{
              padding: '16px 18px 12px',
              borderBottom: colors.headerBorder,
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              flexShrink: 0,
            }}>
              {/* Title & Top Action Controls — Guaranteed 1 Line, No Wrapping */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                minHeight: '32px'
              }}>
                {/* Left: Title & Unread Badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <h3 style={{
                    margin: 0,
                    fontSize: '15px',
                    fontWeight: 700,
                    color: colors.textPrimary,
                    letterSpacing: '-0.2px',
                    whiteSpace: 'nowrap',
                    lineHeight: 1.2
                  }}>
                    Notification Center
                  </h3>
                  {unreadCount > 0 && (
                    <span style={{
                      background: 'linear-gradient(135deg, #FF9500 0%, #FF5500 100%)',
                      color: '#FFFFFF',
                      fontSize: '10px',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '10px',
                      whiteSpace: 'nowrap',
                      boxShadow: '0 2px 8px rgba(255, 122, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.45)',
                      lineHeight: 1.3,
                      border: '1px solid rgba(255, 255, 255, 0.25)',
                    }}>
                      {unreadCount} UNREAD
                    </span>
                  )}
                </div>

                {/* Right: Actions (Refresh, Clear All, Close) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                  {/* Refresh Button */}
                  <button
                    onClick={handleManualRefresh}
                    disabled={loading || isRefreshing}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: colors.textSecondary,
                      fontSize: '12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '28px',
                      height: '28px',
                      borderRadius: '6px',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = colors.btnHoverBg}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    title="Refresh notifications"
                  >
                    <IoRefreshOutline
                      size={16}
                      style={{
                        animation: (loading || isRefreshing) ? 'spin 1s linear infinite' : 'none',
                      }}
                    />
                  </button>

                  {/* Clear All Button */}
                  {notifications.length > 0 && (
                    <button
                      onClick={handleClearAllClick}
                      style={{
                        background: clearedFeedback ? 'rgba(34, 197, 94, 0.12)' : 'transparent',
                        border: 'none',
                        color: clearedFeedback ? '#22C55E' : colors.textSecondary,
                        fontSize: '11.5px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 7px',
                        borderRadius: '6px',
                        whiteSpace: 'nowrap',
                        transition: 'all 0.18s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!clearedFeedback) {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.10)';
                          e.currentTarget.style.color = '#EF4444';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!clearedFeedback) {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = colors.textSecondary;
                        }
                      }}
                      title="Clear all notifications"
                    >
                      {clearedFeedback ? (
                        <>
                          <IoCheckmarkCircle size={14} color="#22C55E" />
                          <span>Cleared!</span>
                        </>
                      ) : (
                        <>
                          <IoTrashOutline size={14} />
                          <span>Clear All</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* Close Drawer Button */}
                  <button
                    onClick={() => setIsCenterOpen(false)}
                    style={{
                      background: colors.btnHoverBg,
                      border: 'none',
                      color: colors.textSecondary,
                      borderRadius: '7px',
                      width: '28px',
                      height: '28px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = colors.textPrimary}
                    onMouseLeave={(e) => e.currentTarget.style.color = colors.textSecondary}
                    title="Close"
                  >
                    <IoClose size={16} />
                  </button>
                </div>
              </div>

              {/* Search Bar */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                background: colors.searchBg,
                border: colors.searchBorder,
                borderRadius: '10px',
                padding: '0 11px',
                height: '35px',
                gap: '8px',
                transition: 'border-color 0.15s ease',
              }}>
                <IoSearchOutline size={15} color={colors.textMuted} />
                <input
                  type="text"
                  placeholder="Search notifications..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: colors.searchColor,
                    fontSize: '13px',
                    fontFamily: 'inherit',
                  }}
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: colors.textMuted,
                      cursor: 'pointer',
                      padding: '2px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    title="Clear search"
                  >
                    <IoClose size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* ── Scrollable Notification List ── */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px 14px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}>
              {filteredNotifications.length === 0 ? (
                <div style={{
                  padding: '60px 20px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  flex: 1,
                }}>
                  {searchTerm ? (
                    <>
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        background: colors.emptyBg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: colors.textMuted,
                      }}>
                        <IoSearchOutline size={24} />
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: colors.textPrimary }}>
                        No matching notifications
                      </div>
                      <div style={{ fontSize: '12.5px', color: colors.textSecondary, maxWidth: '240px' }}>
                        No results found for &ldquo;{searchTerm}&rdquo;
                      </div>
                      <button
                        onClick={() => setSearchTerm('')}
                        style={{
                          marginTop: '4px',
                          background: 'transparent',
                          border: `1px solid ${colors.cardBorderRead}`,
                          color: '#FF7A00',
                          fontSize: '12px',
                          fontWeight: 600,
                          padding: '5px 12px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                        }}
                      >
                        Clear Search
                      </button>
                    </>
                  ) : (
                    <>
                      <div style={{
                        width: '52px',
                        height: '52px',
                        borderRadius: '50%',
                        background: isDark ? 'rgba(34, 197, 94, 0.12)' : 'rgba(34, 197, 94, 0.10)',
                        border: '1px solid rgba(34, 197, 94, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#22C55E',
                      }}>
                        <IoCheckmarkDoneCircleOutline size={30} />
                      </div>
                      <div style={{ fontSize: '14.5px', fontWeight: 700, color: colors.textPrimary }}>
                        You&apos;re all caught up!
                      </div>
                      <div style={{ fontSize: '12.5px', color: colors.textSecondary }}>
                        No new notifications at this time.
                      </div>
                    </>
                  )}
                </div>
              ) : (
                groupedSections.map((section) => (
                  <div key={section.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {/* Section Header */}
                    <div style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.6px',
                      color: colors.sectionHeaderColor,
                      padding: '4px 6px 2px',
                    }}>
                      {section.title}
                    </div>

                    {/* Section Items with AnimatePresence for Smooth Collapse */}
                    <AnimatePresence initial={false}>
                      {section.items.map((notif) => {
                        const pColor = getPriorityColor(notif.priority);
                        const isUnread = notif.status === 'unread';
                        const isCompleted = notif.status === 'completed';
                        const isHovered = hoveredCardId === notif.id;

                        return (
                          <motion.div
                            key={notif.id}
                            layout
                            initial={{ opacity: 0, y: 10, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{
                              opacity: 0,
                              height: 0,
                              marginTop: 0,
                              marginBottom: 0,
                              paddingTop: 0,
                              paddingBottom: 0,
                              overflow: 'hidden',
                            }}
                            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                            onMouseEnter={() => setHoveredCardId(notif.id)}
                            onMouseLeave={() => setHoveredCardId(null)}
                            onClick={() => handleCardClick(notif)}
                            style={{
                              position: 'relative',
                              background: isHovered ? colors.cardHoverBg : (isUnread ? colors.cardBgUnread : colors.cardBgRead),
                              border: isHovered
                                ? `1.5px solid ${colors.cardHoverBorder}`
                                : (isUnread ? `1.5px solid ${colors.cardBorderUnread}` : `1px solid ${colors.cardBorderRead}`),
                              borderRadius: '14px',
                              padding: '13px 15px',
                              cursor: notif.action_route ? 'pointer' : 'default',
                              boxShadow: isUnread
                                ? (isDark ? '0 4px 16px rgba(0,0,0,0.4)' : '0 2px 8px rgba(255, 122, 0, 0.08)')
                                : 'none',
                              transition: 'background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
                            }}
                          >
                            {/* 3D Glowing Unread Dot */}
                            {isUnread && (
                              <div style={{
                                position: 'absolute',
                                top: '13px',
                                right: '13px',
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: 'radial-gradient(circle at 35% 35%, #FFA34D 0%, #FF7A00 60%, #E65100 100%)',
                                boxShadow: '0 0 8px 1px #FF7A00, inset 0 1px 1px rgba(255, 255, 255, 0.7)',
                              }} />
                            )}

                            <div style={{ display: 'flex', gap: '11px', alignItems: 'flex-start' }}>
                              {/* Icon Badge */}
                              <div style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '10px',
                                background: `${pColor}18`,
                                border: `1px solid ${pColor}30`,
                                color: pColor,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                marginTop: '1px',
                              }}>
                                {getCategoryIcon(notif.type, notif.priority)}
                              </div>

                              {/* Text Body */}
                              <div style={{ flex: 1, minWidth: 0, paddingRight: isUnread ? '14px' : '0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                                  <div style={{
                                    fontSize: '13.5px',
                                    fontWeight: 700,
                                    color: colors.textPrimary,
                                    letterSpacing: '-0.2px',
                                    lineHeight: 1.25,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}>
                                    {notif.title}
                                  </div>
                                </div>

                                <div style={{
                                  fontSize: '12.5px',
                                  color: colors.textSecondary,
                                  lineHeight: 1.4,
                                  marginBottom: '7px',
                                  wordBreak: 'break-word',
                                }}>
                                  {notif.message}
                                </div>

                                {/* Footer: Deep link + Action Buttons */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '3px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {isCompleted && (
                                      <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '3px',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        color: '#22C55E',
                                      }}>
                                        <IoCheckmarkCircle size={13} /> Completed
                                      </span>
                                    )}

                                    {notif.action_route && (
                                      <span
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleCardClick(notif);
                                        }}
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '3px',
                                          fontSize: '11px',
                                          fontWeight: 600,
                                          color: '#FF7A00',
                                          cursor: 'pointer',
                                        }}
                                      >
                                        <IoOpenOutline size={12} /> View
                                      </span>
                                    )}
                                  </div>

                                  {/* Right Buttons: DONE / Delete */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    {/* DONE Button for Reminders / Tasks */}
                                    {!isCompleted && (notif.type === 'reminder' || notif.related_id) && (
                                      <button
                                        onClick={(e) => handleDoneClick(e, notif)}
                                        style={{
                                          background: '#FF7A00',
                                          border: 'none',
                                          borderRadius: '6px',
                                          height: '24px',
                                          padding: '0 9px',
                                          color: '#FFFFFF',
                                          fontSize: '11px',
                                          fontWeight: 700,
                                          fontFamily: 'inherit',
                                          cursor: 'pointer',
                                          boxShadow: '0 2px 6px rgba(255, 122, 0, 0.3)',
                                        }}
                                        title="Mark as completed"
                                      >
                                        DONE
                                      </button>
                                    )}

                                    {/* Delete Notification Button */}
                                    <button
                                      onClick={(e) => handleDeleteClick(e, notif.id)}
                                      style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: colors.textMuted,
                                        cursor: 'pointer',
                                        padding: '5px',
                                        borderRadius: '6px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: '28px',
                                        height: '28px',
                                        transition: 'all 0.15s ease',
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)';
                                        e.currentTarget.style.color = '#EF4444';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'transparent';
                                        e.currentTarget.style.color = colors.textMuted;
                                      }}
                                      title="Delete notification"
                                    >
                                      <IoTrashOutline size={15} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default NotificationCenterDrawer;
