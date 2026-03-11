document.addEventListener('DOMContentLoaded', () => {
  const currentTitle = document.getElementById('currentTitle');
  const currentDomain = document.getElementById('currentDomain');
  const bufferedCount = document.getElementById('bufferedCount');
  const tokenInput = document.getElementById('tokenInput');
  const savedBadge = document.getElementById('savedBadge');

  // Load saved token
  chrome.storage.local.get(['auth_token'], (r) => {
    if (r.auth_token) {
      tokenInput.value = r.auth_token.substring(0, 20) + '...';
    }
  });

  // Get status from background
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
    if (res?.currentSession) {
      currentTitle.textContent = res.currentSession.title;
      currentDomain.textContent = res.currentSession.domain || '';
    } else {
      currentTitle.textContent = 'No active tab';
    }
    bufferedCount.textContent = res?.bufferedCount || 0;
  });

  // Save token
  document.getElementById('saveTokenBtn').addEventListener('click', () => {
    const token = tokenInput.value.trim();
    if (!token || token.endsWith('...')) return;
    chrome.runtime.sendMessage({ type: 'SET_TOKEN', token }, () => {
      savedBadge.style.display = 'block';
      setTimeout(() => savedBadge.style.display = 'none', 2000);
    });
  });

  // Force flush
  document.getElementById('flushBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'FORCE_FLUSH' }, () => {
      bufferedCount.textContent = '0';
    });
  });
});
