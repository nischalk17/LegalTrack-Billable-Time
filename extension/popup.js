const API_URL = 'http://localhost:4000';

document.addEventListener('DOMContentLoaded', () => {
  const currentTitle = document.getElementById('currentTitle');
  const currentDomain = document.getElementById('currentDomain');
  const bufferedCount = document.getElementById('bufferedCount');
  const tokenInput = document.getElementById('tokenInput');
  const savedBadge = document.getElementById('savedBadge');
  
  // Active Matter elements
  const activeSessionBlock = document.getElementById('activeSessionBlock');
  const noSessionBlock = document.getElementById('noSessionBlock');
  const amClientName = document.getElementById('amClientName');
  const amMatterText = document.getElementById('amMatterText');
  const startSessionBtn = document.getElementById('startSessionBtn');
  const startSessionForm = document.getElementById('startSessionForm');
  const amClientSelect = document.getElementById('amClientSelect');
  const confirmStartSessionBtn = document.getElementById('confirmStartSessionBtn');
  const amChangeBtn = document.getElementById('amChangeBtn');
  const amEndBtn = document.getElementById('amEndBtn');
  const noSessionMsg = document.getElementById('noSessionMsg');

  let savedToken = null;

  function setSessionUI(session) {
    if (session) {
      activeSessionBlock.style.display = 'block';
      noSessionBlock.style.display = 'none';
      amClientName.textContent = session.client_name;
      amMatterText.textContent = session.matter || '';
    } else {
      activeSessionBlock.style.display = 'none';
      noSessionBlock.style.display = 'block';
      startSessionBtn.style.display = 'block';
      startSessionForm.style.display = 'none';
    }
  }

  // Load saved token
  chrome.storage.local.get(['auth_token'], (r) => {
    savedToken = r.auth_token;
    if (savedToken) {
      tokenInput.value = savedToken.substring(0, 20) + '...';
      fetchSessionData();
    } else {
      noSessionMsg.textContent = "Please save your auth token first";
      startSessionBtn.disabled = true;
      startSessionBtn.style.opacity = '0.5';
    }
  });

  function fetchSessionData() {
    chrome.runtime.sendMessage({ type: 'GET_SESSION' }, (res) => {
      setSessionUI(res?.activeSession);
    });
  }

  // Fetch clients to populate select
  async function loadClients() {
    if (!savedToken) return;
    try {
      const res = await fetch(`${API_URL}/api/clients`, { headers: { 'Authorization': `Bearer ${savedToken}` }});
      if (!res.ok) return;
      const clients = await res.json();
      amClientSelect.innerHTML = '<option value="">Select Client...</option>';
      clients.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        amClientSelect.appendChild(opt);
      });
    } catch(e) { }
  }

  startSessionBtn.addEventListener('click', () => {
    startSessionBtn.style.display = 'none';
    startSessionForm.style.display = 'block';
    loadClients();
  });

  amChangeBtn.addEventListener('click', () => {
    activeSessionBlock.style.display = 'none';
    noSessionBlock.style.display = 'block';
    startSessionBtn.style.display = 'none';
    startSessionForm.style.display = 'block';
    loadClients();
  });

  confirmStartSessionBtn.addEventListener('click', async () => {
    const cid = amClientSelect.value;
    const matter = document.getElementById('amMatterInput').value;
    if (!cid) return;
    
    confirmStartSessionBtn.textContent = '...';
    try {
      const res = await fetch(`${API_URL}/api/sessions/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${savedToken}`
        },
        body: JSON.stringify({ client_id: cid, matter })
      });
      if (res.ok) {
        chrome.runtime.sendMessage({ type: 'GET_SESSION' }, (data) => {
          setSessionUI(data?.activeSession);
        });
      }
    } catch(e) {}
    confirmStartSessionBtn.textContent = 'Start Session';
  });

  amEndBtn.addEventListener('click', async () => {
    amEndBtn.textContent = '...';
    try {
      const res = await fetch(`${API_URL}/api/sessions/end`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${savedToken}` }
      });
      if (res.ok) {
        chrome.runtime.sendMessage({ type: 'GET_SESSION' }, () => {
          setSessionUI(null);
        });
      }
    } catch(e) {}
    amEndBtn.textContent = 'End Session';
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
      savedToken = token;
      startSessionBtn.disabled = false;
      startSessionBtn.style.opacity = '1';
      noSessionMsg.textContent = "No active matter";
      fetchSessionData();
    });
  });

  // Force flush
  document.getElementById('flushBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'FORCE_FLUSH' }, () => {
      bufferedCount.textContent = '0';
    });
  });
});
