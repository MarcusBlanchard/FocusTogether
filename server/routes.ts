import type { Express } from "express";
import type { Server } from "http";
import { storage, type IStorage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { setupRiverServer } from "./river-server";
import { sessionManager } from "./session-manager";
import { AccessToken } from "livekit-server-sdk";
import type { ScheduledSession, User } from "@shared/schema";
import { validateUsername, validateDisplayName } from "./profanity-filter";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { sql } from "drizzle-orm";
import { db } from "./db";

/** True when foregroundApp is probably a hostname from the extension (not a macOS .app name). */
function isLikelyBrowserExtensionHostname(foregroundApp: string): boolean {
  const t = foregroundApp.trim().toLowerCase();
  if (!t || t.includes(" ") || !t.includes(".")) return false;
  if (t.endsWith(".app")) return false;
  return (
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9-]+)+$/i.test(t) || t === "localhost"
  );
}

/** OS foreground app name from Tauri (not a URL host). If true, extension owns tab distraction — do not clear it on desktopNative. */
function isBrowserProcessForegroundName(foregroundApp: string): boolean {
  const a = foregroundApp.trim().toLowerCase();
  if (!a) return false;
  return (
    a.includes("chrome") ||
    a.includes("chromium") ||
    a.includes("firefox") ||
    a.includes("safari") ||
    a.includes("arc") ||
    a.includes("opera") ||
    a.includes("operagx") ||
    a.includes("vivaldi") ||
    a.includes("brave") ||
    a.includes("edge") ||
    a.includes("microsoft edge") ||
    a.includes("tor browser") ||
    a.includes("duckduckgo")
  );
}

// Helper function to try re-matching remaining participants with others in the pool
async function tryRematchSession(
  session: ScheduledSession, 
  sessionId: string, 
  cancellingUser: User, 
  storage: IStorage
): Promise<{ rematched: boolean; newSessionId?: string }> {
  try {
    // Get remaining participants BEFORE moving them
    const remainingParticipants = await storage.getSessionParticipants(sessionId);
    
    // Find another compatible session to match with
    const matchingSession = await storage.findMatchingBooking(
      new Date(session.startAt),
      session.durationMinutes,
      session.bookingPreference,
      session.sessionType,
      session.hostId // Exclude the current session's host
    );

    if (matchingSession && matchingSession.id !== sessionId) {
      // Get the host of the new session (for notification)
      const newMatchHost = await storage.getUser(matchingSession.hostId);
      
      // Get existing participants in the target session BEFORE adding anyone
      // These are the users who should receive match-found notifications
      const originalTargetParticipants = await storage.getSessionParticipants(matchingSession.id);
      const originalTargetParticipantIds = originalTargetParticipants.map(p => p.id);
      
      // Track which participants were successfully moved
      const movedParticipants: typeof remainingParticipants = [];
      
      // Move all remaining participants to the matched session
      for (const participant of remainingParticipants) {
        // Check if there's still space in the matched session
        const matchedCount = await storage.getParticipantCount(matchingSession.id);
        if (matchedCount >= matchingSession.capacity) break;
        
        // Add participant to matched session
        await storage.addParticipant({
          sessionId: matchingSession.id,
          userId: participant.id,
          role: 'participant',
          status: 'joined',
        });
        
        // Remove from current session
        await storage.removeParticipant(sessionId, participant.id);
        
        movedParticipants.push(participant);
        
        // Notify participant they've been auto-rematched
        if (newMatchHost) {
          await sessionManager.notifyAutoRematched(
            participant.id,
            sessionId,
            matchingSession.id,
            cancellingUser,
            newMatchHost
          );
        }
      }
      
      // Notify ONLY the original participants in the matched session about new joiners
      // (not any of the moved participants - filter out ALL moved users from the target list)
      const movedParticipantIds = movedParticipants.map(p => p.id);
      const notifyTargets = originalTargetParticipantIds.filter(id => !movedParticipantIds.includes(id));
      
      for (const movedParticipant of movedParticipants) {
        const joiningUser = await storage.getUser(movedParticipant.id);
        if (joiningUser && notifyTargets.length > 0) {
          await sessionManager.notifyMatchFound(
            matchingSession.id,
            joiningUser,
            notifyTargets
          );
        }
      }
      
      // Update matched session status if now full
      const newCount = await storage.getParticipantCount(matchingSession.id);
      if (newCount >= 2) {
        await storage.updateSessionStatus(matchingSession.id, 'matched');
      }
      
      // Cancel the now-empty original session
      const remainingCount = await storage.getParticipantCount(sessionId);
      if (remainingCount === 0) {
        await storage.updateSessionStatus(sessionId, 'cancelled');
      }
      
      console.log(`[Rematch] Moved participants from session ${sessionId} to ${matchingSession.id}`);
      return { rematched: true, newSessionId: matchingSession.id };
    }
    
    return { rematched: false };
  } catch (error) {
    console.error('[Rematch] Error during re-matching:', error);
    // Don't throw - re-matching failure shouldn't break the cancel operation
    return { rematched: false };
  }
}

export async function registerRoutes(app: Express, server: Server): Promise<void> {
  // Auth middleware (includes OIDC discovery - can be slow)
  // Note: Health check is registered in app.ts BEFORE listen() for fast deployment
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

      // Validate username (length, format, and profanity check)
      const validation = validateUsername(username);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.message });
      }

      // Check if username is taken
      const existing = await storage.getUserByUsername(username.trim());
      if (existing && existing.id !== userId) {
        return res.status(400).json({ message: "Username already taken" });
      }

      const user = await storage.updateUsername(userId, username.trim());
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

  // Update display name
  app.patch('/api/user/display-name', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { firstName, lastName } = req.body;

      // Validate first name
      if (!firstName || typeof firstName !== 'string' || firstName.trim().length < 1) {
        return res.status(400).json({ message: "First name is required" });
      }
      if (firstName.trim().length > 50) {
        return res.status(400).json({ message: "First name must be 50 characters or less" });
      }
      const firstNameValidation = validateDisplayName(firstName);
      if (!firstNameValidation.valid) {
        return res.status(400).json({ message: firstNameValidation.message });
      }

      // Validate last name
      if (!lastName || typeof lastName !== 'string' || lastName.trim().length < 1) {
        return res.status(400).json({ message: "Last name is required" });
      }
      if (lastName.trim().length > 50) {
        return res.status(400).json({ message: "Last name must be 50 characters or less" });
      }
      const lastNameValidation = validateDisplayName(lastName);
      if (!lastNameValidation.valid) {
        return res.status(400).json({ message: lastNameValidation.message });
      }

      const user = await storage.updateDisplayName(userId, firstName.trim(), lastName.trim());
      res.json(user);
    } catch (error) {
      console.error("Error updating display name:", error);
      res.status(500).json({ message: "Failed to update display name" });
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

  // Lookup user by exact username (public endpoint for browser extension)
  app.get('/api/users/lookup', async (req, res) => {
    try {
      const username = req.query.username as string;

      if (!username || username.length < 1) {
        return res.status(400).json({ message: "Username required" });
      }

      const user = await storage.getUserByUsername(username);
      
      if (user) {
        // Only return minimal info needed for extension to connect
        res.json({ id: user.id, username: user.username });
      } else {
        res.status(404).json({ message: "User not found" });
      }
    } catch (error) {
      console.error("Error looking up user:", error);
      res.status(500).json({ message: "Failed to lookup user" });
    }
  });

  // Get user's session history
  app.get('/api/sessions/history', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const sessionHistory = await storage.getUserSessionHistory(userId);

      // Enrich with friend status for each participant
      const enrichedSessions = await Promise.all(
        sessionHistory.map(async ({ session, participants }) => {
          // Get friend status and pending request status for each participant (excluding self)
          const enrichedParticipants = await Promise.all(
            participants
              .filter(p => p.id !== userId)
              .map(async (participant) => {
                const isFriend = await storage.areFriends(userId, participant.id);
                const hasPendingRequest = !isFriend && await storage.hasPendingFriendRequest(userId, participant.id);
          return {
                  id: participant.id,
                  username: participant.username,
                  firstName: participant.firstName,
                  lastName: participant.lastName,
                  profileImageUrl: participant.profileImageUrl,
            isFriend,
                  hasPendingRequest,
                };
              })
          );
          
          // Calculate duration in seconds from startAt and endAt (with fallback to durationMinutes)
          const startTime = new Date(session.startAt).getTime();
          const endTime = session.endAt ? new Date(session.endAt).getTime() : startTime;
          const durationSeconds = endTime > startTime 
            ? Math.floor((endTime - startTime) / 1000)
            : session.durationMinutes * 60;
          
          return {
            id: session.id,
            title: session.title || 'Focus Session',
            sessionType: session.sessionType,
            durationMinutes: session.durationMinutes,
            durationSeconds,
            startAt: session.startAt,
            endAt: session.endAt,
            status: session.status,
            participants: enrichedParticipants,
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
      
      // Notify the removed friend in real-time
      await sessionManager.notifyFriendRemoved(friendId, userId);
      
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

  // Friend Request Routes

  // Send a friend request
  app.post('/api/friend-requests', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { receiverId } = req.body;

      if (!receiverId) {
        return res.status(400).json({ message: "Receiver ID is required" });
      }

      if (receiverId === userId) {
        return res.status(400).json({ message: "Cannot send friend request to yourself" });
      }

      // Check if already friends
      const alreadyFriends = await storage.areFriends(userId, receiverId);
      if (alreadyFriends) {
        return res.status(400).json({ message: "Already friends with this user" });
      }

      // Check if request already exists (in either direction)
      const existingRequest = await storage.getFriendRequest(userId, receiverId);
      if (existingRequest) {
        return res.status(400).json({ message: "Friend request already sent" });
      }

      const reverseRequest = await storage.getFriendRequest(receiverId, userId);
      if (reverseRequest && reverseRequest.status === 'pending') {
        return res.status(400).json({ message: "This user has already sent you a friend request" });
      }

      const request = await storage.sendFriendRequest(userId, receiverId);
      
      // Notify the receiver in real-time
      const sender = await storage.getUser(userId);
      if (sender) {
        await sessionManager.notifyFriendRequestReceived(receiverId, request, sender);
        
        // Create a persistent notification for the receiver
        const senderName = sender.firstName && sender.lastName 
          ? `${sender.firstName} ${sender.lastName}` 
          : sender.username || 'Someone';
        await storage.createNotification({
          userId: receiverId,
          type: 'friend_request',
          title: 'New Friend Request',
          message: `${senderName} sent you a friend request`,
          relatedUserId: userId,
        });
      }
      
      res.json(request);
    } catch (error) {
      console.error("Error sending friend request:", error);
      res.status(500).json({ message: "Failed to send friend request" });
    }
  });

  // Get pending friend requests (received)
  app.get('/api/friend-requests/pending', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const requests = await storage.getPendingRequests(userId);
      res.json(requests);
    } catch (error) {
      console.error("Error fetching pending requests:", error);
      res.status(500).json({ message: "Failed to fetch pending requests" });
    }
  });

  // Get sent friend requests
  app.get('/api/friend-requests/sent', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const requests = await storage.getSentRequests(userId);
      res.json(requests);
    } catch (error) {
      console.error("Error fetching sent requests:", error);
      res.status(500).json({ message: "Failed to fetch sent requests" });
    }
  });

  // Accept a friend request
  app.post('/api/friend-requests/:requestId/accept', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { requestId } = req.params;

      // Get the request before accepting to know who the sender is
      const request = await storage.getFriendRequestById(requestId);
      if (!request) {
        return res.status(404).json({ message: "Friend request not found" });
      }

      // Verify current user is the receiver of this request
      if (request.receiverId !== userId) {
        return res.status(403).json({ message: "Not authorized to accept this request" });
      }

      // Verify request is still pending
      if (request.status !== 'pending') {
        return res.status(400).json({ message: "Friend request is no longer pending" });
      }

      await storage.acceptFriendRequest(requestId, userId);
      
      // Notify the sender that their request was accepted
      const acceptor = await storage.getUser(userId);
      if (acceptor) {
        await sessionManager.notifyFriendRequestAccepted(request.senderId, requestId, acceptor);
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error accepting friend request:", error);
      res.status(500).json({ message: "Failed to accept friend request" });
    }
  });

  // Reject a friend request
  app.post('/api/friend-requests/:requestId/reject', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { requestId } = req.params;

      // Get the request before rejecting to know who the sender is
      const request = await storage.getFriendRequestById(requestId);
      if (!request) {
        return res.status(404).json({ message: "Friend request not found" });
      }

      // Verify current user is the receiver of this request
      if (request.receiverId !== userId) {
        return res.status(403).json({ message: "Not authorized to reject this request" });
      }

      // Verify request is still pending
      if (request.status !== 'pending') {
        return res.status(400).json({ message: "Friend request is no longer pending" });
      }

      await storage.rejectFriendRequest(requestId, userId);
      
      // Notify the sender that their request was rejected
      await sessionManager.notifyFriendRequestRejected(request.senderId, requestId, userId);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error rejecting friend request:", error);
      res.status(500).json({ message: "Failed to reject friend request" });
    }
  });

  // Cancel a sent friend request
  app.delete('/api/friend-requests/:requestId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { requestId } = req.params;

      // Get the request before cancelling to know who the receiver is
      const request = await storage.getFriendRequestById(requestId);
      if (!request) {
        return res.status(404).json({ message: "Friend request not found" });
      }

      // Verify current user is the sender of this request
      if (request.senderId !== userId) {
        return res.status(403).json({ message: "Not authorized to cancel this request" });
      }

      await storage.cancelFriendRequest(requestId, userId);
      
      // Notify the receiver that the request was cancelled
      await sessionManager.notifyFriendRequestCancelled(request.receiverId, requestId, userId);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error cancelling friend request:", error);
      res.status(500).json({ message: "Failed to cancel friend request" });
    }
  });

  // Message Routes

  // Send a message
  app.post('/api/messages', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { receiverId, content } = req.body;

      if (!receiverId || !content) {
        return res.status(400).json({ message: "Receiver ID and content are required" });
      }

      // Check if users are friends
      const areFriends = await storage.areFriends(userId, receiverId);
      if (!areFriends) {
        return res.status(403).json({ message: "You can only message friends" });
      }

      const message = await storage.sendMessage(userId, receiverId, content);
      
      // Send real-time notification to the receiver
      const sender = await storage.getUser(userId);
      if (sender) {
        sessionManager.notifyMessageReceived(receiverId, {
          senderId: userId,
          senderUsername: sender.username || null,
          senderFirstName: sender.firstName || null,
          senderLastName: sender.lastName || null,
        });
      }
      
      res.json(message);
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // Check if user has unread messages (must be before :partnerId route)
  app.get('/api/messages/has-unread', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const hasUnread = await storage.hasUnreadMessages(userId);
      res.json({ hasUnread });
    } catch (error) {
      console.error("Error checking unread messages:", error);
      res.status(500).json({ message: "Failed to check unread messages" });
    }
  });

  // Get list of conversations
  app.get('/api/conversations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const conversations = await storage.getConversationsList(userId);
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  // Get conversation with a specific user (must be after static routes like has-unread)
  app.get('/api/messages/:partnerId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { partnerId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const before = req.query.before ? new Date(req.query.before as string) : undefined;

      // Check if users are friends
      const areFriends = await storage.areFriends(userId, partnerId);
      if (!areFriends) {
        return res.status(403).json({ message: "You can only view conversations with friends" });
      }

      const messages = await storage.getConversation(userId, partnerId, limit, before);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ message: "Failed to fetch conversation" });
    }
  });

  // Mark conversation as read
  app.post('/api/messages/:partnerId/mark-read', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { partnerId } = req.params;
      await storage.markConversationAsRead(userId, partnerId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking conversation as read:", error);
      res.status(500).json({ message: "Failed to mark conversation as read" });
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

  // Custom Rooms Routes

  // Create a custom room and send invites
  app.post('/api/custom-rooms', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { startAt, endAt, durationMinutes, invitedFriendIds = [] } = req.body;

      // Check subscription/free tier status (paywall)
      const subscriptionStatus = await storage.getUserSubscriptionStatus(userId);
      if (!subscriptionStatus.hasActiveSubscription && !subscriptionStatus.canUseFreeTier) {
        return res.status(403).json({ 
          message: "You've used your 2 free sessions. Please upgrade to continue booking sessions.",
          code: "SUBSCRIPTION_REQUIRED",
          completedSessionCount: subscriptionStatus.completedSessionCount
        });
      }

      // Validate duration
      if (![20, 40, 60, 120].includes(durationMinutes)) {
        return res.status(400).json({ message: "Invalid duration. Must be 20, 40, 60, or 120 minutes" });
      }

      // Validate time
      const start = new Date(startAt);
      const end = new Date(endAt);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ message: "Invalid date format" });
      }
      
      // Allow booking up to 5 minutes after start time (grace period)
      const gracePeriodMs = 5 * 60 * 1000;
      if (start.getTime() + gracePeriodMs < Date.now()) {
        return res.status(400).json({ message: "Cannot schedule sessions more than 5 minutes in the past" });
      }

      // Validate invited friends (max 4, since room is max 5 including host)
      if (invitedFriendIds.length > 4) {
        return res.status(400).json({ message: "Cannot invite more than 4 friends (max 5 participants)" });
      }

      // Check for overlapping bookings
      const hasOverlap = await storage.checkUserOverlap(userId, start, end);
      if (hasOverlap) {
        return res.status(400).json({ 
          message: "You already have a session scheduled during this time." 
        });
      }

      // Get user for display name
      const user = await storage.getUser(userId);

      // Create the custom room session
      const session = await storage.createScheduledSession({
        hostId: userId,
        sessionType: 'custom',
        bookingPreference: 'any',
        durationMinutes,
        title: `${user?.firstName || user?.username || 'User'}'s Room`,
        description: null,
        capacity: 5,
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

      // Send invites to selected friends
      for (const friendId of invitedFriendIds) {
        // Verify they are actually friends
        const areFriends = await storage.areFriends(userId, friendId);
        if (!areFriends) continue;

        // Create session invite
        await storage.createSessionInvite({
          sessionId: session.id,
          senderId: userId,
          receiverId: friendId,
          status: 'pending',
        });

        // Create notification for the friend
        await storage.createNotification({
          userId: friendId,
          type: 'session_invite',
          title: 'Room Invitation',
          message: `${user?.firstName || user?.username || 'Someone'} invited you to join their focus session`,
          relatedUserId: userId,
          sessionId: session.id,
          read: 0,
        });

        // Send real-time notification via WebSocket
        sessionManager.sendToUser(friendId, {
          type: 'session-invite',
          sessionId: session.id,
          invitedBy: {
            id: userId,
            username: user?.username,
            firstName: user?.firstName,
            lastName: user?.lastName,
            profileImageUrl: user?.profileImageUrl,
          },
          startAt: start.toISOString(),
          durationMinutes,
        });
      }

      res.json({ 
        sessionId: session.id,
        invitesSent: invitedFriendIds.length,
      });
    } catch (error) {
      console.error("Error creating custom room:", error);
      res.status(500).json({ message: "Failed to create custom room" });
    }
  });

  // Get pending invites for current user
  app.get('/api/session-invites/pending', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const invites = await storage.getPendingSessionInvites(userId);
      res.json(invites);
    } catch (error) {
      console.error("Error fetching pending invites:", error);
      res.status(500).json({ message: "Failed to fetch invites" });
    }
  });

  // Get invites for a specific session (to filter already-invited friends)
  app.get('/api/session-invites/session/:sessionId', isAuthenticated, async (req: any, res) => {
    try {
      const { sessionId } = req.params;
      const invites = await storage.getSessionInvitesBySessionId(sessionId);
      res.json(invites);
    } catch (error) {
      console.error("Error fetching session invites:", error);
      res.status(500).json({ message: "Failed to fetch session invites" });
    }
  });

  // Get invites for a specific conversation (between current user and partner)
  app.get('/api/session-invites/conversation/:partnerId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { partnerId } = req.params;
      
      const invites = await storage.getConversationInvites(userId, partnerId);
      res.json(invites);
    } catch (error) {
      console.error("Error fetching conversation invites:", error);
      res.status(500).json({ message: "Failed to fetch invites" });
    }
  });

  // Accept or decline a session invite
  app.post('/api/session-invites/:inviteId/respond', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { inviteId } = req.params;
      const { response } = req.body; // 'accepted' or 'declined'

      if (!['accepted', 'declined'].includes(response)) {
        return res.status(400).json({ message: "Invalid response. Must be 'accepted' or 'declined'" });
      }

      const invite = await storage.getSessionInvite(inviteId);
      if (!invite) {
        return res.status(404).json({ message: "Invite not found" });
      }
      if (invite.receiverId !== userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      if (invite.status !== 'pending') {
        return res.status(400).json({ message: "Invite already responded to" });
      }

      await storage.updateSessionInviteStatus(inviteId, response);

      if (response === 'accepted') {
        // Add user to session
        const session = await storage.getScheduledSession(invite.sessionId);
        if (session && session.status !== 'cancelled' && session.status !== 'expired') {
          const participantCount = await storage.getParticipantCount(session.id);
          if (participantCount < session.capacity) {
            await storage.addParticipant({
              sessionId: session.id,
              userId,
              role: 'participant',
              status: 'joined',
            });
          }
        }
      }

      res.json({ success: true, status: response });
    } catch (error) {
      console.error("Error responding to invite:", error);
      res.status(500).json({ message: "Failed to respond to invite" });
    }
  });

  // Scheduled Sessions Routes

  // Create a scheduled session
  app.post('/api/scheduled-sessions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { sessionType, bookingPreference, durationMinutes, title, description, startAt } = req.body;

      // Check subscription/free tier status (paywall)
      const subscriptionStatus = await storage.getUserSubscriptionStatus(userId);
      if (!subscriptionStatus.hasActiveSubscription && !subscriptionStatus.canUseFreeTier) {
        return res.status(403).json({ 
          message: "You've used your 2 free sessions. Please upgrade to continue booking sessions.",
          code: "SUBSCRIPTION_REQUIRED",
          completedSessionCount: subscriptionStatus.completedSessionCount
        });
      }

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
      // Allow booking up to 5 minutes after start time (grace period for late joiners)
      const gracePeriodMs = 5 * 60 * 1000; // 5 minutes
      if (start.getTime() + gracePeriodMs < Date.now()) {
        return res.status(400).json({ message: "Cannot schedule sessions more than 5 minutes in the past" });
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
        sessionType,
        userId
      );

      if (matchedSession) {
        // Get existing participants BEFORE adding new user (for notification)
        const existingParticipants = await storage.getSessionParticipants(matchedSession.id);
        const existingParticipantIds = existingParticipants.map(p => p.id);
        
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

        // Get the joining user's info for notification
        const joiningUser = await storage.getUser(userId);
        
        // Notify existing participants about the new match
        if (joiningUser) {
          await sessionManager.notifyMatchFound(matchedSession.id, joiningUser, existingParticipantIds);
        }

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

      // Prevent caching to ensure fresh data across devices
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
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

      // Prevent caching to ensure fresh data across devices
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
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

      // Check subscription/free tier status (paywall) - skip for session host
      if (session.hostId !== userId) {
        const subscriptionStatus = await storage.getUserSubscriptionStatus(userId);
        if (!subscriptionStatus.hasActiveSubscription && !subscriptionStatus.canUseFreeTier) {
          return res.status(403).json({ 
            message: "You've used your 2 free sessions. Please upgrade to continue joining sessions.",
            code: "SUBSCRIPTION_REQUIRED",
            completedSessionCount: subscriptionStatus.completedSessionCount
          });
        }
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

      // Get the cancelling user's info for notifications
      const cancellingUser = await storage.getUser(userId);
      if (!cancellingUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if user is a participant OR the host (host can always cancel their session)
      const participants = await storage.getSessionParticipants(sessionId);
      const isParticipant = participants.some(p => p.id === userId);
      const isHost = session.hostId === userId;
      
      if (!isParticipant && !isHost) {
        return res.status(403).json({ message: "You are not a participant of this session" });
      }

      // Get IDs of remaining participants (everyone except the cancelling user)
      // Note: participants only includes those with status='joined'
      const remainingParticipantIds = participants
        .filter(p => p.id !== userId)
        .map(p => p.id);

      // Get count of joined participants (not including those who left)
      const participantCount = await storage.getParticipantCount(sessionId);

      if (isHost) {
        // Host is cancelling
        if (!isParticipant) {
          // Host has already left but wants to cancel the entire session
          // This happens when host left but session still exists with other participants
          if (remainingParticipantIds.length > 0) {
            // Notify remaining participants that session is cancelled
            await sessionManager.notifyPartnerCancelled(sessionId, cancellingUser, remainingParticipantIds);
          }
          // Cancel the entire session
          await storage.updateSessionStatus(sessionId, 'cancelled');
        } else if (participantCount <= 1) {
          // Host is the only participant, cancel the session
          await storage.updateSessionStatus(sessionId, 'cancelled');
          await storage.removeParticipant(sessionId, userId);
        } else {
          // Host is leaving but other participants exist
          await sessionManager.notifyPartnerCancelled(sessionId, cancellingUser, remainingParticipantIds);
          await storage.removeParticipant(sessionId, userId);
          
          // Update status back to scheduled if it was matched
          if (session.status === 'matched') {
            await storage.updateSessionStatus(sessionId, 'scheduled');
          }
          
          // Try to re-match remaining participants with others in the pool
          await tryRematchSession(session, sessionId, cancellingUser, storage);
        }
      } else {
        // Non-host participant is cancelling
        await sessionManager.notifyPartnerCancelled(sessionId, cancellingUser, remainingParticipantIds);
        await storage.removeParticipant(sessionId, userId);
        
        // Update status back to scheduled if it was matched
        if (session.status === 'matched') {
          await storage.updateSessionStatus(sessionId, 'scheduled');
        }
        
        // Try to re-match remaining participants with others in the pool
        await tryRematchSession(session, sessionId, cancellingUser, storage);
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
      
      // Increment the user's completed session count for billing purposes
      await storage.incrementCompletedSessionCount(userId);
      console.log(`[Session Complete] Incremented completed session count for user ${userId}`);
      
      // Remove user from the room so other participants see them leave
      await sessionManager.leaveRoom(userId, sessionId);
      console.log(`[Session Complete] User ${userId} removed from room ${sessionId}`);
      
      // Update participant status in database to 'left' so they can rebook
      await storage.removeParticipant(sessionId, userId);
      console.log(`[Session Complete] User ${userId} marked as left in database`);
      
      // Check if session should revert to 'scheduled' status
      const session = await storage.getScheduledSession(sessionId);
      if (session && session.status === 'matched') {
        const remainingCount = await storage.getParticipantCount(sessionId);
        if (remainingCount < session.capacity) {
          await storage.updateSessionStatus(sessionId, 'scheduled');
          console.log(`[Session Complete] Session ${sessionId} reverted to scheduled (${remainingCount} participants remaining)`);
        }
      }
      
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

  // ========== BILLING/SUBSCRIPTION ROUTES ==========
  
  // Get Stripe publishable key for frontend
  app.get('/api/stripe/config', async (_req, res) => {
    try {
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error: any) {
      console.error("Error getting Stripe config:", error);
      res.status(500).json({ message: "Stripe not configured" });
    }
  });

  // Get user's subscription status
  app.get('/api/subscription/status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const status = await storage.getUserSubscriptionStatus(userId);
      res.json(status);
    } catch (error) {
      console.error("Error fetching subscription status:", error);
      res.status(500).json({ message: "Failed to fetch subscription status" });
    }
  });

  // Get available pricing plans
  app.get('/api/subscription/plans', async (_req, res) => {
    try {
      const result = await db.execute(
        sql`SELECT 
          p.id as product_id,
          p.name as product_name,
          p.description as product_description,
          pr.id as price_id,
          pr.unit_amount,
          pr.currency,
          pr.recurring
        FROM stripe.products p
        JOIN stripe.prices pr ON pr.product = p.id
        WHERE p.active = true AND pr.active = true
        ORDER BY pr.unit_amount ASC`
      );
      res.json({ plans: result.rows });
    } catch (error) {
      console.error("Error fetching plans:", error);
      res.status(500).json({ message: "Failed to fetch plans" });
    }
  });

  // Create Stripe checkout session
  app.post('/api/subscription/checkout', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { priceId } = req.body;

      if (!priceId) {
        return res.status(400).json({ message: "Price ID is required" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const stripe = await getUncachableStripeClient();

      // Create or get customer
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email || undefined,
          metadata: { userId },
        });
        await storage.updateUserStripeInfo(userId, customer.id);
        customerId = customer.id;
      }

      // Get base URL for redirects
      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;

      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'subscription',
        success_url: `${baseUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/pricing`,
        metadata: { userId },
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ message: error.message || "Failed to create checkout session" });
    }
  });

  // Create Stripe billing portal session (for managing subscription)
  app.post('/api/subscription/portal', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      if (!user || !user.stripeCustomerId) {
        return res.status(400).json({ message: "No billing account found" });
      }

      const stripe = await getUncachableStripeClient();
      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;

      const session = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${baseUrl}/`,
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Error creating portal session:", error);
      res.status(500).json({ message: error.message || "Failed to create portal session" });
    }
  });

  // Handle successful checkout (verify and update user)
  app.post('/api/subscription/verify', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { sessionId } = req.body;

      if (!sessionId) {
        return res.status(400).json({ message: "Session ID is required" });
      }

      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status !== 'paid') {
        return res.status(400).json({ message: "Payment not completed" });
      }

      // Update user with subscription info
      const subscriptionId = session.subscription as string;
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await storage.updateUserStripeInfo(
          userId,
          session.customer as string,
          subscriptionId,
          subscription.status
        );
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error verifying subscription:", error);
      res.status(500).json({ message: error.message || "Failed to verify subscription" });
    }
  });

  // =====================================
  // ACTIVITY TRACKING (Desktop App)
  // =====================================

  // GET /api/activity/session - Polled by desktop app to check if user is in active session
  // No auth for MVP (will secure later)
  app.get('/api/activity/session', async (req, res) => {
    try {
      const userId = req.query.userId as string;

      if (!userId) {
        return res.status(400).json({ message: "userId required" });
      }

      const activeSession = sessionManager.getUserActiveSession(userId);
      const alerts = sessionManager.getPendingAlerts(userId);
      
      // Log when we return alerts for debugging
      if (alerts.length > 0) {
        console.log(`[Activity Session] Returning ${alerts.length} pending alerts to user ${userId}`);
      }

      // Get distracting apps list for this user (with their overrides applied)
      const { getDistractingAppsForUser, getAllowedAppsForUser } = await import('./app-categorizer');
      const distractingApps = await getDistractingAppsForUser(userId);
      const allowedApps = await getAllowedAppsForUser(userId);
      const currentDistraction = sessionManager.getCurrentBrowserDistraction(userId);

      // Always send pendingAlerts as an array so desktop can parse consistently
      // (omitting the key when empty caused desktop to see pendingAlerts: None)
      res.json({
        sessionId: activeSession?.sessionId || null,
        pendingAlerts: alerts,
        active: activeSession !== null,
        noteTakingMode: false,
        distractingApps,
        allowedApps,
        ...(currentDistraction ? { currentDistraction } : {}),
      });
    } catch (error: any) {
      console.error("Error fetching active session:", error);
      res.status(500).json({ message: "Failed to fetch active session" });
    }
  });

  // POST /api/activity/session - Web app calls this when joining/leaving sessions
  app.post('/api/activity/session', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { sessionId, status } = req.body;
      
      if (status === 'joined') {
        if (!sessionId) {
          return res.status(400).json({ 
            message: "sessionId is required when status is 'joined'" 
          });
        }
        sessionManager.setUserActiveSession(userId, sessionId);
        console.log(`[Activity Session] User ${userId} joined session ${sessionId}`);
      } else if (status === 'left') {
        sessionManager.clearUserActiveSession(userId);
        console.log(`[Activity Session] User ${userId} left session`);
      } else {
        return res.status(400).json({ message: "Invalid status. Must be 'joined' or 'left'" });
      }

      res.json({ 
        success: true, 
        message: status === 'joined' ? "Session join recorded" : "Session leave recorded",
        data: { userId, sessionId: status === 'joined' ? sessionId : null, status }
      });
    } catch (error: any) {
      console.error("Error processing activity session:", error);
      res.status(500).json({ message: error.message || "Failed to process activity session" });
    }
  });

  // POST /api/activity/update - Receive activity state updates from desktop app
  // No auth required for now (placeholder userId/sessionId)
  app.post('/api/activity/update', async (req, res) => {
    try {
      const { userId, sessionId, status, timestamp } = req.body;
      const actualTimestamp = timestamp || new Date().toISOString();

      // Validate required fields (timestamp is optional, defaults to now)
      if (!userId || !sessionId || !status) {
        return res.status(400).json({ 
          message: "Missing required fields: userId, sessionId, status" 
        });
      }

      // Validate status value
      if (!['active', 'idle', 'distracted'].includes(status)) {
        return res.status(400).json({ 
          message: "Status must be 'active', 'idle', or 'distracted'" 
        });
      }

      // Log the activity update
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`[Activity Update] 📡 User ${userId} in session ${sessionId}: ${status} at ${actualTimestamp}`);

      // Get the user info for the notification
      const user = await storage.getUser(userId);
      console.log(`[Activity Update] 👤 Sending user: ${user?.firstName || user?.username || 'Unknown'}`);
      
      // Get all participants in the session to broadcast to
      const participants = await storage.getSessionParticipants(sessionId);
      console.log(`[Activity Update] 📊 Found ${participants.length} participants in session ${sessionId}`);
      if (participants.length > 0) {
        console.log(`[Activity Update] 👥 Participants:`, participants.map(p => `${p.id} (${p.firstName || p.username})`).join(', '));
      } else {
        console.log(`[Activity Update] ⚠️  WARNING: No participants found! The web app may not have registered users in this session.`);
      }
      
      if (participants.length > 0) {
        // Create the activity event to broadcast
        const activityEvent = {
          type: 'participant-activity',
          sessionId,
          userId,
          username: user?.username || null,
          firstName: user?.firstName || null,
          profileImageUrl: user?.profileImageUrl || null,
          status,
          timestamp: actualTimestamp,
        };

        // Broadcast to all OTHER participants (not the user themselves)
        let alertsQueued = 0;
        let notifiedOtherParticipants = false;
        for (const participant of participants) {
          if (participant.id !== userId) {
            notifiedOtherParticipants = true;
            // Send via WebSocket for web app
            sessionManager.sendToUser(participant.id, activityEvent);
            console.log(`[Activity Update] 📡 WebSocket notified ${participant.id} about ${userId}'s ${status} status`);
            
            // Queue for desktop app polling (only idle/distracted, not active)
            if (status === 'idle' || status === 'distracted') {
              sessionManager.queueAlertForUser(participant.id, {
                type: 'participant-activity',
                alertingUserId: userId,
                alertingUsername: user?.username || null,
                alertingFirstName: user?.firstName || null,
                status,
                sessionId,
                timestamp: actualTimestamp,
              });
              alertsQueued++;
              console.log(`[Activity Update] 🔔 Queued alert for participant ${participant.id} (${participant.firstName || participant.username}) about ${userId}'s ${status} status`);
            }
          }
        }
        console.log(`[Activity Update] ✅ Queued ${alertsQueued} desktop alerts total`);

        // Private stats: idle only when partners were actually notified (not warning-only path);
        // distraction when user reached distracted and others were notified.
        if (
          notifiedOtherParticipants &&
          (status === "idle" || status === "distracted")
        ) {
          try {
            await storage.recordFocusStatEvent(
              userId,
              sessionId,
              status === "idle" ? "idle_broadcast" : "distraction_broadcast",
            );
          } catch (statErr) {
            console.error("[Activity Update] Failed to record focus stat event:", statErr);
          }
        }
      } else {
        console.log(`[Activity Update] No participants found in session ${sessionId} - check if session exists`);
      }

      res.json({ 
        success: true, 
        noteTakingMode: false,
        message: "Activity state received and broadcast",
        data: { userId, sessionId, status, timestamp }
      });
    } catch (error: any) {
      console.error("Error processing activity update:", error);
      res.status(500).json({ message: error.message || "Failed to process activity update" });
    }
  });

  // GET /api/focus-stats — Totals for desktop/extension (query userId; same shape as before)
  app.get("/api/focus-stats", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ message: "userId required" });
      }
      const totals = await storage.getFocusStatsTotals(userId);
      res.json({
        idleWarningCount: totals.idleWarningCount,
        distractionCount: totals.distractionCount,
      });
    } catch (error: any) {
      console.error("Error fetching focus stats:", error);
      res.status(500).json({ message: error.message || "Failed to fetch focus stats" });
    }
  });

  // GET /api/focus-stats/daily — Authenticated daily series for web "Your stats" chart
  app.get("/api/focus-stats/daily", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const longOnly =
        String(req.query.longSessionsOnly ?? "false").toLowerCase() === "true";
      const series = await storage.getFocusStatsDailyDistractions(userId, {
        longSessionsOnly: longOnly,
      });
      res.json({ longSessionsOnly: longOnly, series });
    } catch (error: any) {
      console.error("Error fetching daily focus stats:", error);
      res.status(500).json({ message: error.message || "Failed to fetch daily focus stats" });
    }
  });

  // POST /api/desktop/apps — Classify foreground app / domain for desktop app & browser extension.
  // IMPORTANT: This must NOT broadcast session activity or queue partner alerts. The Tauri app shows
  // a local 10s warning first; only POST /api/activity/update with status "distracted" should
  // notify other participants (after the client timer completes).
  app.post('/api/desktop/classify-target', async (req, res) => {
    try {
      const { userId, target, isBrowser } = req.body as {
        userId?: string;
        target?: string;
        isBrowser?: boolean;
      };

      const normalizedTarget =
        target != null && String(target).trim() !== '' ? String(target).trim() : '';
      if (!userId || !normalizedTarget) {
        return res.status(400).json({
          success: false,
          message: 'userId and target are required',
        });
      }

      const { isAppDistractingForUser } = await import('./app-categorizer');
      const browserHint =
        typeof isBrowser === 'boolean' ? isBrowser : undefined;
      const distracting = await isAppDistractingForUser(
        normalizedTarget,
        String(userId),
        { isBrowser: browserHint },
      );
      return res.json({ success: true, distracting });
    } catch (error: any) {
      console.error('Error in POST /api/desktop/classify-target:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to classify target',
      });
    }
  });

  app.post('/api/desktop/apps', async (req, res) => {
    try {
      const { userId, apps, foregroundApp, domain, source, foregroundProcess, extensionId } = req.body as {
        userId?: string;
        apps?: string[];
        foregroundApp?: string;
        /** Website-capable extension sends `domain`; desktop/ext-only sources send `foregroundApp` */
        domain?: string;
        /** `browserExtension` | `browserExtensionExtension` | `desktopNative` */
        source?: string;
        /** Desktop: OS browser bundle name (e.g. Google Chrome) while `foregroundApp` is classify target */
        foregroundProcess?: string;
        /** Optional extension id when source is browserExtensionExtension */
        extensionId?: string;
      };

      const effectiveForeground =
        source === 'browserExtension' && domain != null && String(domain).trim() !== ''
          ? String(domain).trim()
          : foregroundApp != null && String(foregroundApp).trim() !== ''
            ? String(foregroundApp).trim()
            : '';

      const processForBrowserGuard =
        source === 'desktopNative' &&
        foregroundProcess != null &&
        String(foregroundProcess).trim() !== ''
          ? String(foregroundProcess).trim()
          : effectiveForeground;

      if (!userId || !effectiveForeground) {
        return res.status(400).json({
          success: false,
          message: 'userId and (foregroundApp or domain for browserExtension) are required',
        });
      }

      const {
        isAppDistractingForUser,
        getDistractingAppsForUser,
        getAllowedAppsForUser,
      } = await import('./app-categorizer');

      const isForegroundBlocked = await isAppDistractingForUser(String(effectiveForeground), userId);

      // Extension: tab domain only — own currentDistraction for the session poll.
      // desktopNative: classify the foreground app for Tauri, but do NOT wipe extension state
      // when the foreground is a browser (e.g. Chess → Chrome would clear YouTube otherwise).
      const fromExtension =
        source === 'browserExtension' ||
        source === 'browserExtensionExtension' ||
        (source !== 'desktopNative' &&
          isLikelyBrowserExtensionHostname(String(effectiveForeground)));
      if (fromExtension) {
        if (source === 'browserExtensionExtension' && extensionId) {
          console.log(
            `[Desktop Apps] browserExtensionExtension report extensionId=${String(extensionId)} foregroundApp=${String(effectiveForeground)}`
          );
        }
        sessionManager.reportBrowserForegroundDomain(
          String(userId),
          String(effectiveForeground),
          isForegroundBlocked,
        );
      } else if (!isBrowserProcessForegroundName(String(processForBrowserGuard))) {
        sessionManager.clearBrowserForegroundDistraction(String(userId));
      }
      const appList = Array.isArray(apps) ? apps : [];
      const blockedRunning: string[] = [];
      for (const name of appList) {
        if (await isAppDistractingForUser(String(name), userId)) {
          blockedRunning.push(String(name));
        }
      }

      const distractingApps = await getDistractingAppsForUser(userId);
      const allowedApps = await getAllowedAppsForUser(userId);

      res.json({
        success: true,
        isForegroundBlocked,
        blockedRunning,
        allowedApps,
        blockedApps: distractingApps,
      });
    } catch (error: any) {
      console.error('Error in POST /api/desktop/apps:', error);
      res.status(500).json({ success: false, message: error.message || 'Failed to classify apps' });
    }
  });

  // =====================================
  // APP RULES (User app allow/block settings)
  // =====================================

  // GET /api/app-rules - Get user's app rules
  app.get('/api/app-rules', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { getDistractingAppsForUser, getAllowedAppsForUser } = await import('./app-categorizer');
      
      const distractingApps = await getDistractingAppsForUser(userId);
      const allowedApps = await getAllowedAppsForUser(userId);
      
      // Get user's custom rules
      const { userAppRules } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');
      const rules = await db.select().from(userAppRules).where(eq(userAppRules.userId, userId));
      
      res.json({
        distractingApps,
        allowedApps,
        customRules: rules.map(r => ({ appName: r.appName, rule: r.rule })),
      });
    } catch (error: any) {
      console.error("Error fetching app rules:", error);
      res.status(500).json({ message: "Failed to fetch app rules" });
    }
  });

  // POST /api/app-rules - Set an app rule (allow or block)
  app.post('/api/app-rules', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { appName, rule } = req.body;
      
      if (!appName || !rule) {
        return res.status(400).json({ message: "appName and rule are required" });
      }
      
      if (!['allowed', 'blocked'].includes(rule)) {
        return res.status(400).json({ message: "rule must be 'allowed' or 'blocked'" });
      }
      
      const { setUserAppRule } = await import('./app-categorizer');
      await setUserAppRule(userId, appName, rule);
      
      res.json({ success: true, message: `App "${appName}" set to ${rule}` });
    } catch (error: any) {
      console.error("Error setting app rule:", error);
      res.status(500).json({ message: "Failed to set app rule" });
    }
  });

  // DELETE /api/app-rules/:appName - Remove an app rule
  app.delete('/api/app-rules/:appName', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const appName = decodeURIComponent(req.params.appName);
      
      const { removeUserAppRule } = await import('./app-categorizer');
      await removeUserAppRule(userId, appName);
      
      res.json({ success: true, message: `Rule for "${appName}" removed` });
    } catch (error: any) {
      console.error("Error removing app rule:", error);
      res.status(500).json({ message: "Failed to remove app rule" });
    }
  });

  // POST /api/app-categorize - Categorize an app (for testing/admin)
  app.post('/api/app-categorize', async (req, res) => {
    try {
      const { appName } = req.body;
      
      if (!appName) {
        return res.status(400).json({ message: "appName is required" });
      }
      
      const { getAppCategory } = await import('./app-categorizer');
      const category = await getAppCategory(appName);
      
      res.json({ appName, category });
    } catch (error: any) {
      console.error("Error categorizing app:", error);
      res.status(500).json({ message: "Failed to categorize app" });
    }
  });

  // Setup River RPC server with the passed-in server
  setupRiverServer(server);
}
