#!/bin/bash
# FocusTogether Native Messaging Host Installer
# Run this script after loading the extension to enable auto-connect

set -e

echo "=========================================="
echo "FocusTogether Native Messaging Installer"
echo "=========================================="
echo ""

# Get extension ID
if [ -z "$1" ]; then
    echo "To find your extension ID:"
    echo "1. Open Chrome and go to chrome://extensions/"
    echo "2. Enable 'Developer mode' (top right)"
    echo "3. Find FocusTogether and copy the ID"
    echo ""
    read -p "Enter your Chrome extension ID: " EXTENSION_ID
else
    EXTENSION_ID="$1"
fi

if [ -z "$EXTENSION_ID" ]; then
    echo "Error: Extension ID is required"
    exit 1
fi

# Validate extension ID format (32 lowercase letters)
if ! [[ "$EXTENSION_ID" =~ ^[a-z]{32}$ ]]; then
    echo "Warning: Extension ID should be 32 lowercase letters"
    read -p "Continue anyway? (y/n): " CONTINUE
    if [ "$CONTINUE" != "y" ]; then
        exit 1
    fi
fi

# Detect platform
PLATFORM=$(uname -s)

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
NATIVE_HOST_PATH="$SCRIPT_DIR/target/release/focustogether-native-host"

# Set paths based on platform
case "$PLATFORM" in
    Darwin)
        # macOS
        MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
        ;;
    Linux)
        # Linux
        MANIFEST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
        ;;
    *)
        echo "Error: Unsupported platform: $PLATFORM"
        exit 1
        ;;
esac

# Verify native host exists
if [ ! -f "$NATIVE_HOST_PATH" ]; then
    echo "Native host binary not found. Building..."
    cd "$SCRIPT_DIR"
    cargo build --release
fi

if [ ! -f "$NATIVE_HOST_PATH" ]; then
    echo "Error: Failed to build native host binary"
    exit 1
fi

# Create manifest directory if it doesn't exist
mkdir -p "$MANIFEST_DIR"

# Create the manifest file
MANIFEST_FILE="$MANIFEST_DIR/com.focustogether.app.json"

cat > "$MANIFEST_FILE" << EOF
{
  "name": "com.focustogether.app",
  "description": "FocusTogether Desktop App - Shares user ID with browser extension",
  "path": "$NATIVE_HOST_PATH",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXTENSION_ID/"]
}
EOF

echo ""
echo "✅ Native messaging host installed successfully!"
echo ""
echo "Manifest installed to: $MANIFEST_FILE"
echo "Native host path: $NATIVE_HOST_PATH"
echo "Extension ID: $EXTENSION_ID"
echo ""
echo "Now restart Chrome and the extension should be able to"
echo "auto-detect your user ID from the desktop app."
