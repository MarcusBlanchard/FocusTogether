# POST /api/desktop/apps (classification only)

The desktop app and browser extension call this endpoint **often** (every ~2s when the foreground app changes) to ask whether the current app/domain is distracting.

## Required behavior

- Return JSON including **`success: true`** and **`isForegroundBlocked`** (boolean).
- Optionally include **`blockedRunning`**, **`allowedApps`**, **`blockedApps`** for compatibility.

## Do NOT

- Call `POST /api/activity/update` or queue partner alerts when `isForegroundBlocked` is true.
- Broadcast WebSocket `participant-activity` for `distracted` from this route.

The Tauri app shows a **local 10-second orange warning** first; it only sends `status: "distracted"` to `/api/activity/update` **after** that timer completes. If `/api/desktop/apps` triggers broadcasts, partners will see alerts immediately when someone *opens* a distracting app.

The canonical implementation in this repo is **`server/routes.ts`** — search for `POST '/api/desktop/apps'`.
