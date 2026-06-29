const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const http = require('http');
const { autoUpdater } = require('electron-updater');
const os = require('os');
const crypto = require('crypto');
const updateManager = require('./services/updateManager');

// Configuration
// Configuration
const BACKEND_PORT = 5050; // Use same port as backend default
const HEALTH_ENDPOINT = `http://127.0.0.1:${BACKEND_PORT}/health`;
const isDev = !app.isPackaged; // Better check for dev mode

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

// Start backend
function startBackend() {
  log('Starting backend...');

  const { command, args } = getBackendPath();

  // In Dev: Use local backend/data to keep existing data
  // In Prod: Use AppData to ensure write permissions
  const dataDir = isDev
    ? path.join(__dirname, '../backend/data')
    : app.getPath('userData');

  // Pass data directory to backend
  const backendArgs = [...args, '--data-dir', dataDir, '--port', BACKEND_PORT.toString()];

  log(`Spawning: ${command} ${backendArgs.join(' ')}`);

  backendProcess = spawn(command, backendArgs, {
    cwd: isDev ? path.join(__dirname, '..') : path.dirname(command),
    stdio: 'pipe', // Change to 'inherit' for debugging in console, 'pipe' to capture
    env: { ...process.env, POS_DATA_DIR: dataDir }
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
    width: 400,
    height: 300,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  
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
    if (splashWindow) {
      splashWindow.close();
    }
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

  // Build menu
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'New Bill', accelerator: 'CmdOrCtrl+N', click: () => mainWindow.webContents.send('menu-new-bill') },
        { type: 'separator' },
        { label: 'Exit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
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
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: http://localhost:* http://127.0.0.1:* https://fonts.googleapis.com https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com; font-src 'self' data: https://fonts.googleapis.com https://fonts.gstatic.com;"
        ]
      }
    });
  });
});

// IPC handlers
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-platform', () => process.platform);

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
  return { fingerprint, deviceName };
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
  const dataDir = process.env.POS_DATA_DIR ||
    (isDev
      ? path.join(__dirname, '../backend/data')
      : path.join(app.getPath('userData'), 'data'));

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

