# How to Merge routes.ts Between Cursor and Replit

Since both versions have different code, here's how to safely merge them.

## Strategy: Keep Replit as Base, Add Cursor's Alert Features

**Why:** Replit has more lines, meaning it likely has features/endpoints that Cursor doesn't have.

## Step-by-Step Merge Process

### Step 1: Backup Replit's Current Version

**On Replit:**
1. Open `server/routes.ts`
2. Copy the entire file
3. Create a backup file: `server/routes.ts.replit-backup`
4. Paste the content there (or just keep it in your clipboard)

### Step 2: Identify What Cursor Has That Replit Needs

**From Cursor's version, you need these specific sections:**

1. **`pendingAlerts` Map declaration** (around line 120-130)
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

2. **Updated `GET /api/activity/session` endpoint** (around line 1654)
   - Should return `pendingAlerts` array
   - Should clear alerts after retrieval

3. **Updated `POST /api/activity/update` endpoint** (around line 1733)
   - Should accept `status: "idle" | "distracted" | "active"` (not `idle_warning`)
   - Should NOT require `idleSeconds` field
   - Should queue alerts for other participants

### Step 3: Manual Merge (Recommended)

**On Replit:**

1. **Add the `pendingAlerts` Map:**
   - Find where `activeSessions` is declared (should be near the top of `registerRoutes`)
   - Add the `pendingAlerts` Map right after it

2. **Update `GET /api/activity/session`:**
   - Find the existing endpoint
   - Replace it with Cursor's version that includes `pendingAlerts` handling

3. **Update `POST /api/activity/update`:**
   - Find the existing endpoint
   - Replace it with Cursor's version that queues alerts

4. **Test:**
   - Make sure the server still starts
   - Check for TypeScript errors
   - Test the alert flow

### Step 4: Alternative - Use Git Merge

**On Replit Shell:**

```bash
# Pull Cursor's version
git pull origin main

# If there are conflicts in routes.ts:
# 1. Git will mark the conflicts
# 2. Manually resolve by keeping Replit's extra code
# 3. Add Cursor's alert queuing code
# 4. Commit: git add server/routes.ts && git commit -m "Merge alert queuing from Cursor"
```

## What to Look For

**Replit might have these that Cursor doesn't:**
- Additional endpoints
- More complete error handling
- Different validation logic
- Extra features

**Cursor has these that Replit needs:**
- `pendingAlerts` Map
- Alert queuing logic in `POST /api/activity/update`
- `pendingAlerts` return in `GET /api/activity/session`

## Quick Check: Endpoint Count

**Count endpoints in both versions:**

**Cursor (local):**
```bash
grep -c "^  app\.(get|post|put|patch|delete)(" server/routes.ts
```

**Replit:**
Run the same command in Replit Shell

If Replit has more, you need to preserve those extra endpoints.

## Recommended Approach

1. **Keep Replit's `routes.ts` as the master**
2. **Add Cursor's three specific sections** (pendingAlerts Map, updated GET endpoint, updated POST endpoint)
3. **Test thoroughly on Replit**
4. **Once working, push to GitHub**
5. **Pull on Cursor to sync**

This way, you don't lose any Replit-specific features while gaining the alert queuing functionality.
