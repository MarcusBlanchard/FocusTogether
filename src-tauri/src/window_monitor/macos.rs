//! macOS: walk `CGWindowListCopyWindowInfo` in front-to-back order for the frontmost app PID,
//! skipping `Flowlocked PiP` and non–normal-layer windows where applicable.

use super::{
    is_flowlocked_pip_title, is_known_browser_app_name, log_skipped_pip,
    log_skipped_suspected_pip_heuristic,
};
use active_win_pos_rs::{ActiveWindow, WindowPosition};
use cocoa::base::id;
use core_foundation::base::{CFGetTypeID, TCFType, ToVoid};
use core_foundation::boolean::CFBooleanGetTypeID;
use core_foundation::dictionary::CFDictionaryGetTypeID;
use core_foundation::number::{
    CFBooleanGetValue, CFNumberGetType, CFNumberGetTypeID, CFNumberGetValue, CFNumberRef,
    CFNumberType,
};
use core_foundation::string::{CFString, CFStringGetTypeID};
use core_graphics::geometry::CGRect;
use core_graphics::window::{
    copy_window_info, kCGWindowListExcludeDesktopElements, kCGWindowListOptionOnScreenOnly,
    kCGNullWindowID,
};
use core_graphics::display::{
    CFArrayGetCount, CFArrayGetValueAtIndex, CFDictionaryGetValueIfPresent, CFDictionaryRef,
};
use objc::{class, msg_send, sel, sel_impl};
use std::borrow::Cow;
use std::ffi::c_void;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::OnceLock;
use sysinfo::{Pid, ProcessesToUpdate, System};

#[allow(non_upper_case_globals)]
const K_CF_NUMBER_SINT32: CFNumberType = 3;
#[allow(non_upper_case_globals)]
const K_CF_NUMBER_SINT64: CFNumberType = 4;
static FIRST_RUN: AtomicBool = AtomicBool::new(true);
static LAST_DIAG_MS: AtomicU64 = AtomicU64::new(0);
static LAST_SKIP_OWN_SHELL_MS: AtomicU64 = AtomicU64::new(0);

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGRectMakeWithDictionaryRepresentation(dict: CFDictionaryRef, rect: *mut CGRect) -> u8;
    fn CGPreflightScreenCaptureAccess() -> bool;
}

#[derive(Debug)]
enum DictVal {
    Number(i64),
    Bool(bool),
    String(String),
    Rect(WindowPosition),
    Unknown,
}

fn nsstring_to_string(ns: id) -> String {
    unsafe {
        if ns == std::ptr::null_mut() {
            return String::new();
        }
        let cstr: *const i8 = msg_send![ns, UTF8String];
        if cstr.is_null() {
            return String::new();
        }
        std::ffi::CStr::from_ptr(cstr)
            .to_string_lossy()
            .into_owned()
    }
}

unsafe fn frontmost_app_bundle_path() -> PathBuf {
    let workspace: id = msg_send![class!(NSWorkspace), sharedWorkspace];
    if workspace.is_null() {
        return PathBuf::new();
    }
    let app: id = msg_send![workspace, frontmostApplication];
    if app.is_null() {
        return PathBuf::new();
    }
    let bundle_url: id = msg_send![app, bundleURL];
    if bundle_url.is_null() {
        return PathBuf::new();
    }
    let path: id = msg_send![bundle_url, path];
    PathBuf::from(nsstring_to_string(path))
}

unsafe fn frontmost_pid() -> Option<i64> {
    let workspace: id = msg_send![class!(NSWorkspace), sharedWorkspace];
    if workspace.is_null() {
        return None;
    }
    let app: id = msg_send![workspace, frontmostApplication];
    if app.is_null() {
        return None;
    }
    let pid: i32 = msg_send![app, processIdentifier];
    Some(i64::from(pid))
}

/// When `kCGWindowOwnerName` is empty (seen with some games/clients), use the frontmost bundle
/// path from NSWorkspace (`…/Steam.app`) so local rules can still match "steam".
fn display_name_from_bundle_path(path: &std::path::Path) -> Option<String> {
    let stem = path.file_stem()?.to_str()?.trim();
    if stem.is_empty() {
        return None;
    }
    Some(stem.to_string())
}

fn read_dict(dict: CFDictionaryRef, key: &str) -> DictVal {
    let cf_key: CFString = key.into();
    let mut value: *const c_void = std::ptr::null();
    if unsafe { CFDictionaryGetValueIfPresent(dict, cf_key.to_void(), &mut value) } == 0 {
        return DictVal::Unknown;
    }
    let type_id = unsafe { CFGetTypeID(value) };
    if type_id == unsafe { CFNumberGetTypeID() } {
        let value = value as CFNumberRef;
        #[allow(non_upper_case_globals)]
        match unsafe { CFNumberGetType(value) } {
            K_CF_NUMBER_SINT64 => {
                let mut v = 0_i64;
                let out: *mut i64 = &mut v;
                if unsafe { CFNumberGetValue(value, K_CF_NUMBER_SINT64, out.cast()) } {
                    return DictVal::Number(v);
                }
            }
            K_CF_NUMBER_SINT32 => {
                let mut v = 0_i32;
                let out: *mut i32 = &mut v;
                if unsafe { CFNumberGetValue(value, K_CF_NUMBER_SINT32, out.cast()) } {
                    return DictVal::Number(i64::from(v));
                }
            }
            _ => {
                let mut v = 0_f64;
                let out: *mut f64 = &mut v;
                // 13 = kCFNumberFloat64Type
                if unsafe { CFNumberGetValue(value, 13, out.cast()) } {
                    return DictVal::Number(v.round() as i64);
                }
            }
        }
    } else if type_id == unsafe { CFBooleanGetTypeID() } {
        return DictVal::Bool(unsafe { CFBooleanGetValue(value.cast()) });
    } else if type_id == unsafe { CFStringGetTypeID() } {
        let s = unsafe {
            let r = value as core_foundation::string::CFStringRef;
            if r.is_null() {
                String::new()
            } else {
                let cf = unsafe { CFString::wrap_under_get_rule(r) };
                Cow::from(&cf).into_owned()
            }
        };
        return DictVal::String(s);
    } else if type_id == unsafe { CFDictionaryGetTypeID() } && key == "kCGWindowBounds" {
        let rect: CGRect = unsafe {
            let mut r = std::mem::zeroed();
            CGRectMakeWithDictionaryRepresentation(value.cast(), &mut r);
            r
        };
        return DictVal::Rect(WindowPosition {
            x: rect.origin.x,
            y: rect.origin.y,
            width: rect.size.width,
            height: rect.size.height,
        });
    }
    DictVal::Unknown
}

fn screen_recording_granted() -> bool {
    unsafe { CGPreflightScreenCaptureAccess() }
}

fn process_path_by_pid(pid: u32) -> PathBuf {
    if pid == 0 {
        return PathBuf::new();
    }
    let mut sys = System::new();
    let p = Pid::from_u32(pid);
    let _ = sys.refresh_processes(ProcessesToUpdate::Some(&[p]), true);
    sys.process(p)
        .and_then(|proc| proc.exe().map(|p| p.to_path_buf()))
        .unwrap_or_default()
}

/// Walks up from an executable path to the containing `*.app` bundle directory, if any.
fn macos_app_bundle_root(exe: &Path) -> Option<PathBuf> {
    if exe.as_os_str().is_empty() {
        return None;
    }
    let mut path = exe.to_path_buf();
    loop {
        let is_app = path
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n.ends_with(".app"));
        if is_app {
            return Some(path);
        }
        if !path.pop() {
            return None;
        }
    }
}

fn our_flowlocked_app_bundle() -> Option<PathBuf> {
    static OUR_BUNDLE: OnceLock<Option<PathBuf>> = OnceLock::new();
    OUR_BUNDLE
        .get_or_init(|| {
            std::env::current_exe()
                .ok()
                .and_then(|exe| macos_app_bundle_root(&exe))
        })
        .clone()
}

fn wm_trace(msg: impl std::fmt::Display) {
    if super::wm_debug_enabled() {
        crate::diagnostic_log::emit_console_and_file(format!("{}", msg));
    }
}

fn wm_enum_escape(s: &str) -> String {
    s.chars()
        .take(80)
        .collect::<String>()
        .replace('\n', "\\n")
        .replace('"', "'")
}

fn wm_enum_alpha(dic_ref: CFDictionaryRef) -> f64 {
    match read_dict(dic_ref, "kCGWindowAlpha") {
        DictVal::Number(v) => {
            let vf = v as f64;
            if vf > 1.0 {
                vf / 255.0
            } else {
                vf
            }
        }
        _ => 1.0,
    }
}

fn wm_enum_emit(
    pid: i64,
    app: &str,
    title: &str,
    layer: i64,
    alpha: f64,
    w: f64,
    h: f64,
    verdict: &str,
    total_candidates: &mut u32,
) {
    *total_candidates = total_candidates.saturating_add(1);
    let app_e = wm_enum_escape(app);
    let title_e = wm_enum_escape(title);
    let line = format!(
        "[wm-enum] pid={} app=\"{}\" title=\"{}\" layer={} alpha={:.4} w={} h={} verdict={}",
        pid,
        app_e,
        title_e,
        layer,
        alpha,
        w.round() as i64,
        h.round() as i64,
        verdict
    );
    println!("{}", line);
    crate::diagnostic_log::append_line(&line);
}

fn wm_pick_emit(
    picked_pid: i64,
    picked_app: &str,
    picked_title: &str,
    pip_flag: bool,
    pip_recent: bool,
    total_candidates: u32,
) {
    let app_e = wm_enum_escape(picked_app);
    let title_e = wm_enum_escape(picked_title);
    let line = format!(
        "[wm-pick] picked_pid={} picked_app=\"{}\" picked_title=\"{}\" pip_flag={} pip_recent={} total_candidates={}",
        picked_pid, app_e, title_e, pip_flag, pip_recent, total_candidates
    );
    println!("{}", line);
    crate::diagnostic_log::append_line(&line);
}

pub(super) fn get_active_window_skip_pip_overlay() -> Result<ActiveWindow, ()> {
    if FIRST_RUN.swap(false, Ordering::SeqCst) {
        let granted = screen_recording_granted();
        crate::diagnostic_log::emit_console_and_file(format!(
            "[window-monitor] build=165 skip-pip path active; screen_recording_granted={}",
            granted
        ));
        crate::diagnostic_log::emit_console_and_file(
            "[window-monitor] Verbose z-order trace: export FLOWLOCKED_WM_DEBUG=1 then launch from Terminal. Window-monitor + detection lines also append to Desktop/focustogether-live.log",
        );
    }

    let frontmost_pid = unsafe { frontmost_pid() };
    let fallback_process_path = unsafe { frontmost_app_bundle_path() };

    let options = kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements;
    let arr = copy_window_info(options, kCGNullWindowID).ok_or(())?;
    let arr_ref = arr.as_concrete_TypeRef();
    let n = unsafe { CFArrayGetCount(arr_ref) };

    wm_trace(format_args!(
        "[window-monitor] zwalk begin: cg_window_entries={} frontmost_pid={:?} our_bundle={:?}",
        n,
        frontmost_pid,
        our_flowlocked_app_bundle()
            .as_ref()
            .map(|p| p.display().to_string())
    ));

    let mut skipped_pip = false;
    // First normal-layer on-screen window in global Z-order.
    let mut top_qualifying_seen = false;
    let mut skipped_pip_title: Option<String> = None;
    let mut saw_pip = false;
    let mut wm_candidate_count: u32 = 0;

    for i in 0..n {
        let dic_ref =
            unsafe { CFArrayGetValueAtIndex(arr_ref, i) as CFDictionaryRef };
        if dic_ref.is_null() {
            continue;
        }

        let window_pid = match read_dict(dic_ref, "kCGWindowOwnerPID") {
            DictVal::Number(p) => p,
            _ => continue,
        };

        let mut win_title = String::new();
        if let DictVal::String(s) = read_dict(dic_ref, "kCGWindowName") {
            win_title = s;
        }

        let mut app_name = String::new();
        if let DictVal::String(s) = read_dict(dic_ref, "kCGWindowOwnerName") {
            app_name = s;
        }

        let layer = match read_dict(dic_ref, "kCGWindowLayer") {
            DictVal::Number(l) => l,
            _ => 0,
        };
        let alpha_disp = wm_enum_alpha(dic_ref);

        if layer != 0 {
            wm_enum_emit(
                window_pid,
                &app_name,
                &win_title,
                layer,
                alpha_disp,
                0.0,
                0.0,
                "skipped_other:layer_nonzero",
                &mut wm_candidate_count,
            );
            continue;
        }

        let on_screen = match read_dict(dic_ref, "kCGWindowIsOnscreen") {
            DictVal::Bool(b) => b,
            _ => true,
        };
        if !on_screen {
            wm_enum_emit(
                window_pid,
                &app_name,
                &win_title,
                layer,
                alpha_disp,
                0.0,
                0.0,
                "skipped_offscreen",
                &mut wm_candidate_count,
            );
            continue;
        }
        let alpha_zero = match read_dict(dic_ref, "kCGWindowAlpha") {
            DictVal::Number(v) => v == 0,
            _ => false,
        };
        if alpha_zero {
            wm_enum_emit(
                window_pid,
                &app_name,
                &win_title,
                layer,
                alpha_disp,
                0.0,
                0.0,
                "skipped_other:alpha_zero",
                &mut wm_candidate_count,
            );
            continue;
        }

        let win_pos = match read_dict(dic_ref, "kCGWindowBounds") {
            DictVal::Rect(r) => r,
            _ => {
                wm_enum_emit(
                    window_pid,
                    &app_name,
                    &win_title,
                    layer,
                    alpha_disp,
                    0.0,
                    0.0,
                    "skipped_other:no_bounds",
                    &mut wm_candidate_count,
                );
                continue;
            }
        };
        if win_pos.width < 50.0 || win_pos.height < 50.0 {
            wm_enum_emit(
                window_pid,
                &app_name,
                &win_title,
                layer,
                alpha_disp,
                win_pos.width,
                win_pos.height,
                "skipped_other:small_size",
                &mut wm_candidate_count,
            );
            continue;
        }

        let process_path = process_path_by_pid(window_pid as u32);
        let bundle_theirs = macos_app_bundle_root(process_path.as_path());
        let bundle_ours = our_flowlocked_app_bundle();
        if super::wm_debug_enabled() {
            crate::diagnostic_log::emit_console_and_file(format!(
                "[window-monitor] zwalk[{i}] cand pid={} raw_owner={:?} title={:?} size={}x{} exe_empty={} bundle_win={:?} is_top_slot_yet={}",
                window_pid,
                app_name,
                win_title,
                win_pos.width as i64,
                win_pos.height as i64,
                process_path.as_os_str().is_empty(),
                bundle_theirs
                    .as_ref()
                    .map(|p| p.display().to_string()),
                !top_qualifying_seen
            ));
        }
        // Native Flowlocked windows (WebView popups, hidden main, etc.) often sit above Chrome in
        // global Z-order right after a deeplink. They must not consume the "top of stack" slot or
        // become the reported foreground — walk past them to Chrome + Document PiP.
        if let (Some(ref ours), Some(ref theirs)) = (bundle_ours.as_ref(), bundle_theirs.as_ref()) {
            if ours == theirs {
                if super::wm_debug_enabled() {
                    crate::diagnostic_log::emit_console_and_file(format!(
                        "[window-monitor] zwalk[{i}] skip reason=own_app_shell pid={} title={:?}",
                        window_pid, win_title
                    ));
                } else {
                    let now_ms = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_millis() as u64)
                        .unwrap_or(0);
                    let last = LAST_SKIP_OWN_SHELL_MS.load(Ordering::Relaxed);
                    if now_ms.saturating_sub(last) > 3_000 {
                        LAST_SKIP_OWN_SHELL_MS.store(now_ms, Ordering::Relaxed);
                        crate::diagnostic_log::emit_console_and_file(format!(
                            "[window-monitor] skipped own-app shell in z-order pid={} title={:?}",
                            window_pid, win_title
                        ));
                    }
                }
                wm_enum_emit(
                    window_pid,
                    &app_name,
                    &win_title,
                    layer,
                    alpha_disp,
                    win_pos.width,
                    win_pos.height,
                    "skipped_other:own_app_shell",
                    &mut wm_candidate_count,
                );
                continue;
            }
        }

        let is_top_for_front_pid = !top_qualifying_seen;
        top_qualifying_seen = true;

        let window_is_frontmost_app = frontmost_pid
            .map(|p| p == window_pid)
            .unwrap_or(false);
        // Never use the frontmost *app* bundle to label a different PID's windows. After a deeplink,
        // Flowlocked is often frontmost while Chrome PiP is still top in Z-order; mis-labeling those
        // windows as "Flowlocked" skips browser PiP heuristics and breaks distraction detection.
        let resolved_process_path = if !process_path.as_os_str().is_empty() {
            process_path.clone()
        } else if window_is_frontmost_app {
            fallback_process_path.clone()
        } else {
            PathBuf::new()
        };
        if app_name.is_empty() {
            if !process_path.as_os_str().is_empty() {
                if let Some(s) = display_name_from_bundle_path(&process_path) {
                    app_name = s;
                }
            } else if window_is_frontmost_app {
                if let Some(s) = display_name_from_bundle_path(&fallback_process_path) {
                    app_name = s;
                }
            }
        }

        if is_top_for_front_pid && is_known_browser_app_name(&app_name) {
            let now_ms = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            let last = LAST_DIAG_MS.load(Ordering::Relaxed);
            if now_ms.saturating_sub(last) > 2000 {
                LAST_DIAG_MS.store(now_ms, Ordering::Relaxed);
                crate::diagnostic_log::emit_console_and_file(format!(
                    "[window-monitor] top-window-in-z-order pid={} app={:?} title={:?} size={}x{} layer={}",
                    window_pid,
                    app_name,
                    win_title,
                    win_pos.width as i64,
                    win_pos.height as i64,
                    layer
                ));
            }
        }

        if is_flowlocked_pip_title(&win_title) {
            wm_trace(format_args!(
                "[window-monitor] zwalk[{i}] skip reason=flowlocked_pip_title pid={}",
                window_pid
            ));
            super::record_flowlocked_pip_level(layer);
            crate::diagnostic_log::emit_console_and_file(format!(
                "[window-monitor] pip_window_level={} (reason=flowlocked_pip_title pid={} title={:?})",
                layer, window_pid, win_title
            ));
            skipped_pip = true;
            saw_pip = true;
            if skipped_pip_title.is_none() {
                skipped_pip_title = Some(win_title.clone());
            }
            wm_enum_emit(
                window_pid,
                &app_name,
                &win_title,
                layer,
                alpha_disp,
                win_pos.width,
                win_pos.height,
                "skipped_pip",
                &mut wm_candidate_count,
            );
            continue;
        }

        // Race fallback: PiP may be on-screen before the web client sets `document.title`. The topmost
        // normal browser window under ~800×600 is usually Document PiP, not the main browser surface.
        if is_top_for_front_pid
            && is_known_browser_app_name(&app_name)
            && win_pos.width <= 800.0
            && win_pos.height <= 600.0
        {
            wm_trace(format_args!(
                "[window-monitor] zwalk[{i}] skip reason=suspected_pip_small_browser is_top={} app={:?} size={}x{}",
                is_top_for_front_pid,
                app_name,
                win_pos.width as i64,
                win_pos.height as i64
            ));
            super::record_flowlocked_pip_level(layer);
            crate::diagnostic_log::emit_console_and_file(format!(
                "[window-monitor] pip_window_level={} (reason=suspected_pip_small_browser pid={} app={:?})",
                layer, window_pid, app_name
            ));
            log_skipped_suspected_pip_heuristic(win_pos.width, win_pos.height, &app_name);
            skipped_pip = true;
            saw_pip = true;
            wm_enum_emit(
                window_pid,
                &app_name,
                &win_title,
                layer,
                alpha_disp,
                win_pos.width,
                win_pos.height,
                "skipped_pip",
                &mut wm_candidate_count,
            );
            continue;
        }

        let sharing_state = match read_dict(dic_ref, "kCGWindowSharingState") {
            DictVal::Number(s) => s,
            _ => -1,
        };
        let aspect_ok = win_pos.height > 0.0
            && (win_pos.width / win_pos.height) >= 0.5
            && (win_pos.width / win_pos.height) <= 2.5;
        if is_top_for_front_pid
            && is_known_browser_app_name(&app_name)
            && sharing_state == 1
            && win_pos.height <= 600.0
            && aspect_ok
        {
            wm_trace(format_args!(
                "[window-monitor] zwalk[{i}] skip reason=pip_shape_sharing is_top={} sharing={} aspect_ok={}",
                is_top_for_front_pid, sharing_state, aspect_ok
            ));
            super::record_flowlocked_pip_level(layer);
            crate::diagnostic_log::emit_console_and_file(format!(
                "[window-monitor] pip_window_level={} (reason=pip_shape_sharing pid={} app={:?})",
                layer, window_pid, app_name
            ));
            crate::diagnostic_log::emit_console_and_file(format!(
                "[window-monitor] skipped PiP via shape fallback: app={} {}x{} sharing={}",
                app_name, win_pos.width as i64, win_pos.height as i64, sharing_state
            ));
            skipped_pip = true;
            saw_pip = true;
            if skipped_pip_title.is_none() {
                skipped_pip_title = Some(win_title.clone());
            }
            wm_enum_emit(
                window_pid,
                &app_name,
                &win_title,
                layer,
                alpha_disp,
                win_pos.width,
                win_pos.height,
                "skipped_pip",
                &mut wm_candidate_count,
            );
            continue;
        }

        let window_id = match read_dict(dic_ref, "kCGWindowNumber") {
            DictVal::Number(id) => id.to_string(),
            _ => {
                wm_enum_emit(
                    window_pid,
                    &app_name,
                    &win_title,
                    layer,
                    alpha_disp,
                    win_pos.width,
                    win_pos.height,
                    "skipped_other:no_window_id",
                    &mut wm_candidate_count,
                );
                continue;
            }
        };

        if skipped_pip {
            log_skipped_pip(
                skipped_pip_title.as_deref().unwrap_or("Flowlocked PiP"),
                &win_title,
                &app_name,
            );
        }

        super::mark_pip_seen(saw_pip);
        let resolved = ActiveWindow {
            window_id,
            process_id: window_pid as u64,
            app_name,
            position: win_pos,
            title: win_title,
            process_path: resolved_process_path,
        };
        let finalized = super::finalize_with_history(resolved);
        super::log_zwalk_pick_summary(
            frontmost_pid,
            finalized.process_id as i64,
            &finalized.app_name,
            &finalized.title,
            saw_pip,
            skipped_pip,
            "cgwindow_zwalk",
        );
        wm_trace(format_args!(
            "[window-monitor] zwalk[{i}] pick resolved pid={} finalized pid={} app={:?}",
            window_pid,
            finalized.process_id,
            finalized.app_name
        ));
        wm_enum_emit(
            finalized.process_id as i64,
            &finalized.app_name,
            &finalized.title,
            layer,
            alpha_disp,
            finalized.position.width,
            finalized.position.height,
            "picked",
            &mut wm_candidate_count,
        );
        let pip_flag = super::pip_open_immediate();
        let pip_recent = super::pip_recently_open();
        wm_pick_emit(
            finalized.process_id as i64,
            &finalized.app_name,
            &finalized.title,
            pip_flag,
            pip_recent,
            wm_candidate_count,
        );
        return Ok(finalized);
    }

    super::mark_pip_seen(saw_pip);
    wm_trace(format_args!(
        "[window-monitor] zwalk exhausted cg list (no pick) saw_pip={} → active_win_pos_rs fallback",
        saw_pip
    ));
    match active_win_pos_rs::get_active_window().map(super::finalize_with_history) {
        Ok(w) => {
            super::log_zwalk_pick_summary(
                frontmost_pid,
                w.process_id as i64,
                &w.app_name,
                &w.title,
                saw_pip,
                skipped_pip,
                "fallback_active_win_pos_rs",
            );
            wm_enum_emit(
                w.process_id as i64,
                &w.app_name,
                &w.title,
                0,
                1.0,
                w.position.width,
                w.position.height,
                "picked",
                &mut wm_candidate_count,
            );
            let pip_flag = super::pip_open_immediate();
            let pip_recent = super::pip_recently_open();
            wm_pick_emit(
                w.process_id as i64,
                &w.app_name,
                &w.title,
                pip_flag,
                pip_recent,
                wm_candidate_count,
            );
            Ok(w)
        }
        Err(()) => {
            let pip_flag = super::pip_open_immediate();
            let pip_recent = super::pip_recently_open();
            wm_pick_emit(
                0,
                "",
                "",
                pip_flag,
                pip_recent,
                wm_candidate_count,
            );
            Err(())
        }
    }
}
