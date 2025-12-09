// Session client for WebSocket communication
// Uses direct WebSocket since River client requires more complex setup

export interface PartnerInfo {
  id?: string;
  userId?: string;
  username: string | null;
  profileImageUrl: string | null;
}

export interface ParticipantInfo {
  userId: string;
  username: string | null;
  profileImageUrl: string | null;
}

export interface SessionEvent {
  type: 'matched' | 'partner-disconnected' | 'invite-received' | 'invite-response' | 'signal' | 'participant-joined' | 'participant-left' | 'room-joined' | 'room-ended' | 'session-expired';
  sessionId?: string;
  partner?: PartnerInfo;
  inviter?: PartnerInfo;
  accepted?: boolean;
  signal?: {
    type: 'offer' | 'answer' | 'ice-candidate';
    sessionId: string;
    senderId: string;
    targetId?: string;
    data: any;
  };
  participant?: ParticipantInfo;
  participants?: ParticipantInfo[];
  roomId?: string;
  roomName?: string;
  reason?: 'no-participants';
}

type EventCallback = (event: SessionEvent) => void;

class SessionClient {
  private ws: WebSocket | null = null;
  private userId: string | null = null;
  private eventCallbacks: EventCallback[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private shouldReconnect = true;

  connect(userId: string) {
    // If already connected with same user, don't reconnect
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.userId === userId) {
      console.log('[SessionClient] Already connected for user:', userId);
      return;
    }
    
    // If connecting, wait for it
    if (this.isConnecting) {
      console.log('[SessionClient] Connection in progress, skipping...');
      return;
    }
    
    // If connecting to different user, close existing connection first
    if (this.userId && this.userId !== userId && this.ws) {
      console.log('[SessionClient] Switching user, closing existing connection');
      this.shouldReconnect = false;
      this.ws.close();
      this.ws = null;
    }

    this.userId = userId;
    this.isConnecting = true;
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;

    // Cancel any pending reconnect
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/river?userId=${userId}`;

    console.log('[SessionClient] Connecting to:', wsUrl);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[SessionClient] Connected successfully');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as SessionEvent;
          console.log('[SessionClient] Received:', data);
          this.eventCallbacks.forEach((cb) => cb(data));
        } catch (error) {
          console.error('[SessionClient] Error parsing message:', error);
        }
      };

      this.ws.onclose = (event) => {
        console.log('[SessionClient] Disconnected, code:', event.code, 'reason:', event.reason);
        this.isConnecting = false;
        this.stopHeartbeat();
        this.ws = null;
        
        // Only attempt reconnect if we should
        if (this.shouldReconnect && this.userId) {
          this.attemptReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error('[SessionClient] WebSocket error:', error);
        // Don't set isConnecting to false here - let onclose handle it
      };
    } catch (error) {
      console.error('[SessionClient] Failed to create WebSocket:', error);
      this.isConnecting = false;
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts || !this.userId || !this.shouldReconnect) {
      console.log('[SessionClient] Stopping reconnect attempts');
      return;
    }

    // Cancel any existing reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`[SessionClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      if (this.userId && this.shouldReconnect && !this.isConnecting) {
        this.isConnecting = false; // Reset to allow connect()
        this.connect(this.userId);
      }
    }, delay);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 10000); // Every 10 seconds
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private sendHeartbeat() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.userId) {
      this.ws.send(JSON.stringify({
        action: 'heartbeat',
        userId: this.userId,
      }));
    }
  }

  onEvent(callback: EventCallback) {
    this.eventCallbacks.push(callback);
    return () => {
      this.eventCallbacks = this.eventCallbacks.filter((cb) => cb !== callback);
    };
  }

  sendSignal(sessionId: string, type: 'offer' | 'answer' | 'ice-candidate', data: any, senderId: string, targetId?: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        action: 'sendSignal',
        sessionId,
        type,
        senderId,
        targetId,
        data,
      }));
    }
  }

  joinScheduledSession(sessionId: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('[SessionClient] Joining scheduled session:', sessionId);
      this.ws.send(JSON.stringify({
        action: 'joinScheduledSession',
        sessionId,
      }));
    } else {
      console.error('[SessionClient] Cannot join session - WebSocket not connected');
    }
  }

  getUserId(): string | null {
    return this.userId;
  }

  disconnect() {
    console.log('[SessionClient] Disconnecting...');
    this.shouldReconnect = false;
    this.stopHeartbeat();
    
    // Cancel any pending reconnect
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.userId = null;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

export const sessionClient = new SessionClient();
