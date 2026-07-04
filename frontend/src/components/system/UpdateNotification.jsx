import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../ui/Button';

const UpdateNotification = () => {
  const [updateStatus, setUpdateStatus] = useState(null); // 'available', 'downloading', 'downloaded'
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!window.electronAPI) return;

    /* eslint-disable-next-line no-unused-vars */
    const unbindAvailable = window.electronAPI.onUpdateAvailable(() => {
      setUpdateStatus('available');
    });

    /* eslint-disable-next-line no-unused-vars */
    const unbindProgress = window.electronAPI.onUpdateProgress((event, info) => {
      setUpdateStatus('downloading');
      setProgress(Math.round(info.percent || 0));
    });

    /* eslint-disable-next-line no-unused-vars */
    const unbindDownloaded = window.electronAPI.onUpdateDownloaded(() => {
      setUpdateStatus('downloaded');
    });

    // Cleanup (assuming removeAllListeners is available, if not, electron handles on reload)
    return () => {
      if (window.electronAPI.removeAllListeners) {
         window.electronAPI.removeAllListeners('update-available');
         window.electronAPI.removeAllListeners('download-progress');
         window.electronAPI.removeAllListeners('update-downloaded');
      }
    };
  }, []);

  if (!updateStatus) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: '-50%', y: 50 }}
        animate={{ opacity: 1, x: '-50%', y: 0 }}
        exit={{ opacity: 0, x: '-50%', y: 50 }}
        transition={{ type: 'spring', damping: 25, stiffness: 250 }}
        style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          width: '360px',
          background: 'var(--glass-modal, rgba(18, 22, 30, 0.88))',
          backdropFilter: 'var(--glass-blur-strong, blur(20px))',
          WebkitBackdropFilter: 'var(--glass-blur-strong, blur(20px))',
          border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.08))',
          borderRadius: '16px',
          boxShadow: 'var(--shadow-modal, 0 20px 40px rgba(0, 0, 0, 0.4))',
          padding: '16px 20px',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '40px', height: '40px',
            borderRadius: '10px',
            backgroundColor: 'rgba(249, 115, 22, 0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--primary-500, #F97316)', 
            fontSize: '20px',
            flexShrink: 0,
            boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.05)'
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h4 style={{ margin: 0, color: 'var(--text-primary, #fff)', fontSize: '14px', fontWeight: 700 }}>
              {updateStatus === 'available' && 'Update Available'}
              {updateStatus === 'downloading' && 'Downloading Update...'}
              {updateStatus === 'downloaded' && 'Update Ready!'}
            </h4>
            <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: 'var(--text-secondary, #a1a1aa)', lineHeight: 1.35, whiteSpace: 'normal' }}>
              {updateStatus === 'downloading' 
                ? `${progress}% completed. Please wait.` 
                : updateStatus === 'downloaded'
                ? 'Restart InfoBill to apply the new update.'
                : 'A new version is downloading in the background.'}
            </p>
          </div>
        </div>

        {updateStatus === 'downloading' && (
          <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ ease: 'easeOut', duration: 0.1 }}
              style={{ height: '100%', background: 'linear-gradient(90deg, var(--primary-500, #F97316), #FB923C)' }}
            />
          </div>
        )}

        {updateStatus === 'downloaded' && (
          <Button 
            variant="primary" 
            style={{ 
              width: '100%', 
              height: '38px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',
              boxShadow: '0 4px 12px rgba(249, 115, 22, 0.25)'
            }}
            onClick={() => window.electronAPI.installUpdate()}
          >
            Restart & Install
          </Button>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default UpdateNotification;
