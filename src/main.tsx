import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";

async function mount() {
  // Restore native preferences before Zustand creates its persisted stores.
  if (new URLSearchParams(location.search).has("desktop")) {
    try {
      const response = await fetch("/api/preferences");
      if (response.ok) {
        const preferences = await response.json() as Record<string, string>;
        for (const [key, value] of Object.entries(preferences)) {
          if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
        }
      }
    } catch { /* Browser-only mode and older desktop builds remain usable. */ }
  }
  const { App } = await import("./App");
  createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
}
void mount();
