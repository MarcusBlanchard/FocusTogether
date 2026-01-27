# Tauri Setup for FocusTogether

This document describes the productivity monitoring features added to the FocusTogether desktop app.

## Features Added

### 1. System Monitoring (Rust Backend)
- **Running Apps Detection**: Lists all running processes on the user's computer
- **Idle Time Detection**: Tracks how long since last mouse/keyboard activity
- Implemented in `src-tauri/src/main.rs` with Tauri commands:
  - `get_running_apps()` - Returns list of process names
  - `get_idle_seconds()` - Returns seconds since last activity

### 2. Distraction Detection (Frontend)
- **Configurable Distracting Apps**: User can customize list of distracting apps (stored in localStorage)
- Default distracting apps include: YouTube, Netflix, Spotify, Discord, games, etc.
- **Automatic Detection**: Monitors system state every 5 seconds during active sessions
- **Alert Thresholds**:
  - Idle time: Alerts if user is idle for more than 60 seconds
  - Distracting apps: Alerts if any configured distracting app is running

### 3. Partner Notifications
- When a distraction is detected, alerts are sent to session partners via:
  - Real-time WebSocket notifications
  - Persistent database notifications
- Alert types:
  - `idle`: Partner has been inactive for X minutes
  - `distracting_apps`: Partner has distracting apps open

## Setup Instructions

### 1. Install Tauri Dependencies
```bash
npm install
```

### 2. Build and Run Tauri App
```bash
# Development mode
npm run tauri:dev

# Production build
npm run tauri:build
```

### 3. Environment Configuration
Make sure your `.env.development` has:
```
VITE_API_BASE_URL=https://[your-app].replit.app
```

### 4. Icons
You'll need to add app icons to `src-tauri/icons/`:
- `32x32.png`
- `128x128.png`
- `128x128@2x.png`
- `icon.icns` (macOS)
- `icon.ico` (Windows)

You can generate these using tools like [Tauri Icon Generator](https://tauri.app/v1/guides/building/icon) or create them manually.

## How It Works

1. **During Active Sessions**: The `useDistractionAlerts` hook monitors system state
2. **Detection**: Checks for idle time and distracting apps every 5 seconds
3. **Alerting**: When detected, sends POST request to `/api/sessions/distraction-alert`
4. **Notification**: Backend notifies all other session participants via WebSocket and creates database notifications
5. **Cooldown**: Alerts are rate-limited (30 seconds between alerts of the same type)

## Customizing Distracting Apps

The distracting apps list is stored in browser localStorage. Users can customize it through the app (you may want to add a settings UI for this). The default list includes common distractions like:
- YouTube, Netflix, Spotify
- Social media: Twitter, Instagram, Facebook, TikTok, Reddit
- Games: Steam, Epic Games, League of Legends, Valorant, Minecraft
- Communication: Discord, Slack

## API Endpoints

### POST `/api/sessions/distraction-alert`
Sends a distraction alert to session partners.

**Request Body:**
```json
{
  "sessionId": "string",
  "type": "idle" | "distracting_apps",
  "idleSeconds": 120,  // for idle type
  "apps": ["youtube", "netflix"]  // for distracting_apps type
}
```

**Response:**
```json
{
  "success": true
}
```

## Notes

- Monitoring only runs during active sessions (when `sessionStatus === 'active'`)
- Tauri commands are only available when running as a Tauri app (not in web browser)
- The system gracefully handles cases where Tauri is not available (web mode)

