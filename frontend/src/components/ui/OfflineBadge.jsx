import React from 'react';
import { useNetwork } from '../../context/NetworkContext';

const OfflineBadge = () => {
  const { isOnline } = useNetwork();

  if (isOnline) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '16px',
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: 'var(--error-500, #ef4444)',
      color: 'white',
      padding: '8px 16px',
      borderRadius: '24px',
      fontSize: '13px',
      fontWeight: '600',
      boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      zIndex: 9999, // Ensure it floats above everything
      animation: 'slideDown 0.3s ease-out forwards'
    }}>
      <div style={{
        width: '8px',
        height: '8px',
        backgroundColor: '#fff',
        borderRadius: '50%',
        animation: 'pulse 1.5s infinite'
      }} />
      OFFLINE MODE - Sync Paused
    </div>
  );
};

export default OfflineBadge;
