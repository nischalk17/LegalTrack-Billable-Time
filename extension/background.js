// ============================================================
// Billable Tracker - Chrome Extension Background Service Worker
// Tracks active tab, computes duration, sends to backend
// ============================================================

const API_URL = 'http://localhost:4000'; // Change for production
const FLUSH_INTERVAL_MINUTES = 1; // Send batch every 1 minute

let currentSession = null;   // { tabId, title, domain, url, startTime }
let activityBuffer = [];     // Pending activities to send

// ── Helpers ──────────────────────────────────────────────────
function extractDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return null;
  }
}

function getDurationSeconds(startTime) {
  return Math.round((Date.now() - startTime) / 1000);
}

// ── Flush buffer to backend ───────────────────────────────────
async function flushActivities() {
  if (activityBuffer.length === 0) return;

  const token = await getToken();
  if (!token) {
    console.log('No auth token - skipping flush');
    return;
  }

  const toSend = [...activityBuffer];
  activityBuffer = [];

  try {
    const response = await fetch(`${API_URL}/api/activities/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ activities: toSend })
    });

    if (!response.ok) {
      console.error('Failed to send activities:', response.status);
      // Put them back in buffer on failure
      activityBuffer = [...toSend, ...activityBuffer];
    } else {
      console.log(`✅ Sent ${toSend.length} activities`);
    }
  } catch (err) {
    console.error('Network error sending activities:', err);
    activityBuffer = [...toSend, ...activityBuffer];
  }
}

// ── End current session ───────────────────────────────────────
function endCurrentSession() {
  if (!currentSession) return;

  const duration = getDurationSeconds(currentSession.startTime);
  if (duration < 5) { // Skip sessions under 5 seconds
    currentSession = null;
    return;
  }

  const endTime = new Date().toISOString();
  activityBuffer.push({
    source_type: 'browser',
    app_name: 'Chrome',
    window_title: currentSession.title,
    domain: currentSession.domain,
    url: currentSession.url,
    start_time: new Date(currentSession.startTime).toISOString(),
    end_time: endTime,
    duration_seconds: duration
  });

  currentSession = null;
}

// ── Start new session ─────────────────────────────────────────
function startSession(tab) {
  if (!tab || !tab.url || tab.url.startsWith('chrome://')) return;

  endCurrentSession();

  currentSession = {
    tabId: tab.id,
    title: tab.title || 'Unknown',
    domain: extractDomain(tab.url),
    url: tab.url,
    startTime: Date.now()
  };
}

// ── Auth helpers ──────────────────────────────────────────────
async function getToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['auth_token'], (result) => {
      resolve(result.auth_token || null);
    });
  });
}

// ── Event Listeners ───────────────────────────────────────────

// Tab activated (user switches tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    startSession(tab);
  } catch (err) {
    console.error('Tab activate error:', err);
  }
});

// Tab updated (navigation / page load)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    startSession(tab);
  }
});

// Window focus changed
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Browser lost focus
    endCurrentSession();
    await flushActivities();
    return;
  }
  try {
    const tabs = await chrome.tabs.query({ active: true, windowId });
    if (tabs.length > 0) startSession(tabs[0]);
  } catch (err) {
    console.error('Window focus error:', err);
  }
});

// Tab closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (currentSession?.tabId === tabId) {
    endCurrentSession();
  }
});

// ── Periodic flush via alarms ─────────────────────────────────
chrome.alarms.create('flush_activities', { periodInMinutes: FLUSH_INTERVAL_MINUTES });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'flush_activities') {
    // End and restart current session to record partial time
    if (currentSession) {
      const duration = getDurationSeconds(currentSession.startTime);
      if (duration >= 5) {
        const endTime = new Date().toISOString();
        activityBuffer.push({
          source_type: 'browser',
          app_name: 'Chrome',
          window_title: currentSession.title,
          domain: currentSession.domain,
          url: currentSession.url,
          start_time: new Date(currentSession.startTime).toISOString(),
          end_time: endTime,
          duration_seconds: duration
        });
        // Restart session from now
        currentSession.startTime = Date.now();
      }
    }
    await flushActivities();
  }
});

// ── Message listener (from popup) ────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_STATUS') {
    sendResponse({
      isTracking: !!currentSession,
      currentSession: currentSession ? {
        title: currentSession.title,
        domain: currentSession.domain,
        duration: getDurationSeconds(currentSession.startTime)
      } : null,
      bufferedCount: activityBuffer.length
    });
  }

  if (message.type === 'FORCE_FLUSH') {
    endCurrentSession();
    flushActivities().then(() => sendResponse({ success: true }));
    return true; // async response
  }

  if (message.type === 'SET_TOKEN') {
    chrome.storage.local.set({ auth_token: message.token }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

console.log('🔍 Billable Tracker extension started');
