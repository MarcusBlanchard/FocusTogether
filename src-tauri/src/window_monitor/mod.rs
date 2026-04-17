//! Foreground window selection that skips the Flowlocked Document Picture-in-Picture overlay
//! (`document.title` === "Flowlocked PiP") so distraction detection sees the real window underneath.
//!
//! Browser tabs whose titles contain "Flowlocked" or "FocusTogether" are **not** skipped here: after
//! PiP is skipped, that window is often the correct "user is in Flowlocked" answer. Those strings
//! are already treated as non-distracting in `classify_local_distraction` (native app name and
//! server-driven own domains).

use active_win_pos_rs::ActiveWindow;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "linux")]
mod linux;

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

/// Document PiP sets `document.title` to exactly this string (case-insensitive match).
pub(crate) fn is_flowlocked_pip_title(title: &str) -> bool {
    title.trim().eq_ignore_ascii_case("flowlocked pip")
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
        assert!(is_flowlocked_pip_title("flowlocked pip"));
        assert!(!is_flowlocked_pip_title("Flowlocked - Google Chrome"));
        assert!(!is_flowlocked_pip_title("FocusTogether"));
    }
}
