# Code Changes Needed on Replit

The desktop app now polls Replit's backend. You need to add code to Replit's web app to notify the backend when users join sessions.

## Step 1: Create New File `client/src/lib/activity-session.ts`

Create this new file on Replit:

```typescript
import { apiRequest } from "./config";

/**
 * Notify backend that user has joined a session
 * This allows the desktop app to detect active sessions
 */
export async function notifySessionJoined(sessionId: string): Promise<void> {
  try {
    await apiRequest("POST", "/api/activity/session", {
      sessionId,
      status: "joined",
    });
    console.log(`[ActivitySession] Notified backend: joined session ${sessionId}`);
  } catch (error) {
    console.error("[ActivitySession] Failed to notify session joined:", error);
    // Don't throw - this is non-critical
  }
}

/**
 * Notify backend that user has left a session
 */
export async function notifySessionLeft(): Promise<void> {
  try {
    await apiRequest("POST", "/api/activity/session", {
      sessionId: null,
      status: "left",
    });
    console.log("[ActivitySession] Notified backend: left session");
  } catch (error) {
    console.error("[ActivitySession] Failed to notify session left:", error);
    // Don't throw - this is non-critical
  }
}
```

## Step 2: Update `client/src/pages/free-rooms.tsx`

**Add import at the top:**
```typescript
import { notifySessionJoined } from "@/lib/activity-session";
```

**In `createRoomMutation.onSuccess`, add the call before `setLocation`:**
```typescript
setTimeout(() => {
  console.log('[FreeRooms] Navigating to session:', sessionId);
  // Notify backend that user joined session
  notifySessionJoined(sessionId);
  setLocation(`/session/${sessionId}`);
}, 500);
```

**In `joinRoomMutation.onSuccess`, add the call before `setLocation`:**
```typescript
setTimeout(() => {
  // Notify backend that user joined session
  notifySessionJoined(sessionId);
  setLocation(`/session/${sessionId}`);
}, 500);
```

## Step 3: Update `client/src/pages/waiting.tsx`

**Add import at the top:**
```typescript
import { notifySessionJoined } from "@/lib/activity-session";
```

**In the 'matched' event handler, add the call before `setLocation`:**
```typescript
setTimeout(() => {
  setStatus('connecting-call');
  setTimeout(() => {
    // Notify backend that user joined session
    notifySessionJoined(event.sessionId);
    setLocation(`/session/${event.sessionId}`);
  }, 1000);
}, 1500);
```

**In the 'room-joined' event handler, add the call before `setLocation`:**
```typescript
setTimeout(() => {
  setStatus('connecting-call');
  setTimeout(() => {
    // Notify backend that user joined session
    notifySessionJoined(event.sessionId);
    setLocation(`/session/${event.sessionId}`);
  }, 1000);
}, 1500);
```

## Step 4: Update `client/src/pages/calendar.tsx`

**Add import at the top:**
```typescript
import { notifySessionJoined } from "@/lib/activity-session";
```

**In the "Join" button onClick handler, add the call before `setLocation`:**
```typescript
onClick={() => {
  notifySessionJoined(session.id);
  setLocation(`/session/${session.id}`);
}}
```

**Also add it in the match confirmation dialog "View Session" button:**
```typescript
onClick={() => {
  if (matchConfirmation?.session) {
    notifySessionJoined(matchConfirmation.session.id);
    setLocation(`/session/${matchConfirmation.session.id}`);
  }
  setMatchConfirmation(null);
}}
```

## Step 5: Update `client/src/pages/home.tsx`

**Add import at the top:**
```typescript
import { notifySessionJoined } from "@/lib/activity-session";
```

**In the session preview onClick handler, add the call before `setLocation`:**
```typescript
onClick={() => {
  notifySessionJoined(session.id);
  setLocation(`/session/${session.id}`);
}}
```

## Step 6: Verify Backend Endpoint Exists

Make sure `server/routes.ts` on Replit has the `POST /api/activity/session` endpoint. It should look like:

```typescript
// POST /api/activity/session - Web app calls this when joining/leaving sessions
app.post('/api/activity/session', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const { sessionId, status } = req.body;
    
    if (status === 'joined') {
      activeSessions.set(userId, sessionId);
      console.log(`[Activity] User ${userId} joined session ${sessionId}`);
    } else if (status === 'left') {
      activeSessions.set(userId, null);
      console.log(`[Activity] User ${userId} left session`);
    } else {
      return res.status(400).json({ message: "Invalid status. Must be 'joined' or 'left'" });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error updating session status:", error);
    res.status(500).json({ message: "Failed to update session status" });
  }
});
```

And make sure there's an `activeSessions` Map at the top of `registerRoutes`:
```typescript
const activeSessions = new Map<string, string | null>();
```

## After Making Changes

1. Save all files on Replit
2. Replit should auto-reload
3. Test by:
   - Joining a session on Replit's web app
   - Check desktop app console - it should show "Active session found: {sessionId}" within 5 seconds
