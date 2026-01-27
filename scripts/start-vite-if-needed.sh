#!/bin/bash
# Check if Vite is already running on port 5173
# If yes, skip starting it. If no, start it and wait for it to be ready.

if curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo "[Tauri] ✓ Vite already running on port 5173"
    exit 0
else
    echo "[Tauri] Starting Vite dev server..."
    # Start Vite in background
    npm run dev:vite > /dev/null 2>&1 &
    VITE_PID=$!
    
    # Wait for Vite to be ready (max 10 seconds)
    for i in {1..20}; do
        if curl -s http://localhost:5173 > /dev/null 2>&1; then
            echo "[Tauri] ✓ Vite started successfully"
            exit 0
        fi
        sleep 0.5
    done
    
    echo "[Tauri] ✗ Vite failed to start within 10 seconds"
    kill $VITE_PID 2>/dev/null
    exit 1
fi
