# FocusSession - Video Co-Working App

## Overview
A Focusmate-style focused work session web app with calendar-based booking. Users schedule Solo (1-on-1) or Group (2-5 people) sessions in advance, then join video/screen-sharing work sessions with accountability partners.

## Tech Stack
- **Frontend**: React with TypeScript, Vite, Tailwind CSS, Shadcn UI
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Real-time**: Replit River RPC over WebSocket
- **Video**: WebRTC peer-to-peer mesh networking (with STUN servers)
- **Auth**: Replit Auth (OpenID Connect)

## Key Features
1. **Calendar-Based Booking**: Schedule work sessions in advance (Solo 1-on-1 or Group 2-5 people)
2. **Session Type Filtering**: Filter scheduled sessions by type (All, Solo, Group)
3. **URL Pre-selection**: Deep linking to calendar with session type pre-selected (?type=solo or ?type=group)
4. **Video Calls**: WebRTC-powered video/audio chat with P2P mesh networking (optimized for up to 5 participants)
5. **Screen Sharing**: Share your screen with session partners
6. **Friend System**: Add users as friends after sessions
7. **Session History**: Track past sessions with match history
8. **Join Sessions**: Browse and join available sessions created by other users

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
1. User navigates to Calendar page (from Solo/Group cards on home with ?type parameter for pre-selection)
2. User schedules a new session or joins an existing session
3. User clicks "Join Session" → navigates to /session/:sessionId
4. **Pre-session countdown**: Shows countdown timer and participant list before session starts
5. **Auto-entry**: When session time is reached, automatically enters the session
6. **WebRTC initialization**: Session client connects to River WebSocket, establishes P2P mesh connections
7. **Media streams**: Camera, microphone, and screen sharing (with optional blur) activated
8. **Active session**: Video call with controls (mute, camera, timer, participant names)
9. **Late joiners/early leavers**: Handled dynamically via WebRTC mesh renegotiation
10. **Session end**: User clicks "End Session" → shows post-session summary with duration
11. **Session logging**: Completion logged to server for history tracking
