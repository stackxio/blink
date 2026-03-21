import { createRoot } from "react-dom/client";
import "./index.css";
import "./styles/main.scss";
import App from "./App";

// Prevent default browser context menu globally
// Allow in terminal, editor, and form inputs
document.addEventListener("contextmenu", (e) => {
  const target = e.target as HTMLElement;
  if (
    target.closest(".xterm") ||
    target.closest(".cm-editor") ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA"
  ) return;
  e.preventDefault();
});

createRoot(document.getElementById("root")!).render(<App />);
