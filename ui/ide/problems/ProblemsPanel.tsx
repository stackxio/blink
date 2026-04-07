import { useAppStore } from "@/store";

const SEVERITY_LABEL = ["", "Error", "Warning", "Info", "Hint"];
const SEVERITY_COLOR = [
  "",
  "var(--c-danger)",
  "var(--c-warning)",
  "var(--c-accent)",
  "var(--c-muted-fg)",
];

export default function ProblemsPanel() {
  const diagnostics = useAppStore((s) => s.diagnostics);
  const openFile = useAppStore((s) => s.openFile);

  const entries = Object.entries(diagnostics).flatMap(([uri, diags]) =>
    diags.map((d) => ({ ...d, uri })),
  );

  const errors = entries.filter((d) => d.severity === 1).length;
  const warnings = entries.filter((d) => d.severity === 2).length;

  function handleClick(uri: string, line: number, character: number) {
    const path = uri.replace("file://", "");
    const name = path.split("/").pop() || path;
    openFile(path, name, false, line + 1, character + 1);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "4px 12px",
          borderBottom: "1px solid var(--c-border)",
          fontSize: "var(--font-size-xs)",
          color: "var(--c-muted-fg)",
          flexShrink: 0,
        }}
      >
        <span style={{ color: errors > 0 ? "var(--c-danger)" : undefined }}>
          {errors} error{errors !== 1 ? "s" : ""}
        </span>
        <span style={{ color: warnings > 0 ? "var(--c-warning)" : undefined }}>
          {warnings} warning{warnings !== 1 ? "s" : ""}
        </span>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {entries.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              fontSize: "var(--font-size-xs)",
              color: "var(--c-muted-fg)",
            }}
          >
            No problems detected.
          </div>
        ) : (
          entries.map((entry, i) => {
            const filename = entry.uri.replace("file://", "").split("/").pop() ?? entry.uri;
            return (
              <button
                key={i}
                type="button"
                onClick={() => handleClick(entry.uri, entry.line, entry.character)}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  width: "100%",
                  padding: "5px 12px",
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid var(--c-border)",
                  textAlign: "left",
                  cursor: "pointer",
                  color: "var(--c-fg)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-surface-raised)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: 10,
                    fontWeight: 600,
                    color: SEVERITY_COLOR[entry.severity] ?? "var(--c-muted-fg)",
                    marginTop: 1,
                    minWidth: 48,
                  }}
                >
                  {SEVERITY_LABEL[entry.severity] ?? "Info"}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: "var(--font-size-xs)",
                    lineHeight: 1.4,
                    wordBreak: "break-word",
                  }}
                >
                  {entry.message}
                </span>
                <span
                  style={{ flexShrink: 0, fontSize: 10, color: "var(--c-muted-fg)", marginTop: 1 }}
                >
                  {filename}:{entry.line + 1}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
