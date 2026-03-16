const path = require('path');
const { app, BrowserWindow, Tray, Menu, shell, dialog } = require('electron');
const { ipcMain } = require('electron');
const { exec } = require('child_process');
const http = require('http');
const fs = require('fs');

const store = require('./store');
const { startTracker, stopTracker } = require('./tracker');

const APP_VERSION = '1.0.0';
const DASHBOARD_URL = 'https://app.legaltrack.com';

let tray = null;
let loginWindow = null;
let tokenServer = null;
let menuRefreshInterval = null;
let isQuitting = false;

function isAuthed() {
  const t = store.get('auth_token');
  return typeof t === 'string' && t.length > 0;
}

function getTrayIconPath() {
  const paused = !!store.get('is_paused');
  return paused
    ? path.join(__dirname, 'assets', 'icon-paused.png')
    : path.join(__dirname, 'assets', 'icon.png');
}

function buildTrackingLabel() {
  const userName = store.get('user_name') || 'User';
  const activeMatter = store.get('active_matter_label') || 'No active matter';
  return `● Tracking: ${userName}  (${activeMatter})`;
}

function rebuildTrayMenu() {
  if (!tray) return;

  const paused = !!store.get('is_paused');
  try {
    tray.setImage(getTrayIconPath());
  } catch {
    // ignore
  }

  const template = [
    { label: `LegalTrack v${APP_VERSION}`, enabled: false },
    { type: 'separator' },
    { label: buildTrackingLabel(), enabled: false },
    { type: 'separator' },
    {
      label: 'Open Dashboard',
      click: () => openDashboard()
    },
    { type: 'separator' },
    {
      label: paused ? 'Resume Tracking' : 'Pause Tracking',
      click: async () => {
        const next = !store.get('is_paused');
        store.set('is_paused', next);
        rebuildTrayMenu();
      }
    },
    {
      label: 'Sign Out',
      click: async () => {
        await signOut();
      }
    },
    {
      label: 'Quit',
      click: async () => {
        await gracefulQuit();
      }
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  tray.setToolTip(paused ? 'LegalTrack — Paused' : 'LegalTrack — Tracking active');
  tray.setContextMenu(menu);
}

function setupTray() {
  if (tray) return;

  tray = new Tray(getTrayIconPath());
  rebuildTrayMenu();

  // Rebuild every 30 seconds to refresh active matter label.
  menuRefreshInterval = setInterval(rebuildTrayMenu, 30_000);
}

function createLoginWindow() {
  if (loginWindow) {
    loginWindow.show();
    return;
  }

  loginWindow = new BrowserWindow({
    width: 380,
    height: 480,
    resizable: false,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#0d1117'
  });

  loginWindow.loadFile(path.join(__dirname, 'login.html'));

  loginWindow.on('closed', () => {
    loginWindow = null;
  });
}

function closeLoginWindow() {
  if (!loginWindow) return;
  loginWindow.close();
  loginWindow = null;
}

async function showFirstRunDialogIfNeeded() {
  if (store.get('has_run_before')) return;

  await dialog.showMessageBox({
    type: 'info',
    title: 'LegalTrack',
    message: '✅ LegalTrack is now running',
    detail:
      'Your billing time is being tracked automatically.\n' +
      'LegalTrack runs quietly in your system tray.\n\n' +
      'Look for the ⚖️ icon near your clock.\n' +
      'Right-click it anytime to open your dashboard.',
    buttons: ['Got it'],
    defaultId: 0
  });

  store.set('has_run_before', true);
}

function startTokenServer() {
  if (tokenServer) return;

  tokenServer = http.createServer((req, res) => {
    if (req.url === '/token') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ token: store.get('auth_token') || '' }));
      return;
    }
    res.statusCode = 404;
    res.end('Not found');
  });

  tokenServer.listen(27832, '127.0.0.1');
}

function stopTokenServer() {
  if (!tokenServer) return;
  try { tokenServer.close(); } catch {}
  tokenServer = null;
}

function findBrowserPath() {
  const chromePaths = [
    'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
    'C:\\\\Program Files (x86)\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
    (process.env.LOCALAPPDATA || '') + '\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
  ];

  const edgePaths = [
    'C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe',
    'C:\\\\Program Files\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe',
  ];

  const allPaths = [...chromePaths, ...edgePaths].filter(Boolean);
  for (const p of allPaths) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

function openDashboard() {
  const browserPath = findBrowserPath();
  if (!browserPath) {
    shell.openExternal(DASHBOARD_URL);
    return;
  }

  const extPath = path.join(process.resourcesPath, 'extension');
  const cmd = `"${browserPath}" --load-extension="${extPath}" "${DASHBOARD_URL}"`;
  exec(cmd);
}

async function refreshActiveMatterLabel() {
  // We keep this logic tiny and resilient. The tray refresh interval calls rebuildTrayMenu,
  // which reads store.get('active_matter_label').
  const token = store.get('auth_token') || '';
  if (!token) {
    store.set('active_matter_label', 'No active matter');
    return;
  }

  try {
    const fetch = require('node-fetch');
    const res = await fetch('https://api.legaltrack.com/api/sessions/active', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const s = await res.json();
      if (s && s.client_name) {
        const label = s.matter ? `${s.client_name} — ${s.matter}` : `${s.client_name}`;
        store.set('active_matter_label', label);
      } else {
        store.set('active_matter_label', 'No active matter');
      }
      return;
    }
    if (res.status === 401) {
      await signOut();
      return;
    }
    store.set('active_matter_label', 'No active matter');
  } catch {
    store.set('active_matter_label', store.get('active_matter_label') || 'No active matter');
  }
}

function startBackgroundJobs() {
  startTokenServer();
  setupTray();
  startTracker({
    onAuthError: async () => {
      await signOut();
    }
  });

  refreshActiveMatterLabel();
  setInterval(refreshActiveMatterLabel, 30_000);
}

async function signOut() {
  try { await stopTracker(); } catch {}
  store.set('auth_token', '');
  store.set('user_email', '');
  store.set('user_name', '');
  store.set('active_matter_label', 'No active matter');
  store.set('is_paused', false);

  if (tray) {
    tray.destroy();
    tray = null;
  }
  if (menuRefreshInterval) {
    clearInterval(menuRefreshInterval);
    menuRefreshInterval = null;
  }

  createLoginWindow();
}

async function gracefulQuit() {
  try { await stopTracker(); } catch {}
  stopTokenServer();
  app.quit();
}

function initAutoLaunch() {
  app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
}

async function initApp() {
  initAutoLaunch();

  if (!isAuthed()) {
    createLoginWindow();
    return;
  }

  // Silent startup: no windows.
  startBackgroundJobs();
}

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Focus the tray context menu by rebuilding it; avoid opening windows.
    rebuildTrayMenu();
  });
}

ipcMain.handle('do-login', async (_event, { email, password }) => {
  try {
    const fetch = require('node-fetch');
    const res = await fetch('https://api.legaltrack.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = (data && (data.error || data.message)) ? (data.error || data.message) : 'Invalid credentials';
      if (loginWindow) loginWindow.webContents.send('login-error', message);
      return { ok: false, error: message };
    }

    if (!data || !data.token) {
      const message = 'Login failed';
      if (loginWindow) loginWindow.webContents.send('login-error', message);
      return { ok: false, error: message };
    }

    store.set('auth_token', data.token);
    store.set('user_email', data.user?.email || email);
    store.set('user_name', data.user?.name || '');
    store.set('is_paused', false);

    closeLoginWindow();
    startBackgroundJobs();
    await showFirstRunDialogIfNeeded();

    return { ok: true };
  } catch (err) {
    const message = 'Unable to connect securely';
    if (loginWindow) loginWindow.webContents.send('login-error', message);
    return { ok: false, error: message };
  }
});

app.on('ready', async () => {
  await initApp();
});

app.on('before-quit', async (e) => {
  // Ensure final flush.
  if (isQuitting) return;
  isQuitting = true;
  e.preventDefault();
  try {
    await stopTracker();
  } catch {}
  stopTokenServer();
  app.quit();
});

// Keep app running in tray (Windows).
app.on('window-all-closed', () => {
  // no-op
});

