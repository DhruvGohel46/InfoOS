import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotifications } from '../../context/NotificationContext';
import { useReminders } from '../../context/ReminderContext';
import {
  IoClose,
  IoAlertCircleOutline,
  IoWarningOutline,
  IoInformationCircleOutline,
  IoCheckmarkCircleOutline
} from 'react-icons/io5';

const getPopupIcon = (priority) => {
  switch (priority) {
    case 'critical':
    case 'error': return <IoAlertCircleOutline size={20} color="#EF4444" />;
    case 'warning': return <IoWarningOutline size={20} color="#F59E0B" />;
    case 'success': return <IoCheckmarkCircleOutline size={20} color="#10B981" />;
    default: return <IoInformationCircleOutline size={20} color="#3B82F6" />;
  }
};

const getBorderColor = (priority) => {
  switch (priority) {
    case 'critical':
    case 'error': return 'rgba(239, 68, 68, 0.4)';
    case 'warning': return 'rgba(245, 158, 11, 0.4)';
    case 'success': return 'rgba(16, 185, 129, 0.4)';
    default: return 'rgba(59, 130, 246, 0.4)';
  }
};

const NotificationSystem = () => {
  const { activePopups, removePopup, markAsCompleted } = useNotifications();
  const { dismissReminder, fetchReminders } = useReminders();

  const handleDoneClick = async (e, notif) => {
    e.stopPropagation();
    removePopup(notif.popupId);
    await markAsCompleted(notif.id);
    if (notif.related_id) {
      try {
        await dismissReminder(notif.related_id);
        fetchReminders?.();
      } catch (err) {
        console.error('Failed to complete reminder:', err);
      }
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: '24px',
      right: '24px',
      zIndex: 9998,
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      pointerEvents: 'none',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <AnimatePresence>
        {activePopups.map((notif) => (
          <motion.div
            key={notif.popupId || notif.id}
            initial={{ opacity: 0, y: -20, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 50, scale: 0.95 }}
            transition={{ type: 'spring', damping: 22, stiffness: 240, mass: 0.8 }}
            style={{
              pointerEvents: 'auto',
              width: '360px',
              background: '#0D0D0D',
              border: `1.5px solid ${getBorderColor(notif.priority)}`,
              borderRadius: '16px',
              padding: '14px 16px',
              boxShadow: '0 20px 48px rgba(0,0,0,0.85)',
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Auto dismiss progress bar */}
            <motion.div
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: 6, ease: 'linear' }}
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                height: '3px',
                background: notif.priority === 'critical' || notif.priority === 'error'
                  ? '#EF4444'
                  : notif.priority === 'warning'
                  ? '#F59E0B'
                  : '#3B82F6',
              }}
            />

            {/* Icon */}
            <div style={{ marginTop: '2px', flexShrink: 0 }}>
              {getPopupIcon(notif.priority)}
            </div>

            {/* Body */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#FFFFFF',
                lineHeight: 1.25,
                marginBottom: '4px',
              }}>
                {notif.title}
              </div>
              <div style={{
                fontSize: '12.5px',
                color: '#8E8E93',
                lineHeight: 1.4,
              }}>
                {notif.message}
              </div>

              {/* Action for reminders */}
              {(notif.type === 'reminder' || notif.related_id) && (
                <div style={{ marginTop: '10px' }}>
                  <button
                    onClick={(e) => handleDoneClick(e, notif)}
                    style={{
                      background: '#FF7A00',
                      border: 'none',
                      borderRadius: '6px',
                      height: '24px',
                      padding: '0 10px',
                      color: '#FFFFFF',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    DONE
                  </button>
                </div>
              )}
            </div>

            {/* Close Popup Toast (Closing popup DOES NOT delete from Notification Center) */}
            <button
              onClick={() => removePopup(notif.popupId)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#666666',
                cursor: 'pointer',
                padding: '2px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Close alert"
            >
              <IoClose size={16} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default NotificationSystem;
