import { useEffect, useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';

// Yellow idle warning from 60s–90s (30s countdown in the popup), then red + POST idle for partners at 90s
const WARNING_THRESHOLD_SECONDS = 60;
const DISTRACTED_THRESHOLD_SECONDS = 90;
const POLL_INTERVAL_MS = 250; // Update every 250ms for faster response
// How often we refresh session + browser distraction from the server. Lower = faster clear
// when switching Chrome from YouTube → neutral tab (extension posts quickly; desktop must poll).
const SESSION_POLL_INTERVAL_MS = 2000;

export type IdlePhase = 'active' | 'warning' | 'idle';

export interface IdleState {
  idleSeconds: number;
  phase: IdlePhase;
  isTauriAvailable: boolean;
  /** When true, server note-taking mode is active — yellow idle pop-up must stay hidden. */
  noteTakingMode: boolean;
}

/** Desktop poll (`get_active_session` → GET /api/desktop/poll). */
interface ActiveSessionPollResult {
  sessionId: string | null;
  noteTakingMode: boolean;
}

interface SendActivityUpdateResult {
  noteTakingMode: boolean;
}

/**
 * Play a short system sound using Web Audio API
 */
function playWarningSound() {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800; // Higher pitch
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (error) {
    console.error('[IdleMonitor] Error playing sound:', error);
  }
}

/**
 * Show desktop notification - use Tauri/osascript in Tauri, browser API in regular browser
 */
async function showDesktopNotification(title: string, body: string): Promise<Notification | null> {
  console.log('[IdleMonitor] Attempting to show notification:', title);
  
  // Check if we're in Tauri
  const isTauri = typeof window !== 'undefined' && (window as any).__TAURI__ !== undefined;
  
  if (isTauri) {
    // In Tauri: Use floating notification window (visible and can be closed)
    console.log('[IdleMonitor] Using Tauri notification window');
    try {
      await invoke('show_notification', { title, body });
      console.log('[IdleMonitor] ✅ Tauri notification window shown');
      // Return a dummy object so we can track it
      return { close: () => invoke('dismiss_notification') } as any;
    } catch (error) {
      console.error('[IdleMonitor] Tauri notification failed:', error);
    }
    return null;
  }
  
  // In regular browser: Don't show desktop notifications - the web UI will handle it
  console.log('[IdleMonitor] 🌐 Running in browser mode - desktop notifications disabled');
  console.log('[IdleMonitor] ℹ️  Activity state changes will be shown in the web UI only');
  
  return null;
}

/**
 * Hook to monitor user inactivity.
 * Returns idle state and logs transitions to console.
 * Triggers notifications and sounds at thresholds.
 */
export function useIdleMonitoring() {
  const [state, setState] = useState<IdleState>({
    idleSeconds: 0,
    phase: 'active',
    isTauriAvailable: false,
    noteTakingMode: false,
  });
  
  // Track if warning has been shown for current idle period
  const warningShownRef = useRef(false);
  // Track if distracted status has been sent to backend
  const distractedSentRef = useRef(false);
  /// Prevents parallel POSTs; cleared on success or after each attempt (retry next tick if needed)
  const idleSendInFlightRef = useRef(false);
  /// Last countdown seconds pushed to the yellow window (avoid redundant invokes)
  const lastIdleCountdownRef = useRef(-1);
  /// Whether the idle notification UI has already flipped to red for this idle cycle
  const idleUiMarkedRef = useRef(false);
  // Track the notification object so we can close it when user becomes active
  const notificationRef = useRef<Notification | null>(null);
  // Track current active sessionId (null means no active session)
  const sessionIdRef = useRef<string | null>(null);
  /// Server flag from poll / activity-update: suppress yellow idle pop-up when true
  const noteTakingModeRef = useRef(false);
  
  // Get userId from config file (set via deep link from web app)
  // Starts empty - user must connect via web app to set userId
  const [MOCK_USER_ID, setMockUserId] = useState("");
  const [isListenerOnly, setIsListenerOnly] = useState(false);
  
  // Load userId and listener mode from Tauri command on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        // Check if Tauri is available
        if (typeof window !== 'undefined' && (window as any).__TAURI__) {
          const userId = await invoke<string | null>('get_user_id');
          const listenerMode = await invoke<boolean>('is_listener_only');
          
          if (userId) {
            console.log('[IdleMonitor] ✅ Got userId from Tauri:', userId);
            setMockUserId(userId);
          } else {
            console.log('[IdleMonitor] ⚠️ No user linked - please connect via web app');
            // Keep MOCK_USER_ID empty to disable monitoring until linked
            setMockUserId("");
          }
          console.log('[IdleMonitor] ✅ Listener-only mode:', listenerMode);
          setIsListenerOnly(listenerMode);
        } else {
          console.log('[IdleMonitor] Using default userId (not in Tauri):', MOCK_USER_ID);
        }
      } catch (error) {
        console.error('[IdleMonitor] Error loading config from Tauri:', error);
        // Don't set a default - require user to link via web app
        setMockUserId("");
      }
    };
    loadConfig();
  }, []);

  // When backend switches user (e.g. deep link), refetch userId so get_active_session and detection use the new user
  useEffect(() => {
    if (typeof window === 'undefined' || (window as any).__TAURI__ === undefined) {
      return;
    }
    const unlisten = listen('userId-changed', async () => {
      try {
        const userId = await invoke<string | null>('get_user_id');
        setMockUserId(userId ?? '');
        if (userId) {
          console.log('[IdleMonitor] userId-changed: now using', userId);
        } else {
          console.log('[IdleMonitor] userId-changed: no user linked');
        }
      } catch (error) {
        console.error('[IdleMonitor] Error refetching userId after userId-changed:', error);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const checkTauriAvailable = useCallback(() => {
    try {
      if (typeof window === 'undefined') {
        console.log('[IdleMonitor] window is undefined');
        return false;
      }
      // Check multiple ways Tauri might be available
      const win = window as any;
      // withGlobalTauri: true exposes __TAURI__
      if (win.__TAURI__ !== undefined) {
        console.log('[IdleMonitor] Tauri detected via __TAURI__');
        return true;
      }
      // Fallback to internals
      if (win.__TAURI_INTERNALS__ !== undefined) {
        console.log('[IdleMonitor] Tauri detected via __TAURI_INTERNALS__');
        return true;
      }
      console.log('[IdleMonitor] Tauri not detected. window.__TAURI__:', win.__TAURI__, 'window.__TAURI_INTERNALS__:', win.__TAURI_INTERNALS__);
      return false;
    } catch (error) {
      console.error('[IdleMonitor] Error checking Tauri availability:', error);
      return false;
    }
  }, []);

  // Poll active session from backend
  const pollActiveSession = useCallback(async () => {
    const isTauriAvailable = checkTauriAvailable();
    if (!isTauriAvailable) {
      return;
    }
    
    // Skip polling if no user is linked
    if (!MOCK_USER_ID) {
      return;
    }

    try {
      const result = await invoke<ActiveSessionPollResult>('get_active_session', {
        userId: MOCK_USER_ID,
      });

      const sessionId = result.sessionId;
      const prevSessionId = sessionIdRef.current;
      const prevNoteTaking = noteTakingModeRef.current;
      sessionIdRef.current = sessionId;
      noteTakingModeRef.current = result.noteTakingMode;

      if (result.noteTakingMode && !prevNoteTaking) {
        console.log('[IdleMonitor] noteTakingMode=true — suppressing idle warning UI');
        invoke('dismiss_notification').catch(() => {});
        notificationRef.current = null;
        warningShownRef.current = false;
        lastIdleCountdownRef.current = -1;
        idleUiMarkedRef.current = false;
      }

      // Log session changes for debugging
      if (prevSessionId !== sessionId) {
        if (sessionId === null) {
          console.log('[IdleMonitor] Session ended - enforcement disabled');
        } else {
          console.log(`[IdleMonitor] Session active: ${sessionId} - enforcement enabled`);
        }
      }
    } catch (error) {
      console.error('[IdleMonitor] Error polling active session:', error);
      // On error, assume no session (graceful degradation)
      sessionIdRef.current = null;
    }
  }, [checkTauriAvailable, MOCK_USER_ID]); // Re-create callback when MOCK_USER_ID changes

  const checkIdleStatus = useCallback(async () => {
    const isTauriAvailable = checkTauriAvailable();
    
    if (!isTauriAvailable) {
      setState({
        idleSeconds: 0,
        phase: 'active',
        isTauriAvailable: false,
        noteTakingMode: false,
      });
      return;
    }
    
    // Skip idle monitoring entirely if in listener-only mode
    if (isListenerOnly) {
      console.log(`[IdleMonitor] 🎧 Listener-only mode - skipping idle monitoring`);
      return;
    }
    
    // Skip if no user is linked
    if (!MOCK_USER_ID) {
      console.log(`[IdleMonitor] ⚠️ No user linked - skipping idle monitoring`);
      return;
    }
    
    // Log userId being used for monitoring
    if (MOCK_USER_ID) {
      // Only log once when monitoring starts
      const logKey = `monitoring_${MOCK_USER_ID}`;
      if (!(window as any)[logKey]) {
        console.log(`[IdleMonitor] 🎯 Monitoring activity for userId: ${MOCK_USER_ID}`);
        (window as any)[logKey] = true;
      }
    }

    try {
      const idleSeconds = await invoke<number>('get_idle_seconds');

      const suppressIdleUi = noteTakingModeRef.current;

      // Determine current phase
      let newPhase: IdlePhase = 'active';
      if (idleSeconds >= DISTRACTED_THRESHOLD_SECONDS) {
        newPhase = 'idle'; // Use 'idle' phase for distracted state
      } else if (idleSeconds >= WARNING_THRESHOLD_SECONDS) {
        newPhase = 'warning';
      }

      const displayPhase: IdlePhase = suppressIdleUi ? 'active' : newPhase;

      // Countdown on yellow window (same idea as orange distraction warning)
      if (
        !suppressIdleUi &&
        isTauriAvailable &&
        !isListenerOnly &&
        MOCK_USER_ID &&
        sessionIdRef.current !== null &&
        idleSeconds >= WARNING_THRESHOLD_SECONDS &&
        idleSeconds < DISTRACTED_THRESHOLD_SECONDS
      ) {
        const remaining = DISTRACTED_THRESHOLD_SECONDS - idleSeconds;
        if (remaining !== lastIdleCountdownRef.current) {
          lastIdleCountdownRef.current = remaining;
          invoke('update_notification_idle_countdown', { secondsRemaining: remaining }).catch(() => {});
        }
      } else if (idleSeconds < WARNING_THRESHOLD_SECONDS) {
        lastIdleCountdownRef.current = -1;
      }

      // At threshold: hide countdown "1" (integer idle can flicker 89–90; don't gate red on that)
      if (
        !suppressIdleUi &&
        isTauriAvailable &&
        !isListenerOnly &&
        MOCK_USER_ID &&
        idleSeconds >= DISTRACTED_THRESHOLD_SECONDS &&
        lastIdleCountdownRef.current !== 0
      ) {
        lastIdleCountdownRef.current = 0;
        invoke('update_notification_idle_countdown', { secondsRemaining: 0 }).catch(() => {});
      }

      // Flip UI to red immediately at 0, independent of network timing.
      if (
        !suppressIdleUi &&
        isTauriAvailable &&
        !isListenerOnly &&
        MOCK_USER_ID &&
        idleSeconds >= DISTRACTED_THRESHOLD_SECONDS &&
        !idleUiMarkedRef.current
      ) {
        idleUiMarkedRef.current = true;
        invoke('update_notification_to_idle_marked').catch((error) => {
          console.error('[IdleMonitor] Failed to update idle notification UI:', error);
          idleUiMarkedRef.current = false;
        });
      } else if (idleSeconds < DISTRACTED_THRESHOLD_SECONDS) {
        idleUiMarkedRef.current = false;
      }

      // POST idle to server + red UI once threshold reached (session id fetched here — not only the 2s poll ref)
      if (
        idleSeconds >= DISTRACTED_THRESHOLD_SECONDS &&
        !distractedSentRef.current &&
        !isListenerOnly &&
        MOCK_USER_ID &&
        !idleSendInFlightRef.current
      ) {
        idleSendInFlightRef.current = true;
        (async () => {
          try {
            const poll = await invoke<ActiveSessionPollResult>('get_active_session', {
              userId: MOCK_USER_ID,
            });
            const sessionId = poll.sessionId;
            if (!sessionId) {
              console.warn('[IdleMonitor] No active session — cannot mark idle for others');
              return;
            }
            noteTakingModeRef.current = poll.noteTakingMode;
            const idleRes = await invoke<SendActivityUpdateResult>('send_activity_update', {
              userId: MOCK_USER_ID,
              sessionId,
              status: 'idle',
            });
            if (idleRes.noteTakingMode) {
              noteTakingModeRef.current = true;
              invoke('dismiss_notification').catch(() => {});
              notificationRef.current = null;
              warningShownRef.current = false;
              lastIdleCountdownRef.current = -1;
              idleUiMarkedRef.current = false;
            }
            distractedSentRef.current = true;
            // Only revert if user is clearly active again (not 89 vs 90 floor from get_idle_seconds)
            const idleAfter = await invoke<number>('get_idle_seconds');
            if (idleAfter < WARNING_THRESHOLD_SECONDS) {
              const activeRes = await invoke<SendActivityUpdateResult>('send_activity_update', {
                userId: MOCK_USER_ID,
                sessionId,
                status: 'active',
              });
              if (activeRes.noteTakingMode) {
                noteTakingModeRef.current = true;
                invoke('dismiss_notification').catch(() => {});
                notificationRef.current = null;
                warningShownRef.current = false;
                lastIdleCountdownRef.current = -1;
                idleUiMarkedRef.current = false;
              }
              distractedSentRef.current = false;
              idleUiMarkedRef.current = false;
              return;
            }
            console.log('[IdleMonitor] ✅ Marked idle and updated notification');
          } catch (error) {
            console.error('[IdleMonitor] ❌ Idle mark failed:', error);
          } finally {
            idleSendInFlightRef.current = false;
          }
        })();
      }

      setState(prev => {
        const prevPhase = prev.phase;
        
        // If user became active, reset flags, close notification, and notify backend
        if (newPhase === 'active' && prevPhase !== 'active') {
          warningShownRef.current = false;
          distractedSentRef.current = false;
          idleSendInFlightRef.current = false;
          lastIdleCountdownRef.current = -1;
          idleUiMarkedRef.current = false;
          // Close any open notification immediately when user becomes active
          if (notificationRef.current) {
            const notification = notificationRef.current;
            // Clear ref immediately so we don't try to close again
            notificationRef.current = null;
            // Close notification (fire and forget - don't wait for async operations)
            try {
              if (typeof notification.close === 'function') {
                // Call close() - works for both browser (sync) and Tauri (async) notifications
                const result = notification.close() as any;
                // If it returns a promise (Tauri), handle it asynchronously
                if (result && typeof result === 'object' && typeof result.then === 'function') {
                  result.catch((error: any) => {
                    console.warn('[IdleMonitor] Error closing Tauri notification:', error);
                  });
                }
                console.log('[IdleMonitor] Closed notification due to user activity');
              }
            } catch (error) {
              console.warn('[IdleMonitor] Error closing notification:', error);
            }
          }
          console.log(`[IdleMonitor] State changed: ${prevPhase} -> Active (${idleSeconds}s)`);
          
          // Send "active" status to backend when user becomes active again (unless listener-only)
          if (sessionIdRef.current !== null && !isListenerOnly) {
            (async () => {
              try {
                console.log('[IdleMonitor] Sending active status to backend...');
                const activeRes = await invoke<SendActivityUpdateResult>('send_activity_update', {
                  userId: MOCK_USER_ID,
                  sessionId: sessionIdRef.current as string,
                  status: 'active',
                });
                if (activeRes.noteTakingMode) {
                  noteTakingModeRef.current = true;
                  invoke('dismiss_notification').catch(() => {});
                  notificationRef.current = null;
                  warningShownRef.current = false;
                  lastIdleCountdownRef.current = -1;
                  idleUiMarkedRef.current = false;
                }
                console.log('[IdleMonitor] ✅ active status sent to backend successfully');
              } catch (error) {
                console.error('[IdleMonitor] ❌ Failed to send active status to backend:', error);
              }
            })();
          }
        }
        
        // Yellow at ≥60s idle; red + backend at ≥90s (30s of yellow only)
        // No backend update at this stage - only local warning
        // Only in `warning` phase (60–89s); at 90s phase is `idle` — red path below, no new yellow
        if (
          newPhase === 'warning' &&
          !suppressIdleUi &&
          !warningShownRef.current &&
          sessionIdRef.current !== null
        ) {
          warningShownRef.current = true;
          console.log(`[IdleMonitor] Showing warning notification (phase: ${newPhase}, idle: ${idleSeconds}s)`);
          
          // Show notification (visible even when tabbed out, will auto-close on activity)
          showDesktopNotification(
            'Idle Warning',
            "You're about to be marked as idle. Move your mouse or type."
          ).then(notification => {
            if (notification) {
              notificationRef.current = notification;
            }
          });
          
          // Sound is now played by Rust after window is shown (for sync)
        }
        
        return {
          idleSeconds,
          phase: displayPhase,
          isTauriAvailable: true,
          noteTakingMode: noteTakingModeRef.current,
        };
      });
    } catch (error) {
      console.error('[IdleMonitor] Error checking idle status:', error);
    }
  }, [checkTauriAvailable, isListenerOnly, MOCK_USER_ID]);

  useEffect(() => {
    // Request notification permission on mount (for browser API fallback)
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        console.log('[IdleMonitor] Initial notification permission request:', permission);
      });
    }

    // Initial check
    checkIdleStatus();

    // Poll every 250ms for fast response to user activity
    const interval = setInterval(checkIdleStatus, POLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      // Cleanup: close any open notification on unmount
      if (notificationRef.current && typeof notificationRef.current.close === 'function') {
        try {
          notificationRef.current.close();
        } catch (error) {
          // Ignore errors during cleanup
        }
        notificationRef.current = null;
      }
    };
  }, [checkIdleStatus]);

  // Poll active session status independently
  useEffect(() => {
    // Poll immediately on mount
    pollActiveSession();

    // Poll every 5 seconds
    const sessionInterval = setInterval(pollActiveSession, SESSION_POLL_INTERVAL_MS);

    return () => {
      clearInterval(sessionInterval);
    };
  }, [pollActiveSession]);

  return state;
}

