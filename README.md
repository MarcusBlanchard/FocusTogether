# FocusTogether

A Focusmate-style focused work session platform with desktop idle monitoring.

## Project Structure

This repository contains three main components:

### 🖥️ Desktop App (`src-tauri/`)
**Location:** `src-tauri/`  
**Technology:** Tauri (Rust + TypeScript)  
**Purpose:** Native desktop application for idle monitoring and distraction detection  
**Development:** Cursor (local)

- Monitors user idle time and running applications
- Sends activity updates to backend
- Receives and displays notifications when session partners are idle/distracted
- Runs in background without UI

**Key Files:**
- `src-tauri/src/main.rs` - Rust core with Tauri commands
- `src-tauri/tauri.conf.json` - Tauri configuration

### 🌐 Frontend Web App (`client/`)
**Location:** `client/`  
**Technology:** React + TypeScript + Vite  
**Purpose:** Web interface for scheduling sessions, joining calls, managing friends  
**Development:** Replit

- Calendar-based session booking
- Video calls with screen sharing (LiveKit)
- Friend system
- Session history

**Key Files:**
- `client/src/pages/` - Page components
- `client/src/components/` - UI components
- `client/src/hooks/` - React hooks

### ⚙️ Backend API (`server/`)
**Location:** `server/`  
**Technology:** Express.js + TypeScript + PostgreSQL  
**Purpose:** API server for session management, user data, activity tracking  
**Development:** Replit

- REST API endpoints
- WebSocket server (River RPC)
- Database operations (Drizzle ORM)
- Session matching and queue management

**Key Files:**
- `server/routes.ts` - API route handlers
- `server/session-manager.ts` - Session queue and matching logic
- `server/storage.ts` - Database operations

## Getting Started

### Prerequisites
- Node.js 20+
- Rust (for desktop app)
- PostgreSQL database

### Development

**Frontend & Backend (Replit):**
```bash
npm run dev          # Start backend server
npm run dev:vite     # Start frontend dev server
```

**Desktop App (Local):**
```bash
npm run tauri:dev    # Start Tauri desktop app
```

## Environment Variables

Create `.env.development`:
```
VITE_API_BASE_URL=https://your-replit-app.replit.dev
BACKEND_URL=https://your-replit-app.replit.dev
```

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Shadcn UI
- **Backend:** Express.js, TypeScript, PostgreSQL, Drizzle ORM
- **Desktop:** Tauri 1.5, Rust
- **Real-time:** River RPC (WebSocket)
- **Video:** LiveKit Cloud
- **Auth:** Replit Auth (OpenID Connect)

## Development Workflow

1. **Frontend/Backend changes:** Make in Replit, sync to this repo via Git
2. **Desktop app changes:** Make in Cursor, commit and push to Git
3. **Sync process:** Pull changes from Git on Replit when needed

## License

MIT
