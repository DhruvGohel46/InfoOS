import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAlert } from '../../context/AlertContext';
import { usePOSData } from '../../context/POSDataContext';
import {
  getAuthStatus,
  loginWithPin,
  setupPin,
  persistToken,
  getStoredToken,
  isTokenValid,
} from '../../api/auth';
import './LoginScreen.css';

// ─── Sub-component: PIN dot row ───────────────────────────────────────────────
const PinDots = ({ length, filled, shake }) => (
  <motion.div
    className="pin-display"
    animate={shake ? { x: [0, -10, 10, -8, 8, -4, 4, 0] } : { x: 0 }}
    transition={{ duration: 0.4 }}
  >
    {[...Array(length)].map((_, i) => (
      <div key={i} className={`pin-dot ${i < filled ? 'filled' : ''}`} />
    ))}
  </motion.div>
);

// ─── Sub-component: Numpad ────────────────────────────────────────────────────
const Numpad = ({ onKey, onDelete, onSubmit, canSubmit, isLoading }) => {
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  return (
    <div className="numpad">
      {keys.map((n) => (
        <motion.button
          key={n}
          className="numpad-btn"
          whileTap={{ scale: 0.88 }}
          onClick={() => onKey(n.toString())}
          disabled={isLoading}
          aria-label={`Digit ${n}`}
        >
          {n}
        </motion.button>
      ))}
      <motion.button
        className="numpad-btn action-btn"
        whileTap={{ scale: 0.88 }}
        onClick={onDelete}
        disabled={isLoading}
        aria-label="Delete"
      >
        ⌫
      </motion.button>
      <motion.button
        className="numpad-btn"
        whileTap={{ scale: 0.88 }}
        onClick={() => onKey('0')}
        disabled={isLoading}
        aria-label="Digit 0"
      >
        0
      </motion.button>
      <motion.button
        className={`numpad-btn submit-btn ${canSubmit ? 'active' : ''}`}
        whileTap={{ scale: 0.88 }}
        onClick={onSubmit}
        disabled={!canSubmit || isLoading}
        aria-label="Confirm PIN"
      >
        {isLoading ? (
          <span className="spin-loader" />
        ) : (
          '✓'
        )}
      </motion.button>
    </div>
  );
};

// ─── Main LoginScreen ─────────────────────────────────────────────────────────
const LoginScreen = ({ onLoginSuccess }) => {
  const [phase, setPhase] = useState('loading'); // 'loading' | 'login' | 'setup' | 'confirm'
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [shake, setShake] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { showError, showSuccess } = useAlert();
  const { refreshData } = usePOSData();

  const triggerShake = useCallback(() => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }, []);

  // ── Boot: check auth status or use stored token ──────────────────────────
  useEffect(() => {
    const boot = async () => {
      try {
        // 1. Check if we have a still-valid session token
        const stored = getStoredToken();
        if (stored && isTokenValid(stored)) {
          persistToken(stored); // re-attach to axios
          onLoginSuccess();
          return;
        }

        // 2. Ask server for auth config
        const status = await getAuthStatus();
        if (!status.enabled) {
          // PIN is globally disabled — pass through
          onLoginSuccess();
          return;
        }

        if (!status.is_setup) {
          setPhase('setup');
        } else {
          setPhase('login');
        }
      } catch {
        // Backend unreachable — let them through in degraded mode
        showError('Could not connect to security server');
        onLoginSuccess();
      }
    };
    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-submit when max digits reached ────────────────────────────────────
  const submitRef = useRef(null);
  useEffect(() => {
    const currentPin = phase === 'confirm' ? confirmPin : pin;
    if (currentPin.length === 6) {
      // Short delay so user can see the last dot fill
      const t = setTimeout(() => submitRef.current?.(), 200);
      return () => clearTimeout(t);
    }
  }, [pin, confirmPin, phase]);

  // ── Keyboard support ────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key >= '0' && e.key <= '9') handleKey(e.key);
      else if (e.key === 'Backspace') handleDelete();
      else if (e.key === 'Enter') submitRef.current?.();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, confirmPin, phase]);

  const currentPin = phase === 'confirm' ? confirmPin : pin;
  const setCurrentPin = phase === 'confirm' ? setConfirmPin : setPin;

  const handleKey = (digit) => {
    if (currentPin.length < 6) {
      setCurrentPin((p) => p + digit);
    }
  };

  const handleDelete = () => {
    setCurrentPin((p) => p.slice(0, -1));
  };

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (currentPin.length < 4) {
      showError('PIN must be at least 4 digits');
      triggerShake();
      return;
    }

    // Setup: first collect PIN, then confirm
    if (phase === 'setup') {
      setPhase('confirm');
      return;
    }

    // Confirm step: validate match then create
    if (phase === 'confirm') {
      if (pin !== confirmPin) {
        showError('PINs do not match — please try again');
        triggerShake();
        setConfirmPin('');
        return;
      }
    }

    setIsLoading(true);
    try {
      let result;
      if (phase === 'confirm') {
        result = await setupPin(pin);
      } else {
        result = await loginWithPin(pin);
      }

      if (result.success && result.token) {
        persistToken(result.token);
        if (phase === 'confirm') showSuccess('Security PIN created — you\'re all set!');
        await refreshData();
        onLoginSuccess();
      }
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        'Incorrect PIN';
      showError(msg);
      triggerShake();
      setPin('');
      setConfirmPin('');
      setIsLoading(false);
    }
  }, [phase, pin, confirmPin, currentPin, onLoginSuccess, showError, showSuccess, refreshData, triggerShake]);

  // Register submit ref for auto-submit & keyboard
  submitRef.current = handleSubmit;

  // ── Loading phase ───────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="login-container">
        <div className="login-loader">
          <span className="spin-loader large" />
          <p>Initializing…</p>
        </div>
      </div>
    );
  }

  // ── Labels by phase ─────────────────────────────────────────────────────────
  const titles = {
    login: 'Welcome Back',
    setup: 'Create Your PIN',
    confirm: 'Confirm Your PIN',
  };
  const subtitles = {
    login: 'Enter your owner PIN to continue',
    setup: 'Choose a 4–6 digit PIN to secure InfoBill',
    confirm: 'Enter the same PIN again to confirm',
  };

  return (
    <div className="login-container">
      <AnimatePresence mode="wait">
        <motion.div
          key={phase}
          className="login-card"
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.97 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Logo / Brand */}
          <div className="login-brand">
            <div className="login-logo">
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                <rect width="36" height="36" rx="10" fill="var(--primary-500)" />
                <path d="M10 24L14 12L18 20L22 15L26 24H10Z" fill="white" opacity="0.9" />
              </svg>
            </div>
            <span className="login-brand-name">InfoBill</span>
          </div>

          {/* Title */}
          <div className="login-header">
            <h2>{titles[phase]}</h2>
            <p>{subtitles[phase]}</p>
          </div>

          {/* PIN dots */}
          <PinDots length={6} filled={currentPin.length} shake={shake} />

          {/* Numpad */}
          <Numpad
            onKey={handleKey}
            onDelete={handleDelete}
            onSubmit={handleSubmit}
            canSubmit={currentPin.length >= 4}
            isLoading={isLoading}
          />

          {/* Back button on confirm phase */}
          {phase === 'confirm' && (
            <button
              className="login-back-btn"
              onClick={() => { setPhase('setup'); setConfirmPin(''); }}
            >
              ← Back
            </button>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default LoginScreen;
