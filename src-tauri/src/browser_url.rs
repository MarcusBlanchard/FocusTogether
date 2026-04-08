use std::sync::mpsc;
use std::time::Duration;

/// Returns the full active browser URL for the provided process id.
/// Returns None on unsupported platforms or any accessibility error.
pub fn get_active_browser_url(pid: u32) -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        return macos::get_active_browser_url(pid);
    }

    #[cfg(target_os = "windows")]
    {
        return windows::get_active_browser_url(pid);
    }

    #[allow(unreachable_code)]
    None
}

pub(crate) fn accessibility_available() -> bool {
    #[cfg(target_os = "macos")]
    {
        return macos::is_accessibility_trusted();
    }

    #[allow(unreachable_code)]
    true
}

/// Non-blocking domain helper for monitoring loop use.
pub(crate) fn get_active_browser_domain_nonblocking(
    pid: u32,
    timeout: Duration,
) -> Option<String> {
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let domain = get_active_browser_url(pid).and_then(|url| extract_domain(&url));
        let _ = tx.send(domain);
    });

    match rx.recv_timeout(timeout) {
        Ok(v) => v,
        Err(_) => {
            println!("[Browser URL] Timed out reading URL via accessibility");
            None
        }
    }
}

fn extract_domain(url: &str) -> Option<String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return None;
    }

    let without_scheme = trimmed
        .strip_prefix("https://")
        .or_else(|| trimmed.strip_prefix("http://"))
        .unwrap_or(trimmed);

    let without_www = without_scheme.strip_prefix("www.").unwrap_or(without_scheme);
    let host = without_www
        .split('/')
        .next()
        .unwrap_or("")
        .split('?')
        .next()
        .unwrap_or("")
        .split('#')
        .next()
        .unwrap_or("")
        .trim()
        .to_lowercase();

    if host.is_empty() || !host.contains('.') || host.starts_with('.') || host.ends_with('.') {
        return None;
    }

    Some(host)
}

#[cfg(target_os = "macos")]
mod macos {
    use std::os::raw::c_void;
    use std::process::Command;

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrustedWithOptions(theDict: *const c_void) -> bool;
    }

    pub(super) fn is_accessibility_trusted() -> bool {
        unsafe { AXIsProcessTrustedWithOptions(std::ptr::null()) }
    }

    pub(super) fn get_active_browser_url(pid: u32) -> Option<String> {
        let trusted = is_accessibility_trusted();
        if !trusted {
            println!(
                "[Browser URL] ⚠️ Accessibility permission not granted. \
Enable Flowlocked in System Settings > Privacy & Security > Accessibility."
            );
            return None;
        }

        // Accessibility-based AppleScript lookup for common browser address fields.
        // Keeps browser extension/proxy out of the loop and works with private windows.
        let script = format!(
            r#"
tell application "System Events"
    set targetProc to first application process whose unix id is {pid}
    set candidateDescriptions to {{"Address and search bar", "Search or enter address"}}
    repeat with d in candidateDescriptions
        try
            set v to value of first text field of first UI element of front window of targetProc whose description is (contents of d)
            if v is not missing value and v is not "" then return v
        end try
    end repeat
    try
        set v2 to value of first text field of first UI element of front window of targetProc whose identifier is "WEB_BROWSER_ADDRESS_AND_SEARCH_BAR"
        if v2 is not missing value and v2 is not "" then return v2
    end try
end tell
return ""
"#
        );

        let output = Command::new("osascript").arg("-e").arg(script).output().ok()?;
        if !output.status.success() {
            println!("[Browser URL] ⚠️ Failed reading browser URL via macOS accessibility");
            return None;
        }
        let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if value.is_empty() {
            return None;
        }
        Some(value)
    }
}

#[cfg(target_os = "windows")]
mod windows {
    use uiautomation::controls::ControlType;
    use uiautomation::patterns::UIValuePattern;
    use uiautomation::types::{Handle, TreeScope, UIProperty};
    use uiautomation::variants::Variant;
    use uiautomation::UIAutomation;
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    pub(super) fn get_active_browser_url(pid: u32) -> Option<String> {
        let automation = match UIAutomation::new() {
            Ok(a) => a,
            Err(e) => {
                println!("[Browser URL] ⚠️ UIA init failed: {}", e);
                return None;
            }
        };

        let hwnd = unsafe { GetForegroundWindow() };
        if hwnd.0 == 0 {
            println!("[Browser URL] ⚠️ No foreground window");
            return None;
        }
        let mut fg_pid = 0u32;
        unsafe {
            GetWindowThreadProcessId(hwnd, Some(&mut fg_pid));
        }
        if fg_pid != pid {
            return None;
        }

        let root = match automation.element_from_handle(Handle::from(hwnd)) {
            Ok(el) => el,
            Err(e) => {
                println!("[Browser URL] ⚠️ element_from_handle failed: {}", e);
                return None;
            }
        };

        let names = ["Address and search bar", "Search or enter address"];
        for name in names {
            let type_cond = match automation.create_property_condition(
                UIProperty::ControlType,
                Variant::from(ControlType::Edit as i32),
                None,
            ) {
                Ok(c) => c,
                Err(_) => continue,
            };
            let name_cond = match automation.create_property_condition(
                UIProperty::Name,
                Variant::from(name),
                None,
            ) {
                Ok(c) => c,
                Err(_) => continue,
            };
            let and_cond = match automation.create_and_condition(type_cond, name_cond) {
                Ok(c) => c,
                Err(_) => continue,
            };

            if let Ok(found) = root.find_first(TreeScope::Subtree, &and_cond) {
                if let Ok(pattern) = found.get_pattern::<UIValuePattern>() {
                    if let Ok(value) = pattern.get_value() {
                        let trimmed = value.trim().to_string();
                        if !trimmed.is_empty() {
                            return Some(trimmed);
                        }
                    }
                }
            }
        }

        println!(
            "[Browser URL] ⚠️ Failed reading browser address bar via UI Automation (possibly elevated browser)"
        );
        None
    }
}
