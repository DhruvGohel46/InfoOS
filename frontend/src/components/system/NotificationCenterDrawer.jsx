import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../../context/NotificationContext';
import { useReminders } from '../../context/ReminderContext';
import {
  IoClose,
  IoCheckmarkDone,
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
} from 'react-icons/io5';

const typeFilterTabs = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'completed', label: 'Completed' },
  { id: 'reminders', label: 'Reminders' },
  { id: 'system', label: 'System' },
  { id: 'errors', label: 'Errors' },
  { id: 'updates', label: 'Updates' },
];

const getCategoryIcon = (type, priority) => {
  switch (type) {
    case 'reminder': return <IoAlarmOutline size={18} />;
    case 'inventory': return <IoCubeOutline size={18} />;
    case 'bakery': return <IoFastFoodOutline size={18} />;
    case 'update': return <IoCloudDownloadOutline size={18} />;
    case 'sync': return <IoSyncOutline size={18} />;
    case 'backup': return <IoCloudUploadOutline size={18} />;
    case 'worker':
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
    default: return '#3B82F6';
  }
};

const formatTimeAgo = (isoString) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const NotificationCenterDrawer = () => {
  const {
    notifications,
    unreadCount,
    isCenterOpen,
    setIsCenterOpen,
    filterType,
    setFilterType,
    searchTerm,
    setSearchTerm,
    loading,
    fetchNotifications,
    markAsRead,
    markAsCompleted,
    dismissNotification,
    markAllAsRead,
  } = useNotifications();

  const { dismissReminder, fetchReminders } = useReminders();
  const navigate = useNavigate();
  const drawerRef = useRef(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Close drawer on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (isCenterOpen && drawerRef.current && !drawerRef.current.contains(e.target)) {
        // Check if click was on the bell button
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

  // Tab counts
  const activeNotifs = notifications.filter(n => n.status !== 'dismissed');
  const getTabCount = (tabId) => {
    switch (tabId) {
      case 'all': return activeNotifs.length;
      case 'unread': return activeNotifs.filter(n => n.status === 'unread').length;
      case 'completed': return notifications.filter(n => n.status === 'completed').length;
      case 'reminders': return activeNotifs.filter(n => n.type === 'reminder').length;
      case 'system': return activeNotifs.filter(n => ['system', 'sync', 'backup', 'db', 'license'].includes(n.type)).length;
      case 'errors': return activeNotifs.filter(n => n.priority === 'error' || n.priority === 'critical').length;
      case 'updates': return activeNotifs.filter(n => n.type === 'update').length;
      default: return 0;
    }
  };

  // Filter list
  const filteredNotifications = notifications.filter((n) => {
    // Tab filter
    if (filterType === 'all' && n.status === 'dismissed') return false;
    if (filterType === 'unread' && n.status !== 'unread') return false;
    if (filterType === 'completed' && n.status !== 'completed') return false;
    if (filterType === 'reminders' && (n.type !== 'reminder' || n.status === 'dismissed')) return false;
    if (filterType === 'errors' && ((n.priority !== 'error' && n.priority !== 'critical') || n.status === 'dismissed')) return false;
    if (filterType === 'updates' && (n.type !== 'update' || n.status === 'dismissed')) return false;
    if (filterType === 'system' && (!['system', 'sync', 'backup', 'db', 'license'].includes(n.type) || n.status === 'dismissed')) return false;

    // Search filter
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchTitle = n.title?.toLowerCase().includes(q);
      const matchMsg = n.message?.toLowerCase().includes(q);
      if (!matchTitle && !matchMsg) return false;
    }
    return true;
  });

  const handleCardClick = (notif) => {
    if (notif.status === 'unread') {
      markAsRead(notif.id);
    }
    if (notif.action_route) {
      setIsCenterOpen(false);
      if (notif.action_route === '/inventory') navigate('/inventory');
      else if (notif.action_route === '/workers') navigate('/workers');
      else if (notif.action_route.startsWith('/settings')) navigate('/settings');
      else navigate(notif.action_route);
    }
  };

  const handleDoneClick = async (e, notif) => {
    e.stopPropagation();
    // 1. Mark notification completed in DB & state
    await markAsCompleted(notif.id);

    // 2. If associated with a reminder ID, trigger backend reminder completion
    if (notif.related_id) {
      try {
        await dismissReminder(notif.related_id);
        fetchReminders?.();
      } catch (err) {
        console.error('Error completing associated reminder:', err);
      }
    }
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
          {/* Subtle backdrop overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.45)',
              backdropFilter: 'blur(3px)',
              pointerEvents: 'auto',
            }}
            onClick={() => setIsCenterOpen(false)}
          />

          {/* Drawer Card Panel */}
          <motion.div
            ref={drawerRef}
            initial={{ opacity: 0, x: 80, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, scale: 0.97 }}
            transition={{ type: 'spring', damping: 24, stiffness: 240, mass: 0.85 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: '72px',
              right: '24px',
              width: '440px',
              maxHeight: 'calc(100vh - 96px)',
              height: '740px',
              background: '#0D0D0D',
              border: '1.5px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '24px',
              boxShadow: `
                0 0 0 0.5px rgba(255,255,255,0.04) inset,
                0 32px 72px rgba(0,0,0,0.92),
                0 0 80px rgba(255,122,0,0.03)
              `,
              display: 'flex',
              flexDirection: 'column',
              pointerEvents: 'auto',
              overflow: 'hidden',
              WebkitFontSmoothing: 'antialiased',
            }}
          >
            {/* ── Header ── */}
            <div style={{
              padding: '20px 22px 14px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.3px' }}>
                    Notification Center
                  </h3>
                  {unreadCount > 0 && (
                    <span style={{
                      background: '#FF7A00',
                      color: '#FFFFFF',
                      fontSize: '11px',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      boxShadow: '0 2px 8px rgba(255, 122, 0, 0.4)',
                    }}>
                      {unreadCount} UNREAD
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {/* Manual Refresh Button */}
                  <button
                    onClick={handleManualRefresh}
                    disabled={loading || isRefreshing}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#A0A0A0',
                      fontSize: '12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '4px',
                      borderRadius: '6px',
                      transition: 'all 0.15s',
                    }}
                    title="Refresh notifications"
                  >
                    <IoRefreshOutline
                      size={17}
                      style={{
                        animation: (loading || isRefreshing) ? 'spin 1s linear infinite' : 'none',
                      }}
                    />
                  </button>

                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#A0A0A0',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        transition: 'color 0.15s',
                      }}
                      title="Mark all as read"
                    >
                      <IoCheckmarkDone size={16} /> Mark All Read
                    </button>
                  )}

                  <button
                    onClick={() => setIsCenterOpen(false)}
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#A0A0A0',
                      borderRadius: '8px',
                      width: '28px',
                      height: '28px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <IoClose size={18} />
                  </button>
                </div>
              </div>

              {/* Search Bar */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                background: '#141414',
                border: '1px solid rgba(255, 255, 255, 0.09)',
                borderRadius: '10px',
                padding: '0 12px',
                height: '36px',
                gap: '8px',
              }}>
                <IoSearchOutline size={16} color="rgba(255,255,255,0.35)" />
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
                    color: '#FFFFFF',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                  }}
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: 0 }}
                  >
                    <IoClose size={14} />
                  </button>
                )}
              </div>

              {/* Filter Tabs */}
              <div style={{
                display: 'flex',
                gap: '6px',
                overflowX: 'auto',
                paddingBottom: '2px',
                scrollbarWidth: 'none',
              }}>
                {typeFilterTabs.map((tab) => {
                  const isActive = filterType === tab.id;
                  const count = getTabCount(tab.id);
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setFilterType(tab.id)}
                      style={{
                        background: isActive ? '#FF7A00' : 'rgba(255,255,255,0.05)',
                        border: isActive ? 'none' : '1px solid rgba(255,255,255,0.08)',
                        color: isActive ? '#FFFFFF' : '#888888',
                        borderRadius: '8px',
                        padding: '5px 10px',
                        fontSize: '12px',
                        fontWeight: isActive ? 700 : 500,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        transition: 'all 0.15s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      <span>{tab.label}</span>
                      {count > 0 && (
                        <span style={{
                          background: isActive ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.1)',
                          borderRadius: '10px',
                          padding: '1px 6px',
                          fontSize: '10.5px',
                          fontWeight: 700,
                          color: isActive ? '#FFFFFF' : '#999',
                        }}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Notification List ── */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}>
              {filteredNotifications.length === 0 ? (
                <div style={{
                  padding: '60px 20px',
                  textAlign: 'center',
                  color: '#555555',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '10px',
                }}>
                  <IoInformationCircleOutline size={36} opacity={0.3} />
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#777' }}>No notifications found</div>
                  <div style={{ fontSize: '12px', color: '#555' }}>
                    {searchTerm ? 'Try adjusting your search' : 'All caught up!'}
                  </div>
                </div>
              ) : (
                filteredNotifications.map((notif) => {
                  const pColor = getPriorityColor(notif.priority);
                  const isUnread = notif.status === 'unread';
                  const isCompleted = notif.status === 'completed';

                  return (
                    <motion.div
                      key={notif.id}
                      layout
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      onClick={() => handleCardClick(notif)}
                      style={{
                        position: 'relative',
                        background: isUnread ? '#141416' : '#101012',
                        border: `1.5px solid ${isUnread ? 'rgba(255, 122, 0, 0.35)' : 'rgba(255, 255, 255, 0.07)'}`,
                        borderRadius: '16px',
                        padding: '14px 16px',
                        cursor: notif.action_route ? 'pointer' : 'default',
                        boxShadow: isUnread ? '0 4px 20px rgba(0,0,0,0.5)' : 'none',
                        transition: 'all 0.18s ease',
                      }}
                    >
                      {/* Unread Glowing Dot */}
                      {isUnread && (
                        <div style={{
                          position: 'absolute',
                          top: '14px',
                          right: '14px',
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: '#FF7A00',
                          boxShadow: '0 0 10px #FF7A00',
                        }} />
                      )}

                      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        {/* Icon Container */}
                        <div style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '11px',
                          background: `${pColor}1A`,
                          border: `1px solid ${pColor}33`,
                          color: pColor,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          marginTop: '2px',
                        }}>
                          {getCategoryIcon(notif.type, notif.priority)}
                        </div>

                        {/* Text Details */}
                        <div style={{ flex: 1, minWidth: 0, paddingRight: isUnread ? '16px' : '0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <div style={{
                              fontSize: '14px',
                              fontWeight: 700,
                              color: '#FFFFFF',
                              letterSpacing: '-0.2px',
                              lineHeight: 1.2,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}>
                              {notif.title}
                            </div>
                          </div>

                          <div style={{
                            fontSize: '12.5px',
                            color: '#8E8E93',
                            lineHeight: 1.4,
                            marginBottom: '8px',
                          }}>
                            {notif.message}
                          </div>

                          {/* Footer Info & Actions */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '11px', color: '#555555' }}>
                                {formatTimeAgo(notif.created_at)}
                              </span>
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
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  fontSize: '11px',
                                  color: '#FF7A00',
                                }}>
                                  <IoOpenOutline size={12} /> View
                                </span>
                              )}
                            </div>

                            {/* Buttons */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {/* DONE Button for Reminders or Active Tasks */}
                              {!isCompleted && (notif.type === 'reminder' || notif.related_id) && (
                                <button
                                  onClick={(e) => handleDoneClick(e, notif)}
                                  style={{
                                    background: '#FF7A00',
                                    border: 'none',
                                    borderRadius: '7px',
                                    height: '26px',
                                    padding: '0 10px',
                                    color: '#FFFFFF',
                                    fontSize: '11.5px',
                                    fontWeight: 700,
                                    fontFamily: 'inherit',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 8px rgba(255, 122, 0, 0.3)',
                                  }}
                                >
                                  DONE
                                </button>
                              )}

                              {/* Dismiss Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  dismissNotification(notif.id);
                                }}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#555555',
                                  cursor: 'pointer',
                                  padding: '4px',
                                  borderRadius: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                }}
                                title="Dismiss notification"
                              >
                                <IoTrashOutline size={15} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default NotificationCenterDrawer;
