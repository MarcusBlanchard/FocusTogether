#!/usr/bin/env bash
# Build and copy FocusTogether.app to /Applications.
# Forces a project-local Cargo target dir so `cp` works even when CARGO_TARGET_DIR is set (e.g. Cursor sandbox).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# Always use project target dir for this script so the .app path is predictable.
export CARGO_TARGET_DIR="$ROOT/src-tauri/target"

npm run build
npm run tauri:build

APP="$ROOT/src-tauri/target/release/bundle/macos/FocusTogether.app"
if [[ ! -d "$APP" ]]; then
  echo "error: expected bundle not found: $APP" >&2
  exit 1
fi

rm -rf /Applications/FocusTogether.app
cp -R "$APP" /Applications/
echo "Installed to /Applications/FocusTogether.app"
