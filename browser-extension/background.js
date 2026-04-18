// Flowlocked Browser Extension - Background Service Worker
// Reports active website to server, server decides if it's distracting

// Default API host (production). Override with apiBaseOverride in storage for staging/dev.
let API_BASE = 'https://flowlocked.com';

// State
let userId = null;
let currentSession = null;
let isMonitoring = false;
let lastReportedForeground = null;
let reportInterval = null;

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Flowlocked] Extension installed');
  loadUserId();
});

// Initialize on startup
chrome.runtime.onStartup.addListener(() => {
  console.log('[Flowlocked] Extension started');
  loadUserId();
});

// Load user ID from storage, then sync with desktop app
async function loadUserId() {
  const result = await chrome.storage.local.get(['userId', 'apiBaseOverride']);
  if (result.apiBaseOverride && typeof result.apiBaseOverride === 'string') {
    API_BASE = result.apiBaseOverride.replace(/\/$/, '');
    console.log('[Flowlocked] Using apiBaseOverride:', API_BASE);
  }
  userId = result.userId || null;
  console.log('[Flowlocked] Loaded userId from storage:', userId ? userId : 'not set');
  
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
  console.log('[Flowlocked] Syncing with desktop app...');
  
  try {
    const result = await tryNativeMessaging();
    // tryNativeMessaging already saves the user ID if successful
  } catch (error) {
    console.log('[Flowlocked] Desktop app sync failed:', error.message);
  }
}

// Try to get user ID from web app session (if logged in on same browser)
async function tryAutoDetectUser() {
  console.log('[Flowlocked] Trying to auto-detect user from web app...');
  
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
  lastReportedForeground = null;
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
        lastReportedForeground = null;
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

function getExtensionForegroundPayload(tab) {
  if (!tab) return null;
  const tabUrl = tab.url || tab.pendingUrl || '';
  const title = (tab.title || '').trim();
  if (!tabUrl.startsWith('chrome-extension://')) return null;

  let extensionId = null;
  try {
    extensionId = new URL(tabUrl).hostname || null;
  } catch {}

  const foregroundApp =
    title.length > 0 && !/^new tab$/i.test(title)
      ? title
      : extensionId
        ? `extension:${extensionId}`
        : 'browser extension';

  const key = extensionId
    ? `extension:${extensionId}:${foregroundApp.toLowerCase()}`
    : `extension-title:${foregroundApp.toLowerCase()}`;
  return {
    key,
    foregroundApp,
    extensionId,
  };
}

// Start reporting current extension foreground to server periodically
function startDomainReporting() {
  if (reportInterval) return;
  
  reportCurrentDomain(); // Report immediately
  reportInterval = setInterval(reportCurrentDomain, 2000); // Safety net if tab events are missed
}

// Report active extension context to server (never normal websites).
async function reportCurrentDomain() {
  if (!isMonitoring || !currentSession || !userId) return;
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const payload = getExtensionForegroundPayload(tab);
    if (!payload) {
      return;
    }
    
    // Skip reporting if unchanged foreground target
    if (payload.key === lastReportedForeground) return;
    
    console.log('[FocusTogether] Reporting extension foreground to server:', payload);
    lastReportedForeground = payload.key;
    
    // Extension-only contract: never send website domains from this integration.
    const body = {
      userId: String(userId),
      source: 'browserExtensionExtension',
      foregroundApp: payload.foregroundApp,
    };
    if (payload.extensionId) body.extensionId = payload.extensionId;
    const response = await fetch(`${API_BASE}/api/desktop/apps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      console.error('[FocusTogether] Server returned error:', response.status);
    } else {
      const data = await response.json();
      console.log('[FocusTogether] Server response:', data);
      if (data.isForegroundBlocked) {
        console.log('[FocusTogether] Distracting extension context detected');
      }
    }
  } catch (error) {
    console.error('[FocusTogether] Error reporting extension foreground:', error);
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

// Re-report after focus: one shot can race tab activation; burst + shorter interval helps
// the server align `currentDistraction` with the real foreground tab faster.
function scheduleDomainReportBurst() {
  if (!isMonitoring) return;
  const fire = () => {
    lastReportedForeground = null;
    reportCurrentDomain();
  };
  // Tab switch races: active tab URL may not be final on first tick — stagger fires
  fire();
  setTimeout(fire, 120);
  setTimeout(fire, 400);
  setTimeout(fire, 900);
}

// When the user switches from another app (e.g. Chess) back to Chrome, tabs may not change
// but we must re-report the active tab so the server clears stale `currentDistraction`.
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (!isMonitoring) return;
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  chrome.windows.get(windowId, (win) => {
    if (chrome.runtime.lastError || !win || win.focused !== true) return;
    scheduleDomainReportBurst();
  });
});

// Tab switch: burst so we don't read stale URL and miss clearing distraction
chrome.tabs.onActivated.addListener(() => {
  if (!isMonitoring) return;
  scheduleDomainReportBurst();
});

// SPA / in-tab navigation: URL can update after activation
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!isMonitoring) return;
  if (changeInfo.url && tab.active) {
    scheduleDomainReportBurst();
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
  } else if (message.type === 'GET_FOCUS_STATS') {
    (async () => {
      try {
        const { userId: uid } = await chrome.storage.local.get(['userId']);
        if (!uid) {
          sendResponse({ ok: false, error: 'not_linked' });
          return;
        }
        const r = await fetch(
          `${API_BASE}/api/focus-stats?userId=${encodeURIComponent(uid)}`
        );
        if (!r.ok) {
          sendResponse({ ok: false, error: 'http', status: r.status });
          return;
        }
        const data = await r.json();
        sendResponse({
          ok: true,
          idleWarningCount: Number(data.idleWarningCount) || 0,
          distractionCount: Number(data.distractionCount) || 0,
        });
      } catch (e) {
        sendResponse({
          ok: false,
          error: e && e.message ? e.message : String(e),
        });
      }
    })();
    return true;
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
