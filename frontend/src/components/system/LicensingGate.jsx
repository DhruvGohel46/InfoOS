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
import infoosDevice3d from '../../assets/infoos_device_3d.png';

const OFFLINE_LIMIT_DAYS = 14;
const OFFLINE_WARNING_DAYS = 7;

export default function LicensingGate({ children }) {
  const [isProduction, setIsProduction] = useState(false);
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
  // eslint-disable-next-line no-unused-vars
  const [deviceInfo, setDeviceInfo] = useState(null);

  // Helper: Get local device info
  const getDeviceInfo = useCallback(async () => {
    if (window.electronAPI && window.electronAPI.getDeviceFingerprint) {
      const info = await window.electronAPI.getDeviceFingerprint();
      setDeviceInfo(info);
      return info;
    }
    // Web fallback for testing/development
    const fallbackInfo = { fingerprint: 'web-dev-fingerprint-placeholder', deviceName: 'Web Browser', operatingSystem: 'Windows 11 Pro' };
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

    // Refresh cloud session on startup if online
    if (navigator.onLine) {
      try {
        await cloudAuthAPI.refreshSession();
      } catch (refreshErr) {
        console.warn('Startup session refresh failed:', refreshErr);
      }
    }

    const cache = localStorage.getItem('infoos_activation_cache');

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
        const lastValidated = new Date(data.validated_at);
        const diffTime = Math.abs(now - lastValidated);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays > OFFLINE_LIMIT_DAYS) {
          // If offline warning limit reached, require online recheck
          if (!navigator.onLine) {
            setLicensingState({ 
              status: 'login', 
              errorMessage: `You have been offline for over ${OFFLINE_LIMIT_DAYS} days. Please connect to the internet to verify your subscription.` 
            });
            return;
          }
        }

        // If online and in production, perform background refresh of license
        if (isProduction && navigator.onLine) {
          const cloudToken = localStorage.getItem('cloud_auth_token');
          if (cloudToken) {
            try {
              const result = await checkSubscriptionStatus(data.user_id, cloudToken);
              if (result.status && result.status !== 'active') {
                // License state changed (expired/disabled) - enforce immediately
                setLicensingState({ 
                  status: result.status, 
                  expiryDate: result.expiryDate, 
                  registeredDevice: result.registeredDevice,
                  errorMessage: result.error 
                });
                return;
              }
            } catch (e) {
              console.error('Background license refresh failed:', e);
              // Do NOT force re-login if the cache is still within the offline grace period.
              // Just fall through to allow offline/cached activation within the grace period.
              console.log('Allowing access via cached activation due to background refresh failure.');
            }
          }
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
    // In production, always require login
    if (isProduction) {
      setLicensingState({ status: 'login', errorMessage: '' });
    } else {
      // In dev mode, allow access for testing
      setLicensingState({ status: 'active', expiryDate: 'Development Mode' });
    }
  }, [getDeviceInfo, isProduction, checkSubscriptionStatus]);

  // Check if running in production mode
  useEffect(() => {
    const checkProductionMode = async () => {
      if (window.electronAPI && window.electronAPI.isProduction) {
        const prod = await window.electronAPI.isProduction();
        setIsProduction(prod);
      }
    };
    checkProductionMode();
  }, []);

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    runStartupChecks();
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  // Listen for custom logout events dispatched from settings
  useEffect(() => {
    const onLicensingLogout = () => {
      console.log('Received licensing-logout event, resetting activation cache and navigating to login.');
      setCloudAuthToken(null, null);
      localStorage.removeItem('infoos_activation_cache');
      setEmail('');
      setPassword('');
      setLicensingState({ status: 'login', errorMessage: 'Logged out successfully.' });
    };
    window.addEventListener('licensing-logout', onLicensingLogout);
    return () => {
      window.removeEventListener('licensing-logout', onLicensingLogout);
    };
  }, []);

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
        const refreshToken = res.data.refresh_token;
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
        setCloudAuthToken(token, refreshToken);
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
        
        {/* Split-Panel Glass Card */}
        <div className="licensing-split-card">
          
          {/* Left Side: Graphic Panel */}
          <div className="licensing-left-panel">
            <img 
              src={infoosDevice3d} 
              alt="InfoOS 3D POS Device" 
              className="licensing-showcase-img"
            />
            <div className="licensing-graphic-overlay">
              <div className="licensing-graphic-tag">POS TERMINAL ACTIVATION</div>
              <p className="licensing-graphic-text">
                Securely register this hardware to start managing your point of sale with InfoOS.
              </p>
            </div>
          </div>

          {/* Right Side: Form Panel */}
          <div className="licensing-right-panel">
            <div className="licensing-form-container">
              {/* Logo & Eyebrow */}
              <div className="licensing-logo-area">
                <img src="/logo.png" alt="InfoOS Logo" className="licensing-logo-img" />
                <div className="licensing-logo">InfoOS</div>
                <div className="licensing-eyebrow">POINT OF SALE OS</div>
              </div>

              {/* Heading & Subheading */}
              <div className="licensing-header">
                <h2 className="licensing-title">Welcome Back</h2>
                <p className="licensing-desc">Sign in to continue using InfoOS POS</p>
              </div>

              {/* Alert Banner (conditional) */}
              {licensingState.errorMessage && (
                <div className="licensing-error-box">
                  <IoAlertCircleOutline size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '13px', opacity: 0.9 }}>{licensingState.errorMessage}</span>
                  </div>
                </div>
              )}

              {/* Form */}
              <form className="licensing-form" onSubmit={handleLoginSubmit}>
                <div className="licensing-input-group">
                  <label className="licensing-label">Username / Email</label>
                  <div className="licensing-input-wrapper">
                    <IoMailOutline className="licensing-input-icon" />
                    <input 
                      type="email" 
                      className="licensing-input" 
                      placeholder="name@company.com" 
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                </div>
                
                <div className="licensing-input-group">
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

                <button type="submit" className="licensing-btn" disabled={loading}>
                  {loading ? <IoRefreshOutline className="spinning" size={18} /> : <IoLockClosedOutline size={18} />}
                  <span>{loading ? 'Authenticating Device...' : 'Login to License'}</span>
                </button>
              </form>

              {/* Secondary Links Row */}
              <div className="licensing-links-row">
                <span className="licensing-link" onClick={() => openWebsite('/auth?tab=signup')}>Create account</span>
                <span className="licensing-link" onClick={() => openWebsite('/auth?tab=forgot')}>Forgot password</span>
              </div>

              {/* Help Line */}
              <div className="licensing-help-line">
                Need help? <span className="licensing-link-orange" onClick={() => openWebsite()}>Contact Administrator</span>
              </div>

              {/* Footer */}
              <div className="licensing-footer-minimal">
                InfoOS POS &copy; 2026
              </div>
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
