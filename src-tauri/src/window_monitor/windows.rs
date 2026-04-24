//! Windows: walk EnumWindows in Z-order (front-to-back), skipping document PiP overlays.
//! When the user is in a browser, prefer [`GetForegroundWindow`] PID and walk that process's
//! top-level HWNDs so we do not pick `explorer.exe` from under-floating PiP geometry.

use super::{
    is_flowlocked_pip_title, is_known_browser_app_name, log_skipped_pip,
    log_skipped_suspected_pip_heuristic,
};
use active_win_pos_rs::{ActiveWindow, WindowPosition};
use std::collections::HashSet;
use sysinfo::{Pid, ProcessesToUpdate, System};
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, RECT};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetForegroundWindow, GetWindow, GetWindowLongW, GetWindowRect, GetWindowTextW,
    GetWindowThreadProcessId, IsIconic, IsWindowVisible, GW_OWNER, GWL_EXSTYLE,
};

const WS_EX_TOOLWINDOW: u32 = 0x0000_0080;
const WS_EX_NOACTIVATE: u32 = 0x0800_0000;
const WS_EX_TOPMOST: u32 = 0x00000008;

fn window_text(hwnd: HWND) -> String {
    unsafe {
        let mut buf = vec![0u16; 512];
        let n = GetWindowTextW(hwnd, &mut buf);
        String::from_utf16_lossy(&buf[..n as usize])
    }
}

fn process_info(pid: u32) -> (String, std::path::PathBuf) {
    let mut sys = System::new();
    let p = Pid::from_u32(pid);
    let _ = sys.refresh_processes(ProcessesToUpdate::Some(&[p]), true);
    if let Some(proc) = sys.process(p) {
        (
            proc.name().to_string_lossy().into_owned(),
            proc.exe().map(|p| p.to_path_buf()).unwrap_or_default(),
        )
    } else {
        (String::new(), std::path::PathBuf::new())
    }
}

fn rect_to_position(r: RECT) -> WindowPosition {
    WindowPosition {
        x: r.left as f64,
        y: r.top as f64,
        width: (r.right - r.left) as f64,
        height: (r.bottom - r.top) as f64,
    }
}

fn enum_top_level_z_order() -> Vec<HWND> {
    let mut z_windows: Vec<HWND> = Vec::new();
    unsafe extern "system" fn enum_windows_cb(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let out = lparam.0 as *mut Vec<HWND>;
        if out.is_null() {
            return BOOL(0);
        }
        (*out).push(hwnd);
        BOOL(1)
    }
    let _ = unsafe {
        EnumWindows(
            Some(enum_windows_cb),
            LPARAM((&mut z_windows as *mut Vec<HWND>) as isize),
        )
    };
    z_windows
}

/// Titles used by the Flowlocked web app / document PiP surface (not the literal "Flowlocked PiP" string).
fn flowlocked_document_surface_hint(title: &str) -> bool {
    let t = title.trim().to_lowercase();
    (t.contains("flowlocked") || t.contains("focustogether"))
        && (t.contains("focus")
            || t.contains("accountability")
            || t.contains("pip")
            || t.contains("replit"))
}

/// Narrow skip: do **not** treat "small browser window" alone as PiP (that hid real Chrome and led to
/// `explorer.exe` picks). Require explicit PiP markers or topmost + Flowlocked-ish small window.
fn skip_windows_browser_document_pip(
    hwnd: HWND,
    title: &str,
    app_name: &str,
    width: f64,
    height: f64,
    is_first_visible_for_pid: bool,
) -> bool {
    if is_flowlocked_pip_title(title) {
        return true;
    }
    if !is_known_browser_app_name(app_name) || !is_first_visible_for_pid {
        return false;
    }
    if width > 800.0 || height > 600.0 {
        return false;
    }
    let ex = unsafe { GetWindowLongW(hwnd, GWL_EXSTYLE) as u32 };
    let topmost = (ex & WS_EX_TOPMOST) != 0;
    topmost && flowlocked_document_surface_hint(title)
}

fn is_bogus_empty_explorer(app: &str, title: &str) -> bool {
    let a = app.trim().to_lowercase();
    let stem = a.trim_end_matches(".exe");
    stem == "explorer" && title.trim().is_empty()
}

/// Voice/dictation apps that register a tiny always-on-top HWND above the real focused app.
/// macOS drops these via `kCGWindowLayer != 0`; Windows EnumWindows includes them—skip so Z-order
/// resolves to the underlying browser/game (e.g. Wispr Flow vs Minecraft).
fn is_skippable_global_input_overlay(app_name: &str) -> bool {
    let s = app_name.trim().to_lowercase();
    let stem = s.trim_end_matches(".exe");
    matches!(stem, "wispr flow" | "wisprflow")
}

fn log_skipped_input_overlay(app_name: &str, title: &str) {
    let line = format!(
        "[window-monitor] skipped input-overlay app={} title_prefix={:?}",
        app_name,
        title.chars().take(48).collect::<String>()
    );
    println!("{}", line);
    crate::diagnostic_log::append_line(&line);
}

/// Tauri orange distraction popup: same binary as desktop (`Flowlocked.exe`) but must not win Z-order
/// or detection treats it as "user returned to Flowlocked" and dismisses the warning in a tight loop.
fn is_flowlocked_distraction_warning_window(app_name: &str, title: &str) -> bool {
    let s = app_name.trim().to_lowercase();
    let stem = s.trim_end_matches(".exe");
    stem == "flowlocked" && title.trim().eq_ignore_ascii_case("Distraction Warning")
}

fn log_skipped_distraction_warning_popup(app_name: &str, title: &str) {
    let line = format!(
        "[window-monitor] skipped distraction-warning popup app={} title_prefix={:?}",
        app_name,
        title.chars().take(48).collect::<String>()
    );
    println!("{}", line);
    crate::diagnostic_log::append_line(&line);
}

fn pip_resolve_log(pass: &str, detail: &str) {
    let line = format!("[window_monitor] pip_resolve pass={} {}", pass, detail);
    println!("{}", line);
    crate::diagnostic_log::append_line(&line);
}

fn is_foreground_flowlocked_document_pip_surface(hwnd: HWND, title: &str, app_name: &str) -> bool {
    if !is_known_browser_app_name(app_name) {
        return false;
    }
    let mut rect = RECT::default();
    unsafe {
        if !GetWindowRect(hwnd, &mut rect).as_bool() {
            return false;
        }
    }
    let pos = rect_to_position(rect);
    // Foreground HWND path mirrors the same browser-doc PiP heuristic used in Z-order walking.
    skip_windows_browser_document_pip(hwnd, title, app_name, pos.width, pos.height, true)
}

/// `pid_filter` `None` = consider all processes (desktop shell allowed except bogus explorer pick).
fn walk_z_order_pick(
    z_windows: &[HWND],
    pid_filter: Option<u32>,
) -> Option<(ActiveWindow, bool)> {
    let mut pip_owner_pid: Option<u32> = None;
    let mut skipped_pip_title: Option<String> = None;
    let mut saw_pip = false;
    let mut pid_top_z: HashSet<u32> = HashSet::new();

    for &hwnd in z_windows {
        if hwnd.0 == 0 {
            continue;
        }

        unsafe {
            if !IsWindowVisible(hwnd).as_bool() {
                continue;
            }
            if IsIconic(hwnd).as_bool() {
                continue;
            }
            if GetWindow(hwnd, GW_OWNER).0 != 0 {
                continue;
            }
        }

        let mut cloaked: u32 = 0;
        let cloaked_ok = unsafe {
            DwmGetWindowAttribute(
                hwnd,
                DWMWA_CLOAKED,
                (&mut cloaked as *mut u32).cast(),
                std::mem::size_of::<u32>() as u32,
            )
        };
        if cloaked_ok.is_ok() && cloaked != 0 {
            continue;
        }

        let mut pid = 0u32;
        unsafe {
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
        }
        if let Some(only) = pid_filter {
            if pid != only {
                continue;
            }
        }

        let is_top_for_pid = pid_top_z.insert(pid);
        let title = window_text(hwnd);

        if is_flowlocked_pip_title(&title) {
            pip_owner_pid = Some(pid);
            saw_pip = true;
            if skipped_pip_title.is_none() {
                skipped_pip_title = Some(title.clone());
            }
            continue;
        }

        if let Some(ppid) = pip_owner_pid {
            let ex = unsafe { GetWindowLongW(hwnd, GWL_EXSTYLE) as u32 };
            if pid == ppid && (ex & WS_EX_TOOLWINDOW != 0 || ex & WS_EX_NOACTIVATE != 0) {
                continue;
            }
        }

        let mut rect = RECT::default();
        unsafe {
            if !GetWindowRect(hwnd, &mut rect).as_bool() {
                continue;
            }
        }

        let (app_name_raw, process_path) = process_info(pid);
        let position = rect_to_position(rect);

        if skip_windows_browser_document_pip(
            hwnd,
            &title,
            &app_name_raw,
            position.width,
            position.height,
            is_top_for_pid,
        ) {
            log_skipped_suspected_pip_heuristic(position.width, position.height, &app_name_raw);
            saw_pip = true;
            if skipped_pip_title.is_none() {
                skipped_pip_title = Some(title.clone());
            }
            continue;
        }

        if is_skippable_global_input_overlay(&app_name_raw) {
            log_skipped_input_overlay(&app_name_raw, &title);
            continue;
        }

        if is_flowlocked_distraction_warning_window(&app_name_raw, &title) {
            log_skipped_distraction_warning_popup(&app_name_raw, &title);
            continue;
        }

        let app_name = if app_name_raw.is_empty() {
            "windows-app".to_string()
        } else {
            app_name_raw
        };

        if is_bogus_empty_explorer(&app_name, &title) {
            continue;
        }

        if let Some(skipped) = skipped_pip_title.as_deref() {
            log_skipped_pip(
                skipped,
                &title,
                if app_name.is_empty() {
                    "windows-app"
                } else {
                    app_name.as_str()
                },
            );
        }

        let resolved = ActiveWindow {
            window_id: format!("{:?}", hwnd),
            process_id: u64::from(pid),
            app_name,
            position,
            title,
            process_path,
        };
        return Some((resolved, saw_pip));
    }
    None
}

pub(super) fn get_active_window_skip_pip_overlay() -> Result<ActiveWindow, ()> {
    let z_windows = enum_top_level_z_order();
    if z_windows.is_empty() {
        super::mark_pip_seen(false);
        return active_win_pos_rs::get_active_window().map(super::finalize_with_history);
    }

    let fg = unsafe { GetForegroundWindow() };
    if fg.0 != 0 {
        let mut fg_pid = 0u32;
        unsafe {
            GetWindowThreadProcessId(fg, Some(&mut fg_pid));
        }
        let fg_title = window_text(fg);
        let (fg_app, _) = process_info(fg_pid);
        let fg_is_flowlocked_pip =
            is_flowlocked_pip_title(&fg_title)
                || is_foreground_flowlocked_document_pip_surface(fg, &fg_title, &fg_app);
        if is_known_browser_app_name(&fg_app) && !fg_is_flowlocked_pip {
            if let Some((win, saw_pip)) = walk_z_order_pick(&z_windows, Some(fg_pid)) {
                pip_resolve_log(
                    "foreground_browser_pid",
                    &format!(
                        "fg_pid={} picked_app={:?} title_prefix={:?} saw_pip={}",
                        fg_pid,
                        win.app_name,
                        win.title.chars().take(48).collect::<String>(),
                        saw_pip
                    ),
                );
                super::mark_pip_seen(saw_pip);
                return Ok(super::finalize_with_history(win));
            }
        } else if is_known_browser_app_name(&fg_app) && fg_is_flowlocked_pip {
            pip_resolve_log(
                "foreground_browser_pid_skip",
                &format!(
                    "fg_pid={} reason=flowlocked_pip_title title_prefix={:?}",
                    fg_pid,
                    fg_title.chars().take(48).collect::<String>()
                ),
            );
        }
    }

    if let Some((win, saw_pip)) = walk_z_order_pick(&z_windows, None) {
        pip_resolve_log(
            "global_zorder",
            &format!(
                "picked_pid={} picked_app={:?} title_prefix={:?} saw_pip={}",
                win.process_id,
                win.app_name,
                win.title.chars().take(48).collect::<String>(),
                saw_pip
            ),
        );
        super::mark_pip_seen(saw_pip);
        return Ok(super::finalize_with_history(win));
    }

    super::mark_pip_seen(false);
    pip_resolve_log("fallback_active_win_pos_rs", "z_order_pick_exhausted");
    match active_win_pos_rs::get_active_window() {
        Ok(w) if !is_bogus_empty_explorer(&w.app_name, &w.title) => {
            Ok(super::finalize_with_history(w))
        }
        _ => Err(()),
    }
}
