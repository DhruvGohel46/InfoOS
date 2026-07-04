import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';

const UpdateNotification = () => {
  const { isDark } = useTheme();
  
  // States: 'idle', 'checking', 'downloading', 'paused', 'verifying', 'installing', 'completed', 'failed'
  const [status, setStatus] = useState('idle'); 
  const [progress, setProgress] = useState(0);
  const [bytesPerSecond, setBytesPerSecond] = useState(0);
  const [totalBytes, setTotalBytes] = useState(149210342); // default 142.3 MB fallback
  const [transferredBytes, setTransferredBytes] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  // Pause toggle
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (!window.electronAPI) return;

    // Listen to status changes from the main process
    const unbindStatus = window.electronAPI.onUpdateStatusChanged((state) => {
      if (isPaused) return; // ignore updates if paused state is simulated/active
      
      if (state.status === 'checking') {
        setStatus('checking');
      } else if (state.status === 'downloading') {
        setStatus('downloading');
        setProgress(Math.round(state.percent || 0));
        setBytesPerSecond(state.bytesPerSecond || 0);
      } else if (state.status === 'downloaded') {
        setStatus('completed');
        setProgress(100);
      } else if (state.status === 'error') {
        setStatus('failed');
        setErrorMessage(state.errorMessage || 'Unknown download error occurred');
      }
    });

    const unbindAvailable = window.electronAPI.onUpdateAvailable(() => {
      setStatus('checking');
    });

    const unbindProgress = window.electronAPI.onUpdateProgress((event, info) => {
      if (isPaused) return;
      setStatus('downloading');
      setProgress(Math.round(info.percent || 0));
      setBytesPerSecond(info.bytesPerSecond || 0);
      if (info.total) setTotalBytes(info.total);
      if (info.transferred) setTransferredBytes(info.transferred);
    });

    const unbindDownloaded = window.electronAPI.onUpdateDownloaded(() => {
      setStatus('completed');
      setProgress(100);
    });

    // Check initial status
    window.electronAPI.getUpdaterStatus().then((state) => {
      if (state && state.status !== 'idle') {
        if (state.status === 'checking') setStatus('checking');
        else if (state.status === 'downloading') {
          setStatus('downloading');
          setProgress(Math.round(state.percent || 0));
          setBytesPerSecond(state.bytesPerSecond || 0);
        }
        else if (state.status === 'downloaded') setStatus('completed');
        else if (state.status === 'error') {
          setStatus('failed');
          setErrorMessage(state.errorMessage || '');
        }
      }
    });

    return () => {
      if (unbindStatus) unbindStatus();
      if (unbindAvailable) unbindAvailable();
      if (unbindProgress) unbindProgress();
      if (unbindDownloaded) unbindDownloaded();
    };
  }, [isPaused]);

  // Auto disappear for completed state
  useEffect(() => {
    if (status === 'completed') {
      const timer = setTimeout(() => {
        setStatus('idle');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  if (status === 'idle') return null;

  // Format Helpers
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSec) => {
    if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s';
    return formatBytes(bytesPerSec) + '/s';
  };

  const getRemainingTime = () => {
    if (!bytesPerSecond || bytesPerSecond <= 0) return '--';
    const remainingBytes = totalBytes - transferredBytes;
    if (remainingBytes <= 0) return '0s';
    const seconds = Math.ceil(remainingBytes / bytesPerSecond);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  };

  const computedTransferred = transferredBytes || Math.round((progress / 100) * totalBytes);
  const transferredText = formatBytes(computedTransferred);
  const totalText = formatBytes(totalBytes);

  // Styling based on Theme
  const themeStyles = {
    bg: isDark ? 'rgba(31, 41, 55, 0.75)' : 'rgba(255, 255, 255, 0.82)',
    border: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E5E7EB',
    textPrimary: isDark ? '#FFFFFF' : '#111827',
    textSecondary: isDark ? '#9CA3AF' : '#6B7280',
    shadow: isDark ? '0 20px 40px rgba(0, 0, 0, 0.5)' : '0 20px 40px rgba(17, 24, 39, 0.08)',
    buttonBg: isDark ? 'rgba(255, 255, 255, 0.05)' : '#F3F4F6',
    buttonHover: isDark ? 'rgba(255, 255, 255, 0.1)' : '#E5E7EB',
    iconBg: isDark ? 'rgba(249, 115, 22, 0.1)' : 'rgba(249, 115, 22, 0.08)'
  };

  const getStatusTitle = () => {
    switch (status) {
      case 'checking': return 'Checking for updates...';
      case 'downloading': return 'Downloading Update...';
      case 'paused': return 'Update Paused';
      case 'verifying': return 'Verifying Update...';
      case 'installing': return 'Installing Update...';
      case 'completed': return 'Update Ready!';
      case 'failed': return 'Update Failed';
      default: return 'Update Available';
    }
  };

  const handlePauseToggle = () => {
    if (status === 'downloading') {
      setStatus('paused');
      setIsPaused(true);
    } else if (status === 'paused') {
      setStatus('downloading');
      setIsPaused(false);
    }
  };

  const handleRetry = () => {
    setStatus('checking');
    setErrorMessage('');
    if (window.electronAPI && window.electronAPI.checkForUpdates) {
      window.electronAPI.checkForUpdates();
    }
  };

  const handleInstall = () => {
    setStatus('installing');
    if (window.electronAPI && window.electronAPI.installUpdate) {
      window.electronAPI.installUpdate();
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 30, scale: 0.95 }}
        transition={{ type: 'spring', damping: 20, stiffness: 200 }}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '380px',
          background: themeStyles.bg,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: `1px solid ${themeStyles.border}`,
          borderRadius: '24px',
          boxShadow: themeStyles.shadow,
          padding: '20px',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          boxSizing: 'border-box',
          fontFamily: "'Outfit', sans-serif"
        }}
      >
        {/* Top Section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Status Icon */}
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            backgroundColor: status === 'completed' ? 'rgba(34, 197, 94, 0.1)' : status === 'failed' ? 'rgba(239, 68, 68, 0.1)' : themeStyles.iconBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: status === 'completed' ? '#22C55E' : status === 'failed' ? '#EF4444' : '#F97316',
            fontSize: '20px',
            flexShrink: 0
          }}>
            {status === 'completed' ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : status === 'failed' ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: status === 'checking' ? 'spin 1.5s linear infinite' : 'none' }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            )}
          </div>

          {/* Title & Subtitle */}
          <div style={{ minWidth: 0, flex: 1 }}>
            <h4 style={{ margin: 0, color: themeStyles.textPrimary, fontSize: '15px', fontWeight: 700, letterSpacing: '-0.01em' }}>
              {getStatusTitle()}
            </h4>
            <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: themeStyles.textSecondary, fontWeight: 500 }}>
              {status === 'downloading' && `${progress}% completed • ${transferredText} of ${totalText}`}
              {status === 'paused' && `Paused at ${progress}% • ${transferredText} of ${totalText}`}
              {status === 'checking' && 'Searching for the latest updates...'}
              {status === 'completed' && 'Update downloaded successfully.'}
              {status === 'failed' && (errorMessage || 'Connection lost. Please retry.')}
              {status === 'verifying' && 'Checking package signature...'}
              {status === 'installing' && 'Restarting and installing update...'}
            </p>
          </div>
        </div>

        {/* Progress Bar (Only show when downloading, paused, verifying or completed) */}
        {['downloading', 'paused', 'verifying', 'completed', 'installing'].includes(status) && (
          <div style={{ width: '100%', height: '5px', backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', borderRadius: '10px', overflow: 'hidden' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ ease: 'easeOut', duration: 0.2 }}
              style={{
                height: '100%',
                background: '#F97316',
                boxShadow: '0 0 8px rgba(249, 115, 22, 0.4)'
              }}
            />
          </div>
        )}

        {/* Bottom Details & Action Button Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
          {/* Info Details Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {status === 'downloading' && (
              <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: themeStyles.textSecondary, opacity: 0.8, fontWeight: 500 }}>
                <span>Speed: {formatSpeed(bytesPerSecond)}</span>
                <span>•</span>
                <span>Time: {getRemainingTime()}</span>
              </div>
            )}
            {['downloading', 'paused'].includes(status) && (
              <div style={{ fontSize: '10px', color: themeStyles.textSecondary, opacity: 0.6 }}>
                File: infopos-setup-v2.exe
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {status === 'failed' && (
              <button
                onClick={handleRetry}
                style={{
                  border: 'none',
                  outline: 'none',
                  backgroundColor: '#F97316',
                  color: 'white',
                  borderRadius: '10px',
                  padding: '8px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 10px rgba(249, 115, 22, 0.25)',
                  transition: 'opacity 0.2s'
                }}
                onMouseOver={(e) => e.target.style.opacity = 0.9}
                onMouseOut={(e) => e.target.style.opacity = 1}
              >
                Retry
              </button>
            )}

            {status === 'completed' && (
              <button
                onClick={handleInstall}
                style={{
                  border: 'none',
                  outline: 'none',
                  backgroundColor: '#F97316',
                  color: 'white',
                  borderRadius: '10px',
                  padding: '8px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 10px rgba(249, 115, 22, 0.25)',
                  transition: 'opacity 0.2s'
                }}
                onMouseOver={(e) => e.target.style.opacity = 0.9}
                onMouseOut={(e) => e.target.style.opacity = 1}
              >
                Restart & Install
              </button>
            )}

            {['downloading', 'paused'].includes(status) && (
              <button
                onClick={handlePauseToggle}
                style={{
                  border: 'none',
                  outline: 'none',
                  backgroundColor: themeStyles.buttonBg,
                  color: themeStyles.textPrimary,
                  borderRadius: '10px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = themeStyles.buttonHover}
                onMouseOut={(e) => e.target.style.backgroundColor = themeStyles.buttonBg}
              >
                {status === 'paused' ? 'Resume' : 'Pause'}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default UpdateNotification;
