import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../ui/Button';

const UpdateNotification = () => {
  const [updateStatus, setUpdateStatus] = useState(null); // 'available', 'downloading', 'downloaded'
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!window.electronAPI) return;

    const unbindAvailable = window.electronAPI.onUpdateAvailable(() => {
      setUpdateStatus('available');
    });

    const unbindProgress = window.electronAPI.onUpdateProgress((event, info) => {
      setUpdateStatus('downloading');
      setProgress(Math.round(info.percent || 0));
    });

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
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          backgroundColor: 'var(--surface-color, #1e1e1e)',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          border: '1px solid var(--border-color, #333)',
          zIndex: 9999,
          width: '320px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px', height: '40px',
            borderRadius: '50%',
            backgroundColor: 'var(--primary-color, #3b82f6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontSize: '20px'
          }}>
            ↓
          </div>
          <div>
            <h4 style={{ margin: 0, color: 'var(--text-primary, #fff)' }}>
              {updateStatus === 'available' && 'Update Available'}
              {updateStatus === 'downloading' && 'Downloading Update...'}
              {updateStatus === 'downloaded' && 'Update Ready!'}
            </h4>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-secondary, #aaa)' }}>
              {updateStatus === 'downloading' 
                ? `${progress}% completed. Please wait.` 
                : updateStatus === 'downloaded'
                ? 'Restart InfoBill to apply the new update.'
                : 'A new version is downloading in the background.'}
            </p>
          </div>
        </div>

        {updateStatus === 'downloading' && (
          <div style={{ width: '100%', height: '6px', backgroundColor: '#333', borderRadius: '3px', overflow: 'hidden' }}>
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              style={{ height: '100%', backgroundColor: 'var(--primary-color, #3b82f6)' }}
            />
          </div>
        )}

        {updateStatus === 'downloaded' && (
          <Button 
            variant="primary" 
            style={{ width: '100%', marginTop: '8px' }}
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
