const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const http = require('http');
const { autoUpdater } = require('electron-updater');
const os = require('os');
const crypto = require('crypto');
const updateManager = require('./services/updateManager');

// Configuration
const BACKEND_PORT = process.env.BACKEND_PORT || 5050; // Use same port as backend default
const BACKEND_HOST = process.env.BACKEND_HOST || '127.0.0.1';
const HEALTH_ENDPOINT = `http://${BACKEND_HOST}:${BACKEND_PORT}/health`;
const isDev = !app.isPackaged; // Better check for dev mode

// Setup POS_DATA_DIR early so all main process modules share the correct folder
const dataDir = isDev
  ? path.join(__dirname, '../backend/data')
  : app.getPath('userData');
process.env.POS_DATA_DIR = dataDir;

// Keep global references
let mainWindow;
let splashWindow;
let backendProcess = null;
const fs = require('fs');
const printerManager = require('./services/printerManager');

// Logger
function log(message) {
  console.log(`[Electron]: ${message}`);
}

// Get backend executable path
function getBackendPath() {
  if (isDev) {
    // In dev, run python script
    // Assumes running from project root or electron folder
    return {
      command: 'python',
      args: [path.join(__dirname, '../backend/app.py')]
    };
  } else {
    // In production, run bundled executable
    // 'backend' folder will be in resources/backend/
    // The executable is backend/backend.exe
    const backendPath = path.join(process.resourcesPath, 'backend', 'backend.exe');
    return {
      command: backendPath,
      args: []
    };
  }
}

// Run backend update script (update.py or update.exe)
function runUpdateScript() {
  const currentVersion = app.getVersion();
  const userDataPath = app.getPath('userData');
  const versionFilePath = path.join(userDataPath, '.last_migrated_version');

  // Check if this version has already run the update migrations
  if (fs.existsSync(versionFilePath)) {
    try {
      const lastMigratedVersion = fs.readFileSync(versionFilePath, 'utf8').trim();
      if (lastMigratedVersion === currentVersion) {
        log(`Backend update migration has already been executed for version ${currentVersion}. Skipping run.`);
        return;
      }
    } catch (readErr) {
      log(`Error reading migration version file: ${readErr.message}`);
    }
  }

  log(`Running backend update script for version ${currentVersion}...`);
  const dataDir = process.env.POS_DATA_DIR;

  let command = 'python';
  let args = [path.join(__dirname, '../backend/update.py')];

  if (!isDev) {
    // In production, update script is bundled inside backend directory or resources/backend/update.exe
    const prodUpdatePath = path.join(process.resourcesPath, 'backend', 'update.exe');
    if (fs.existsSync(prodUpdatePath)) {
      command = prodUpdatePath;
      args = [];
    } else {
      // Fallback if update is built inside backend.exe
      const backendExeDir = path.dirname(path.join(process.resourcesPath, 'backend', 'backend.exe'));
      const fallbackPath = path.join(backendExeDir, 'update.exe');
      if (fs.existsSync(fallbackPath)) {
        command = fallbackPath;
        args = [];
      } else {
        log('WARNING: production update.exe not found. Skipping auto-migration.');
        return;
      }
    }
  }

  try {
    const result = spawnSync(command, args, {
      cwd: isDev ? path.join(__dirname, '..') : path.dirname(command),
      env: { ...process.env, POS_DATA_DIR: dataDir },
      timeout: 30000 // 30 second limit
    });
    
    if (result.error) {
      log(`[UpdateScript Error]: ${result.error.message}`);
    } else {
      log(`[UpdateScript Output]: ${result.stdout ? result.stdout.toString() : ''}`);
      if (result.status === 0) {
        // Migration completed successfully, write version file to skip subsequent runs
        try {
          fs.writeFileSync(versionFilePath, currentVersion, 'utf8');
          log(`Successfully marked version ${currentVersion} as migrated.`);
        } catch (writeErr) {
          log(`Failed to write migration version file: ${writeErr.message}`);
        }
      } else {
        log(`[UpdateScript Warning]: script exited with non-zero code ${result.status}`);
      }
    }
  } catch (err) {
    log(`[UpdateScript Error]: failed to execute: ${err.message}`);
  }
}

// Start backend
function startBackend() {
  // Execute updates and migrations first
  runUpdateScript();

  log('Starting backend...');

  const { command, args } = getBackendPath();
  const dataDir = process.env.POS_DATA_DIR;

  // Pass data directory to backend
  const backendArgs = [...args, '--data-dir', dataDir, '--port', BACKEND_PORT.toString()];

  log(`Spawning: ${command} ${backendArgs.join(' ')}`);

  backendProcess = spawn(command, backendArgs, {
    cwd: isDev ? path.join(__dirname, '..') : path.dirname(command),
    stdio: 'pipe', // Change to 'inherit' for debugging in console, 'pipe' to capture
    env: { ...process.env }
  });

  backendProcess.stdout.on('data', (data) => {
    log(`[Backend]: ${data}`);
  });

  backendProcess.stderr.on('data', (data) => {
    console.error(`[Backend Error]: ${data}`);
  });

  backendProcess.on('close', (code) => {
    log(`Backend process exited with code ${code}`);
    backendProcess = null;
    // Optional: Quit app if backend crashes?
    // app.quit();
  });
}

// Check if backend is ready
function waitForBackend(callback) {
  log('Waiting for backend...');
  let attempts = 0;
  const maxAttempts = 20; // 20 seconds maximum timeout

  const checkHealth = () => {
    attempts++;
    if (attempts > maxAttempts) {
      log('Backend connection timeout: failed to start after 20 attempts.');
      dialog.showErrorBox(
        'Backend Connection Error',
        'InfoOS Local POS Backend failed to respond.\n\nThe system could not connect to the database or start the server process. Please check the logs in your user directory.'
      );
      app.quit();
      return;
    }

    http.get(HEALTH_ENDPOINT, (res) => {
      if (res.statusCode === 200) {
        log('Backend is ready!');
        callback();
      } else {
        log(`Backend returned status ${res.statusCode}, retrying...`);
        setTimeout(checkHealth, 1000);
      }
    }).on('error', (err) => {
      log(`Backend not ready yet (${err.message}), retrying...`);
      setTimeout(checkHealth, 1000);
    });
  };

  checkHealth();
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 440,
    height: 340,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Read saved theme
  let theme = 'dark';
  try {
    const { nativeTheme } = require('electron');
    const themeFilePath = path.join(app.getPath('userData'), 'theme.json');
    if (fs.existsSync(themeFilePath)) {
      const data = JSON.parse(fs.readFileSync(themeFilePath, 'utf8'));
      if (data && (data.theme === 'light' || data.theme === 'dark')) {
        theme = data.theme;
      }
    } else {
      theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    }
  } catch (err) {
    console.error('[main] Error reading theme file:', err.message);
  }

  const appVersion = app.getVersion();
  splashWindow.loadFile(path.join(__dirname, 'splash.html'), {
    query: {
      theme: theme,
      version: appVersion
    }
  });
  
  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    icon: path.join(__dirname, 'assets/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false, // Don't show until ready
    titleBarStyle: 'default'
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:3050');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../frontend/build/index.html'));
  }

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    // Restore saved zoom factor natively (matches the CSS --display-zoom value
    // the renderer will also set via restoreDisplayPrefs).  By applying it here
    // before the window is shown we avoid a visible layout shift.
    mainWindow.webContents
      .executeJavaScript(`localStorage.getItem('display_zoom')`)
      .then((saved) => {
        const factor = parseFloat(saved);
        if (factor && factor > 0) {
          mainWindow.webContents.setZoomFactor(factor);
        }
      })
      .catch(() => { /* ignore – first launch has no saved value */ });

    if (splashWindow) {
      splashWindow.close();
    }
    mainWindow.maximize();
    mainWindow.show();
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });



  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Disable system menu bar (File, View, Window)
  Menu.setApplicationMenu(null);
}

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// App lifecycle
app.whenReady().then(() => {
  createSplashWindow();
  startBackend();
  waitForBackend(() => {
    createWindow();
    
    // Setup printer handlers
    printerManager.setupHandlers();

    // Initialize Auto-Updater module
    updateManager.init(mainWindow);
    updateManager.registerKillBackendCallback(() => {
      if (backendProcess) {
        log('Killing backend process before update installation...');
        try {
          backendProcess.kill('SIGKILL');
        } catch (e) {
          log('Error killing backend: ' + e);
        }
        backendProcess = null;
      }
    });
  });
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Kill backend on exit
app.on('will-quit', () => {
  if (backendProcess) {
    log('Killing backend process...');
    backendProcess.kill();
    backendProcess = null;
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
    shell.openExternal(navigationUrl);
  });
  
  // Set Content-Security-Policy
  contents.session.webRequest.onHeadersReceived((details, callback) => {
    // Get Supabase URL from environment variable for dynamic CSP
    const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://pldolwabxypmttsqxeef.supabase.co';
    const supabaseHost = new URL(supabaseUrl).hostname;

    // Get Cloud Backend URL from environment variable for dynamic CSP
    // Only include in CSP if it's configured (not using placeholder)
    const cloudApiUrl = process.env.REACT_APP_CLOUD_API_URL;
    let connectSrc = `'self' http://localhost:* http://127.0.0.1:* https://${supabaseHost} wss://${supabaseHost}`;
    if (cloudApiUrl && !cloudApiUrl.includes('your-cloud-backend.onrender.com')) {
      const cloudApiHost = new URL(cloudApiUrl).hostname;
      connectSrc += ` https://${cloudApiHost}`;
    }

    // Dynamic backend host for CSP
    const backendHost = BACKEND_HOST === '127.0.0.1' ? '127.0.0.1' : BACKEND_HOST;
    const backendSrc = `http://${backendHost}:* http://127.0.0.1:*`;

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self' blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: ${backendSrc} https: *; media-src 'self' ${backendSrc}; connect-src ${connectSrc} ${backendSrc};`
        ]
      }
    });
  });
});

// IPC handlers
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-platform', () => process.platform);
ipcMain.handle('is-production', () => !isDev);

// Licensing Device Fingerprinting & OS-Level Encryption
ipcMain.handle('license:getFingerprint', () => {
  let rawId = '';
  try {
    if (process.platform === 'win32') {
      const output = spawnSync('REG', ['QUERY', 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid']).stdout.toString();
      const match = output.match(/MachineGuid\s+REG_SZ\s+(\S+)/i);
      if (match && match[1]) {
        rawId += match[1];
      }
      
      // Attempt to add baseboard serial number
      try {
        const motherboard = spawnSync('wmic', ['baseboard', 'get', 'serialnumber']).stdout.toString().replace('SerialNumber', '').trim();
        if (motherboard && motherboard !== 'To be filled by O.E.M.') {
          rawId += '-' + motherboard;
        }
      } catch (err) {
        // Ignore motherboard uuid fallback error
      }
    } else if (process.platform === 'darwin') {
      const output = spawnSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice']).stdout.toString();
      const match = output.match(/"IOPlatformUUID"\s+=\s+"([^"]+)"/i);
      if (match && match[1]) {
        rawId += match[1];
      }
    } else {
      if (fs.existsSync('/etc/machine-id')) {
        rawId += fs.readFileSync('/etc/machine-id', 'utf8').trim();
      } else if (fs.existsSync('/var/lib/dbus/machine-id')) {
        rawId += fs.readFileSync('/var/lib/dbus/machine-id', 'utf8').trim();
      }
    }
  } catch (err) {
    console.error('[main] Failed to query native hardware identifiers:', err.message);
  }

  if (!rawId) {
    rawId = os.hostname() || 'fallback-device-id';
  }

  const fingerprint = crypto.createHash('sha256').update(rawId).digest('hex');
  const deviceName = os.hostname() || 'Desktop-Device';
  const operatingSystem = process.platform === 'win32' ? 'Windows 11 Pro' : (process.platform === 'darwin' ? 'macOS' : 'Linux');
  return { fingerprint, deviceName, operatingSystem };
});

ipcMain.handle('secure:encrypt', (event, plainText) => {
  try {
    const { safeStorage } = require('electron');
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      const encryptedBuffer = safeStorage.encryptString(plainText);
      return encryptedBuffer.toString('base64');
    }
  } catch (err) {
    console.error('[main] secure:encrypt error:', err.message);
  }
  // Fallback to base64 encoding if encryption is not available
  return Buffer.from(plainText, 'utf8').toString('base64');
});

ipcMain.handle('secure:decrypt', (event, base64Text) => {
  try {
    const { safeStorage } = require('electron');
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      const buffer = Buffer.from(base64Text, 'base64');
      return safeStorage.decryptString(buffer);
    }
  } catch (err) {
    console.error('[main] secure:decrypt error:', err.message);
  }
  // Fallback to base64 decoding if encryption is not available
  return Buffer.from(base64Text, 'base64').toString('utf8');
});



// Logging IPC — renderer → main → app.log (same file as Python backend)
ipcMain.handle('write-log', (event, payload) => {
  // payload can be a string (legacy) or an object { level, source, message, ...extra }
  let level   = 'INFO';
  let source  = 'renderer';
  let message = '';

  if (typeof payload === 'string') {
    message = payload;
  } else if (payload && typeof payload === 'object') {
    level   = (payload.level  || 'info').toUpperCase();
    source  = payload.source  || 'renderer';
    message = payload.message || JSON.stringify(payload);
  }

  // Resolve log directory — same DATA_DIR the backend uses
  const dataDir = process.env.POS_DATA_DIR;

  const logDir  = path.join(dataDir, 'logs');
  const logFile = path.join(logDir, 'app.log');

  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const ts   = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const loc  = `electron:${source}`;
    const line = `${ts} | ${level.padEnd(8)} | ${loc.padEnd(32)} | [FRONTEND] ${message}  [rid=-]\n`;

    fs.appendFileSync(logFile, line, 'utf8');
  } catch (err) {
    // Logging must never crash the renderer
    console.error('[main] writeLog error:', err.message);
  }
});

// Native Zoom Factor handler
ipcMain.on('set-zoom-factor', (event, factor) => {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.setZoomFactor(factor);
    }
  } catch (err) {
    console.error('[main] set-zoom-factor error:', err.message);
  }
});

// File Save IPC — renderer → main (shows OS Save Dialog and writes file)
ipcMain.handle('file:save', async (event, filename, base64Data) => {
  try {
    const parentWindow = (mainWindow && !mainWindow.isDestroyed()) ? mainWindow : null;
    const { filePath } = await dialog.showSaveDialog(parentWindow, {
      defaultPath: filename,
      title: 'Save Report',
      buttonLabel: 'Save',
      filters: [
        { name: 'Excel Files', extensions: ['xlsx'] },
        { name: 'CSV Files', extensions: ['csv'] },
        { name: 'XML Files', extensions: ['xml'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (filePath) {
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(filePath, buffer);
      return { success: true };
    }
    return { success: false, cancelled: true };
  } catch (err) {
    console.error('[main] file:save error:', err.message);
    return { success: false, error: err.message };
  }
});

// Theme Persistence IPC
ipcMain.handle('theme-changed', (event, theme) => {
  try {
    const themeFilePath = path.join(app.getPath('userData'), 'theme.json');
    fs.writeFileSync(themeFilePath, JSON.stringify({ theme }), 'utf8');
  } catch (err) {
    console.error('[main] Failed to save theme preference:', err.message);
  }
  return true;
});

// Auto-start on boot configuration
ipcMain.handle('autostart:get', () => {
  try {
    const settings = app.getLoginItemSettings();
    return settings.openAtLogin;
  } catch (err) {
    console.error('[main] Failed to read login item settings:', err.message);
    return false;
  }
});

ipcMain.handle('autostart:set', (event, openAtLogin) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: openAtLogin,
      path: app.getPath('exe'),
      args: ['--hidden']
    });
    log(`Auto-start preference updated: ${openAtLogin}`);
    return true;
  } catch (err) {
    console.error('[main] Failed to update login item settings:', err.message);
    return false;
  }
});

