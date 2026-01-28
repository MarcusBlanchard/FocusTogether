# Check GET /api/activity/session Endpoint on Replit

The desktop app is polling this endpoint but not receiving alerts. Please verify the endpoint returns `pendingAlerts`.

## What to Check

**Current GET /api/activity/session endpoint should:**

1. **Return `pendingAlerts` in the response:**
```typescript
res.json({ 
  sessionId,
  pendingAlerts: alerts.length > 0 ? alerts : undefined,  // ← This must be included
  active: sessionId !== null,
});
```

2. **Get and clear alerts from the `pendingAlerts` Map:**
```typescript
// Get and clear pending alerts for this user
const alerts = pendingAlerts.get(userId) || [];
pendingAlerts.delete(userId); // Clear after retrieval
```

## If the endpoint doesn't return pendingAlerts:

Replace the entire `GET /api/activity/session` endpoint with:

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

## Also Verify

Make sure the `pendingAlerts` Map exists at the top of `registerRoutes` function:

```typescript
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
