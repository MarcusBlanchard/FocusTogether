//! Windows: start at `GetForegroundWindow`, walk `GetWindow(..., GW_HWNDNEXT)` skipping PiP and
//! tool-style chrome windows from the same process as the skipped PiP.

use super::{
    is_flowlocked_pip_title, is_known_browser_app_name, log_skipped_pip,
    log_skipped_suspected_pip_heuristic, VisibleWindowBounds, VisibleWindowReport,
};
use active_win_pos_rs::{ActiveWindow, WindowPosition};
use std::collections::HashSet;
use sysinfo::{Pid, ProcessesToUpdate, System};
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindow, GetWindowLongW, GetWindowRect, GetWindowTextW,
    GetWindowThreadProcessId, IsIconic, IsWindowVisible, GW_HWNDNEXT, GWL_EXSTYLE,
};

const WS_EX_TOOLWINDOW: u32 = 0x0000_0080;
const WS_EX_NOACTIVATE: u32 = 0x0800_0000;

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

pub(super) fn get_active_window_skip_pip_overlay() -> Result<ActiveWindow, ()> {
    let mut hwnd = unsafe { GetForegroundWindow() };
    if hwnd.0 == 0 {
        return Err(());
    }

    let mut pip_owner_pid: Option<u32> = None;
    let mut skipped_pip = false;
    let mut pid_top_z: HashSet<u32> = HashSet::new();

    loop {
        if hwnd.0 == 0 {
            return active_win_pos_rs::get_active_window();
        }

        unsafe {
            if !IsWindowVisible(hwnd).as_bool() {
                hwnd = GetWindow(hwnd, GW_HWNDNEXT);
                continue;
            }
            if IsIconic(hwnd).as_bool() {
                hwnd = GetWindow(hwnd, GW_HWNDNEXT);
                continue;
            }
        }

        let title = window_text(hwnd);
        let mut pid = 0u32;
        unsafe {
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
        }

        let is_top_for_pid = pid_top_z.insert(pid);

        if is_flowlocked_pip_title(&title) {
            pip_owner_pid = Some(pid);
            skipped_pip = true;
            hwnd = unsafe { GetWindow(hwnd, GW_HWNDNEXT) };
            continue;
        }

        if let Some(ppid) = pip_owner_pid {
            let ex = unsafe { GetWindowLongW(hwnd, GWL_EXSTYLE) as u32 };
            if pid == ppid && (ex & WS_EX_TOOLWINDOW != 0 || ex & WS_EX_NOACTIVATE != 0) {
                hwnd = unsafe { GetWindow(hwnd, GW_HWNDNEXT) };
                continue;
            }
        }

        let mut rect = RECT::default();
        unsafe {
            if !GetWindowRect(hwnd, &mut rect).as_bool() {
                hwnd = GetWindow(hwnd, GW_HWNDNEXT);
                continue;
            }
        }

        let (app_name, process_path) = process_info(pid);
        let position = rect_to_position(rect);

        // Race fallback: PiP can appear before `document.title` is set. Skip only the first visible
        // window per PID in Z-order when it is a known browser and unusually small for a main window.
        if is_top_for_pid
            && is_known_browser_app_name(&app_name)
            && position.width <= 800.0
            && position.height <= 600.0
        {
            log_skipped_suspected_pip_heuristic(position.width, position.height, &app_name);
            skipped_pip = true;
            hwnd = unsafe { GetWindow(hwnd, GW_HWNDNEXT) };
            continue;
        }

        if skipped_pip {
            log_skipped_pip(
                &title,
                if app_name.is_empty() {
                    "windows-app"
                } else {
                    app_name.as_str()
                },
            );
        }
        let app_name = if app_name.is_empty() {
            "windows-app".to_string()
        } else {
            app_name
        };

        return Ok(ActiveWindow {
            window_id: format!("{:?}", hwnd),
            process_id: u64::from(pid),
            app_name,
            position,
            title,
            process_path,
        });
    }
}

pub(super) fn get_visible_windows_for_report() -> Vec<VisibleWindowReport> {
    let mut out: Vec<VisibleWindowReport> = Vec::new();
    let mut hwnd = unsafe { GetForegroundWindow() };
    let mut z_index: usize = 0;

    while hwnd.0 != 0 {
        let mut push_next = true;
        let mut rect = RECT::default();
        unsafe {
            if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
                push_next = false;
            }
            if push_next {
                let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
                if ex & WS_EX_TOOLWINDOW != 0 || ex & WS_EX_NOACTIVATE != 0 {
                    push_next = false;
                }
            }
            if push_next && !GetWindowRect(hwnd, &mut rect).as_bool() {
                push_next = false;
            }
        }

        if push_next {
            let title = window_text(hwnd);
            if !is_flowlocked_pip_title(&title) {
                let mut pid = 0u32;
                unsafe {
                    GetWindowThreadProcessId(hwnd, Some(&mut pid));
                }
                let (app_name, _path) = process_info(pid);
                let p = rect_to_position(rect);
                if p.width > 1.0 && p.height > 1.0 {
                    out.push(VisibleWindowReport {
                        app: if app_name.is_empty() {
                            "windows-app".to_string()
                        } else {
                            app_name
                        },
                        title,
                        bounds: VisibleWindowBounds {
                            x: p.x,
                            y: p.y,
                            width: p.width,
                            height: p.height,
                        },
                        z_index,
                        is_on_screen: true,
                        screen_id: None,
                    });
                }
            }
        }

        z_index += 1;
        unsafe {
            hwnd = GetWindow(hwnd, GW_HWNDNEXT);
        }
        if z_index > 1024 {
            break;
        }
    }

    if out.len() > 50 {
        out.sort_by(|a, b| {
            let aa = a.bounds.width * a.bounds.height;
            let bb = b.bounds.width * b.bounds.height;
            bb.partial_cmp(&aa).unwrap_or(std::cmp::Ordering::Equal)
        });
        out.truncate(50);
        out.sort_by_key(|w| w.z_index);
    }

    out
}
