# FocusTogether — Agent Context Summary

Last updated: 2026-03-19 (commit 62dc3f6 on `activity-refactor` branch)

## What is FocusTogether?

A productivity accountability app where partners monitor each other's focus during work sessions. When one partner opens a distracting app (e.g. Discord, Minecraft), the other partner's desktop app shows a popup alert.

### Architecture

- **Web App (Replit):** React frontend + Express backend + PostgreSQL. Manages sessions, users, and a `pendingAlerts` queue. Hosted at a Replit dev URL.
- **Tauri Desktop App (this repo):** Rust + WebView. Runs as a background macOS app (no dock icon, uses system tray). Polls the server every ~5 seconds via `GET /api/activity/session?userId={id}&source=desktop`. Detects local distracting apps and displays custom HTML popups for partner alerts.
- **Simulation Tool:** A separate script that simulates the partner triggering distraction events (sends `POST /api/activity` with `status: "distracted"` and a foreground app name).

## Key Files

### `src-tauri/src/main.rs` — Core Rust application
- **`force_show_window(app_handle, window_label)`** (line ~20): Uses Cocoa NSWindow APIs to force popups visible on macOS even when app runs with Accessory activation policy (no dock icon). Dispatches to main thread via `run_on_main_thread` — calling NSWindow APIs from background threads crashes the app.
- **`show_notification()`**: Creates the yellow idle warning popup (centered, 380x280).
- **`show_participant_alert()`** (line ~527): Creates the blue partner distraction popup (top-right, 300x180, auto-closes after 4.7s). Uses unique window labels `participant-alert-{timestamp}` to avoid conflicts.
- **`show_distraction_warning()`**: Creates the orange self-distraction warning popup (centered, 380x370).
- **`get_active_session()`** (line ~1324): Polls the backend. Processes `pendingAlerts` from the response. For each alert with `status == "distracted"` or `status == "idle"`, calls `show_participant_alert()`. NO client-side dedup — every alert triggers a popup unconditionally.
- **`dismiss_all_notifications()`**: Closes all open popup windows. Called when session ends.
- **File-based logging**: All `[POLL DEBUG]` and `[POPUP DEBUG]` messages write to `~/Desktop/focustogether-live.log` via a custom `log!` macro, regardless of how the app is launched (deep link, double-click, terminal). Uses `chrono` for timestamps.
- **macOS specifics**: Uses `cocoa` and `objc` crates. `force_show_window` sets `NSApplicationActivationPolicyRegular`, calls `activateIgnoringOtherApps`, sets window level to 25 (NSStatusWindowLevel), calls `orderFrontRegardless`. Then reverts to `Accessory` policy after 500ms to hide dock icon.

### `client/startup-notification.html` — Green startup popup
Shows "FocusTogether Active (26)" when the app launches. Currently displays for 5 seconds.

### `client/participant-alert.html` — Blue partner alert popup
Displays partner distraction alerts. Receives data via Tauri event `participant-alert-message` with `{title, body}`.

### `client/notification.html` — Yellow idle warning popup
Warns the user when they've been idle too long.

### `client/distraction-warning.html` — Orange self-distraction popup
Warns the user when THEY open a distracting app.

### `client/src/hooks/useIdleWarning.ts` — Frontend idle monitoring
Polls `get_active_session` Tauri command. Manages idle detection, warning phases, and distracted status reporting.

### `src-tauri/Cargo.toml`
Key dependencies: `tauri 1.5`, `cocoa 0.25`, `objc 0.2`, `chrono 0.4`, `user-idle 0.6`, `active-win-pos-rs 0.8`, `dirs 5.0`.

### `package.json`
Has `install:mac` script: `npm run build && npm run tauri:build && cp -R src-tauri/target/release/bundle/macos/FocusTogether.app /Applications/`

### `.cursor/rules/tauri-version-and-install.mdc`
Cursor rule that reminds the agent to rebuild and reinstall when changing bundled client HTML files.

## Data Flow for Partner Alerts

1. Partner opens distracting app → simulation tool sends `POST /api/activity` with `status: "distracted"`, `foregroundApp: "Minecraft Launcher"`
2. Server creates a `pendingAlert` in the queue for the other user
3. Desktop app polls `GET /api/activity/session?userId=50145776&source=desktop`
4. Server returns `pendingAlerts: [{type: "participant-activity", alertingUserId, alertingFirstName, status, domain, ...}]`
5. Desktop app calls `show_participant_alert()` for each alert → creates window, emits data, shows popup with `force_show_window`
6. Server clears the alert from the queue (one-shot delivery)

## `PendingAlert` Struct (Rust ↔ JSON mapping)

```rust
struct PendingAlert {
    #[serde(rename = "type")]           alert_type: String,
    #[serde(rename = "alertingUserId")] alerting_user_id: String,
    #[serde(rename = "alertingUsername")] alerting_username: Option<String>,
    #[serde(rename = "alertingFirstName")] alerting_first_name: Option<String>,
    status: String,                     // "idle" | "distracted"
    #[serde(rename = "sessionId")]      session_id: String,
    timestamp: String,
    domain: Option<String>,             // App/site name, e.g. "Minecraft Launcher"
}
```

## Current Status & Known Issues

### Working:
- Desktop app popup mechanism is 100% reliable. Every alert delivered by the server results in a visible popup with sound.
- `domain` field now works — shows "Maria opened Minecraft Launcher".
- File-based logging works regardless of launch method.
- NSWindow Cocoa calls properly dispatched to main thread (crash fixed).
- Unique window labels prevent conflicts.
- No focus stealing — popups appear without minimizing user's active window.

### Outstanding Issue — Server-side alert delivery:
The Replit backend delivers alerts with **massive inconsistent delays (0-60+ seconds)** and sometimes **drops them entirely**. In the latest controlled test (7 triggers), 2 were never delivered, 2 arrived in ~1-2 seconds, and 3 arrived 10-29 seconds late. This is a server-side problem — the desktop app has no dedup logic and shows every alert it receives.

A detailed prompt was prepared for the Replit team (see conversation history) requesting server-side logging for alert creation, reading, and clearing.

### User IDs:
- Desktop user (receiving alerts): `50145776`
- Partner user (triggering distraction): `44923348`

## Build & Install

```bash
npm run build                # Vite frontend build → dist/public/
npm run tauri:build          # Bundles into .app
cp -R src-tauri/target/release/bundle/macos/FocusTogether.app /Applications/
# Or just: npm run install:mac
```

## Version History (startup notification number)

- v3-v6: Initial popup fixes, build workflow issues
- v7-v9: macOS activation policy experiments, focus stealing fixes
- v10: Raw Cocoa NSWindow APIs (crashed — called from background thread)
- v11: Fixed crash with `run_on_main_thread`, removed `hide_dock_icon` standalone calls
- v12: Updated message format to include domain field
- v13: Added file-based logging (`focustogether-live.log`), longer startup popup display
