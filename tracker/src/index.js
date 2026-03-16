require('dotenv').config();
const activeWin = require('active-win');
const fetch = require('node-fetch');

// ── Config ────────────────────────────────────────────────────
const DEFAULT_API_URL = process.env.API_URL || 'http://localhost:4000';
const DEFAULT_POLL_MS = parseInt(process.env.POLL_MS || '10000');  // Poll every 10s
const DEFAULT_FLUSH_MS = parseInt(process.env.FLUSH_MS || '60000'); // Flush every 60s
const MIN_DURATION_SECONDS = 10; // Skip tiny blips

// ── State ─────────────────────────────────────────────────────
let currentActivity = null; // { appName, windowTitle, fileName, startTime }
let activityBuffer  = [];   // Completed activities waiting to be sent
let isRunning       = true;
let currentSession  = null;
let pollInterval = null;
let flushInterval = null;
let sessionInterval = null;
let getAuthToken = () => process.env.AUTH_TOKEN || '';
let getIsPaused = () => false;
let apiUrl = DEFAULT_API_URL;
let pollMs = DEFAULT_POLL_MS;
let flushMs = DEFAULT_FLUSH_MS;
let onAuthError = () => {};

// ── Helpers ───────────────────────────────────────────────────
function extractFileName(title) {
  const patterns = [
    /^(.+?\.[a-zA-Z]{2,5})\s*[-–|]/,
    /^(.+?\.[a-zA-Z]{2,5})$/,
  ];
  for (const pattern of patterns) {
    const match = title?.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

function isSameActivity(win) {
  if (!currentActivity) return false;
  return (
    currentActivity.appName    === win.owner?.name &&
    currentActivity.windowTitle === win.title
  );
}

function getDurationSeconds(startTime) {
  return Math.round((Date.now() - startTime) / 1000);
}

// ── Update Current Session ────────────────────────────────────
async function updateSession() {
  try {
    const token = getAuthToken();
    if (!token) {
      currentSession = null;
      return;
    }

    const res = await fetch(`${apiUrl}/api/sessions/active`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      currentSession = await res.json();
    } else if (res.status === 401) {
      currentSession = null;
      onAuthError();
    } else {
      currentSession = null;
    }
  } catch (err) {
    // silently ignore and proceed as no active session
    currentSession = null;
  }
}

// ── Flush to backend ──────────────────────────────────────────
async function flushActivities() {
  if (activityBuffer.length === 0) return;

  const token = getAuthToken();
  if (!token) {
    // Keep buffer; caller should handle re-auth.
    return;
  }

  const toSend = [...activityBuffer];
  activityBuffer = [];

  try {
    const res = await fetch(`${apiUrl}/api/activities/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ activities: toSend })
    });

    if (!res.ok) {
      if (res.status === 401) onAuthError();
      const err = await res.text();
      console.error(`❌ Flush failed (${res.status}):`, err);
      activityBuffer = [...toSend, ...activityBuffer]; // Put back
    } else {
      const data = await res.json();
      console.log(`✅ Flushed ${data.inserted} activities`);
    }
  } catch (err) {
    console.error('❌ Network error during flush:', err.message);
    activityBuffer = [...toSend, ...activityBuffer];
  }
}

// ── End current activity ──────────────────────────────────────
function endCurrentActivity() {
  if (!currentActivity) return;

  const duration = getDurationSeconds(currentActivity.startTime);
  if (duration >= MIN_DURATION_SECONDS) {
    const payload = {
      source_type: 'desktop',
      app_name: currentActivity.appName,
      window_title: currentActivity.windowTitle,
      file_name: currentActivity.fileName,
      start_time: new Date(currentActivity.startTime).toISOString(),
      end_time: new Date().toISOString(),
      duration_seconds: duration
    };
    
    if (currentSession) {
      payload.client_id = currentSession.client_id;
      payload.matter = currentSession.matter;
    }

    activityBuffer.push(payload);
    console.log(`📋 Recorded: [${currentActivity.appName}] "${currentActivity.windowTitle}" (${duration}s)${currentSession ? ` [Tagged to ${currentSession.client_name}]` : ''}`);
  }
  currentActivity = null;
}

// ── Poll active window ─────────────────────────────────────────
async function poll() {
  if (!isRunning) return;
  if (getIsPaused()) return;
  if (!getAuthToken()) return;

  try {
    const win = await activeWin();
    if (!win) return;

    // Skip system/explorer windows
    const skipApps = ['Task Manager', 'Windows Security', 'Lock screen'];
    if (skipApps.some(skip => win.owner?.name?.includes(skip))) return;

    if (isSameActivity(win)) return; // Same app/title, do nothing

    // New window detected — end previous, start new
    endCurrentActivity();

    currentActivity = {
      appName: win.owner?.name || 'Unknown',
      windowTitle: win.title || 'Unknown',
      fileName: extractFileName(win.title),
      startTime: Date.now()
    };

    console.log(`👁  Tracking: [${currentActivity.appName}] "${currentActivity.windowTitle}"`);

  } catch (err) {
    if (!err.message?.includes('active-win')) {
      console.error('Poll error:', err.message);
    }
  }
}

function startTracker(options = {}) {
  apiUrl = options.apiUrl || DEFAULT_API_URL;
  pollMs = typeof options.pollMs === 'number' ? options.pollMs : DEFAULT_POLL_MS;
  flushMs = typeof options.flushMs === 'number' ? options.flushMs : DEFAULT_FLUSH_MS;
  getAuthToken = typeof options.getAuthToken === 'function' ? options.getAuthToken : getAuthToken;
  getIsPaused = typeof options.getIsPaused === 'function' ? options.getIsPaused : getIsPaused;
  onAuthError = typeof options.onAuthError === 'function' ? options.onAuthError : onAuthError;

  if (pollInterval || flushInterval || sessionInterval) return;

  isRunning = true;

  // start session cache loop (60 seconds)
  updateSession();
  sessionInterval = setInterval(updateSession, 60000);

  pollInterval = setInterval(poll, pollMs);
  flushInterval = setInterval(flushActivities, flushMs);
}

async function stopTracker() {
  isRunning = false;

  if (pollInterval) clearInterval(pollInterval);
  if (flushInterval) clearInterval(flushInterval);
  if (sessionInterval) clearInterval(sessionInterval);
  pollInterval = null;
  flushInterval = null;
  sessionInterval = null;

  endCurrentActivity();
  await flushActivities();
}

module.exports = { startTracker, stopTracker };

if (require.main === module) {
  const token = process.env.AUTH_TOKEN || '';
  if (!token) {
    console.error('❌ AUTH_TOKEN is required. Set it in .env');
    process.exit(1);
  }

  console.log('🖥  Billable Tracker - Desktop (Windows)');
  console.log(`   API: ${DEFAULT_API_URL}`);
  console.log(`   Poll: every ${DEFAULT_POLL_MS / 1000}s | Flush: every ${DEFAULT_FLUSH_MS / 1000}s`);
  console.log('   Press Ctrl+C to stop\n');

  startTracker({
    apiUrl: DEFAULT_API_URL,
    pollMs: DEFAULT_POLL_MS,
    flushMs: DEFAULT_FLUSH_MS,
    getAuthToken: () => process.env.AUTH_TOKEN || '',
    getIsPaused: () => false,
    onAuthError: () => {}
  });

  process.on('SIGINT', async () => {
    console.log('\n⏹  Stopping tracker...');
    await stopTracker();
    console.log('👋 Done.');
    process.exit(0);
  });
}
