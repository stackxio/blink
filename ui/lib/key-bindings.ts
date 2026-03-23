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
];

const STORAGE_KEY = "caret:keybindings";

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

export function effectiveKey(id: string, map: BindingMap): string {
  return map[id] ?? BINDINGS.find((b) => b.id === id)?.defaultKey ?? "";
}

/** "Meta+n" → "⌘N", "Meta+Shift+p" → "⇧⌘P" */
export function formatKey(key: string): string {
  return key
    .split("+")
    .map((p) => {
      switch (p) {
        case "Meta": return "⌘";
        case "Ctrl": return "⌃";
        case "Alt": return "⌥";
        case "Shift": return "⇧";
        case ",": return ",";
        case "`": return "`";
        case "Tab": return "Tab";
        default: return p.toUpperCase();
      }
    })
    .join("");
}

export function matchesKey(e: KeyboardEvent, key: string): boolean {
  if (!key) return false;
  const parts = key.split("+");
  const mainKey = parts[parts.length - 1];
  const needsMeta = parts.includes("Meta");
  const needsShift = parts.includes("Shift");
  const needsAlt = parts.includes("Alt");

  if (needsMeta !== (e.metaKey || e.ctrlKey)) return false;
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
