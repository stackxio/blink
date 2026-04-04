import { useEffect } from "react";
import type { BlinkTheme } from "./theme-schema";
import { blinkThemeToCssVars } from "./theme-schema";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "blink-theme";
const CUSTOM_THEME_KEY = "blink:custom-theme";
const CUSTOM_STYLE_ID = "blink-custom-theme";

export function getStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "dark";
}

export function setStoredTheme(theme: Theme) {
  localStorage.setItem(STORAGE_KEY, theme);
}

function getResolvedTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

function applyTheme(theme: Theme) {
  const resolved = getResolvedTheme(theme);
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(resolved);
  document.documentElement.style.colorScheme = resolved;
}

/** Call once at app root to keep the theme in sync. */
export function useTheme() {
  useEffect(() => {
    applyTheme(getStoredTheme());
    loadCustomTheme();

    // Listen for system theme changes when using "system" mode
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (getStoredTheme() === "system") applyTheme("system");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
}

/** Change theme, persist, and apply immediately. */
export function changeTheme(theme: Theme) {
  setStoredTheme(theme);
  applyTheme(theme);
}

// ── Custom theme (BlinkTheme JSON overrides) ─────────────────────────────────

function injectCustomThemeStyle(vars: Record<string, string>) {
  let el = document.getElementById(CUSTOM_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = CUSTOM_STYLE_ID;
    document.head.appendChild(el);
  }
  const body = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
  el.textContent = `:root {\n${body}\n}\nhtml.light {\n${body}\n}`;
}

function removeCustomThemeStyle() {
  document.getElementById(CUSTOM_STYLE_ID)?.remove();
}

/** Apply a BlinkTheme, inject CSS variables, and persist to localStorage. */
export function applyCustomTheme(theme: BlinkTheme) {
  const vars = blinkThemeToCssVars(theme);
  injectCustomThemeStyle(vars);
  // Also switch the base html class
  changeTheme(theme.type);
  localStorage.setItem(CUSTOM_THEME_KEY, JSON.stringify(theme));
}

/** Remove any active custom theme overrides. */
export function clearCustomTheme() {
  removeCustomThemeStyle();
  localStorage.removeItem(CUSTOM_THEME_KEY);
}

/** Load and re-apply persisted custom theme on startup. */
export function loadCustomTheme() {
  try {
    const stored = localStorage.getItem(CUSTOM_THEME_KEY);
    if (!stored) return;
    const theme = JSON.parse(stored) as BlinkTheme;
    const vars = blinkThemeToCssVars(theme);
    injectCustomThemeStyle(vars);
  } catch {}
}

export function getCustomTheme(): BlinkTheme | null {
  try {
    const stored = localStorage.getItem(CUSTOM_THEME_KEY);
    return stored ? (JSON.parse(stored) as BlinkTheme) : null;
  } catch {
    return null;
  }
}
