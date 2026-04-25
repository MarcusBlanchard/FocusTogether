// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Flowlocked Desktop App - Background Enforcement
// Idle monitoring only

use user_idle::UserIdle;
use tauri::Manager;
use serde::{Deserialize, Serialize};
use std::cell::Cell;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::OnceLock;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
mod browser_url;
mod browser_title_target;
mod diagnostic_log;
mod window_monitor;

thread_local! {
    static DESKTOP_FG_BRANCH_OVERRIDE: Cell<Option<&'static str>> = Cell::new(None);
}

fn take_desktop_fg_branch_override() -> Option<&'static str> {
    DESKTOP_FG_BRANCH_OVERRIDE.with(|c| {
        let out = c.get();
        c.set(None);
        out
    })
}

static LAST_CLASSIFY_AT: OnceLock<Mutex<Option<std::time::Instant>>> = OnceLock::new();
static LAST_BROWSER_TITLE_BY_PID: OnceLock<Mutex<HashMap<u32, (String, std::time::Instant)>>> =
    OnceLock::new();
const BROWSER_TITLE_CACHE_TTL: std::time::Duration = std::time::Duration::from_millis(1500);

static LAST_BROWSER_TARGET_BY_PID: OnceLock<Mutex<HashMap<u32, (String, std::time::Instant)>>> =
    OnceLock::new();
/// How long to trust the last successfully URL-bar-read browser target after a subsequent
/// read times out. Long enough to span the 250 ms read timeout and a couple of
/// detection ticks, short enough that real navigations replace the value almost
/// immediately. Without this cache, sites whose tab title contains no domain
/// (single-page games / apps like jcw87.github.io/c2-sans-fight/) flicker the
/// orange distraction popup as the URL read alternates success/timeout.
const BROWSER_TARGET_CACHE_TTL: std::time::Duration = std::time::Duration::from_secs(5);
fn browser_target_cache_lock() -> &'static Mutex<HashMap<u32, (String, std::time::Instant)>> {
    LAST_BROWSER_TARGET_BY_PID.get_or_init(|| Mutex::new(HashMap::new()))
}

fn last_classify_at_lock() -> &'static Mutex<Option<std::time::Instant>> {
    LAST_CLASSIFY_AT.get_or_init(|| Mutex::new(None))
}

fn browser_title_cache_lock() -> &'static Mutex<HashMap<u32, (String, std::time::Instant)>> {
    LAST_BROWSER_TITLE_BY_PID.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Windows: Chrome address-bar autocomplete mutates the window title before navigation; debounce
/// title-derived targets so the 10s countdown does not fire on transient suggestions.
#[cfg(target_os = "windows")]
const WINDOWS_TITLE_TARGET_DEBOUNCE: std::time::Duration =
    std::time::Duration::from_millis(2500);

#[cfg(target_os = "windows")]
#[derive(Debug, Default)]
struct WindowsTitleTargetDebounce {
    pending: Option<String>,
    since: Option<std::time::Instant>,
    committed: Option<String>,
}

#[cfg(target_os = "windows")]
impl WindowsTitleTargetDebounce {
    fn reset(&mut self) {
        self.pending = None;
        self.since = None;
        self.committed = None;
    }

    /// `title_derived` false = real URL from the browser chrome; apply immediately.
    fn apply(&mut self, raw: Option<String>, title_derived: bool) -> Option<String> {
        if !title_derived {
            self.reset();
            return raw;
        }
        let Some(s) = raw else {
            self.reset();
            return None;
        };
        let key = normalize_rule_value(&s).unwrap_or(s);
        if self.committed.as_ref() == Some(&key) {
            return Some(key);
        }
        if self.pending.as_ref() != Some(&key) {
            self.pending = Some(key.clone());
            self.since = Some(std::time::Instant::now());
            return self.committed.clone();
        }
        if let Some(t0) = self.since {
            if t0.elapsed() >= WINDOWS_TITLE_TARGET_DEBOUNCE {
                self.committed = Some(key.clone());
                return Some(key);
            }
        }
        self.committed.clone()
    }
}

#[cfg(target_os = "windows")]
static WINDOWS_TITLE_TARGET_DEBOUNCE_STATE: OnceLock<Mutex<WindowsTitleTargetDebounce>> =
    OnceLock::new();

#[cfg(target_os = "windows")]
fn windows_title_target_debounce_lock() -> &'static Mutex<WindowsTitleTargetDebounce> {
    WINDOWS_TITLE_TARGET_DEBOUNCE_STATE.get_or_init(|| Mutex::new(WindowsTitleTargetDebounce::default()))
}

macro_rules! log {
    ($($arg:tt)*) => {{
        let msg = format!($($arg)*);
        diagnostic_log::emit_console_and_file(&msg);
    }};
}

/// Distraction detection and related diagnostics: stdout + `focustogether-live.log`.
macro_rules! detection_println {
    ($($arg:tt)*) => {{
        diagnostic_log::emit_console_and_file(format!($($arg)*));
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
        const WARNING_MIN_LEVEL: i64 = 101;
        
        unsafe {
            let ns_app = NSApp();
            ns_app.setActivationPolicy_(NSApplicationActivationPolicy::NSApplicationActivationPolicyRegular);
            ns_app.activateIgnoringOtherApps_(YES);
            
            if let Some(window) = handle.get_window(&window_label) {
                let ns_win: id = window.ns_window().unwrap() as id;
                let pip_window_level = window_monitor::latest_flowlocked_pip_level().unwrap_or(-1);
                let desired_level = std::cmp::max(
                    WARNING_MIN_LEVEL,
                    pip_window_level.saturating_add(1),
                );
                let _: () = msg_send![ns_win, setLevel: desired_level];
                let _: () = msg_send![ns_win, orderFrontRegardless];
                ns_app.activateIgnoringOtherApps_(YES);
                let warning_window_level: i64 = msg_send![ns_win, level];

                let workspace: id = msg_send![class!(NSWorkspace), sharedWorkspace];
                let frontmost_app: id = msg_send![workspace, frontmostApplication];
                let (front_name, front_pid) = if frontmost_app.is_null() {
                    ("<unknown>".to_string(), -1_i32)
                } else {
                    let front_name_ns: id = msg_send![frontmost_app, localizedName];
                    let front_pid: i32 = msg_send![frontmost_app, processIdentifier];
                    let front_name = if front_name_ns.is_null() {
                        "<unknown>".to_string()
                    } else {
                        let cstr: *const i8 = msg_send![front_name_ns, UTF8String];
                        if cstr.is_null() {
                            "<unknown>".to_string()
                        } else {
                            std::ffi::CStr::from_ptr(cstr).to_string_lossy().into_owned()
                        }
                    };
                    (front_name, front_pid)
                };

                log!(
                    "[macOS] force_show_window on main thread: warning_window_level={} pip_window_level={} desired_level={} orderFrontRegardless=true activateIgnoringOtherApps=true label={}",
                    warning_window_level,
                    pip_window_level,
                    desired_level,
                    window_label
                );
                log!(
                    "[macOS] frontmost_app_after_activate={:?} pid={}",
                    front_name,
                    front_pid
                );
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

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

#[cfg(target_os = "macos")]
fn macos_screen_recording_granted() -> bool {
    unsafe { CGPreflightScreenCaptureAccess() }
}

#[cfg(target_os = "macos")]
fn request_macos_screen_recording_access() -> bool {
    unsafe { CGRequestScreenCaptureAccess() }
}

// Global config storage
static CONFIG: OnceLock<Mutex<AppConfig>> = OnceLock::new();

// Distraction detection state
static DETECTION_RUNNING: AtomicBool = AtomicBool::new(false);
static DETECTION_SESSION: OnceLock<Mutex<Option<(String, String)>>> = OnceLock::new();
static DISTRACTION_RULES: OnceLock<Mutex<LocalDistractionRules>> = OnceLock::new();
static AI_CLASSIFICATIONS: OnceLock<Mutex<HashMap<String, bool>>> = OnceLock::new();

/// Server-driven: when true, desktop must not show the yellow idle warning UI (see GET /api/desktop/poll).
static NOTE_TAKING_MODE: AtomicBool = AtomicBool::new(false);

// Heartbeat loop state - ensures only one heartbeat loop runs at a time
static HEARTBEAT_RUNNING: AtomicBool = AtomicBool::new(false);
// Guard to prevent overlapping /api/desktop/apps requests (can race when poll-triggered and loop-triggered reports coincide).
static APPS_REPORT_IN_FLIGHT: AtomicBool = AtomicBool::new(false);
// True only after server acked distracted=true; cleared only after server acked distracted=false.
static DISTRACTION_REPORTED: AtomicBool = AtomicBool::new(false);
static LAST_APPS_FOREGROUND_DECISION: OnceLock<Mutex<Option<ForegroundServerDecision>>> = OnceLock::new();

// Session poll counter for Cursor/device console logging (correlate with server logs)
static SESSION_POLL_COUNT: AtomicU64 = AtomicU64::new(0);

// Single source of truth for current userId (pings and app reports must use the same value)
static CURRENT_USER_ID: OnceLock<Mutex<Option<String>>> = OnceLock::new();

/// sessionIds for which the session-ending floating popup was already shown (cleared when detection stops / no session).
static SESSION_ENDING_SHOWN: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn session_ending_shown() -> &'static Mutex<HashSet<String>> {
    SESSION_ENDING_SHOWN.get_or_init(|| Mutex::new(HashSet::new()))
}

#[derive(Debug, Clone, Default)]
struct LocalDistractionRules {
    distracting: HashSet<String>,
    allowed: HashSet<String>,
    classroom_allowed: HashSet<String>,
    classroom_blocked: HashSet<String>,
    own_app_domains: HashSet<String>,
    whitelist_apps: HashSet<String>,
    whitelist_websites: HashSet<String>,
    whitelist_mode_apps: bool,
    whitelist_mode_websites: bool,
}

#[derive(Debug, Clone, Default)]
struct ForegroundServerDecision {
    foreground_key: String,
    is_foreground_blocked: bool,
    own_app_domains: HashSet<String>,
}

fn distraction_rules() -> &'static Mutex<LocalDistractionRules> {
    DISTRACTION_RULES.get_or_init(|| Mutex::new(LocalDistractionRules::default()))
}

fn ai_classifications() -> &'static Mutex<HashMap<String, bool>> {
    AI_CLASSIFICATIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn latest_foreground_server_decision() -> &'static Mutex<Option<ForegroundServerDecision>> {
    LAST_APPS_FOREGROUND_DECISION.get_or_init(|| Mutex::new(None))
}

fn normalize_rule_value(v: &str) -> Option<String> {
    let s = v.trim().trim_start_matches("www.").trim_end_matches('/').to_lowercase();
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

fn normalize_app_name(v: &str) -> Option<String> {
    let mut n = v.trim().to_lowercase();
    if n.ends_with(".app") {
        n = n.trim_end_matches(".app").trim().to_string();
    }
    if n.ends_with(".exe") {
        n = n.trim_end_matches(".exe").trim().to_string();
    }
    normalize_rule_value(&n)
}

fn normalized_foreground_key(v: &str) -> String {
    normalize_rule_value(v).unwrap_or_else(|| v.trim().to_lowercase())
}

fn default_distracting_entries() -> &'static [&'static str] {
    &[
        "youtube",
        "youtube.com",
        "reddit",
        "reddit.com",
        "twitter",
        "x.com",
        "facebook",
        "instagram",
        "tiktok",
        "discord",
        "netflix",
        "twitch",
        "steam",
        "chess",
        "2048",
        "deviantart",
        "deviantart.com",
    ]
}

fn distracting_keywords() -> &'static [&'static str] {
    &[
        "game",
        "games",
        "gaming",
        "play",
        "casino",
        "gambling",
        "stream",
        "movie",
        "movies",
        "anime",
        "meme",
    ]
}

fn productive_override_tokens() -> &'static [&'static str] {
    &[
        "chatgpt",
        "chatgpt.com",
        "chat.openai.com",
        "openai.com",
    ]
}

fn matches_productive_override(value: &str) -> bool {
    let lower = value.trim().to_lowercase();
    if lower.is_empty() {
        return false;
    }
    productive_override_tokens()
        .iter()
        .any(|token| lower.contains(token))
}

/// Env `OPENAI_API_KEY` wins; else `openaiApiKey` in ~/.focustogether/config.json.
fn resolve_openai_api_key() -> Option<String> {
    if let Ok(k) = std::env::var("OPENAI_API_KEY") {
        let t = k.trim();
        if !t.is_empty() {
            return Some(t.to_string());
        }
    }
    if let Ok(guard) = get_config().lock() {
        if let Some(ref k) = guard.openai_api_key {
            let t = k.trim();
            if !t.is_empty() {
                return Some(t.to_string());
            }
        }
    }
    None
}

fn truncate_debug_body(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        let cut = s.get(..max).unwrap_or(s);
        format!("{}… (truncated)", cut)
    }
}

fn is_browser_internal_marker_target(target: &str) -> bool {
    let t = target.trim().to_lowercase();
    t.ends_with("-internal")
        || t == "chrome-internal"
        || t == "safari-internal"
        || t == "firefox-internal"
        || t == "browser-internal"
}

/// Server-side classify via `POST /api/desktop/classify-target` (OpenAI only on server). Blocking.
/// `is_browser`: `Some(true)` = website whitelist path; `Some(false)` = app whitelist path; `None` = server heuristic.
fn server_classify_target_with_detail(
    user_id: &str,
    target: &str,
    is_browser: Option<bool>,
) -> (Option<bool>, String) {
    if is_browser_internal_marker_target(target) {
        return (
            Some(false),
            "internal browser marker — skipped".to_string(),
        );
    }
    {
        let last = last_classify_at_lock().lock().unwrap();
        if let Some(t) = *last {
            if t.elapsed() < std::time::Duration::from_secs(1) {
                return (
                    None,
                    "rate limited (max 1 classify/s)".to_string(),
                );
            }
        }
    }
    let client = match reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(6))
        .build()
    {
        Ok(c) => c,
        Err(e) => return (None, format!("HTTP client build failed: {}", e)),
    };
    let base = backend_base_url().trim_end_matches('/').to_string();
    let url = format!("{}/api/desktop/classify-target", base);
    let body = match is_browser {
        Some(ib) => serde_json::json!({
            "userId": user_id,
            "target": target,
            "isBrowser": ib,
        }),
        None => serde_json::json!({ "userId": user_id, "target": target }),
    };
    {
        let mut last = last_classify_at_lock().lock().unwrap();
        *last = Some(std::time::Instant::now());
    }
    let resp = match client.post(&url).json(&body).send() {
        Ok(r) => r,
        Err(e) => return (None, format!("network error: {}", e)),
    };
    let status = resp.status();
    let body_text = match resp.text() {
        Ok(b) => b,
        Err(e) => return (None, format!("read body: {}", e)),
    };
    if !status.is_success() {
        return (
            None,
            format!(
                "HTTP {} — {}",
                status.as_u16(),
                truncate_debug_body(&body_text, 800)
            ),
        );
    }
    let json: serde_json::Value = match serde_json::from_str(&body_text) {
        Ok(j) => j,
        Err(e) => {
            return (
                None,
                format!(
                    "invalid JSON ({}): {}",
                    e,
                    truncate_debug_body(&body_text, 400)
                ),
            );
        }
    };
    if json.get("success").and_then(|v| v.as_bool()) == Some(false) {
        let msg = json
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown error");
        return (None, msg.to_string());
    }
    match json.get("distracting").and_then(|v| v.as_bool()) {
        Some(d) => (
            Some(d),
            format!("POST /api/desktop/classify-target distracting={}", d),
        ),
        None => (
            None,
            format!(
                "missing distracting in response: {}",
                truncate_debug_body(&body_text, 500)
            ),
        ),
    }
}

fn update_distraction_rules_from_poll(
    distracting: &[String],
    allowed: &[String],
    blocked: &[String],
    classroom_allowed: &[String],
    classroom_blocked: &[String],
    own_app_domains: &[String],
    whitelist_apps: &[String],
    whitelist_websites: &[String],
    whitelist_mode_apps: bool,
    whitelist_mode_websites: bool,
) {
    let allowed_debug_raw: Vec<String> = allowed
        .iter()
        .filter(|v| is_allowed_apps_debug_target(v))
        .cloned()
        .collect();
    let classroom_allowed_debug_raw: Vec<String> = classroom_allowed
        .iter()
        .filter(|v| is_allowed_apps_debug_target(v))
        .cloned()
        .collect();
    let whitelist_apps_debug_raw: Vec<String> = whitelist_apps
        .iter()
        .filter(|v| is_allowed_apps_debug_target(v))
        .cloned()
        .collect();
    let mut dset = HashSet::new();
    for v in distracting.iter().chain(blocked.iter()) {
        if let Some(n) = normalize_rule_value(v) {
            dset.insert(n);
        }
    }
    let mut aset = HashSet::new();
    for v in allowed {
        if let Some(n) = normalize_rule_value(v) {
            aset.insert(n);
        }
    }
    let mut classroom_allowed_set = HashSet::new();
    for v in classroom_allowed {
        if let Some(n) = normalize_rule_value(v) {
            classroom_allowed_set.insert(n);
        }
    }
    let mut classroom_blocked_set = HashSet::new();
    for v in classroom_blocked {
        if let Some(n) = normalize_rule_value(v) {
            classroom_blocked_set.insert(n);
        }
    }
    let mut own_domains_set = HashSet::new();
    for v in own_app_domains {
        if let Some(n) = normalize_rule_value(v) {
            own_domains_set.insert(n);
        }
    }
    let mut whitelist_apps_set = HashSet::new();
    for v in whitelist_apps {
        if let Some(n) = normalize_rule_value(v) {
            whitelist_apps_set.insert(n);
        }
    }
    let mut whitelist_websites_set = HashSet::new();
    for v in whitelist_websites {
        if let Some(n) = normalize_rule_value(v) {
            whitelist_websites_set.insert(n);
        }
    }
    if let Ok(mut g) = distraction_rules().lock() {
        let allowed_debug_norm: Vec<String> = aset
            .iter()
            .filter(|v| is_allowed_apps_debug_target(v))
            .cloned()
            .collect();
        let classroom_allowed_debug_norm: Vec<String> = classroom_allowed_set
            .iter()
            .filter(|v| is_allowed_apps_debug_target(v))
            .cloned()
            .collect();
        let whitelist_apps_debug_norm: Vec<String> = whitelist_apps_set
            .iter()
            .filter(|v| is_allowed_apps_debug_target(v))
            .cloned()
            .collect();
        if !allowed_debug_raw.is_empty()
            || !classroom_allowed_debug_raw.is_empty()
            || !whitelist_apps_debug_raw.is_empty()
            || !allowed_debug_norm.is_empty()
            || !classroom_allowed_debug_norm.is_empty()
            || !whitelist_apps_debug_norm.is_empty()
        {
            detection_println!(
                "[AllowedAppsDebug] rules_update allowed_raw={:?} allowed_norm={:?} classroom_allowed_raw={:?} classroom_allowed_norm={:?} whitelist_apps_raw={:?} whitelist_apps_norm={:?} whitelist_mode_apps={}",
                allowed_debug_raw,
                allowed_debug_norm,
                classroom_allowed_debug_raw,
                classroom_allowed_debug_norm,
                whitelist_apps_debug_raw,
                whitelist_apps_debug_norm,
                whitelist_mode_apps
            );
        }
        *g = LocalDistractionRules {
            distracting: dset,
            allowed: aset,
            classroom_allowed: classroom_allowed_set,
            classroom_blocked: classroom_blocked_set,
            own_app_domains: own_domains_set,
            whitelist_apps: whitelist_apps_set,
            whitelist_websites: whitelist_websites_set,
            whitelist_mode_apps,
            whitelist_mode_websites,
        };
    }
}

fn rule_matches(value: &str, rules: &HashSet<String>) -> bool {
    let Some(n) = normalize_rule_value(value) else {
        return false;
    };
    if rules.contains(&n) {
        return true;
    }
    rules.iter().any(|r| n.ends_with(&format!(".{}", r)) || n.contains(r))
}

fn contains_any_rule_token(value: &str, rules: &HashSet<String>) -> bool {
    let lower = value.trim().to_lowercase();
    if lower.is_empty() {
        return false;
    }
    rules.iter().any(|r| {
        if r.is_empty() {
            return false;
        }
        // Avoid substring traps on short app names (e.g. "ea" matching inside "steam").
        if r.len() <= 3 {
            return lower == *r
                || lower.ends_with(&format!(".{}", r))
                || lower.starts_with(&format!("{}.", r));
        }
        lower.contains(r.as_str())
    })
}

fn compact_ascii_alnum(value: &str) -> String {
    value
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>()
        .to_lowercase()
}

fn app_rule_match_detail(app_value: &str, rules: &HashSet<String>) -> Option<String> {
    let app_norm = normalize_rule_value(app_value)?;
    if rules.contains(&app_norm) {
        return Some(format!("exact_norm={}", app_norm));
    }
    if let Some(rule) = rules
        .iter()
        .find(|r| app_norm.ends_with(&format!(".{}", r)) || app_norm.contains(r.as_str()))
    {
        return Some(format!("rule_matches_contains app_norm={} rule={}", app_norm, rule));
    }
    let app_compact = compact_ascii_alnum(&app_norm);
    if app_compact.is_empty() {
        return None;
    }
    rules.iter().find_map(|r| {
        let r_compact = compact_ascii_alnum(r);
        if r_compact.is_empty() {
            return None;
        }
        if app_compact == r_compact || app_compact.contains(&r_compact) {
            Some(format!(
                "compact_match app_compact={} rule={} rule_compact={}",
                app_compact, r, r_compact
            ))
        } else {
            None
        }
    })
}

fn is_allowed_apps_debug_target(value: &str) -> bool {
    let v = value.trim().to_lowercase();
    v.contains("roblox") || v.contains("studio")
}

fn looks_like_hostname_target(value: &str) -> bool {
    let t = value.trim().to_lowercase();
    if t.is_empty() || t.contains(' ') || !t.contains('.') {
        return false;
    }
    if t.ends_with(".app") {
        return false;
    }
    t == "localhost" || t.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
}

fn cache_false_on_classify_failure(cache_key: &str, detail: &str) {
    if detail.contains("rate limited") {
        return;
    }
    if let Ok(mut cache) = ai_classifications().lock() {
        cache.insert(cache_key.to_string(), false);
    }
}

fn classify_local_distraction(
    app_name: &str,
    domain: Option<&str>,
    user_id: Option<&str>,
) -> Option<String> {
    let app = app_name.to_lowercase();
    if app.contains("flowlocked") || app.contains("focustogether") {
        return None;
    }
    if is_browser(app_name) {
        match domain {
            None => return None,
            Some(d) if !looks_like_hostname_target(d) => return None,
            _ => {}
        }
    }
    let Ok(rules) = distraction_rules().lock().map(|g| g.clone()) else {
        return None;
    };
    if let Some(d) = domain {
        let normalized = normalize_rule_value(d);
        if contains_any_rule_token(d, &rules.own_app_domains) {
            return None;
        }
        if rule_matches(d, &rules.classroom_allowed) {
            return None;
        }
        if rule_matches(d, &rules.classroom_blocked) {
            return normalized;
        }
        if rules.whitelist_mode_websites {
            if rule_matches(d, &rules.whitelist_websites) {
                return None;
            }
            return normalized;
        }
        if rule_matches(d, &rules.allowed) {
            return None;
        }
        if matches_productive_override(d) {
            return None;
        }
        if rule_matches(d, &rules.distracting) {
            return normalized;
        }
        if default_distracting_entries().iter().any(|k| d.contains(k)) {
            return normalized;
        }
        if distracting_keywords().iter().any(|k| d.contains(k)) {
            return normalized;
        }
        if let Some(key) = normalized {
            if let Ok(cache) = ai_classifications().lock() {
                if let Some(v) = cache.get(&key) {
                    return if *v { Some(key) } else { None };
                }
            }
            if let Some(uid) = user_id {
                // Browser titles from extension pages are often not hostnames ("boxel rebound").
                // Route hostnames through website classification; everything else through app path.
                let is_browser_target = looks_like_hostname_target(&key);
                let (opt, detail) =
                    server_classify_target_with_detail(uid, &key, Some(is_browser_target));
                match opt {
                    Some(true) => {
                        println!("[Server Classifier] {} => distracting ({})", key, detail);
                        if let Ok(mut cache) = ai_classifications().lock() {
                            cache.insert(key.clone(), true);
                        }
                        return Some(key);
                    }
                    Some(false) => {
                        println!("[Server Classifier] {} => not distracting ({})", key, detail);
                        if let Ok(mut cache) = ai_classifications().lock() {
                            cache.insert(key.clone(), false);
                        }
                    }
                    None => {
                        println!("[Server Classifier] {} FAILED: {}", key, detail);
                        cache_false_on_classify_failure(&key, &detail);
                    }
                }
            }
        }
        return None;
    }
    let app_norm = normalize_app_name(&app).unwrap_or(app.clone());
    let debug_allowed_apps = is_allowed_apps_debug_target(app_name)
        || is_allowed_apps_debug_target(&app_norm)
        || rules.allowed.iter().any(|r| is_allowed_apps_debug_target(r))
        || rules
            .classroom_allowed
            .iter()
            .any(|r| is_allowed_apps_debug_target(r))
        || rules
            .whitelist_apps
            .iter()
            .any(|r| is_allowed_apps_debug_target(r));
    if debug_allowed_apps {
        detection_println!(
            "[AllowedAppsDebug] classify_enter app_raw={:?} app_norm={:?} app_compact={:?} is_browser={} domain={:?} whitelist_mode_apps={} allowed_count={} classroom_allowed_count={} whitelist_apps_count={} distracting_count={}",
            app_name,
            app_norm,
            compact_ascii_alnum(&app_norm),
            is_browser(app_name),
            domain,
            rules.whitelist_mode_apps,
            rules.allowed.len(),
            rules.classroom_allowed.len(),
            rules.whitelist_apps.len(),
            rules.distracting.len()
        );
    }
    if contains_any_rule_token(&app_norm, &rules.own_app_domains) {
        if debug_allowed_apps {
            detection_println!(
                "[AllowedAppsDebug] classify_exit app_norm={:?} reason=own_app_domains_match",
                app_norm
            );
        }
        return None;
    }
    if let Some(reason) = app_rule_match_detail(&app_norm, &rules.classroom_allowed) {
        if debug_allowed_apps {
            detection_println!(
                "[AllowedAppsDebug] classify_exit app_norm={:?} reason=classroom_allowed match_detail={}",
                app_norm, reason
            );
        }
        return None;
    }
    if let Some(reason) = app_rule_match_detail(&app_norm, &rules.classroom_blocked) {
        if debug_allowed_apps {
            detection_println!(
                "[AllowedAppsDebug] classify_exit app_norm={:?} reason=classroom_blocked match_detail={}",
                app_norm, reason
            );
        }
        return Some(app_norm.clone());
    }
    if rules.whitelist_mode_apps {
        if let Some(reason) = app_rule_match_detail(&app_norm, &rules.whitelist_apps) {
            if debug_allowed_apps {
                detection_println!(
                    "[AllowedAppsDebug] classify_exit app_norm={:?} reason=whitelist_apps_allow match_detail={}",
                    app_norm, reason
                );
            }
            return None;
        }
        if debug_allowed_apps {
            detection_println!(
                "[AllowedAppsDebug] classify_exit app_norm={:?} reason=whitelist_mode_apps_block_no_match",
                app_norm
            );
        }
        return Some(app_norm);
    }
    if let Some(reason) = app_rule_match_detail(&app_norm, &rules.allowed) {
        if debug_allowed_apps {
            detection_println!(
                "[AllowedAppsDebug] classify_exit app_norm={:?} reason=allowed_match match_detail={}",
                app_norm, reason
            );
        }
        return None;
    }
    if matches_productive_override(&app_norm) {
        if debug_allowed_apps {
            detection_println!(
                "[AllowedAppsDebug] classify_exit app_norm={:?} reason=productive_override",
                app_norm
            );
        }
        return None;
    }
    if let Some(reason) = app_rule_match_detail(&app_norm, &rules.distracting) {
        if debug_allowed_apps {
            detection_println!(
                "[AllowedAppsDebug] classify_exit app_norm={:?} reason=distracting_rule_match match_detail={}",
                app_norm, reason
            );
        }
        return Some(app_norm.clone());
    }
    if default_distracting_entries()
        .iter()
        .any(|k| app_norm.contains(k))
    {
        if debug_allowed_apps {
            detection_println!(
                "[AllowedAppsDebug] classify_exit app_norm={:?} reason=default_distracting_entries",
                app_norm
            );
        }
        return Some(app_norm.clone());
    }
    if distracting_keywords().iter().any(|k| app_norm.contains(k)) {
        if debug_allowed_apps {
            detection_println!(
                "[AllowedAppsDebug] classify_exit app_norm={:?} reason=distracting_keywords",
                app_norm
            );
        }
        return Some(app_norm.clone());
    }
    if let Ok(cache) = ai_classifications().lock() {
        if let Some(v) = cache.get(&app_norm) {
            if debug_allowed_apps {
                detection_println!(
                    "[AllowedAppsDebug] classify_cache app_norm={:?} cached_distracting={}",
                    app_norm, v
                );
            }
            return if *v { Some(app_norm.clone()) } else { None };
        }
    }
    if let Some(uid) = user_id {
        let (opt, detail) = server_classify_target_with_detail(uid, &app_norm, Some(false));
        if debug_allowed_apps {
            detection_println!(
                "[AllowedAppsDebug] classify_server app_norm={:?} server_result={:?} detail={:?}",
                app_norm, opt, detail
            );
        }
        match opt {
            Some(true) => {
                println!("[Server Classifier] {} => distracting ({})", app_norm, detail);
                if let Ok(mut cache) = ai_classifications().lock() {
                    cache.insert(app_norm.clone(), true);
                }
                return Some(app_norm);
            }
            Some(false) => {
                println!("[Server Classifier] {} => not distracting ({})", app_norm, detail);
                if let Ok(mut cache) = ai_classifications().lock() {
                    cache.insert(app_norm.clone(), false);
                }
            }
            None => {
                println!("[Server Classifier] {} FAILED: {}", app_norm, detail);
                cache_false_on_classify_failure(&app_norm, &detail);
            }
        }
    }
    if debug_allowed_apps {
        detection_println!(
            "[AllowedAppsDebug] classify_exit app_norm={:?} reason=no_match_not_distracting",
            app_norm
        );
    }
    None
}

fn is_locally_allowed_non_browser_app(app_name: &str) -> bool {
    if is_browser(app_name) {
        return false;
    }
    let app_norm = normalize_app_name(app_name).unwrap_or_else(|| app_name.trim().to_lowercase());
    let Ok(rules) = distraction_rules().lock().map(|g| g.clone()) else {
        return false;
    };
    if app_rule_match_detail(&app_norm, &rules.classroom_allowed).is_some() {
        return true;
    }
    if rules.whitelist_mode_apps {
        return app_rule_match_detail(&app_norm, &rules.whitelist_apps).is_some();
    }
    if app_rule_match_detail(&app_norm, &rules.allowed).is_some() {
        return true;
    }
    matches_productive_override(&app_norm)
}

/// Default API host (production). Override with `BACKEND_URL` or persisted `backend_url` if needed.
const DEFAULT_BACKEND_BASE_URL: &str = "https://flowlocked.com";

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

fn set_openai_api_key_config(key: Option<String>) -> Result<(), String> {
    let config = get_config();
    let mut config_guard = config.lock().map_err(|e| format!("Failed to lock config: {}", e))?;
    config_guard.openai_api_key = key
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
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
    #[serde(rename = "ownAppDomains", default)]
    own_app_domains: Vec<String>,
    #[serde(default, rename = "needsTabInfo")]
    needs_tab_info: bool,
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

fn process_name_by_pid(pid: u32) -> Option<String> {
    if pid == 0 {
        return None;
    }
    use sysinfo::{ProcessesToUpdate, System};
    let mut system = System::new_all();
    system.refresh_processes(ProcessesToUpdate::All, true);
    for process in system.processes().values() {
        if process.pid().as_u32() != pid {
            continue;
        }
        let raw_name = process.name().to_string_lossy().trim().to_string();
        if !raw_name.is_empty() {
            return Some(raw_name);
        }
    }
    None
}

fn sanitize_foreground_snapshot(app_name: String, title: String, pid: u32) -> Option<(String, String, u32)> {
    let mut app = app_name.trim().to_string();
    let t = title.trim().to_string();

    // Window APIs can briefly report an empty owner name (macOS metadata limits, overlays).
    // Fallback to the process table by PID so classification still runs (e.g. Steam).
    if app.is_empty() {
        if let Some(name) = process_name_by_pid(pid) {
            app = name;
        }
    }
    #[cfg(target_os = "windows")]
    if app.is_empty() {
        app = "windows-system".to_string();
    }

    if app.is_empty() {
        return None;
    }

    Some((app, t, pid))
}

fn foreground_pid_still_matches(pid: u32) -> bool {
    matches!(get_foreground_info(), Some((_, _, p)) if p == pid)
}

/// Resolve browser domain for a specific foreground snapshot (app/pid/title).
/// Returns None if focus changed before/after URL read to avoid cross-window flicker.
/// Second tuple element: `false` = URL bar read, `true` = window-title heuristics (needs Windows
/// debounce for address-bar autocomplete noise).
fn resolve_focused_browser_domain_with_source(
    app_name: &str,
    title: &str,
    pid: u32,
) -> Option<(String, bool)> {
    if !is_browser(app_name) {
        if let Ok(mut cache) = browser_target_cache_lock().lock() {
            cache.remove(&pid);
        }
        return None;
    }
    if !foreground_pid_still_matches(pid) {
        return None;
    }
    #[cfg(target_os = "macos")]
    let url_read_timeout = std::time::Duration::from_millis(250);
    #[cfg(not(target_os = "macos"))]
    let url_read_timeout = std::time::Duration::from_millis(250);
    if let Some(d) = browser_url::get_active_browser_domain_nonblocking(
        pid,
        url_read_timeout,
        Some(app_name),
        Some(title),
    ) {
        if foreground_pid_still_matches(pid) {
            if looks_like_hostname_target(&d) {
                if let Ok(mut cache) = browser_target_cache_lock().lock() {
                    cache.insert(pid, (d.clone(), std::time::Instant::now()));
                    log!(
                        "[btcache] insert pid={} domain={} source_strategy=url_bar_read",
                        pid,
                        d
                    );
                }
            } else {
                log!(
                    "[btcache] insert_skipped pid={} raw_value=\"{}\" reason=failed_hostname_check",
                    pid,
                    d.replace('"', "'")
                );
            }
            return Some((d, false));
        }
        return None;
    }
    // URL bar read timed out / unavailable. Prefer the most recent successfully
    // read domain for this PID (within TTL) over title-based heuristics, so that
    // sites whose window title contains no domain don't oscillate the warning.
    if let Ok(mut cache) = browser_target_cache_lock().lock() {
        match cache.get(&pid).cloned() {
            None => {
                log!(
                    "[btcache] lookup pid={} result=miss reason=no_entry",
                    pid
                );
            }
            Some((cached_domain, at)) => {
                let age_ms = at.elapsed().as_millis() as u64;
                let ttl_ms = BROWSER_TARGET_CACHE_TTL.as_millis() as u64;
                if at.elapsed() > BROWSER_TARGET_CACHE_TTL {
                    log!(
                        "[btcache] expire pid={} domain={} age_ms={}",
                        pid,
                        cached_domain,
                        age_ms
                    );
                    cache.remove(&pid);
                    log!(
                        "[btcache] lookup pid={} result=miss reason=expired_age_ms={}",
                        pid,
                        age_ms
                    );
                } else {
                    let ttl_remaining_ms = ttl_ms.saturating_sub(age_ms);
                    let pip_overlay_active =
                        window_monitor::pip_recently_open_traced("btcache_grace");
                    if foreground_pid_still_matches(pid) || pip_overlay_active {
                        let reuse_reason = if foreground_pid_still_matches(pid) {
                            "pid_match"
                        } else {
                            "pip_recent_grace"
                        };
                        log!(
                            "[btcache] lookup pid={} result=hit domain={} age_ms={} ttl_remaining_ms={} pip_overlay_active={} reuse_reason={}",
                            pid,
                            cached_domain,
                            age_ms,
                            ttl_remaining_ms,
                            pip_overlay_active,
                            reuse_reason
                        );
                        log!(
                            "[Desktop Apps] reusing cached browser target for pid={}: {} (age {}ms, pip_overlay_active={})",
                            pid,
                            cached_domain,
                            age_ms,
                            pip_overlay_active
                        );
                        DESKTOP_FG_BRANCH_OVERRIDE.with(|c| c.set(Some("pip_grace_cache")));
                        return Some((cached_domain, false));
                    }
                    log!(
                        "[btcache] lookup pid={} result=miss reason=reuse_denied_no_pid_match",
                        pid
                    );
                }
            }
        }
    }
    if let Some(d) = browser_url::infer_site_from_window_title(title) {
        if foreground_pid_still_matches(pid) {
            return Some((d, true));
        }
        return None;
    }
    if let Some(d) = browser_url::host_hint_from_title(title) {
        if foreground_pid_still_matches(pid) {
            return Some((d, true));
        }
        return None;
    }
    None
}

/// Raw foreground target plus whether it came only from title heuristics (not URL bar).
fn resolve_foreground_browser_target_detailed(
    app_name: &str,
    title: &str,
    pid: u32,
) -> (Option<String>, bool) {
    if !is_browser(app_name) {
        return (None, false);
    }
    if let Some((d, from_title)) = resolve_focused_browser_domain_with_source(app_name, title, pid) {
        if !is_browser_internal_marker_target(&d) {
            return (Some(d), from_title);
        }
    }
    let t = browser_title_target::target_from_window_title(title);
    (t, true)
}

/// Foreground browser target for classification and `/api/desktop/apps`, with Windows-only
/// debounce when the host is inferred from the window title (address-bar autocomplete).
fn effective_foreground_browser_target(app_name: &str, title: &str, pid: u32) -> Option<String> {
    let (raw, title_derived) = resolve_foreground_browser_target_detailed(app_name, title, pid);
    #[cfg(target_os = "windows")]
    {
        if !is_browser(app_name) {
            if let Ok(mut g) = windows_title_target_debounce_lock().lock() {
                g.reset();
            }
            return None;
        }
        if let Ok(mut g) = windows_title_target_debounce_lock().lock() {
            return g.apply(raw, title_derived);
        }
        return raw;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = title_derived;
        raw
    }
}

fn resolved_browser_window_title(app_name: &str, window_title: &str, pid: u32) -> String {
    if !is_browser(app_name) {
        return window_title.trim().to_string();
    }
    let mut title = window_title.trim().to_string();
    let browser_name = app_name.trim();
    let title_is_generic = title.is_empty() || title.eq_ignore_ascii_case(browser_name);
    if title_is_generic {
        if let Some(recovered_title) = browser_url::get_active_browser_window_title_nonblocking(
            pid,
            std::time::Duration::from_millis(180),
            Some(app_name),
        ) {
            let recovered_trimmed = recovered_title.trim();
            if window_monitor::is_flowlocked_pip_title(recovered_trimmed) {
                log!(
                    "[Desktop Apps] Dropped recovered PiP title via accessibility/automation: process={} title={:?}",
                    app_name,
                    recovered_trimmed
                );
            } else if !recovered_trimmed.is_empty() {
                title = recovered_trimmed.to_string();
                log!(
                    "[Desktop Apps] Recovered browser title via accessibility/automation: process={} title={:?}",
                    app_name,
                    title
                );
                if let Ok(mut cache) = browser_title_cache_lock().lock() {
                    cache.insert(pid, (title.clone(), std::time::Instant::now()));
                }
            }
        }
        if title.is_empty() || title.eq_ignore_ascii_case(browser_name) {
            if let Ok(mut cache) = browser_title_cache_lock().lock() {
                if let Some((cached_title, at)) = cache.get(&pid).cloned() {
                    if at.elapsed() <= BROWSER_TITLE_CACHE_TTL {
                        return cached_title;
                    }
                }
                cache.remove(&pid);
            }
        }
    } else if let Ok(mut cache) = browser_title_cache_lock().lock() {
        cache.insert(pid, (title.clone(), std::time::Instant::now()));
    }
    title
}

/// `foregroundApp` for POST `/api/desktop/apps`: browser domain target when available; app name otherwise.
fn foreground_app_for_desktop_apps_api(app_name: &str, window_title: &str, pid: u32) -> String {
    let domain_target = if is_browser(app_name) {
        effective_foreground_browser_target(app_name, window_title, pid)
    } else {
        None
    };
    let branch_override = take_desktop_fg_branch_override();
    let mut out = if is_browser(app_name) {
        domain_target
            .clone()
            .unwrap_or_else(|| app_name.to_string())
    } else {
        app_name.to_string()
    };
    let mut branch: &str = if !is_browser(app_name) {
        "non_browser"
    } else if domain_target.is_some() {
        branch_override.unwrap_or("browser_with_domain")
    } else {
        "browser_bare_name"
    };
    if window_monitor::is_flowlocked_pip_title(&out) {
        log!("[Desktop Apps] dropped PiP title at API boundary");
        out = app_name.to_string();
        branch = "other:pip_title_api_boundary";
    }
    log!(
        "[Desktop Apps] foregroundApp computed: process={} url_bar_or_title_domain={:?} sent={:?} branch={}",
        app_name,
        domain_target.as_deref(),
        out.as_str(),
        branch
    );
    out
}

fn log_desktop_apps_outbound_body(body: &serde_json::Value) {
    let mut v = body.clone();
    if let serde_json::Value::Object(ref mut m) = v {
        if let Some(serde_json::Value::Array(arr)) = m.get_mut("apps") {
            let total = arr.len();
            if total > 5 {
                let more = total - 5;
                *arr = arr.iter().take(5).cloned().collect();
                m.insert(
                    "_appsTruncated".to_string(),
                    serde_json::Value::String(format!("(+{} more)", more)),
                );
            }
        }
    }
    match serde_json::to_string(&v) {
        Ok(s) => println!("[Desktop Apps] outbound POST /api/desktop/apps body={}", s),
        Err(e) => println!(
            "[Desktop Apps] outbound POST /api/desktop/apps body=<serialize_err:{}>",
            e
        ),
    }
}

fn cache_foreground_server_decision(
    foreground_app: &str,
    is_foreground_blocked: bool,
    own_app_domains: &[String],
) {
    let mut own_set = HashSet::new();
    for v in own_app_domains {
        if let Some(n) = normalize_rule_value(v) {
            own_set.insert(n);
        }
    }
    if let Ok(mut slot) = latest_foreground_server_decision().lock() {
        *slot = Some(ForegroundServerDecision {
            foreground_key: normalized_foreground_key(foreground_app),
            is_foreground_blocked,
            own_app_domains: own_set,
        });
    }
}

fn get_cached_foreground_server_decision(
    foreground_app: &str,
) -> Option<ForegroundServerDecision> {
    let key = normalized_foreground_key(foreground_app);
    let Ok(slot) = latest_foreground_server_decision().lock() else {
        return None;
    };
    slot.clone().filter(|d| d.foreground_key == key)
}

/// Report current desktop state to server; server remains source of truth.
fn check_apps_with_server(
    user_id: &str,
    foreground_app: &str,
    foreground_process: Option<&str>,
) -> Option<DesktopAppsResponse> {
    if APPS_REPORT_IN_FLIGHT
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        println!(
            "[Desktop Apps] ⏭️ Skipping report (in-flight): userId={}, foregroundApp={}",
            user_id, foreground_app
        );
        return None;
    }
    println!("[Desktop] Sending app report for userId={}", user_id);
    println!(
        "[Desktop Apps] Checking app with server: userId={}, foregroundApp={}, foregroundProcess={:?}",
        user_id, foreground_app, foreground_process
    );
    
    let backend_url = backend_base_url();
    let endpoint = format!("{}/api/desktop/apps", backend_url);
    
    // Build the request body
    let running_apps = get_running_app_names();
    let mut body = serde_json::json!({
        "userId": user_id,
        "apps": running_apps,
        "foregroundApp": foreground_app,
        "source": "desktopNative"
    });
    if let Some(p) = foreground_process {
        if let Some(obj) = body.as_object_mut() {
            obj.insert(
                "foregroundProcess".to_string(),
                serde_json::Value::String(p.to_string()),
            );
        }
    }
    
    let result = (|| {
        // Use blocking HTTP request (we're in a thread)
        let client = match reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build() {
                Ok(c) => c,
                Err(e) => {
                    detection_println!("[Detection] Failed to create HTTP client: {}", e);
                    return None;
                }
            };
        
        log_desktop_apps_outbound_body(&body);
        match client.post(&endpoint)
            .header("Content-Type", "application/json")
            .json(&body)
            .send() {
            Ok(response) => {
                match response.json::<DesktopAppsResponse>() {
                    Ok(data) => {
                        if data.success {
                            if data.needs_tab_info {
                                println!(
                                    "[Desktop Apps] needsTabInfo=true from server (foregroundApp may look like raw browser name); verify stripped tab title and foregroundProcess"
                                );
                            }
                            cache_foreground_server_decision(
                                foreground_app,
                                data.is_foreground_blocked,
                                &data.own_app_domains,
                            );
                            println!(
                                "[Detection] Server response - isForegroundBlocked: {}, blockedRunning: {:?}, ownAppDomains: {}, needsTabInfo: {}, currentDistractionPresent: {}",
                                data.is_foreground_blocked,
                                data.blocked_running,
                                data.own_app_domains.len(),
                                data.needs_tab_info,
                                data.current_distraction.is_some()
                            );
                            Some(data)
                        } else {
                            detection_println!("[Detection] Server returned success: false");
                            None
                        }
                    }
                    Err(e) => {
                        detection_println!("[Detection] Failed to parse server response: {}", e);
                        None
                    }
                }
            }
            Err(e) => {
                detection_println!("[Detection] Failed to contact server: {}", e);
                None
            }
        }
    })();
    APPS_REPORT_IN_FLIGHT.store(false, Ordering::SeqCst);
    result
}

fn run_immediate_desktop_apps_report(user_id: &str) {
    let Some((app_name, title, pid)) = get_foreground_info() else {
        return;
    };
    let resolved_title = resolved_browser_window_title(&app_name, &title, pid);
    let foreground_app = foreground_app_for_desktop_apps_api(&app_name, &resolved_title, pid);
    let foreground_process = if is_browser(&app_name) {
        Some(app_name.as_str())
    } else {
        None
    };
    let _ = check_apps_with_server(user_id, &foreground_app, foreground_process);
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct AppConfig {
    user_id: Option<String>,
    connected_at: Option<String>,
    /// When set, desktop HTTP/WebSocket use this origin (e.g. Replit staging). Env `BACKEND_URL` overrides.
    #[serde(default)]
    backend_url: Option<String>,
    /// OpenAI key for local site/app classification. Env `OPENAI_API_KEY` overrides when set.
    #[serde(default, rename = "openaiApiKey")]
    openai_api_key: Option<String>,
    /// Hostnames / app tokens classified as distracting by AI; checked before calling OpenAI again.
    #[serde(default, rename = "learnedDistracting")]
    learned_distracting: Vec<String>,
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
    match std::env::var("FOCUSTOGETHER_CONFIG_DIR") {
        Ok(dir) => println!(
            "[Config] FOCUSTOGETHER_CONFIG_DIR={} (separate config per instance for two-user testing)",
            dir
        ),
        Err(_) => println!(
            "[Config] FOCUSTOGETHER_CONFIG_DIR not set — default ~/.focustogether. For two desktop instances with different users, set FOCUSTOGETHER_CONFIG_DIR per process (see scripts/launch-two-users.sh)."
        ),
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

/// Start the heartbeat ping loop - runs every 30 seconds. Reads current userId from
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
            for _ in 0..30 {
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

/// Expected: `flowlocked://auth?userId=XXX` (or legacy `focustogether://auth?...`) with optional `&backend=https%3A%2F%2F...`
fn parse_deep_link(url: &str) -> Option<DeepLinkAuth> {
    let ok = url.starts_with("flowlocked://auth") || url.starts_with("focustogether://auth");
    if !ok {
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

/// Second URL scheme for the same executable (`tauri-plugin-deep-link` only registers one scheme on Windows).
/// Keeps `focustogether://` working after migrating the site to `flowlocked://`.
#[cfg(target_os = "windows")]
fn register_windows_legacy_focustogether_url_scheme() -> std::io::Result<()> {
    use std::path::Path;
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let exe = std::env::current_exe()?
        .display()
        .to_string()
        .replace("\\\\?\\", "");

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let base = Path::new("Software").join("Classes").join("focustogether");
    let (key, _) = hkcu.create_subkey(&base)?;
    // Match `prepare("Flowlocked")` + plugin behavior (URL: label in Default Programs).
    key.set_value("", &"URL:Flowlocked")?;
    key.set_value("URL Protocol", &"")?;

    let (icon, _) = hkcu.create_subkey(base.join("DefaultIcon"))?;
    icon.set_value("", &format!("{},0", exe.as_str()))?;

    let (cmd, _) = hkcu.create_subkey(base.join("shell").join("open").join("command"))?;
    cmd.set_value("", &format!("{} \"%1\"", exe))?;

    println!("[DeepLink] ✅ Windows: registered legacy focustogether:// (same exe as flowlocked://)");
    Ok(())
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

/// Legacy: optional local `openaiApiKey` in config (classification uses server OpenAI; this is unused for the hot path).
#[tauri::command]
fn set_openai_api_key(key: Option<String>) -> Result<(), String> {
    set_openai_api_key_config(key)
}

#[tauri::command]
fn has_openai_api_key() -> bool {
    resolve_openai_api_key().is_some()
}

/// Debug: `POST /api/desktop/classify-target` on the configured backend (same as session classification).
#[tauri::command]
fn debug_ai_classify(hostname: String) -> Result<String, String> {
    let t = hostname.trim().to_string();
    if t.is_empty() {
        return Err("empty hostname".to_string());
    }
    let Some(uid) = get_current_user_id() else {
        return Err(
            "No linked userId — sign in via the web app and open Flowlocked from the site (deep link)."
                .to_string(),
        );
    };
    let (opt, detail) = server_classify_target_with_detail(&uid, &t, None);
    Ok(format!(
        "backend={}\nuserId_linked=true\nclassification={:?} — distracting=true blocks, false=allow, None=error\n{}",
        backend_base_url(),
        opt,
        detail
    ))
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
    .inner_size(480.0, 460.0)
    .transparent(true)
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
    .inner_size(420.0, 300.0)
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
        .inner_size(420.0, 360.0)
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
#[serde(default)]
struct PendingAlert {
    #[serde(rename = "type")]
    alert_type: Option<String>,
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
    /// Full notification body from server (takes precedence over constructed copy when set).
    #[serde(default, rename = "notificationBody")]
    notification_body: Option<String>,
    /// Optional title from server when using `notificationBody`.
    #[serde(default, rename = "notificationTitle")]
    notification_title: Option<String>,
    /// For self-distraction alerts from browser extension
    #[serde(default)]
    domain: Option<String>,
    /// For `session-ending` alerts (minutes until room closes).
    #[serde(default, rename = "remainingMinutes")]
    remaining_minutes: Option<u32>,
}

impl Default for PendingAlert {
    fn default() -> Self {
        Self {
            alert_type: None,
            alerting_user_id: None,
            alerting_username: None,
            alerting_first_name: None,
            status: None,
            session_id: None,
            timestamp: None,
            message: None,
            notification_body: None,
            notification_title: None,
            domain: None,
            remaining_minutes: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct SessionResponse {
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
    #[serde(rename = "joinedAt")]
    joined_at: Option<String>,
    active: Option<bool>,
    #[serde(default, rename = "requestImmediateAppReport")]
    request_immediate_app_report: bool,
    #[serde(default, rename = "noteTakingMode")]
    note_taking_mode: bool,
    #[serde(default)]
    kicked: bool,
    /// Server always sends an array; default to empty if key is missing (defensive)
    #[serde(rename = "pendingAlerts", default)]
    pending_alerts: Option<Vec<PendingAlert>>,
    #[serde(rename = "distractingApps", default)]
    distracting_apps: Vec<String>,
    #[serde(rename = "blockedApps", default)]
    blocked_apps: Vec<String>,
    #[serde(rename = "allowedApps", default)]
    allowed_apps: Vec<String>,
    #[serde(rename = "classroomAllowedApps", default)]
    classroom_allowed_apps: Vec<String>,
    #[serde(rename = "classroomBlockedApps", default)]
    classroom_blocked_apps: Vec<String>,
    #[serde(rename = "ownAppDomains", default)]
    own_app_domains: Vec<String>,
    #[serde(rename = "whitelistApps", default)]
    whitelist_apps: Vec<String>,
    #[serde(rename = "whitelistWebsites", default)]
    whitelist_websites: Vec<String>,
    #[serde(default, rename = "whitelistModeApps")]
    whitelist_mode_apps: bool,
    #[serde(default, rename = "whitelistModeWebsites")]
    whitelist_mode_websites: bool,
    /// Legacy: true when either whitelist had entries. Do not use for classification.
    #[serde(default, rename = "whitelistMode")]
    whitelist_mode: bool,
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

/// Steam embeds Chromium/CEF; the foreground process name is often "Chromium Helper" with no URL,
/// which `is_browser_app` would treat as Chrome-without-domain → no distraction. If the bundle/exe
/// path is clearly under Steam, classify as the Steam client instead.
fn steam_label_when_cef_reports_as_browser(process_path: &std::path::Path, app_name: &str) -> Option<String> {
    let p = process_path.to_string_lossy().to_lowercase();
    let steam_install = p.contains("steam.app")
        || p.ends_with("steam.exe")
        || p.contains("steam_osx")
        || p.contains("/steam/steamapps/")
        || p.contains("\\steam\\steamapps\\");
    if !steam_install {
        return None;
    }
    let n = app_name.trim().to_lowercase();
    if n.contains("steam") {
        return None;
    }
    if browser_title_target::is_browser_app(app_name)
        || n.contains("chromium")
        || n.contains("cef")
        || n.contains("helper")
    {
        return Some("Steam".to_string());
    }
    None
}

static LAST_STEAM_DISTRACTION_TRACE_MS: AtomicU64 = AtomicU64::new(0);

fn maybe_log_steam_foreground_blocked(
    app_name: &str,
    desktop_fg: &str,
    local_key: &Option<String>,
    server_cleared_own_domain: bool,
    is_distracting: bool,
) {
    if is_distracting {
        return;
    }
    let a = app_name.to_lowercase();
    let d = desktop_fg.to_lowercase();
    if !a.contains("steam") && !d.contains("steam") {
        return;
    }
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|x| x.as_millis() as u64)
        .unwrap_or(0);
    let last = LAST_STEAM_DISTRACTION_TRACE_MS.load(Ordering::Relaxed);
    if now_ms.saturating_sub(last) < 4_000 {
        return;
    }
    LAST_STEAM_DISTRACTION_TRACE_MS.store(now_ms, Ordering::Relaxed);
    detection_println!(
        "[Detection][steam-trace] foreground not treated as distracting: app={:?} desktop_fg={:?} local_key={:?} server_own_domain_cleared={}",
        app_name, desktop_fg, local_key, server_cleared_own_domain
    );
}

/// Get foreground app info. Returns (app_name, window_title, process_id).
/// Data is used only for classification, then discarded.
fn get_foreground_info() -> Option<(String, String, u32)> {
    match window_monitor::get_active_window_skip_pip_overlay() {
        Ok(window) => {
            let raw_app_name = window.app_name.clone();
            let raw_title = window.title.clone();
            let mut app_name = window.app_name;
            if let Some(label) =
                steam_label_when_cef_reports_as_browser(&window.process_path, &app_name)
            {
                app_name = label;
            }
            let title = window.title;
            let pid = window.process_id as u32;
            let out = sanitize_foreground_snapshot(app_name, title, pid);
            if is_allowed_apps_debug_target(&raw_app_name)
                || is_allowed_apps_debug_target(&raw_title)
                || out
                    .as_ref()
                    .map(|(a, t, _)| {
                        is_allowed_apps_debug_target(a) || is_allowed_apps_debug_target(t)
                    })
                    .unwrap_or(false)
            {
                detection_println!(
                    "[AllowedAppsDebug] foreground_snapshot raw_app={:?} raw_title={:?} sanitized={:?} pid={} process_path={:?}",
                    raw_app_name,
                    raw_title,
                    out,
                    pid,
                    window.process_path
                );
            }
            #[cfg(target_os = "macos")]
            window_monitor::log_detection_foreground_tick(
                out.as_ref()
                    .map(|(a, t, p)| (a.as_str(), t.as_str(), *p)),
            );
            out
        }
        Err(()) => {
            #[cfg(target_os = "macos")]
            window_monitor::log_detection_foreground_tick(None);
            None
        }
    }
}

fn is_browser(app_name: &str) -> bool {
    browser_title_target::is_browser_app(app_name)
}

/// Get the detection session mutex
fn get_detection_session() -> &'static Mutex<Option<(String, String)>> {
    DETECTION_SESSION.get_or_init(|| Mutex::new(None))
}

fn epoch_ms_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn post_distraction_state_blocking(user_id: &str, distracted: bool, domain: Option<&str>) -> bool {
    if distracted && domain.is_none() {
        println!("[DistractionState] Skipped distracted=true without domain");
        return false;
    }
    let backend_url = backend_base_url();
    let endpoint = format!("{}/api/desktop/distraction-state", backend_url);
    let mut body = serde_json::json!({
        "userId": user_id,
        "distracted": distracted
    });
    if distracted {
        if let Some(d) = domain {
            body["domain"] = serde_json::Value::String(d.to_string());
        }
    }
    let client = match reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            println!("[DistractionState] Failed to create client: {}", e);
            return false;
        }
    };
    let clear_sent_at_ms = if !distracted { Some(epoch_ms_now()) } else { None };
    let clear_started_at = if !distracted {
        Some(std::time::Instant::now())
    } else {
        None
    };
    for attempt in 1..=3 {
        let res = client
            .post(&endpoint)
            .header("Content-Type", "application/json")
            .json(&body)
            .send();
        match res {
            Ok(r) if r.status().is_success() => {
                if !distracted {
                    let resp_at_ms = epoch_ms_now();
                    let elapsed_ms = clear_started_at
                        .as_ref()
                        .map(|s| s.elapsed().as_millis() as u64)
                        .unwrap_or(0);
                    detection_println!(
                        "[Detection] post_distraction_state_clear sent_at={} resp_at={} status={} attempt={} elapsed_ms={}",
                        clear_sent_at_ms.unwrap_or(0),
                        resp_at_ms,
                        r.status(),
                        attempt,
                        elapsed_ms
                    );
                }
                println!(
                    "[DistractionState] ✅ sent distracted={} attempt={}",
                    distracted, attempt
                );
                return true;
            }
            Ok(r) => {
                if !distracted {
                    let resp_at_ms = epoch_ms_now();
                    let elapsed_ms = clear_started_at
                        .as_ref()
                        .map(|s| s.elapsed().as_millis() as u64)
                        .unwrap_or(0);
                    detection_println!(
                        "[Detection] post_distraction_state_clear sent_at={} resp_at={} status={} attempt={} elapsed_ms={}",
                        clear_sent_at_ms.unwrap_or(0),
                        resp_at_ms,
                        r.status(),
                        attempt,
                        elapsed_ms
                    );
                }
                println!(
                    "[DistractionState] HTTP {} (attempt {}/3)",
                    r.status(),
                    attempt
                );
            }
            Err(e) => {
                if !distracted {
                    let resp_at_ms = epoch_ms_now();
                    let elapsed_ms = clear_started_at
                        .as_ref()
                        .map(|s| s.elapsed().as_millis() as u64)
                        .unwrap_or(0);
                    detection_println!(
                        "[Detection] post_distraction_state_clear sent_at={} resp_at={} status=request_error attempt={} elapsed_ms={} err={}",
                        clear_sent_at_ms.unwrap_or(0),
                        resp_at_ms,
                        attempt,
                        elapsed_ms,
                        e
                    );
                }
                println!(
                    "[DistractionState] request failed: {} (attempt {}/3)",
                    e, attempt
                )
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(250));
    }
    false
}

fn send_distraction_state(user_id: &str, distracted: bool, domain: Option<&str>) -> bool {
    // Prevent duplicate transitions.
    let already = DISTRACTION_REPORTED.load(Ordering::SeqCst);
    if distracted == already {
        return true;
    }
    let ok = post_distraction_state_blocking(user_id, distracted, domain);
    if ok {
        DISTRACTION_REPORTED.store(distracted, Ordering::SeqCst);
    }
    ok
}

/// Matches [`show_distraction_warning`] `.title(...)` — exclude from "our app" dismiss so the popup
/// does not clear the warning when it briefly becomes foreground.
fn is_distraction_warning_popup_title(title: &str) -> bool {
    title.trim().eq_ignore_ascii_case("Distraction Warning")
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
    .inner_size(480.0, 480.0)
    .transparent(true)
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
            detection_println!("[Detection] Distraction warning shown");
        }
        Err(e) => {
            detection_println!("[Detection] Failed to create warning window: {}", e);
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
        
        detection_println!("[Detection] Warning updated to distracted state");
    }
}

/// Dismiss distraction warning popup
fn dismiss_distraction_warning(app_handle: &tauri::AppHandle) {
    if let Some(window) = app_handle.get_window("distraction-warning") {
        let sent_at_ms = epoch_ms_now();
        let started = std::time::Instant::now();
        detection_println!(
            "[Detection] distraction_popup_close_requested sent_at={}",
            sent_at_ms
        );
        let _ = window.close();
        detection_println!(
            "[Detection] distraction_popup_close_completed sent_at={} completed_at={} elapsed_ms={}",
            sent_at_ms,
            epoch_ms_now(),
            started.elapsed().as_millis()
        );
        detection_println!("[Detection] Distraction warning dismissed");
    } else {
        detection_println!(
            "[Detection] distraction_popup_close_skipped reason=window_not_found at={}",
            epoch_ms_now()
        );
    }
}

/// Start distraction detection for a session
fn start_detection(app_handle: tauri::AppHandle, user_id: String, session_id: String) {
    detection_println!("[Detection] 🚀 start_detection called with userId={}, sessionId={}", user_id, session_id);
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
            detection_println!("[Detection] ⚠️ Detection already running for same user+session — skipping start");
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
        detection_println!("[Detection] ✅ Stored session info in DETECTION_SESSION");
    }

    // If we previously failed to send a clear, retry once at session start.
    if DISTRACTION_REPORTED.load(Ordering::SeqCst) {
        let _ = send_distraction_state(&user_id, false, None);
    }
    
    DETECTION_RUNNING.store(true, Ordering::SeqCst);
    
    // Update tray to show monitoring active
    let tray = app_handle.tray_handle();
    let _ = tray.get_item("status").set_title("Monitoring: Active");
    
    detection_println!("[Detection] Started for user {} in session {}", user_id, session_id);
    
    // Spawn detection thread
    std::thread::spawn(move || {
        // State tracking
        let mut warning_shown_at: Option<std::time::Instant> = None;
        let mut is_marked_distracted = false;
        let mut last_sent_state: Option<&str> = None;
        let mut last_server_report: Option<std::time::Instant> = None;
        let mut last_reported_app: String = String::new();
        // Last `foregroundApp` string we posted for browsers (stripped tab title; tab changes do not change app name).
        let mut last_reported_target: Option<String> = None;
        let mut active_distraction_key: Option<String> = None;
        // Hysteresis: dynamic page titles (HTML5 games update document.title with frame
        // counters, attempt numbers, "Loading…", etc.) make the server's per-title AI
        // verdict flip across ticks even when the user hasn't navigated. The same can
        // happen client-side when the URL-bar read times out. Require either a sustained
        // run of non-distracting ticks or an actual change in the foreground identity
        // before dismissing the orange warning, so transient flips don't cause flicker.
        let mut consecutive_clear_ticks: u32 = 0;
        let mut active_foreground_key: Option<String> = None;
        const DISMISS_CLEAR_TICKS: u32 = 8; // ~1.6s at 200ms tick

        // Orange distraction warning: 10s countdown before red + sending distracted (idle warning uses useIdleWarning.ts + notification.html countdown)
        const WARNING_DURATION_SECS: u64 = 10;
        // Optional apps-report heartbeat for server-side UI/debug views; local rules drive distraction state.
        const SERVER_REPORT_HEARTBEAT_SECS: u64 = 10;
        let mut clear_pending_started_at: Option<std::time::Instant> = None;
        #[cfg(target_os = "macos")]
        let mut mac_last_tick_ms: Option<u64> = None;
        #[cfg(target_os = "macos")]
        let mut mac_last_host_change_ms: Option<u64> = None;
        #[cfg(target_os = "macos")]
        let mut mac_prev_host: Option<String> = None;

        while DETECTION_RUNNING.load(Ordering::SeqCst) {
            // Keep app/site transitions snappy: 250ms baseline, 200ms while warning/distracted.
            let mut sleep_ms: u64 = 250;
            // Get session info
            let session_info = {
                get_detection_session().lock().ok().and_then(|s| s.clone())
            };
            
            if let Some((user_id, _session_id)) = session_info {
                // Get foreground info and classify
                if let Some((app_name, title, pid)) = get_foreground_info() {
                    // Check if foreground is our own app (main shell — not the orange distraction popup).
                    let app_lower = app_name.to_lowercase();
                    let is_our_app = (app_lower.contains("flowlocked")
                        || app_lower.contains("focustogether"))
                        && !is_distraction_warning_popup_title(&title);
                    
                    let resolved_title = resolved_browser_window_title(&app_name, &title, pid);
                    let desktop_apps_foreground =
                        foreground_app_for_desktop_apps_api(&app_name, &resolved_title, pid);
                    let effective_target =
                        effective_foreground_browser_target(&app_name, &resolved_title, pid);
                    let browser_fallback_target = if is_browser(&app_name)
                        && effective_target.is_none()
                        && !desktop_apps_foreground
                            .trim()
                            .eq_ignore_ascii_case(app_name.trim())
                    {
                        Some(desktop_apps_foreground.as_str())
                    } else {
                        None
                    };
                    let mut local_distraction_key = classify_local_distraction(
                        &app_name,
                        effective_target.as_deref().or(browser_fallback_target),
                        Some(user_id.as_str()),
                    );
                    if is_allowed_apps_debug_target(&app_name)
                        || is_allowed_apps_debug_target(&title)
                        || is_allowed_apps_debug_target(&desktop_apps_foreground)
                        || effective_target
                            .as_ref()
                            .map(|s| is_allowed_apps_debug_target(s))
                            .unwrap_or(false)
                    {
                        detection_println!(
                            "[AllowedAppsDebug] detection_loop app={:?} title={:?} pid={} desktop_apps_foreground={:?} effective_target={:?} browser_fallback_target={:?} local_distraction_key={:?}",
                            app_name,
                            title,
                            pid,
                            desktop_apps_foreground,
                            effective_target,
                            browser_fallback_target,
                            local_distraction_key
                        );
                    }
                    #[cfg(target_os = "macos")]
                    {
                        let now_ms = epoch_ms_now();
                        let dt_ms = mac_last_tick_ms
                            .map(|p| now_ms.saturating_sub(p))
                            .unwrap_or(0);
                        mac_last_tick_ms = Some(now_ms);
                        let host_for_log = effective_target
                            .as_ref()
                            .map(|s| s.to_lowercase())
                            .or_else(|| browser_fallback_target.map(|s| s.to_lowercase()));
                        detection_println!(
                            "[Detection] clear-lag tick app={:?} host={:?} tick_delta_ms={} warning_shown={} marked_distracted={}",
                            app_name,
                            host_for_log.as_deref().unwrap_or("-"),
                            dt_ms,
                            warning_shown_at.is_some(),
                            is_marked_distracted
                        );
                        if host_for_log != mac_prev_host {
                            let delta_ms = mac_last_host_change_ms
                                .map(|p| now_ms.saturating_sub(p))
                                .unwrap_or(0);
                            detection_println!(
                                "[Detection] url_changed prev={:?} new={:?} delta_ms_since_last_change={}",
                                mac_prev_host.as_deref().unwrap_or("-"),
                                host_for_log.as_deref().unwrap_or("-"),
                                delta_ms
                            );
                            mac_prev_host = host_for_log;
                            mac_last_host_change_ms = Some(now_ms);
                        }
                    }
                    let local_after_classify = local_distraction_key.clone();
                    // Any match while foreground is a real browser counts as browser distraction (not the
                    // "You opened Google Chrome" notification path). Do not require URL bar read: title hints
                    // and URL read both feed `effective_target`.

                    let foreground_identity_changed = last_reported_app != app_name
                        || (is_browser(&app_name)
                            && last_reported_target.as_deref() != Some(desktop_apps_foreground.as_str()));

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
                        last_reported_target = if is_browser(&app_name) {
                            Some(desktop_apps_foreground.clone())
                        } else {
                            None
                        };
                        log!(
                            "[Desktop Apps] foreground report: process={} pid={} foregroundApp={:?} classify_target={:?}",
                            app_name,
                            pid,
                            desktop_apps_foreground.as_str(),
                            effective_target.as_deref()
                        );

                        if let Some(ref current_user) = get_current_user_id() {
                            let uid = current_user.clone();
                            let proc_name = app_name.clone();
                            let fg_app = desktop_apps_foreground.clone();
                            let fg_proc = if is_browser(&app_name) {
                                Some(proc_name)
                            } else {
                                None
                            };
                            // Non-blocking: keep detection loop responsive on app/tab switches.
                            std::thread::spawn(move || {
                                let proc_ref = fg_proc.as_deref();
                                let _ = check_apps_with_server(&uid, &fg_app, proc_ref);
                            });
                        }
                    }

                    let cached_server = get_cached_foreground_server_decision(&desktop_apps_foreground);
                    let server_own_domain_match = cached_server
                        .as_ref()
                        .map(|d| contains_any_rule_token(&desktop_apps_foreground, &d.own_app_domains))
                        .unwrap_or(false);
                    if server_own_domain_match {
                        local_distraction_key = None;
                    }
                    let server_report_blocked = cached_server
                        .as_ref()
                        .map(|d| d.is_foreground_blocked)
                        .unwrap_or(false);
                    let local_non_browser_allow = is_locally_allowed_non_browser_app(&app_name);
                    let server_blocked_after_own_guard = server_report_blocked
                        && !server_own_domain_match
                        && !local_non_browser_allow;
                    if server_report_blocked && local_non_browser_allow {
                        detection_println!(
                            "[AllowedAppsDebug] suppress_server_block app={:?} desktop_fg={:?} reason=local_non_browser_allow_match",
                            app_name,
                            desktop_apps_foreground
                        );
                    }

                    let is_browser_distracting =
                        is_browser(&app_name) && local_distraction_key.is_some();

                    let is_server_blocked = local_distraction_key.is_some();
                    
                    // Determine if currently distracting
                    // Special case: if warning was from a LOCAL app (not browser) and user switched
                    // to a non-blocked app, dismiss even if browser has stale distraction data
                    let is_distracting_now =
                        !server_own_domain_match
                            && (is_server_blocked
                                || is_browser_distracting
                                || server_blocked_after_own_guard);

                    maybe_log_steam_foreground_blocked(
                        &app_name,
                        &desktop_apps_foreground,
                        &local_after_classify,
                        server_own_domain_match,
                        is_distracting_now,
                    );

                    // Native app in foreground: clear any warning from a prior browser/other app.
                    // (Previously we `continue`d here without dismissing, so the orange popup
                    // stayed up after switching from YouTube back to Flowlocked.)
                    if is_our_app {
                        if warning_shown_at.is_some() || is_marked_distracted {
                            clear_pending_started_at = None;
                            detection_println!(
                                "[Detection] distraction_exit_immediate reason=native_app_foreground app={:?}",
                                app_name
                            );
                            consecutive_clear_ticks = 0;
                            dismiss_distraction_warning(&app_handle);
                            warning_shown_at = None;
                            is_marked_distracted = false;
                            active_distraction_key = None;
                            active_foreground_key = None;
                            if last_sent_state == Some("distracted") {
                                if send_distraction_state(&user_id, false, None) {
                                    detection_println!(
                                        "[Detection] Back to active (native app foreground)"
                                    );
                                    last_sent_state = Some("active");
                                } else {
                                    detection_println!(
                                        "[Detection] ⚠️ Failed to clear distracted; will retry"
                                    );
                                }
                            }
                        }
                        std::thread::sleep(std::time::Duration::from_millis(200));
                        continue;
                    }

                    // Stable identity for the currently-foregrounded thing. For browsers we
                    // prefer the URL/host (effective_target), and only fall back to the title-
                    // derived key when no URL is known. This is what we compare against
                    // `active_foreground_key` to decide whether the user really navigated away.
                    let current_foreground_key: String = effective_target
                        .clone()
                        .or_else(|| browser_fallback_target.map(|s| s.to_string()))
                        .and_then(|s| normalize_rule_value(&s))
                        .unwrap_or_else(|| {
                            normalize_rule_value(&desktop_apps_foreground)
                                .unwrap_or_else(|| desktop_apps_foreground.to_lowercase())
                        });
                    if is_distracting_now {
                        // Reset the clear-tick counter the moment we see distraction again.
                        consecutive_clear_ticks = 0;
                        clear_pending_started_at = None;
                        if warning_shown_at.is_none() && !is_marked_distracted {
                            // First detection - show warning
                            show_distraction_warning(&app_handle);
                            if !is_browser_distracting && !server_blocked_after_own_guard {
                                let app_id = app_handle.config().tauri.bundle.identifier.clone();
                                let _ = tauri::api::notification::Notification::new(&app_id)
                                    .title("Stay focused!")
                                    .body(format!("You opened {}.", app_name))
                                    .show();
                            }
                            warning_shown_at = Some(std::time::Instant::now());
                            active_distraction_key = local_distraction_key
                                .clone()
                                .or_else(|| normalize_rule_value(&desktop_apps_foreground))
                                .or_else(|| Some(desktop_apps_foreground.to_lowercase()));
                            detection_println!(
                                "[Detection] distraction_enter domain={:?} countdown_started_at={} reason=is_distracting_now",
                                active_distraction_key.as_deref().unwrap_or("-"),
                                epoch_ms_now()
                            );
                            active_foreground_key = Some(current_foreground_key.clone());
                            if is_browser_distracting {
                                detection_println!("[Detection] Warning triggered by local browser domain match");
                            } else if server_blocked_after_own_guard {
                                detection_println!("[Detection] Warning triggered by server isForegroundBlocked for '{}'", desktop_apps_foreground);
                            } else {
                                detection_println!("[Detection] ⚠️ Warning triggered by local rules for '{}'", app_name);
                            }
                        } else if let Some(start_time) = warning_shown_at {
                            // Refresh the foreground key while still distracting on the same site,
                            // so a brief flip-then-recover doesn't lose track of identity.
                            if active_foreground_key.as_deref() != Some(current_foreground_key.as_str()) {
                                active_foreground_key = Some(current_foreground_key.clone());
                            }
                            if start_time.elapsed().as_secs() >= WARNING_DURATION_SECS && !is_marked_distracted {
                                is_marked_distracted = true;
                                detection_println!("[Detection] ⏰ 10 seconds passed - transitioning to distracted");
                                update_distraction_warning_to_distracted(&app_handle);
                            }
                        }
                        if is_marked_distracted && last_sent_state != Some("distracted") {
                            if send_distraction_state(
                                &user_id,
                                true,
                                active_distraction_key.as_deref(),
                            ) {
                                detection_println!("[Detection] Marked as distracted after 10s warning");
                                last_sent_state = Some("distracted");
                            } else {
                                detection_println!("[Detection] ⚠️ Failed to report distracted; will retry");
                            }
                        }
                    } else {
                        // Not distracting on this tick. Decide whether this is a genuine
                        // "user navigated away" or a transient classifier flip.
                        if warning_shown_at.is_some() || is_marked_distracted {
                            let identity_changed = active_foreground_key
                                .as_deref()
                                .map(|prev| prev != current_foreground_key.as_str())
                                .unwrap_or(true);
                            if identity_changed {
                                // Real navigation away from the distracting target → dismiss immediately.
                                clear_pending_started_at = None;
                                detection_println!(
                                    "[Detection] distraction_exit_immediate reason=foreground_changed from_key={:?} to_key={:?}",
                                    active_foreground_key.as_deref().unwrap_or("-"),
                                    current_foreground_key
                                );
                                consecutive_clear_ticks = 0;
                                dismiss_distraction_warning(&app_handle);
                                warning_shown_at = None;
                                is_marked_distracted = false;
                                active_distraction_key = None;
                                active_foreground_key = None;
                                if last_sent_state == Some("distracted") {
                                    if send_distraction_state(&user_id, false, None) {
                                        detection_println!("[Detection] Back to active (foreground changed)");
                                        last_sent_state = Some("active");
                                    } else {
                                        detection_println!("[Detection] ⚠️ Failed to clear distracted; will retry");
                                    }
                                }
                            } else {
                                // Same foreground, but classifier transiently flipped to "not distracting".
                                // Hold the warning until we see a sustained run of clear ticks.
                                consecutive_clear_ticks = consecutive_clear_ticks.saturating_add(1);
                                if consecutive_clear_ticks == 1 {
                                    clear_pending_started_at = Some(std::time::Instant::now());
                                    detection_println!(
                                        "[Detection] distraction_exit_pending grace_ms={} reason=same_foreground_transient_clear key={:?}",
                                        DISMISS_CLEAR_TICKS as u64 * 200,
                                        current_foreground_key
                                    );
                                }
                                if consecutive_clear_ticks >= DISMISS_CLEAR_TICKS {
                                    let elapsed_ms = clear_pending_started_at
                                        .as_ref()
                                        .map(|s| s.elapsed().as_millis() as u64)
                                        .unwrap_or(0);
                                    detection_println!(
                                        "[Detection] distraction_exit_committed elapsed_ms={} reason=sustained_clear key={:?}",
                                        elapsed_ms,
                                        current_foreground_key
                                    );
                                    clear_pending_started_at = None;
                                    consecutive_clear_ticks = 0;
                                    dismiss_distraction_warning(&app_handle);
                                    warning_shown_at = None;
                                    is_marked_distracted = false;
                                    active_distraction_key = None;
                                    active_foreground_key = None;
                                    if last_sent_state == Some("distracted") {
                                        if send_distraction_state(&user_id, false, None) {
                                            detection_println!("[Detection] Back to active (sustained clear)");
                                            last_sent_state = Some("active");
                                        } else {
                                            detection_println!("[Detection] ⚠️ Failed to clear distracted; will retry");
                                        }
                                    }
                                } else {
                                    detection_println!(
                                        "[Detection] Holding warning through transient clear ({}/{}) for key='{}'",
                                        consecutive_clear_ticks, DISMISS_CLEAR_TICKS, current_foreground_key
                                    );
                                }
                            }
                        } else if DISTRACTION_REPORTED.load(Ordering::SeqCst) {
                            if send_distraction_state(&user_id, false, None) {
                                last_sent_state = Some("active");
                            }
                        }
                    }
                    // Faster polling while warning/distracted state is active.
                    sleep_ms = if warning_shown_at.is_some()
                        || is_marked_distracted
                    {
                        200
                    } else {
                        250
                    };
                } else {
                    sleep_ms = if warning_shown_at.is_some() || is_marked_distracted {
                        200
                    } else {
                        250
                    };
                }
            }
            
            std::thread::sleep(std::time::Duration::from_millis(sleep_ms));
        }
        
        // Cleanup on stop
        dismiss_distraction_warning(&app_handle);
        detection_println!("[Detection] Thread stopped");
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
        if DISTRACTION_REPORTED.load(Ordering::SeqCst) {
            if send_distraction_state(&uid, false, None) {
                detection_println!("[Detection] Cleared distracted state on stop_detection");
            } else {
                detection_println!("[Detection] ⚠️ Failed clearing distracted state on stop_detection");
            }
        }
    } else {
        detection_println!("[Detection] 🛑 stop_detection called while running (no prior session stored)");
    }
    
    DETECTION_RUNNING.store(false, Ordering::SeqCst);

    if let Ok(mut cache) = browser_target_cache_lock().lock() {
        cache.clear();
    }

    // Clear session info
    if let Ok(mut session) = get_detection_session().lock() {
        *session = None;
    }
    
    // Dismiss ALL notification windows when session ends
    dismiss_all_notifications(app_handle);
    
    // Update tray to show monitoring inactive
    let tray = app_handle.tray_handle();
    let _ = tray.get_item("status").set_title("Monitoring: Inactive");
    
    detection_println!("[Detection] Stopped");
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
        
        // Cache latest distraction rules from poll. Detection loop uses these locally as source of truth.
        
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
        update_distraction_rules_from_poll(
            &session_response.distracting_apps,
            &session_response.allowed_apps,
            &session_response.blocked_apps,
            &session_response.classroom_allowed_apps,
            &session_response.classroom_blocked_apps,
            &session_response.own_app_domains,
            &session_response.whitelist_apps,
            &session_response.whitelist_websites,
            session_response.whitelist_mode_apps,
            session_response.whitelist_mode_websites,
        );
        log!("[POLL DEBUG] Parsed OK — sessionId={:?} pendingAlerts count={} distractingApps count={}",
                 session_response.session_id,
                 alert_count,
                 session_response.distracting_apps.len());
        log!(
            "[POLL DEBUG] Parsed extra: active={:?} kicked={} joinedAt={:?} allowedApps count={} blockedApps count={} classroomAllowedApps count={} classroomBlockedApps count={} ownAppDomains count={} whitelistModeApps={} whitelistModeWebsites={} whitelistApps count={} whitelistWebsites count={} requestImmediateAppReport={}",
            session_response.active,
            session_response.kicked,
            session_response.joined_at,
            session_response.allowed_apps.len(),
            session_response.blocked_apps.len(),
            session_response.classroom_allowed_apps.len(),
            session_response.classroom_blocked_apps.len(),
            session_response.own_app_domains.len(),
            session_response.whitelist_mode_apps,
            session_response.whitelist_mode_websites,
            session_response.whitelist_apps.len(),
            session_response.whitelist_websites.len(),
            session_response.request_immediate_app_report
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

        if session_response.request_immediate_app_report
            && session_response.session_id.is_some()
            && session_response.active.unwrap_or(true)
        {
            let uid = userId.clone();
            std::thread::spawn(move || {
                run_immediate_desktop_apps_report(&uid);
            });
        }

        // Process pending alerts
        if let Some(ref alerts) = session_response.pending_alerts {
            if !alerts.is_empty() {
                log!("[POLL DEBUG] 🔔 Processing {} pending alert(s)", alerts.len());
                
                // First: handle explicit one-shot alert types from the server.
                for (i, alert) in alerts.iter().enumerate() {
                    log!(
                        "[POLL DEBUG] Alert[{}]: type={:?} status={:?} alertingUserId={:?} alertingFirstName={:?}",
                        i,
                        alert.alert_type,
                        alert.status,
                        alert.alerting_user_id,
                        alert.alerting_first_name
                    );

                    if alert.alert_type.as_deref() == Some("session-ending") {
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

                    if alert.alert_type.as_deref() == Some("participant-activity") {
                        let title = alert
                            .notification_title
                            .as_deref()
                            .map(str::trim)
                            .filter(|s| !s.is_empty())
                            .unwrap_or("Flowlocked");
                        let body = alert
                            .notification_body
                            .as_deref()
                            .map(str::trim)
                            .filter(|s| !s.is_empty())
                            .unwrap_or("A participant is distracted");
                        log!(
                            "[POLL DEBUG] Alert[{}] → participant-activity, showing native notification",
                            i,
                        );
                        let app_id = app.config().tauri.bundle.identifier.clone();
                        let _ = tauri::api::notification::Notification::new(&app_id)
                            .title(title)
                            .body(body)
                            .show();
                        continue;
                    }

                    if alert.alert_type.as_deref() == Some("self-distraction") {
                        let body = alert
                            .notification_body
                            .clone()
                            .filter(|s| !s.is_empty())
                            .or_else(|| alert.message.clone())
                            .unwrap_or_else(|| {
                                if let Some(domain) = alert.domain.clone() {
                                    format!("You visited a distracting site: {}", domain)
                                } else {
                                    "You visited a distracting app".to_string()
                                }
                            });
                        let notif_title = alert
                            .notification_title
                            .clone()
                            .filter(|s| !s.is_empty())
                            .unwrap_or_else(|| "Flowlocked".to_string());
                        log!(
                            "[POLL DEBUG] Alert[{}] → self-distraction, showing native notification",
                            i
                        );
                        let app_id = app.config().tauri.bundle.identifier.clone();
                        let _ = tauri::api::notification::Notification::new(&app_id)
                            .title(&notif_title)
                            .body(body)
                            .show();
                        continue;
                    }
                }

                // Process partner alerts (idle/distracted). Server guarantees exactly one alert per
                // distraction event — no client-side deduplication needed.
                for (i, alert) in alerts.iter().enumerate() {
                    let is_self = alert.alert_type.as_deref() == Some("self-distraction");
                    let is_session_ending = alert.alert_type.as_deref() == Some("session-ending");
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
                        "distracted" => {
                            let default_title = format!("{} is distracted", name_for_distracted);
                            let default_msg =
                                format!("{} is using a distracting app", name_for_distracted);
                            let title = alert
                                .notification_title
                                .clone()
                                .filter(|s| !s.is_empty())
                                .unwrap_or(default_title);
                            let message = alert
                                .notification_body
                                .clone()
                                .filter(|s| !s.is_empty())
                                .unwrap_or(default_msg);
                            (title, message)
                        }
                        "idle" => {
                            let default_title = "Partner Idle".to_string();
                            let default_msg = format!("{} has gone idle", display_name);
                            let title = alert
                                .notification_title
                                .clone()
                                .filter(|s| !s.is_empty())
                                .unwrap_or(default_title);
                            let message = alert
                                .notification_body
                                .clone()
                                .filter(|s| !s.is_empty())
                                .unwrap_or(default_msg);
                            (title, message)
                        }
                        _ => continue,
                    };
                    
                    // List all existing windows to check for conflicts
                    let existing_windows: Vec<String> = app.windows().keys().cloned().collect();
                    let participant_windows: Vec<&String> = existing_windows.iter()
                        .filter(|l| l.starts_with("participant-alert"))
                        .collect();
                    log!("[POPUP DEBUG] All open windows: {:?}", existing_windows);
                    log!("[POPUP DEBUG] Existing participant-alert windows: {:?}", participant_windows);
                    
                    log!("[POPUP DEBUG] Attempting to create popup window for alert: type={:?} status={:?} alertingUserId={:?} firstName={:?} title=\"{}\" message=\"{}\"",
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
        log!(
            "[POLL DEBUG] Keeping local detection running with cached rules despite poll HTTP error"
        );
        log!("[POLL DEBUG] ═══ Poll #{} complete in {}ms (error) ═══", poll_num, poll_start.elapsed().as_millis());
        Ok(ActiveSessionPollResult {
            session_id: get_detection_session()
                .lock()
                .ok()
                .and_then(|s| s.as_ref().map(|(_, sid)| sid.clone())),
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
    diagnostic_log::init();
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
        .on_system_tray_event(|app, event| {
            match event {
                tauri::SystemTrayEvent::MenuItemClick { id, .. } => {
                    match id.as_str() {
                        "quit" => {
                            println!("[Tray] Quit clicked — notifying server then exiting");
                            stop_heartbeat_loop();
                            stop_detection(app);
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
        .invoke_handler(tauri::generate_handler![get_idle_seconds, show_notification, show_participant_alert, show_session_ending_alert, dismiss_session_ending_window, dismiss_notification, update_notification_idle_countdown, update_notification_to_idle_marked, update_notification_to_distracted, send_activity_update, get_active_session, get_focus_stats, get_user_id, is_listener_only, get_backend_base_url, set_backend_base_url, set_openai_api_key, has_openai_api_key, debug_ai_classify])
        .setup(|app| {
            println!("[Tauri] Setup callback called");

            // Initialize deep link plugin
            #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
            {
                // `prepare` sets the Windows "URL:" protocol label (e.g. URL:Flowlocked) and instance id.
                tauri_plugin_deep_link::prepare("Flowlocked");
                println!("[DeepLink] ✅ Deep link handler prepared for flowlocked://");
                
                // Register handler for deep link events (scheme must match site + default OS handler)
                let app_handle = app.handle();
                tauri_plugin_deep_link::register("flowlocked", move |request| {
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

                #[cfg(target_os = "windows")]
                {
                    if let Err(e) = register_windows_legacy_focustogether_url_scheme() {
                        eprintln!(
                            "[DeepLink] ⚠️ Failed to register legacy focustogether:// on Windows: {}",
                            e
                        );
                    }
                }
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
                let screen_recording_granted = macos_screen_recording_granted();
                println!(
                    "[permissions] screen-recording granted={}",
                    screen_recording_granted
                );
                if !screen_recording_granted {
                    let _ = request_macos_screen_recording_access();
                    let app_id = app.config().tauri.bundle.identifier.clone();
                    let _ = tauri::api::notification::Notification::new(&app_id)
                        .title("Screen Recording permission needed")
                        .body("Flowlocked needs Screen Recording permission to read window titles so it can correctly skip the Picture-in-Picture overlay during distraction detection. Please enable it in System Settings → Privacy & Security → Screen Recording, then restart Flowlocked.")
                        .show();
                }
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
                .inner_size(440.0, 360.0)
                .transparent(true)
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

