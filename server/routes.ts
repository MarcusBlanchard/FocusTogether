import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { setupRiverServer } from "./river-server";
import { sessionManager } from "./session-manager";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

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

  // Join the matching queue
  app.post('/api/sessions/join-queue', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const result = await sessionManager.joinQueue(userId);
      res.json(result);
    } catch (error) {
      console.error("Error joining queue:", error);
      res.status(500).json({ message: "Failed to join queue" });
    }
  });

  // Leave the matching queue
  app.post('/api/sessions/leave-queue', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const success = sessionManager.leaveQueue(userId);
      res.json({ success });
    } catch (error) {
      console.error("Error leaving queue:", error);
      res.status(500).json({ message: "Failed to leave queue" });
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

  // Free Rooms Routes

  // Get list of available free rooms
  app.get('/api/free-rooms', isAuthenticated, async (req: any, res) => {
    try {
      const rooms = sessionManager.getFreeRooms();
      res.json({ rooms });
    } catch (error) {
      console.error("Error fetching free rooms:", error);
      res.status(500).json({ message: "Failed to fetch free rooms" });
    }
  });

  // Create a new free room
  app.post('/api/free-rooms', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { title } = req.body;
      
      const result = await sessionManager.createFreeRoom(userId, title);
      res.json(result);
    } catch (error) {
      console.error("Error creating free room:", error);
      res.status(500).json({ message: "Failed to create free room" });
    }
  });

  // Join a free room
  app.post('/api/free-rooms/:sessionId/join', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { sessionId } = req.params;
      
      const result = await sessionManager.joinFreeRoom(userId, sessionId);
      res.json(result);
    } catch (error) {
      console.error("Error joining free room:", error);
      res.status(500).json({ message: "Failed to join free room" });
    }
  });

  // Scheduled Sessions Routes

  // Create a scheduled session
  app.post('/api/scheduled-sessions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { sessionType, title, description, capacity, startAt, endAt } = req.body;

      // Validate session type
      if (!['solo', 'group', 'freeRoom'].includes(sessionType)) {
        return res.status(400).json({ message: "Invalid session type" });
      }

      // Validate time window
      const start = new Date(startAt);
      const end = new Date(endAt);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ message: "Invalid date format" });
      }
      if (start >= end) {
        return res.status(400).json({ message: "Start time must be before end time" });
      }
      if (start < new Date()) {
        return res.status(400).json({ message: "Cannot schedule sessions in the past" });
      }

      // Validate capacity based on type
      const requiredCapacity = sessionType === 'solo' ? 2 : sessionType === 'group' ? 5 : 10;
      if (capacity && (capacity < 2 || capacity > requiredCapacity)) {
        return res.status(400).json({ message: `Capacity must be between 2 and ${requiredCapacity} for ${sessionType} sessions` });
      }
      const finalCapacity = capacity || requiredCapacity;

      // Create the scheduled session
      const session = await storage.createScheduledSession({
        hostId: userId,
        sessionType,
        title,
        description,
        capacity: finalCapacity,
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

      res.json(session);
    } catch (error) {
      console.error("Error creating scheduled session:", error);
      res.status(500).json({ message: "Failed to create scheduled session" });
    }
  });

  // Get upcoming sessions in a date range
  app.get('/api/scheduled-sessions', isAuthenticated, async (req: any, res) => {
    try {
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
      
      // Enrich with participant counts
      const enrichedSessions = await Promise.all(
        sessions.map(async (session) => {
          const participantCount = await storage.getParticipantCount(session.id);
          return { ...session, participantCount };
        })
      );

      res.json(enrichedSessions);
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

  const httpServer = createServer(app);

  // Setup River RPC server
  setupRiverServer(httpServer);

  return httpServer;
}
