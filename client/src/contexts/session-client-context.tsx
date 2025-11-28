import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { sessionClient, SessionEvent } from '@/lib/session-client';
import { useAuth } from '@/hooks/useAuth';

interface SessionClientContextValue {
  isConnected: boolean;
  onEvent: (callback: (event: SessionEvent) => void) => () => void;
  sendSignal: (sessionId: string, type: 'offer' | 'answer' | 'ice-candidate', data: any, senderId: string, targetId?: string) => void;
  joinScheduledSession: (sessionId: string) => void;
  getUserId: () => string | null;
  waitForConnection: () => Promise<void>;
}

const SessionClientContext = createContext<SessionClientContextValue | null>(null);

export function SessionClientProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const [isConnected, setIsConnected] = useState(sessionClient.isConnected());

  useEffect(() => {
    if (isLoading || !user) {
      return;
    }

    // Check if already connected with the same user
    const currentUserId = sessionClient.getUserId();
    const alreadyConnected = sessionClient.isConnected() && currentUserId === user.id;
    
    if (!alreadyConnected) {
      console.log('[SessionClientProvider] Connecting for user:', user.id);
      sessionClient.connect(user.id);
    } else {
      console.log('[SessionClientProvider] Already connected for user:', user.id);
    }

    const checkConnection = setInterval(() => {
      const connected = sessionClient.isConnected();
      setIsConnected(connected);
    }, 500);

    return () => {
      clearInterval(checkConnection);
      // Don't disconnect on cleanup - the connection is app-wide
      // The sessionClient singleton manages its own reconnection
    };
  }, [user, isLoading]);

  useEffect(() => {
    const unsubscribe = sessionClient.onEvent(() => {
      setIsConnected(sessionClient.isConnected());
    });
    return unsubscribe;
  }, []);

  const onEvent = useCallback((callback: (event: SessionEvent) => void) => {
    return sessionClient.onEvent(callback);
  }, []);

  const sendSignal = useCallback((sessionId: string, type: 'offer' | 'answer' | 'ice-candidate', data: any, senderId: string, targetId?: string) => {
    sessionClient.sendSignal(sessionId, type, data, senderId, targetId);
  }, []);

  const joinScheduledSession = useCallback((sessionId: string) => {
    sessionClient.joinScheduledSession(sessionId);
  }, []);

  const getUserId = useCallback(() => {
    return sessionClient.getUserId();
  }, []);

  const waitForConnection = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (sessionClient.isConnected() && sessionClient.getUserId()) {
        resolve();
        return;
      }

      const checkInterval = setInterval(() => {
        if (sessionClient.isConnected() && sessionClient.getUserId()) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkInterval);
        if (!sessionClient.isConnected() || !sessionClient.getUserId()) {
          reject(new Error('Failed to establish WebSocket connection'));
        } else {
          resolve();
        }
      }, 10000);
    });
  }, []);

  const value: SessionClientContextValue = {
    isConnected,
    onEvent,
    sendSignal,
    joinScheduledSession,
    getUserId,
    waitForConnection,
  };

  return (
    <SessionClientContext.Provider value={value}>
      {children}
    </SessionClientContext.Provider>
  );
}

export function useSessionClient() {
  const context = useContext(SessionClientContext);
  if (!context) {
    throw new Error('useSessionClient must be used within a SessionClientProvider');
  }
  return context;
}
