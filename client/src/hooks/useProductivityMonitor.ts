import { useEffect, useState, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

export interface ProductivityState {
  runningApps: string[];
  idleSeconds: number;
  distractingApps: string[];
  isIdle: boolean;
}

const DEFAULT_DISTRACTING_APPS = [
  'youtube',
  'netflix',
  'spotify',
  'discord',
  'slack',
  'twitter',
  'instagram',
  'facebook',
  'tiktok',
  'reddit',
  'steam',
  'epic games',
  'league of legends',
  'valorant',
  'minecraft',
];

const IDLE_THRESHOLD_SECONDS = 60; // Alert if idle for more than 60 seconds
const POLL_INTERVAL_MS = 5000; // Check every 5 seconds

export function useProductivityMonitor(enabled: boolean = true) {
  const [state, setState] = useState<ProductivityState>({
    runningApps: [],
    idleSeconds: 0,
    distractingApps: [],
    isIdle: false,
  });

  const [distractingAppsList, setDistractingAppsList] = useState<string[]>(() => {
    // Load from localStorage
    const saved = localStorage.getItem('distractingApps');
    return saved ? JSON.parse(saved) : DEFAULT_DISTRACTING_APPS;
  });

  const lastAlertTimeRef = useRef<{ idle: number; apps: number }>({
    idle: 0,
    apps: 0,
  });

  const checkTauriAvailable = useCallback(() => {
    try {
      // Check if we're in a Tauri environment
      return typeof window !== 'undefined' && 
             (window as any).__TAURI_INTERNALS__ !== undefined;
    } catch {
      return false;
    }
  }, []);

  const updateState = useCallback(async () => {
    if (!checkTauriAvailable() || !enabled) {
      return;
    }

    try {
      const [runningApps, idleSeconds] = await Promise.all([
        invoke<string[]>('get_running_apps'),
        invoke<number>('get_idle_seconds'),
      ]);

      // Check for distracting apps (case-insensitive partial match)
      const distractingApps = runningApps.filter((app) =>
        distractingAppsList.some((distracting) =>
          app.toLowerCase().includes(distracting.toLowerCase())
        )
      );

      const isIdle = idleSeconds > IDLE_THRESHOLD_SECONDS;

      setState({
        runningApps,
        idleSeconds,
        distractingApps,
        isIdle,
      });
    } catch (error) {
      console.error('[ProductivityMonitor] Error fetching system state:', error);
    }
  }, [enabled, distractingAppsList, checkTauriAvailable]);

  useEffect(() => {
    if (!enabled) return;

    // Initial check
    updateState();

    // Poll periodically
    const interval = setInterval(updateState, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [enabled, updateState]);

  const updateDistractingApps = useCallback((apps: string[]) => {
    setDistractingAppsList(apps);
    localStorage.setItem('distractingApps', JSON.stringify(apps));
  }, []);

  return {
    ...state,
    updateDistractingApps,
    distractingAppsList,
    isTauriAvailable: checkTauriAvailable(),
  };
}

