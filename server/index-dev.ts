// Load environment variables FIRST (before any other imports)
import "./env-loader.js";

import runApp from "./app";

// Backend-only dev server (no Vite embedded)
// Frontend runs separately via: npm run dev:vite
(async () => {
  await runApp(async () => {
    // No-op setup - frontend is served separately by Vite dev server
  });
})();
