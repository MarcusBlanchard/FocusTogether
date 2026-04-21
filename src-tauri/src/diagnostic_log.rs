//! Timestamped lines to Desktop `focustogether-live.log` (same file as `log!`) so deeplink/GUI
//! launches capture window-monitor and detection output, not only Terminal sessions.

use chrono::Local;
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

const LIVE_LOG_MAX_BYTES: u64 = 512 * 1024;

static LOG_FILE: OnceLock<Mutex<std::fs::File>> = OnceLock::new();

pub fn init() {
    let log_path = dirs::desktop_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join("focustogether-live.log");
    if let Ok(meta) = std::fs::metadata(&log_path) {
        if meta.len() > LIVE_LOG_MAX_BYTES {
            let rotated = log_path.with_extension("log.old");
            let _ = std::fs::rename(&log_path, &rotated);
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

fn with_file<F: FnOnce(&mut std::fs::File)>(f: F) {
    let Some(m) = LOG_FILE.get() else {
        return;
    };
    if let Ok(mut g) = m.lock() {
        f(&mut *g);
    }
}

/// Append one line with a local timestamp prefix (no stdout). Safe if `init` was not called.
pub fn append_line(msg: impl AsRef<str>) {
    let timestamp = Local::now().format("%H:%M:%S%.3f");
    let line = format!("[{}] {}", timestamp, msg.as_ref());
    with_file(|f| {
        let _ = writeln!(f, "{}", line);
        let _ = f.flush();
    });
}

/// Print to stdout and append the same timestamped line to the log file.
pub fn emit_console_and_file(msg: impl std::fmt::Display) {
    let timestamp = Local::now().format("%H:%M:%S%.3f");
    let body = format!("{}", msg);
    let line = format!("[{}] {}", timestamp, body);
    println!("{}", line);
    with_file(|f| {
        let _ = writeln!(f, "{}", line);
        let _ = f.flush();
    });
}
