// FocusTogether Browser Extension - Popup Script

document.addEventListener('DOMContentLoaded', async () => {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const notConnectedSection = document.getElementById('notConnected');
  const connectedSection = document.getElementById('connected');
  const userIdInput = document.getElementById('userIdInput');
  const connectBtn = document.getElementById('connectBtn');
  const disconnectBtn = document.getElementById('disconnectBtn');
  const nativeConnectBtn = document.getElementById('nativeConnectBtn');
  const nativeConnectHint = document.getElementById('nativeConnectHint');
  const autoSyncHint = document.getElementById('autoSyncHint');
  const statIdle = document.getElementById('statIdle');
  const statDistraction = document.getElementById('statDistraction');
  
  function loadFocusStats() {
    if (!statIdle || !statDistraction) return;
    chrome.runtime.sendMessage({ type: 'GET_FOCUS_STATS' }, (response) => {
      if (chrome.runtime.lastError || !response || !response.ok) {
        statIdle.textContent = '—';
        statDistraction.textContent = '—';
        return;
      }
      statIdle.textContent = String(response.idleWarningCount);
      statDistraction.textContent = String(response.distractionCount);
    });
  }

  // Get current status from background
  function updateStatus() {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
      if (chrome.runtime.lastError) {
        statusText.textContent = 'Extension error';
        return;
      }
      
      const { userId, isMonitoring, sessionActive } = response;
      
      if (!userId) {
        // Not connected
        statusDot.className = 'status-dot';
        statusText.innerHTML = '<strong>Not connected</strong>';
        notConnectedSection.classList.remove('hidden');
        connectedSection.classList.add('hidden');
      } else if (isMonitoring && sessionActive) {
        // Connected and monitoring
        statusDot.className = 'status-dot monitoring';
        statusText.innerHTML = '<strong>Monitoring active</strong> - In session';
        notConnectedSection.classList.add('hidden');
        connectedSection.classList.remove('hidden');
        loadFocusStats();
      } else {
        // Connected but not in session
        statusDot.className = 'status-dot active';
        statusText.innerHTML = '<strong>Connected</strong> - No active session';
        notConnectedSection.classList.add('hidden');
        connectedSection.classList.remove('hidden');
        loadFocusStats();
      }
    });
  }
  
  // Sync with desktop app (native messaging)
  nativeConnectBtn.addEventListener('click', () => {
    nativeConnectBtn.disabled = true;
    nativeConnectBtn.textContent = 'Syncing...';
    autoSyncHint.textContent = 'Syncing with desktop app...';
    autoSyncHint.style.color = '#6b7280';
    
    chrome.runtime.sendMessage({ type: 'TRY_NATIVE_MESSAGING' }, (response) => {
      nativeConnectBtn.disabled = false;
      nativeConnectBtn.textContent = 'Sync with Desktop App';
      
      if (response && response.success) {
        autoSyncHint.textContent = 'Desktop app found! Connecting...';
        autoSyncHint.style.color = '#22c55e';
        nativeConnectHint.textContent = 'Syncs automatically every 10 seconds when the desktop app is running.';
        nativeConnectHint.style.color = '#6b7280';
        updateStatus();
      } else {
        autoSyncHint.textContent = 'Desktop app not detected. Make sure it\'s running and linked to your account.';
        autoSyncHint.style.color = '#dc2626';
        nativeConnectHint.textContent = 'Click to try again, or enter your User ID manually below.';
        nativeConnectHint.style.color = '#6b7280';
      }
    });
  });
  
  // Connect account (manual entry - supports username or user ID)
  const manualHint = document.getElementById('manualHint');
  
  connectBtn.addEventListener('click', () => {
    const input = userIdInput.value.trim();
    if (!input) {
      userIdInput.style.borderColor = '#dc2626';
      return;
    }
    
    connectBtn.disabled = true;
    connectBtn.textContent = 'Connecting...';
    
    // Check if input is a numeric user ID or a username
    const isNumeric = /^\d+$/.test(input);
    
    if (isNumeric) {
      // Direct user ID - just save it
      chrome.runtime.sendMessage({ type: 'SET_USER_ID', userId: input }, (response) => {
        connectBtn.disabled = false;
        connectBtn.textContent = 'Connect Account';
        if (response && response.success) {
          // Reset hint and switch to connected view
          manualHint.textContent = 'Enter your FocusTogether username (e.g. john_doe) or your numeric User ID.';
          manualHint.style.color = '#6b7280';
          updateStatus();
        }
      });
    } else {
      // Username - look it up first
      chrome.runtime.sendMessage({ type: 'LOOKUP_USERNAME', username: input }, (response) => {
        connectBtn.disabled = false;
        connectBtn.textContent = 'Connect Account';
        if (response && response.success) {
          // Reset hint and switch to connected view
          manualHint.textContent = 'Enter your FocusTogether username (e.g. john_doe) or your numeric User ID.';
          manualHint.style.color = '#6b7280';
          updateStatus();
        } else {
          manualHint.textContent = 'Username not found. Check spelling or use your numeric User ID instead.';
          manualHint.style.color = '#dc2626';
        }
      });
    }
  });
  
  // Disconnect account
  disconnectBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'CLEAR_USER_ID' }, (response) => {
      if (response && response.success) {
        userIdInput.value = '';
        updateStatus();
      }
    });
  });
  
  // Clear error styling on input
  userIdInput.addEventListener('input', () => {
    userIdInput.style.borderColor = '#d1d5db';
  });
  
  // Initial status check
  updateStatus();
  setTimeout(loadFocusStats, 400);
  
  // Try to sync with desktop app on popup open
  chrome.runtime.sendMessage({ type: 'TRY_NATIVE_MESSAGING' }, (response) => {
    if (response && response.success) {
      autoSyncHint.textContent = 'Auto-synced with desktop app!';
      autoSyncHint.style.color = '#22c55e';
    } else {
      autoSyncHint.textContent = 'Desktop app not detected. Click "Sync" or enter User ID manually.';
      autoSyncHint.style.color = '#6b7280';
    }
    updateStatus();
  });
  
  // Refresh status periodically while popup is open
  setInterval(updateStatus, 2000);
  // Stats change slowly; refresh every 60s while popup stays open
  setInterval(loadFocusStats, 60000);
});
