# FocusSession - Video Co-Working App

## Overview
A Focusmate-style focused work session web app where users can be randomly matched for video/screen-sharing work sessions or invite friends directly.

## Tech Stack
- **Frontend**: React with TypeScript, Vite, Tailwind CSS, Shadcn UI
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Real-time**: Replit River RPC over WebSocket
- **Video**: WebRTC peer-to-peer (with STUN servers)
- **Auth**: Replit Auth (OpenID Connect)

## Key Features
1. **Random Matching**: Join a queue to be paired with another user
2. **Calendar & Scheduling**: Schedule work sessions in advance with session types (solo 1-on-1, group up to 5, free rooms up to 10)
3. **Video Calls**: WebRTC-powered video/audio chat
4. **Screen Sharing**: Share your screen with your session partner
5. **Friend System**: Add users as friends after sessions
6. **Invite Friends**: Directly invite friends to sessions
7. **Session History**: Track past sessions with match history

## Project Structure
```
├── client/src/
│   ├── pages/           # Landing, Home, Waiting, Session, Friends, History, Search, Profile, Calendar
│   ├── components/ui/   # Shadcn UI components
│   ├── hooks/           # useAuth, use-toast
│   ├── lib/             # queryClient, webrtc, session-client
├── server/
│   ├── index-dev.ts     # Development entry point
│   ├── routes.ts        # Express API routes
│   ├── storage.ts       # Database operations (PostgreSQL with Drizzle)
│   ├── river-server.ts  # River RPC WebSocket server
│   ├── session-manager.ts # Queue management, matching logic
│   └── replitAuth.ts    # Replit Auth middleware
├── shared/
│   ├── schema.ts        # Drizzle ORM schemas
│   └── river-schema.ts  # River RPC type definitions
```

## Database Schema
- **users**: User profiles (id, email, username, first/last name, profile image)
- **focus_sessions**: Completed work session records (user1Id, user2Id, startedAt, endedAt, duration)
- **friends**: Bidirectional friendship relations (userId, friendId)
- **scheduled_sessions**: Calendar sessions (hostId, sessionType, title, description, capacity, startAt, endAt, status)
- **scheduled_session_participants**: Tracks participants in scheduled sessions (sessionId, userId, role, status)

## API Endpoints

### Authentication & Users
- `GET /api/auth/user` - Get current user
- `PATCH /api/user/username` - Update username
- `GET /api/users/search` - Search users by username

### Friends
- `GET /api/friends` - Get friends list
- `POST /api/friends` - Add friend
- `DELETE /api/friends/:friendId` - Remove friend
- `GET /api/friends/:friendId/check` - Check if users are friends

### Random Matching Sessions
- `GET /api/sessions/history` - Get session history
- `POST /api/sessions/join-queue` - Join matching queue
- `POST /api/sessions/leave-queue` - Leave matching queue
- `POST /api/sessions/invite` - Invite friend to session

### Scheduled Sessions (Calendar)
- `POST /api/scheduled-sessions` - Create a scheduled session
- `GET /api/scheduled-sessions` - Get sessions in a date range
- `GET /api/scheduled-sessions/my-sessions` - Get user's scheduled sessions
- `GET /api/scheduled-sessions/:sessionId` - Get specific session details
- `POST /api/scheduled-sessions/:sessionId/join` - Join a scheduled session
- `POST /api/scheduled-sessions/:sessionId/leave` - Leave a scheduled session
- `GET /api/scheduled-sessions/occupancy` - Get occupancy count for time range

## WebSocket Events (via River RPC)
- `matched` - Session partner found
- `partner-disconnected` - Partner left session
- `invite-received` - Friend invite received
- `invite-response` - Friend accepted/declined invite
- `signal` - WebRTC signaling (offer/answer/ICE)

## WebRTC Configuration
Uses Google and Cloudflare STUN servers for NAT traversal:
- stun:stun.l.google.com:19302
- stun:stun1.l.google.com:19302
- stun:stun.cloudflare.com:3478

## Running the App
```bash
npm run dev  # Starts both backend (Express) and frontend (Vite)
```

The app runs on port 5000.

## Session Flow
1. User clicks "Start Session" → navigates to /waiting
2. Session client connects to River WebSocket
3. User is added to matching queue
4. When matched, both users receive 'matched' event
5. Navigate to /session/:sessionId
6. WebRTC connection established via signaling
7. Video call active until one user ends session
