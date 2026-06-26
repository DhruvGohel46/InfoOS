import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAlert } from '../../context/AlertContext';
import { useAuth } from '../../context/AuthContext';
import { getAuthStatus } from '../../api/auth';

const PinDots = ({ length, filled, shake }) => (
  <motion.div
    style={{
      display: 'flex',
      gap: 10,
      justifyContent: 'center',
      margin: '14px 0 18px',
    }}
    animate={shake ? { x: [0, -10, 10, -8, 8, -4, 4, 0] } : { x: 0 }}
    transition={{ duration: 0.4 }}
  >
    {[...Array(length)].map((_, i) => (
      <div
        key={i}
        style={{
          width: 12,
          height: 12,
          borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.25)',
          background: i < filled ? 'rgba(249,115,22,0.95)' : 'rgba(255,255,255,0.06)',
          boxShadow: i < filled ? '0 0 16px rgba(249,115,22,0.25)' : 'none',
          transition: 'background 160ms ease',
        }}
      />
    ))}
  </motion.div>
);

const Numpad = ({ onKey, onDelete, onSubmit, canSubmit, isLoading }) => {
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const btnStyle = {
    height: 52,
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(255,255,255,0.06)',
    color: 'var(--text-primary)',
    fontSize: 16,
    fontWeight: 800,
    cursor: 'pointer',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
      {keys.map((n) => (
        <motion.button
          key={n}
          whileTap={{ scale: 0.92 }}
          onClick={() => onKey(n.toString())}
          disabled={isLoading}
          style={btnStyle}
        >
          {n}
        </motion.button>
      ))}
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={onDelete}
        disabled={isLoading}
        style={{ ...btnStyle, fontWeight: 900 }}
        aria-label="Delete"
      >
        ⌫
      </motion.button>
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={() => onKey('0')}
        disabled={isLoading}
        style={btnStyle}
        aria-label="Digit 0"
      >
        0
      </motion.button>
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={onSubmit}
        disabled={!canSubmit || isLoading}
        style={{
          ...btnStyle,
          background: canSubmit ? 'rgba(249,115,22,0.18)' : 'rgba(255,255,255,0.05)',
          border: canSubmit ? '1px solid rgba(249,115,22,0.35)' : '1px solid rgba(255,255,255,0.12)',
          color: canSubmit ? 'var(--primary-500)' : 'var(--text-muted)',
        }}
        aria-label="Unlock"
      >
        {isLoading ? '…' : '✓'}
      </motion.button>
    </div>
  );
};

export default function AdminUnlockModal() {
  const { isUnlockOpen, closeUnlock, unlockAdminWithPin, pendingPath } = useAuth();
  const { showError, showSuccess } = useAlert();
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pinLength, setPinLength] = useState(4); // Default to 4, will be updated from status
  const submitRef = useRef(null);

  // Fetch actual PIN length when modal opens
  useEffect(() => {
    if (isUnlockOpen) {
      getAuthStatus().then(status => {
        if (status.pin_length) {
          setPinLength(status.pin_length);
        }
      }).catch(err => console.error('Failed to fetch PIN length:', err));
    }
  }, [isUnlockOpen]);

  const canSubmit = useMemo(() => pin.length >= pinLength, [pin.length, pinLength]);

  const triggerShake = useCallback(() => {
    setShake(true);
    setTimeout(() => setShake(false), 450);
  }, []);

  const handleKey = useCallback((digit) => {
    setPin((p) => (p.length < pinLength ? p + digit : p));
  }, [pinLength]);

  const handleDelete = useCallback(() => {
    setPin((p) => p.slice(0, -1));
  }, []);

  const handleClose = useCallback(() => {
    if (isLoading) return;
    setPin('');
    closeUnlock();
  }, [closeUnlock, isLoading]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) {
      showError(`PIN must be ${pinLength} digits`);
      triggerShake();
      return;
    }

    setIsLoading(true);
    try {
      const res = await unlockAdminWithPin(pin);
      if (res.success) {
        showSuccess('Admin unlocked');
        setPin('');
        setIsLoading(false);
        return;
      }
      showError('Incorrect PIN');
      triggerShake();
      setPin('');
      setIsLoading(false);
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        'Unlock failed';
      showError(msg);
      triggerShake();
      setPin('');
      setIsLoading(false);
    }
  }, [canSubmit, pin, pinLength, showError, showSuccess, triggerShake, unlockAdminWithPin]);

  submitRef.current = handleSubmit;

  // Auto-submit when PIN length matches
  useEffect(() => {
    if (pin.length === pinLength) {
      const t = setTimeout(() => submitRef.current?.(), 200);
      return () => clearTimeout(t);
    }
  }, [pin, pinLength]);

  // Keyboard support while modal open
  useEffect(() => {
    if (!isUnlockOpen) return;
    const handler = (e) => {
      if (e.key >= '0' && e.key <= '9') handleKey(e.key);
      else if (e.key === 'Backspace') handleDelete();
      else if (e.key === 'Enter') submitRef.current?.();
      else if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleClose, handleDelete, handleKey, isUnlockOpen]);
  const isDarkTheme = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') !== 'light';

  return (
    <AnimatePresence>
      {isUnlockOpen && (
        <motion.div
          key="admin-unlock-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 5000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: isDarkTheme ? 'rgba(0,0,0,0.62)' : 'rgba(0,0,0,0.35)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            padding: 18,
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            style={{
              width: 'min(420px, 92vw)',
              borderRadius: 22,
              border: isDarkTheme ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.08)',
              background: isDarkTheme ? 'rgba(22, 26, 32, 0.86)' : 'rgba(255, 255, 255, 0.9)',
              boxShadow: isDarkTheme ? '0 24px 60px rgba(0,0,0,0.55)' : '0 20px 50px rgba(0,0,0,0.15)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: 18, borderBottom: isDarkTheme ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 14,
                      background: 'rgba(249,115,22,0.14)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid rgba(249,115,22,0.22)',
                      color: 'var(--primary-500)',
                      fontWeight: 900,
                    }}
                    aria-hidden
                  >
                    🔒
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-primary)' }}>
                      Admin Access Required
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {pendingPath ? `Unlock to open ${pendingPath}` : 'Enter Owner PIN'}
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleClose}
                  disabled={isLoading}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 14,
                    border: isDarkTheme ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.08)',
                    background: isDarkTheme ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            <div style={{ padding: 18 }}>
              <PinDots length={pinLength} filled={pin.length} shake={shake} />
              <Numpad
                onKey={handleKey}
                onDelete={handleDelete}
                onSubmit={handleSubmit}
                canSubmit={canSubmit}
                isLoading={isLoading}
              />         
              <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                Tip: Press <b>Esc</b> to close.
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

