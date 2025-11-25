import { storage } from "./storage";
import type { User } from "@shared/schema";

export type SessionState = 'idle' | 'waiting' | 'matched' | 'in-session';

export interface UserSession {
  id: string;
  state: SessionState;
  sessionId?: string;
  partnerId?: string;
  lastHeartbeat: number;
}

export interface ActiveMatch {
  sessionId: string;
  user1Id: string;
  user2Id: string;
  state: 'matched' | 'in-session';
  startedAt: Date;
}

export interface PendingInvite {
  inviterId: string;
  inviteeId: string;
  createdAt: number;
}

// Callback type for notifying clients of events
type EventCallback = (userId: string, event: any) => void;

class SessionManager {
  private waitingQueue: string[] = [];
  private userSessions: Map<string, UserSession> = new Map();
  private activeMatches: Map<string, ActiveMatch> = new Map();
  private pendingInvites: Map<string, PendingInvite> = new Map();
  private eventCallback: EventCallback | null = null;

  private readonly HEARTBEAT_TIMEOUT = 30000; // 30 seconds
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanupStaleConnections(), 10000);
  }

  setEventCallback(callback: EventCallback) {
    this.eventCallback = callback;
  }

  private emit(userId: string, event: any) {
    if (this.eventCallback) {
      this.eventCallback(userId, event);
    }
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Register a user as online
  registerUser(userId: string) {
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, {
        id: userId,
        state: 'idle',
        lastHeartbeat: Date.now(),
      });
    }
    console.log(`[SessionManager] User ${userId} registered`);
  }

  // Update heartbeat for a user
  heartbeat(userId: string): boolean {
    const session = this.userSessions.get(userId);
    if (session) {
      session.lastHeartbeat = Date.now();
      return true;
    }
    return false;
  }

  // Get user's current state
  getUserState(userId: string): SessionState {
    return this.userSessions.get(userId)?.state ?? 'idle';
  }

  // Check if user is online and idle (available for invite)
  isUserAvailable(userId: string): boolean {
    const session = this.userSessions.get(userId);
    return !!session && session.state === 'idle';
  }

  // Get online status for a list of user IDs
  getOnlineStatus(userIds: string[]): Map<string, { isOnline: boolean; isIdle: boolean }> {
    const result = new Map<string, { isOnline: boolean; isIdle: boolean }>();
    for (const userId of userIds) {
      const session = this.userSessions.get(userId);
      result.set(userId, {
        isOnline: !!session,
        isIdle: session?.state === 'idle',
      });
    }
    return result;
  }

  // Join the random matching queue
  async joinQueue(userId: string): Promise<{ status: 'joined' | 'already-in-queue' | 'already-matched'; position?: number }> {
    this.registerUser(userId);
    const session = this.userSessions.get(userId)!;

    if (session.state === 'waiting') {
      return { status: 'already-in-queue', position: this.waitingQueue.indexOf(userId) + 1 };
    }

    if (session.state === 'matched' || session.state === 'in-session') {
      return { status: 'already-matched' };
    }

    // Add to queue
    session.state = 'waiting';
    this.waitingQueue.push(userId);
    console.log(`[SessionManager] User ${userId} joined queue. Queue size: ${this.waitingQueue.length}`);

    // Try to match
    await this.tryMatch();

    return { status: 'joined', position: this.waitingQueue.indexOf(userId) + 1 };
  }

  // Leave the queue
  leaveQueue(userId: string): boolean {
    const session = this.userSessions.get(userId);
    if (!session || session.state !== 'waiting') {
      return false;
    }

    const index = this.waitingQueue.indexOf(userId);
    if (index > -1) {
      this.waitingQueue.splice(index, 1);
    }
    session.state = 'idle';
    console.log(`[SessionManager] User ${userId} left queue. Queue size: ${this.waitingQueue.length}`);
    return true;
  }

  // Try to match users in the queue
  private async tryMatch() {
    while (this.waitingQueue.length >= 2) {
      const user1Id = this.waitingQueue.shift()!;
      const user2Id = this.waitingQueue.shift()!;

      const sessionId = this.generateSessionId();
      
      // Create the match
      const match: ActiveMatch = {
        sessionId,
        user1Id,
        user2Id,
        state: 'matched',
        startedAt: new Date(),
      };
      this.activeMatches.set(sessionId, match);

      // Update user sessions
      const session1 = this.userSessions.get(user1Id)!;
      const session2 = this.userSessions.get(user2Id)!;
      
      session1.state = 'matched';
      session1.sessionId = sessionId;
      session1.partnerId = user2Id;
      
      session2.state = 'matched';
      session2.sessionId = sessionId;
      session2.partnerId = user1Id;

      // Create session in database
      try {
        await storage.createFocusSession({
          user1Id,
          user2Id,
        });
      } catch (error) {
        console.error('[SessionManager] Failed to create session in database:', error);
      }

      // Notify both users
      const [user1, user2] = await Promise.all([
        storage.getUser(user1Id),
        storage.getUser(user2Id),
      ]);

      if (user1 && user2) {
        this.emit(user1Id, {
          type: 'matched',
          sessionId,
          partner: {
            id: user2.id,
            username: user2.username,
            profileImageUrl: user2.profileImageUrl,
          },
        });

        this.emit(user2Id, {
          type: 'matched',
          sessionId,
          partner: {
            id: user1.id,
            username: user1.username,
            profileImageUrl: user1.profileImageUrl,
          },
        });
      }

      console.log(`[SessionManager] Matched users ${user1Id} and ${user2Id} in session ${sessionId}`);
    }
  }

  // Invite a friend to a session
  async inviteFriend(userId: string, friendId: string): Promise<{ status: 'sent' | 'offline' | 'busy'; friendId?: string }> {
    const friendSession = this.userSessions.get(friendId);
    
    if (!friendSession) {
      return { status: 'offline' };
    }

    if (friendSession.state !== 'idle') {
      return { status: 'busy' };
    }

    // Create pending invite
    const inviteKey = `${userId}_${friendId}`;
    this.pendingInvites.set(inviteKey, {
      inviterId: userId,
      inviteeId: friendId,
      createdAt: Date.now(),
    });

    // Notify the friend
    const inviter = await storage.getUser(userId);
    if (inviter) {
      this.emit(friendId, {
        type: 'invite-received',
        inviter: {
          id: inviter.id,
          username: inviter.username,
          profileImageUrl: inviter.profileImageUrl,
        },
      });
    }

    console.log(`[SessionManager] User ${userId} invited ${friendId}`);
    return { status: 'sent', friendId };
  }

  // Respond to a friend invite
  async respondToInvite(userId: string, inviterId: string, accept: boolean): Promise<{ success: boolean; sessionId?: string; partner?: User }> {
    const inviteKey = `${inviterId}_${userId}`;
    const invite = this.pendingInvites.get(inviteKey);

    if (!invite) {
      return { success: false };
    }

    this.pendingInvites.delete(inviteKey);

    if (!accept) {
      // Notify inviter of decline
      this.emit(inviterId, {
        type: 'invite-response',
        accepted: false,
      });
      return { success: true };
    }

    // Accept - create a session
    const sessionId = this.generateSessionId();
    
    const match: ActiveMatch = {
      sessionId,
      user1Id: inviterId,
      user2Id: userId,
      state: 'matched',
      startedAt: new Date(),
    };
    this.activeMatches.set(sessionId, match);

    // Update both users
    this.registerUser(inviterId);
    this.registerUser(userId);

    const inviterSession = this.userSessions.get(inviterId)!;
    const accepterSession = this.userSessions.get(userId)!;

    // Remove from queue if in queue
    this.leaveQueue(inviterId);
    this.leaveQueue(userId);

    inviterSession.state = 'matched';
    inviterSession.sessionId = sessionId;
    inviterSession.partnerId = userId;

    accepterSession.state = 'matched';
    accepterSession.sessionId = sessionId;
    accepterSession.partnerId = inviterId;

    // Create session in database
    try {
      await storage.createFocusSession({
        user1Id: inviterId,
        user2Id: userId,
      });
    } catch (error) {
      console.error('[SessionManager] Failed to create session in database:', error);
    }

    // Get partner info
    const [inviter, accepter] = await Promise.all([
      storage.getUser(inviterId),
      storage.getUser(userId),
    ]);

    // Notify inviter
    if (accepter) {
      this.emit(inviterId, {
        type: 'invite-response',
        accepted: true,
        sessionId,
        partner: {
          id: accepter.id,
          username: accepter.username,
          profileImageUrl: accepter.profileImageUrl,
        },
      });
    }

    console.log(`[SessionManager] Friend invite accepted: ${inviterId} and ${userId} in session ${sessionId}`);

    return { 
      success: true, 
      sessionId,
      partner: inviter,
    };
  }

  // Start the actual session (after WebRTC connected)
  startSession(sessionId: string): boolean {
    const match = this.activeMatches.get(sessionId);
    if (!match || match.state !== 'matched') {
      return false;
    }

    match.state = 'in-session';
    
    const session1 = this.userSessions.get(match.user1Id);
    const session2 = this.userSessions.get(match.user2Id);
    
    if (session1) session1.state = 'in-session';
    if (session2) session2.state = 'in-session';

    console.log(`[SessionManager] Session ${sessionId} started`);
    return true;
  }

  // End a session
  async endSession(sessionId: string, initiatorId?: string) {
    const match = this.activeMatches.get(sessionId);
    if (!match) return;

    // End session in database
    try {
      await storage.endFocusSession(sessionId);
    } catch (error) {
      console.error('[SessionManager] Failed to end session in database:', error);
    }

    // Notify partner if there's an initiator
    if (initiatorId) {
      const partnerId = match.user1Id === initiatorId ? match.user2Id : match.user1Id;
      this.emit(partnerId, {
        type: 'partner-disconnected',
        sessionId,
      });
    }

    // Reset both users
    const session1 = this.userSessions.get(match.user1Id);
    const session2 = this.userSessions.get(match.user2Id);

    if (session1) {
      session1.state = 'idle';
      session1.sessionId = undefined;
      session1.partnerId = undefined;
    }
    if (session2) {
      session2.state = 'idle';
      session2.sessionId = undefined;
      session2.partnerId = undefined;
    }

    this.activeMatches.delete(sessionId);
    console.log(`[SessionManager] Session ${sessionId} ended`);
  }

  // Handle user disconnect
  async disconnect(userId: string) {
    const session = this.userSessions.get(userId);
    if (!session) return;

    // Leave queue if waiting
    if (session.state === 'waiting') {
      this.leaveQueue(userId);
    }

    // End session if in one
    if (session.sessionId) {
      await this.endSession(session.sessionId, userId);
    }

    // Remove pending invites
    const inviteKeys = Array.from(this.pendingInvites.keys());
    for (const key of inviteKeys) {
      const invite = this.pendingInvites.get(key);
      if (invite && (invite.inviterId === userId || invite.inviteeId === userId)) {
        this.pendingInvites.delete(key);
      }
    }

    this.userSessions.delete(userId);
    console.log(`[SessionManager] User ${userId} disconnected`);
  }

  // Get the partner's ID for a user's current session
  getPartnerId(userId: string): string | undefined {
    const session = this.userSessions.get(userId);
    return session?.partnerId;
  }

  // Get partner ID by session ID for signaling
  getPartnerIdBySession(sessionId: string, userId: string): string | undefined {
    const match = this.activeMatches.get(sessionId);
    if (!match) return undefined;
    return match.user1Id === userId ? match.user2Id : match.user1Id;
  }

  // Get session ID for a user
  getSessionId(userId: string): string | undefined {
    const session = this.userSessions.get(userId);
    return session?.sessionId;
  }

  // Cleanup stale connections
  private async cleanupStaleConnections() {
    const now = Date.now();
    const staleUserIds: string[] = [];

    const userSessionEntries = Array.from(this.userSessions.entries());
    for (const [userId, session] of userSessionEntries) {
      if (now - session.lastHeartbeat > this.HEARTBEAT_TIMEOUT) {
        staleUserIds.push(userId);
      }
    }

    for (const userId of staleUserIds) {
      console.log(`[SessionManager] Cleaning up stale connection for user ${userId}`);
      await this.disconnect(userId);
    }
  }

  // Destroy the manager (for cleanup)
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

export const sessionManager = new SessionManager();
