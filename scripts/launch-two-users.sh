#!/usr/bin/env bash
# Launch two Flowlocked desktop instances, each tied to a different user.
# - Instance 1: Maria (44923348) using ~/.focustogether-user1/
# - Instance 2: Marcus (50145776) using ~/.focustogether-user2/
#
# Usage: ./scripts/launch-two-users.sh
# Or from repo root: bash scripts/launch-two-users.sh
#
# Multi-instance: For two-user testing you must start BOTH instances via this script
# (or with explicit FOCUSTOGETHER_CONFIG_DIR per process). If you launch one instance
# from the Dock or without FOCUSTOGETHER_CONFIG_DIR, it uses the default config path
# (~/.focustogether). That can make that instance use the other user's userId if the
# default config was last written by them, so the server will see pings for only one user.

set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Prefer release bundle; fall back to debug
APP_PATH="${APP_PATH:-$REPO_ROOT/src-tauri/target/release/bundle/macos}"
if [[ ! -d "$APP_PATH/Flowlocked.app" ]]; then
  APP_PATH="$REPO_ROOT/src-tauri/target/debug/bundle/macos"
fi
BINARY="$APP_PATH/Flowlocked.app/Contents/MacOS/Flowlocked"

if [[ ! -x "$BINARY" ]]; then
  echo "Flowlocked binary not found. Build first:"
  echo "  cd $REPO_ROOT && npm run tauri build"
  echo "Then run this script again."
  exit 1
fi

# Optional: create a second app bundle so you get two dock icons (Flowlocked and Flowlocked2)
if [[ -n "${USE_TWO_BUNDLES:-}" ]] && [[ ! -d "$APP_PATH/Flowlocked2.app" ]]; then
  echo "Creating Flowlocked2.app for second user..."
  cp -R "$APP_PATH/Flowlocked.app" "$APP_PATH/Flowlocked2.app"
  /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier com.focustogether.app2" "$APP_PATH/Flowlocked2.app/Contents/Info.plist"
  BINARY2="$APP_PATH/Flowlocked2.app/Contents/MacOS/Flowlocked"
else
  BINARY2="$BINARY"
fi

echo "Instance 1 (Maria, 44923348): FOCUSTOGETHER_CONFIG_DIR=~/.focustogether-user1"
echo "Instance 2 (Marcus, 50145776): FOCUSTOGETHER_CONFIG_DIR=~/.focustogether-user2"
echo ""

FOCUSTOGETHER_CONFIG_DIR="$HOME/.focustogether-user1" "$BINARY" >> "$HOME/.focustogether-user1/app.log" 2>&1 &
PID1=$!
echo "Started instance 1 (Maria) PID $PID1"

FOCUSTOGETHER_CONFIG_DIR="$HOME/.focustogether-user2" "$BINARY2" >> "$HOME/.focustogether-user2/app.log" 2>&1 &
PID2=$!
echo "Started instance 2 (Marcus) PID $PID2"

echo ""
echo "Both instances are running. Logs:"
echo "  tail -f ~/.focustogether-user1/app.log"
echo "  tail -f ~/.focustogether-user2/app.log"
