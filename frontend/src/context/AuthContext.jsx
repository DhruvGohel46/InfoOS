import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearToken, getStoredToken, isTokenValid, loginWithPin, persistToken } from '../api/auth';

const AuthContext = createContext(null);

const MODE = {
  WORKER: 'worker',
  ADMIN: 'admin',
};

export function AuthProvider({ children }) {
  const navigate = useNavigate();

  const initialIsAdmin = (() => {
    const token = getStoredToken();
    return token && isTokenValid(token);
  })();

  const [mode, setMode] = useState(initialIsAdmin ? MODE.ADMIN : MODE.WORKER);
  const [isUnlockOpen, setIsUnlockOpen] = useState(false);
  const [pendingPath, setPendingPath] = useState(null);
  const [pendingCallback, setPendingCallback] = useState(null);

  const openUnlock = useCallback((action = null) => {
    if (typeof action === 'function') {
      setPendingCallback(() => action);
      setPendingPath(null);
    } else {
      setPendingPath(action);
      setPendingCallback(null);
    }
    setIsUnlockOpen(true);
  }, []);

  const closeUnlock = useCallback(() => {
    setIsUnlockOpen(false);
    setPendingCallback(null);
  }, []);

  const unlockAdminWithPin = useCallback(async (pin) => {
    const res = await loginWithPin(pin);
    if (res?.success && res?.token) {
      persistToken(res.token);
      setMode(MODE.ADMIN);
      setIsUnlockOpen(false);
      
      if (pendingCallback) {
        pendingCallback();
        setPendingCallback(null);
      }
      
      const target = pendingPath;
      setPendingPath(null);
      if (target) navigate(target);
      return { success: true };
    }
    return { success: false };
  }, [navigate, pendingPath, pendingCallback]);

  const lockToWorker = useCallback(() => {
    clearToken();
    setMode(MODE.WORKER);
    setPendingPath(null);
    setPendingCallback(null);
    setIsUnlockOpen(false);
  }, []);

  const value = useMemo(() => ({
    mode,
    isAdmin: mode === MODE.ADMIN,
    isWorker: mode === MODE.WORKER,
    isUnlockOpen,
    pendingPath,
    openUnlock,
    closeUnlock,
    unlockAdminWithPin,
    lockToWorker,
  }), [mode, isUnlockOpen, pendingPath, openUnlock, closeUnlock, unlockAdminWithPin, lockToWorker]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

