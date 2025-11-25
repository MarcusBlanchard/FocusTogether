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

  const httpServer = createServer(app);

  // Setup River RPC server
  setupRiverServer(httpServer);

  return httpServer;
}
