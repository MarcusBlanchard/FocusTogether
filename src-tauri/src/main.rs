// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// FocusTogether Desktop App - Background Enforcement
// Idle monitoring only

use user_idle::UserIdle;
use tauri::Manager;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::OnceLock;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use active_win_pos_rs::get_active_window;


// Global config storage
static CONFIG: OnceLock<Mutex<AppConfig>> = OnceLock::new();

// Distraction detection state
static DETECTION_RUNNING: AtomicBool = AtomicBool::new(false);
static DETECTION_SESSION: OnceLock<Mutex<Option<(String, String)>>> = OnceLock::new();

// Browser distraction state - set when browser extension detects distracting site
static BROWSER_DISTRACTION_ACTIVE: AtomicBool = AtomicBool::new(false);

// Heartbeat loop state - ensures only one heartbeat loop runs at a time
static HEARTBEAT_RUNNING: AtomicBool = AtomicBool::new(false);

// Session poll counter for Cursor/device console logging (correlate with server logs)
static SESSION_POLL_COUNT: AtomicU64 = AtomicU64::new(0);

// Single source of truth for current userId (pings and app reports must use the same value)
static CURRENT_USER_ID: OnceLock<Mutex<Option<String>>> = OnceLock::new();

/// Returns the global current userId. Initializes from config on first use.
fn get_current_user_id() -> Option<String> {
    let mutex = CURRENT_USER_ID.get_or_init(|| Mutex::new(None));
    if let Ok(mut guard) = mutex.lock() {
        if guard.is_none() {
            if let Ok(config_guard) = get_config().lock() {
                *guard = config_guard.user_id.clone();
            }
        }
        return guard.clone();
    }
    None
}

/// Sets the global current userId (call after updating config).
fn set_current_user_id(user_id: Option<String>) {
    let mutex = CURRENT_USER_ID.get_or_init(|| Mutex::new(None));
    if let Ok(mut guard) = mutex.lock() {
        *guard = user_id;
    }
}

/// Response from /api/desktop/apps endpoint
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct DesktopAppsResponse {
    success: bool,
    #[serde(rename = "blockedRunning", default)]
    blocked_running: Vec<String>,
    #[serde(rename = "isForegroundBlocked", default)]
    is_foreground_blocked: bool,
    #[serde(rename = "allowedApps", default)]
    allowed_apps: Vec<String>,
    #[serde(rename = "blockedApps", default)]
    blocked_apps: Vec<String>,
}

/// Check with server if foreground app is distracting
/// This is the source of truth - server decides what's blocked
fn check_apps_with_server(user_id: &str, foreground_app: &str) -> Option<bool> {
    println!("[Desktop] Sending app report for userId={}", user_id);
    println!("[Desktop Apps] 📤 Checking app with server: userId={}, foregroundApp={}", user_id, foreground_app);
    
    let backend_url = std::env::var("BACKEND_URL")
        .unwrap_or_else(|_| "https://85f28487-f52a-4264-bfe6-832501142976-00-36zv4e7q2xsre.spock.replit.dev".to_string());
    
    let endpoint = format!("{}/api/desktop/apps", backend_url);
    
    // Build the request body
    let body = serde_json::json!({
        "userId": user_id,
        "apps": [foreground_app], // Only send the foreground app for now
        "foregroundApp": foreground_app
    });
    
    // Use blocking HTTP request (we're in a thread)
    let client = match reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build() {
            Ok(c) => c,
            Err(e) => {
                println!("[Detection] Failed to create HTTP client: {}", e);
                return None;
            }
        };
    
    match client.post(&endpoint)
        .header("Content-Type", "application/json")
        .json(&body)
        .send() {
            Ok(response) => {
                match response.json::<DesktopAppsResponse>() {
                    Ok(data) => {
                        if data.success {
                            println!("[Detection] Server response - isForegroundBlocked: {}, blockedRunning: {:?}", 
                                     data.is_foreground_blocked, data.blocked_running);
                            Some(data.is_foreground_blocked)
                        } else {
                            println!("[Detection] Server returned success: false");
                            None
                        }
                    }
                    Err(e) => {
                        println!("[Detection] Failed to parse server response: {}", e);
                        None
                    }
                }
            }
            Err(e) => {
                println!("[Detection] Failed to contact server: {}", e);
                None
            }
        }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct AppConfig {
    user_id: Option<String>,
    connected_at: Option<String>,
}

/// Get the config file path (~/.focustogether/config.json)
fn get_config_path() -> PathBuf {
    let home = dirs::home_dir().expect("Could not find home directory");
    // Check for FOCUSTOGETHER_CONFIG_DIR environment variable for running multiple instances
    let config_dir = std::env::var("FOCUSTOGETHER_CONFIG_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| home.join(".focustogether"));
    config_dir.join("config.json")
}

/// Load config from file
fn load_config() -> AppConfig {
    if std::env::var("FOCUSTOGETHER_CONFIG_DIR").is_err() {
        println!("[Config] FOCUSTOGETHER_CONFIG_DIR not set - using default config. For two users, launch each instance with FOCUSTOGETHER_CONFIG_DIR=~/.focustogether-user1 and user2.");
    }
    let config_path = get_config_path();
    if config_path.exists() {
        match fs::read_to_string(&config_path) {
            Ok(contents) => {
                match serde_json::from_str(&contents) {
                    Ok(config) => {
                        println!("[Config] Loaded config from {:?}", config_path);
                        return config;
                    }
                    Err(e) => {
                        println!("[Config] Failed to parse config: {}", e);
                    }
                }
            }
            Err(e) => {
                println!("[Config] Failed to read config file: {}", e);
            }
        }
    } else {
        println!("[Config] No config file found at {:?}", config_path);
    }
    AppConfig::default()
}

/// Save config to file
fn save_config(config: &AppConfig) -> Result<(), String> {
    let config_path = get_config_path();
    
    // Create directory if it doesn't exist
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create config directory: {}", e))?;
    }
    
    let contents = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    
    fs::write(&config_path, contents)
        .map_err(|e| format!("Failed to write config file: {}", e))?;
    
    println!("[Config] Saved config to {:?}", config_path);
    Ok(())
}

/// Get the global config
fn get_config() -> &'static Mutex<AppConfig> {
    CONFIG.get_or_init(|| Mutex::new(load_config()))
}

/// Set user ID in config and save; also updates the global current userId (single source of truth).
fn set_user_id(user_id: String) -> Result<(), String> {
    let config = get_config();
    let mut config_guard = config.lock().map_err(|e| format!("Failed to lock config: {}", e))?;
    config_guard.user_id = Some(user_id.clone());
    // Add timestamp when connected
    config_guard.connected_at = Some(chrono::Utc::now().to_rfc3339());
    save_config(&config_guard)?;
    set_current_user_id(Some(user_id));
    Ok(())
}

/// Register desktop connection with the backend
async fn register_desktop_connection(user_id: &str) -> Result<(), String> {
    use tauri::api::http::{ClientBuilder, HttpRequestBuilder, ResponseType};
    
    let backend_url = std::env::var("BACKEND_URL")
        .unwrap_or_else(|_| "https://85f28487-f52a-4264-bfe6-832501142976-00-36zv4e7q2xsre.spock.replit.dev".to_string());
    let url = format!("{}/api/desktop/connect", backend_url);
    
    println!("[DeepLink] 📡 Registering desktop connection for user: {} at {}", user_id, url);
    
    let client = ClientBuilder::new().build().map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    let body = serde_json::json!({ "userId": user_id });
    
    let request = HttpRequestBuilder::new("POST", &url)
        .map_err(|e| format!("Failed to create request: {}", e))?
        .header("Content-Type", "application/json")
        .map_err(|e| format!("Failed to set header: {}", e))?
        .body(tauri::api::http::Body::Json(body))
        .response_type(ResponseType::Text);
    
    let response = client.send(request).await.map_err(|e| format!("Failed to connect to backend: {}", e))?;
    
    if response.status().is_success() {
        println!("[DeepLink] ✅ Desktop connection registered with backend (status: {})", response.status());
        Ok(())
    } else {
        let status = response.status();
        Err(format!("Backend returned status: {}", status))
    }
}

/// Send a heartbeat ping to the backend
async fn send_heartbeat_ping(user_id: &str) -> Result<(), String> {
    use tauri::api::http::{ClientBuilder, HttpRequestBuilder, ResponseType};
    
    let backend_url = std::env::var("BACKEND_URL")
        .unwrap_or_else(|_| "https://85f28487-f52a-4264-bfe6-832501142976-00-36zv4e7q2xsre.spock.replit.dev".to_string());
    let url = format!("{}/api/desktop/ping", backend_url);
    
    let client = ClientBuilder::new().build().map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    let body = serde_json::json!({ "userId": user_id });
    
    let request = HttpRequestBuilder::new("POST", &url)
        .map_err(|e| format!("Failed to create request: {}", e))?
        .header("Content-Type", "application/json")
        .map_err(|e| format!("Failed to set header: {}", e))?
        .body(tauri::api::http::Body::Json(body))
        .response_type(ResponseType::Text);
    
    let response = client.send(request).await.map_err(|e| format!("Ping failed: {}", e))?;
    
    if response.status().is_success() {
        Ok(())
    } else {
        Err(format!("Ping returned status: {}", response.status()))
    }
}

/// Stop any existing heartbeat loop. Waits long enough for the loop thread to wake
/// (it sleeps 1s at a time) and exit so only one loop runs after start_heartbeat_loop().
fn stop_heartbeat_loop() {
    if HEARTBEAT_RUNNING.load(Ordering::SeqCst) {
        println!("[Heartbeat] Stopping existing heartbeat loop");
        HEARTBEAT_RUNNING.store(false, Ordering::SeqCst);
        // Loop wakes every 1s; wait so it sees false and exits before we start a new one
        std::thread::sleep(std::time::Duration::from_millis(1100));
    }
}

/// Start the heartbeat ping loop - runs every 10 seconds. Reads current userId from
/// global each ping so a deep-link switch is reflected immediately.
fn start_heartbeat_loop() {
    // Stop any existing heartbeat loop first
    stop_heartbeat_loop();
    
    println!("[Heartbeat] 💓 Starting heartbeat loop (userId from global each ping)");
    HEARTBEAT_RUNNING.store(true, Ordering::SeqCst);
    
    std::thread::spawn(|| {
        let mut ping_count: u64 = 0;
        
        while HEARTBEAT_RUNNING.load(Ordering::SeqCst) {
            if let Some(user_id) = get_current_user_id() {
                ping_count += 1;
                println!("[Desktop] Sending ping for userId={}", user_id);
                let ping_num = ping_count;
                tauri::async_runtime::spawn(async move {
                    match send_heartbeat_ping(&user_id).await {
                        Ok(_) => {
                            println!("[Heartbeat] 💓 Ping #{} sent successfully", ping_num);
                        }
                        Err(e) => {
                            println!("[Heartbeat] ⚠️ Ping #{} failed: {} (will retry)", ping_num, e);
                        }
                    }
                });
            }
            for _ in 0..10 {
                if !HEARTBEAT_RUNNING.load(Ordering::SeqCst) {
                    println!("[Heartbeat] 🛑 Heartbeat loop stopped");
                    return;
                }
                std::thread::sleep(std::time::Duration::from_secs(1));
            }
        }
        println!("[Heartbeat] 🛑 Heartbeat loop exited");
    });
}

/// Parse deep link URL and extract userId
fn parse_deep_link(url: &str) -> Option<String> {
    // Expected format: focustogether://auth?userId=XXX
    if url.starts_with("focustogether://auth") {
        // Parse query string
        if let Some(query_start) = url.find('?') {
            let query = &url[query_start + 1..];
            for param in query.split('&') {
                if let Some((key, value)) = param.split_once('=') {
                    if key == "userId" {
                        println!("[DeepLink] Parsed userId: {}", value);
                        return Some(value.to_string());
                    }
                }
            }
        }
    }
    println!("[DeepLink] Failed to parse URL: {}", url);
    None
}

#[tauri::command]
fn get_idle_seconds() -> u64 {
    match UserIdle::get_time() {
        Ok(idle) => idle.as_seconds(),
        Err(_) => 0,
    }
}

#[tauri::command]
async fn show_notification(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("⚠️  ⚠️  ⚠️  IDLE WARNING TRIGGERED ⚠️  ⚠️  ⚠️");
    println!("📢 {} - {}", title, body);
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    
    let window_label = "notification";
    
    // Check if notification window already exists, close it first
    if let Some(existing) = app.get_window(window_label) {
        let _ = existing.close();
        // Wait for window to fully close before creating new one
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    
    // Create a small floating notification window
    // In dev mode, use Vite dev server; in production, use app protocol
    // Always use App URL - Tauri handles dev vs production
    let url = tauri::WindowUrl::App("notification.html".into());
    
    let _window = tauri::WindowBuilder::new(
        &app,
        window_label,
        url
    )
    .title(&title)
    .inner_size(380.0, 280.0)
    .resizable(false)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible(false) // Start hidden, will show after content is loaded
    .focused(false) // Don't focus when shown
    .accept_first_mouse(false) // Don't accept focus on first click (macOS)
    .build()
    .map_err(|e| format!("Failed to create notification window: {}", e))?;
    
    // Store app_handle instead of window to avoid dangling references
    let app_clone = app.clone();
    let label = window_label.to_string();
    let title_clone = title.clone();
    let body_clone = body.clone();
    tauri::async_runtime::spawn(async move {
        // Wait for the window's JavaScript to fully initialize
        std::thread::sleep(std::time::Duration::from_millis(500));
        
        // Re-fetch window - it may have been closed during the delay
        if let Some(window) = app_clone.get_window(&label) {
            // Send the message first
            let _ = window.emit("notification-message", serde_json::json!({
                "title": title_clone,
                "body": body_clone
            }));
            
            // Wait for JavaScript to process the message
            std::thread::sleep(std::time::Duration::from_millis(200));
            
            // Re-fetch window again after delay
            if let Some(window) = app_clone.get_window(&label) {
                // Center the window on screen
                if let Ok(Some(monitor)) = window.current_monitor() {
                    let screen_size = monitor.size();
                    if let Ok(window_size) = window.outer_size() {
                        let x = (screen_size.width as i32 - window_size.width as i32) / 2;
                        let y = (screen_size.height as i32 - window_size.height as i32) / 2;
                        let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
                    }
                }
                
                // NOW show the window with content already loaded
                let _ = window.show();
                
                // Play warning sound RIGHT AFTER window appears for perfect sync
                play_warning_sound();
            }
        }
    });
    
    println!("[Tauri] Notification window created and shown");
    Ok(())
}

#[tauri::command]
fn dismiss_notification(app: tauri::AppHandle) -> Result<(), String> {
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("✅ ✅ ✅ WARNING DISMISSED - USER ACTIVE ✅ ✅ ✅");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    
    if let Some(window) = app.get_window("notification") {
        window.close().map_err(|e| format!("Failed to close window: {}", e))?;
    }
    
    Ok(())
}

#[tauri::command]
fn update_notification_to_distracted(app: tauri::AppHandle) -> Result<(), String> {
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("🚨 🚨 🚨 MARKED AS DISTRACTED 🚨 🚨 🚨");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    
    if let Some(window) = app.get_window("notification") {
        // Emit event to update the notification to distracted state
        let payload = serde_json::json!({
            "title": "Marked as Distracted",
            "body": "You were marked as distracted. Everyone in the session has been notified.",
            "isDistracted": true
        });
        
        window.emit("notification-message", payload)
            .map_err(|e| format!("Failed to emit distracted event: {}", e))?;
        
        println!("[Tauri] ✅ Notification updated to distracted state");
        
        // Play sound in separate thread with small delay (non-blocking)
        std::thread::spawn(|| {
            // Small delay to sync with visual update
            std::thread::sleep(std::time::Duration::from_millis(500));
            play_distracted_sound();
        });
    } else {
        println!("[Tauri] ⚠️ Notification window not found - may have been dismissed");
    }
    
    Ok(())
}

#[tauri::command]
async fn show_participant_alert(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
    println!("[Tauri] Attempting to show participant alert window: {} - {}", title, body);
    
    let window_label = "participant-alert";
    
    // Check if alert window already exists, close it first and wait for cleanup
    if let Some(existing) = app.get_window(window_label) {
        println!("[Tauri] ⚠️  Closing existing participant alert window...");
        let _ = existing.close();
        // Wait for window to fully close before creating new one
        std::thread::sleep(std::time::Duration::from_millis(200));
    }
    
    // Always use App URL - Tauri handles dev vs production
    let url = tauri::WindowUrl::App("participant-alert.html".into());
    
    let _window = tauri::WindowBuilder::new(
        &app,
        window_label,
        url
    )
    .title(&title)
    .inner_size(300.0, 180.0)
    .resizable(false)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible(false) // Start hidden, will show after content is loaded
    .focused(false) // Don't focus when shown
    .accept_first_mouse(false) // Don't accept focus on first click (macOS)
    .build()
    .map_err(|e| format!("Failed to create alert window: {}", e))?;
    
    // Store app_handle instead of window to avoid dangling references
    let app_clone = app.clone();
    let label = window_label.to_string();
    let title_clone = title.clone();
    let body_clone = body.clone();
    tauri::async_runtime::spawn(async move {
        // Wait longer for the window's JavaScript to fully initialize
        std::thread::sleep(std::time::Duration::from_millis(500));
        
        // Re-fetch window - it may have been closed during the delay
        if let Some(window) = app_clone.get_window(&label) {
            // Send the message first (using participant-specific event name)
            let _ = window.emit("participant-alert-message", serde_json::json!({
                "title": title_clone,
                "body": body_clone
            }));
            println!("[Tauri] 📨 Sent participant-alert-message event");
            
            // Longer delay to ensure JavaScript processes the message
            std::thread::sleep(std::time::Duration::from_millis(200));
            
            // Re-fetch window again after delay
            if let Some(window) = app_clone.get_window(&label) {
                // Position the window in top-right corner
                if let Ok(Some(monitor)) = window.current_monitor() {
                    let screen_size = monitor.size();
                    if let Ok(window_size) = window.outer_size() {
                        let x = (screen_size.width as i32 - window_size.width as i32) - 20; // 20px from right edge
                        let y = 20; // 20px from top
                        let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
                    }
                }
                
                // NOW show the window with content already loaded
                let _ = window.show();
                
                // Play alert sound RIGHT AFTER window appears for perfect sync
                play_alert_sound();
            }
        }
    });

    // Auto-close the window after 5 seconds
    let app_for_close = app.clone();
    let label_for_close = window_label.to_string();
    tauri::async_runtime::spawn(async move {
        std::thread::sleep(std::time::Duration::from_millis(4700));
        if let Some(w) = app_for_close.get_window(&label_for_close) {
            let _ = w.close();
            println!("[Tauri] ✅ Alert window auto-closed after 4.7 seconds");
        }
    });
    
    println!("[Tauri] Participant alert window created and shown (top-right, auto-closes in 4.7s)");
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
    // For self-distraction alerts from browser extension
    domain: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct SessionResponse {
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
    #[serde(rename = "joinedAt")]
    joined_at: Option<String>,
    active: Option<bool>,
    /// Server always sends an array; default to empty if key is missing (defensive)
    #[serde(rename = "pendingAlerts", default)]
    pending_alerts: Option<Vec<PendingAlert>>,
    #[serde(rename = "distractingApps", default)]
    distracting_apps: Vec<String>,
    #[serde(rename = "allowedApps", default)]
    allowed_apps: Vec<String>,
}

/// Play warning sound for local idle warning (yellow notification)
fn play_warning_sound() {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        // Use Ping sound for personal warning - attention-grabbing
        let _ = Command::new("afplay")
            .arg("/System/Library/Sounds/Ping.aiff")
            .output();
    }
    
    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        let _ = Command::new("paplay")
            .arg("/usr/share/sounds/freedesktop/stereo/bell.oga")
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
        // Higher pitch beep for warning
        let _ = Command::new("powershell")
            .args(&["-Command", "[console]::beep(1000,400)"])
            .output();
    }
}

/// Play alert sound when another participant goes idle (blue notification)
fn play_alert_sound() {
    println!("[Sound] 🔊 Playing alert sound (Glass.aiff)");
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        // Use Glass sound for participant alerts - softer, informational
        let _ = Command::new("afplay")
            .arg("/System/Library/Sounds/Glass.aiff")
            .output();
        println!("[Sound] ✅ Alert sound played");
    }
    
    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
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
        let _ = Command::new("powershell")
            .args(&["-Command", "[console]::beep(800,300)"])
            .output();
    }
}

/// Play distracted sound when user is marked as distracted (yellow→red notification)
fn play_distracted_sound() {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        // Use Basso sound for distracted - more urgent/serious
        let _ = Command::new("afplay")
            .arg("/System/Library/Sounds/Basso.aiff")
            .output();
    }
    
    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        let _ = Command::new("paplay")
            .arg("/usr/share/sounds/freedesktop/stereo/alarm-clock-elapsed.oga")
            .output();
    }
    
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let _ = Command::new("powershell")
            .args(&["-Command", "[console]::beep(400,500)"])
            .output();
    }
}

// =====================================
// DISTRACTION DETECTION
// =====================================

/// Get foreground app info. Returns (app_name, window_title).
/// Data is used only for classification, then discarded.
fn get_foreground_info() -> Option<(String, String)> {
    match get_active_window() {
        Ok(window) => {
            let app_name = window.app_name;
            let title = window.title;
            Some((app_name, title))
        }
        Err(_) => None,
    }
}

/// Get the detection session mutex
fn get_detection_session() -> &'static Mutex<Option<(String, String)>> {
    DETECTION_SESSION.get_or_init(|| Mutex::new(None))
}

/// Send focus state to backend
fn send_focus_state(user_id: &str, session_id: &str, state: &str) {
    println!("[Focus State] 📡 Sending state update: userId={}, sessionId={}, state={}", user_id, session_id, state);
    
    let backend_url = std::env::var("BACKEND_URL")
        .unwrap_or_else(|_| "https://85f28487-f52a-4264-bfe6-832501142976-00-36zv4e7q2xsre.spock.replit.dev".to_string());
    
    let endpoint = format!("{}/api/activity/update", backend_url);
    let timestamp = chrono::Utc::now().to_rfc3339();
    
    let user_id = user_id.to_string();
    let session_id = session_id.to_string();
    let state = state.to_string();
    
    tauri::async_runtime::spawn(async move {
        let client = match tauri::api::http::ClientBuilder::new().build() {
            Ok(c) => c,
            Err(_) => return,
        };
        
        let body = serde_json::json!({
            "userId": user_id,
            "sessionId": session_id,
            "status": state,
            "timestamp": timestamp,
        });
        
        let request = match tauri::api::http::HttpRequestBuilder::new("POST", &endpoint) {
            Ok(r) => r,
            Err(_) => return,
        };
        
        let request = match request.header("Content-Type", "application/json") {
            Ok(r) => r,
            Err(_) => return,
        };
        
        let request = request.body(tauri::api::http::Body::Json(body));
        
        let _ = client.send(request).await;
    });
}

/// Show distraction warning popup (orange)
fn show_distraction_warning(app_handle: &tauri::AppHandle) {
    let window_label = "distraction-warning";
    
    // Close existing if any
    if let Some(existing) = app_handle.get_window(window_label) {
        let _ = existing.close();
        // Wait for window to fully close before creating new one
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    
    // Always use App URL - Tauri handles dev vs production
    let url = tauri::WindowUrl::App("distraction-warning.html".into());
    
    match tauri::WindowBuilder::new(
        app_handle,
        window_label,
        url
    )
    .title("Distraction Warning")
    .inner_size(380.0, 370.0)
    .resizable(false)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible(false)
    .focused(false)
    .build()
    {
        Ok(_window) => {
            // Store app_handle instead of window to avoid dangling references
            let app_clone = app_handle.clone();
            let label = window_label.to_string();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(500));
                
                // Re-fetch window - it may have been closed during the delay
                if let Some(window) = app_clone.get_window(&label) {
                    // Send initial message
                    let _ = window.emit("distraction-warning-message", serde_json::json!({
                        "title": "Distracting App Detected",
                        "body": "Switch back to productive work to stay focused",
                        "countdown": 10,
                        "isDistracted": false
                    }));
                    
                    std::thread::sleep(std::time::Duration::from_millis(200));
                    
                    // Re-fetch window again after delay
                    if let Some(window) = app_clone.get_window(&label) {
                        // Center the window
                        if let Ok(Some(monitor)) = window.current_monitor() {
                            let screen_size = monitor.size();
                            if let Ok(window_size) = window.outer_size() {
                                let x = (screen_size.width as i32 - window_size.width as i32) / 2;
                                let y = (screen_size.height as i32 - window_size.height as i32) / 2;
                                let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
                            }
                        }
                        
                        let _ = window.show();
                        
                        // Play warning sound
                        #[cfg(target_os = "macos")]
                        {
                            use std::process::Command;
                            let _ = Command::new("afplay")
                                .arg("/System/Library/Sounds/Funk.aiff")
                                .output();
                        }
                    }
                }
            });
            println!("[Detection] Distraction warning shown");
        }
        Err(e) => {
            println!("[Detection] Failed to create warning window: {}", e);
        }
    }
}

/// Update distraction warning to show "marked as distracted" (red)
fn update_distraction_warning_to_distracted(app_handle: &tauri::AppHandle) {
    if let Some(window) = app_handle.get_window("distraction-warning") {
        let _ = window.emit("distraction-warning-message", serde_json::json!({
            "title": "Marked as Distracted",
            "body": "Session participants have been notified",
            "isDistracted": true
        }));
        
        // Play distracted sound
        std::thread::spawn(|| {
            std::thread::sleep(std::time::Duration::from_millis(300));
            #[cfg(target_os = "macos")]
            {
                use std::process::Command;
                let _ = Command::new("afplay")
                    .arg("/System/Library/Sounds/Basso.aiff")
                    .output();
            }
        });
        
        println!("[Detection] Warning updated to distracted state");
    }
}

/// Dismiss distraction warning popup
fn dismiss_distraction_warning(app_handle: &tauri::AppHandle) {
    if let Some(window) = app_handle.get_window("distraction-warning") {
        let _ = window.close();
        println!("[Detection] Distraction warning dismissed");
    }
    // Clear browser distraction flag when dismissing
    BROWSER_DISTRACTION_ACTIVE.store(false, Ordering::SeqCst);
}

/// Poll server for self-distraction alerts from browser extension
/// Returns true if a self-distraction alert was found
fn poll_for_browser_alerts(user_id: &str) -> bool {
    let backend_url = std::env::var("BACKEND_URL")
        .unwrap_or_else(|_| "https://85f28487-f52a-4264-bfe6-832501142976-00-36zv4e7q2xsre.spock.replit.dev".to_string());
    
    let endpoint = format!("{}/api/activity/session?userId={}&source=desktop", backend_url, user_id);
    
    // Use blocking reqwest for simplicity in the detection thread
    let client = match reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build() {
            Ok(c) => c,
            Err(_) => return false,
        };
    
    let response = match client.get(&endpoint).send() {
        Ok(r) => r,
        Err(_) => return false,
    };
    
    let json: serde_json::Value = match response.json() {
        Ok(j) => j,
        Err(_) => return false,
    };
    
    // Check for currentDistraction field (persistent while user is on distracting site)
    if let Some(distraction) = json.get("currentDistraction") {
        let domain = distraction.get("domain")
            .and_then(|d| d.as_str())
            .unwrap_or("a distracting site");
        println!("[Detection] 🌐 Browser distraction active: {}", domain);
        return true;
    }
    
    false
}

/// Start distraction detection for a session
fn start_detection(app_handle: tauri::AppHandle, user_id: String, session_id: String) {
    println!("[Detection] 🚀 start_detection called with userId={}, sessionId={}", user_id, session_id);
    
    // Already running?
    if DETECTION_RUNNING.load(Ordering::SeqCst) {
        println!("[Detection] ⚠️ Detection already running - skipping start");
        return;
    }
    
    // Store session info
    if let Ok(mut session) = get_detection_session().lock() {
        *session = Some((user_id.clone(), session_id.clone()));
        println!("[Detection] ✅ Stored session info in DETECTION_SESSION");
    }
    
    // Clear any stale browser distraction state
    BROWSER_DISTRACTION_ACTIVE.store(false, Ordering::SeqCst);
    
    DETECTION_RUNNING.store(true, Ordering::SeqCst);
    
    // Update tray to show monitoring active
    let tray = app_handle.tray_handle();
    let _ = tray.get_item("status").set_title("Monitoring: Active");
    
    println!("[Detection] Started for user {} in session {}", user_id, session_id);
    
    // Spawn detection thread
    std::thread::spawn(move || {
        // State tracking
        let mut warning_shown_at: Option<std::time::Instant> = None;
        let mut is_marked_distracted = false;
        let mut last_sent_state: Option<&str> = None;
        let mut poll_counter: u32 = 0;
        let mut warning_from_browser = false; // Track if current warning is from browser vs local app
        let mut last_server_check: Option<std::time::Instant> = None;
        let mut last_server_result: Option<bool> = None;
        let mut last_checked_app: String = String::new();
        
        const WARNING_DURATION_SECS: u64 = 10;
        const POLL_INTERVAL: u32 = 1; // Poll for browser alerts every 1 second for fast response
        const SERVER_CHECK_INTERVAL_MS: u128 = 2000; // Check with server every 2 seconds
        
        while DETECTION_RUNNING.load(Ordering::SeqCst) {
            // Get session info
            let session_info = {
                get_detection_session().lock().ok().and_then(|s| s.clone())
            };
            
            if let Some((user_id, session_id)) = session_info {
                // Poll for browser extension alerts every POLL_INTERVAL seconds (use current linked user for consistency with ping/app reports)
                poll_counter += 1;
                if poll_counter >= POLL_INTERVAL {
                    poll_counter = 0;
                    let current_user = get_current_user_id();
                    let alert_user = current_user.as_deref().unwrap_or(&user_id);
                    if poll_for_browser_alerts(alert_user) {
                        // Browser detected a distracting site - set the flag
                        if !BROWSER_DISTRACTION_ACTIVE.load(Ordering::SeqCst) {
                            println!("[Detection] 🌐 Browser distraction detected - setting flag");
                        }
                        BROWSER_DISTRACTION_ACTIVE.store(true, Ordering::SeqCst);
                    } else {
                        // No browser distraction alert - clear the flag
                        if BROWSER_DISTRACTION_ACTIVE.load(Ordering::SeqCst) {
                            println!("[Detection] ✅ Browser distraction cleared - clearing flag");
                        }
                        BROWSER_DISTRACTION_ACTIVE.store(false, Ordering::SeqCst);
                    }
                }
                
                // Check browser distraction flag (updated by polling)
                let browser_distraction_reported = BROWSER_DISTRACTION_ACTIVE.load(Ordering::SeqCst);
                
                // Get foreground info and classify
                if let Some((app_name, _title)) = get_foreground_info() {
                    // Check if foreground is our own app (the warning popup itself)
                    let app_lower = app_name.to_lowercase();
                    let is_our_app = app_lower.contains("focustogether") || app_lower.contains("focus together");
                    
                    // Check if foreground is Chrome (browser extension only runs in Chrome)
                    // Only show browser distraction warning when Chrome is the active app
                    let is_chrome = app_lower.contains("chrome") 
                        || app_lower.contains("chromium")
                        || app_lower.contains("arc") // Arc is Chromium-based and supports Chrome extensions
                        || app_lower.contains("opera")
                        || app_lower.contains("vivaldi");
                    
                    // Browser distraction only counts when Chrome is in foreground
                    let is_browser_distracting = browser_distraction_reported && is_chrome;
                    
                    // Check with server if foreground app is distracting
                    // Server is the source of truth - it handles all categorization
                    let is_server_blocked = if is_our_app || is_chrome {
                        // Don't check our own app or browsers (browser extension handles those)
                        false
                    } else {
                        // Check if we need to query server (rate limit to every 2 seconds or when app changes)
                        let should_check_server = match last_server_check {
                            None => true,
                            Some(last_check) => {
                                last_check.elapsed().as_millis() >= SERVER_CHECK_INTERVAL_MS 
                                || last_checked_app != app_name
                            }
                        };
                        
                        if should_check_server {
                            last_server_check = Some(std::time::Instant::now());
                            last_checked_app = app_name.clone();
                            
                            // Use current linked user (same as ping) so app reports stay in sync after deep link switch
                            let is_blocked = if let Some(ref current_user) = get_current_user_id() {
                                match check_apps_with_server(current_user, &app_name) {
                                    Some(b) => b,
                                    None => last_server_result.unwrap_or(false),
                                }
                            } else {
                                last_server_result.unwrap_or(false)
                            };
                            last_server_result = Some(is_blocked);
                            is_blocked
                        } else {
                            // Use cached result
                            last_server_result.unwrap_or(false)
                        }
                    };
                    
                    // Determine if currently distracting
                    // Special case: if warning was from a LOCAL app (not browser) and user switched 
                    // to a non-blocked app, dismiss even if browser has stale distraction data
                    let is_distracting_now = if warning_shown_at.is_some() && !warning_from_browser && !is_server_blocked {
                        // Warning was from local app, and current app is not server-blocked
                        // Dismiss the warning - user switched away from the distracting app
                        false
                    } else {
                        is_server_blocked || is_browser_distracting
                    };
                    
                    // If our app is in foreground, handle timer but also check if distraction cleared
                    if is_our_app {
                        // Only auto-dismiss if the warning was from a BROWSER distraction that's now cleared
                        // For LOCAL app distractions, don't dismiss - wait for user to actually switch away
                        if warning_from_browser && !browser_distraction_reported && warning_shown_at.is_some() && !is_marked_distracted {
                            // Browser distraction cleared (user closed tab or navigated away) - dismiss the warning
                            println!("[Detection] ✅ Browser distraction cleared while viewing popup - dismissing");
                            dismiss_distraction_warning(&app_handle);
                            warning_shown_at = None;
                            warning_from_browser = false;
                            
                            if last_sent_state != Some("active") {
                                send_focus_state(&user_id, &session_id, "active");
                                println!("[Detection] Back to active");
                                last_sent_state = Some("active");
                            }
                            std::thread::sleep(std::time::Duration::from_secs(1));
                            continue;
                        }
                        
                        // Still check if warning timer expired
                        if let Some(start_time) = warning_shown_at {
                            if start_time.elapsed().as_secs() >= WARNING_DURATION_SECS && !is_marked_distracted {
                                // Time's up - mark as distracted
                                is_marked_distracted = true;
                                println!("[Detection] ⏰ 10 seconds passed - transitioning to distracted");
                                update_distraction_warning_to_distracted(&app_handle);
                                
                                if last_sent_state != Some("distracted") {
                                    send_focus_state(&user_id, &session_id, "distracted");
                                    println!("[Detection] Marked as distracted after 10s warning");
                                    last_sent_state = Some("distracted");
                                }
                            }
                        }
                        std::thread::sleep(std::time::Duration::from_secs(1));
                        continue;
                    }
                    
                    if is_distracting_now {
                        // User is on a distracting app (server-identified or browser)
                        if warning_shown_at.is_none() && !is_marked_distracted {
                            // First detection - show warning
                            show_distraction_warning(&app_handle);
                            warning_shown_at = Some(std::time::Instant::now());
                            warning_from_browser = is_browser_distracting; // Track source of distraction
                            if is_browser_distracting {
                                println!("[Detection] Warning triggered by browser extension");
                            } else {
                                println!("[Detection] ⚠️ Warning triggered - server identified '{}' as distracting", app_name);
                            }
                        } else if let Some(start_time) = warning_shown_at {
                            // Warning already shown - check if 10 seconds passed
                            if start_time.elapsed().as_secs() >= WARNING_DURATION_SECS && !is_marked_distracted {
                                // Time's up - mark as distracted
                                is_marked_distracted = true;
                                println!("[Detection] ⏰ 10 seconds passed - transitioning to distracted");
                                update_distraction_warning_to_distracted(&app_handle);
                                
                                if last_sent_state != Some("distracted") {
                                    send_focus_state(&user_id, &session_id, "distracted");
                                    println!("[Detection] Marked as distracted after 10s warning");
                                    last_sent_state = Some("distracted");
                                }
                            }
                        }
                    } else {
                        // User is on a productive/neutral app
                        if warning_shown_at.is_some() || is_marked_distracted {
                            // Was in warning/distracted state - dismiss and reset
                            dismiss_distraction_warning(&app_handle);
                            warning_shown_at = None;
                            is_marked_distracted = false;
                            warning_from_browser = false; // Reset tracking
                            
                            if last_sent_state != Some("active") {
                                send_focus_state(&user_id, &session_id, "active");
                                println!("[Detection] Back to active");
                                last_sent_state = Some("active");
                            }
                        } else if last_sent_state.is_none() {
                            // Initial state - send active
                            send_focus_state(&user_id, &session_id, "active");
                            last_sent_state = Some("active");
                        }
                    }
                }
            }
            
            // Check every 1 second for responsive warning countdown
            std::thread::sleep(std::time::Duration::from_secs(1));
        }
        
        // Cleanup on stop
        dismiss_distraction_warning(&app_handle);
        println!("[Detection] Thread stopped");
    });
}

/// Stop distraction detection
fn stop_detection(app_handle: &tauri::AppHandle) {
    if !DETECTION_RUNNING.load(Ordering::SeqCst) {
        return;
    }
    
    DETECTION_RUNNING.store(false, Ordering::SeqCst);
    
    // Clear session info
    if let Ok(mut session) = get_detection_session().lock() {
        *session = None;
    }
    
    // Dismiss ALL notification windows when session ends
    dismiss_all_notifications(app_handle);
    
    // Update tray to show monitoring inactive
    let tray = app_handle.tray_handle();
    let _ = tray.get_item("status").set_title("Monitoring: Inactive");
    
    println!("[Detection] Stopped");
}

/// Dismiss all notification windows (called when session ends)
fn dismiss_all_notifications(app_handle: &tauri::AppHandle) {
    // Close distraction warning (orange popup)
    if let Some(window) = app_handle.get_window("distraction-warning") {
        let _ = window.close();
        println!("[Cleanup] Closed distraction-warning window");
    }
    
    // Close idle warning (yellow popup)
    if let Some(window) = app_handle.get_window("notification") {
        let _ = window.close();
        println!("[Cleanup] Closed notification (idle warning) window");
    }
    
    // Close participant alert (blue popup)
    if let Some(window) = app_handle.get_window("participant-alert") {
        let _ = window.close();
        println!("[Cleanup] Closed participant-alert window");
    }
    
    // Close startup notification (green popup)
    if let Some(window) = app_handle.get_window("startup-notification") {
        let _ = window.close();
        println!("[Cleanup] Closed startup-notification window");
    }
    
    // Clear browser distraction flag
    BROWSER_DISTRACTION_ACTIVE.store(false, Ordering::SeqCst);
    
    println!("[Cleanup] All notification windows dismissed");
}

#[tauri::command]
async fn get_active_session(app: tauri::AppHandle, userId: String) -> Result<Option<String>, String> {
    let poll_num = SESSION_POLL_COUNT.fetch_add(1, Ordering::Relaxed) + 1;
    println!("[Tauri] Poll #{} get_active_session userId={}", poll_num, userId);
    
    // Read backend URL from environment variable, default to Replit URL
    let backend_url = std::env::var("BACKEND_URL")
        .unwrap_or_else(|_| "https://85f28487-f52a-4264-bfe6-832501142976-00-36zv4e7q2xsre.spock.replit.dev".to_string());
    
    let endpoint = format!("{}/api/activity/session?userId={}&source=desktop", backend_url, userId);
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
        let raw = response_data.data.clone();
        let raw_str = serde_json::to_string_pretty(&raw).unwrap_or_else(|_| format!("{:?}", raw));
        println!("[Tauri] 📥 RAW response data: {}", raw_str);
        
        let session_response: SessionResponse = serde_json::from_value(raw.clone()).map_err(|e| {
            // When parse fails, inspect pendingAlerts specifically to debug desktop/server mismatch
            if let Some(pending) = raw.get("pendingAlerts") {
                println!("[Tauri] ⚠️ Parse failed but pendingAlerts key exists: {}", 
                    serde_json::to_string(pending).unwrap_or_else(|_| format!("{:?}", pending)));
            } else {
                println!("[Tauri] ⚠️ Parse failed; no pendingAlerts key in response");
            }
            println!("[Tauri] Serde error: {}", e);
            format!("Failed to parse JSON response: {}", e)
        })?;
        
        // Debug: Log the full response structure
        println!("[Tauri] Session response - sessionId: {:?}, pendingAlerts: {:?}, distractingApps: {}", 
                 session_response.session_id, 
                 session_response.pending_alerts.as_ref().map(|a| a.len()),
                 session_response.distracting_apps.len());
        
        // Note: distractingApps list is no longer used for local matching
        // The desktop app now calls /api/desktop/apps directly for server-side categorization
        
        // Process pending alerts
        if let Some(ref alerts) = session_response.pending_alerts {
            if !alerts.is_empty() {
                println!("[Tauri] 🔔 Processing {} pending alert(s) for userId: {}", alerts.len(), userId);
                
                // First, handle self-distraction alerts from browser extension
                for alert in alerts {
                    if alert.alert_type == "self-distraction" {
                        let domain = alert.domain.clone().unwrap_or_else(|| "a distracting site".to_string());
                        println!("[Tauri] 🌐 Self-distraction alert: browser detected distracting site: {}", domain);
                        
                        // Show the orange distraction warning popup
                        show_distraction_warning(&app);
                        
                        // Note: The 10-second countdown and distracted state transition
                        // will be handled by the existing detection loop
                    }
                }
                
                // Deduplicate partner alerts: keep only the one with the best display name for each alerting user
                use std::collections::HashMap;
                let mut best_alerts: HashMap<String, &PendingAlert> = HashMap::new();
                
                for alert in alerts {
                    // Skip self-distraction alerts (already handled above)
                    if alert.alert_type == "self-distraction" {
                        continue;
                    }
                    
                    // Only process "idle" or "distracted" status alerts
                    if alert.status != "idle" && alert.status != "distracted" {
                        continue;
                    }
                    
                    let alerting_user_id = &alert.alerting_user_id;
                    
                    // Check if we already have an alert for this user
                    let should_replace = if let Some(existing) = best_alerts.get(alerting_user_id) {
                        // Prefer alerts with firstName, then username, then keep existing
                        alert.alerting_first_name.is_some() && existing.alerting_first_name.is_none()
                    } else {
                        true
                    };
                    
                    if should_replace {
                        best_alerts.insert(alerting_user_id.clone(), alert);
                    }
                }
                
                println!("[Tauri] 📊 After deduplication: {} unique alert(s)", best_alerts.len());
                
                // Now process the deduplicated alerts
                for alert in best_alerts.values() {
                    println!("[Tauri] 📋 Alert received - status: {}, alertingUserId: {}", alert.status, alert.alerting_user_id);
                    
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
                    
                    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                    println!("🚨 PARTICIPANT ALERT RECEIVED!");
                    println!("📢 Message: {}", message);
                    println!("👤 Alerting User: {}", alert.alerting_user_id);
                    println!("⚠️  Status: {}", alert.status);
                    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                    
                    // ALWAYS use custom notification window in dev mode
                    // Native notifications are unreliable without code signing
                    let title = "FocusTogether Alert".to_string();
                    println!("[Tauri] 🪟 Showing custom notification window title=\"{}\" message=\"{}\"", title, message);
                    match show_participant_alert(
                        app.clone(),
                        title,
                        message.clone(),
                    ).await {
                        Ok(_) => {
                            println!("✅ ✅ ✅ CUSTOM NOTIFICATION WINDOW SHOWN ✅ ✅ ✅");
                            // Sound is now played inside show_participant_alert after window shows
                        }
                        Err(e) => {
                            println!("❌ ❌ ❌ NOTIFICATION WINDOW FAILED: {} ❌ ❌ ❌", e);
                        }
                    }
                }
            } else {
                println!("[Tauri] ⭕ pendingAlerts present but empty ([]) for userId={}", userId);
            }
        } else {
            println!("[Tauri] ⭕ No pendingAlerts field in response for userId={}", userId);
        }
        
        match session_response.session_id {
            Some(session_id) => {
                println!("[Tauri] ✅ Active session found: {}", session_id);
                // Start distraction detection if not already running
                start_detection(app.clone(), userId.clone(), session_id.clone());
                Ok(Some(session_id))
            }
            None => {
                println!("[Tauri] No active session (sessionId is null)");
                // Stop distraction detection
                stop_detection(&app);
                Ok(None)
            }
        }
    } else {
        let error_msg = format!("Backend returned error status: {}", status_code);
        println!("[Tauri] ❌ {}", error_msg);
        // Stop distraction detection on error
        stop_detection(&app);
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

#[tauri::command]
fn get_user_id() -> Option<String> {
    // Single source of truth (same value used for pings and session polling)
    if let Some(ref user_id) = get_current_user_id() {
        println!("[Tauri] get_user_id: {}", user_id);
        return Some(user_id.clone());
    }
    // Fallback to environment variable (for testing)
    if let Ok(user_id) = std::env::var("USER_ID") {
        println!("[Tauri] get_user_id from env: {}", user_id);
        return Some(user_id);
    }
    println!("[Tauri] get_user_id: No user ID configured");
    None
}

#[tauri::command]
fn is_listener_only() -> bool {
    // Check if LISTENER_ONLY environment variable is set
    let listener_only = std::env::var("LISTENER_ONLY")
        .unwrap_or_else(|_| "false".to_string())
        .to_lowercase() == "true";
    println!("[Tauri] is_listener_only called, returning: {}", listener_only);
    listener_only
}

fn main() {
    println!("[Tauri] Starting FocusTogether Enforcer...");
    
    // Create system tray menu
    let quit = tauri::CustomMenuItem::new("quit".to_string(), "Quit FocusTogether");
    let status = tauri::CustomMenuItem::new("status".to_string(), "Monitoring: Inactive").disabled();
    let tray_menu = tauri::SystemTrayMenu::new()
        .add_item(status)
        .add_native_item(tauri::SystemTrayMenuItem::Separator)
        .add_item(quit);
    
    let system_tray = tauri::SystemTray::new().with_menu(tray_menu);
    
    tauri::Builder::default()
        .system_tray(system_tray)
        .on_system_tray_event(|app, event| {
            match event {
                tauri::SystemTrayEvent::MenuItemClick { id, .. } => {
                    match id.as_str() {
                        "quit" => {
                            println!("[Tray] Quit clicked - exiting app");
                            std::process::exit(0);
                        }
                        _ => {}
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![get_idle_seconds, show_notification, show_participant_alert, dismiss_notification, update_notification_to_distracted, send_activity_update, get_active_session, get_user_id, is_listener_only])
        .setup(|app| {
            println!("[Tauri] Setup callback called");
            
            // Initialize deep link plugin
            #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
            {
                // Prepare deep link handler for "focustogether" scheme
                tauri_plugin_deep_link::prepare("focustogether");
                println!("[DeepLink] ✅ Deep link handler prepared for focustogether://");
                
                // Register handler for deep link events
                let app_handle = app.handle();
                tauri_plugin_deep_link::register("focustogether", move |request| {
                    println!("[DeepLink] 🔗 Received deep link: {}", request);
                    
                    // Parse the URL and extract userId
                    if let Some(user_id) = parse_deep_link(&request) {
                        println!("[DeepLink] Extracted userId: {}", user_id);
                        
                        let old_user_id = get_current_user_id();
                        
                        // Stop all intervals/loops for the old user so we replace, not add
                        let old_str = old_user_id.as_deref().unwrap_or("none");
                        println!("[DeepLink] Switching user from {} to {}, clearing old intervals", old_str, user_id);
                        stop_heartbeat_loop();
                        stop_detection(&app_handle);
                        
                        // Save to config (also updates CURRENT_USER_ID)
                        match set_user_id(user_id.clone()) {
                            Ok(_) => {
                                println!("[DeepLink] User ID saved to config");
                                // Start new heartbeat immediately with new user only
                                start_heartbeat_loop();
                                let _ = app_handle.emit_all("userId-changed", ());
                                
                                // Immediately check for active session and restart detection if needed
                                println!("[DeepLink] Checking for active session for new user: {}", user_id);
                                let user_id_for_session = user_id.clone();
                                let app_handle_for_session = app_handle.clone();
                                tauri::async_runtime::spawn(async move {
                                    match get_active_session(app_handle_for_session, user_id_for_session).await {
                                        Ok(Some(session_id)) => {
                                            println!("[DeepLink] Detection restarted for new user with session: {}", session_id);
                                        }
                                        Ok(None) => {
                                            println!("[DeepLink] No active session for new user - detection will start when session begins");
                                        }
                                        Err(e) => {
                                            println!("[DeepLink] Failed to check active session: {} (detection will start on next frontend poll)", e);
                                        }
                                    }
                                });
                                
                                // Register with backend (async) and show notification
                                let user_id_for_register = user_id.clone();
                                let app_handle_clone = app_handle.clone();
                                tauri::async_runtime::spawn(async move {
                                    match register_desktop_connection(&user_id_for_register).await {
                                        Ok(_) => {
                                            println!("[DeepLink] Backend registration successful");
                                            if let Err(e) = tauri::api::notification::Notification::new(&app_handle_clone.config().tauri.bundle.identifier)
                                                .title("FocusTogether Connected!")
                                                .body("Desktop app linked to your account")
                                                .show()
                                            {
                                                println!("[DeepLink] Failed to show confirmation: {}", e);
                                            }
                                        }
                                        Err(e) => {
                                            println!("[DeepLink] Backend registration failed: {} (heartbeat already running)", e);
                                            // Still show notification but with warning
                                            if let Err(e) = tauri::api::notification::Notification::new(&app_handle_clone.config().tauri.bundle.identifier)
                                                .title("FocusTogether Connected")
                                                .body("Linked locally - backend sync pending")
                                                .show()
                                            {
                                                println!("[DeepLink] Failed to show notification: {}", e);
                                            }
                                        }
                                    }
                                });
                            }
                            Err(e) => {
                                println!("[DeepLink] ❌ Failed to save user ID: {}", e);
                            }
                        }
                    }
                }).map_err(|e| format!("Failed to register deep link handler: {}", e))?;
            }
            
            // Load existing config to check if user is already linked
            // If so, start heartbeat loop immediately
            let existing_user_id = {
                let config = get_config();
                if let Ok(config_guard) = config.lock() {
                    config_guard.user_id.clone()
                } else {
                    None
                }
            };
            println!("[Config] Config path: {:?}, userId: {:?}", get_config_path(), existing_user_id);
            
            if let Some(ref user_id) = existing_user_id {
                println!("[Config] ✅ User already linked: {}", user_id);
                set_current_user_id(Some(user_id.clone()));
                // Re-register with server so web app shows "Desktop App Connected", then start heartbeat
                let user_id_for_register = user_id.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = register_desktop_connection(&user_id_for_register).await {
                        println!("[Config] ⚠️ Failed to re-register desktop connection: {} (heartbeat will still run)", e);
                    } else {
                        println!("[Config] ✅ Desktop re-registered with server");
                    }
                    start_heartbeat_loop();
                });
            } else {
                println!("[Config] ⚠️  No user linked yet - waiting for deep link from web app");
            }
            
            // Make app a background utility - hides from Dock and Cmd+Tab
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            
            // Hide the main window and remove from taskbar - app runs in background only
            if let Some(main_window) = app.get_window("main") {
                let _ = main_window.set_skip_taskbar(true);
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
            
            // Show startup confirmation popup window
            let (is_linked, user_id_opt) = {
                let config_guard = get_config().lock().unwrap();
                (config_guard.user_id.is_some(), config_guard.user_id.clone())
            };
            
            let app_handle = app.handle();
            std::thread::spawn(move || {
                // Small delay to ensure app is fully initialized
                std::thread::sleep(std::time::Duration::from_millis(500));
                
                let window_label = "startup-notification";
                
                // Create startup notification window - Always use App URL
                let url = tauri::WindowUrl::App("startup-notification.html".into());
                
                match tauri::WindowBuilder::new(
                    &app_handle,
                    window_label,
                    url
                )
                .title("FocusTogether")
                .inner_size(360.0, 260.0)
                .resizable(false)
                .decorations(false)
                .always_on_top(true)
                .center()
                .visible(false)
                .skip_taskbar(true)
                .build()
                {
                    Ok(_window) => {
                        println!("[Tauri] ✅ Startup notification window created");
                        
                        // Wait for window to initialize
                        std::thread::sleep(std::time::Duration::from_millis(300));
                        
                        // Re-fetch window to ensure it still exists
                        if let Some(window) = app_handle.get_window(window_label) {
                            // Send status to the window
                            let payload = serde_json::json!({
                                "linked": is_linked,
                                "userId": user_id_opt.unwrap_or_default()
                            });
                            
                            if let Err(e) = window.emit("startup-status", payload) {
                                println!("[Tauri] Failed to send startup status: {}", e);
                            }
                            
                            // Wait a bit more then show
                            std::thread::sleep(std::time::Duration::from_millis(200));
                            
                            // Re-fetch again before show
                            if let Some(window) = app_handle.get_window(window_label) {
                                let _ = window.show();
                                println!("[Tauri] ✅ Startup notification shown");
                                
                                // Auto-close after 3 seconds
                                std::thread::sleep(std::time::Duration::from_secs(3));
                                
                                // Re-fetch before close
                                if let Some(window) = app_handle.get_window(window_label) {
                                    let _ = window.close();
                                    println!("[Tauri] Startup notification auto-closed");
                                }
                            }
                        }
                    }
                    Err(e) => {
                        println!("[Tauri] Failed to create startup notification window: {}", e);
                    }
                }
            });
            
            println!("[Tauri] Setup complete - app running in background");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
    println!("[Tauri] Application exited");
}

