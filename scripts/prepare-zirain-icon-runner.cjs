#!/usr/bin/env node
/**
 * Windows: full prepare (transparent PNG + public web assets) via PowerShell.
 * macOS/Linux CI: use committed src-tauri/zirain-app-icon.png when present.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const appIcon = path.join(root, "src-tauri", "zirain-app-icon.png");

if (process.platform === "win32") {
  execSync(
    'powershell -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-zirain-icon.ps1',
    { stdio: "inherit", cwd: root, env: process.env },
  );
  process.exit(0);
}

if (fs.existsSync(appIcon)) {
  console.log(
    "prepare-zirain-icon: using committed zirain-app-icon.png on",
    process.platform,
  );
  process.exit(0);
}

console.error(
  "prepare-zirain-icon: missing src-tauri/zirain-app-icon.png — run prepare on Windows or commit the generated icon.",
);
process.exit(1);
