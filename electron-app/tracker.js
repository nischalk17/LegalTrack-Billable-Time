const activeWin = require('active-win');
const fetch = require('node-fetch');
const store = require('./store');

const API_URL = 'https://api.legaltrack.com';
const POLL_MS = 10_000;
const FLUSH_MS = 60_000;
const MIN_DURATION_SECONDS = 10;

let currentActivity = null; // { appName, windowTitle, fileName, startTime }
let activityBuffer = [];
let isRunning = false;
let pollInterval = null;
let flushInterval = null;
let sessionInterval = null;
let currentSession = null;
let onAuthError = () => {};

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
    currentActivity.appName === win.owner?.name &&
    currentActivity.windowTitle === win.title
  );
}

function getDurationSeconds(startTime) {
  return Math.round((Date.now() - startTime) / 1000);
}

function getAuthHeaders() {
  const token = store.get('auth_token') || '';
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

async function updateSession() {
  try {
    const headers = getAuthHeaders();
    if (!headers) {
      currentSession = null;
      return;
    }
    const res = await fetch(`${API_URL}/api/sessions/active`, { headers });
    if (res.ok) {
      currentSession = await res.json();
    } else if (res.status === 401) {
      currentSession = null;
      onAuthError();
    } else {
      currentSession = null;
    }
  } catch {
    currentSession = null;
  }
}

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
  }

  currentActivity = null;
}

async function flushActivities() {
  if (activityBuffer.length === 0) return;
  const headers = getAuthHeaders();
  if (!headers) return;

  const toSend = [...activityBuffer];
  activityBuffer = [];

  try {
    const res = await fetch(`${API_URL}/api/activities/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify({ activities: toSend })
    });

    if (!res.ok) {
      if (res.status === 401) onAuthError();
      activityBuffer = [...toSend, ...activityBuffer];
      return;
    }
    // Consume response to avoid socket hangups; ignore content.
    try { await res.json(); } catch {}
  } catch {
    activityBuffer = [...toSend, ...activityBuffer];
  }
}

async function poll() {
  if (!isRunning) return;
  if (store.get('is_paused')) return;
  if (!store.get('auth_token')) return;

  try {
    const win = await activeWin();
    if (!win) return;

    const skipApps = ['Task Manager', 'Windows Security', 'Lock screen'];
    if (skipApps.some(skip => win.owner?.name?.includes(skip))) return;

    if (isSameActivity(win)) return;

    endCurrentActivity();
    currentActivity = {
      appName: win.owner?.name || 'Unknown',
      windowTitle: win.title || 'Unknown',
      fileName: extractFileName(win.title),
      startTime: Date.now()
    };
  } catch {
    // ignore
  }
}

function startTracker(opts = {}) {
  if (pollInterval || flushInterval || sessionInterval) return;
  onAuthError = typeof opts.onAuthError === 'function' ? opts.onAuthError : onAuthError;

  isRunning = true;

  updateSession();
  sessionInterval = setInterval(updateSession, 60_000);
  pollInterval = setInterval(poll, POLL_MS);
  flushInterval = setInterval(flushActivities, FLUSH_MS);
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

