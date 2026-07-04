const { autoUpdater } = require('electron-updater');
const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

// Logger utility helper writing directly to backend/electron's shared app.log
function log(level, msg) {
  console.log(`[UpdateManager] [${level}]: ${msg}`);
  try {
    const dataDir = process.env.POS_DATA_DIR || path.join(require('electron').app.getPath('userData'), 'data');
    const logDir = path.join(dataDir, 'logs');
    const logFile = path.join(logDir, 'app.log');

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const line = `${ts} | ${(level || 'INFO').toUpperCase().padEnd(8)} | electron:updateManager         | ${msg}  [rid=-]\n`;
    fs.appendFileSync(logFile, line, 'utf8');
  } catch (err) {
    console.error('[UpdateManager] Logging failed:', err.message);
  }
}

class UpdateManager {
  constructor() {
    this.mainWindow = null;
    this.killBackendCallback = null;

    // State parameters
    this.status = 'idle'; // 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'
    this.percent = 0;
    this.bytesPerSecond = 0;
    this.latestVersion = 'unknown';
    this.lastChecked = null;
    this.errorMessage = null;

    this.installResponseResolver = null;
  }

  /**
   * Initialize Updater binds and listeners
   */
  init(window) {
    this.mainWindow = window;
    
    // Register IPC bindings (register always to avoid IPC route errors in frontend)
    this.registerIpc();

    const { app } = require('electron');
    if (!app.isPackaged) {
      log('INFO', 'Updater disabled in development mode.');
      return;
    }

    log('INFO', 'Initializing auto-update system...');

    // 1. Configure auto-updater behaviour
    autoUpdater.autoDownload = true; // download automatically when found
    autoUpdater.autoInstallOnAppQuit = false; // control install strictly ourselves

    // Enable auto-updater logging
    autoUpdater.logger = {
      info: (m) => log('INFO', m),
      warn: (m) => log('WARN', m),
      error: (m) => log('ERROR', m)
    };

    // 2. Register auto-updater events
    autoUpdater.on('checking-for-update', () => {
      this.status = 'checking';
      this.errorMessage = null;
      this.notifyStatus();
    });

    autoUpdater.on('update-available', (info) => {
      this.status = 'available';
      this.latestVersion = info.version;
      this.notifyStatus();
      log('INFO', `Update found: ${info.version}. Starting background download...`);
      if (this.mainWindow) {
        this.mainWindow.webContents.send('update-available', info);
      }
    });

    autoUpdater.on('update-not-available', (info) => {
      this.status = 'idle';
      this.lastChecked = new Date().toISOString();
      this.notifyStatus();
      log('INFO', 'Application is up-to-date.');
    });

    autoUpdater.on('error', (err) => {
      this.status = 'error';
      this.errorMessage = err.message || String(err);
      this.notifyStatus();
      log('ERROR', `AutoUpdater error: ${this.errorMessage}`);
    });

    autoUpdater.on('download-progress', (progressObj) => {
      this.status = 'downloading';
      this.percent = Math.round(progressObj.percent || 0);
      this.bytesPerSecond = progressObj.bytesPerSecond;
      this.notifyStatus();

      if (this.mainWindow) {
        this.mainWindow.webContents.send('download-progress', progressObj);
      }
    });

    autoUpdater.on('update-downloaded', (info) => {
      this.status = 'downloaded';
      this.percent = 100;
      this.notifyStatus();
      log('INFO', `Update downloaded successfully: ${info.version}`);

      if (this.mainWindow) {
        this.mainWindow.webContents.send('update-downloaded', info);
      }
    });

    // 4. Startup Schedule: wait 12 seconds then check silently
    setTimeout(() => {
      this.checkForUpdates();
    }, 12000);

    // 5. Run recurring checks every 6 hours
    setInterval(() => {
      this.checkForUpdates();
    }, 6 * 60 * 60 * 1000);
  }

  registerKillBackendCallback(callback) {
    this.killBackendCallback = callback;
  }

  checkForUpdates() {
    const { app } = require('electron');
    if (!app.isPackaged) {
      log('INFO', 'Update check skipped (Development Mode)');
      return;
    }
    log('INFO', 'Triggering check for updates...');
    this.lastChecked = new Date().toISOString();
    autoUpdater.checkForUpdates().catch(err => {
      log('ERROR', `Failed to check for updates: ${err.message}`);
      this.status = 'error';
      this.errorMessage = err.message || String(err);
      this.notifyStatus();
    });
  }

  notifyStatus() {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('updater:status-changed', this.getStatusPayload());
    }
  }

  getStatusPayload() {
    return {
      status: this.status,
      percent: this.percent,
      bytesPerSecond: this.bytesPerSecond,
      latestVersion: this.latestVersion,
      lastChecked: this.lastChecked,
      errorMessage: this.errorMessage
    };
  }

  registerIpc() {
    // Expose status getter
    ipcMain.handle('updater:get-status', () => {
      return this.getStatusPayload();
    });

    // Expose manual check trigger
    ipcMain.handle('updater:check', () => {
      this.checkForUpdates();
      return { success: true };
    });

    // Expose safe installer response
    ipcMain.on('updater:install-response', (event, { safe, reason }) => {
      if (this.installResponseResolver) {
        this.installResponseResolver({ safe, reason });
        this.installResponseResolver = null;
      }
    });

    // Modify default install-update listener
    ipcMain.on('install-update', () => {
      this.executeSafeUpdate();
    });
  }

  async executeSafeUpdate() {
    log('INFO', 'Initiating safe update procedure...');

    // 1. Verify business safety status with renderer
    const { safe, reason } = await this.requestSafeToUpdate();
    if (!safe) {
      log('WARN', `Installation delayed: ${reason}`);
      if (this.mainWindow) {
        this.mainWindow.webContents.send('updater:postponed', { reason });
      }
      return;
    }

    log('INFO', 'Active business protection check passed. Proceeding to update installation.');

    // 2. Gracefully terminate backend to release SQLite/file hooks
    if (this.killBackendCallback) {
      try {
        this.killBackendCallback();
      } catch (err) {
        log('ERROR', `Error killing backend process: ${err.message}`);
      }
    }

    // 3. Trigger NSIS update installer
    log('INFO', 'Calling quitAndInstall...');
    setTimeout(() => {
      autoUpdater.quitAndInstall(false, true);
    }, 1500);
  }

  requestSafeToUpdate() {
    return new Promise((resolve) => {
      if (!this.mainWindow) {
        resolve({ safe: true });
        return;
      }

      this.installResponseResolver = resolve;
      this.mainWindow.webContents.send('updater:request-install');

      // Safety timeout: proceed if renderer is unresponsive for 5s
      setTimeout(() => {
        if (this.installResponseResolver) {
          log('WARN', 'Renderer safety check timeout (5s). Assuming safe and proceeding.');
          this.installResponseResolver({ safe: true });
          this.installResponseResolver = null;
        }
      }, 5000);
    });
  }
}

module.exports = new UpdateManager();
