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
use std::path::PathBuf;

#[allow(non_upper_case_globals)]
const K_CF_NUMBER_SINT32: CFNumberType = 3;
#[allow(non_upper_case_globals)]
const K_CF_NUMBER_SINT64: CFNumberType = 4;

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGRectMakeWithDictionaryRepresentation(dict: CFDictionaryRef, rect: *mut CGRect) -> u8;
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
            _ => {}
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

pub(super) fn get_active_window_skip_pip_overlay() -> Result<ActiveWindow, ()> {
    let front_pid = unsafe { frontmost_pid().ok_or(())? };
    let process_path = unsafe { frontmost_app_bundle_path() };

    let options = kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements;
    let arr = copy_window_info(options, kCGNullWindowID).ok_or(())?;
    let arr_ref = arr.as_concrete_TypeRef();
    let n = unsafe { CFArrayGetCount(arr_ref) };

    let mut skipped_pip = false;
    // First normal-layer on-screen window for the frontmost PID (Z-order); Document PiP is usually here.
    let mut top_qualifying_seen = false;

    for i in 0..n {
        let dic_ref =
            unsafe { CFArrayGetValueAtIndex(arr_ref, i) as CFDictionaryRef };
        if dic_ref.is_null() {
            continue;
        }

        let window_pid = match read_dict(dic_ref, "kCGWindowOwnerPID") {
            DictVal::Number(p) if p == front_pid => p,
            _ => continue,
        };

        let layer = match read_dict(dic_ref, "kCGWindowLayer") {
            DictVal::Number(l) => l,
            _ => 0,
        };
        if layer != 0 {
            continue;
        }

        let on_screen = match read_dict(dic_ref, "kCGWindowIsOnscreen") {
            DictVal::Bool(b) => b,
            _ => true,
        };
        if !on_screen {
            continue;
        }

        let win_pos = match read_dict(dic_ref, "kCGWindowBounds") {
            DictVal::Rect(r) => r,
            _ => continue,
        };
        if win_pos.width < 50.0 || win_pos.height < 50.0 {
            continue;
        }

        let is_top_for_front_pid = !top_qualifying_seen;
        top_qualifying_seen = true;

        let mut win_title = String::new();
        if let DictVal::String(s) = read_dict(dic_ref, "kCGWindowName") {
            win_title = s;
        }

        let mut app_name = String::new();
        if let DictVal::String(s) = read_dict(dic_ref, "kCGWindowOwnerName") {
            app_name = s;
        }

        if is_flowlocked_pip_title(&win_title) {
            skipped_pip = true;
            continue;
        }

        // Race fallback: PiP may be on-screen before the web client sets `document.title`. The topmost
        // normal browser window under ~800×600 is usually Document PiP, not the main browser surface.
        if is_top_for_front_pid
            && is_known_browser_app_name(&app_name)
            && win_pos.width <= 800.0
            && win_pos.height <= 600.0
        {
            log_skipped_suspected_pip_heuristic(win_pos.width, win_pos.height, &app_name);
            skipped_pip = true;
            continue;
        }

        let window_id = match read_dict(dic_ref, "kCGWindowNumber") {
            DictVal::Number(id) => id.to_string(),
            _ => continue,
        };

        if skipped_pip {
            log_skipped_pip(&win_title, &app_name);
        }

        return Ok(ActiveWindow {
            window_id,
            process_id: window_pid as u64,
            app_name,
            position: win_pos,
            title: win_title,
            process_path,
        });
    }

    active_win_pos_rs::get_active_window()
}
