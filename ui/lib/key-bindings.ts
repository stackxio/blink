export interface Binding {
  id: string;
  label: string;
  defaultKey: string;
}

export const BINDINGS: Binding[] = [
  { id: "go_to_file", label: "Go to file", defaultKey: "Meta+p" },
  { id: "command_palette", label: "Command palette", defaultKey: "Meta+Shift+p" },
  { id: "toggle_sidebar", label: "Toggle sidebar", defaultKey: "Meta+b" },
  { id: "toggle_ai_panel", label: "Toggle AI panel", defaultKey: "Meta+l" },
  { id: "toggle_terminal", label: "Toggle terminal", defaultKey: "Ctrl+`" },
  { id: "search_in_files", label: "Search in files", defaultKey: "Meta+Shift+f" },
  { id: "find_in_file", label: "Find in file", defaultKey: "Meta+f" },
  { id: "go_to_line", label: "Go to line", defaultKey: "Meta+g" },
  { id: "close_tab", label: "Close tab", defaultKey: "Meta+w" },
  { id: "next_tab", label: "Next tab", defaultKey: "Meta+Tab" },
  { id: "previous_tab", label: "Previous tab", defaultKey: "Meta+Shift+Tab" },
  { id: "open_file", label: "Open file", defaultKey: "Meta+o" },
  { id: "save_file", label: "Save file", defaultKey: "Meta+s" },
  { id: "open_settings", label: "Settings", defaultKey: "Meta+," },
  { id: "symbol_search_workspace", label: "Go to symbol in workspace", defaultKey: "Meta+t" },
  { id: "symbol_search_document", label: "Go to symbol in file", defaultKey: "Meta+Shift+o" },
  { id: "go_to_definition", label: "Go to definition", defaultKey: "F12" },
  { id: "peek_definition", label: "Peek definition", defaultKey: "Alt+F12" },
];

/**
 * JetBrains macOS keymap overrides.
 * Only bindings that differ from the VS Code defaults are listed here.
 */
export const JETBRAINS_DEFAULTS: Partial<Record<string, string>> = {
  go_to_file: "Meta+Shift+o",         // ⌘⇧O  Go to File
  command_palette: "Meta+Shift+a",     // ⌘⇧A  Find Action
  toggle_sidebar: "Meta+1",            // ⌘1   Project tool window
  toggle_ai_panel: "Meta+Shift+l",    // ⌘⇧L  AI panel (freeing ⌘L for Go to Line)
  toggle_terminal: "Alt+F12",          // ⌥F12 Terminal
  go_to_line: "Meta+l",               // ⌘L   Go to Line
  // next_tab / previous_tab: keep VS Code defaults (Meta+Tab / Meta+Shift+Tab)
  // symbol_search_workspace: keep VS Code default (Meta+t); ⌘⌥O uses Alt which produces ø on macOS
  symbol_search_document: "Meta+F12", // ⌘F12 File Structure
  go_to_definition: "Meta+b",         // ⌘B   Go to Declaration
  peek_definition: "Meta+y",          // ⌘Y   Quick Definition
};

export type Keymap = "vscode" | "jetbrains";

const STORAGE_KEY = "codrift:keybindings";
const KEYMAP_STORAGE_KEY = "codrift:keymap";

export type BindingMap = Record<string, string>;

export function loadBindings(): BindingMap {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function saveBindings(map: BindingMap) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function loadKeymap(): Keymap {
  const stored = localStorage.getItem(KEYMAP_STORAGE_KEY);
  return stored === "jetbrains" ? "jetbrains" : "vscode";
}

export function saveKeymap(keymap: Keymap) {
  localStorage.setItem(KEYMAP_STORAGE_KEY, keymap);
  window.dispatchEvent(
    new StorageEvent("storage", { key: KEYMAP_STORAGE_KEY, newValue: keymap }),
  );
}

export function effectiveKey(id: string, map: BindingMap, keymap: Keymap = "vscode"): string {
  // User override always wins
  if (map[id]) return map[id];
  // Keymap-specific default
  if (keymap === "jetbrains" && JETBRAINS_DEFAULTS[id]) return JETBRAINS_DEFAULTS[id]!;
  // VS Code default
  return BINDINGS.find((b) => b.id === id)?.defaultKey ?? "";
}

/** "Meta+n" → "⌘N", "Meta+Shift+p" → "⇧⌘P" */
export function formatKey(key: string): string {
  return key
    .split("+")
    .map((p) => {
      switch (p) {
        case "Meta":
          return "⌘";
        case "Ctrl":
          return "⌃";
        case "F12":
          return "F12";
        case "Alt":
          return "⌥";
        case "Shift":
          return "⇧";
        case ",":
          return ",";
        case "`":
          return "`";
        case "Tab":
          return "Tab";
        default:
          return p.toUpperCase();
      }
    })
    .join("");
}

export function matchesKey(e: KeyboardEvent, key: string): boolean {
  if (!key) return false;
  const parts = key.split("+");
  const mainKey = parts[parts.length - 1];
  const needsMeta = parts.includes("Meta"); // cross-platform: matches Cmd (macOS) or Ctrl (Win/Linux)
  const needsCtrl = parts.includes("Ctrl"); // literal Ctrl key (e.g. Ctrl+`)
  const needsShift = parts.includes("Shift");
  const needsAlt = parts.includes("Alt");

  if (needsMeta && !(e.metaKey || e.ctrlKey)) return false;
  if (!needsMeta && !needsCtrl && (e.metaKey || e.ctrlKey)) return false;
  if (needsCtrl && !e.ctrlKey) return false;
  if (needsShift !== e.shiftKey) return false;
  if (needsAlt !== e.altKey) return false;
  return e.key === mainKey || e.key.toLowerCase() === mainKey.toLowerCase();
}

/** Build a key string from a live KeyboardEvent for recording. */
export function keyFromEvent(e: KeyboardEvent): string | null {
  if (["Meta", "Control", "Shift", "Alt"].includes(e.key)) return null;
  const mods: string[] = [];
  if (e.metaKey || e.ctrlKey) mods.push("Meta");
  if (e.shiftKey) mods.push("Shift");
  if (e.altKey) mods.push("Alt");
  return [...mods, e.key].join("+");
}
