# FocusSession - Video Co-Working App

## Overview
A Focusmate-style focused work session web app with calendar-based booking. Users schedule Solo (1-on-1) or Group (2-5 people) sessions in advance, then join video/screen-sharing work sessions with accountability partners.

## Tech Stack
- **Frontend**: React with TypeScript, Vite, Tailwind CSS, Shadcn UI
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Real-time**: Replit River RPC over WebSocket
- **Video**: LiveKit Cloud (managed WebRTC service)
- **Auth**: Replit Auth (OpenID Connect)

## Key Features
1. **Calendar-Based Booking**: Schedule work sessions in advance with three booking preferences (Desk, Active, Any) and three session lengths (20, 40, 60 minutes)
2. **Auto-Matching**: Automatically matches users when they book the same time slot, same duration, and compatible preferences
3. **Week-View Calendar**: Interactive week calendar showing all bookings across 7 days with hourly time slots
4. **Booking Preferences**: Three work styles with smart matching (Desk ↔ Desk/Any, Active ↔ Active/Any, Any ↔ all)
5. **Session Type Filtering**: Filter scheduled sessions by type (All, Solo, Group)
6. **URL Pre-selection**: Deep linking to calendar with session type pre-selected (?type=solo or ?type=group)
7. **Video Calls**: LiveKit-powered video/audio with managed infrastructure (optimized for up to 5 participants)
8. **Screen Sharing**: Share your screen with session partners
9. **Friend System**: Add users as friends after sessions
10. **Session History**: Track past sessions with match history

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
- **scheduled_sessions**: Calendar sessions (hostId, sessionType, bookingPreference, durationMinutes, title, description, capacity, startAt, endAt, status)
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

### Sessions
- `GET /api/sessions/history` - Get session history
- `POST /api/sessions/invite` - Invite friend to session

### Scheduled Sessions (Calendar)
- `POST /api/scheduled-sessions` - Create a scheduled session (with auto-matching)
- `GET /api/scheduled-sessions` - Get sessions in a date range
- `GET /api/scheduled-sessions/my-sessions` - Get user's scheduled sessions
- `GET /api/scheduled-sessions/:sessionId` - Get specific session details
- `POST /api/scheduled-sessions/:sessionId/join` - Join a scheduled session
- `POST /api/scheduled-sessions/:sessionId/leave` - Leave a scheduled session
- `GET /api/scheduled-sessions/occupancy` - Get occupancy count for time range

## API Endpoints (continued)

### LiveKit Video
- `POST /api/livekit/token` - Generate room token for video session (requires session membership)

## WebSocket Events (via River RPC)
- `matched` - Session partner found
- `partner-disconnected` - Partner left session
- `invite-received` - Friend invite received
- `invite-response` - Friend accepted/declined invite
- `signal` - WebRTC signaling (legacy, preserved for compatibility)

## Video Infrastructure
LiveKit Cloud handles all WebRTC complexity:
- Manages STUN/TURN servers automatically
- Handles NAT traversal and connectivity
- Provides reliable video/audio streaming
- Environment variables: LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL

## Running the App
```bash
npm run dev  # Starts both backend (Express) and frontend (Vite)
```

The app runs on port 5000.

## Session Flow
1. User navigates to Calendar page (from Solo/Group cards on home with ?type parameter for pre-selection)
2. **Week-view calendar**: Shows 7-day week with hourly time slots (8 AM - 9 PM)
3. **Time slot selection**: User clicks on a time slot to open booking dialog
4. **Booking configuration**: User selects:
   - Session type (Solo or Group)
   - Booking preference (Desk, Active, or Any)
   - Duration (20, 40, or 60 minutes)
   - Optional title and description
5. **Auto-matching**: When booking is created, server checks for compatible bookings:
   - Same start time
   - Same duration
   - Compatible preference (Desk ↔ Desk/Any, Active ↔ Active/Any, Any ↔ all)
   - If match found: User automatically joins existing session
   - If no match: New booking created, waiting for others
6. User navigates to /session/:sessionId (either matched or from calendar view)
7. **Pre-session countdown**: Shows countdown timer and participant list before session starts
8. **Auto-entry**: When session time is reached, automatically enters the session
9. **WebRTC initialization**: Session client connects to River WebSocket, establishes P2P mesh connections
10. **Media streams**: Camera, microphone, and screen sharing (with optional blur) activated
11. **Active session**: Video call with controls (mute, camera, timer, participant names)
12. **Late joiners/early leavers**: Handled dynamically via WebRTC mesh renegotiation
13. **Session end**: User clicks "End Session" → shows post-session summary with duration
14. **Session logging**: Completion logged to server for history tracking

## Recent Changes (December 2024)
- **Migrated from P2P WebRTC mesh to LiveKit Cloud** for more reliable video connections
- LiveKit handles STUN/TURN servers, NAT traversal, and reconnection automatically
- Token endpoint added with session membership verification for security
- LiveKitSession component replaces custom mesh networking code
