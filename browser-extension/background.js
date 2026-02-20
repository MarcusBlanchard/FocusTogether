// FocusTogether Browser Extension - Background Service Worker
// Reports active website to server, server decides if it's distracting

// const API_BASE = 'https://focustogether.replit.app'; // Production
const API_BASE = 'https://85f28487-f52a-4264-bfe6-832501142976-00-36zv4e7q2xsre.spock.replit.dev'; // Replit dev

// State
let userId = null;
let currentSession = null;
let isMonitoring = false;
let lastReportedDomain = null;
let reportInterval = null;

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('[FocusTogether] Extension installed');
  loadUserId();
});

// Initialize on startup
chrome.runtime.onStartup.addListener(() => {
  console.log('[FocusTogether] Extension started');
  loadUserId();
});

// Load user ID from storage, then sync with desktop app
async function loadUserId() {
  const result = await chrome.storage.local.get(['userId']);
  userId = result.userId || null;
  console.log('[FocusTogether] Loaded userId from storage:', userId ? userId : 'not set');
  
  // Try to sync with desktop app
  await syncWithDesktopApp();
  
  if (userId) {
    startSessionPolling();
  }
  
  // Start periodic sync with desktop app (every 10 seconds)
  setInterval(syncWithDesktopApp, 10000);
}

// Sync user ID with desktop app via native messaging
async function syncWithDesktopApp() {
  console.log('[FocusTogether] Syncing with desktop app...');
  
  try {
    const result = await tryNativeMessaging();
    // tryNativeMessaging already saves the user ID if successful
  } catch (error) {
    console.log('[FocusTogether] Desktop app sync failed:', error.message);
  }
}

// Try to get user ID from web app session (if logged in on same browser)
async function tryAutoDetectUser() {
  console.log('[FocusTogether] Trying to auto-detect user from web app...');
  
  try {
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    // Call the API with credentials to use session cookie
    const response = await fetch(`${API_BASE}/api/auth/user`, {
      credentials: 'include', // Include cookies from the web app
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    console.log('[FocusTogether] Auth response status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('[FocusTogether] Auth response data:', data);
      
      if (data && data.id) {
        console.log('[FocusTogether] ✅ Auto-detected user:', data.id);
        await saveUserId(data.id);
        return { success: true, userId: data.id };
      } else {
        console.log('[FocusTogether] No user ID in response');
        return { success: false, error: 'No user data returned' };
      }
    } else {
      console.log('[FocusTogether] Not logged in (status:', response.status, ')');
      return { success: false, error: 'Not logged in on this browser' };
    }
  } catch (error) {
    console.log('[FocusTogether] Auto-detect failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Try to get user ID from desktop app via native messaging
const NATIVE_HOST_NAME = 'com.focustogether.app';

async function tryNativeMessaging() {
  console.log('[FocusTogether] Trying to connect to desktop app via native messaging...');
  
  return new Promise((resolve) => {
    // Timeout after 5 seconds to prevent getting stuck
    const timeout = setTimeout(() => {
      console.log('[FocusTogether] Native messaging timed out');
      resolve(false);
    }, 5000);
    
    try {
      chrome.runtime.sendNativeMessage(
        NATIVE_HOST_NAME,
        { type: 'GET_USER_ID' },
        (response) => {
          clearTimeout(timeout);
          
          if (chrome.runtime.lastError) {
            console.log('[FocusTogether] Native messaging not available:', chrome.runtime.lastError.message);
            resolve(false);
            return;
          }
          
          if (response && response.success && response.user_id) {
            const newUserId = response.user_id;
            
            // Check if user ID changed
            if (userId !== newUserId) {
              console.log('[FocusTogether] ✅ User ID from desktop app:', newUserId, userId ? `(changed from ${userId})` : '(new)');
              saveUserId(newUserId);
            } else {
              console.log('[FocusTogether] User ID unchanged:', newUserId);
            }
            resolve(true);
          } else {
            console.log('[FocusTogether] Desktop app response:', response);
            resolve(false);
          }
        }
      );
    } catch (error) {
      clearTimeout(timeout);
      console.log('[FocusTogether] Native messaging error:', error.message);
      resolve(false);
    }
  });
}

// Look up user ID by username
async function lookupUserByUsername(username) {
  console.log('[FocusTogether] Looking up user by username:', username);
  
  try {
    const response = await fetch(`${API_BASE}/api/users/lookup?username=${encodeURIComponent(username)}`);
    
    if (response.ok) {
      const data = await response.json();
      if (data && data.id) {
        console.log('[FocusTogether] ✅ Found user:', data.id);
        return data.id;
      }
    }
    console.log('[FocusTogether] User not found');
    return null;
  } catch (error) {
    console.log('[FocusTogether] Username lookup failed:', error.message);
    return null;
  }
}

// Save user ID to storage
async function saveUserId(id) {
  userId = id;
  await chrome.storage.local.set({ userId: id });
  console.log('[FocusTogether] Saved userId');
  startSessionPolling();
}

// Clear user ID
async function clearUserId() {
  userId = null;
  await chrome.storage.local.remove(['userId']);
  stopSessionPolling();
  console.log('[FocusTogether] Cleared userId');
}

// Poll server for active session
let pollingInterval = null;

function startSessionPolling() {
  if (pollingInterval) return;
  
  console.log('[FocusTogether] Starting session polling');
  checkSession(); // Check immediately
  pollingInterval = setInterval(checkSession, 5000); // Then every 5 seconds
}

function stopSessionPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  if (reportInterval) {
    clearInterval(reportInterval);
    reportInterval = null;
  }
  isMonitoring = false;
  currentSession = null;
  lastReportedDomain = null;
  updateIcon(false);
}

async function checkSession() {
  if (!userId) return;
  
  try {
    const response = await fetch(`${API_BASE}/api/activity/session?userId=${userId}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.active && data.sessionId) {
      currentSession = {
        sessionId: data.sessionId,
        active: true
      };
      
      if (!isMonitoring) {
        console.log('[FocusTogether] Session active, starting monitoring');
        isMonitoring = true;
        updateIcon(true);
        startDomainReporting();
      }
    } else {
      if (isMonitoring) {
        console.log('[FocusTogether] Session ended, stopping monitoring');
        isMonitoring = false;
        currentSession = null;
        lastReportedDomain = null;
        if (reportInterval) {
          clearInterval(reportInterval);
          reportInterval = null;
        }
        updateIcon(false);
      }
    }
  } catch (error) {
    console.error('[FocusTogether] Error checking session:', error);
  }
}

// Get domain from URL
function getDomain(url) {
  if (!url) return null;
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.toLowerCase();
  } catch {
    return null;
  }
}

// Start reporting current domain to server periodically
function startDomainReporting() {
  if (reportInterval) return;
  
  reportCurrentDomain(); // Report immediately
  reportInterval = setInterval(reportCurrentDomain, 5000); // Then every 5 seconds
}

// Report current domain to server
async function reportCurrentDomain() {
  if (!isMonitoring || !currentSession || !userId) return;
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return;
    
    const domain = getDomain(tab.url);
    if (!domain) return;
    
    // Skip reporting if it's the same domain we just reported
    if (domain === lastReportedDomain) return;
    
    console.log('[FocusTogether] Reporting domain to server:', domain);
    lastReportedDomain = domain;
    
    // Send to server - server will decide if it's distracting
    const response = await fetch(`${API_BASE}/api/desktop/apps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: userId,
        apps: [domain],
        foregroundApp: domain
      })
    });
    
    if (!response.ok) {
      console.error('[FocusTogether] Server returned error:', response.status);
    } else {
      const data = await response.json();
      console.log('[FocusTogether] Server response:', data);
      
      // Desktop app will show the notification via server polling
      // Browser notification disabled - desktop app handles it
      if (data.isForegroundBlocked) {
        console.log('[FocusTogether] Distracting site detected, desktop app will show notification');
      }
    }
  } catch (error) {
    console.error('[FocusTogether] Error reporting domain:', error);
  }
}

// Show warning notification
function showWarningNotification(domain) {
  try {
    chrome.notifications.create('distraction-warning-' + Date.now(), {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Distracting Site Detected',
      message: `${domain} is marked as distracting. Switch back to stay focused!`,
      priority: 2
    });
  } catch (error) {
    console.error('[FocusTogether] Error showing notification:', error);
  }
}

// Update extension icon based on monitoring state
function updateIcon(monitoring) {
  const iconPath = monitoring ? {
    16: 'icons/icon16-active.png',
    48: 'icons/icon48-active.png',
    128: 'icons/icon128-active.png'
  } : {
    16: 'icons/icon16.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png'
  };
  
  chrome.action.setIcon({ path: iconPath }).catch(() => {
    // Fallback to default icons if active icons don't exist
    chrome.action.setIcon({ path: {
      16: 'icons/icon16.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png'
    }});
  });
}

// Listen for tab changes - report immediately when tab changes
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (!isMonitoring) return;
  
  // Reset last reported so we report the new tab
  lastReportedDomain = null;
  reportCurrentDomain();
});

// Listen for tab URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!isMonitoring) return;
  if (changeInfo.url && tab.active) {
    // Reset last reported so we report the new URL
    lastReportedDomain = null;
    reportCurrentDomain();
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_STATUS') {
    sendResponse({
      userId: userId,
      isMonitoring: isMonitoring,
      sessionActive: !!currentSession
    });
  } else if (message.type === 'SET_USER_ID') {
    saveUserId(message.userId);
    sendResponse({ success: true });
  } else if (message.type === 'CLEAR_USER_ID') {
    clearUserId();
    sendResponse({ success: true });
  } else if (message.type === 'TRY_AUTO_DETECT') {
    // Try to auto-detect user from web app login
    tryAutoDetectUser().then(result => {
      sendResponse({ 
        success: result.success, 
        userId: result.userId || userId,
        error: result.error 
      });
    });
    return true; // Keep channel open for async response
  } else if (message.type === 'TRY_NATIVE_MESSAGING') {
    // Try to get user ID from desktop app via native messaging
    tryNativeMessaging().then(success => {
      sendResponse({ success: success, userId: userId });
    });
    return true; // Keep channel open for async response
  } else if (message.type === 'LOOKUP_USERNAME') {
    // Look up user ID by username
    lookupUserByUsername(message.username).then(foundUserId => {
      if (foundUserId) {
        saveUserId(foundUserId);
        sendResponse({ success: true, userId: foundUserId });
      } else {
        sendResponse({ success: false, error: 'User not found' });
      }
    });
    return true; // Keep channel open for async response
  }
  return true;
});

// Initialize
loadUserId();
