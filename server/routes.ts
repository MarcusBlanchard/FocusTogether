import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { setupRiverServer } from "./river-server";
import { sessionManager } from "./session-manager";
import { AccessToken } from "livekit-server-sdk";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // TURN credentials endpoint - fetches fresh credentials from Metered.ca
  app.get('/api/turn-credentials', isAuthenticated, async (req: any, res) => {
    try {
      const apiKey = process.env.METERED_API_KEY;
      
      if (!apiKey) {
        // Fallback to STUN-only if no API key configured
        console.warn('[TURN] No METERED_API_KEY configured, using STUN-only fallback');
        return res.json({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' },
          ]
        });
      }

      // Fetch fresh TURN credentials from Metered.ca API
      const response = await fetch(
        `https://focussession.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`
      );
      
      if (!response.ok) {
        console.error('[TURN] Failed to fetch credentials:', response.status, response.statusText);
        throw new Error('Failed to fetch TURN credentials');
      }

      const iceServers = await response.json();
      console.log('[TURN] Fetched fresh credentials, servers:', iceServers.length);
      
      res.json({ iceServers });
    } catch (error) {
      console.error('[TURN] Error fetching credentials:', error);
      // Fallback to STUN-only
      res.json({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun.cloudflare.com:3478' },
        ]
      });
    }
  });

  // LiveKit token endpoint - generates room tokens for video sessions
  app.post('/api/livekit/token', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { sessionId } = req.body;

      if (!sessionId) {
        return res.status(400).json({ message: "Session ID is required" });
      }

      // Verify user is a participant of this session
      const isParticipant = await storage.isSessionParticipant(sessionId, userId);
      if (!isParticipant) {
        console.warn(`[LiveKit] Unauthorized access attempt: user ${userId} is not a participant of session ${sessionId}`);
        return res.status(403).json({ message: "You are not a participant of this session" });
      }

      const apiKey = process.env.LIVEKIT_API_KEY;
      const apiSecret = process.env.LIVEKIT_API_SECRET;

      if (!apiKey || !apiSecret) {
        console.error('[LiveKit] Missing API credentials');
        return res.status(500).json({ message: "LiveKit not configured" });
      }

      // Get user info for participant identity
      const user = await storage.getUser(userId);
      const participantName = user?.username || user?.firstName || `User ${userId.slice(0, 6)}`;

      // Create access token with room permissions
      const at = new AccessToken(apiKey, apiSecret, {
        identity: userId,
        name: participantName,
        ttl: '2h', // Token valid for 2 hours
      });

      // Grant permissions for this specific room (using sessionId as room name)
      at.addGrant({
        room: sessionId,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });

      const token = await at.toJwt();
      
      console.log(`[LiveKit] Generated token for user ${userId} in room ${sessionId}`);
      
      res.json({ 
        token,
        serverUrl: process.env.LIVEKIT_URL,
      });
    } catch (error) {
      console.error('[LiveKit] Error generating token:', error);
      res.status(500).json({ message: "Failed to generate LiveKit token" });
    }
  });

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Update username
  app.patch('/api/user/username', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { username } = req.body;

      if (!username || typeof username !== 'string' || username.length < 3) {
        return res.status(400).json({ message: "Username must be at least 3 characters" });
      }

      // Check if username is taken
      const existing = await storage.getUserByUsername(username);
      if (existing && existing.id !== userId) {
        return res.status(400).json({ message: "Username already taken" });
      }

      const user = await storage.updateUsername(userId, username);
      res.json(user);
    } catch (error) {
      console.error("Error updating username:", error);
      res.status(500).json({ message: "Failed to update username" });
    }
  });

  // Get user profile with statistics
  app.get('/api/user/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Get booking count (number of scheduled sessions user has participated in)
      const bookingCount = await storage.getUserBookingCount(userId);

      res.json({
        ...user,
        bookingCount,
      });
    } catch (error) {
      console.error("Error fetching user profile:", error);
      res.status(500).json({ message: "Failed to fetch user profile" });
    }
  });

  // Update user preferences
  app.patch('/api/user/preferences', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { preference } = req.body;

      if (!preference || !['desk', 'active', 'any'].includes(preference)) {
        return res.status(400).json({ message: "Invalid preference. Must be 'desk', 'active', or 'any'" });
      }

      const user = await storage.updateUserPreference(userId, preference);
      res.json(user);
    } catch (error) {
      console.error("Error updating user preferences:", error);
      res.status(500).json({ message: "Failed to update preferences" });
    }
  });

  // Search users by username
  app.get('/api/users/search', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const query = req.query.q as string;

      if (!query || query.length < 2) {
        return res.json([]);
      }

      const users = await storage.searchUsersByUsername(query, userId);
      res.json(users);
    } catch (error) {
      console.error("Error searching users:", error);
      res.status(500).json({ message: "Failed to search users" });
    }
  });

  // Get user's session history
  app.get('/api/sessions/history', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const sessions = await storage.getUserSessions(userId);

      // Enrich with partner info
      const enrichedSessions = await Promise.all(
        sessions.map(async (session) => {
          const partnerId = session.user1Id === userId ? session.user2Id : session.user1Id;
          const partner = await storage.getUser(partnerId);
          const isFriend = await storage.areFriends(userId, partnerId);
          
          return {
            ...session,
            partner: partner ? {
              id: partner.id,
              username: partner.username,
              profileImageUrl: partner.profileImageUrl,
            } : null,
            isFriend,
          };
        })
      );

      res.json(enrichedSessions);
    } catch (error) {
      console.error("Error fetching session history:", error);
      res.status(500).json({ message: "Failed to fetch session history" });
    }
  });

  // Get friends list
  app.get('/api/friends', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const friends = await storage.getFriends(userId);
      res.json(friends);
    } catch (error) {
      console.error("Error fetching friends:", error);
      res.status(500).json({ message: "Failed to fetch friends" });
    }
  });

  // Add friend
  app.post('/api/friends', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { friendId } = req.body;

      if (!friendId) {
        return res.status(400).json({ message: "Friend ID is required" });
      }

      // Check if already friends
      const alreadyFriends = await storage.areFriends(userId, friendId);
      if (alreadyFriends) {
        return res.status(400).json({ message: "Already friends" });
      }

      await storage.addFriend(userId, friendId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error adding friend:", error);
      res.status(500).json({ message: "Failed to add friend" });
    }
  });

  // Remove friend
  app.delete('/api/friends/:friendId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { friendId } = req.params;

      await storage.removeFriend(userId, friendId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing friend:", error);
      res.status(500).json({ message: "Failed to remove friend" });
    }
  });

  // Check if two users are friends
  app.get('/api/friends/:friendId/check', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { friendId } = req.params;

      const isFriend = await storage.areFriends(userId, friendId);
      res.json({ isFriend });
    } catch (error) {
      console.error("Error checking friendship:", error);
      res.status(500).json({ message: "Failed to check friendship" });
    }
  });

  // Invite a friend to a session
  app.post('/api/sessions/invite', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { friendId } = req.body;

      if (!friendId) {
        return res.status(400).json({ message: "Friend ID is required" });
      }

      const result = await sessionManager.inviteFriend(userId, friendId);
      res.json(result);
    } catch (error) {
      console.error("Error inviting friend:", error);
      res.status(500).json({ message: "Failed to invite friend" });
    }
  });

  // Scheduled Sessions Routes

  // Create a scheduled session
  app.post('/api/scheduled-sessions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { sessionType, bookingPreference, durationMinutes, title, description, startAt } = req.body;

      // Validate session type
      if (!['solo', 'group'].includes(sessionType)) {
        return res.status(400).json({ message: "Invalid session type. Must be 'solo' or 'group'" });
      }

      // Validate booking preference
      if (!['desk', 'active', 'any'].includes(bookingPreference)) {
        return res.status(400).json({ message: "Invalid booking preference. Must be 'desk', 'active', or 'any'" });
      }

      // Validate duration
      if (![20, 40, 60, 120].includes(durationMinutes)) {
        return res.status(400).json({ message: "Invalid duration. Must be 20, 40, 60, or 120 minutes" });
      }

      // Validate time
      const start = new Date(startAt);
      if (isNaN(start.getTime())) {
        return res.status(400).json({ message: "Invalid date format" });
      }
      if (start < new Date()) {
        return res.status(400).json({ message: "Cannot schedule sessions in the past" });
      }

      // Calculate end time based on duration
      const end = new Date(start.getTime() + durationMinutes * 60000);

      // Check for overlapping bookings
      const hasOverlap = await storage.checkUserOverlap(userId, start, end);
      if (hasOverlap) {
        return res.status(400).json({ 
          message: "You already have a session scheduled during this time. Please choose a different time slot." 
        });
      }

      // Set capacity based on type
      const capacity = sessionType === 'solo' ? 2 : 5;

      // Create the scheduled session
      const session = await storage.createScheduledSession({
        hostId: userId,
        sessionType,
        bookingPreference,
        durationMinutes,
        title: title || `${sessionType.charAt(0).toUpperCase() + sessionType.slice(1)} Session`,
        description,
        capacity,
        startAt: start,
        endAt: end,
        status: 'scheduled',
      });

      // Add host as participant
      await storage.addParticipant({
        sessionId: session.id,
        userId,
        role: 'host',
        status: 'joined',
      });

      // Check for matching bookings and auto-match
      const matchedSession = await storage.findMatchingBooking(
        start,
        durationMinutes,
        bookingPreference,
        userId
      );

      if (matchedSession) {
        // Auto-match: add this user to the matched session
        await storage.addParticipant({
          sessionId: matchedSession.id,
          userId,
          role: 'participant',
          status: 'joined',
        });

        // Update status if session is now full (solo sessions have capacity 2)
        const participantCount = await storage.getParticipantCount(matchedSession.id);
        if (participantCount >= matchedSession.capacity) {
          await storage.updateSessionStatus(matchedSession.id, 'matched');
        }

        // Cancel the newly created session since user joined existing one
        await storage.updateSessionStatus(session.id, 'cancelled');

        // Get the matched user's info (the host of the matched session)
        const matchedUser = await storage.getUser(matchedSession.hostId);
        const participants = await storage.getSessionParticipants(matchedSession.id);

        res.json({ 
          matched: true, 
          session: { ...matchedSession, participants, participantCount },
          matchedUser: matchedUser ? {
            id: matchedUser.id,
            firstName: matchedUser.firstName,
            lastName: matchedUser.lastName,
            username: matchedUser.username,
            profileImageUrl: matchedUser.profileImageUrl,
          } : null,
          message: "Automatically matched with an existing session"
        });
      } else {
        res.json({ 
          matched: false, 
          session,
          message: "Booking created. Waiting for others to join."
        });
      }
    } catch (error) {
      console.error("Error creating scheduled session:", error);
      res.status(500).json({ message: "Failed to create scheduled session" });
    }
  });

  // Get upcoming sessions in a date range
  app.get('/api/scheduled-sessions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start and end dates are required" });
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ message: "Invalid date format" });
      }

      const sessions = await storage.getUpcomingSessions(start, end);
      
      // Enrich with participant counts and participant data
      const enrichedSessions = await Promise.all(
        sessions.map(async (session) => {
          const participantCount = await storage.getParticipantCount(session.id);
          const participants = await storage.getSessionParticipants(session.id);
          return { ...session, participantCount, participants };
        })
      );

      // Filter out matched sessions (status = 'matched') unless user is a participant
      // This hides sessions that already have 2 matched users from everyone else
      const filteredSessions = enrichedSessions.filter(session => {
        // If session is matched, only show to participants
        if (session.status === 'matched') {
          return session.participants?.some((p: any) => p.id === userId);
        }
        return true;
      });

      res.json(filteredSessions);
    } catch (error) {
      console.error("Error fetching scheduled sessions:", error);
      res.status(500).json({ message: "Failed to fetch scheduled sessions" });
    }
  });

  // Get user's scheduled sessions
  app.get('/api/scheduled-sessions/my-sessions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const sessions = await storage.getUserScheduledSessions(userId);
      
      // Enrich with participant counts
      const enrichedSessions = await Promise.all(
        sessions.map(async (session) => {
          const participantCount = await storage.getParticipantCount(session.id);
          const participants = await storage.getSessionParticipants(session.id);
          return { ...session, participantCount, participants };
        })
      );

      res.json(enrichedSessions);
    } catch (error) {
      console.error("Error fetching user scheduled sessions:", error);
      res.status(500).json({ message: "Failed to fetch user scheduled sessions" });
    }
  });

  // Get a specific scheduled session
  app.get('/api/scheduled-sessions/:sessionId', isAuthenticated, async (req: any, res) => {
    try {
      const { sessionId } = req.params;
      const session = await storage.getScheduledSession(sessionId);

      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      const participants = await storage.getSessionParticipants(sessionId);
      const participantCount = await storage.getParticipantCount(sessionId);

      res.json({ ...session, participants, participantCount });
    } catch (error) {
      console.error("Error fetching scheduled session:", error);
      res.status(500).json({ message: "Failed to fetch scheduled session" });
    }
  });

  // Join a scheduled session
  app.post('/api/scheduled-sessions/:sessionId/join', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { sessionId } = req.params;

      const session = await storage.getScheduledSession(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      // Check if already a participant
      const participants = await storage.getSessionParticipants(sessionId);
      if (participants.some(p => p.id === userId)) {
        return res.status(400).json({ message: "Already joined this session" });
      }

      // Check capacity
      const participantCount = await storage.getParticipantCount(sessionId);
      if (participantCount >= session.capacity) {
        return res.status(400).json({ message: "Session is full" });
      }

      // Add participant
      await storage.addParticipant({
        sessionId,
        userId,
        role: 'participant',
        status: 'joined',
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error joining scheduled session:", error);
      res.status(500).json({ message: "Failed to join scheduled session" });
    }
  });

  // Leave a scheduled session
  app.post('/api/scheduled-sessions/:sessionId/leave', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { sessionId } = req.params;

      await storage.removeParticipant(sessionId, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error leaving scheduled session:", error);
      res.status(500).json({ message: "Failed to leave scheduled session" });
    }
  });

  // Cancel a scheduled session (for participants to cancel their booking)
  app.delete('/api/scheduled-sessions/:sessionId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { sessionId } = req.params;

      const session = await storage.getScheduledSession(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      // Check if user is a participant
      const participants = await storage.getSessionParticipants(sessionId);
      if (!participants.some(p => p.id === userId)) {
        return res.status(403).json({ message: "You are not a participant of this session" });
      }

      // If user is the host and only participant, cancel the session
      if (session.hostId === userId) {
        const participantCount = await storage.getParticipantCount(sessionId);
        if (participantCount === 1) {
          // Only host, cancel the session and remove participant record
          await storage.updateSessionStatus(sessionId, 'cancelled');
          await storage.removeParticipant(sessionId, userId);
        } else {
          // Other participants exist, just leave
          await storage.removeParticipant(sessionId, userId);
          // Update status back to scheduled if it was matched
          if (session.status === 'matched') {
            await storage.updateSessionStatus(sessionId, 'scheduled');
          }
        }
      } else {
        // Non-host participant, just leave
        await storage.removeParticipant(sessionId, userId);
        // Update status back to scheduled if it was matched
        if (session.status === 'matched') {
          await storage.updateSessionStatus(sessionId, 'scheduled');
        }
      }

      res.json({ success: true, message: "Session cancelled successfully" });
    } catch (error) {
      console.error("Error cancelling scheduled session:", error);
      res.status(500).json({ message: "Failed to cancel scheduled session" });
    }
  });

  // Get occupancy count for a time range
  app.get('/api/scheduled-sessions/occupancy', isAuthenticated, async (req: any, res) => {
    try {
      const { startAt, endAt } = req.query;

      if (!startAt || !endAt) {
        return res.status(400).json({ message: "Start and end times are required" });
      }

      const start = new Date(startAt as string);
      const end = new Date(endAt as string);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ message: "Invalid date format" });
      }

      const count = await storage.getOccupancyCount(start, end);
      res.json({ count });
    } catch (error) {
      console.error("Error fetching occupancy count:", error);
      res.status(500).json({ message: "Failed to fetch occupancy count" });
    }
  });

  // Log session completion and remove user from room
  app.post('/api/sessions/complete', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { sessionId, duration } = req.body;

      console.log(`[Session Complete] User ${userId} completed session ${sessionId} (${duration}s)`);
      
      // Remove user from the room so other participants see them leave
      await sessionManager.leaveRoom(userId, sessionId);
      console.log(`[Session Complete] User ${userId} removed from room ${sessionId}`);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error logging session completion:", error);
      res.status(500).json({ message: "Failed to log session completion" });
    }
  });

  // Notification endpoints
  app.get('/api/notifications', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      
      const notifications = await storage.getUserNotifications(userId, limit);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.get('/api/notifications/unread-count', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const count = await storage.getUnreadCount(userId);
      res.json({ count });
    } catch (error) {
      console.error("Error fetching unread count:", error);
      res.status(500).json({ message: "Failed to fetch unread count" });
    }
  });

  app.patch('/api/notifications/:notificationId/read', isAuthenticated, async (req: any, res) => {
    try {
      const { notificationId } = req.params;
      await storage.markAsRead(notificationId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  app.patch('/api/notifications/mark-all-read', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      await storage.markAllAsRead(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      res.status(500).json({ message: "Failed to mark all notifications as read" });
    }
  });

  const httpServer = createServer(app);

  // Setup River RPC server
  setupRiverServer(httpServer);

  return httpServer;
}
