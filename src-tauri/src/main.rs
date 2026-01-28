// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// FocusTogether Desktop App - Background Enforcement
// Idle monitoring only

use user_idle::UserIdle;
use tauri::Manager;
use serde::{Deserialize, Serialize};

#[tauri::command]
fn get_idle_seconds() -> u64 {
    match UserIdle::get_time() {
        Ok(idle) => idle.as_seconds(),
        Err(_) => 0,
    }
}

#[tauri::command]
async fn show_notification(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
    println!("[Tauri] Attempting to show notification window: {} - {}", title, body);
    
    let window_label = "notification";
    
    // Check if notification window already exists, close it first
    if let Some(existing) = app.get_window(window_label) {
        let _ = existing.close();
    }
    
    // Create a small floating notification window
    // In dev mode, use Vite dev server; in production, use app protocol
    #[cfg(debug_assertions)]
    let url = tauri::WindowUrl::External("http://127.0.0.1:5173/notification.html".parse().unwrap());
    #[cfg(not(debug_assertions))]
    let url = tauri::WindowUrl::App("notification.html".into());
    
    let window = tauri::WindowBuilder::new(
        &app,
        window_label,
        url
    )
    .title(&title)
    .inner_size(400.0, 140.0)
    .resizable(false)
    .decorations(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible(false) // Start hidden
    .focused(false) // Don't focus when shown
    .build()
    .map_err(|e| format!("Failed to create notification window: {}", e))?;
    
    // Show the window
    // Note: On macOS, showing a window may steal focus. The .focused(false) option
    // should help, but macOS window management can still activate the window.
    window.show().map_err(|e| format!("Failed to show window: {}", e))?;
    
    // Small delay to ensure window JavaScript is ready, then send message
    let app_handle = app.clone();
    let title_clone = title.clone();
    let body_clone = body.clone();
    let window_label_clone = window_label.to_string();
    tauri::async_runtime::spawn(async move {
        // Wait a bit for the window's JavaScript to initialize
        std::thread::sleep(std::time::Duration::from_millis(150));
        if let Some(w) = app_handle.get_window(&window_label_clone) {
            let _ = w.emit("notification-message", serde_json::json!({
                "title": title_clone,
                "body": body_clone
            }));
        }
    });
    
    // Also try sending immediately (in case window is already ready)
    let _ = window.emit("notification-message", serde_json::json!({
        "title": title.clone(),
        "body": body.clone()
    }));
    
    // Don't focus the window - just show it without stealing focus from current app
    // The window is already set to always_on_top, so it will appear on top without focusing
    
    // Center the window on screen
    if let Some(monitor) = window.current_monitor().ok().flatten() {
        let screen_size = monitor.size();
        let window_size = window.outer_size().unwrap_or(tauri::PhysicalSize::new(400, 140));
        let x = (screen_size.width as i32 - window_size.width as i32) / 2;
        let y = (screen_size.height as i32 - window_size.height as i32) / 2;
        let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
    }
    
    println!("[Tauri] Notification window created and shown");
    Ok(())
}

#[tauri::command]
fn dismiss_notification(app: tauri::AppHandle) -> Result<(), String> {
    println!("[Tauri] Dismissing notification window");
    
    if let Some(window) = app.get_window("notification") {
        window.close().map_err(|e| format!("Failed to close window: {}", e))?;
        println!("[Tauri] Notification window closed");
    }
    
    Ok(())
}

#[tauri::command]
async fn show_participant_alert(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
    println!("[Tauri] Attempting to show participant alert window: {} - {}", title, body);
    
    let window_label = "participant-alert";
    
    // Check if alert window already exists, close it first
    if let Some(existing) = app.get_window(window_label) {
        let _ = existing.close();
    }
    
    // Create a small floating notification window in top-right corner
    // In dev mode, use Vite dev server; in production, use app protocol
    #[cfg(debug_assertions)]
    let url = tauri::WindowUrl::External("http://127.0.0.1:5173/participant-alert.html".parse().unwrap());
    #[cfg(not(debug_assertions))]
    let url = tauri::WindowUrl::App("participant-alert.html".into());
    
    let window = tauri::WindowBuilder::new(
        &app,
        window_label,
        url
    )
    .title(&title)
    .inner_size(320.0, 120.0)
    .resizable(false)
    .decorations(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible(false) // Start hidden
    .focused(false) // Don't focus when shown
    .build()
    .map_err(|e| format!("Failed to create alert window: {}", e))?;
    
    // Show the window first (must be visible before accessing monitor)
    window.show().map_err(|e| format!("Failed to show window: {}", e))?;
    
    // Small delay to ensure window is fully initialized before positioning
    std::thread::sleep(std::time::Duration::from_millis(100));
    
    // Position in top-right corner (after window is shown)
    if let Ok(Some(monitor)) = window.current_monitor() {
        let screen_size = monitor.size();
        if let Ok(window_size) = window.outer_size() {
            let x = (screen_size.width as i32 - window_size.width as i32) - 20; // 20px from right edge
            let y = 20; // 20px from top
            let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
        }
    }
    
    // Small delay to ensure window JavaScript is ready, then send message
    let app_handle = app.clone();
    let title_clone = title.clone();
    let body_clone = body.clone();
    let window_label_clone = window_label.to_string();
    tauri::async_runtime::spawn(async move {
        // Wait a bit for the window's JavaScript to initialize
        std::thread::sleep(std::time::Duration::from_millis(150));
        if let Some(w) = app_handle.get_window(&window_label_clone) {
            let _ = w.emit("notification-message", serde_json::json!({
                "title": title_clone,
                "body": body_clone
            }));
        }
    });
    
    // Also try sending immediately (in case window is already ready)
    let _ = window.emit("notification-message", serde_json::json!({
        "title": title.clone(),
        "body": body.clone()
    }));
    
    println!("[Tauri] Participant alert window created and shown (top-right, auto-closes in 5s)");
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
struct ActivityUpdate {
    #[serde(rename = "userId")]
    user_id: String,
    #[serde(rename = "sessionId")]
    session_id: String,
    status: String, // "idle" | "active" | "distracted"
    timestamp: String, // ISO8601 timestamp
}

#[derive(Debug, Serialize, Deserialize)]
struct PendingAlert {
    #[serde(rename = "type")]
    alert_type: String,
    #[serde(rename = "alertingUserId")]
    alerting_user_id: String,
    #[serde(rename = "alertingUsername")]
    alerting_username: Option<String>,
    #[serde(rename = "alertingFirstName")]
    alerting_first_name: Option<String>,
    status: String, // "idle" | "distracted"
    #[serde(rename = "sessionId")]
    session_id: String,
    timestamp: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct SessionResponse {
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
    #[serde(rename = "joinedAt")]
    joined_at: Option<String>,
    active: Option<bool>,
    #[serde(rename = "pendingAlerts")]
    pending_alerts: Option<Vec<PendingAlert>>,
}

/// Play a short notification sound using system commands
fn play_notification_sound() {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        // Use macOS system sound (Glass.aiff is a standard system sound)
        let _ = Command::new("afplay")
            .arg("/System/Library/Sounds/Glass.aiff")
            .output();
    }
    
    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        // Use paplay for PulseAudio or aplay for ALSA
        let _ = Command::new("paplay")
            .arg("/usr/share/sounds/freedesktop/stereo/notification.oga")
            .output()
            .or_else(|_| {
                Command::new("aplay")
                    .arg("/usr/share/sounds/alsa/Front_Left.wav")
                    .output()
            });
    }
    
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        // Use PowerShell to play system sound
        let _ = Command::new("powershell")
            .args(&["-Command", "[console]::beep(800,300)"])
            .output();
    }
}

#[tauri::command]
async fn get_active_session(app: tauri::AppHandle, userId: String) -> Result<Option<String>, String> {
    println!("[Tauri] Polling active session for userId: {}", userId);
    
    // Read backend URL from environment variable, default to Replit URL
    let backend_url = std::env::var("BACKEND_URL")
        .unwrap_or_else(|_| "https://85f28487-f52a-4264-bfe6-832501142976-00-36zv4e7q2xsre.spock.replit.dev".to_string());
    
    let endpoint = format!("{}/api/activity/session?userId={}", backend_url, userId);
    println!("[Tauri] GET endpoint: {}", endpoint);
    
    // Use Tauri's HTTP API to send GET request
    let client = tauri::api::http::ClientBuilder::new()
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    let request_builder = tauri::api::http::HttpRequestBuilder::new("GET", &endpoint)
        .map_err(|e| format!("Failed to create request builder: {}", e))?;
    
    let response = client
        .send(request_builder)
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;
    
    let status = response.status();
    let status_code = status.as_u16();
    
    if status_code >= 200 && status_code < 300 {
        // Parse JSON response
        let response_data = response.read().await
            .map_err(|e| format!("Failed to read response body: {}", e))?;
        
        // response_data.data is a serde_json::Value, parse it directly
        let session_response: SessionResponse = serde_json::from_value(response_data.data.clone())
            .map_err(|e| {
                println!("[Tauri] Failed to parse JSON response. Raw data: {:?}", response_data.data);
                format!("Failed to parse JSON response: {}", e)
            })?;
        
        // Debug: Log the full response structure
        println!("[Tauri] Session response - sessionId: {:?}, pendingAlerts: {:?}", 
                 session_response.session_id, 
                 session_response.pending_alerts.as_ref().map(|a| a.len()));
        
        // Process pending alerts
        if let Some(ref alerts) = session_response.pending_alerts {
            if !alerts.is_empty() {
                println!("[Tauri] Processing {} pending alert(s)", alerts.len());
                
                for alert in alerts {
                    // Only process "idle" or "distracted" status alerts
                    if alert.status != "idle" && alert.status != "distracted" {
                        continue;
                    }
                    
                    // Get display name (prefer first name, fallback to username, then default)
                    let display_name = alert.alerting_first_name
                        .clone()
                        .or_else(|| alert.alerting_username.clone())
                        .unwrap_or_else(|| "A participant".to_string());
                    
                    // Create message based on status
                    let message = match alert.status.as_str() {
                        "idle" => format!("{} is idle", display_name),
                        "distracted" => format!("{} is distracted", display_name),
                        _ => continue,
                    };
                    
                    println!("[Tauri] Showing notification: {}", message);
                    
                    // Try native macOS notification first, but fallback to custom window
                    // Native notifications don't work in dev mode without code signing
                    #[cfg(target_os = "macos")]
                    {
                        use tauri::api::notification::Notification;
                        let app_id = app.config().tauri.bundle.identifier.clone();
                        println!("[Tauri] Attempting native notification with app ID: {}", app_id);
                        match Notification::new(&app_id)
                            .title("FocusTogether")
                            .body(&message)
                            .show()
                        {
                            Ok(_) => {
                                println!("[Tauri] ✅ Native notification shown");
                                play_notification_sound();
                                continue; // Success, move to next alert
                            }
                            Err(e) => {
                                println!("[Tauri] ⚠️  Native notification failed (expected in dev mode): {}", e);
                                // Fall through to custom window notification
                            }
                        }
                    }
                    
                    // Fallback: Use custom notification window (works in dev mode)
                    println!("[Tauri] Using custom notification window as fallback");
                    if let Err(e) = show_participant_alert(
                        app.clone(),
                        "FocusTogether Alert".to_string(),
                        message.clone(),
                    ).await {
                        println!("[Tauri] ❌ Custom notification window also failed: {}", e);
                    } else {
                        println!("[Tauri] ✅ Custom notification window shown");
                    }
                    
                    // Play notification sound
                    play_notification_sound();
                }
            }
        }
        
        match session_response.session_id {
            Some(session_id) => {
                println!("[Tauri] ✅ Active session found: {}", session_id);
                Ok(Some(session_id))
            }
            None => {
                println!("[Tauri] No active session (sessionId is null)");
                Ok(None)
            }
        }
    } else {
        let error_msg = format!("Backend returned error status: {}", status_code);
        println!("[Tauri] ❌ {}", error_msg);
        // Return None on error (graceful degradation)
        Ok(None)
    }
}

#[tauri::command]
async fn send_activity_update(
    userId: String,
    sessionId: String,
    status: String,
) -> Result<(), String> {
    println!("[Tauri] Sending activity update: userId={}, sessionId={}, status={}", 
             userId, sessionId, status);
    
    // Read backend URL from environment variable, default to Replit URL
    let backend_url = std::env::var("BACKEND_URL")
        .unwrap_or_else(|_| "https://85f28487-f52a-4264-bfe6-832501142976-00-36zv4e7q2xsre.spock.replit.dev".to_string());
    
    let endpoint = format!("{}/api/activity/update", backend_url);
    println!("[Tauri] POST endpoint: {}", endpoint);
    
    // Generate ISO8601 timestamp
    let timestamp = chrono::Utc::now().to_rfc3339();
    
    let payload = ActivityUpdate {
        user_id: userId.clone(),
        session_id: sessionId.clone(),
        status: status.clone(),
        timestamp,
    };
    
    println!("[Tauri] Payload: {:?}", payload);
    
    // Use Tauri's HTTP API to send POST request
    let client = tauri::api::http::ClientBuilder::new()
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    let mut request_builder = tauri::api::http::HttpRequestBuilder::new("POST", &endpoint)
        .map_err(|e| format!("Failed to create request builder: {}", e))?;
    
    request_builder = request_builder
        .header("Content-Type", "application/json")
        .map_err(|e| format!("Failed to set header: {}", e))?;
    
    let body_text = serde_json::to_string(&payload)
        .map_err(|e| format!("Failed to serialize payload: {}", e))?;
    
    request_builder = request_builder.body(tauri::api::http::Body::Text(body_text));
    
    let response = client
        .send(request_builder)
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;
    
    let status = response.status();
    let status_code = status.as_u16();
    if status_code >= 200 && status_code < 300 {
        println!("[Tauri] ✅ Activity update sent successfully (status: {})", status_code);
        Ok(())
    } else {
        let error_msg = format!("Backend returned error status: {}", status_code);
        println!("[Tauri] ❌ {}", error_msg);
        Err(error_msg)
    }
}

fn main() {
    println!("[Tauri] Starting FocusTogether Enforcer...");
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_idle_seconds, show_notification, show_participant_alert, dismiss_notification, send_activity_update, get_active_session])
        .setup(|app| {
            println!("[Tauri] Setup callback called");
            
            // Hide the main window - app runs in background only
            if let Some(main_window) = app.get_window("main") {
                let _ = main_window.hide();
                println!("[Tauri] Main window hidden - running in background");
            }
            
            // Request notification permission on macOS
            #[cfg(target_os = "macos")]
            {
                use tauri::api::notification::Notification;
                let app_id = app.config().tauri.bundle.identifier.clone();
                println!("[Tauri] Requesting notification permission with app ID: {}", app_id);
                // Request permission by attempting to show a test notification
                // This will trigger the macOS permission dialog if not already granted
                match Notification::new(&app_id)
                    .title("FocusTogether")
                    .body("Notification permission check")
                    .show()
                {
                    Ok(_) => println!("[Tauri] ✅ Notification permission request sent"),
                    Err(e) => println!("[Tauri] ⚠️  Notification permission request failed: {}", e),
                }
            }
            
            println!("[Tauri] Setup complete - app running in background");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
    println!("[Tauri] Application exited");
}

