# Code to Add to Replit's routes.ts

Copy these three sections from Cursor's version to Replit's version.

## Section 1: Add pendingAlerts Map (around line 120)

**Find this in Replit's routes.ts:**
```typescript
const activeSessions = new Map<string, string | null>();
```

**Add this RIGHT AFTER it:**
```typescript
// In-memory store: userId -> array of pending alerts
// Alerts are queued when a participant goes idle/distracted and cleared after retrieval
const pendingAlerts = new Map<string, Array<{
  type: string;
  alertingUserId: string;
  alertingUsername?: string;
  alertingFirstName?: string;
  status: string;
  sessionId: string;
  timestamp: string;
}>>();
```

## Section 2: Update GET /api/activity/session endpoint

**Find the existing `GET /api/activity/session` endpoint in Replit and REPLACE it with:**

```typescript
// GET /api/activity/session - Desktop app polls this to check for active session
app.get('/api/activity/session', async (req: any, res) => {
  try {
    const userId = req.query.userId;
    
    if (!userId) {
      return res.status(400).json({ message: "userId required" });
    }
    
    const sessionId = activeSessions.get(userId) || null;
    
    // Get and clear pending alerts for this user
    const alerts = pendingAlerts.get(userId) || [];
    pendingAlerts.delete(userId); // Clear after retrieval
    
    res.json({ 
      sessionId,
      pendingAlerts: alerts.length > 0 ? alerts : undefined,
      active: sessionId !== null,
    });
  } catch (error) {
    console.error("Error fetching active session:", error);
    res.status(500).json({ message: "Failed to fetch active session" });
  }
});
```

## Section 3: Update POST /api/activity/update endpoint

**Find the existing `POST /api/activity/update` endpoint in Replit and REPLACE it with:**

```typescript
// Activity update endpoint (from Tauri desktop app)
// No auth required - Tauri app runs in background and sends activity updates
app.post('/api/activity/update', async (req: any, res) => {
  try {
    const { userId, sessionId, status, timestamp } = req.body;

    // Validate required fields (idleSeconds removed per Replit backend format)
    if (!userId || !sessionId || !status) {
      return res.status(400).json({ message: "Missing required fields: userId, sessionId, status" });
    }

    // Validate status values (accept "idle" or "distracted" per desktop app)
    if (!['idle', 'distracted', 'active'].includes(status)) {
      return res.status(400).json({ message: "Invalid status. Must be 'idle', 'distracted', or 'active'" });
    }

    console.log(`[Activity Update] User ${userId} in session ${sessionId}: ${status}`);

    // Only queue alerts for "idle" or "distracted" status (not "active")
    if (status === 'idle' || status === 'distracted') {
      // Get all participants in this session from database
      let sessionParticipants: string[] = [];
      try {
        const participants = await storage.getSessionParticipants(sessionId);
        sessionParticipants = participants
          .map(p => p.userId || p.id)
          .filter(id => id !== userId); // Exclude the alerting user
        console.log(`[Activity Update] Found ${sessionParticipants.length} other participants in session ${sessionId}`);
      } catch (error) {
        console.error(`[Activity Update] Error getting session participants:`, error);
        // Fallback: use activeSessions map
        for (const [uid, sid] of activeSessions.entries()) {
          if (sid === sessionId && uid !== userId) {
            sessionParticipants.push(uid);
          }
        }
      }

      // Get user info for the alerting user
      let alertingUsername: string | undefined;
      let alertingFirstName: string | undefined;
      try {
        const alertingUser = await storage.getUser(userId);
        if (alertingUser) {
          alertingUsername = alertingUser.username || undefined;
          alertingFirstName = alertingUser.firstName || undefined;
        }
      } catch (error) {
        console.warn(`[Activity Update] Could not fetch user info for ${userId}:`, error);
      }

      // Queue alert for all other participants
      for (const participantId of sessionParticipants) {
        if (!pendingAlerts.has(participantId)) {
          pendingAlerts.set(participantId, []);
        }
        pendingAlerts.get(participantId)!.push({
          type: 'participant-activity',
          alertingUserId: userId,
          alertingUsername,
          alertingFirstName,
          status,
          sessionId,
          timestamp: timestamp || new Date().toISOString(),
        });
        console.log(`[Activity Update] Queued alert for participant ${participantId} about user ${userId} being ${status}`);
      }
    }

    res.json({ success: true, message: "Activity update received" });
  } catch (error) {
    console.error("Error processing activity update:", error);
    res.status(500).json({ message: "Failed to process activity update" });
  }
});
```

## Important Notes

1. **Keep all other endpoints** - Don't delete anything else from Replit's version
2. **Test after each change** - Make sure the server still starts
3. **Check for TypeScript errors** - Replit will show errors if something's wrong
4. **The order matters** - Add the Map first, then update the endpoints

## Verification

After adding the code, verify:
- ✅ Server starts without errors
- ✅ `GET /api/activity/session?userId=XXX` returns `pendingAlerts` field
- ✅ `POST /api/activity/update` accepts `status: "idle"` (not `idle_warning`)
- ✅ Alerts are queued when a user goes idle
