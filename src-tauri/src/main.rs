// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Flowlocked Desktop App - Background Enforcement
// Idle monitoring only

use user_idle::UserIdle;
use tauri::Manager;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::OnceLock;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use active_win_pos_rs::get_active_window;
use std::io::Write;

mod browser_url;

static LOG_FILE: OnceLock<Mutex<std::fs::File>> = OnceLock::new();

/// Keep log small so TextEdit/Preview can open it; rotate when over limit.
const LIVE_LOG_MAX_BYTES: u64 = 512 * 1024;

fn init_log_file() {
    let log_path = dirs::desktop_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join("focustogether-live.log");
    if let Ok(meta) = fs::metadata(&log_path) {
        if meta.len() > LIVE_LOG_MAX_BYTES {
            let rotated = log_path.with_extension("log.old");
            let _ = fs::rename(&log_path, &rotated);
            eprintln!(
                "[Log] Rotated large log (>{}) to {}",
                LIVE_LOG_MAX_BYTES,
                rotated.display()
            );
        }
    }
    let file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .expect("Failed to open log file");
    LOG_FILE.set(Mutex::new(file)).ok();
    eprintln!("[Log] Writing to {}", log_path.display());
}

macro_rules! log {
    ($($arg:tt)*) => {{
        let msg = format!($($arg)*);
        let timestamp = chrono::Local::now().format("%H:%M:%S%.3f");
        let line = format!("[{}] {}", timestamp, msg);
        println!("{}", line);
        if let Some(f) = LOG_FILE.get() {
            if let Ok(mut f) = f.lock() {
                let _ = writeln!(f, "{}", line);
                let _ = f.flush();
            }
        }
    }};
}

/// On macOS, force a Tauri window to appear on screen using NSWindow APIs.
/// Must dispatch Cocoa calls to the main thread — AppKit crashes otherwise.
#[cfg(target_os = "macos")]
fn force_show_window(app_handle: &tauri::AppHandle, window_label: String) {
    let handle = app_handle.clone();
    let revert_handle = app_handle.clone();
    let _ = app_handle.run_on_main_thread(move || {
        use cocoa::appkit::{NSApp, NSApplication, NSApplicationActivationPolicy};
        use cocoa::base::id;
        use objc::runtime::YES;
        #[allow(unused_imports)]
        use objc::{sel, sel_impl, msg_send, class};
        
        unsafe {
            let ns_app = NSApp();
            ns_app.setActivationPolicy_(NSApplicationActivationPolicy::NSApplicationActivationPolicyRegular);
            ns_app.activateIgnoringOtherApps_(YES);
            
            if let Some(window) = handle.get_window(&window_label) {
                let ns_win: id = window.ns_window().unwrap() as id;
                let _: () = msg_send![ns_win, setLevel: 25_i64];
                let _: () = msg_send![ns_win, orderFrontRegardless];
                log!("[macOS] force_show_window on main thread: level=25 + orderFrontRegardless for {}", window_label);
            } else {
                log!("[macOS] ⚠️ Window {} not found on main thread", window_label);
            }
        }
    });
    
    // Revert to Accessory on the main thread after a short delay
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(500));
        let _ = revert_handle.run_on_main_thread(move || {
            unsafe {
                use cocoa::appkit::{NSApp, NSApplication, NSApplicationActivationPolicy};
                let ns_app = NSApp();
                ns_app.setActivationPolicy_(NSApplicationActivationPolicy::NSApplicationActivationPolicyAccessory);
            }
            log!("[macOS] Reverted to Accessory policy (main thread)");
        });
    });
}

#[cfg(not(target_os = "macos"))]
fn force_show_window(_app_handle: &tauri::AppHandle, _window_label: String) {}


// Global config storage
static CONFIG: OnceLock<Mutex<AppConfig>> = OnceLock::new();

// Distraction detection state
static DETECTION_RUNNING: AtomicBool = AtomicBool::new(false);
static DETECTION_SESSION: OnceLock<Mutex<Option<(String, String)>>> = OnceLock::new();

// Browser distraction state - set when browser extension detects distracting site
static BROWSER_DISTRACTION_ACTIVE: AtomicBool = AtomicBool::new(false);

/// Server-driven: when true, desktop must not show the yellow idle warning UI (see GET /api/desktop/poll).
static NOTE_TAKING_MODE: AtomicBool = AtomicBool::new(false);

// Heartbeat loop state - ensures only one heartbeat loop runs at a time
static HEARTBEAT_RUNNING: AtomicBool = AtomicBool::new(false);

// Session poll counter for Cursor/device console logging (correlate with server logs)
static SESSION_POLL_COUNT: AtomicU64 = AtomicU64::new(0);

// Single source of truth for current userId (pings and app reports must use the same value)
static CURRENT_USER_ID: OnceLock<Mutex<Option<String>>> = OnceLock::new();

/// sessionIds for which the session-ending floating popup was already shown (cleared when detection stops / no session).
static SESSION_ENDING_SHOWN: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn session_ending_shown() -> &'static Mutex<HashSet<String>> {
    SESSION_ENDING_SHOWN.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Default API host (production). Override with `BACKEND_URL` or persisted `backend_url` if needed.
const DEFAULT_BACKEND_BASE_URL: &str =
    "https://85f28487-f52a-4264-bfe6-832501142976-00-36zv4e7q2xsre.spock.replit.dev";

/// Resolved API base: `BACKEND_URL` env → persisted `backend_url` in config → `DEFAULT_BACKEND_BASE_URL`.
fn backend_base_url() -> String {
    if let Ok(env) = std::env::var("BACKEND_URL") {
        let t = env.trim();
        if !t.is_empty() {
            return normalize_backend_url(t).unwrap_or_else(|_| t.to_string());
        }
    }
    if let Ok(guard) = get_config().lock() {
        if let Some(ref u) = guard.backend_url {
            return u.clone();
        }
    }
    DEFAULT_BACKEND_BASE_URL.to_string()
}

fn normalize_backend_url(input: &str) -> Result<String, String> {
    let s = input.trim().trim_end_matches('/');
    if s.is_empty() {
        return Err("empty URL".to_string());
    }
    if s.starts_with("http://localhost") || s.starts_with("http://127.0.0.1") {
        return Ok(s.to_string());
    }
    if s.starts_with("https://") {
        return Ok(s.to_string());
    }
    if s.starts_with("http://") {
        return Err("use https (or http only for localhost)".to_string());
    }
    Err("URL must start with https://".to_string())
}

fn set_backend_config_url(url: Option<String>) -> Result<(), String> {
    let config = get_config();
    let mut config_guard = config.lock().map_err(|e| format!("Failed to lock config: {}", e))?;
    config_guard.backend_url = match url {
        None => None,
        Some(s) => {
            let n = normalize_backend_url(&s)?;
            Some(n)
        }
    };
    save_config(&config_guard)?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct FocusStatsPayload {
    #[serde(rename = "idleWarningCount")]
    idle_warning_count: u64,
    #[serde(rename = "distractionCount")]
    distraction_count: u64,
}

async fn fetch_focus_stats(user_id: &str) -> Result<FocusStatsPayload, String> {
    let backend_url = backend_base_url();
    let endpoint = format!("{}/api/focus-stats?userId={}", backend_url, user_id);
    let client = tauri::api::http::ClientBuilder::new()
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    let request_builder = tauri::api::http::HttpRequestBuilder::new("GET", &endpoint)
        .map_err(|e| format!("Failed to create request: {}", e))?;
    let response = client
        .send(request_builder)
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;
    let status = response.status().as_u16();
    if !(200..300).contains(&status) {
        return Err(format!("focus-stats returned HTTP {}", status));
    }
    let response_data = response
        .read()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;
    serde_json::from_value(response_data.data.clone())
        .map_err(|e| format!("Invalid focus-stats JSON: {}", e))
}

fn update_tray_focus_stats(app: &tauri::AppHandle, stats: Option<&FocusStatsPayload>) {
    let tray = app.tray_handle();
    match stats {
        Some(s) => {
            let _ = tray.get_item("stats_idle").set_title(format!(
                "Idle warnings: {}",
                s.idle_warning_count
            ));
            let _ = tray.get_item("stats_distraction").set_title(format!(
                "Distracting apps / sites opened: {}",
                s.distraction_count
            ));
        }
        None => {
            let _ = tray
                .get_item("stats_idle")
                .set_title("Idle warnings: —".to_string());
            let _ = tray
                .get_item("stats_distraction")
                .set_title("Distracting apps / sites opened: —".to_string());
        }
    }
}

fn spawn_focus_stats_refresher(app_handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            if let Some(uid) = get_current_user_id() {
                match fetch_focus_stats(&uid).await {
                    Ok(s) => update_tray_focus_stats(&app_handle, Some(&s)),
                    Err(e) => println!("[FocusStats] {}", e),
                }
            } else {
                update_tray_focus_stats(&app_handle, None);
            }
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
        }
    });
}

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
    #[serde(rename = "currentDistraction", default)]
    current_distraction: Option<serde_json::Value>,
    #[serde(rename = "allowedApps", default)]
    allowed_apps: Vec<String>,
    #[serde(rename = "blockedApps", default)]
    blocked_apps: Vec<String>,
}

/// Build a unique list of currently running app/process names.
fn get_running_app_names() -> Vec<String> {
    use sysinfo::{ProcessesToUpdate, System};

    let mut system = System::new_all();
    // Refresh processes list before sampling names.
    system.refresh_processes(ProcessesToUpdate::All, true);

    let mut seen = std::collections::HashSet::new();
    let mut apps = Vec::new();

    for process in system.processes().values() {
        let raw_name = process.name().to_string_lossy().trim().to_string();
        if raw_name.is_empty() {
            continue;
        }
        let key = raw_name.to_lowercase();
        if seen.insert(key) {
            apps.push(raw_name);
        }
    }

    // Keep payload deterministic for server-side logs/debugging.
    apps.sort();
    apps
}

/// Report current desktop state to server; server remains source of truth.
fn check_apps_with_server(
    user_id: &str,
    foreground_app: &str,
    domain: Option<&str>,
) -> Option<DesktopAppsResponse> {
    println!("[Desktop] Sending app report for userId={}", user_id);
    println!("[Desktop Apps] 📤 Checking app with server: userId={}, foregroundApp={}", user_id, foreground_app);
    
    let backend_url = backend_base_url();
    let endpoint = format!("{}/api/desktop/apps", backend_url);
    
    // Build the request body
    let running_apps = get_running_app_names();
    let body = serde_json::json!({
        "userId": user_id,
        "apps": running_apps,
        "foregroundApp": foreground_app,
        "domain": domain,
        "source": "desktopNative"
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
                            println!(
                                "[Detection] Server response - isForegroundBlocked: {}, blockedRunning: {:?}, currentDistractionPresent: {}",
                                data.is_foreground_blocked,
                                data.blocked_running,
                                data.current_distraction.is_some()
                            );
                            Some(data)
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
    /// When set, desktop HTTP/WebSocket use this origin (e.g. Replit staging). Env `BACKEND_URL` overrides.
    #[serde(default)]
    backend_url: Option<String>,
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
    
    let backend_url = backend_base_url();
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
    
    let backend_url = backend_base_url();
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

/// Best-effort: tell server desktop disconnected immediately (web gate), same base URL as ping.
/// Blocking so shutdown can finish the request; 90s ping timeout remains fallback.
fn send_desktop_disconnect_blocking(user_id: &str) {
    let base = backend_base_url().trim_end_matches('/').to_string();
    let url = format!("{}/api/desktop/disconnect", base);
    let body = serde_json::json!({ "userId": user_id });

    let client = match reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            println!("[Disconnect] Failed to build HTTP client: {}", e);
            return;
        }
    };

    match client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
    {
        Ok(response) => {
            if response.status().is_success() {
                println!(
                    "[Disconnect] ✅ Server acknowledged disconnect (status {})",
                    response.status()
                );
            } else {
                println!(
                    "[Disconnect] ⚠️ Server returned {} (gate may clear via ping timeout)",
                    response.status()
                );
            }
        }
        Err(e) => println!("[Disconnect] ⚠️ Request failed: {} (gate may clear via ping timeout)", e),
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

/// Optional `backend` query sets or clears persisted API origin (must match the site you logged into).
#[derive(Debug)]
enum DeepLinkBackendParam {
    /// No `backend` in URL — leave `config.backend_url` unchanged (old links).
    Unspecified,
    /// `backend=` or empty — clear persisted override (falls back to `DEFAULT_BACKEND_BASE_URL`).
    Clear,
    /// `backend=https://...`
    Set(String),
}

#[derive(Debug)]
struct DeepLinkAuth {
    user_id: String,
    backend: DeepLinkBackendParam,
}

/// Expected: `focustogether://auth?userId=XXX` with optional `&backend=https%3A%2F%2F...`
fn parse_deep_link(url: &str) -> Option<DeepLinkAuth> {
    if !url.starts_with("focustogether://auth") {
        println!("[DeepLink] Failed to parse URL: {}", url);
        return None;
    }
    let query = match url.find('?') {
        Some(i) => &url[i + 1..],
        None => {
            println!("[DeepLink] Missing query string");
            return None;
        }
    };
    let mut user_id: Option<String> = None;
    let mut backend = DeepLinkBackendParam::Unspecified;
    for (key, value) in url::form_urlencoded::parse(query.as_bytes()) {
        match key.as_ref() {
            "userId" => user_id = Some(value.into_owned()),
            "backend" => {
                let v = value.into_owned();
                backend = if v.is_empty() {
                    DeepLinkBackendParam::Clear
                } else {
                    DeepLinkBackendParam::Set(v)
                };
            }
            _ => {}
        }
    }
    let user_id = user_id?;
    println!("[DeepLink] Parsed userId: {}", user_id);
    Some(DeepLinkAuth { user_id, backend })
}

#[tauri::command]
fn get_idle_seconds() -> u64 {
    match UserIdle::get_time() {
        Ok(idle) => idle.as_seconds(),
        Err(_) => 0,
    }
}

#[tauri::command]
fn get_backend_base_url() -> String {
    backend_base_url()
}

#[tauri::command]
fn set_backend_base_url(url: Option<String>) -> Result<(), String> {
    match url {
        None => set_backend_config_url(None),
        Some(s) => {
            let t = s.trim();
            if t.is_empty() {
                set_backend_config_url(None)
            } else {
                set_backend_config_url(Some(t.to_string()))
            }
        }
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
                
                let _ = window.show();
                force_show_window(&app_clone, label.clone());
                
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

/// Push idle warning countdown (seconds until marked idle) to the yellow notification window.
#[tauri::command]
fn update_notification_idle_countdown(app: tauri::AppHandle, secondsRemaining: u32) -> Result<(), String> {
    if let Some(window) = app.get_window("notification") {
        let _ = window.emit(
            "notification-message",
            serde_json::json!({
                "countdown": secondsRemaining,
            }),
        );
    }
    Ok(())
}

/// Red state after idle timeout (distinct copy from app-distraction "distracted").
#[tauri::command]
fn update_notification_to_idle_marked(app: tauri::AppHandle) -> Result<(), String> {
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("🚨 🚨 🚨 MARKED AS IDLE 🚨 🚨 🚨");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    if let Some(window) = app.get_window("notification") {
        let payload = serde_json::json!({
            "title": "Marked as Idle",
            "body": "You were marked as idle. Everyone in the session has been notified.",
            "isDistracted": true
        });

        window
            .emit("notification-message", payload)
            .map_err(|e| format!("Failed to emit idle-marked event: {}", e))?;

        println!("[Tauri] ✅ Notification updated to idle-marked state");
        
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
fn update_notification_to_distracted(app: tauri::AppHandle) -> Result<(), String> {
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("🚨 🚨 🚨 MARKED AS DISTRACTED 🚨 🚨 🚨");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    if let Some(window) = app.get_window("notification") {
        let payload = serde_json::json!({
            "title": "Marked as Distracted",
            "body": "You were marked as distracted. Everyone in the session has been notified.",
            "isDistracted": true
        });

        window
            .emit("notification-message", payload)
            .map_err(|e| format!("Failed to emit distracted event: {}", e))?;

        println!("[Tauri] ✅ Notification updated to distracted state");

        std::thread::spawn(|| {
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
    log!("[POPUP DEBUG] ──── show_participant_alert called: title=\"{}\" body=\"{}\" ────", title, body);
    
    // Unique label per alert so we never conflict with a previous window (server sends one per event)
    let window_label = format!("participant-alert-{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis());
    
    // Check if this exact label somehow already exists (should be impossible with timestamp)
    let label_exists = app.get_window(&window_label).is_some();
    log!("[POPUP DEBUG] Generated window label: {} (already exists: {})", window_label, label_exists);
    
    let url = tauri::WindowUrl::App("participant-alert.html".into());
    
    log!("[POPUP DEBUG] Building WindowBuilder for label={}", window_label);
    let build_result = tauri::WindowBuilder::new(
        &app,
        &window_label,
        url
    )
    .title(&title)
    .inner_size(300.0, 180.0)
    .resizable(false)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible(false)
    .focused(false)
    .accept_first_mouse(false)
    .build();
    
    match build_result {
        Ok(_window) => {
            log!("[POPUP DEBUG] ✅ Window creation succeeded: label={}", window_label);
        }
        Err(e) => {
            let err_msg = format!("Failed to create alert window: {}", e);
            log!("[POPUP DEBUG] ❌ Window creation FAILED: {}", err_msg);
            return Err(err_msg);
        }
    }
    
    let app_clone = app.clone();
    let label = window_label.clone();
    let title_clone = title.clone();
    let body_clone = body.clone();
    tauri::async_runtime::spawn(async move {
        log!("[POPUP DEBUG] Spawn started for label={}, sleeping 500ms for JS init", label);
        std::thread::sleep(std::time::Duration::from_millis(500));
        
        if let Some(window) = app_clone.get_window(&label) {
            log!("[POPUP DEBUG] Window {} found after 500ms, emitting message", label);
            let emit_result = window.emit("participant-alert-message", serde_json::json!({
                "title": title_clone,
                "body": body_clone
            }));
            log!("[POPUP DEBUG] emit result: {:?}", emit_result);
            
            std::thread::sleep(std::time::Duration::from_millis(200));
            
            if let Some(window) = app_clone.get_window(&label) {
                if let Ok(Some(monitor)) = window.current_monitor() {
                    let screen_size = monitor.size();
                    if let Ok(window_size) = window.outer_size() {
                        let x = (screen_size.width as i32 - window_size.width as i32) - 20;
                        let y = 20;
                        let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
                        log!("[POPUP DEBUG] Positioned at ({}, {})", x, y);
                    }
                }
                
                let show_result = window.show();
                log!("[POPUP DEBUG] window.show() result: {:?} — label={}", show_result, label);
                
                force_show_window(&app_clone, label.clone());
                log!("[POPUP DEBUG] force_show_window dispatched to main thread — label={}", label);
                
                // Brief delay for main-thread dispatch to execute
                std::thread::sleep(std::time::Duration::from_millis(100));
                
                let is_visible = window.is_visible().unwrap_or(false);
                log!("[POPUP DEBUG] is_visible after force_show: {} — label={}", is_visible, label);
                
                play_alert_sound();
                log!("[POPUP DEBUG] Alert sound played for label={}", label);
            } else {
                log!("[POPUP DEBUG] ⚠️ Window {} disappeared after emit+200ms delay", label);
            }
        } else {
            log!("[POPUP DEBUG] ⚠️ Window {} NOT FOUND after 500ms — creation may have failed or window was closed", label);
        }
    });

    let app_for_close = app.clone();
    let label_for_close = window_label.clone();
    tauri::async_runtime::spawn(async move {
        std::thread::sleep(std::time::Duration::from_millis(4700));
        if let Some(w) = app_for_close.get_window(&label_for_close) {
            let _ = w.close();
            log!("[POPUP DEBUG] Auto-closed window {} after 4.7s", label_for_close);
        } else {
            log!("[POPUP DEBUG] Window {} already gone at 4.7s auto-close", label_for_close);
        }
    });
    
    log!("[POPUP DEBUG] show_participant_alert returning Ok for label={}", window_label);
    Ok(())
}

/// Floating popup for `session-ending` pending alerts (not a native notification).
#[tauri::command]
async fn show_session_ending_alert(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
    log!("[POPUP DEBUG] ──── show_session_ending_alert called: title=\"{}\" body=\"{}\" ────", title, body);

    let window_label = format!(
        "session-ending-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );

    let url = tauri::WindowUrl::App("session-ending.html".into());

    log!("[POPUP DEBUG] Building session-ending WindowBuilder for label={}", window_label);
    let build_result = tauri::WindowBuilder::new(&app, &window_label, url)
        .title(&title)
        // Compact window: purple frame wraps white card with margin on all sides
        .inner_size(320.0, 268.0)
        .transparent(true)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .focused(false)
        .accept_first_mouse(false)
        .build();

    match build_result {
        Ok(_) => {
            log!("[POPUP DEBUG] ✅ session-ending window created: label={}", window_label);
        }
        Err(e) => {
            let err_msg = format!("Failed to create session-ending window: {}", e);
            log!("[POPUP DEBUG] ❌ {}", err_msg);
            return Err(err_msg);
        }
    }

    let app_clone = app.clone();
    let label = window_label.clone();
    let title_clone = title.clone();
    let body_clone = body.clone();
    tauri::async_runtime::spawn(async move {
        log!("[POPUP DEBUG] session-ending spawn started for label={}, sleeping 500ms", label);
        std::thread::sleep(std::time::Duration::from_millis(500));

        if let Some(window) = app_clone.get_window(&label) {
            log!("[POPUP DEBUG] session-ending window found, emitting message");
            let emit_result = window.emit(
                "session-ending-message",
                serde_json::json!({
                    "title": title_clone,
                    "body": body_clone
                }),
            );
            log!("[POPUP DEBUG] session-ending emit result: {:?}", emit_result);

            std::thread::sleep(std::time::Duration::from_millis(200));

            if let Some(window) = app_clone.get_window(&label) {
                if let Ok(Some(monitor)) = window.current_monitor() {
                    let screen_size = monitor.size();
                    if let Ok(window_size) = window.outer_size() {
                        let x = (screen_size.width as i32 - window_size.width as i32) / 2;
                        let y = (screen_size.height as i32 - window_size.height as i32) / 2;
                        let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
                    }
                }

                let show_result = window.show();
                log!("[POPUP DEBUG] session-ending window.show() {:?} — label={}", show_result, label);
                force_show_window(&app_clone, label.clone());
                play_warning_sound();
            }
        } else {
            log!("[POPUP DEBUG] ⚠️ session-ending window {} not found after delay", label);
        }
    });

    log!("[POPUP DEBUG] show_session_ending_alert returning Ok for label={}", window_label);
    Ok(())
}

/// Close session-ending popup from its webview (same idea as `dismiss_notification` for the yellow idle window).
#[tauri::command]
fn dismiss_session_ending_window(app: tauri::AppHandle, label: String) -> Result<(), String> {
    log!("[POPUP DEBUG] dismiss_session_ending_window invoked for label={}", label);
    if let Some(w) = app.get_window(&label) {
        w.close()
            .map_err(|e| format!("Failed to close session-ending window: {}", e))?;
    } else {
        log!("[POPUP DEBUG] dismiss_session_ending_window: no window for label={}", label);
    }
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
    /// Absent on `session-ending` alerts.
    #[serde(default, rename = "alertingUserId")]
    alerting_user_id: Option<String>,
    #[serde(default, rename = "alertingUsername")]
    alerting_username: Option<String>,
    #[serde(default, rename = "alertingFirstName")]
    alerting_first_name: Option<String>,
    /// Absent on `session-ending` alerts.
    #[serde(default)]
    status: Option<String>,
    #[serde(default, rename = "sessionId")]
    session_id: Option<String>,
    #[serde(default)]
    timestamp: Option<String>,
    #[serde(default)]
    message: Option<String>,
    /// For self-distraction alerts from browser extension
    #[serde(default)]
    domain: Option<String>,
    /// For `session-ending` alerts (minutes until room closes).
    #[serde(default, rename = "remainingMinutes")]
    remaining_minutes: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
struct SessionResponse {
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
    #[serde(rename = "joinedAt")]
    joined_at: Option<String>,
    active: Option<bool>,
    #[serde(default, rename = "noteTakingMode")]
    note_taking_mode: bool,
    #[serde(default)]
    kicked: bool,
    /// Server always sends an array; default to empty if key is missing (defensive)
    #[serde(rename = "pendingAlerts", default)]
    pending_alerts: Option<Vec<PendingAlert>>,
    #[serde(rename = "distractingApps", default)]
    distracting_apps: Vec<String>,
    #[serde(rename = "allowedApps", default)]
    allowed_apps: Vec<String>,
}

/// Returned to the webview from `get_active_session` (desktop poll).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActiveSessionPollResult {
    session_id: Option<String>,
    note_taking_mode: bool,
}

/// Response body from `POST /api/activity/update` (fields we care about).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SendActivityUpdateResult {
    note_taking_mode: bool,
}

/// Bundled MP3 notification assets (see `src-tauri/sounds/`). **macOS, Windows, and Linux use the
/// same three files** — playback is always `rodio` + symphonia (no `afplay`, `paplay`, or PC beeps).
/// - `notification-general.mp3` — default UI: idle yellow, session-ending, distraction popup
/// - `notification-partner.mp3` — partner marked idle/distracted (blue participant alert)
/// - `notification-user-marked.mp3` — this user marked idle/distracted (red confirmation)

fn play_embedded_mp3(bytes: &'static [u8]) {
    std::thread::spawn(move || {
        use rodio::{Decoder, OutputStream, Sink};
        use std::io::Cursor;
        let cursor = Cursor::new(bytes.to_vec());
        let Ok((_stream, stream_handle)) = OutputStream::try_default() else {
            eprintln!("[Sound] OutputStream unavailable");
            return;
        };
        let Ok(decoder) = Decoder::new(cursor) else {
            eprintln!("[Sound] MP3 decode failed");
            return;
        };
        let Ok(sink) = Sink::try_new(&stream_handle) else {
            return;
        };
        sink.append(decoder);
        sink.sleep_until_end();
    });
}

/// General notification (040): idle yellow, session-ending popup, orange distraction warning
fn play_warning_sound() {
    play_embedded_mp3(include_bytes!("../sounds/notification-general.mp3"));
}

/// Partner activity (017): someone else marked idle/distracted
fn play_alert_sound() {
    println!("[Sound] Partner notification (017)");
    play_embedded_mp3(include_bytes!("../sounds/notification-partner.mp3"));
}

/// This user marked idle/distracted (error tone)
fn play_distracted_sound() {
    play_embedded_mp3(include_bytes!("../sounds/notification-user-marked.mp3"));
}

// =====================================
// DISTRACTION DETECTION
// =====================================

/// Get foreground app info. Returns (app_name, window_title, process_id).
/// Data is used only for classification, then discarded.
fn get_foreground_info() -> Option<(String, String, u32)> {
    match get_active_window() {
        Ok(window) => {
            let app_name = window.app_name;
            let title = window.title;
            let pid = window.process_id as u32;
            Some((app_name, title, pid))
        }
        Err(_) => None,
    }
}

/// True when the focused app is a Chromium browser (extension can report the active tab).
/// Server `currentDistraction` must only apply while this is true — otherwise a stale tab
/// from an old browser session re-triggers the warning when switching from e.g. Chess → Chrome.
fn foreground_is_chromium_browser() -> bool {
    get_foreground_info()
        .map(|(app_name, _, _)| {
            let app_lower = app_name.to_lowercase();
            app_lower.contains("chrome")
                || app_lower.contains("chromium")
                || app_lower.contains("arc")
                || app_lower.contains("opera")
                || app_lower.contains("vivaldi")
                || app_lower.contains("edge")
                || app_lower.contains("brave")
        })
        .unwrap_or(false)
}

fn is_browser(app_name: &str) -> bool {
    let name = app_name.to_lowercase();
    ["chrome", "firefox", "safari", "edge", "brave", "arc"]
        .iter()
        .any(|b| name.contains(b))
}

/// Get the detection session mutex
fn get_detection_session() -> &'static Mutex<Option<(String, String)>> {
    DETECTION_SESSION.get_or_init(|| Mutex::new(None))
}

/// Send focus state to backend
fn send_focus_state(user_id: &str, session_id: &str, state: &str) {
    println!("[Focus State] 📡 Sending state update: userId={}, sessionId={}, state={}", user_id, session_id, state);
    
    let backend_url = backend_base_url();
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
                        force_show_window(&app_clone, label.clone());
                        
                        // General notification (040) — same as idle yellow / session-ending
                        play_warning_sound();
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
        
        // User-marked error tone (same as idle/distracted red notification)
        std::thread::spawn(|| {
            std::thread::sleep(std::time::Duration::from_millis(300));
            play_distracted_sound();
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

/// Start distraction detection for a session
fn start_detection(app_handle: tauri::AppHandle, user_id: String, session_id: String) {
    println!("[Detection] 🚀 start_detection called with userId={}, sessionId={}", user_id, session_id);
    println!(
        "[Detection] Backend base at start_detection: {}",
        backend_base_url()
    );
    
    // Already running?
    // If the user is still in the same session, we can skip. If the session changes,
    // we must restart so alerts/actions are associated with the correct sessionId.
    if DETECTION_RUNNING.load(Ordering::SeqCst) {
        let existing = get_detection_session()
            .lock()
            .ok()
            .and_then(|s| s.clone());

        let should_restart = match existing.as_ref() {
            Some((existing_user_id, existing_session_id)) => {
                existing_user_id != &user_id || existing_session_id != &session_id
            }
            None => true,
        };

        if !should_restart {
            println!("[Detection] ⚠️ Detection already running for same user+session — skipping start");
            return;
        }

        let (existing_user_id_str, existing_session_id_str) = existing
            .as_ref()
            .map(|(u, sid)| (u.as_str(), sid.as_str()))
            .unwrap_or(("none", "none"));

        println!(
            "[Detection] ♻️ Detection restart needed (existing_userId={}, existing_sessionId={}, new_userId={}, new_sessionId={})",
            existing_user_id_str,
            existing_session_id_str,
            user_id,
            session_id
        );
        stop_detection(&app_handle);
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
        let mut warning_from_browser = false; // Track if current warning is from browser vs local app
        let mut last_server_report: Option<std::time::Instant> = None;
        let mut last_server_result: Option<bool> = None;
        let mut last_reported_app: String = String::new();
        /// Last domain we sent for `foregroundApp` when the foreground was a browser (tab changes do not change app name).
        let mut last_reported_domain: Option<String> = None;
        
        /// Orange distraction warning: 10s countdown before red + sending distracted (idle warning uses useIdleWarning.ts + notification.html countdown)
        const WARNING_DURATION_SECS: u64 = 10;
        /// Re-report on a timer when nothing else changed (browser tab switches use domain comparison instead).
        const SERVER_REPORT_HEARTBEAT_SECS: u64 = 30;
        
        while DETECTION_RUNNING.load(Ordering::SeqCst) {
            // Poll quickly while distracted or a warning is up so popups dismiss soon after switching apps/tabs.
            let mut sleep_ms: u64 = 1000;
            // Get session info
            let session_info = {
                get_detection_session().lock().ok().and_then(|s| s.clone())
            };
            
            if let Some((user_id, session_id)) = session_info {
                // Check browser distraction flag (updated by polling)
                let browser_distraction_reported = BROWSER_DISTRACTION_ACTIVE.load(Ordering::SeqCst);
                
                // Get foreground info and classify
                if let Some((app_name, title, pid)) = get_foreground_info() {
                    // Check if foreground is our own app (the warning popup itself)
                    let app_lower = app_name.to_lowercase();
                    let is_our_app = app_lower.contains("flowlocked");
                    
                    // Check if foreground is Chrome (browser extension only runs in Chrome)
                    // Only show browser distraction warning when Chrome is the active app
                    let is_chrome = app_lower.contains("chrome")
                        || app_lower.contains("chromium")
                        || app_lower.contains("arc") // Arc is Chromium-based and supports Chrome extensions
                        || app_lower.contains("opera")
                        || app_lower.contains("vivaldi")
                        || app_lower.contains("edge")
                        || app_lower.contains("brave");

                    // Browser distraction only counts when Chrome is in foreground
                    let is_browser_distracting = browser_distraction_reported && is_chrome;
                    
                    let is_fg_browser = is_browser(&app_name);
                    // macOS osascript/AX can exceed short timeouts; browsers are "neutral" on the server without a hostname.
                    #[cfg(target_os = "macos")]
                    let url_read_timeout = std::time::Duration::from_millis(900);
                    #[cfg(not(target_os = "macos"))]
                    let url_read_timeout = std::time::Duration::from_millis(250);

                    // Resolve URL/domain every loop for browsers so tab-only changes re-report without waiting for heartbeat.
                    let domain = if is_fg_browser {
                        match browser_url::get_active_browser_domain_nonblocking(
                            pid,
                            url_read_timeout,
                            Some(app_name.as_str()),
                        )
                        {
                            Some(d) => Some(d),
                            None => {
                                let inferred =
                                    browser_url::infer_site_from_window_title(&title);
                                if inferred.is_some() {
                                    log!(
                                        "[Desktop Apps] using title-based site hint (address bar unread); title_len={}",
                                        title.len()
                                    );
                                }
                                inferred
                            }
                        }
                    } else {
                        None
                    };
                    let app_or_domain = domain.clone().unwrap_or_else(|| app_name.clone());

                    let foreground_identity_changed = last_reported_app != app_name
                        || (is_fg_browser && last_reported_domain != domain);

                    // Report on app switch, browser tab/site change, or periodic heartbeat.
                    let should_report_server = match last_server_report {
                        None => true,
                        Some(last_report) => {
                            foreground_identity_changed
                                || last_report.elapsed().as_secs() >= SERVER_REPORT_HEARTBEAT_SECS
                        }
                    };

                    if should_report_server {
                        last_server_report = Some(std::time::Instant::now());
                        last_reported_app = app_name.clone();
                        last_reported_domain = if is_fg_browser {
                            domain.clone()
                        } else {
                            None
                        };
                        log!(
                            "[Desktop Apps] foreground report: app_name={} pid={} domain={:?} foregroundApp_sent={}",
                            app_name,
                            pid,
                            domain.as_deref(),
                            app_or_domain
                        );

                        if let Some(ref current_user) = get_current_user_id() {
                            if let Some(server_data) = check_apps_with_server(
                                current_user,
                                &app_or_domain,
                                domain.as_deref(),
                            ) {
                                last_server_result = Some(server_data.is_foreground_blocked);
                            }
                        }
                    }

                    // Server remains source of truth; keep last known answer if report fails.
                    let is_server_blocked = last_server_result.unwrap_or(false);
                    
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
                            std::thread::sleep(std::time::Duration::from_millis(200));
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
                        std::thread::sleep(std::time::Duration::from_millis(200));
                        continue;
                    }
                    
                    if is_distracting_now {
                        // User is on a distracting app (server-identified or browser)
                        if warning_shown_at.is_none() && !is_marked_distracted {
                            // First detection - show warning
                            show_distraction_warning(&app_handle);
                            if !is_browser_distracting {
                                let app_id = app_handle.config().tauri.bundle.identifier.clone();
                                let _ = tauri::api::notification::Notification::new(&app_id)
                                    .title("Stay focused!")
                                    .body(format!("You opened {}.", app_name))
                                    .show();
                            }
                            warning_shown_at = Some(std::time::Instant::now());
                            warning_from_browser = is_browser_distracting; // Track source of distraction
                            if is_browser_distracting {
                                println!("[Detection] Warning triggered by browser extension");
                            } else {
                                println!("[Detection] ⚠️ Warning triggered - server identified '{}' as distracting", app_name);
                            }
                        } else if let Some(start_time) = warning_shown_at {
                            // Warning already shown - check if distraction warning duration (10s) passed
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

                    // Faster polling while server says foreground is blocked or a warning/distracted state is active.
                    sleep_ms = if warning_shown_at.is_some()
                        || is_marked_distracted
                        || last_server_result.unwrap_or(false)
                    {
                        200
                    } else {
                        1000
                    };
                } else {
                    sleep_ms = if warning_shown_at.is_some() || is_marked_distracted {
                        200
                    } else {
                        1000
                    };
                }
            }
            
            std::thread::sleep(std::time::Duration::from_millis(sleep_ms));
        }
        
        // Cleanup on stop
        dismiss_distraction_warning(&app_handle);
        println!("[Detection] Thread stopped");
    });
}

/// Stop distraction detection
fn stop_detection(app_handle: &tauri::AppHandle) {
    // Reset session-ending dedup when leaving a session so a future session can show it again.
    if let Ok(mut guard) = session_ending_shown().lock() {
        guard.clear();
    }

    if !DETECTION_RUNNING.load(Ordering::SeqCst) {
        return;
    }

    // Capture current stored session info for debugging.
    let prior_session_info = get_detection_session()
        .lock()
        .ok()
        .and_then(|s| s.clone());
    if let Some((uid, sid)) = prior_session_info {
        println!(
            "[Detection] 🛑 stop_detection called while running (userId={}, sessionId={})",
            uid, sid
        );
    } else {
        println!("[Detection] 🛑 stop_detection called while running (no prior session stored)");
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
    
    // Close participant alerts (blue) and session-ending popups
    for (label, window) in app_handle.windows() {
        if label.starts_with("participant-alert") || label.starts_with("session-ending-") {
            let _ = window.close();
            println!("[Cleanup] Closed {} window", label);
        }
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
async fn get_active_session(app: tauri::AppHandle, userId: String) -> Result<ActiveSessionPollResult, String> {
    let poll_num = SESSION_POLL_COUNT.fetch_add(1, Ordering::Relaxed) + 1;
    let poll_start = std::time::Instant::now();
    log!("[POLL DEBUG] ═══ Poll #{} cycle starting for userId={} ═══", poll_num, userId);
    
    let backend_url = backend_base_url();
    // Replit staging protects /api/activity/session with auth, but provides a dedicated unauth endpoint
    // for the desktop app polling.
    let endpoint = format!("{}/api/desktop/poll?userId={}", backend_url, userId);
    log!("[POLL DEBUG] GET {}", endpoint);
    
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
        log!("[POLL DEBUG] Raw response body: {}", raw_str);
        let raw_session_id = raw
            .get("sessionId")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let raw_active = raw.get("active").and_then(|v| v.as_bool());
        let raw_kicked = raw.get("kicked").and_then(|v| v.as_bool());
        let raw_joined_at = raw
            .get("joinedAt")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        log!(
            "[POLL DEBUG] Raw summary keys: sessionId={:?} active={:?} kicked={:?} joinedAt={:?} pendingAlerts_raw_present={}",
            raw_session_id,
            raw_active,
            raw_kicked,
            raw_joined_at,
            raw.get("pendingAlerts").is_some()
        );
        log!("[POLL DEBUG] pendingAlerts in raw JSON: {}", 
            raw.get("pendingAlerts").map(|v| serde_json::to_string(v).unwrap_or_default()).unwrap_or_else(|| "MISSING".to_string()));
        
        // IMPORTANT: Keep /api/activity/session as a single consumer to avoid racing and
        // accidentally consuming one-shot pending alerts from a second polling loop.
        let browser_distraction = raw.get("currentDistraction");
        let cd_value = browser_distraction.filter(|v| !v.is_null());
        let has_current_distraction_obj = cd_value.map(|v| v.is_object()).unwrap_or(false);
        let cd_domain = cd_value
            .and_then(|d| d.get("domain"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_lowercase());

        // Server `currentDistraction` is driven by the extension + cleared when the desktop
        // reports a native foreground app (see POST /api/desktop/apps source=desktopNative).
        let browser_active_now =
            has_current_distraction_obj && foreground_is_chromium_browser();
        let browser_was_active = BROWSER_DISTRACTION_ACTIVE.swap(browser_active_now, Ordering::SeqCst);
        if browser_active_now {
            let domain = cd_domain
                .as_deref()
                .unwrap_or("a distracting site");
            if !browser_was_active {
                log!("[POLL DEBUG] 🌐 currentDistraction became ACTIVE (domain={})", domain);
            } else {
                log!("[POLL DEBUG] 🌐 currentDistraction still ACTIVE (domain={})", domain);
            }
        } else if browser_was_active {
            log!("[POLL DEBUG] 🌐 currentDistraction cleared");
        }
        
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
        
        let alert_count = session_response.pending_alerts.as_ref().map(|a| a.len()).unwrap_or(0);
        log!("[POLL DEBUG] Parsed OK — sessionId={:?} pendingAlerts count={} distractingApps count={}",
                 session_response.session_id,
                 alert_count,
                 session_response.distracting_apps.len());
        log!(
            "[POLL DEBUG] Parsed extra: active={:?} kicked={} joinedAt={:?} allowedApps count={}",
            session_response.active,
            session_response.kicked,
            session_response.joined_at,
            session_response.allowed_apps.len()
        );

        if session_response.kicked {
            NOTE_TAKING_MODE.store(false, Ordering::SeqCst);
            log!("[POLL DEBUG] 🚫 kicked=true received; notifying user and tearing down session state");
            let app_id = app.config().tauri.bundle.identifier.clone();
            let _ = tauri::api::notification::Notification::new(&app_id)
                .title("Session update")
                .body("You've been removed from the session.")
                .show();
            stop_detection(&app);
            log!("[POLL DEBUG] ═══ Poll #{} complete in {}ms (kicked) ═══", poll_num, poll_start.elapsed().as_millis());
            return Ok(ActiveSessionPollResult {
                session_id: None,
                note_taking_mode: false,
            });
        }

        NOTE_TAKING_MODE.store(
            session_response.note_taking_mode,
            Ordering::SeqCst,
        );
        log!(
            "[POLL DEBUG] noteTakingMode={} (stored)",
            session_response.note_taking_mode
        );
        
        // Process pending alerts
        if let Some(ref alerts) = session_response.pending_alerts {
            if !alerts.is_empty() {
                log!("[POLL DEBUG] 🔔 Processing {} pending alert(s)", alerts.len());
                
                // First: handle explicit one-shot alert types from the server.
                for (i, alert) in alerts.iter().enumerate() {
                    log!(
                        "[POLL DEBUG] Alert[{}]: type={} status={:?} alertingUserId={:?} alertingFirstName={:?}",
                        i,
                        alert.alert_type,
                        alert.status,
                        alert.alerting_user_id,
                        alert.alerting_first_name
                    );

                    if alert.alert_type == "session-ending" {
                        let Some(sid) = alert.session_id.clone() else {
                            log!("[POLL DEBUG] Alert[{}] session-ending missing sessionId — skip", i);
                            continue;
                        };
                        let already = session_ending_shown()
                            .lock()
                            .map(|g| g.contains(&sid))
                            .unwrap_or(false);
                        if already {
                            log!(
                                "[POLL DEBUG] session-ending already shown for sessionId={} — skip (dedup)",
                                sid
                            );
                            continue;
                        }
                        let mins = alert.remaining_minutes.unwrap_or(10);
                        let body = alert.message.clone().unwrap_or_else(|| {
                            if mins == 1 {
                                "Session ended. Room will close in 1 minute.".to_string()
                            } else {
                                format!("Session ended. Room will close in {} minutes.", mins)
                            }
                        });
                        log!(
                            "[POLL DEBUG] session-ending: sessionId={} remainingMinutes={} → showing popup",
                            sid,
                            mins
                        );
                        match show_session_ending_alert(
                            app.clone(),
                            "Session ended".to_string(),
                            body,
                        )
                        .await
                        {
                            Ok(()) => {
                                if let Ok(mut g) = session_ending_shown().lock() {
                                    g.insert(sid.clone());
                                }
                                log!("[POPUP DEBUG] ✅ session-ending popup shown for sessionId={}", sid);
                            }
                            Err(e) => {
                                log!("[POPUP DEBUG] ❌ session-ending popup failed: {}", e);
                            }
                        }
                        continue;
                    }

                    if alert.alert_type == "participant-activity" {
                        let body = alert
                            .message
                            .clone()
                            .unwrap_or_else(|| "Your partner got distracted".to_string());
                        log!(
                            "[POLL DEBUG] Alert[{}] → participant-activity, showing native notification",
                            i,
                        );
                        let app_id = app.config().tauri.bundle.identifier.clone();
                        let _ = tauri::api::notification::Notification::new(&app_id)
                            .title("FocusTogether")
                            .body(body)
                            .show();
                        continue;
                    }

                    if alert.alert_type == "self-distraction" {
                        let body = alert.message.clone().unwrap_or_else(|| {
                            if let Some(domain) = alert.domain.clone() {
                                format!("You visited a distracting site: {}", domain)
                            } else {
                                "You visited a distracting app".to_string()
                            }
                        });
                        log!(
                            "[POLL DEBUG] Alert[{}] → self-distraction, showing native notification",
                            i
                        );
                        let app_id = app.config().tauri.bundle.identifier.clone();
                        let _ = tauri::api::notification::Notification::new(&app_id)
                            .title("FocusTogether")
                            .body(body)
                            .show();
                        continue;
                    }
                }

                // Process partner alerts (idle/distracted). Server guarantees exactly one alert per
                // distraction event — no client-side deduplication needed.
                for (i, alert) in alerts.iter().enumerate() {
                    let is_self = alert.alert_type == "self-distraction";
                    let is_session_ending = alert.alert_type == "session-ending";
                    let is_valid_status =
                        matches!(alert.status.as_deref(), Some("idle") | Some("distracted"));
                    log!("[POPUP DEBUG] Alert[{}] condition: is_self_distraction={} → {} | is_session_ending={} → {} | is_valid_status(idle|distracted)={} → {}",
                        i, is_self, if is_self { "SKIP" } else { "pass" },
                        is_session_ending, if is_session_ending { "SKIP" } else { "pass" },
                        is_valid_status, if is_valid_status { "pass" } else { "SKIP" });

                    if is_self || is_session_ending {
                        continue;
                    }
                    if !is_valid_status {
                        continue;
                    }
                    
                    // Display name for idle: prefer first name, then username
                    let display_name = alert.alerting_first_name
                        .clone()
                        .or_else(|| alert.alerting_username.clone())
                        .unwrap_or_else(|| "A participant".to_string());
                    // Partner distracted pop-up: use username (fallback first name) — no app/site in copy
                    let name_for_distracted = alert.alerting_username
                        .clone()
                        .or_else(|| alert.alerting_first_name.clone())
                        .unwrap_or_else(|| "Someone".to_string());
                    
                    let status_str = match alert.status.as_deref() {
                        Some(s) => s,
                        None => continue,
                    };
                    let (title, message) = match status_str {
                        "distracted" => (
                            format!("{} is distracted", name_for_distracted),
                            format!("{} is using a distracting app", name_for_distracted),
                        ),
                        "idle" => (
                            "Partner Idle".to_string(),
                            format!("{} has gone idle", display_name),
                        ),
                        _ => continue,
                    };
                    
                    // List all existing windows to check for conflicts
                    let existing_windows: Vec<String> = app.windows().keys().cloned().collect();
                    let participant_windows: Vec<&String> = existing_windows.iter()
                        .filter(|l| l.starts_with("participant-alert"))
                        .collect();
                    log!("[POPUP DEBUG] All open windows: {:?}", existing_windows);
                    log!("[POPUP DEBUG] Existing participant-alert windows: {:?}", participant_windows);
                    
                    log!("[POPUP DEBUG] Attempting to create popup window for alert: type={} status={:?} alertingUserId={:?} firstName={:?} title=\"{}\" message=\"{}\"",
                        alert.alert_type, alert.status, alert.alerting_user_id, alert.alerting_first_name, title, message);
                    
                    match show_participant_alert(
                        app.clone(),
                        title,
                        message.clone(),
                    ).await {
                        Ok(_) => {
                            log!("[POPUP DEBUG] ✅ show_participant_alert returned Ok");
                        }
                        Err(e) => {
                            log!("[POPUP DEBUG] ❌ show_participant_alert returned Err: {}", e);
                        }
                    }
                }
            } else {
                log!("[POLL DEBUG] pendingAlerts=[] (empty)");
            }
        } else {
            log!("[POLL DEBUG] pendingAlerts field is None/missing");
        }
        
        let result = match session_response.session_id {
            Some(session_id) => {
                println!("[Tauri] ✅ Active session found: {}", session_id);
                start_detection(app.clone(), userId.clone(), session_id.clone());
                Ok(ActiveSessionPollResult {
                    session_id: Some(session_id),
                    note_taking_mode: session_response.note_taking_mode,
                })
            }
            None => {
                let pending_count = session_response
                    .pending_alerts
                    .as_ref()
                    .map(|a| a.len())
                    .unwrap_or(0);
                println!(
                    "[Tauri] No active session (sessionId is null) for userId={} (active={:?}, pendingAlerts count={})",
                    userId,
                    session_response.active,
                    pending_count
                );
                stop_detection(&app);
                Ok(ActiveSessionPollResult {
                    session_id: None,
                    note_taking_mode: session_response.note_taking_mode,
                })
            }
        };
        log!("[POLL DEBUG] ═══ Poll #{} complete in {}ms ═══", poll_num, poll_start.elapsed().as_millis());
        result
    } else {
        let error_msg = format!("Backend returned error status: {}", status_code);
        log!("[POLL DEBUG] ❌ HTTP error: {}", error_msg);
        NOTE_TAKING_MODE.store(false, Ordering::SeqCst);
        stop_detection(&app);
        log!("[POLL DEBUG] ═══ Poll #{} complete in {}ms (error) ═══", poll_num, poll_start.elapsed().as_millis());
        Ok(ActiveSessionPollResult {
            session_id: None,
            note_taking_mode: false,
        })
    }
}

#[tauri::command]
async fn send_activity_update(
    app: tauri::AppHandle,
    userId: String,
    sessionId: String,
    status: String,
) -> Result<SendActivityUpdateResult, String> {
    println!("[Tauri] Sending activity update: userId={}, sessionId={}, status={}", 
             userId, sessionId, status);
    
    let backend_url = backend_base_url();
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
        let response_data = response
            .read()
            .await
            .map_err(|e| format!("Failed to read activity update response: {}", e))?;
        let raw = response_data.data;
        let note_taking = raw
            .get("noteTakingMode")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        if note_taking {
            NOTE_TAKING_MODE.store(true, Ordering::SeqCst);
            let _ = dismiss_notification(app.clone());
            println!(
                "[Tauri] ✅ Activity update OK (status: {}); noteTakingMode=true — idle UI suppressed",
                status_code
            );
        } else {
            println!("[Tauri] ✅ Activity update sent successfully (status: {})", status_code);
        }
        Ok(SendActivityUpdateResult { note_taking_mode: note_taking })
    } else {
        let error_msg = format!("Backend returned error status: {}", status_code);
        println!("[Tauri] ❌ {}", error_msg);
        Err(error_msg)
    }
}

#[tauri::command]
async fn get_focus_stats() -> Result<FocusStatsPayload, String> {
    let uid = get_current_user_id().ok_or_else(|| "No user linked".to_string())?;
    fetch_focus_stats(&uid).await
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
    init_log_file();
    println!("[Tauri] Starting Flowlocked Enforcer...");
    
    // Create system tray menu
    let quit = tauri::CustomMenuItem::new("quit".to_string(), "Quit Flowlocked");
    let status = tauri::CustomMenuItem::new("status".to_string(), "Monitoring: Inactive").disabled();
    let stats_header =
        tauri::CustomMenuItem::new("stats_header", "My stats (private)").disabled();
    let stats_idle =
        tauri::CustomMenuItem::new("stats_idle", "Idle warnings: —").disabled();
    let stats_distraction = tauri::CustomMenuItem::new(
        "stats_distraction",
        "Distracting apps / sites opened: —",
    )
    .disabled();
    let tray_menu = tauri::SystemTrayMenu::new()
        .add_item(status)
        .add_native_item(tauri::SystemTrayMenuItem::Separator)
        .add_item(stats_header)
        .add_item(stats_idle)
        .add_item(stats_distraction)
        .add_native_item(tauri::SystemTrayMenuItem::Separator)
        .add_item(quit);
    
    let system_tray = tauri::SystemTray::new().with_menu(tray_menu);
    
    tauri::Builder::default()
        .system_tray(system_tray)
        .on_system_tray_event(|_app, event| {
            match event {
                tauri::SystemTrayEvent::MenuItemClick { id, .. } => {
                    match id.as_str() {
                        "quit" => {
                            println!("[Tray] Quit clicked — notifying server then exiting");
                            if let Some(uid) = get_current_user_id() {
                                send_desktop_disconnect_blocking(&uid);
                            }
                            std::process::exit(0);
                        }
                        _ => {}
                    }
                }
                _ => {}
            }
        })
        .on_window_event(|event| {
            if event.window().label() != "main" {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { .. } = event.event() {
                if let Some(uid) = get_current_user_id() {
                    println!(
                        "[Disconnect] Main window CloseRequested — POST /api/desktop/disconnect userId={}",
                        uid
                    );
                    send_desktop_disconnect_blocking(&uid);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![get_idle_seconds, show_notification, show_participant_alert, show_session_ending_alert, dismiss_session_ending_window, dismiss_notification, update_notification_idle_countdown, update_notification_to_idle_marked, update_notification_to_distracted, send_activity_update, get_active_session, get_focus_stats, get_user_id, is_listener_only, get_backend_base_url, set_backend_base_url])
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
                    
                    if let Some(parsed) = parse_deep_link(&request) {
                        let user_id = parsed.user_id.clone();
                        println!("[DeepLink] Extracted userId: {}", user_id);

                        match parsed.backend {
                            DeepLinkBackendParam::Unspecified => {}
                            DeepLinkBackendParam::Clear => {
                                if let Err(e) = set_backend_config_url(None) {
                                    println!("[DeepLink] Failed to clear backend URL: {}", e);
                                } else {
                                    println!("[DeepLink] Backend URL reset to default ({})", backend_base_url());
                                }
                            }
                            DeepLinkBackendParam::Set(v) => {
                                if let Err(e) = set_backend_config_url(Some(v)) {
                                    println!("[DeepLink] Invalid or failed to save backend URL: {}", e);
                                } else {
                                    println!("[DeepLink] Backend URL set to {}", backend_base_url());
                                }
                            }
                        }
                        
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
                                        Ok(r) if r.session_id.is_some() => {
                                            println!(
                                                "[DeepLink] Detection restarted for new user with session: {:?}",
                                                r.session_id
                                            );
                                        }
                                        Ok(_) => {
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
                                                .title("Flowlocked Connected!")
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
                                                .title("Flowlocked Connected")
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
            
            // macOS: background utility — hides from Dock and Cmd+Tab
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                if !browser_url::accessibility_available() {
                    let _ = std::process::Command::new("osascript")
                        .arg("-e")
                        .arg(
                            r#"display dialog "Flowlocked needs Accessibility (Privacy & Security → Accessibility) to read the browser address bar. For Chrome/Safari you may also need Automation: allow Flowlocked to control your browser under Privacy & Security → Automation." buttons {"OK"} default button "OK" with title "Browser URL access""#,
                        )
                        .output();
                }
            }
            
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
                    .title("Flowlocked")
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
                .title("Flowlocked")
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
                            
                            // Wait longer for HTML/JS to fully render
                            std::thread::sleep(std::time::Duration::from_millis(600));
                            
                            // Re-fetch again before show
                            if let Some(window) = app_handle.get_window(window_label) {
                                let _ = window.show();
                                force_show_window(&app_handle, window_label.to_string());
                                println!("[Tauri] ✅ Startup notification shown");
                                
                                // Auto-close after 5 seconds
                                std::thread::sleep(std::time::Duration::from_secs(5));
                                
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
            
            spawn_focus_stats_refresher(app.handle().clone());
            
            println!("[Tauri] Setup complete - app running in background");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
    println!("[Tauri] Application exited");
}

