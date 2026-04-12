import { createRoot } from "react-dom/client";
import "./styles/main.scss";
import App from "./App";
import { preloadMonaco } from "./ide/editor/monaco-setup";

// Kick off Monaco preload in the background immediately — by the time the
// user opens their first file, the dynamic imports will already be in-flight.
preloadMonaco();

// Prevent default browser context menu globally
// Allow in terminal, editor, and form inputs
document.addEventListener("contextmenu", (e) => {
  const target = e.target as HTMLElement;
  if (
    target.closest(".xterm") ||
    target.closest(".monaco-editor") ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA"
  )
    return;
  e.preventDefault();
});

createRoot(document.getElementById("root")!).render(<App />);
