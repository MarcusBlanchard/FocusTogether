#!/usr/bin/env node
/**
 * System tray / menu bar: 64px RGBA from zirain-app-icon.png.
 * On macOS uses `sips`; on Windows/Linux uses PowerShell System.Drawing when available.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = path.join(root, "src-tauri", "zirain-app-icon.png");
const legacySrc = path.join(root, "src-tauri", "flowlocked-app-icon.png");
const dst = path.join(root, "src-tauri", "icons", "tray-icon.png");

const iconSrc = fs.existsSync(src) ? src : legacySrc;
if (!fs.existsSync(iconSrc)) {
  console.error("sync-tray-icon: missing", src, "and", legacySrc);
  process.exit(1);
}
fs.mkdirSync(path.dirname(dst), { recursive: true });

function resizeTrayWindows() {
  const ps = `
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('${iconSrc.replace(/'/g, "''")}')
$bmp = New-Object System.Drawing.Bitmap 64, 64
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
$g.DrawImage($img, 0, 0, 64, 64)
$bmp.Save('${dst.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose(); $img.Dispose()
`;
  execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"').replace(/\r?\n/g, "; ")}"`, {
    stdio: "pipe",
    env: process.env,
  });
}

try {
  execSync(`sips -z 64 64 "${iconSrc}" --out "${dst}"`, {
    stdio: "pipe",
    env: process.env,
  });
  console.log("sync-tray-icon: wrote", path.relative(root, dst), "(sips)");
  process.exit(0);
} catch {
  try {
    resizeTrayWindows();
    console.log("sync-tray-icon: wrote", path.relative(root, dst), "(powershell)");
    process.exit(0);
  } catch (e) {
    if (fs.existsSync(dst)) {
      console.log("sync-tray-icon: resize failed; using existing", path.relative(root, dst));
      process.exit(0);
    }
    console.error("sync-tray-icon: could not generate tray-icon.png:", e.message || e);
    process.exit(1);
  }
}
