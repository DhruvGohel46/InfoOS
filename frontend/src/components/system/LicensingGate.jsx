import React, { useState, useEffect, useCallback } from 'react';
import { 
  IoLockClosedOutline, 
  IoAlertCircleOutline, 
  IoWarningOutline, 
  IoLaptopOutline, 
  IoLogOutOutline,
  IoRefreshOutline,
  IoMailOutline,
  IoKeyOutline
} from 'react-icons/io5';
import { cloudAuthAPI, cloudLicenseAPI, setCloudAuthToken } from '../../api/cloudApi';
import '../../styles/Licensing.css';

const OFFLINE_LIMIT_DAYS = 14;
const OFFLINE_WARNING_DAYS = 7;

export default function LicensingGate({ children }) {
  const [licensingState, setLicensingState] = useState({
    status: 'checking', // 'checking' | 'login' | 'expired' | 'mismatch' | 'active'
    errorMessage: '',
    expiryDate: null,
    registeredDevice: null,
  });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showWarningBar, setShowWarningBar] = useState(false);
  const [offlineDaysRemaining, setOfflineDaysRemaining] = useState(0);
  const [deviceInfo, setDeviceInfo] = useState(null);

  // Helper: Get local device info
  const getDeviceInfo = useCallback(async () => {
    if (window.electronAPI && window.electronAPI.getDeviceFingerprint) {
      const info = await window.electronAPI.getDeviceFingerprint();
      setDeviceInfo(info);
      return info;
    }
    // Web fallback for testing/development
    const fallbackInfo = { fingerprint: 'web-dev-fingerprint-placeholder', deviceName: 'Web Browser' };
    setDeviceInfo(fallbackInfo);
    return fallbackInfo;
  }, []);

  // Helper: Write encrypted local activation cache
  const writeLocalActivation = useCallback(async (userId, subscription) => {
    try {
      const { fingerprint } = await getDeviceInfo();
      const activationData = {
        user_id: userId,
        subscription_id: subscription.id,
        subscription_expiry: subscription.expiry_date,
        device_fingerprint: fingerprint,
        last_validation_time: new Date().toISOString()
      };

      const plainText = JSON.stringify(activationData);
      let encrypted = '';
      if (window.electronAPI && window.electronAPI.secureEncrypt) {
        encrypted = await window.electronAPI.secureEncrypt(plainText);
      } else {
        encrypted = btoa(plainText); // Simple base64 fallback for web/dev
      }

      localStorage.setItem('infoos_activation_cache', encrypted);
      localStorage.setItem('cloud_user_email', localStorage.getItem('cloud_user_email') || email);
    } catch (err) {
      console.error('Failed to write local activation cache:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getDeviceInfo]);

  // Main subscription check logic
  const checkSubscriptionStatus = useCallback(async (userId, token, forceDeviceCheck = false) => {
    try {
      const subscription = await cloudLicenseAPI.getSubscription(userId, token);
      
      if (!subscription) {
        return { status: 'login', error: 'No active subscription found. Please purchase a subscription on our website.' };
      }

      const now = new Date();
      const expiry = new Date(subscription.expiry_date);

      // 1. Check expiration
      if (expiry < now || subscription.status !== 'active') {
        return { 
          status: 'expired', 
          expiryDate: expiry.toLocaleDateString(),
          error: subscription.status === 'suspended' 
            ? 'Your subscription has been suspended. Please contact support.'
            : 'Your subscription has expired. Please renew to continue using InfoOS.'
        };
      }

      // 2. Check device activation
      const { fingerprint, deviceName } = await getDeviceInfo();

      if (!subscription.device_fingerprint) {
        // Case 1: First time activation. Register the device.
        await cloudLicenseAPI.registerDevice(userId, token, fingerprint, deviceName);
        const updatedSub = { ...subscription, device_fingerprint: fingerprint, device_name: deviceName };
        await writeLocalActivation(userId, updatedSub);
        return { status: 'active', expiryDate: expiry.toLocaleDateString() };
      }

      if (subscription.device_fingerprint === fingerprint) {
        // Case 2: Matching device
        await writeLocalActivation(userId, subscription);
        return { status: 'active', expiryDate: expiry.toLocaleDateString() };
      }

      // Case 3: Device mismatch
      return { 
        status: 'mismatch', 
        registeredDevice: subscription.device_name || 'Another computer',
        error: 'This subscription is already activated on another computer.' 
      };

    } catch (err) {
      console.error('Cloud validation failed:', err);
      return { status: 'error', error: err.message || 'Verification failed. Please check your internet connection.' };
    }
  }, [getDeviceInfo, writeLocalActivation]);

  // Perform startup checks
  const runStartupChecks = useCallback(async () => {
    setLicensingState(prev => ({ ...prev, status: 'checking', errorMessage: '' }));

    const cache = localStorage.getItem('infoos_activation_cache');
    const cloudToken = localStorage.getItem('cloud_auth_token');

    // Fetch device fingerprint
    const { fingerprint } = await getDeviceInfo();

    if (cache) {
      try {
        let decrypted = '';
        if (window.electronAPI && window.electronAPI.secureDecrypt) {
          decrypted = await window.electronAPI.secureDecrypt(cache);
        } else {
          decrypted = atob(cache); // Fallback
        }

        const data = JSON.parse(decrypted);

        // Validation 1: Match device fingerprint
        if (data.device_fingerprint !== fingerprint) {
          console.warn('Local cache fingerprint mismatch. Forcing online revalidation.');
          localStorage.removeItem('infoos_activation_cache');
          setLicensingState({ status: 'login', errorMessage: 'Device fingerprint changed. Please log in again.' });
          return;
        }

        // Validation 2: Expiration check
        const now = new Date();
        const expiry = new Date(data.subscription_expiry);
        if (expiry < now) {
          setLicensingState({ 
            status: 'expired', 
            expiryDate: expiry.toLocaleDateString(),
            errorMessage: 'Your subscription has expired.' 
          });
          return;
        }

        // Validation 3: Offline grace period checks
        const lastVal = new Date(data.last_validation_time);
        const diffMs = now - lastVal;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays >= OFFLINE_LIMIT_DAYS) {
          // Exceeded offline limit, lock app and force online verification
          if (navigator.onLine && cloudToken) {
            // Try to auto-validate online
            const result = await checkSubscriptionStatus(data.user_id, cloudToken);
            if (result.status === 'active') {
              setLicensingState({ status: 'active', expiryDate: result.expiryDate });
              return;
            }
          }
          setLicensingState({ 
            status: 'login', 
            errorMessage: `You have been offline for over ${OFFLINE_LIMIT_DAYS} days. Please connect to the internet to verify your subscription.` 
          });
          return;
        }

        // If online, perform background refresh of license
        if (navigator.onLine && cloudToken) {
          checkSubscriptionStatus(data.user_id, cloudToken).then(result => {
            if (result.status && result.status !== 'active') {
              // License state changed (expired/disabled) - enforce immediately
              setLicensingState({ 
                status: result.status, 
                expiryDate: result.expiryDate, 
                registeredDevice: result.registeredDevice,
                errorMessage: result.error 
              });
            }
          }).catch(e => console.error('Background license refresh failed:', e));
        }

        // Within grace period, allow launch
        if (diffDays >= OFFLINE_WARNING_DAYS) {
          const daysRemaining = OFFLINE_LIMIT_DAYS - diffDays;
          setOfflineDaysRemaining(daysRemaining);
          setShowWarningBar(true);
        }

        setLicensingState({ status: 'active', expiryDate: expiry.toLocaleDateString() });
        return;

      } catch (err) {
        console.error('Failed to parse local activation cache:', err);
        localStorage.removeItem('infoos_activation_cache');
      }
    }

    // No valid cache - online login required
    if (navigator.onLine && cloudToken) {
      // Attempt auto-login if token is available
      try {
        const payload = JSON.parse(atob(cloudToken.split('.')[1]));
        const result = await checkSubscriptionStatus(payload.sub, cloudToken);
        if (result.status === 'active') {
          setLicensingState({ status: 'active', expiryDate: result.expiryDate });
          return;
        }
      } catch (e) {
        console.error('Token auto-activation failed:', e);
      }
    }

    setLicensingState({ status: 'login', errorMessage: '' });
  }, [getDeviceInfo, checkSubscriptionStatus]);

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    runStartupChecks();
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  // Handle Login Submit
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setLicensingState(prev => ({ ...prev, errorMessage: '' }));

    try {
      const res = await cloudAuthAPI.login(email, password);

      if (res.success && res.data?.access_token) {
        const token = res.data.access_token;
        const user = res.data.user;

        // Check if email is verified
        if (user && !user.email_confirmed_at) {
          setLicensingState(prev => ({
            ...prev,
            status: 'login',
            errorMessage: 'Please verify your email address before connecting.'
          }));
          setLoading(false);
          return;
        }

        // Store tokens
        setCloudAuthToken(token);
        localStorage.setItem('cloud_user_email', email);

        // Verify subscription
        const result = await checkSubscriptionStatus(user.id, token);
        
        if (result.status === 'active') {
          setLicensingState({ status: 'active', expiryDate: result.expiryDate });
        } else {
          setLicensingState({ 
            status: result.status, 
            expiryDate: result.expiryDate, 
            registeredDevice: result.registeredDevice,
            errorMessage: result.error 
          });
        }
      } else {
        setLicensingState(prev => ({
          ...prev,
          status: 'login',
          errorMessage: res.error || 'Invalid email or password'
        }));
      }
    } catch (err) {
      const friendlyMsg = err.message && !err.message.includes('AxiosError')
        ? err.message
        : 'Unable to connect. Please check your internet connection and try again.';
      setLicensingState(prev => ({
        ...prev,
        status: 'login',
        errorMessage: friendlyMsg
      }));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setCloudAuthToken(null);
    localStorage.removeItem('infoos_activation_cache');
    setEmail('');
    setPassword('');
    setLicensingState({ status: 'login', errorMessage: 'Logged out successfully.' });
  };

  const openWebsite = (path = '') => {
    const baseUrl = 'https://infoos-web.vercel.app';
    if (window.open) {
      window.open(baseUrl + path, '_blank');
    }
  };

  // ── RENDER STATES ──────────────────────────────────────────────────────────

  if (licensingState.status === 'checking') {
    return (
      <div className="licensing-container">
        <div className="licensing-card" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '260px' }}>
          <div className="licensing-logo">InfoOS</div>
          <div style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <IoRefreshOutline className="spinning" size={18} />
            <span>Validating subscription license...</span>
          </div>
        </div>
      </div>
    );
  }

  if (licensingState.status === 'login') {
    return (
      <div className="licensing-container">
        <div className="licensing-glow-1"></div>
        <div className="licensing-glow-2"></div>
        
        <div className="licensing-card">
          {/* Stepper Progress Feeling */}
          <div className="licensing-stepper">
            <div className="licensing-step-dot active"></div>
            <div className="licensing-step-line"></div>
            <div className="licensing-step-dot"></div>
          </div>

          <div className="licensing-header">
            <div className="licensing-logo">InfoOS</div>
            <div className="licensing-logo-sub">Business Operating System</div>
            <div className="licensing-divider"></div>
            <h2 className="licensing-title stagger-in stagger-1">Secure Device Activation</h2>
            <p className="licensing-desc stagger-in stagger-2">Sign in with your InfoOS account to securely activate this device.</p>
          </div>

          {licensingState.errorMessage && (
            <div className="licensing-error-box stagger-in">
              <IoAlertCircleOutline size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 700, color: '#ff6b6b' }}>Activation Alert</span>
                <span style={{ fontSize: '12.5px', opacity: 0.9 }}>{licensingState.errorMessage}</span>
              </div>
            </div>
          )}

          <form className="licensing-form" onSubmit={handleLoginSubmit}>
            <div className="licensing-input-group stagger-in stagger-3">
              <label className="licensing-label">Email</label>
              <div className="licensing-input-wrapper">
                <IoMailOutline className="licensing-input-icon" />
                <input 
                  type="email" 
                  className="licensing-input" 
                  placeholder="john@email.com" 
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
            </div>
            
            <div className="licensing-input-group stagger-in stagger-4">
              <label className="licensing-label">Password</label>
              <div className="licensing-input-wrapper">
                <IoKeyOutline className="licensing-input-icon" />
                <input 
                  type="password" 
                  className="licensing-input" 
                  placeholder="••••••••" 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <button type="submit" className="licensing-btn stagger-in stagger-5" disabled={loading}>
              {loading ? <IoRefreshOutline className="spinning" size={18} /> : <IoLockClosedOutline size={18} />}
              <span>{loading ? 'Activating Device...' : 'Activate InfoOS'}</span>
            </button>
          </form>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
            <span className="licensing-link" onClick={() => openWebsite('/auth?tab=signup')}>Create account</span>
            <span className="licensing-link" onClick={() => openWebsite('/auth?tab=forgot')}>Forgot password</span>
          </div>

          {deviceInfo && (
            <div className="licensing-device-card stagger-in stagger-5">
              <div className="licensing-device-header">
                <IoLaptopOutline size={14} />
                <span>🖥 Device Configuration</span>
              </div>
              <div className="licensing-device-grid">
                <div className="licensing-device-row">
                  <span className="licensing-device-icon">💻</span>
                  <span className="licensing-device-value">{deviceInfo.deviceName || 'Unknown Device'}</span>
                </div>
                <div className="licensing-device-row">
                  <span className="licensing-device-icon">⚙️</span>
                  <span className="licensing-device-value">Windows 11 Pro</span>
                </div>
                <div className="licensing-device-row">
                  <span className="licensing-device-icon">🔑</span>
                  <span className="licensing-device-value" style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                    Device ID: {deviceInfo.fingerprint?.substring(0, 12) || 'Unknown'}...
                  </span>
                </div>
              </div>
              <div className="licensing-device-status-badge">
                <span>✓ Ready for activation</span>
              </div>
            </div>
          )}

          <div className="licensing-footer stagger-in stagger-5">
            <div style={{ marginBottom: '12px' }}>
              Don't have a license? <span className="licensing-link" style={{ color: '#FF7A00', fontWeight: '700' }} onClick={() => openWebsite()}>Buy License →</span>
            </div>
            <div style={{ opacity: 0.5, fontSize: '11px', marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span>Protected by InfoOS Cloud</span>
              <span>Version 2.0.1</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (licensingState.status === 'expired') {
    return (
      <div className="licensing-container">
        <div className="licensing-card">
          <div className="licensing-header">
            <div className="licensing-logo">InfoOS</div>
            <div style={{ color: '#f87171', fontSize: '48px', margin: '8px 0' }}>
              <IoWarningOutline />
            </div>
            <h2 className="licensing-title">Subscription Expired</h2>
            <p className="licensing-desc">Your subscription ended on <b>{licensingState.expiryDate}</b>.</p>
          </div>

          {licensingState.errorMessage && (
            <div className="licensing-error-box">
              <IoAlertCircleOutline size={20} />
              <span>{licensingState.errorMessage}</span>
            </div>
          )}

          <div className="licensing-plan-details">
            <div>Product: <b>InfoOS Standalone POS</b></div>
            <div>Expiry: <b style={{ color: '#f87171' }}>{licensingState.expiryDate}</b></div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button className="licensing-btn" onClick={() => openWebsite('/billing')}>
              Renew Subscription
            </button>
            <button className="licensing-secondary-btn" onClick={runStartupChecks}>
              <IoRefreshOutline size={16} />
              <span>Check Expiry Status Again</span>
            </button>
            <button className="licensing-secondary-btn" onClick={handleLogout} style={{ color: '#f87171' }}>
              <IoLogOutOutline size={18} />
              <span>Sign Out Account</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleUnlinkActiveDevice = async () => {
    const cloudToken = localStorage.getItem('cloud_auth_token');
    if (!cloudToken) {
      setLicensingState(prev => ({
        ...prev,
        status: 'login',
        errorMessage: 'Authentication session expired. Please log in again.'
      }));
      return;
    }

    setLoading(true);
    setLicensingState(prev => ({ ...prev, errorMessage: '' }));

    try {
      const payload = JSON.parse(atob(cloudToken.split('.')[1]));
      const userId = payload.sub;
      
      // Call the API to clear active fingerprint
      await cloudLicenseAPI.unlinkDevice(userId, cloudToken);
      
      // Re-trigger validation now that the slot is open
      const result = await checkSubscriptionStatus(userId, cloudToken);
      if (result.status === 'active') {
        setLicensingState({ status: 'active', expiryDate: result.expiryDate });
      } else {
        setLicensingState({
          status: result.status,
          expiryDate: result.expiryDate,
          registeredDevice: result.registeredDevice,
          errorMessage: result.error
        });
      }
    } catch (err) {
      setLicensingState(prev => ({
        ...prev,
        errorMessage: err.message || 'Failed to unlink device. Please try again.'
      }));
    } finally {
      setLoading(false);
    }
  };

  if (licensingState.status === 'mismatch') {
    return (
      <div className="licensing-container">
        <div className="licensing-glow-1"></div>
        <div className="licensing-glow-2"></div>

        <div className="licensing-card">
          <div className="licensing-header">
            <div className="licensing-logo">InfoOS</div>
            <div className="licensing-logo-sub">Business Operating System</div>
            <div className="licensing-divider"></div>
            <div style={{ color: 'var(--primary-500)', fontSize: '48px', margin: '8px 0' }}>
              <IoLaptopOutline />
            </div>
            <h2 className="licensing-title">Device Limit Reached</h2>
            <p className="licensing-desc">
              Your subscription is active, but linked to another machine:<br />
              <b style={{ color: 'white' }}>"{licensingState.registeredDevice}"</b>
            </p>
          </div>

          {licensingState.errorMessage && (
            <div className="licensing-error-box">
              <IoAlertCircleOutline size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 700, color: '#ff6b6b' }}>Failed to Link</span>
                <span style={{ fontSize: '12.5px', opacity: 0.9 }}>{licensingState.errorMessage}</span>
              </div>
            </div>
          )}

          <div className="licensing-error-box" style={{ background: 'rgba(249, 115, 22, 0.08)', borderLeft: '3px solid var(--primary-500)', color: 'var(--primary-300)' }}>
            <IoAlertCircleOutline size={20} style={{ flexShrink: 0 }} />
            <span>InfoOS policy allows 1 active device per subscription. You can deactivate the other machine instantly below.</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button 
              className="licensing-btn" 
              onClick={handleUnlinkActiveDevice}
              disabled={loading}
            >
              {loading ? <IoRefreshOutline className="spinning" size={18} /> : null}
              <span>{loading ? 'Deactivating other device...' : 'Deactivate Other Device & Connect'}</span>
            </button>
            <button className="licensing-secondary-btn" onClick={runStartupChecks}>
              <IoRefreshOutline size={16} />
              <span>Retry Validation</span>
            </button>
            <button className="licensing-secondary-btn" onClick={handleLogout} style={{ color: '#f87171' }}>
              <IoLogOutOutline size={18} />
              <span>Activate Different Account</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (licensingState.status === 'active') {
    return (
      <>
        {showWarningBar && (
          <div className="licensing-warning-bar">
            <span>
              ⚠️ <b>Offline Mode Notice</b>: Revalidation with the server is required in <b>{offlineDaysRemaining} days</b>. Please connect to the internet soon.
            </span>
            <button className="licensing-warning-close" onClick={() => setShowWarningBar(false)}>Dismiss</button>
          </div>
        )}
        {children}
      </>
    );
  }

  return null;
}
