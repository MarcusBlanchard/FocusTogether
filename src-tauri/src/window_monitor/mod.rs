//! Foreground window selection that skips the Flowlocked Document Picture-in-Picture overlay
//! (title contains `Flowlocked PiP` / `FocusTogether PiP`, tolerant of browser suffixes) so distraction
//! detection sees the real window underneath.
//!
//! Browser tabs whose titles contain "Flowlocked" or "FocusTogether" are **not** skipped here: after
//! PiP is skipped, that window is often the correct "user is in Flowlocked" answer. Those strings
//! are already treated as non-distracting in `classify_local_distraction` (native app name and
//! server-driven own domains).

use active_win_pos_rs::ActiveWindow;
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU64, Ordering};

/// Set `FLOWLOCKED_WM_DEBUG=1` (or `true` / `yes`) for full per-candidate z-order logs.
pub fn wm_debug_enabled() -> bool {
    match std::env::var("FLOWLOCKED_WM_DEBUG") {
        Ok(s) => {
            let t = s.trim();
            !t.is_empty()
                && t != "0"
                && !t.eq_ignore_ascii_case("false")
                && !t.eq_ignore_ascii_case("no")
        }
        Err(_) => false,
    }
}

static LAST_LOG_FINALIZE_SUMMARY_MS: AtomicU64 = AtomicU64::new(0);
static LAST_LOG_DETECTION_FG_MS: AtomicU64 = AtomicU64::new(0);
static LAST_LOG_ZWALK_PICK_MS: AtomicU64 = AtomicU64::new(0);
static LAST_LOG_FINALIZE_DEBUG_MS: AtomicU64 = AtomicU64::new(0);

fn throttle_print(last_ms: &AtomicU64, interval_ms: u64, msg: impl std::fmt::Display) {
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let prev = last_ms.load(Ordering::Relaxed);
    if now_ms.saturating_sub(prev) < interval_ms {
        return;
    }
    last_ms.store(now_ms, Ordering::Relaxed);
    let line = format!("{}", msg);
    println!("{}", line);
    crate::diagnostic_log::append_line(&line);
}

/// After sanitize in the detection loop: shows what classification will see (throttled).
pub fn log_detection_foreground_tick(snap: Option<(&str, &str, u32)>) {
    let body = match snap {
        Some((a, t, p)) => format!(
            "pid={} app={:?} title_len={} title_prefix={:?}",
            p,
            a,
            t.len(),
            t.chars().take(72).collect::<String>()
        ),
        None => "sanitize returned None (no foreground)".to_string(),
    };
    throttle_print(
        &LAST_LOG_DETECTION_FG_MS,
        2_500,
        format_args!("[window_monitor] detection-fg: {}", body),
    );
}

/// macOS z-order walk chose this window (throttled).
pub(crate) fn log_zwalk_pick_summary(
    frontmost_pid: Option<i64>,
    picked_pid: i64,
    picked_app: &str,
    title: &str,
    saw_pip: bool,
    skipped_pip_chain: bool,
    source: &str,
) {
    let title_prefix: String = title.chars().take(80).collect();
    throttle_print(
        &LAST_LOG_ZWALK_PICK_MS,
        2_500,
        format_args!(
            "[window-monitor] zwalk-pick: source={} frontmost_pid={:?} picked_pid={} picked_app={:?} title_prefix={:?} saw_pip={} skipped_pip_chain={}",
            source,
            frontmost_pid,
            picked_pid,
            picked_app,
            title_prefix,
            saw_pip,
            skipped_pip_chain
        ),
    );
}

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "linux")]
mod linux;
pub(crate) mod history;

static PIP_OPEN: AtomicBool = AtomicBool::new(false);
static PIP_OPEN_AT_MS: AtomicU64 = AtomicU64::new(0);
static LAST_FLOWLOCKED_PIP_LEVEL: AtomicI64 = AtomicI64::new(-1);

/// Returns the effective foreground window, skipping Flowlocked PiP when it sits above real content.
pub fn get_active_window_skip_pip_overlay() -> Result<ActiveWindow, ()> {
    #[cfg(target_os = "macos")]
    {
        return macos::get_active_window_skip_pip_overlay();
    }
    #[cfg(target_os = "windows")]
    {
        return windows::get_active_window_skip_pip_overlay();
    }
    #[cfg(target_os = "linux")]
    {
        return linux::get_active_window_skip_pip_overlay();
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        active_win_pos_rs::get_active_window()
    }
}

/// Document PiP uses a title containing `Flowlocked PiP` or `FocusTogether PiP` (case-insensitive).
/// Substring match tolerates browser suffixes such as ` - Google Chrome` and
/// ` — Picture in Picture` on docked PiP windows.
pub(crate) fn is_flowlocked_pip_title(title: &str) -> bool {
    let t = title.trim().to_lowercase();
    t.contains("flowlocked pip") || t.contains("focustogether pip")
}

pub(crate) fn is_flowlocked_surface(w: &ActiveWindow) -> bool {
    let title = w.title.trim().to_lowercase();
    let app = w.app_name.trim().to_lowercase();
    if is_flowlocked_pip_title(&title) {
        return true;
    }
    // Native app (macOS bundle name "Flowlocked" / "FocusTogether"; Windows .exe stem too).
    let app_stem = app.trim_end_matches(".exe");
    if matches!(app_stem, "flowlocked" | "focustogether") {
        return true;
    }
    // Browser tab title for the Flowlocked web app.
    // Examples: "Flowlocked – Focus & Accountability App", "Flowlocked - Replit"
    if title.starts_with("flowlocked") || title.starts_with("focustogether") {
        return true;
    }
    false
}

pub(crate) fn mark_pip_seen(open: bool) {
    PIP_OPEN.store(open, Ordering::Relaxed);
    if open {
        let ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        PIP_OPEN_AT_MS.store(ms, Ordering::Relaxed);
    }
}

pub(crate) fn record_flowlocked_pip_level(level: i64) {
    LAST_FLOWLOCKED_PIP_LEVEL.store(level, Ordering::Relaxed);
}

pub(crate) fn latest_flowlocked_pip_level() -> Option<i64> {
    let level = LAST_FLOWLOCKED_PIP_LEVEL.load(Ordering::Relaxed);
    if level >= 0 {
        Some(level)
    } else {
        None
    }
}

/// True if PiP was observed in the current or previous walk (debounced ~5s).
pub(crate) fn pip_recently_open() -> bool {
    if PIP_OPEN.load(Ordering::Relaxed) {
        return true;
    }
    let last = PIP_OPEN_AT_MS.load(Ordering::Relaxed);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    now.saturating_sub(last) < 5_000
}

/// Whether we should replace a Flowlocked-looking foreground with recent history (e.g. YouTube).
///
/// `pip_recent` + [`is_flowlocked_surface`] alone is too broad: after PiP, the user may genuinely
/// focus the main Flowlocked browser tab (large window, title prefix `Flowlocked` / `FocusTogether`).
/// History recovery would swap that for the last distracting window and the distraction warning
/// never clears. Only treat as the PiP masking case when it still looks like a PiP-sized / overlay
/// surface, or PiP title text — never for native Flowlocked, never for a large main browser tab.
fn pip_history_recovery_eligible(resolved: &ActiveWindow, pip_recent: bool) -> bool {
    if !pip_recent || !is_flowlocked_surface(resolved) {
        return false;
    }
    let app = resolved.app_name.trim().to_lowercase();
    let app_stem = app.trim_end_matches(".exe");
    if matches!(app_stem, "flowlocked" | "focustogether") {
        return false;
    }
    let t = resolved.title.trim().to_lowercase();
    let browser = is_known_browser_app_name(&resolved.app_name);
    let main_flow_tab = browser
        && !is_flowlocked_pip_title(&resolved.title)
        && (t.starts_with("flowlocked") || t.starts_with("focustogether"));
    if main_flow_tab {
        let w = resolved.position.width;
        let h = resolved.position.height;
        // Same shape band as Document PiP skips in macOS z-walk; larger ⇒ main browser session.
        let pip_sized = w <= 800.0 && h <= 600.0;
        if !pip_sized {
            return false;
        }
    }
    true
}

pub(crate) fn finalize_with_history(resolved: ActiveWindow) -> ActiveWindow {
    let pip_flag = PIP_OPEN.load(Ordering::Relaxed);
    let pip_recent = pip_recently_open();
    let res_is_flow = is_flowlocked_surface(&resolved);
    let try_recovery = pip_history_recovery_eligible(&resolved, pip_recent);
    let hist_n = history::debug_entry_count();

    let (final_win, recovery_used) = if try_recovery {
        match history::most_recent_non_flowlocked(is_flowlocked_surface) {
            Some(prev) => {
                let msg = format!(
                    "[window_monitor] PiP-mask recovery: current=\"{}\" (app={}) → using recent \"{}\" (app={}, age={:.1}s)",
                    resolved.title,
                    resolved.app_name,
                    prev.win.title,
                    prev.win.app_name,
                    prev.at.elapsed().as_secs_f64()
                );
                crate::diagnostic_log::emit_console_and_file(&msg);
                (prev.win, true)
            }
            None => {
                if wm_debug_enabled() {
                    throttle_print(
                        &LAST_LOG_FINALIZE_DEBUG_MS,
                        900,
                        format_args!(
                            "[window_monitor] PiP-mask recovery skipped: no eligible history entry (hist_entries={} pip_recent={} recovery_eligible={} resolved_is_flow_surface={})",
                            hist_n, pip_recent, try_recovery, res_is_flow
                        ),
                    );
                }
                (resolved, false)
            }
        }
    } else {
        if wm_debug_enabled() {
            throttle_print(
                &LAST_LOG_FINALIZE_DEBUG_MS,
                900,
                format_args!(
                    "[window_monitor] finalize branch: using resolved as-is (pip_flag={} pip_recent={} recovery_eligible={} resolved_is_flow_surface={})",
                    pip_flag, pip_recent, try_recovery, res_is_flow
                ),
            );
        }
        (resolved, false)
    };

    throttle_print(
        &LAST_LOG_FINALIZE_SUMMARY_MS,
        2_500,
        format_args!(
            "[window_monitor] finalize-summary: pip_flag={} pip_recent={} recovery_eligible={} resolved_flow_surface={} recovery={} hist_entries={} final_app={:?} final_title_len={}",
            pip_flag,
            pip_recent,
            try_recovery,
            res_is_flow,
            recovery_used,
            hist_n,
            final_win.app_name,
            final_win.title.len()
        ),
    );

    // Push *non-Flowlocked* entries into history so the next masked tick can use them.
    if !is_flowlocked_surface(&final_win) {
        history::push(&final_win);
    }
    final_win
}

/// Browsers whose small, topmost normal window may be Document PiP before `document.title` is set.
pub(crate) fn is_known_browser_app_name(name: &str) -> bool {
    let n = name.trim().to_lowercase();
    if n.is_empty() {
        return false;
    }
    let mut labels: Vec<&str> = vec![
        "google chrome",
        "microsoft edge",
        "brave browser",
        "chromium",
        "chromium-browser",
        "google-chrome",
        "vivaldi",
        "firefox",
        "safari",
        "opera",
        "brave",
        "arc",
        "msedge",
    ];
    labels.sort_by_key(|s| std::cmp::Reverse(s.len()));
    for o in labels {
        if n == o || n.starts_with(&format!("{o} ")) || n.starts_with(&format!("{o}-")) {
            return true;
        }
    }
    let base = n.rsplit(['/', '\\']).next().unwrap_or(&n);
    let base = base.strip_suffix(".exe").unwrap_or(base);
    matches!(
        base,
        "chrome"
            | "chromium"
            | "chromium-browser"
            | "msedge"
            | "brave"
            | "opera"
            | "vivaldi"
            | "firefox"
            | "safari"
            | "arc"
    ) || base.starts_with("google-chrome")
}

/// `w` / `h` are the window content size in pixels (same units as platform helpers).
pub(crate) fn log_skipped_suspected_pip_heuristic(w: f64, h: f64, app: &str) {
    let msg = format!(
        "[window-monitor] skipped suspected-PiP overlay (browser+small+top): {}x{} app={}",
        w as i64,
        h as i64,
        app
    );
    crate::diagnostic_log::emit_console_and_file(&msg);
}

pub(crate) fn log_skipped_pip(skipped_title: &str, underlying_title: &str, underlying_app: &str) {
    let msg = format!(
        "[window_monitor] skipped PiP overlay \"{}\" → reporting underlying window \"{}\" (process={}).",
        skipped_title, underlying_title, underlying_app
    );
    crate::diagnostic_log::emit_console_and_file(&msg);
}

#[cfg(test)]
mod tests {
    use super::*;
    use active_win_pos_rs::WindowPosition;
    use std::path::PathBuf;

    #[test]
    fn detects_pip_title_case_insensitive() {
        assert!(is_flowlocked_pip_title("Flowlocked PiP"));
        assert!(is_flowlocked_pip_title("flowlocked pip"));
        assert!(is_flowlocked_pip_title("Flowlocked PiP - Google Chrome"));
        assert!(is_flowlocked_pip_title("Flowlocked PiP — Picture in Picture"));
        assert!(is_flowlocked_pip_title("FocusTogether PiP"));
        assert!(!is_flowlocked_pip_title("YouTube - Google Chrome"));
        assert!(!is_flowlocked_pip_title("Flowlocked"));
        assert!(!is_flowlocked_pip_title(""));
        assert!(!is_flowlocked_pip_title("Flowlocked - Reddit"));
        assert!(!is_flowlocked_pip_title("Reddit - Google Chrome"));
        assert!(!is_flowlocked_pip_title("FocusTogether"));
    }

    #[test]
    fn flowlocked_surface_classifier() {
        let mk = |title: &str, app: &str| ActiveWindow {
            window_id: "0".into(),
            process_id: 0,
            app_name: app.into(),
            position: WindowPosition {
                x: 0.0,
                y: 0.0,
                width: 100.0,
                height: 100.0,
            },
            title: title.into(),
            process_path: PathBuf::new(),
        };
        assert!(is_flowlocked_surface(&mk(
            "Flowlocked – Focus & Accountability App",
            "Google Chrome"
        )));
        assert!(is_flowlocked_surface(&mk("Flowlocked - Replit", "Google Chrome")));
        assert!(is_flowlocked_surface(&mk("Flowlocked PiP", "Google Chrome")));
        assert!(is_flowlocked_surface(&mk("anything", "Flowlocked")));
        assert!(is_flowlocked_surface(&mk("anything", "FocusTogether.exe")));
        assert!(!is_flowlocked_surface(&mk(
            "YouTube - Google Chrome",
            "Google Chrome"
        )));
        assert!(!is_flowlocked_surface(&mk("Discord", "Discord")));
    }

    #[test]
    fn pip_history_recovery_not_eligible_for_large_flowlocked_browser_tab() {
        let w = ActiveWindow {
            window_id: "0".into(),
            process_id: 0,
            app_name: "Google Chrome".into(),
            position: WindowPosition {
                x: 0.0,
                y: 0.0,
                width: 1200.0,
                height: 800.0,
            },
            title: "Flowlocked – Session".into(),
            process_path: PathBuf::new(),
        };
        assert!(!pip_history_recovery_eligible(&w, true));
    }

    #[test]
    fn pip_history_recovery_not_eligible_for_native_flowlocked() {
        let w = ActiveWindow {
            window_id: "0".into(),
            process_id: 0,
            app_name: "Flowlocked".into(),
            position: WindowPosition {
                x: 0.0,
                y: 0.0,
                width: 900.0,
                height: 600.0,
            },
            title: "anything".into(),
            process_path: PathBuf::new(),
        };
        assert!(!pip_history_recovery_eligible(&w, true));
    }

    #[test]
    fn pip_history_recovery_eligible_for_pip_sized_flowlocked_title_browser() {
        let w = ActiveWindow {
            window_id: "0".into(),
            process_id: 0,
            app_name: "Google Chrome".into(),
            position: WindowPosition {
                x: 0.0,
                y: 0.0,
                width: 640.0,
                height: 360.0,
            },
            title: "Flowlocked – Session".into(),
            process_path: PathBuf::new(),
        };
        assert!(pip_history_recovery_eligible(&w, true));
    }

    #[test]
    fn pip_history_recovery_eligible_for_explicit_pip_title() {
        let w = ActiveWindow {
            window_id: "0".into(),
            process_id: 0,
            app_name: "Google Chrome".into(),
            position: WindowPosition {
                x: 0.0,
                y: 0.0,
                width: 1200.0,
                height: 800.0,
            },
            title: "Flowlocked PiP - Google Chrome".into(),
            process_path: PathBuf::new(),
        };
        assert!(pip_history_recovery_eligible(&w, true));
    }
}
