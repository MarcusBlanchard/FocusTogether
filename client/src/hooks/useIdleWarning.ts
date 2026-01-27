import { useEffect, useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

const WARNING_THRESHOLD_SECONDS = 10; // Private warning at 10s (testing)
const DISTRACTED_THRESHOLD_SECONDS = 15; // Distracted status at 15s (notifies everyone) (testing)
const POLL_INTERVAL_MS = 250; // Update every 250ms for faster response
const SESSION_POLL_INTERVAL_MS = 5000; // Poll session status every 5 seconds

export type IdlePhase = 'active' | 'warning' | 'idle';

export interface IdleState {
  idleSeconds: number;
  phase: IdlePhase;
  isTauriAvailable: boolean;
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
  
  // In regular browser: Use browser Notification API (can be closed programmatically)
  if (typeof Notification !== 'undefined') {
    try {
      let permission = Notification.permission;
      console.log('[IdleMonitor] Current notification permission:', permission);
      
      if (permission === 'default') {
        console.log('[IdleMonitor] Requesting notification permission...');
        permission = await Notification.requestPermission();
        console.log('[IdleMonitor] Permission result:', permission);
      }
      
      if (permission === 'granted') {
        console.log('[IdleMonitor] Creating browser notification...');
        const notification = new Notification(title, {
          body,
          tag: 'focustogether-warning',
          silent: false,
          icon: '/favicon.ico',
        });
        
        notification.onshow = () => {
          console.log('[IdleMonitor] ✅ Browser notification shown');
        };
        
        notification.onerror = (error) => {
          console.error('[IdleMonitor] Browser notification error:', error);
        };
        
        notification.onclose = () => {
          console.log('[IdleMonitor] Browser notification closed');
        };
        
        console.log('[IdleMonitor] Browser notification created, returning for programmatic close');
        return notification; // Return so we can close it later
      } else {
        console.warn('[IdleMonitor] Browser notification permission denied:', permission);
      }
    } catch (error) {
      console.error('[IdleMonitor] Browser notification failed:', error);
    }
  } else {
    console.log('[IdleMonitor] Browser Notification API not available');
  }
  
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
  });
  
  // Track if warning has been shown for current idle period
  const warningShownRef = useRef(false);
  // Track if distracted status has been sent to backend
  const distractedSentRef = useRef(false);
  // Track the notification object so we can close it when user becomes active
  const notificationRef = useRef<Notification | null>(null);
  // Track current active sessionId (null means no active session)
  const sessionIdRef = useRef<string | null>(null);
  
  // TODO: Later integrate with useAuth() to get user.id instead of hardcoding
  // For now, allow override via VITE_USER_ID env var for testing multiple users
  // Example: VITE_USER_ID=44923348 npm run tauri:dev (for User 2)
  const MOCK_USER_ID = import.meta.env.VITE_USER_ID || "50145776";

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

    try {
      const sessionId = await invoke<string | null>('get_active_session', {
        userId: MOCK_USER_ID,
      });
      
      const prevSessionId = sessionIdRef.current;
      sessionIdRef.current = sessionId;
      
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
  }, [checkTauriAvailable]);

  const checkIdleStatus = useCallback(async () => {
    const isTauriAvailable = checkTauriAvailable();
    
    if (!isTauriAvailable) {
      setState({
        idleSeconds: 0,
        phase: 'active',
        isTauriAvailable: false,
      });
      return;
    }

    try {
      const idleSeconds = await invoke<number>('get_idle_seconds');
      
      // Determine current phase
      let newPhase: IdlePhase = 'active';
      if (idleSeconds >= DISTRACTED_THRESHOLD_SECONDS) {
        newPhase = 'idle'; // Use 'idle' phase for distracted state
      } else if (idleSeconds >= WARNING_THRESHOLD_SECONDS) {
        newPhase = 'warning';
      }

      setState(prev => {
        const prevPhase = prev.phase;
        
        // If user became active, reset flags, close notification, and notify backend
        if (newPhase === 'active' && prevPhase !== 'active') {
          warningShownRef.current = false;
          distractedSentRef.current = false;
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
          
          // Send "active" status to backend when user becomes active again
          if (sessionIdRef.current !== null) {
            (async () => {
              try {
                console.log('[IdleMonitor] Sending active status to backend...');
                await invoke('send_activity_update', {
                  userId: MOCK_USER_ID,
                  sessionId: sessionIdRef.current,
                  status: 'active',
                });
                console.log('[IdleMonitor] ✅ active status sent to backend successfully');
              } catch (error) {
                console.error('[IdleMonitor] ❌ Failed to send active status to backend:', error);
              }
            })();
          }
        }
        
        // Transition to warning phase (10s) - trigger local notification and sound ONLY
        // No backend update at this stage - only local warning
        if (newPhase === 'warning' && prevPhase !== 'warning' && !warningShownRef.current && sessionIdRef.current !== null) {
          warningShownRef.current = true;
          console.log(`[IdleMonitor] State changed: ${prevPhase} -> Warning (${idleSeconds}s)`);
          
          // Show notification (visible even when tabbed out, will auto-close on activity)
          showDesktopNotification(
            'FocusTogether Warning',
            "You're about to be marked as distracted. Move your mouse or type."
          ).then(notification => {
            if (notification) {
              notificationRef.current = notification;
            }
          });
          
          // Play sound
          playWarningSound();
          
          // No backend call at 10s - only local warning
        }
        
        // Transition to idle phase (15s) - send "idle" status to backend ONCE
        // Only enforce if there's an active session
        if (idleSeconds >= DISTRACTED_THRESHOLD_SECONDS && !distractedSentRef.current && sessionIdRef.current !== null) {
          distractedSentRef.current = true;
          console.log(`[IdleMonitor] IDLE TRIGGERED: ${prevPhase} -> Idle (${idleSeconds}s)`);
          
          // Send "idle" status to backend (Replit endpoint)
          (async () => {
            try {
              console.log('[IdleMonitor] Sending idle status to backend...');
              await invoke('send_activity_update', {
                userId: MOCK_USER_ID,
                sessionId: sessionIdRef.current,
                status: 'idle',
              });
              console.log('[IdleMonitor] ✅ idle status sent to backend successfully');
            } catch (error) {
              console.error('[IdleMonitor] ❌ Failed to send idle status to backend:', error);
            }
          })();
        }
        
        return {
          idleSeconds,
          phase: newPhase,
          isTauriAvailable: true,
        };
      });
    } catch (error) {
      console.error('[IdleMonitor] Error checking idle status:', error);
    }
  }, [checkTauriAvailable]);

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

