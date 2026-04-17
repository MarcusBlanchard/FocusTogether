//! Foreground window selection that skips the Flowlocked Document Picture-in-Picture overlay
//! (title prefix `Flowlocked PiP` / `FocusTogether PiP`, tolerant of browser suffixes) so distraction
//! detection sees the real window underneath.
//!
//! Browser tabs whose titles contain "Flowlocked" or "FocusTogether" are **not** skipped here: after
//! PiP is skipped, that window is often the correct "user is in Flowlocked" answer. Those strings
//! are already treated as non-distracting in `classify_local_distraction` (native app name and
//! server-driven own domains).

use active_win_pos_rs::ActiveWindow;
use serde::Serialize;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "linux")]
mod linux;

#[derive(Debug, Clone, Serialize)]
pub struct VisibleWindowBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct VisibleWindowReport {
    pub app: String,
    pub title: String,
    pub bounds: VisibleWindowBounds,
    #[serde(rename = "zIndex")]
    pub z_index: usize,
    #[serde(rename = "isOnScreen")]
    pub is_on_screen: bool,
    #[serde(rename = "screenId", skip_serializing_if = "Option::is_none")]
    pub screen_id: Option<i32>,
}

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

/// Returns visible top-level windows (front to back) for `/api/desktop/apps` occlusion checks.
pub fn get_visible_windows_for_report() -> Vec<VisibleWindowReport> {
    #[cfg(target_os = "macos")]
    {
        return macos::get_visible_windows_for_report();
    }
    #[cfg(target_os = "windows")]
    {
        return windows::get_visible_windows_for_report();
    }
    #[cfg(target_os = "linux")]
    {
        return linux::get_visible_windows_for_report();
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Vec::new()
    }
}

/// Document PiP uses a title starting with `Flowlocked PiP` or `FocusTogether PiP` (case-insensitive).
/// Prefix match tolerates browser suffixes such as ` — Google Chrome` on docked PiP windows.
pub(crate) fn is_flowlocked_pip_title(title: &str) -> bool {
    let t = title.trim().to_lowercase();
    t.starts_with("flowlocked pip") || t.starts_with("focustogether pip")
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
    println!(
        "[window-monitor] skipped suspected-PiP overlay (browser+small+top): {}x{} app={}",
        w as i64,
        h as i64,
        app
    );
}

pub(crate) fn log_skipped_pip(underlying_title: &str, underlying_app: &str) {
    println!(
        "[window-monitor] skipped PiP overlay, returning underlying window: {} ({})",
        underlying_title, underlying_app
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_pip_title_case_insensitive() {
        assert!(is_flowlocked_pip_title("Flowlocked PiP"));
        assert!(is_flowlocked_pip_title("flowlocked pip — Google Chrome"));
        assert!(is_flowlocked_pip_title("FocusTogether PiP"));
        assert!(!is_flowlocked_pip_title("Flowlocked - Reddit"));
        assert!(!is_flowlocked_pip_title("Reddit - Google Chrome"));
        assert!(!is_flowlocked_pip_title("FocusTogether"));
    }
}
