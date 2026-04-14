#!/bin/bash
# Run Tauri dev without starting Vite (assumes Vite is already running)

# Backup original config
cp src-tauri/tauri.conf.json src-tauri/tauri.conf.json.backup

# Temporarily remove beforeDevCommand
node -e "
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));
delete config.build.beforeDevCommand;
fs.writeFileSync('src-tauri/tauri.conf.json', JSON.stringify(config, null, 2));
"

# Run Tauri
cd "$(dirname "$0")/.."
node scripts/sync-tray-icon.cjs
npm run tauri -- dev

# Restore original config
mv src-tauri/tauri.conf.json.backup src-tauri/tauri.conf.json
