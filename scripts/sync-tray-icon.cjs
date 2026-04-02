#!/usr/bin/env node
/**
 * System tray / menu bar: 64px RGBA from flowlocked-app-icon.png.
 * On macOS uses `sips`; on Windows/Linux CI uses committed tray-icon.png if present.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = path.join(root, "src-tauri", "flowlocked-app-icon.png");
const dst = path.join(root, "src-tauri", "icons", "tray-icon.png");

if (!fs.existsSync(src)) {
  console.error("sync-tray-icon: missing", src);
  process.exit(1);
}
fs.mkdirSync(path.dirname(dst), { recursive: true });

try {
  execSync(`sips -z 64 64 "${src}" --out "${dst}"`, {
    stdio: "pipe",
    env: process.env,
  });
  process.exit(0);
} catch {
  if (fs.existsSync(dst)) {
    console.log("sync-tray-icon: sips unavailable; using existing", path.relative(root, dst));
    process.exit(0);
  }
  console.error(
    "sync-tray-icon: sips not found and tray-icon.png missing. On macOS run once, or commit src-tauri/icons/tray-icon.png.",
  );
  process.exit(1);
}
