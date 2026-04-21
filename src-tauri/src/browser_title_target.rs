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
    // Steam (and helpers) embed Chromium/CEF but are not general-purpose browsers for distraction rules.
    if n.contains("steam") {
        return false;
    }
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
    if lower.contains(".replit.dev")
        || lower.contains(".repl.co")
        || lower.contains("localhost")
        || lower.contains("flowlocked")
        || lower.contains("focustogether")
    {
        return true;
    }
    if last_label_is_file_extension(&lower) {
        return true;
    }
    false
}
/// Page titles on code-hosting / docs sites contain tokens like `README.md`,
/// `Cargo.toml`, `main.rs`, `package.json`, `index.html` that the domain regex
/// happily picks up because their extensions look like 2–6 letter TLDs.
/// Treat any token whose final label is a known source/asset/document file
/// extension as a filename rather than a hostname so we never feed it to the
/// distraction classifier (which would then briefly flag pages on GitHub,
/// GitLab, npm, docs sites, etc., causing the orange popup to flicker).
pub fn last_label_is_file_extension(host: &str) -> bool {
    let trimmed = host.trim().trim_end_matches('.').to_lowercase();
    let Some(idx) = trimmed.rfind('.') else {
        return false;
    };
    let ext = &trimmed[idx + 1..];
    if ext.is_empty() {
        return false;
    }
    matches!(
        ext,
        // Source code
        "rs" | "go" | "py" | "rb" | "java" | "kt" | "kts" | "swift"
        | "c" | "h" | "cc" | "cpp" | "cxx" | "hpp" | "hh" | "hxx"
        | "cs" | "fs" | "fsx" | "vb" | "scala" | "clj" | "cljs" | "ex" | "exs"
        | "erl" | "hrl" | "elm" | "ml" | "mli" | "lua" | "pl" | "pm" | "php"
        | "phtml" | "ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs" | "vue" | "svelte"
        | "dart" | "r" | "jl" | "groovy" | "gradle" | "nim" | "zig" | "v" | "sol"
        | "asm" | "s"
        // Markup / config / data
        | "md" | "mdx" | "rst" | "adoc" | "txt" | "rtf" | "tex"
        | "html" | "htm" | "xhtml" | "xml" | "xsl" | "xslt" | "svg"
        | "json" | "json5" | "jsonc" | "yaml" | "yml" | "toml" | "ini" | "cfg" | "conf"
        | "csv" | "tsv" | "env" | "lock" | "log" | "sum" | "mod" | "props"
        | "css" | "scss" | "sass" | "less" | "styl"
        // Shell / build
        | "sh" | "bash" | "zsh" | "fish" | "bat" | "cmd" | "ps1"
        | "make" | "mk" | "ninja" | "cmake" | "dockerfile"
        // Documents / images / media / archives / binaries
        | "pdf" | "doc" | "docx" | "ppt" | "pptx" | "xls" | "xlsx" | "odt" | "ods" | "odp"
        | "png" | "jpg" | "jpeg" | "gif" | "bmp" | "ico" | "webp" | "tif" | "tiff" | "psd" | "ai"
        | "mp3" | "wav" | "ogg" | "flac" | "m4a" | "aac" | "opus"
        | "mp4" | "mkv" | "mov" | "avi" | "webm" | "wmv" | "flv" | "m4v"
        | "zip" | "tar" | "gz" | "bz2" | "xz" | "7z" | "rar" | "tgz" | "tbz" | "txz"
        | "iso" | "dmg" | "pkg" | "deb" | "rpm" | "msi" | "exe" | "app" | "apk" | "ipa"
        | "bin" | "dll" | "so" | "dylib" | "o" | "a" | "lib" | "obj" | "class" | "jar" | "war"
        | "db" | "sqlite" | "sqlite3" | "bak" | "tmp" | "swp"
        | "ttf" | "otf" | "woff" | "woff2" | "eot"
    )
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
