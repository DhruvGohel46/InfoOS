const { contextBridge, ipcRenderer } = require('electron');

// Raw protected API definitions
const rawAPI = {
  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  isProduction: () => ipcRenderer.invoke('is-production'),
  changeTheme: (theme) => ipcRenderer.invoke('theme-changed', theme),
  
  // Menu events
  onNewBill: (callback) => ipcRenderer.on('menu-new-bill', callback),

  // Zoom scaling
  setZoomFactor: (factor) => ipcRenderer.send('set-zoom-factor', factor),
  
  // Remove all listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  
  // Logging operations (Security hardened)
  writeLog: (level, message) => ipcRenderer.invoke('write-log', typeof level === 'object' ? level : { level, message }),
  
  // System info
  getSystemInfo: () => ipcRenderer.invoke('system:getInfo'),

  // Licensing & Activation
  getDeviceFingerprint: () => ipcRenderer.invoke('license:getFingerprint'),
  secureEncrypt: (plainText) => ipcRenderer.invoke('secure:encrypt', plainText),
  secureDecrypt: (cipherText) => ipcRenderer.invoke('secure:decrypt', cipherText),

  // Auto-Updater
  onUpdateAvailable: (callback) => {
    const subscription = (event, info) => callback(event, info);
    ipcRenderer.on('update-available', subscription);
    return () => ipcRenderer.removeListener('update-available', subscription);
  },
  onUpdateProgress: (callback) => {
    const subscription = (event, info) => callback(event, info);
    ipcRenderer.on('download-progress', subscription);
    return () => ipcRenderer.removeListener('download-progress', subscription);
  },
  onUpdateDownloaded: (callback) => {
    const subscription = (event, info) => callback(event, info);
    ipcRenderer.on('update-downloaded', subscription);
    return () => ipcRenderer.removeListener('update-downloaded', subscription);
  },
  installUpdate: () => ipcRenderer.send('install-update'),
  getUpdaterStatus: () => ipcRenderer.invoke('updater:get-status'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  onInstallRequest: (callback) => {
    const subscription = (event) => callback();
    ipcRenderer.on('updater:request-install', subscription);
    return () => ipcRenderer.removeListener('updater:request-install', subscription);
  },
  sendInstallResponse: (safe, reason) => ipcRenderer.send('updater:install-response', { safe, reason }),
  onUpdateStatusChanged: (callback) => {
    const subscription = (event, state) => callback(state);
    ipcRenderer.on('updater:status-changed', subscription);
    return () => ipcRenderer.removeListener('updater:status-changed', subscription);
  },
  onUpdatePostponed: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('updater:postponed', subscription);
    return () => ipcRenderer.removeListener('updater:postponed', subscription);
  },

  // Printing APIs
  printBill: (billNo) => ipcRenderer.invoke('print:bill', billNo),
  printKOT: (billNo) => ipcRenderer.invoke('print:kot', billNo),
  printBillAndKOT: (billNo) => ipcRenderer.invoke('print:billAndKOT', billNo),
  isPrinting: () => ipcRenderer.invoke('print:isPrinting'),

  // File Operations
  saveFile: (filename, base64Data) => ipcRenderer.invoke('file:save', filename, base64Data),

  // Auto-Start
  getAutoStart: () => ipcRenderer.invoke('autostart:get'),
  setAutoStart: (value) => ipcRenderer.invoke('autostart:set', value),

  // Developer APIs
  getDevMode: () => ipcRenderer.invoke('developer:getMode'),
  setDevMode: (val) => ipcRenderer.invoke('developer:setMode', val),
  openDevTools: () => ipcRenderer.invoke('developer:openDevTools'),
  reloadWindow: () => ipcRenderer.invoke('developer:reloadWindow'),
  restartBackend: () => ipcRenderer.invoke('developer:restartBackend'),
  openLogsFolder: () => ipcRenderer.invoke('developer:openLogsFolder'),
  openUserDataFolder: () => ipcRenderer.invoke('developer:openUserDataFolder'),
  clearCache: () => ipcRenderer.invoke('developer:clearCache'),
  readLogs: (lines) => ipcRenderer.invoke('developer:readLogs', lines),
  getDiagnosticInfo: () => ipcRenderer.invoke('developer:getDiagnosticInfo')
};

// Instrument rawAPI wrapper functions
const instrumentedAPI = {};
const now = () => typeof performance !== 'undefined' ? performance.now() : Date.now();

Object.keys(rawAPI).forEach(key => {
  if (typeof rawAPI[key] === 'function') {
    if (key.startsWith('on')) {
      // Synchronous subscription hook
      instrumentedAPI[key] = (...args) => {
        const startTime = now();
        const timestamp = new Date().toISOString();
        try {
          const result = rawAPI[key](...args);
          const duration = now() - startTime;
          if (typeof window !== 'undefined' && window.dispatchEvent && window.CustomEvent) {
            window.dispatchEvent(new window.CustomEvent('ipc-diagnostic', {
              detail: {
                method: key,
                args: ['EventCallback'],
                status: 'subscribed',
                duration: parseFloat(duration.toFixed(1)),
                timestamp
              }
            }));
          }
          return result;
        } catch (err) {
          const duration = now() - startTime;
          if (typeof window !== 'undefined' && window.dispatchEvent && window.CustomEvent) {
            window.dispatchEvent(new window.CustomEvent('ipc-diagnostic', {
              detail: {
                method: key,
                args: ['EventCallback'],
                status: 'error',
                error: err.message,
                duration: parseFloat(duration.toFixed(1)),
                timestamp
              }
            }));
          }
          throw err;
        }
      };
    } else {
      // Asynchronous command hook
      instrumentedAPI[key] = async (...args) => {
        const startTime = now();
        const timestamp = new Date().toISOString();
        try {
          const result = await rawAPI[key](...args);
          const duration = now() - startTime;
          if (typeof window !== 'undefined' && window.dispatchEvent && window.CustomEvent) {
            window.dispatchEvent(new window.CustomEvent('ipc-diagnostic', {
              detail: {
                method: key,
                args: args,
                status: 'success',
                duration: parseFloat(duration.toFixed(1)),
                timestamp
              }
            }));
          }
          return result;
        } catch (err) {
          const duration = now() - startTime;
          if (typeof window !== 'undefined' && window.dispatchEvent && window.CustomEvent) {
            window.dispatchEvent(new window.CustomEvent('ipc-diagnostic', {
              detail: {
                method: key,
                args: args,
                status: 'error',
                error: err.message,
                duration: parseFloat(duration.toFixed(1)),
                timestamp
              }
            }));
          }
          throw err;
        }
      };
    }
  } else {
    instrumentedAPI[key] = rawAPI[key];
  }
});

// Expose safe instrumented API
contextBridge.exposeInMainWorld('electronAPI', instrumentedAPI);

// Disable features for security
window.addEventListener('DOMContentLoaded', () => {
  // Disable right-click context menu
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    return false;
  });
  
  // Disable text selection in certain areas
  const disableSelection = (elements) => {
    elements.forEach(el => {
      if (el) el.style.userSelect = 'none';
    });
  };
  
  // Apply to header, navigation, etc.
  disableSelection([
    document.querySelector('header'),
    document.querySelector('nav'),
    document.querySelector('.sidebar')
  ]);
});
