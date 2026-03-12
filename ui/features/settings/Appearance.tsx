import { useState } from "react";
import { type Theme, getStoredTheme, changeTheme } from "@/lib/theme";

export default function SettingsAppearance() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);

  function handleThemeChange(t: Theme) {
    setTheme(t);
    changeTheme(t);
  }

  const themes: { value: Theme; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" },
  ];

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-foreground">Appearance</h1>

      <div className="space-y-1 rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm text-foreground">Theme</p>
            <p className="text-xs text-muted-foreground">Choose your preferred theme</p>
          </div>
          <div className="flex gap-1 rounded-md bg-input p-0.5">
            {themes.map((t) => (
              <button
                key={t.value}
                onClick={() => handleThemeChange(t.value)}
                className={`rounded px-2.5 py-1 text-xs transition-colors ${
                  theme === t.value
                    ? "bg-surface-raised text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm text-foreground">Font size</p>
            <p className="text-xs text-muted-foreground">Adjust the UI font size</p>
          </div>
          <span className="rounded-md bg-input px-2.5 py-1 text-xs text-foreground">
            13px
          </span>
        </div>
      </div>
    </div>
  );
}
