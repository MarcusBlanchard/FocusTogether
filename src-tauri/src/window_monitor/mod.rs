//! Foreground window selection that skips the Flowlocked Document Picture-in-Picture overlay
//! (title contains `Flowlocked PiP` / `FocusTogether PiP`, tolerant of browser suffixes) so distraction
//! detection sees the real window underneath.
//!
//! Browser tabs whose titles contain "Flowlocked" or "FocusTogether" are **not** skipped here: after
//! PiP is skipped, that window is often the correct "user is in Flowlocked" answer. Those strings
//! are already treated as non-distracting in `classify_local_distraction` (native app name and
//! server-driven own domains).

use active_win_pos_rs::ActiveWindow;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "linux")]
mod linux;
pub(crate) mod history;

static PIP_OPEN: AtomicBool = AtomicBool::new(false);
static PIP_OPEN_AT_MS: AtomicU64 = AtomicU64::new(0);

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

pub(crate) fn finalize_with_history(resolved: ActiveWindow) -> ActiveWindow {
    let final_win = if pip_recently_open() && is_flowlocked_surface(&resolved) {
        match history::most_recent_non_flowlocked(is_flowlocked_surface) {
            Some(prev) => {
                println!(
                    "[window_monitor] PiP-mask recovery: current=\"{}\" (app={}) → using recent \"{}\" (app={}, age={:.1}s)",
                    resolved.title,
                    resolved.app_name,
                    prev.win.title,
                    prev.win.app_name,
                    prev.at.elapsed().as_secs_f64()
                );
                prev.win
            }
            None => resolved,
        }
    } else {
        resolved
    };
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
    println!(
        "[window-monitor] skipped suspected-PiP overlay (browser+small+top): {}x{} app={}",
        w as i64,
        h as i64,
        app
    );
}

pub(crate) fn log_skipped_pip(skipped_title: &str, underlying_title: &str, underlying_app: &str) {
    println!(
        "[window_monitor] skipped PiP overlay \"{}\" → reporting underlying window \"{}\" (process={}).",
        skipped_title, underlying_title, underlying_app
    );
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
}
