//! Short rolling history of resolved foreground windows. Used to recover the user's
//! actual app/site when Document PiP masks Chrome's active-tab reporting.
use active_win_pos_rs::ActiveWindow;
use std::sync::Mutex;
use std::time::{Duration, Instant};

const MAX_ENTRIES: usize = 32;
/// How far back we'll look for a non-Flowlocked entry when PiP is masking us.
pub const RECENT_WINDOW: Duration = Duration::from_secs(15);

#[derive(Clone)]
pub struct HistEntry {
    pub at: Instant,
    pub win: ActiveWindow,
}

static HISTORY: Mutex<Vec<HistEntry>> = Mutex::new(Vec::new());

pub fn push(win: &ActiveWindow) {
    if let Ok(mut h) = HISTORY.lock() {
        h.push(HistEntry {
            at: Instant::now(),
            win: win.clone(),
        });
        let len = h.len();
        if len > MAX_ENTRIES {
            h.drain(0..len - MAX_ENTRIES);
        }
    }
}

/// Most recent entry within RECENT_WINDOW for which `is_flowlocked_surface(entry)` is false.
pub fn most_recent_non_flowlocked<F: Fn(&ActiveWindow) -> bool>(
    is_flowlocked_surface: F,
) -> Option<HistEntry> {
    let now = Instant::now();
    let h = HISTORY.lock().ok()?;
    h.iter()
        .rev()
        .filter(|e| now.duration_since(e.at) <= RECENT_WINDOW)
        .find(|e| !is_flowlocked_surface(&e.win))
        .cloned()
}

pub fn debug_entry_count() -> usize {
    HISTORY.lock().map(|h| h.len()).unwrap_or(0)
}
