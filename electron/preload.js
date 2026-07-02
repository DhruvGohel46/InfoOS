const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  isProduction: () => ipcRenderer.invoke('is-production'),
  
  // Menu events
  onNewBill: (callback) => ipcRenderer.on('menu-new-bill', callback),
  
  // Remove all listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  
  // Logging operations (Security hardened)
  writeLog: (level, message) => ipcRenderer.invoke('write-log', level, message),
  
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
  isPrinting: () => ipcRenderer.invoke('print:isPrinting')
});

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
