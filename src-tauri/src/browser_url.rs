use std::sync::mpsc;
use std::time::Duration;
use crate::window_monitor::is_flowlocked_pip_title;

/// Returns the full active browser URL for the provided process id.
/// On macOS, pass `browser_app_name` from the active window (e.g. "Google Chrome") so we can use each browser's AppleScript URL API.
pub fn get_active_browser_url(pid: u32, browser_app_name: Option<&str>) -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        return macos::get_active_browser_url(pid, browser_app_name.unwrap_or(""));
    }

    #[cfg(target_os = "windows")]
    {
        let _ = browser_app_name;
        return windows::get_active_browser_url(pid);
    }

    #[allow(unreachable_code)]
    None
}

/// Returns the active browser tab/window title for the provided process id.
pub(crate) fn get_active_browser_window_title(
    pid: u32,
    browser_app_name: Option<&str>,
) -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        return macos::get_active_browser_window_title(pid, browser_app_name.unwrap_or(""));
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
    browser_app_name: Option<&str>,
) -> Option<String> {
    let hint = browser_app_name.map(|s| s.to_string());
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let domain = get_active_browser_url(pid, hint.as_deref())
            .and_then(|url| extract_domain(&url));
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

/// Non-blocking browser title helper for monitoring loop use.
pub(crate) fn get_active_browser_window_title_nonblocking(
    pid: u32,
    timeout: Duration,
    browser_app_name: Option<&str>,
) -> Option<String> {
    let hint = browser_app_name.map(|s| s.to_string());
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let title = get_active_browser_window_title(pid, hint.as_deref()).and_then(|t| {
            if is_flowlocked_pip_title(&t) {
                println!("[Browser Title] Dropped PiP title from nonblocking recovery path");
                None
            } else {
                Some(t)
            }
        });
        let _ = tx.send(title);
    });

    match rx.recv_timeout(timeout) {
        Ok(v) => v,
        Err(_) => {
            println!("[Browser Title] Timed out reading browser window title");
            None
        }
    }
}

/// When the address bar cannot be read (permissions, timeout), infer a site from the
/// window title. Browsers are neutral in `app-categorizer` unless we send a hostname.
pub(crate) fn infer_site_from_window_title(title: &str) -> Option<String> {
    let t = title.trim();
    if t.is_empty() {
        return None;
    }
    let lower = t.to_lowercase();
    // Avoid classifying our own desktop log or similar paths as a "site" (server may treat hostnames as distracting).
    if lower.contains("focustogether-live.log")
        || (lower.contains("focustogether-live") && lower.contains(".log"))
        || (lower.contains("focustogether") && lower.ends_with(".log"))
    {
        return None;
    }

    // YouTube — tab titles vary by browser/locale; Safari often omits " - YouTube".
    if lower.contains("youtube.com")
        || lower.contains("youtu.be")
        || lower.contains("music.youtube.com")
        || lower.ends_with(" - youtube")
        || lower.ends_with(" — youtube")
        || lower.contains(" | youtube")
        || lower == "youtube"
        || lower.starts_with("youtube ")
    {
        return Some("youtube.com".to_string());
    }

    if lower.contains("netflix.com") || lower.ends_with(" - netflix") {
        return Some("netflix.com".to_string());
    }
    if lower.contains("twitch.tv") || lower.ends_with(" - twitch") {
        return Some("twitch.tv".to_string());
    }
    if lower.contains("reddit.com") || lower.ends_with(" - reddit") {
        return Some("reddit.com".to_string());
    }
    if lower.contains("facebook.com") || lower.contains("fb.com") {
        return Some("facebook.com".to_string());
    }
    if lower.contains("instagram.com") {
        return Some("instagram.com".to_string());
    }
    if lower.contains("tiktok.com") {
        return Some("tiktok.com".to_string());
    }
    if lower.contains("twitter.com") || lower.contains("x.com") {
        return Some("twitter.com".to_string());
    }

    // Geometry Dash demon lists / level databases (titles often omit full URL).
    if lower.contains("pointercrate.com") || lower.contains("pointercrate") {
        return Some("pointercrate.com".to_string());
    }
    if lower.contains("aredl.net") || lower.contains("aredl") {
        return Some("aredl.net".to_string());
    }

    None
}

/// Best-effort: find a hostname-like token in the window title when the address bar is unreadable.
pub(crate) fn host_hint_from_title(title: &str) -> Option<String> {
    for raw in title.split(|c: char| {
        c.is_whitespace() || "|/\\()[]{}\"'«»•·–—".contains(c)
    }) {
        let s = raw.trim().trim_end_matches('.');
        if s.len() < 4 || !s.contains('.') || s.contains('@') {
            continue;
        }
        let cand = s.trim_start_matches("www.");
        if let Some(host) = extract_domain(&format!("https://{}", cand)) {
            // Skip common non-site tokens
            if host.ends_with(".js") || host.ends_with(".css") || host.ends_with(".png") {
                continue;
            }
            return Some(host);
        }
    }
    None
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
    use crate::window_monitor::is_flowlocked_pip_title;
    use std::os::raw::c_void;
    use std::process::Command;

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrustedWithOptions(theDict: *const c_void) -> bool;
    }

    pub(super) fn is_accessibility_trusted() -> bool {
        unsafe { AXIsProcessTrustedWithOptions(std::ptr::null()) }
    }

    /// Chromium-style URL via AppleScript (Chrome, Brave, Edge, Vivaldi, Opera, Arc).
    fn script_chromium_like(app_bundle_name: &str) -> String {
        format!(
            r#"
tell application "{app_bundle_name}"
    if (count of windows) > 0 then
        return URL of active tab of front window
    end if
end tell
return ""
"#,
            app_bundle_name = app_bundle_name
        )
    }

    fn script_safari() -> &'static str {
        r#"
tell application "Safari"
    if (count of windows) > 0 then
        return URL of front document
    end if
end tell
return ""
"#
    }

    /// Chromium-style active-tab title.
    fn script_chromium_like_title(app_bundle_name: &str) -> String {
        format!(
            r#"
tell application "{app_bundle_name}"
    if (count of windows) > 0 then
        return title of active tab of front window
    end if
end tell
return ""
"#,
            app_bundle_name = app_bundle_name
        )
    }

    fn script_safari_title() -> &'static str {
        r#"
tell application "Safari"
    if (count of windows) > 0 then
        return name of front document
    end if
end tell
return ""
"#
    }

    /// Try each browser's native AppleScript — reads the real tab URL (incognito too). Uses
    /// Automation permission for that browser (System Settings → Privacy & Security → Automation).
    fn try_native_browser_url(app_name: &str) -> Option<String> {
        let l = app_name.to_lowercase();
        let script: String = if l.contains("safari") && !l.contains("technology") {
            script_safari().to_string()
        } else if l.contains("chromium") {
            script_chromium_like("Chromium")
        } else if l.contains("google chrome") || l == "chrome" {
            script_chromium_like("Google Chrome")
        } else if l.contains("brave") {
            script_chromium_like("Brave Browser")
        } else if l.contains("microsoft edge") || l == "edge" {
            script_chromium_like("Microsoft Edge")
        } else if l.contains("vivaldi") {
            script_chromium_like("Vivaldi")
        } else if l.contains("opera") {
            script_chromium_like("Opera")
        } else if l.contains("arc") {
            script_chromium_like("Arc")
        } else if l.contains("chrome") {
            script_chromium_like("Google Chrome")
        } else {
            return None;
        };

        let output = Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .output()
            .ok()?;
        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            if err.contains("not allowed") || err.contains("(-1743)") {
                println!(
                    "[Browser URL] Browser AppleScript blocked — allow Flowlocked under \
System Settings → Privacy & Security → Automation to control this browser (or use Accessibility below)."
                );
            } else if !err.trim().is_empty() {
                println!("[Browser URL] AppleScript stderr: {}", err.trim());
            }
            return None;
        }
        let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if value.is_empty() {
            None
        } else {
            Some(value)
        }
    }

    fn try_native_browser_title(app_name: &str) -> Option<String> {
        let l = app_name.to_lowercase();
        let script: String = if l.contains("safari") && !l.contains("technology") {
            script_safari_title().to_string()
        } else if l.contains("chromium") {
            script_chromium_like_title("Chromium")
        } else if l.contains("google chrome") || l == "chrome" {
            script_chromium_like_title("Google Chrome")
        } else if l.contains("brave") {
            script_chromium_like_title("Brave Browser")
        } else if l.contains("microsoft edge") || l == "edge" {
            script_chromium_like_title("Microsoft Edge")
        } else if l.contains("vivaldi") {
            script_chromium_like_title("Vivaldi")
        } else if l.contains("opera") {
            script_chromium_like_title("Opera")
        } else if l.contains("arc") {
            script_chromium_like_title("Arc")
        } else if l.contains("chrome") {
            script_chromium_like_title("Google Chrome")
        } else {
            return None;
        };

        let output = Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .output()
            .ok()?;
        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            if !err.trim().is_empty() {
                println!("[Browser Title] AppleScript stderr: {}", err.trim());
            }
            return None;
        }
        let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if value.is_empty() {
            None
        } else {
            Some(value)
        }
    }

    /// System Events UI tree — needs Accessibility for Flowlocked (not Automation).
    fn try_system_events_address_bar(pid: u32) -> Option<String> {
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
"#,
            pid = pid
        );

        let output = Command::new("osascript").arg("-e").arg(script).output().ok()?;
        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            if !err.trim().is_empty() {
                println!("[Browser URL] System Events stderr: {}", err.trim());
            }
            return None;
        }
        let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if value.is_empty() {
            None
        } else {
            Some(value)
        }
    }

    fn try_system_events_window_titles(pid: u32) -> Vec<String> {
        let script = format!(
            r#"
tell application "System Events"
    set targetProc to first application process whose unix id is {pid}
    set names to {{}}
    repeat with w in windows of targetProc
        try
            set wn to name of w
            if wn is not missing value and wn is not "" then set end of names to wn
        end try
    end repeat
    set AppleScript's text item delimiters to linefeed
    return names as text
end tell
return ""
"#,
            pid = pid
        );

        let output = match Command::new("osascript").arg("-e").arg(script).output() {
            Ok(o) => o,
            Err(_) => return Vec::new(),
        };
        if !output.status.success() {
            return Vec::new();
        }
        let raw = String::from_utf8_lossy(&output.stdout).to_string();
        raw.lines()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect()
    }

    fn is_likely_extension_popup_title(title: &str) -> bool {
        let t = title.trim();
        if t.is_empty() || t.len() > 64 {
            return false;
        }
        let lower = t.to_lowercase();
        if lower.contains("google chrome")
            || lower.contains("flowlocked")
            || lower.contains("focus & accountability")
            || lower == "new tab"
            || lower == "extensions"
        {
            return false;
        }
        if t.contains('/') || t.contains('.') || t.contains(" - ") || t.contains(" — ") {
            return false;
        }
        true
    }

    fn is_unhelpful_browser_front_title(title: &str) -> bool {
        let t = title.trim().to_lowercase();
        t.is_empty()
            || t == "google chrome"
            || t.contains("flowlocked")
            || t.contains("replit")
            || t.contains("server/downloads/")
    }

    fn is_likely_popup_text_title(text: &str) -> bool {
        let t = text.trim();
        if t.len() < 4 || t.len() > 48 {
            return false;
        }
        let lower = t.to_lowercase();
        let generic = [
            "audio",
            "fullscreen",
            "fast mode",
            "play",
            "notes",
            "settings",
        ];
        if generic.contains(&lower.as_str()) {
            return false;
        }
        if lower.contains("flowlocked")
            || lower.contains("google chrome")
            || lower.contains("tiny tycoon")
            || lower.contains("available on google chrome")
        {
            return false;
        }
        if t.contains('/') || t.contains('.') || t.contains("://") || t.contains(" - ") {
            return false;
        }
        // Prefer short title-like labels with letters (e.g. "Boxel Rebound").
        t.chars().any(|c| c.is_ascii_alphabetic())
    }

    fn try_system_events_popup_text_title(pid: u32) -> Option<String> {
        let script = format!(
            r#"
tell application "System Events"
    set targetProc to first application process whose unix id is {pid}
    set vals to {{}}
    try
        repeat with e in (entire contents of front window of targetProc)
            try
                if class of e is static text then
                    set v to value of e
                    if v is not missing value and v is not "" then set end of vals to (v as text)
                end if
            end try
            if (count of vals) >= 40 then exit repeat
        end repeat
    end try
    set AppleScript's text item delimiters to linefeed
    return vals as text
end tell
return ""
"#,
            pid = pid
        );
        let output = Command::new("osascript").arg("-e").arg(script).output().ok()?;
        if !output.status.success() {
            return None;
        }
        let raw = String::from_utf8_lossy(&output.stdout).to_string();
        for line in raw.lines() {
            let candidate = line.trim();
            if is_likely_popup_text_title(candidate) {
                println!(
                    "[Browser Title] Using popup static-text title candidate: {:?}",
                    candidate
                );
                return Some(candidate.to_string());
            }
        }
        None
    }

    pub(super) fn get_active_browser_url(pid: u32, app_name: &str) -> Option<String> {
        // 1) Native browser URL — best for Chrome/Safari; does not require Accessibility (needs Automation for that browser).
        if let Some(url) = try_native_browser_url(app_name) {
            println!("[Browser URL] Resolved URL via browser AppleScript");
            return Some(url);
        }

        // 2) UI Automation via System Events — requires Accessibility for Flowlocked.
        if !is_accessibility_trusted() {
            println!(
                "[Browser URL] ⚠️ Accessibility not granted for UI-based address bar read. \
Enable Flowlocked in System Settings → Privacy & Security → Accessibility. \
If YouTube still fails: also enable Automation for Flowlocked on your browser (Chrome/Safari) under the same Privacy section."
            );
            return None;
        }

        if let Some(url) = try_system_events_address_bar(pid) {
            println!("[Browser URL] Resolved URL via System Events / address bar");
            return Some(url);
        }

        println!("[Browser URL] ⚠️ Could not read browser URL — enable Automation (browser) and/or Accessibility (Flowlocked)");
        None
    }

    pub(super) fn get_active_browser_window_title(pid: u32, app_name: &str) -> Option<String> {
        // Prefer System Events for the true foreground window title. This captures extension
        // popup/panel windows that browser-native "active tab" APIs can miss.
        if is_accessibility_trusted() {
            // System Events returns windows front-to-back. Skip PiP overlays and choose the first
            // non-PiP candidate; if every window is PiP, treat title recovery as unavailable.
            let all_titles = try_system_events_window_titles(pid);
            let mut non_pip_titles: Vec<String> = Vec::new();
            let mut saw_pip = false;
            for candidate in all_titles {
                if is_flowlocked_pip_title(&candidate) {
                    saw_pip = true;
                    continue;
                }
                non_pip_titles.push(candidate);
            }
            if non_pip_titles.is_empty() && saw_pip {
                println!("[Browser Title] All AX/System Events window titles matched PiP; returning None");
                return None;
            }

            let front_title = non_pip_titles.first().cloned();
            if let Some(ref front) = front_title {
                if is_unhelpful_browser_front_title(front) {
                    if let Some(popup_title) = try_system_events_popup_text_title(pid) {
                        if is_flowlocked_pip_title(&popup_title) {
                            return None;
                        }
                        return Some(popup_title);
                    }
                }
                for candidate in &non_pip_titles {
                    if candidate == front {
                        continue;
                    }
                    if is_likely_extension_popup_title(candidate) {
                        println!(
                            "[Browser Title] Using likely extension popup title: {:?} (front={:?})",
                            candidate, front
                        );
                        return Some(candidate.clone());
                    }
                }
            }
            if let Some(title) = front_title {
                if is_flowlocked_pip_title(&title) {
                    return None;
                }
                return Some(title);
            }
        }

        // Fallback to browser-native active-tab title when System Events is unavailable.
        try_native_browser_title(app_name)
    }
}

#[cfg(target_os = "windows")]
mod windows {
    use uiautomation::controls::ControlType;
    use uiautomation::patterns::UIValuePattern;
    use uiautomation::types::{Handle, TreeScope, UIProperty};
    use uiautomation::variants::Variant;
    use uiautomation::{UIElement, UIAutomation};
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    fn read_edit_value(
        automation: &UIAutomation,
        root: &UIElement,
        property: UIProperty,
        needle: &str,
    ) -> Option<String> {
        let type_cond = automation
            .create_property_condition(
                UIProperty::ControlType,
                Variant::from(ControlType::Edit as i32),
                None,
            )
            .ok()?;
        let prop_cond = automation
            .create_property_condition(property, Variant::from(needle), None)
            .ok()?;
        let and_cond = automation.create_and_condition(type_cond, prop_cond).ok()?;
        let found = root.find_first(TreeScope::Subtree, &and_cond).ok()?;
        let pattern = found.get_pattern::<UIValuePattern>().ok()?;
        let value = pattern.get_value().ok()?;
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    }

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

        let name_candidates = [
            "Address and search bar",
            "Search or enter address",
            "Address bar",
            "Address field",
        ];
        for candidate in name_candidates {
            if let Some(url) = read_edit_value(&automation, &root, UIProperty::Name, candidate) {
                return Some(url);
            }
        }
        let automation_id_candidates = [
            "address and search bar",
            "search-or-enter-address",
            "urlbar-input",
            "addressEditBox",
        ];
        for candidate in automation_id_candidates {
            if let Some(url) =
                read_edit_value(&automation, &root, UIProperty::AutomationId, candidate)
            {
                return Some(url);
            }
        }

        println!(
            "[Browser URL] ⚠️ Failed reading browser address bar via UI Automation (possibly elevated browser)"
        );
        None
    }
}
