# Server changes for Replit agent

Give this to the Replit agent so the desktop app gets blue (partner) notifications consistently, and so we can debug with detailed logs.

---

## Part 1: Required behavior changes

### 1. Always send `pendingAlerts` in GET /api/activity/session

**File:** `server/routes.ts` (the handler for `GET /api/activity/session`)

**Change:** In the `res.json()` for this endpoint, always include the `pendingAlerts` key, even when there are no alerts. If the code does:

```js
pendingAlerts: alerts.length > 0 ? alerts : undefined
```

**Replace with:**

```js
pendingAlerts: alerts
```

So the response always has `pendingAlerts` as an array (empty `[]` when none). This prevents the desktop app from seeing a missing key and failing to parse the response correctly.

---

### 2. Deduplicate queued desktop alerts in SessionManager

**File:** `server/session-manager.ts` — method `queueAlertForUser`

**Change:** When adding an alert for a user, remove any existing alert with the same `(alertingUserId, status)` before pushing the new one. That way we only keep one “partner is distracted” (or “partner is idle”) per partner, and repeated activity updates (e.g. from web + desktop) don’t queue multiple blue notifications.

**Current behavior:** Every call pushes a new alert, so the same event can be delivered many times.

**Desired behavior:** Before pushing, filter out any existing alert where `a.alertingUserId === alert.alertingUserId && a.status === alert.status`, then push the new alert. Cap the array at 10 items if needed. This keeps one notification per transition per partner.

---

## Part 2: Add detailed logging (Replit console)

Add the following logging so we can see exactly where alerts are queued, dropped, or returned. Keep all existing logs; add these.

### 1. GET /api/activity/session (in `server/routes.ts`)

- **At the start of the handler:** Log every request:
  `[Activity Session] GET session userId=${userId}`

- **After `getUserActiveSession(userId)`:** Log:
  `[Activity Session] userId=${userId} activeSession=${activeSession ? activeSession.sessionId : 'null'}`

- **After `getPendingAlerts(userId)`:** Log every time (even when 0):
  `[Activity Session] getPendingAlerts returned ${alerts.length} alerts for userId=${userId}`
  If `alerts.length > 0`, also log each alert (e.g. `alertingUserId`, `status`).

- **Right before `res.json(...)`:** Log:
  `[Activity Session] Sending response: sessionId=${sessionId or 'null'}, pendingAlerts.length=${alerts.length}, active=${active}`

### 2. SessionManager.getPendingAlerts (in `server/session-manager.ts`)

- **At the very start of the method:** Log:
  `[SessionManager] getPendingAlerts called for userId=${userId}`

- **After getting the raw alerts array (before delete):** Log:
  `[SessionManager] getPendingAlerts userId=${userId} rawAlertsCount=${alerts.length}`
  If `alerts.length > 0`, log each alert (e.g. `alertingUserId`, `status`, `sessionId`).

- **When currentSession is null (dropping alerts):** Make the log very visible:
  `[SessionManager] DROPPING alerts: userId=${userId} had ${alerts.length} alerts but NO active session in activeDesktopSessions`

- **After filtering by sessionId:** Log:
  `[SessionManager] getPendingAlerts userId=${userId} afterFilter=${filtered.length} (sessionId=${currentSession.sessionId})`

- **Right before return:** Log:
  `[SessionManager] getPendingAlerts returning ${filtered.length} alerts to userId=${userId}`

### 3. POST /api/activity/update (in `server/routes.ts`)

- **When participants.length === 0:** Emphasize the warning:
  `[Activity Update] NO PARTICIPANTS - no alerts queued for session ${sessionId}. userId=${userId} status=${status}`

- **When queueing an alert:** Keep existing log; optionally add:
  `[Activity Update] Queued 1 alert for participant ${participant.id} (about ${userId} ${status})`

### 4. SessionManager.queueAlertForUser (in `server/session-manager.ts`)

- **At the start:** Log:
  `[SessionManager] queueAlertForUser userId=${userId} alertingUserId=${alert.alertingUserId} status=${alert.status} sessionId=${alert.sessionId}`

---

## Summary

- **Part 1:** Always return `pendingAlerts: alerts` (array); deduplicate in `queueAlertForUser` by `(alertingUserId, status)`.
- **Part 2:** Add the logs above so we can trace every GET, every queue, every drop, and every response in the Replit console. The desktop app (Cursor) now logs a poll counter and notification details so we can correlate with these server logs.
