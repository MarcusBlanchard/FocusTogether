//! Derive a foreground classification target from the browser window title when the URL bar is unavailable.

use regex::Regex;
use std::sync::OnceLock;

fn domain_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?i)([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,6}")
            .expect("domain regex")
    })
}

/// OS-reported browser process names (substring match, case-insensitive).
pub fn is_browser_app(app_name: &str) -> bool {
    let n = app_name.to_lowercase();
    [
        "google chrome",
        "chrome",
        "chromium",
        "firefox",
        "mozilla firefox",
        "microsoft edge",
        "msedge",
        "edge",
        "safari",
        "brave browser",
        "brave",
        "opera",
        "vivaldi",
        "arc",
        "tor browser",
        "duckduckgo",
    ]
    .iter()
    .any(|k| n.contains(k))
}

fn strip_browser_title_suffix(title: &str) -> String {
    let mut s = title.trim().to_string();
    let suffixes: &[&str] = &[
        " - Google Chrome",
        " — Mozilla Firefox",
        " - Mozilla Firefox",
        " - Microsoft Edge",
        " - Brave Browser",
        " - Brave",
        " - Chromium",
        " - Opera",
        " - Vivaldi",
        " - Arc",
        " - Safari",
        " - Firefox",
    ];
    for suf in suffixes {
        if let Some(pos) = s.rfind(suf) {
            if pos + suf.len() == s.len() {
                s.truncate(pos);
                break;
            }
        }
    }
    s.trim().to_string()
}

fn should_skip_stripped(stripped: &str) -> bool {
    let t = stripped.trim();
    if t.is_empty() {
        return true;
    }
    let lower = t.to_lowercase();
    if matches!(
        lower.as_str(),
        "new tab"
            | "new tab - google chrome"
            | "start page"
            | "home"
            | "about:blank"
            | "private browsing"
            | "inprivate"
    ) || lower.starts_with("new tab (")
    {
        return true;
    }
    let compact: String = lower.chars().filter(|c| !c.is_whitespace()).collect();
    if compact.contains(".replit.dev")
        || compact.contains(".repl.co")
        || compact.contains("localhost")
        || compact.contains("flowlocked")
        || compact.contains("focustogether")
    {
        return true;
    }
    false
}

fn should_skip_host_token(host: &str) -> bool {
    let compact: String = host.chars().filter(|c| !c.is_whitespace()).collect();
    let lower = compact.to_lowercase();
    lower.contains(".replit.dev")
        || lower.contains(".repl.co")
        || lower.contains("localhost")
        || lower.contains("flowlocked")
        || lower.contains("focustogether")
}

/// Extract `foregroundApp` target from window title (after stripping browser suffix).
/// Returns `None` for empty / new-tab / first-party hosts.
pub fn target_from_window_title(title: &str) -> Option<String> {
    let stripped = strip_browser_title_suffix(title);
    if should_skip_stripped(&stripped) {
        return None;
    }
    let stripped_lower = stripped.to_lowercase();
    if let Some(host) = domain_regex()
        .find_iter(&stripped_lower)
        .map(|m| m.as_str().trim().to_lowercase())
        .filter(|h| !h.is_empty() && !should_skip_host_token(h))
        .max_by_key(|h| h.len())
    {
        return Some(host);
    }
    if should_skip_stripped(&stripped_lower) {
        return None;
    }
    Some(stripped_lower)
}
