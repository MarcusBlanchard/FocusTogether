console.log("[Frontend] main.tsx loaded");
console.log("[Frontend] Document ready state:", document.readyState);
console.log("[Frontend] Window location:", window.location.href);
console.log("[Frontend] Root element exists:", !!document.getElementById("root"));

import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

console.log("[Frontend] About to render React app");
const rootElement = document.getElementById("root");
if (!rootElement) {
  console.error("[Frontend] ERROR: Root element not found!");
} else {
  console.log("[Frontend] Root element found, creating root and rendering");
  createRoot(rootElement).render(<App />);
  console.log("[Frontend] React app rendered");
}
