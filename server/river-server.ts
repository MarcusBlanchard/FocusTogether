import { createServer } from '@replit/river';
import { createServiceSchema, Procedure, Ok } from '@replit/river';
import { WebSocketServerTransport } from '@replit/river/transport/ws/server';
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { sessionManager } from './session-manager';
import { storage } from './storage';
import * as schema from '@shared/river-schema';

// Map to track WebSocket connections by user ID
const userConnections = new Map<string, WebSocket>();
const connectionToUser = new Map<WebSocket, string>();

// Service schema for focus session operations
const SessionServiceSchema = createServiceSchema();

export const SessionService = SessionServiceSchema.define(
  {
    initializeState: () => ({ connectedAt: Date.now() }),
  },
  {
    // Join the random matching queue
    joinQueue: Procedure.rpc({
      requestInit: schema.JoinQueueRequest,
      responseData: schema.JoinQueueResponse,
      async handler({ reqInit }) {
        const result = await sessionManager.joinQueue(reqInit.userId);
        return Ok(result);
      },
    }),

    // Leave the queue
    leaveQueue: Procedure.rpc({
      requestInit: schema.LeaveQueueRequest,
      responseData: schema.LeaveQueueResponse,
      async handler({ reqInit }) {
        const success = sessionManager.leaveQueue(reqInit.userId);
        return Ok({ success });
      },
    }),

    // Heartbeat to keep connection alive
    heartbeat: Procedure.rpc({
      requestInit: schema.HeartbeatRequest,
      responseData: schema.HeartbeatResponse,
      async handler({ reqInit }) {
        sessionManager.registerUser(reqInit.userId);
        const acknowledged = sessionManager.heartbeat(reqInit.userId);
        return Ok({ acknowledged, serverTime: Date.now() });
      },
    }),

    // Disconnect and cleanup
    disconnect: Procedure.rpc({
      requestInit: schema.DisconnectRequest,
      responseData: schema.DisconnectResponse,
      async handler({ reqInit }) {
        await sessionManager.disconnect(reqInit.userId);
        return Ok({ success: true });
      },
    }),

    // Send WebRTC signal to partner
    sendSignal: Procedure.rpc({
      requestInit: schema.SendSignalRequest,
      responseData: schema.SendSignalResponse,
      async handler({ reqInit }) {
        // Find the partner for this session
        const partnerId = sessionManager.getPartnerId(reqInit.sessionId);
        if (!partnerId) {
          return Ok({ delivered: false });
        }

        // Send signal to partner via their WebSocket
        const partnerWs = userConnections.get(partnerId);
        if (partnerWs && partnerWs.readyState === WebSocket.OPEN) {
          partnerWs.send(JSON.stringify({
            type: 'signal',
            signal: reqInit,
          }));
          return Ok({ delivered: true });
        }
        return Ok({ delivered: false });
      },
    }),

    // Add friend
    addFriend: Procedure.rpc({
      requestInit: schema.AddFriendRequest,
      responseData: schema.AddFriendResponse,
      async handler({ reqInit }) {
        try {
          // Check if already friends
          const alreadyFriends = await storage.areFriends(reqInit.userId, reqInit.friendId);
          if (alreadyFriends) {
            return Ok({ success: false, message: 'Already friends' });
          }

          await storage.addFriend(reqInit.userId, reqInit.friendId);
          return Ok({ success: true });
        } catch (error) {
          return Ok({ success: false, message: String(error) });
        }
      },
    }),

    // Remove friend
    removeFriend: Procedure.rpc({
      requestInit: schema.RemoveFriendRequest,
      responseData: schema.RemoveFriendResponse,
      async handler({ reqInit }) {
        try {
          await storage.removeFriend(reqInit.userId, reqInit.friendId);
          return Ok({ success: true });
        } catch (error) {
          return Ok({ success: false });
        }
      },
    }),

    // Get friends list with online status
    getFriends: Procedure.rpc({
      requestInit: schema.GetFriendsRequest,
      responseData: schema.GetFriendsResponse,
      async handler({ reqInit }) {
        try {
          const friends = await storage.getFriends(reqInit.userId);
          const onlineStatus = sessionManager.getOnlineStatus(friends.map(f => f.id));
          
          const friendsWithStatus = friends.map(friend => ({
            id: friend.id,
            username: friend.username,
            profileImageUrl: friend.profileImageUrl,
            isOnline: onlineStatus.get(friend.id)?.isOnline ?? false,
            isIdle: onlineStatus.get(friend.id)?.isIdle ?? false,
          }));

          return Ok({ friends: friendsWithStatus });
        } catch (error) {
          return Ok({ friends: [] as { id: string; username: string | null; profileImageUrl: string | null; isOnline: boolean; isIdle: boolean; }[] });
        }
      },
    }),

    // Invite a friend to a session
    inviteFriend: Procedure.rpc({
      requestInit: schema.InviteFriendRequest,
      responseData: schema.InviteFriendResponse,
      async handler({ reqInit }) {
        const result = await sessionManager.inviteFriend(reqInit.userId, reqInit.friendId);
        if (result.status === 'sent') {
          return Ok({ status: 'sent', friendId: result.friendId! });
        } else if (result.status === 'offline') {
          return Ok({ status: 'offline' });
        } else {
          return Ok({ status: 'declined' });
        }
      },
    }),

    // Respond to a friend invite
    respondToInvite: Procedure.rpc({
      requestInit: schema.RespondToInviteRequest,
      responseData: schema.RespondToInviteResponse,
      async handler({ reqInit }) {
        const result = await sessionManager.respondToInvite(
          reqInit.userId,
          reqInit.inviterId,
          reqInit.accept
        );
        
        if (result.success && result.partner) {
          return Ok({
            success: true,
            sessionId: result.sessionId,
            partner: {
              id: result.partner.id,
              username: result.partner.username,
              profileImageUrl: result.partner.profileImageUrl,
            },
          });
        }
        return Ok({ success: result.success });
      },
    }),
  }
);

export function setupRiverServer(httpServer: Server) {
  // Create WebSocket server on a specific path
  const wss = new WebSocketServer({ 
    server: httpServer, 
    path: '/river'
  });

  // Handle connection events
  wss.on('connection', (ws, req) => {
    console.log('[River] New WebSocket connection');

    // Parse user ID from query string
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const userId = url.searchParams.get('userId');

    if (userId) {
      userConnections.set(userId, ws);
      connectionToUser.set(ws, userId);
      sessionManager.registerUser(userId);
      console.log(`[River] User ${userId} connected`);
    }

    // Handle incoming messages for signaling
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        const senderId = connectionToUser.get(ws);
        
        if (!senderId) {
          console.warn('[River] Received message from unregistered connection');
          return;
        }

        if (message.action === 'sendSignal' && message.sessionId) {
          // Get partner for this session
          const partnerId = sessionManager.getPartnerIdBySession(message.sessionId, senderId);
          
          if (partnerId) {
            const partnerWs = userConnections.get(partnerId);
            if (partnerWs && partnerWs.readyState === WebSocket.OPEN) {
              partnerWs.send(JSON.stringify({
                type: 'signal',
                signal: {
                  type: message.type,
                  sessionId: message.sessionId,
                  data: message.data,
                },
              }));
              console.log(`[River] Forwarded ${message.type} signal from ${senderId} to ${partnerId}`);
            }
          }
        }
      } catch (error) {
        console.error('[River] Error handling message:', error);
      }
    });

    ws.on('close', async () => {
      const disconnectedUserId = connectionToUser.get(ws);
      if (disconnectedUserId) {
        userConnections.delete(disconnectedUserId);
        connectionToUser.delete(ws);
        await sessionManager.disconnect(disconnectedUserId);
        console.log(`[River] User ${disconnectedUserId} disconnected`);
      }
    });

    ws.on('error', (error) => {
      console.error('[River] WebSocket error:', error);
    });
  });

  // Set up event callback for session manager
  sessionManager.setEventCallback((userId: string, event: any) => {
    const ws = userConnections.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  });

  // Create River transport and server
  const transport = new WebSocketServerTransport(wss, 'focus-session-server');
  
  const server = createServer(transport, {
    session: SessionService,
  });

  console.log('[River] Server initialized');

  return server;
}

export type RiverServer = ReturnType<typeof setupRiverServer>;
export type SessionServiceType = typeof SessionService;
