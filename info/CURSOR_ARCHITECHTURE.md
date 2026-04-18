# FocusTogether Architecture Guide for Cursor

This document explains how the FocusTogether project is set up so the Cursor AI assistant understands the architecture when working on the Tauri desktop app.

## Project Split

FocusTogether consists of **two separate codebases**:

### 1. Web Application (Hosted on Replit)
- **Location**: Replit cloud environment
- **Cannot be edited from Cursor** - changes must be made on Replit
- **Stack**: React + TypeScript frontend, Express.js backend, PostgreSQL database
- **URL (production default in desktop/extension builds)**: `https://flowlocked.com`. For a dev/staging backend, set env `BACKEND_URL` (Tauri) or extension storage `apiBaseOverride`.

### 2. Desktop Application (Developed in Cursor)
- **Location**: Local machine, edited in Cursor
- **Framework**: Tauri (Rust + web technologies)
- **Purpose**: Idle detection and activity monitoring ONLY
- **Has NO user interface** - runs in the background
- **Has NO login functionality** - uses userId from web app

## How the Desktop App Communicates with the Backend

The desktop app is a **monitoring-only client** that:

1. **Polls for active sessions** every 5 seconds:
   ```
   GET /api/activity/session?userId={userId}
   ```
   Response:
   ```json
   {
     "sessionId": "uuid-here" | null,
     "active": true | false,
     "pendingAlerts": [
       {
         "participantId": "123",
         "username": "john",
         "firstName": "John",
         "status": "idle" | "distracted"
       }
     ]
   }
   ```

2. **Reports user activity status**:
   ```
   POST /api/activity/update
   ```
   Body:
   ```json
   {
     "userId": "user-id",
     "sessionId": "session-uuid",
     "status": "active" | "idle" | "distracted"
   }
   ```

3. **Shows desktop notifications** when `pendingAlerts` contains items

## Key Points for Cursor

1. **You cannot modify the Replit web app** - The backend APIs are defined in Replit. If you need API changes, tell the user to make them on Replit.

2. **The desktop app has no UI** - It runs as a background process, only showing system tray icon and native notifications.

3. **No authentication in desktop app** - The userId is obtained from the web app (stored in a config file or passed via deep link). The desktop app trusts this ID.

4. **Browser notifications are disabled** - The web app does NOT show browser push notifications. The desktop Tauri app is responsible for showing native system notifications when participants become idle/distracted.

5. **Activity detection** - The desktop app monitors:
   - Mouse movement
   - Keyboard activity
   - Active window focus
   And reports "idle" if no activity for X seconds, "distracted" if user is in a non-work app.

## API Endpoints Used by Desktop App

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/activity/session?userId=X` | GET | Check if user is in active session, get pending alerts |
| `/api/activity/update` | POST | Report activity status (active/idle/distracted) |

## Backend URL

Production API base:
```
https://flowlocked.com
```

Override for local or staging via `BACKEND_URL` / persisted `backend_url` (desktop) or `apiBaseOverride` (extension).

## Session Flow

1. User books/joins session on **web app** (Replit)
2. Desktop app polls `/api/activity/session` and detects active session
3. Desktop app starts monitoring user activity
4. Desktop app reports status via `/api/activity/update`
5. If other participants become idle/distracted, desktop app receives `pendingAlerts`
6. Desktop app shows native notification for each alert
7. When session ends, desktop app stops monitoring
