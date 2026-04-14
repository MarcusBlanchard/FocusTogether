import { storage } from "./storage";
import type { User } from "@shared/schema";

export type SessionState = 'idle' | 'waiting' | 'matched' | 'in-session';
export type SessionType = 'solo' | 'group' | 'freeRoom';

export interface UserSession {
  id: string;
  state: SessionState;
  sessionId?: string;
  partnerId?: string;
  lastHeartbeat: number;
  sessionType?: SessionType;
}

export interface ActiveMatch {
  sessionId: string;
  user1Id: string;
  user2Id: string;
  state: 'matched' | 'in-session';
  startedAt: Date;
}

export interface RoomSession {
  sessionId: string;
  sessionType: SessionType;
  participantIds: string[];
  maxCapacity: number;
  state: 'waiting' | 'ready' | 'in-session';
  startedAt: Date;
  title?: string;
  hostId: string;
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
  private groupQueue: string[] = []; // Queue for group sessions
  private userSessions: Map<string, UserSession> = new Map();
  private activeMatches: Map<string, ActiveMatch> = new Map();
  private roomSessions: Map<string, RoomSession> = new Map(); // Multi-participant rooms
  private pendingInvites: Map<string, PendingInvite> = new Map();
  private eventCallback: EventCallback | null = null;
  
  // Desktop app activity tracking: userId -> { sessionId, joinedAt }
  // This is the source of truth for "is user in an active session" for desktop polling
  private activeDesktopSessions: Map<string, { sessionId: string; joinedAt: Date }> = new Map();
  
  /**
   * Latest browser-tab distraction from the Chrome extension (domain only).
   * Cleared when the desktop app reports a native foreground app (user left the browser)
   * so Chess→Chrome doesn't reuse a stale tab from before Chess.
   */
  private userBrowserDistraction: Map<string, { domain: string }> = new Map();

  // Pending alerts for desktop app notifications: userId -> alerts[]
  private pendingAlerts: Map<string, Array<{
    type: 'participant-activity';
    alertingUserId: string;
    alertingUsername: string | null;
    alertingFirstName: string | null;
    status: 'idle' | 'distracted' | 'active';
    sessionId: string;
    timestamp: string;
  }>> = new Map();

  private readonly HEARTBEAT_TIMEOUT = 30000; // 30 seconds
  private readonly SESSION_GRACE_PERIOD = 5; // 5 minutes grace period for late joiners
  private readonly SESSION_END_GRACE_PERIOD = 10; // 10 minutes grace period after scheduled end time
  private cleanupInterval: NodeJS.Timeout | null = null;
  private sessionWatchdogInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanupStaleConnections(), 10000);
    // Start session watchdog to expire lonely sessions (every 30 seconds)
    this.sessionWatchdogInterval = setInterval(() => this.expireLonelySessions(), 30000);
  }

  setEventCallback(callback: EventCallback) {
    this.eventCallback = callback;
  }

  private async emit(userId: string, event: any) {
    if (this.eventCallback) {
      this.eventCallback(userId, event);
    }

    // Create notifications for important events
    try {
      let notificationData = null;

      switch (event.type) {
        case 'matched':
          notificationData = {
            userId,
            type: 'match_found',
            title: 'Match Found!',
            message: `You've been matched with ${event.partner?.username || 'a partner'} for a focus session`,
            read: 0,
            relatedUserId: event.partner?.userId || null,
            sessionId: event.sessionId || null,
          };
          break;

        case 'participant-joined':
          if (event.participant?.userId !== userId) {
            notificationData = {
              userId,
              type: 'partner_joined',
              title: 'Partner Joined',
              message: `${event.participant?.username || 'Someone'} joined your session`,
              read: 0,
              relatedUserId: event.participant?.userId || null,
              sessionId: event.sessionId || null,
            };
          }
          break;

        case 'participant-left':
        case 'partner-disconnected':
          if (event.participant?.userId !== userId) {
            notificationData = {
              userId,
              type: 'partner_left',
              title: 'Partner Left',
              message: `${event.participant?.username || event.partnerUsername || 'Your partner'} left the session`,
              read: 0,
              relatedUserId: event.participant?.userId || null,
              sessionId: event.sessionId || null,
            };
          }
          break;
      }

      if (notificationData) {
        await storage.createNotification(notificationData);
      }
    } catch (error) {
      console.error('[SessionManager] Failed to create notification:', error);
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

  // Join the random matching queue with session type
  async joinQueue(userId: string, sessionType: SessionType = 'solo'): Promise<{ status: 'joined' | 'already-in-queue' | 'already-matched'; position?: number; sessionId?: string }> {
    this.registerUser(userId);
    const session = this.userSessions.get(userId)!;

    if (session.state === 'waiting') {
      const queue = sessionType === 'group' ? this.groupQueue : this.waitingQueue;
      return { status: 'already-in-queue', position: queue.indexOf(userId) + 1 };
    }

    if (session.state === 'matched' || session.state === 'in-session') {
      return { status: 'already-matched' };
    }

    session.state = 'waiting';
    session.sessionType = sessionType;

    if (sessionType === 'group') {
      this.groupQueue.push(userId);
      console.log(`[SessionManager] User ${userId} joined group queue. Queue size: ${this.groupQueue.length}`);
      // Try to create/join group session
      const result = await this.tryMatchGroup(userId);
      if (result.sessionId) {
        return { status: 'joined', sessionId: result.sessionId };
      }
      return { status: 'joined', position: this.groupQueue.indexOf(userId) + 1 };
    } else {
      // Solo matching
      this.waitingQueue.push(userId);
      console.log(`[SessionManager] User ${userId} joined solo queue. Queue size: ${this.waitingQueue.length}`);
      await this.tryMatch();
      return { status: 'joined', position: this.waitingQueue.indexOf(userId) + 1 };
    }
  }

  // Leave the queue
  leaveQueue(userId: string): boolean {
    const session = this.userSessions.get(userId);
    if (!session || session.state !== 'waiting') {
      return false;
    }

    // Remove from appropriate queue
    const soloIndex = this.waitingQueue.indexOf(userId);
    if (soloIndex > -1) {
      this.waitingQueue.splice(soloIndex, 1);
    }
    const groupIndex = this.groupQueue.indexOf(userId);
    if (groupIndex > -1) {
      this.groupQueue.splice(groupIndex, 1);
    }
    
    session.state = 'idle';
    session.sessionType = undefined;
    console.log(`[SessionManager] User ${userId} left queue`);
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
            userId: user2.id,
            username: user2.username,
            profileImageUrl: user2.profileImageUrl,
          },
        });

        this.emit(user2Id, {
          type: 'matched',
          sessionId,
          partner: {
            userId: user1.id,
            username: user1.username,
            profileImageUrl: user1.profileImageUrl,
          },
        });
      }

      console.log(`[SessionManager] Matched users ${user1Id} and ${user2Id} in session ${sessionId}`);
    }
  }

  // Try to match users for group sessions (2-5 participants)
  private async tryMatchGroup(userId: string): Promise<{ sessionId?: string }> {
    // Look for existing waiting group rooms with space
    for (const [sessionId, room] of Array.from(this.roomSessions.entries())) {
      if (
        room.sessionType === 'group' &&
        room.state === 'waiting' &&
        room.participantIds.length < room.maxCapacity &&
        !room.participantIds.includes(userId)
      ) {
        // Join this room
        await this.joinRoom(userId, sessionId);
        return { sessionId };
      }
    }

    // Create a new group room if we have enough people waiting (2-5)
    if (this.groupQueue.length >= 2) {
      const participants = this.groupQueue.splice(0, Math.min(5, this.groupQueue.length));
      const sessionId = this.generateSessionId();
      const hostId = participants[0];

      const room: RoomSession = {
        sessionId,
        sessionType: 'group',
        participantIds: participants,
        maxCapacity: 5,
        state: 'ready',
        startedAt: new Date(),
        hostId,
      };

      this.roomSessions.set(sessionId, room);

      // Update all participants
      for (const participantId of participants) {
        const session = this.userSessions.get(participantId);
        if (session) {
          session.state = 'matched';
          session.sessionId = sessionId;
        }
      }

      // Fetch all participant info
      const participantsInfo = await Promise.all(
        participants.map(id => storage.getUser(id))
      );

      // Notify all participants
      for (const participantId of participants) {
        const otherParticipants = participantsInfo
          .filter(p => p && p.id !== participantId)
          .map(p => ({
            id: p!.id,
            username: p!.username,
            profileImageUrl: p!.profileImageUrl,
          }));

        this.emit(participantId, {
          type: 'matched',
          sessionId,
          sessionType: 'group',
          participants: otherParticipants,
        });
      }

      console.log(`[SessionManager] Created group session ${sessionId} with ${participants.length} participants`);
      return { sessionId };
    }

    return {};
  }

  // Create a free room
  async createFreeRoom(userId: string, title?: string): Promise<{ sessionId: string }> {
    this.registerUser(userId);
    const sessionId = this.generateSessionId();

    const room: RoomSession = {
      sessionId,
      sessionType: 'freeRoom',
      participantIds: [userId],
      maxCapacity: 10,
      state: 'waiting',
      startedAt: new Date(),
      title: title || 'Free Room',
      hostId: userId,
    };

    this.roomSessions.set(sessionId, room);

    const session = this.userSessions.get(userId)!;
    session.state = 'in-session';
    session.sessionId = sessionId;
    session.sessionType = 'freeRoom';

    console.log(`[SessionManager] Created free room ${sessionId} by user ${userId}`);
    return { sessionId };
  }

  // Join a free room
  async joinFreeRoom(userId: string, sessionId: string): Promise<{ success: boolean; participants?: any[] }> {
    const room = this.roomSessions.get(sessionId);
    if (!room || room.sessionType !== 'freeRoom') {
      return { success: false };
    }

    if (room.participantIds.length >= room.maxCapacity) {
      return { success: false };
    }

    if (room.participantIds.includes(userId)) {
      return { success: false };
    }

    await this.joinRoom(userId, sessionId);
    return { success: true };
  }

  // Helper: Join a room
  private async joinRoom(userId: string, sessionId: string) {
    const room = this.roomSessions.get(sessionId);
    if (!room) return;

    room.participantIds.push(userId);

    this.registerUser(userId);
    const session = this.userSessions.get(userId)!;
    session.state = 'in-session';
    session.sessionId = sessionId;
    session.sessionType = room.sessionType;

    // Get all participants info
    const participantsInfo = await Promise.all(
      room.participantIds.map(id => storage.getUser(id))
    );

    const newUser = await storage.getUser(userId);

    // Notify existing participants about new user
    for (const participantId of room.participantIds) {
      if (participantId !== userId && newUser) {
        this.emit(participantId, {
          type: 'participant-joined',
          sessionId,
          participant: {
            userId: newUser.id,
            username: newUser.username,
            profileImageUrl: newUser.profileImageUrl,
          },
        });
      }
    }

    // Notify new user about existing participants
    const otherParticipants = participantsInfo
      .filter(p => p && p.id !== userId)
      .map(p => ({
        userId: p!.id,
        username: p!.username,
        profileImageUrl: p!.profileImageUrl,
      }));

    this.emit(userId, {
      type: 'room-joined',
      sessionId,
      sessionType: room.sessionType,
      participants: otherParticipants,
    });

    console.log(`[SessionManager] User ${userId} joined room ${sessionId}. Total: ${room.participantIds.length}`);
  }

  // Join a scheduled session (creates room in memory if needed)
  async joinScheduledSession(userId: string, sessionId: string): Promise<{ success: boolean; participants?: Array<{ userId: string; username: string | null; profileImageUrl: string | null }>; error?: string }> {
    console.log(`[SessionManager] User ${userId} joining scheduled session ${sessionId}`);
    
    // Check if room already exists in memory
    let room = this.roomSessions.get(sessionId);
    
    if (!room) {
      // Look up the scheduled session from database
      const scheduledSession = await storage.getScheduledSession(sessionId);
      if (!scheduledSession) {
        console.log(`[SessionManager] Scheduled session ${sessionId} not found`);
        return { success: false, error: 'Session not found' };
      }
      
      // Check if the session is active (started but not ended)
      const now = new Date();
      const startTime = new Date(scheduledSession.startAt);
      const endTime = new Date(scheduledSession.endAt);
      
      if (now < startTime) {
        console.log(`[SessionManager] Session ${sessionId} hasn't started yet`);
        return { success: false, error: 'Session has not started yet' };
      }
      
      if (now > endTime) {
        console.log(`[SessionManager] Session ${sessionId} has ended`);
        return { success: false, error: 'Session has ended' };
      }
      
      // Create the room in memory
      room = {
        sessionId,
        sessionType: scheduledSession.sessionType === 'solo' ? 'solo' : 'group',
        participantIds: [],
        maxCapacity: scheduledSession.capacity,
        state: 'in-session',
        startedAt: startTime,
        title: scheduledSession.title || undefined,
        hostId: scheduledSession.hostId,
      };
      
      this.roomSessions.set(sessionId, room);
      console.log(`[SessionManager] Created room for scheduled session ${sessionId}`);
    }
    
    // Check if user is already in the room
    if (room.participantIds.includes(userId)) {
      console.log(`[SessionManager] User ${userId} already in session ${sessionId}`);
      // Return current participants
      const participantsInfo = await Promise.all(
        room.participantIds.map(id => storage.getUser(id))
      );
      
      return {
        success: true,
        participants: participantsInfo
          .filter(p => p && p.id !== userId)
          .map(p => ({
            userId: p!.id,
            username: p!.username,
            profileImageUrl: p!.profileImageUrl,
          })),
      };
    }
    
    // Add user to room
    await this.joinRoom(userId, sessionId);
    
    // Get current participants to return
    const participantsInfo = await Promise.all(
      room.participantIds.map(id => storage.getUser(id))
    );
    
    return {
      success: true,
      participants: participantsInfo
        .filter(p => p && p.id !== userId)
        .map(p => ({
          userId: p!.id,
          username: p!.username,
          profileImageUrl: p!.profileImageUrl,
        })),
    };
  }

  // Get available free rooms
  getFreeRooms(): Array<{ sessionId: string; title: string; participantCount: number; maxCapacity: number; hostId: string }> {
    const rooms: Array<{ sessionId: string; title: string; participantCount: number; maxCapacity: number; hostId: string }> = [];

    for (const [sessionId, room] of Array.from(this.roomSessions.entries())) {
      if (room.sessionType === 'freeRoom' && room.participantIds.length < room.maxCapacity) {
        rooms.push({
          sessionId,
          title: room.title || 'Free Room',
          participantCount: room.participantIds.length,
          maxCapacity: room.maxCapacity,
          hostId: room.hostId,
        });
      }
    }

    return rooms;
  }

  // Get participants in a room
  async getRoomParticipants(sessionId: string): Promise<User[]> {
    const room = this.roomSessions.get(sessionId);
    if (!room) return [];

    const participants = await Promise.all(
      room.participantIds.map(id => storage.getUser(id))
    );

    return participants.filter((p): p is User => p !== null);
  }

  // Get all participant IDs in a session (for signaling)
  getSessionParticipantIds(sessionId: string): string[] {
    const room = this.roomSessions.get(sessionId);
    if (room) {
      return room.participantIds;
    }

    const match = this.activeMatches.get(sessionId);
    if (match) {
      return [match.user1Id, match.user2Id];
    }

    return [];
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

  // End a session (handles both 1-on-1 and room sessions)
  async endSession(sessionId: string, initiatorId?: string) {
    // Check if it's a room session
    const room = this.roomSessions.get(sessionId);
    if (room) {
      // Room session - remove all participants
      for (const participantId of room.participantIds) {
        const session = this.userSessions.get(participantId);
        if (session) {
          session.state = 'idle';
          session.sessionId = undefined;
          session.sessionType = undefined;
        }

        // Clear pending alerts for this participant
        this.pendingAlerts.delete(participantId);

        // Notify other participants
        if (participantId !== initiatorId) {
          this.emit(participantId, {
            type: 'room-ended',
            sessionId,
          });
        }
      }

      this.roomSessions.delete(sessionId);
      console.log(`[SessionManager] Room session ${sessionId} ended (pending alerts cleared)`);
      return;
    }

    // 1-on-1 session
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
      session1.sessionType = undefined;
    }
    if (session2) {
      session2.state = 'idle';
      session2.sessionId = undefined;
      session2.partnerId = undefined;
      session2.sessionType = undefined;
    }

    // Clear pending alerts for both users to prevent stale notifications
    this.pendingAlerts.delete(match.user1Id);
    this.pendingAlerts.delete(match.user2Id);

    this.activeMatches.delete(sessionId);
    console.log(`[SessionManager] Session ${sessionId} ended (pending alerts cleared)`);
  }

  // Leave a room (for multi-participant sessions)
  async leaveRoom(userId: string, sessionId: string) {
    const room = this.roomSessions.get(sessionId);
    if (!room) return;

    const index = room.participantIds.indexOf(userId);
    if (index === -1) return;

    room.participantIds.splice(index, 1);

    const session = this.userSessions.get(userId);
    if (session) {
      session.state = 'idle';
      session.sessionId = undefined;
      session.sessionType = undefined;
    }

    // Clear pending alerts for the leaving user
    this.pendingAlerts.delete(userId);

    const user = await storage.getUser(userId);

    // Notify remaining participants
    for (const participantId of room.participantIds) {
      if (user) {
        this.emit(participantId, {
          type: 'participant-left',
          sessionId,
          participant: {
            userId: user.id,
            username: user.username,
          },
        });
      }
    }

    // If room is empty, delete it
    if (room.participantIds.length === 0) {
      this.roomSessions.delete(sessionId);
      console.log(`[SessionManager] Room ${sessionId} deleted (empty)`);
    } else {
      console.log(`[SessionManager] User ${userId} left room ${sessionId}. Remaining: ${room.participantIds.length}`);
    }
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

    // Clear pending alerts for this user
    this.pendingAlerts.delete(userId);
    this.userBrowserDistraction.delete(userId);

    this.userSessions.delete(userId);
    console.log(`[SessionManager] User ${userId} disconnected (pending alerts cleared)`);
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

  // Expire sessions where no one joined within grace period
  private async expireLonelySessions() {
    try {
      const expirableSessions = await storage.getExpirableSessions(this.SESSION_GRACE_PERIOD);
      
      for (const session of expirableSessions) {
        console.log(`[SessionManager] Expiring lonely session ${session.id} - no one joined within ${this.SESSION_GRACE_PERIOD} minutes`);
        
        // Update session status to 'expired' in database
        await storage.updateScheduledSessionStatus(session.id, 'expired');
        
        // Get participants to notify (should be just the host)
        const participants = await storage.getSessionParticipants(session.id);
        
        // Collect unique user IDs to notify - include host explicitly
        const userIdsToNotify = new Set<string>();
        userIdsToNotify.add(session.hostId); // Always notify the host
        for (const participant of participants) {
          userIdsToNotify.add(participant.id);
        }
        
        // Create notification for each user
        const userIdsArray = Array.from(userIdsToNotify);
        for (const userId of userIdsArray) {
          // Emit real-time event if user is connected
          this.emit(userId, {
            type: 'session-expired',
            sessionId: session.id,
            reason: 'no-participants',
          });
          
          // Create persistent notification
          await storage.createNotification({
            userId,
            type: 'session_expired',
            title: 'Session Expired',
            message: 'No one joined your session within 5 minutes. Try booking another time!',
            read: 0,
            sessionId: session.id,
          });
        }
        
        // Clean up room from memory if exists
        const room = this.roomSessions.get(session.id);
        if (room) {
          for (const participantId of room.participantIds) {
            const userSession = this.userSessions.get(participantId);
            if (userSession) {
              userSession.state = 'idle';
              userSession.sessionId = undefined;
              userSession.sessionType = undefined;
            }
          }
          this.roomSessions.delete(session.id);
        }
      }
    } catch (error) {
      console.error('[SessionManager] Error expiring lonely sessions:', error);
    }
  }

  // Notify participants of session updates (for real-time UI refresh)
  async notifySessionUpdate(sessionId: string, excludeUserId?: string) {
    try {
      const participants = await storage.getSessionParticipants(sessionId);
      const session = await storage.getScheduledSession(sessionId);
      
      for (const participant of participants) {
        if (excludeUserId && participant.id === excludeUserId) continue;
        
        this.emit(participant.id, {
          type: 'session-updated',
          sessionId,
          status: session?.status,
        });
      }
    } catch (error) {
      console.error('[SessionManager] Error notifying session update:', error);
    }
  }

  // Notify participants when someone cancels their booking
  async notifyPartnerCancelled(sessionId: string, cancelledByUser: User, remainingUserIds: string[]) {
    try {
      const cancelledName = cancelledByUser.firstName && cancelledByUser.lastName 
        ? `${cancelledByUser.firstName} ${cancelledByUser.lastName}`
        : cancelledByUser.username || 'Your partner';

      for (const userId of remainingUserIds) {
        // Send real-time WebSocket event
        this.emit(userId, {
          type: 'partner-cancelled',
          sessionId,
          cancelledBy: {
            id: cancelledByUser.id,
            username: cancelledByUser.username,
            firstName: cancelledByUser.firstName,
            lastName: cancelledByUser.lastName,
          },
        });

        // Create persistent notification
        await storage.createNotification({
          userId,
          type: 'partner_canceled',
          title: 'Partner Cancelled',
          message: `${cancelledName} cancelled their booking for your session`,
          read: 0,
          relatedUserId: cancelledByUser.id,
          sessionId,
        });
      }
    } catch (error) {
      console.error('[SessionManager] Error notifying partner cancelled:', error);
    }
  }

  // Notify user when they've been auto-rematched after original partner cancelled
  async notifyAutoRematched(
    userId: string, 
    originalSessionId: string,
    newSessionId: string, 
    cancelledByUser: User,
    newMatchUser: User
  ) {
    try {
      const cancelledName = cancelledByUser.firstName && cancelledByUser.lastName 
        ? `${cancelledByUser.firstName} ${cancelledByUser.lastName}`
        : cancelledByUser.username || 'Your partner';
      
      const newMatchName = newMatchUser.firstName && newMatchUser.lastName 
        ? `${newMatchUser.firstName} ${newMatchUser.lastName}`
        : newMatchUser.username || 'someone new';

      // Send real-time WebSocket event
      this.emit(userId, {
        type: 'auto-rematched',
        originalSessionId,
        newSessionId,
        cancelledBy: {
          id: cancelledByUser.id,
          username: cancelledByUser.username,
        },
        newMatch: {
          id: newMatchUser.id,
          username: newMatchUser.username,
          firstName: newMatchUser.firstName,
          lastName: newMatchUser.lastName,
        },
      });

      // Create persistent notification
      await storage.createNotification({
        userId,
        type: 'auto_rematched',
        title: 'Auto-Rematched',
        message: `${cancelledName} cancelled, so we automatically matched you with ${newMatchName}`,
        read: 0,
        relatedUserId: newMatchUser.id,
        sessionId: newSessionId,
      });
    } catch (error) {
      console.error('[SessionManager] Error notifying auto-rematch:', error);
    }
  }

  // Notify when someone joins a session (match found)
  async notifyMatchFound(sessionId: string, joiningUser: User, existingParticipantIds: string[]) {
    try {
      const joiningName = joiningUser.firstName && joiningUser.lastName 
        ? `${joiningUser.firstName} ${joiningUser.lastName}`
        : joiningUser.username || 'Someone';

      for (const userId of existingParticipantIds) {
        if (userId === joiningUser.id) continue;

        // Send real-time WebSocket event
        this.emit(userId, {
          type: 'match-found',
          sessionId,
          partner: {
            id: joiningUser.id,
            username: joiningUser.username,
            firstName: joiningUser.firstName,
            lastName: joiningUser.lastName,
            profileImageUrl: joiningUser.profileImageUrl,
          },
        });

        // Create persistent notification
        await storage.createNotification({
          userId,
          type: 'match_found',
          title: 'Match Found!',
          message: `${joiningName} matched with your session`,
          read: 0,
          relatedUserId: joiningUser.id,
          sessionId,
        });
      }
    } catch (error) {
      console.error('[SessionManager] Error notifying match found:', error);
    }
  }

  // Notify session partners about a distraction alert
  async notifyDistractionAlert(
    sessionId: string,
    alertingUserId: string,
    alertType: 'idle' | 'distracting_apps',
    alertData: { idleSeconds?: number; apps?: string[] }
  ) {
    try {
      // Get all participants in the session
      const participants = await storage.getSessionParticipants(sessionId);
      const alertingUser = await storage.getUser(alertingUserId);

      if (!alertingUser) {
        console.error('[SessionManager] Alerting user not found:', alertingUserId);
        return;
      }

      const alertingName = alertingUser.firstName && alertingUser.lastName
        ? `${alertingUser.firstName} ${alertingUser.lastName}`
        : alertingUser.username || 'Your partner';

      let title = '';
      let message = '';

      if (alertType === 'idle' && alertData.idleSeconds) {
        const minutes = Math.floor(alertData.idleSeconds / 60);
        title = 'Partner Inactive';
        message = `${alertingName} has been inactive for ${minutes} minute${minutes !== 1 ? 's' : ''}`;
      } else if (alertType === 'distracting_apps' && alertData.apps) {
        const appList = alertData.apps.slice(0, 3).join(', ');
        const moreApps = alertData.apps.length > 3 ? ` and ${alertData.apps.length - 3} more` : '';
        title = 'Partner Distracted';
        message = `${alertingName} has distracting apps open: ${appList}${moreApps}`;
      }

      // Notify all other participants
      for (const participant of participants) {
        if (participant.id === alertingUserId) continue;

        // Send real-time WebSocket event
        this.emit(participant.id, {
          type: 'distraction-alert',
          sessionId,
          alertingUser: {
            id: alertingUser.id,
            username: alertingUser.username,
            firstName: alertingUser.firstName,
            lastName: alertingUser.lastName,
            profileImageUrl: alertingUser.profileImageUrl,
          },
          alertType,
          alertData,
        });

        // Create persistent notification
        await storage.createNotification({
          userId: participant.id,
          type: 'distraction_alert',
          title,
          message,
          read: 0,
          relatedUserId: alertingUserId,
          sessionId,
        });
      }
    } catch (error) {
      console.error('[SessionManager] Error notifying distraction alert:', error);
    }
  }

  // Notify a user that they were removed as a friend
  async notifyFriendRemoved(removedUserId: string, removedByUserId: string) {
    try {
      const removedByUser = await storage.getUser(removedByUserId);
      
      if (!removedByUser) {
        console.error('[SessionManager] User who removed friend not found:', removedByUserId);
        return;
      }

      const removedByName = removedByUser.firstName && removedByUser.lastName
        ? `${removedByUser.firstName} ${removedByUser.lastName}`
        : removedByUser.username || 'Someone';

      // Send real-time WebSocket event
      this.emit(removedUserId, {
        type: 'friend-removed',
        removedBy: {
          id: removedByUser.id,
          username: removedByUser.username,
          firstName: removedByUser.firstName,
          lastName: removedByUser.lastName,
          profileImageUrl: removedByUser.profileImageUrl,
        },
      });

      // Create persistent notification
      await storage.createNotification({
        userId: removedUserId,
        type: 'friend_removed',
        title: 'Friend Removed',
        message: `${removedByName} removed you as a friend`,
        read: 0,
        relatedUserId: removedByUserId,
      });

      console.log(`[SessionManager] Notified ${removedUserId} that ${removedByUserId} removed them as a friend`);
    } catch (error) {
      console.error('[SessionManager] Error notifying friend removal:', error);
    }
  }

  // ============================================
  // Desktop Activity Session Tracking (for polling)
  // ============================================

  // Called when user joins a focus session (from web app)
  setUserActiveSession(userId: string, sessionId: string) {
    this.activeDesktopSessions.set(userId, {
      sessionId,
      joinedAt: new Date(),
    });
    console.log(`[SessionManager] User ${userId} joined session ${sessionId} (desktop tracking)`);
  }

  // Called when user leaves a focus session (from web app)
  clearUserActiveSession(userId: string) {
    const session = this.activeDesktopSessions.get(userId);
    if (session) {
      console.log(`[SessionManager] User ${userId} left session ${session.sessionId} (desktop tracking)`);
      this.activeDesktopSessions.delete(userId);
      // Clear any pending alerts to prevent stale notifications in future sessions
      this.pendingAlerts.delete(userId);
      console.log(`[SessionManager] Cleared pending alerts for user ${userId}`);
    }
  }

  // Called by desktop app to check if user is in an active session
  getUserActiveSession(userId: string): { sessionId: string; joinedAt: Date } | null {
    return this.activeDesktopSessions.get(userId) || null;
  }

  /** Extension: set/clear distracting domain for session polling. */
  reportBrowserForegroundDomain(userId: string, domain: string, isDistracting: boolean): void {
    const d = domain.trim().toLowerCase();
    if (!d || !isDistracting) {
      this.userBrowserDistraction.delete(userId);
      return;
    }
    this.userBrowserDistraction.set(userId, { domain: d });
  }

  /** Desktop: user focused a native app — drop stale browser tab distraction. */
  clearBrowserForegroundDistraction(userId: string): void {
    this.userBrowserDistraction.delete(userId);
  }

  getCurrentBrowserDistraction(userId: string): { domain: string } | null {
    return this.userBrowserDistraction.get(userId) ?? null;
  }

  // Check if a user is in any active session (for validation)
  isUserInActiveSession(userId: string): boolean {
    return this.activeDesktopSessions.has(userId);
  }
  
  // Queue an alert for a user's desktop app to receive
  queueAlertForUser(
    userId: string, 
    alert: {
      type: 'participant-activity';
      alertingUserId: string;
      alertingUsername: string | null;
      alertingFirstName: string | null;
      status: 'idle' | 'distracted' | 'active';
      sessionId: string;
      timestamp: string;
    }
  ) {
    // Only queue idle/distracted alerts, not "active" (returning to focus)
    if (alert.status === 'active') return;

    const alerts = this.pendingAlerts.get(userId) || [];
    // Deduplicate: keep only one alert per (alertingUserId, status) so repeated
    // activity updates (e.g. web + desktop) don't queue multiple blue notifications
    const filtered = alerts.filter(
      (a) => !(a.alertingUserId === alert.alertingUserId && a.status === alert.status)
    );
    filtered.push(alert);
    const capped = filtered.length > 10 ? filtered.slice(-10) : filtered;
    this.pendingAlerts.set(userId, capped);
    console.log(`[SessionManager] Queued ${alert.status} alert for user ${userId} from ${alert.alertingUserId} (session: ${alert.sessionId})`);
  }
  
  // Get and clear pending alerts for a user (called when desktop app polls)
  getPendingAlerts(userId: string): Array<{
    type: 'participant-activity';
    alertingUserId: string;
    alertingUsername: string | null;
    alertingFirstName: string | null;
    status: 'idle' | 'distracted' | 'active';
    sessionId: string;
    timestamp: string;
  }> {
    const alerts = this.pendingAlerts.get(userId) || [];
    
    // Log before clearing
    if (alerts.length > 0) {
      console.log(`[SessionManager] getPendingAlerts for ${userId}: ${alerts.length} raw alerts`);
    }
    
    this.pendingAlerts.delete(userId); // Clear after retrieval
    
    // Filter to only return alerts for the user's CURRENT session
    // This prevents stale alerts from previous sessions
    const currentSession = this.activeDesktopSessions.get(userId);
    if (!currentSession) {
      // User not in a session - don't return any alerts
      if (alerts.length > 0) {
        console.log(`[SessionManager] ⚠️ User ${userId} has ${alerts.length} alerts but NO active session in activeDesktopSessions - dropping alerts!`);
      }
      return [];
    }
    
    const filtered = alerts.filter(alert => alert.sessionId === currentSession.sessionId);
    
    if (alerts.length > 0) {
      console.log(`[SessionManager] User ${userId} session: ${currentSession.sessionId}`);
      console.log(`[SessionManager] Alerts session IDs: ${alerts.map(a => a.sessionId).join(', ')}`);
      console.log(`[SessionManager] After filter: ${filtered.length} alerts (dropped ${alerts.length - filtered.length})`);
    }
    
    return filtered;
  }

  // Destroy the manager (for cleanup)
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.sessionWatchdogInterval) {
      clearInterval(this.sessionWatchdogInterval);
    }
  }
}

export const sessionManager = new SessionManager();
