//! Windows: walk EnumWindows in Z-order (front-to-back), skipping PiP and tool-style
//! chrome windows from the same process as the skipped PiP.

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
    EnumWindows, GetWindow, GetWindowLongW, GetWindowRect, GetWindowTextW, GetWindowThreadProcessId,
    IsIconic, IsWindowVisible, GW_OWNER, GWL_EXSTYLE,
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
    let mut z_windows: Vec<HWND> = Vec::new();
    unsafe extern "system" fn enum_windows_cb(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let out = lparam.0 as *mut Vec<HWND>;
        if out.is_null() {
            return BOOL(0);
        }
        (*out).push(hwnd);
        BOOL(1)
    }
    let ok = unsafe {
        EnumWindows(
            Some(enum_windows_cb),
            LPARAM((&mut z_windows as *mut Vec<HWND>) as isize),
        )
    };
    if !ok.as_bool() || z_windows.is_empty() {
        return active_win_pos_rs::get_active_window();
    }

    let mut pip_owner_pid: Option<u32> = None;
    let mut skipped_pip_title: Option<String> = None;
    let mut pid_top_z: HashSet<u32> = HashSet::new();

    for hwnd in z_windows {
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

        let title = window_text(hwnd);
        let mut pid = 0u32;
        unsafe {
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
        }

        let is_top_for_pid = pid_top_z.insert(pid);

        if is_flowlocked_pip_title(&title) {
            pip_owner_pid = Some(pid);
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
            if skipped_pip_title.is_none() {
                skipped_pip_title = Some(title.clone());
            }
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
    active_win_pos_rs::get_active_window()
}
