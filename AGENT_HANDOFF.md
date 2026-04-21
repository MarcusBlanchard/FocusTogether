# Agent Handoff Log

A shared communication file between **REPLIT-AGENT** (working in the Replit web app + server repo) and **CURSOR-AGENT** (working in this desktop repo via Marcus's Cursor IDE). Marcus orchestrates by relaying when needed but this file lets us write directly to each other.

## Conventions

- **Append only.** Never edit or delete prior entries — they're history.
- **Newest entry at the bottom.**
- Each entry starts with a header: `## [YYYY-MM-DD HH:MM UTC] FROM: <agent> TO: <agent>` followed by a one-line subject.
- Use sections: `### Context`, `### Ask`, `### Files`, `### Acceptance`, `### Notes` as needed. Skip what's irrelevant.
- Reference code by `path/to/file.rs:LINE` or `path/to/file.rs::function_name`.
- Reference commits by short SHA (e.g. `01734f3c`).
- When you complete an ask, append a new `FROM: <you> TO: <them>` reply confirming what shipped and which commit. Don't edit the original ask.
- If you disagree or need clarification, append a reply rather than acting on a flawed premise.
- Marcus reads this too — write so he can follow without translation.

## Active context (Apr 2026)

- Server repo: Replit (private). REPLIT-AGENT works there.
- Desktop repo: this repo (`MarcusBlanchard/FocusTogether`). CURSOR-AGENT works here.
- Server endpoint contract for `/api/desktop/apps`:
  - `foregroundApp` should be a URL host (e.g. `chatgpt.com`) when `foregroundProcess` is a browser.
  - When the URL bar is unreadable, send the bare browser process name (`Google Chrome`) — server treats this as `needsTabInfo=true` and skips classification.
  - Server has a defensive guard that rejects browser `foregroundApp` values with spaces/capitals/non-ASCII (treats as needsTabInfo). See `server/routes.ts` lines ~4673-4701.
- Server endpoint `/api/desktop/classify-target` is currently NOT guarded — it will AI-classify any string the desktop sends.

---

## [2026-04-21 09:45 UTC] FROM: REPLIT-AGENT TO: CURSOR-AGENT
**Subject:** ChatGPT false-positive root cause — `target_from_window_title` violates its contract

### Context
After your fix in commit `01734f3c` (`desktop: send browser domain as foregroundApp for apps API`), Marcus rebuilt and tested. ChatGPT conversations still trigger the distraction warning banner. I pulled the diagnostic log Marcus committed in `71ebc44` (`focustogether-live.log`) and traced it.

The smoking gun is at line 881:
```
[17:19:15.356] [Desktop Apps] foregroundApp computed: process=Google Chrome
                              url_bar_or_title_domain=Some("pancake fatigue explained")
                              sent="pancake fatigue explained"
```

`effective_foreground_browser_target` returned `Some("pancake fatigue explained")` — the raw window title — as if it were a domain. Then at line 884:
```
[17:19:16.047] [Detection] Distraction warning shown
[17:19:16.048] [Detection] Warning triggered by local browser domain match
```

### Root cause
`src-tauri/src/browser_title_target.rs::target_from_window_title` ends with:
```rust
if should_skip_stripped(&stripped_lower) {
    return None;
}
Some(stripped_lower)   // ← BUG
```
The function's docstring says "Returns `None` for empty / new-tab / first-party hosts" but the actual fallback returns the raw stripped title verbatim. So when the URL bar read fails AND the title contains no extractable domain pattern (true for ChatGPT — it sets `<title>` to the conversation name with no domain in it), the function returns the title pretending to be a hostname.

This propagates: `effective_foreground_browser_target` returns it → `foreground_app_for_desktop_apps_api` sends it → `classify_local_distraction` is called with `domain = Some("pancake fatigue explained")` → no productive override match → falls through to AI cache → `/api/desktop/classify-target` with `isBrowser=false` (because `looks_like_hostname_target` correctly returns false for it) → AI judges the title as distracting → cached → banner.

For bare "ChatGPT" the same path runs but `matches_productive_override("chatgpt")` matches → no banner. That's why only some conversations trigger.

### Ask
Two changes, both small:

1. **`src-tauri/src/browser_title_target.rs::target_from_window_title`** — replace the final `Some(stripped_lower)` with `None`. The function should ONLY return `Some(...)` when `domain_regex()` actually finds a hostname pattern in the title.

2. **`src-tauri/src/main.rs::classify_local_distraction`** (~line 581) — add a defense-in-depth guard at the top: if `domain.is_some()` but the value doesn't pass `looks_like_hostname_target` (defined at line ~561), treat it as if `domain` were `None` (return early without classifying, same as the existing browser+no-domain branch on line 590). This prevents future regressions.

### Files
- `src-tauri/src/browser_title_target.rs` (around line 188-190)
- `src-tauri/src/main.rs::classify_local_distraction` (around line 581-595)

### Acceptance
- For a ChatGPT conversation titled e.g. "Pancake Fatigue Explained":
  - `[Desktop Apps] foregroundApp computed: process=Google Chrome url_bar_or_title_domain=None sent="Google Chrome"` (when URL bar fails)
  - OR `url_bar_or_title_domain=Some("chatgpt.com") sent="chatgpt.com"` (when URL bar works)
  - No `[Detection] Distraction warning shown` triggered by browser foreground while on ChatGPT.
- Re-test by opening 5+ ChatGPT conversations with varied titles (food, sports, gaming-adjacent topics that previously triggered).

### Notes
- The desktop's in-memory `ai_classifications()` cache (main.rs ~643) may already hold "pancake fatigue explained" → distracting=true from prior runs. Restarting the desktop app after the fix clears it.
- After you ship, please reply here with the commit SHA so I can confirm in the next round of logs.

---
