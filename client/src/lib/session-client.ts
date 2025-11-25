// Session client for WebSocket communication
// Uses direct WebSocket since River client requires more complex setup

export interface PartnerInfo {
  id: string;
  username: string | null;
  profileImageUrl: string | null;
}

export interface SessionEvent {
  type: 'matched' | 'partner-disconnected' | 'invite-received' | 'invite-response' | 'signal';
  sessionId?: string;
  partner?: PartnerInfo;
  inviter?: PartnerInfo;
  accepted?: boolean;
  signal?: {
    type: 'offer' | 'answer' | 'ice-candidate';
    sessionId: string;
    data: any;
  };
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

  connect(userId: string) {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.userId = userId;
    this.isConnecting = true;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/river?userId=${userId}`;

    console.log('[SessionClient] Connecting to:', wsUrl);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[SessionClient] Connected');
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

      this.ws.onclose = () => {
        console.log('[SessionClient] Disconnected');
        this.isConnecting = false;
        this.stopHeartbeat();
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('[SessionClient] WebSocket error:', error);
        this.isConnecting = false;
      };
    } catch (error) {
      console.error('[SessionClient] Failed to create WebSocket:', error);
      this.isConnecting = false;
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts || !this.userId) {
      console.log('[SessionClient] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`[SessionClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      if (this.userId) {
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
      // For now, just send a ping - the server handles via River RPC
      // This keeps the connection alive
    }
  }

  onEvent(callback: EventCallback) {
    this.eventCallbacks.push(callback);
    return () => {
      this.eventCallbacks = this.eventCallbacks.filter((cb) => cb !== callback);
    };
  }

  sendSignal(sessionId: string, type: 'offer' | 'answer' | 'ice-candidate', data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        action: 'sendSignal',
        sessionId,
        type,
        data,
      }));
    }
  }

  disconnect() {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.userId = null;
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnect
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

export const sessionClient = new SessionClient();
