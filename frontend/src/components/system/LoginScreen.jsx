import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAlert } from '../../context/AlertContext';
import { usePOSData } from '../../context/POSDataContext';
import { setAuthToken } from '../../api/api';
import axios from 'axios';
import './LoginScreen.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5050';

const LoginScreen = ({ onLoginSuccess }) => {
  const [pin, setPin] = useState('');
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { showError, showSuccess } = useAlert();
  const { refreshData } = usePOSData();

  useEffect(() => {
    // Check if auth is enabled and setup
    const checkAuthStatus = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/auth/status`);
        if (res.data.success) {
          if (!res.data.enabled) {
            // Auth not enforced globally, let them through perfectly
            onLoginSuccess();
          } else if (!res.data.is_setup) {
            // Needs initial setup
            setIsSetupMode(true);
            setIsLoading(false);
          } else {
            // Ready for login
            setIsSetupMode(false);
            setIsLoading(false);
          }
        }
      } catch (err) {
        showError("Failed to connect to security server");
      }
    };
    checkAuthStatus();
  }, [onLoginSuccess, showError]);

  const handleKeyPress = (num) => {
    if (pin.length < 6) {
      setPin(prev => prev + num);
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
  };

  const handleSubmit = async () => {
    if (pin.length < 4) {
      showError("PIN must be at least 4 digits");
      return;
    }

    setIsLoading(true);
    try {
      const endpoint = isSetupMode ? '/api/auth/setup' : '/api/auth/login';
      const res = await axios.post(`${API_BASE_URL}${endpoint}`, { pin });

      if (res.data.success && res.data.token) {
        setAuthToken(res.data.token);
        if (isSetupMode) showSuccess("Security PIN Setup Complete!");
        
        // Ensure data loads cleanly after auth grants permission
        await refreshData();
        onLoginSuccess();
      }
    } catch (err) {
      // Handled by API interceptor naturally, but we clear PIN locally
      setPin('');
      setIsLoading(false);
    }
  };

  if (isLoading && !pin) {
    return (
      <div className="login-container">
        <div className="login-loader">Loading Security Module...</div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <motion.div 
        className="login-card glass-panel"
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="login-header">
          <h2>{isSetupMode ? "Setup Owner PIN" : "Enter PIN"}</h2>
          <p>{isSetupMode ? "Create a 4-6 digit PIN to secure your POS" : "Authentication Required"}</p>
        </div>

        <div className="pin-display">
          {[...Array(6)].map((_, i) => (
            <div key={i} className={`pin-dot ${i < pin.length ? 'filled' : ''}`} />
          ))}
        </div>

        <div className="numpad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <motion.button 
              key={num}
              className="numpad-btn"
              whileTap={{ scale: 0.9 }}
              onClick={() => handleKeyPress(num.toString())}
              disabled={isLoading}
            >
              {num}
            </motion.button>
          ))}
          <motion.button 
            className="numpad-btn action-btn" 
            whileTap={{ scale: 0.9 }}
            onClick={handleDelete}
            disabled={isLoading}
          >
            C
          </motion.button>
          <motion.button 
            className="numpad-btn" 
            whileTap={{ scale: 0.9 }}
            onClick={() => handleKeyPress('0')}
            disabled={isLoading}
          >
            0
          </motion.button>
          <motion.button 
            className="numpad-btn action-btn submit-btn" 
            whileTap={{ scale: 0.9 }}
            onClick={handleSubmit}
            disabled={pin.length < 4 || isLoading}
          >
            OK
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
};

export default LoginScreen;
