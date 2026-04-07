import { createRoot } from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./styles/main.scss";
import App from "./App";

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

const root = createRoot(document.getElementById("root")!);
root.render(<App />);

// Show the window only after the first paint to avoid the white-flash on launch.
// The window starts hidden (visible: false in tauri.conf.json).
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    getCurrentWindow().show().catch(() => {});
  });
});
