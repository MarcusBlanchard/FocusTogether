//! Linux (X11 / EWMH): walk `_NET_CLIENT_LIST_STACKING` top-down, skipping `Flowlocked PiP`.
//! Falls back to `active_win_pos_rs` if EWMH is unavailable.

use super::{
    is_flowlocked_pip_title, is_known_browser_app_name, log_skipped_pip,
    log_skipped_suspected_pip_heuristic,
};
use active_win_pos_rs::{ActiveWindow, WindowPosition};
use std::collections::HashSet;
use std::fs::read_link;
use xcb::x;

fn intern_atom(conn: &xcb::Connection, name: &[u8]) -> xcb::Result<x::Atom> {
    let c = conn.send_request(&x::InternAtom {
        only_if_exists: true,
        name,
    });
    Ok(conn.wait_for_reply(c)?.atom())
}

fn get_window_pid(conn: &xcb::Connection, window: x::Window) -> xcb::Result<u32> {
    let atom = intern_atom(conn, b"_NET_WM_PID")?;
    if atom == x::ATOM_NONE {
        return Ok(0);
    }
    let r = conn.send_request(&x::GetProperty {
        delete: false,
        window,
        property: atom,
        r#type: x::ATOM_ANY,
        long_offset: 0,
        long_length: 1,
    });
    let reply = conn.wait_for_reply(r)?;
    Ok(reply.value::<u32>().first().copied().unwrap_or(0))
}

fn get_window_title(conn: &xcb::Connection, window: x::Window) -> xcb::Result<String> {
    let wm_name_atom = intern_atom(conn, b"_NET_WM_NAME")?;
    if wm_name_atom != x::ATOM_NONE {
        let r = conn.send_request(&x::GetProperty {
            delete: false,
            window,
            property: wm_name_atom,
            r#type: x::ATOM_ANY,
            long_offset: 0,
            long_length: 1024,
        });
        if let Ok(reply) = conn.wait_for_reply(r) {
            let t = String::from_utf8_lossy(reply.value());
            if !t.is_empty() {
                return Ok(t.into_owned());
            }
        }
    }
    let r = conn.send_request(&x::GetProperty {
        delete: false,
        window,
        property: x::ATOM_WM_NAME,
        r#type: x::ATOM_ANY,
        long_offset: 0,
        long_length: 1024,
    });
    let reply = conn.wait_for_reply(r)?;
    Ok(String::from_utf8_lossy(reply.value()).into_owned())
}

fn get_window_class(conn: &xcb::Connection, window: x::Window) -> xcb::Result<String> {
    let r = conn.send_request(&x::GetProperty {
        delete: false,
        window,
        property: x::ATOM_WM_CLASS,
        r#type: x::ATOM_STRING,
        long_offset: 0,
        long_length: 1024,
    });
    let reply = conn.wait_for_reply(r)?;
    let raw = reply.value();
    let s = std::str::from_utf8(raw).unwrap_or("");
    Ok(s.to_owned())
}

fn translated_position(conn: &xcb::Connection, window: x::Window) -> xcb::Result<WindowPosition> {
    let geom = conn.send_request(&x::GetGeometry {
        drawable: x::Drawable::Window(window),
    });
    let g = conn.wait_for_reply(geom)?;
    let x0 = g.x();
    let y0 = g.y();
    let tr = conn.send_request(&x::TranslateCoordinates {
        dst_window: g.root(),
        src_window: window,
        src_x: x0,
        src_y: y0,
    });
    let t = conn.wait_for_reply(tr)?;
    Ok(WindowPosition {
        x: f64::from(t.dst_x() - x0),
        y: f64::from(t.dst_y() - y0),
        width: f64::from(g.width()),
        height: f64::from(g.height()),
    })
}

fn stacking_windows(conn: &xcb::Connection, root: x::Window) -> xcb::Result<Vec<x::Window>> {
    let atom = intern_atom(conn, b"_NET_CLIENT_LIST_STACKING")?;
    if atom == x::ATOM_NONE {
        return Ok(Vec::new());
    }
    let r = conn.send_request(&x::GetProperty {
        delete: false,
        window: root,
        property: atom,
        r#type: x::ATOM_WINDOW,
        long_offset: 0,
        long_length: 4096,
    });
    let reply = conn.wait_for_reply(r)?;
    Ok(reply.value().to_vec())
}

fn fallback_active_window_with_wayland_warning() -> Result<ActiveWindow, ()> {
    let active = active_win_pos_rs::get_active_window()?;
    let is_pip = is_flowlocked_pip_title(&active.title);
    super::mark_pip_seen(is_pip);
    if is_pip {
        crate::diagnostic_log::emit_console_and_file(
            "[window_monitor] top window matches PiP on Linux fallback path; global Z-order unavailable (likely Wayland), distraction detection may be masked.",
        );
    }
    Ok(super::finalize_with_history(active))
}

pub(super) fn get_active_window_skip_pip_overlay() -> Result<ActiveWindow, ()> {
    let Ok((conn, _)) = xcb::Connection::connect(None) else {
        return fallback_active_window_with_wayland_warning();
    };
    let setup = conn.get_setup();
    let Some(root) = setup.roots().next().map(|r| r.root()) else {
        return fallback_active_window_with_wayland_warning();
    };

    let windows = match stacking_windows(&conn, root) {
        Ok(w) if !w.is_empty() => w,
        _ => return fallback_active_window_with_wayland_warning(),
    };

    let mut skipped_pip = false;
    let mut skipped_pip_title: Option<String> = None;
    let mut saw_pip = false;
    let mut pid_top_z: HashSet<u32> = HashSet::new();

    for wid in windows.iter().rev() {
        let window_pid = get_window_pid(&conn, *wid).unwrap_or(0);
        let position = match translated_position(&conn, *wid) {
            Ok(p) => p,
            Err(_) => continue,
        };
        if position.width < 50.0 || position.height < 50.0 {
            continue;
        }

        let title = match get_window_title(&conn, *wid) {
            Ok(t) => t,
            Err(_) => continue,
        };

        let is_top_for_pid = pid_top_z.insert(window_pid);
        if is_flowlocked_pip_title(&title) {
            skipped_pip = true;
            saw_pip = true;
            if skipped_pip_title.is_none() {
                skipped_pip_title = Some(title.clone());
            }
            continue;
        }

        let window_class = get_window_class(&conn, *wid).unwrap_or_default();
        let mut parts: Vec<&str> = window_class
            .split('\0')
            .filter(|s| !s.is_empty())
            .collect();
        let process_name = parts.pop().unwrap_or("").to_owned();

        // Race fallback: PiP may map to a client before WM_NAME / `_NET_WM_NAME` is updated.
        if is_top_for_pid
            && is_known_browser_app_name(&process_name)
            && position.width <= 800.0
            && position.height <= 600.0
        {
            log_skipped_suspected_pip_heuristic(position.width, position.height, &process_name);
            skipped_pip = true;
            saw_pip = true;
            if skipped_pip_title.is_none() {
                skipped_pip_title = Some(title.clone());
            }
            continue;
        }

        let process_path = read_link(format!("/proc/{}/exe", window_pid))
            .unwrap_or_default();

        if skipped_pip {
            log_skipped_pip(
                skipped_pip_title.as_deref().unwrap_or("Flowlocked PiP"),
                &title,
                if process_name.is_empty() {
                    "x11-app"
                } else {
                    process_name.as_str()
                },
            );
        }

        super::mark_pip_seen(saw_pip);
        let resolved = ActiveWindow {
            process_id: u64::from(window_pid),
            window_id: wid.resource_id().to_string(),
            app_name: if process_name.is_empty() {
                "x11-app".to_string()
            } else {
                process_name
            },
            position,
            title,
            process_path,
        };
        return Ok(super::finalize_with_history(resolved));
    }

    super::mark_pip_seen(saw_pip);
    fallback_active_window_with_wayland_warning()
}
