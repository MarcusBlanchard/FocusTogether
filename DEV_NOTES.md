# FocusTogether - Development Notes

## Architecture Overview

### Desktop Shell: Tauri
- **Location**: `src-tauri/`
- **Language**: Rust
- **Purpose**: Native system access (process monitoring, idle detection)
- **Version**: Tauri v1.5

### Frontend: React + TypeScript + Vite
- **Location**: `client/src/`
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **State Management**: TanStack Query
- **UI**: Tailwind CSS + Shadcn UI components

### Backend: Express API (Replit-hosted)
- **Location**: `server/`
- **Hosting**: Remote Replit server (NOT local)
- **Protocol**: HTTPS only
- **Database**: PostgreSQL (Neon)
- **Real-time**: River RPC over WebSocket

## Critical Boundaries

### ✅ What Runs in Rust (Tauri)
- `get_running_apps()` - Lists all running processes
- `get_idle_seconds()` - Detects user idle time
- **NO system scanning logic exists in frontend JavaScript**

### ✅ What Runs in React
- UI rendering and user interactions
- API calls to remote backend
- State management and data fetching
- Distraction detection logic (compares process names against configurable list)

### ✅ System Access Rules
- **Frontend CANNOT access system directly**
- **Frontend MUST use Tauri commands**: `invoke('get_running_apps')` and `invoke('get_idle_seconds')`
- All system monitoring happens in Rust, exposed via Tauri commands

## Alert Flow (End-to-End)

1. **Monitoring** (React hook: `useProductivityMonitor`)
   - Polls Tauri commands every 5 seconds during active sessions
   - Checks for idle time (>60 seconds) and distracting apps

2. **Detection** (React hook: `useDistractionAlerts`)
   - Compares detected state against thresholds
   - Applies 30-second cooldown to prevent spam

3. **Alert Sending** (React → Backend)
   - POST to `/api/sessions/distraction-alert`
   - Includes: `sessionId`, `userId`, `type`, `idleSeconds` or `apps`

4. **Backend Processing** (`server/routes.ts`)
   - Validates user is session participant
   - Calls `sessionManager.notifyDistractionAlert()`

5. **Partner Notification** (`server/session-manager.ts`)
   - Sends WebSocket event to all other participants
   - Creates persistent database notification
   - Event type: `distraction-alert`

6. **Frontend Reception** (React: `session-client.ts`)
   - Listens for `distraction-alert` events
   - Updates UI/notifications accordingly

## Session Safety Logic

### Monitoring Activation
- **ONLY runs when**: `sessionStatus === 'active'`
- **Location**: `client/src/pages/session.tsx` line 67-72
- **Hook**: `useDistractionAlerts({ enabled: isMonitoringActive, ... })`

### Monitoring Deactivation
- **Stops immediately when**:
  - Session ends (`sessionStatus !== 'active'`)
  - User leaves session
  - Component unmounts

### Alert Cooldown
- **Minimum 30 seconds** between alerts of the same type
- Prevents duplicate spam
- Separate cooldowns for `idle` and `distracting_apps` alerts

## Failure Modes & Graceful Fallbacks

### Tauri Unavailable (Web Browser Mode)
- **Detection**: `checkTauriAvailable()` checks for `__TAURI_INTERNALS__`
- **Behavior**: Monitoring silently disabled, no errors thrown
- **Location**: `client/src/hooks/useProductivityMonitor.ts` line 51-59

### Backend Unreachable
- **Error Handling**: Try/catch in `sendDistractionAlert()`
- **Behavior**: Logs error, does not crash app
- **Location**: `client/src/hooks/useDistractionAlerts.ts` line 88-99

### Tauri Command Failures
- **Error Handling**: Try/catch in `updateState()`
- **Behavior**: Logs error, continues polling
- **Location**: `client/src/hooks/useProductivityMonitor.ts` line 87-89

## API Configuration

### Base URL
- **Source**: `import.meta.env.VITE_API_BASE_URL`
- **Fallback**: `http://localhost:5000` (dev only)
- **Location**: `client/src/lib/config.ts`
- **Usage**: All API calls use `config.apiBaseUrl`

### CORS Configuration
- **Location**: `server/app.ts` line 30-50
- **Allowed Origins**:
  - `http://localhost:5173` (Vite dev server)
  - `http://localhost:3000` (alternative dev port)
  - Tauri desktop app (no origin header)
- **Credentials**: Enabled for session cookies

## Tauri Command Whitelisting

### Custom Commands
- Commands are automatically whitelisted when registered with `invoke_handler`
- **Registered commands**: `get_running_apps`, `get_idle_seconds`
- **Location**: `src-tauri/src/main.rs` line 39

### Tauri API Allowlist
- **HTTP**: Allowed for `https://**` (backend API)
- **Shell**: `open` command only
- **Location**: `src-tauri/tauri.conf.json` line 14-24

## What NOT to Touch

### ❌ DO NOT:
1. Add system scanning logic to frontend JavaScript
2. Hardcode backend URLs (use `VITE_API_BASE_URL`)
3. Remove Tauri availability checks
4. Change monitoring activation logic (must only run during active sessions)
5. Reduce alert cooldown below 30 seconds
6. Modify Rust dependencies without updating Cargo.toml
7. Change Tauri version without updating both package.json and Cargo.toml

### ✅ DO:
1. Use Tauri commands for all system access
2. Check `isTauriAvailable` before invoking commands
3. Handle errors gracefully (try/catch, no crashes)
4. Use environment variables for configuration
5. Follow existing error handling patterns

## Environment Variables

### Frontend (.env.development)
```
VITE_API_BASE_URL=https://[your-app].replit.app
```

### Backend (Replit)
- `PORT` - Server port (default: 5000)
- `METERED_API_KEY` - TURN credentials (optional)
- Database connection via Neon

## Testing Checklist

- [ ] Monitoring only runs during active sessions
- [ ] Monitoring stops when session ends
- [ ] Tauri commands work in desktop app
- [ ] Graceful fallback when Tauri unavailable (web mode)
- [ ] Alerts sent to backend correctly
- [ ] Partners receive notifications
- [ ] Alert cooldown prevents spam
- [ ] CORS allows Tauri desktop app requests
- [ ] API base URL from environment variable

## Build Commands

```bash
# Development (frontend only)
npm run dev

# Tauri development (desktop app)
npm run tauri:dev

# Production build
npm run build

# Tauri production build
npm run tauri:build
```

