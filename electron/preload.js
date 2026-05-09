const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  
  // Menu events
  onNewBill: (callback) => ipcRenderer.on('menu-new-bill', callback),
  
  // Remove all listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  
  // Logging operations (Security hardened)
  writeLog: (level, message) => ipcRenderer.invoke('write-log', level, message),
  
  // System info
  getSystemInfo: () => ipcRenderer.invoke('system:getInfo'),

  // Auto-Updater
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', callback),
  onUpdateProgress: (callback) => ipcRenderer.on('download-progress', callback),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', callback),
  installUpdate: () => ipcRenderer.send('install-update'),

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
