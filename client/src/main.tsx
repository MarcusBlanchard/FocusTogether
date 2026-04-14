console.log("[Frontend] main.tsx loaded");
console.log("[Frontend] Document ready state:", document.readyState);
console.log("[Frontend] Window location:", window.location.href);
console.log("[Frontend] Root element exists:", !!document.getElementById("root"));

import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { SessionClientProvider } from "./contexts/session-client-context";
import { Toaster } from "./components/ui/toaster";
import App from "./App";
import "./index.css";

console.log("[Frontend] About to render React app");
const rootElement = document.getElementById("root");
if (!rootElement) {
  console.error("[Frontend] ERROR: Root element not found!");
} else {
  console.log("[Frontend] Root element found, creating root and rendering");
  createRoot(rootElement).render(
    <QueryClientProvider client={queryClient}>
      <SessionClientProvider>
        <App />
        <Toaster />
      </SessionClientProvider>
    </QueryClientProvider>,
  );
  console.log("[Frontend] React app rendered");
}
