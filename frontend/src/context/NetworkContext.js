import React, { createContext, useState, useEffect, useContext } from 'react';

const NetworkContext = createContext();

export const NetworkProvider = ({ children }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // We also want to detect if the backend server itself is reachable, 
  // not just if the network interface is up.
  // We'll set up a heartbeat every 30s.
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    const pingBackend = async () => {
        try {
            // Use same-origin proxied path in dev to avoid CORS issues.
            await fetch('/health');
            if (!isOnline) setIsOnline(true);
        } catch (e) {
            // Only set offline if we get a network error
            setIsOnline(false);
        }
    };
    
    // Heartbeat only if navigator says we are online
    const interval = setInterval(() => {
       if (navigator.onLine) pingBackend();
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [isOnline]);

  return (
    <NetworkContext.Provider value={{ isOnline, setIsOnline }}>
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetwork = () => useContext(NetworkContext);
