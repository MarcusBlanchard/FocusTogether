# Prompt for AI agent — Flowlocked / FocusTogether (Windows laptop)

Copy everything below the line into a new chat when working on this project from your **Windows** machine (or any environment where the instructions apply).

---

## Repository

- **GitHub (clone / pull from here):** https://github.com/MarcusBlanchard/FocusTogether  
- **Agent handoff (read this for tasks and coordination):** https://github.com/MarcusBlanchard/FocusTogether/blob/main/AGENT_HANDOFF.md  
- **Raw handoff in a cloned repo:** `AGENT_HANDOFF.md` at the **repository root** (same level as `package.json`, `client/`, `src-tauri/`).

## Before you do anything else

1. Sync with GitHub (avoid stale trees):
   ```bash
   git fetch origin
   git pull origin main
   ```
   If your working tree is dirty and you need to match remote exactly:
   ```bash
   git fetch origin && git reset --hard origin/main
   ```
   (Only use `reset --hard` when you are sure you can discard local changes.)

2. Open **`AGENT_HANDOFF.md`** and read the **latest instructions** intended for you.

## How to use `AGENT_HANDOFF.md`

- The file is the **async message board** between **REPLIT-AGENT** (web app + server on Replit) and **CURSOR-AGENT** (desktop repo in Cursor / this codebase). The human (Marcus) coordinates when needed.
- **Current convention: newest entries are at the TOP of the file.** Start reading from the beginning; the first sections are the most recent.
- Find blocks addressed **TO:** the role you are filling (e.g. `TO: CURSOR-AGENT` for desktop/Tauri work).
- When you finish work requested there, **append a new section** at the **TOP** (after the horizontal rule pattern used in the file) with:
  - **FROM:** your role **TO:** the other party  
  - **Subject**, what you shipped, files touched, validation, and the **`git` commit SHA** (full or short).
- Treat the file as **append-oriented**: do not delete older history; add new dated entries.
- If Replit says they will **not** push certain paths until a build lands, respect that coordination note.

## Project layout (desktop)

- **Tauri / Rust:** `src-tauri/` (main logic: `src-tauri/src/main.rs`, `window_monitor/`, `browser_url.rs`, etc.)
- **Frontend:** `client/`
- **Build number (splash):** `client/startup-notification.html` — text `Flowlocked Active (N)`.

## Rules you must follow

### Scope and platforms

- When the user asks for **Windows-only** fixes, change **Windows** code paths only (e.g. `#[cfg(target_os = "windows")]` modules such as `src-tauri/src/window_monitor/windows.rs` and the Windows block in `browser_url.rs`). **Do not** alter macOS behavior unless explicitly requested.
- **Mac agents:** after changes under `client/` or `src-tauri/`, the workspace rule requires bumping the build number in `client/startup-notification.html` and running **`bash scripts/install-mac.sh`** from the repo root in the **same** change set. On a **Windows laptop**, you typically **do not** run that script; use local Windows build/run instead.

### GitHub

- After changes to **app code** or **`AGENT_HANDOFF.md`**, **commit and push to `main`** (or the branch Marcus is using) so Replit and other machines stay in sync. The user expects frequent pushes for those cases.

### Code style (from project norms)

- Make **minimal, focused** diffs; no drive-by refactors or unrelated files.
- Match existing naming, patterns, and logging style (`tracing`, `println`, `diagnostic_log`, tag prefixes like `[browser_url]`, `[window_monitor]`).
- Prefer **clear prose** in handoff entries; include **commit SHAs** when reporting completion.

### What not to do

- Do not remove or regress **macOS** AppleScript / window-monitor instrumentation the handoff says to keep (e.g. `[browser_url] window_match` on Mac) unless a new handoff explicitly requests it.
- Do not assume **cross-compiling** Tauri from macOS to Windows is reliable for this repo without checking CI; native **Windows** builds are the source of truth for Windows behavior.

## Windows laptop — local run (fast iteration)

From repo root after `npm install`:

- **Dev loop (fastest):** `npm run tauri dev` (or the script name defined in `package.json` for Tauri dev).
- **Release-style build:** `npm run tauri build` (slower; produces installer artifacts as configured).

Ensure **Rust** (`rustup`), **Node**, and **WebView2** (usual on current Windows) are available.

## CI

- Windows installers may be built in **GitHub Actions** (e.g. `build-windows.yml`). That is slower than local `tauri dev` / `cargo build`; use local builds for day-to-day edits.

## Useful links

- Repo: https://github.com/MarcusBlanchard/FocusTogether  
- Handoff file on GitHub: https://github.com/MarcusBlanchard/FocusTogether/blob/main/AGENT_HANDOFF.md  

---

*This file is meant to be pulled with the repo so the same instructions are available on every machine.*
