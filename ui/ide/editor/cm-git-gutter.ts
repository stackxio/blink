import { gutter, GutterMarker, EditorView } from "@codemirror/view";
import { StateField, StateEffect, RangeSetBuilder } from "@codemirror/state";
import type { Extension } from "@codemirror/state";

// --- Types ---

export type GitChangeType = "added" | "modified";
export type GitChanges = Map<number, GitChangeType>; // line number (1-based) → type

// --- DOM markers ---

class GitGutterMarker extends GutterMarker {
  constructor(readonly type: GitChangeType) {
    super();
  }

  toDOM(): Element {
    const el = document.createElement("div");
    el.className = `cm-git-change cm-git-change--${this.type}`;
    return el;
  }

  eq(other: GutterMarker): boolean {
    return other instanceof GitGutterMarker && other.type === this.type;
  }
}

// --- State ---

export const setGitChanges = StateEffect.define<GitChanges>();

export const gitChangesField = StateField.define<GitChanges>({
  create() {
    return new Map();
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setGitChanges)) {
        return effect.value;
      }
    }
    return value;
  },
});

// --- Gutter extension ---

export const gitGutterExtension: Extension = [
  gitChangesField,
  gutter({
    class: "cm-git-gutter",
    markers(view) {
      const changes = view.state.field(gitChangesField);
      if (changes.size === 0) return new RangeSetBuilder<GutterMarker>().finish();
      const builder = new RangeSetBuilder<GutterMarker>();
      // RangeSetBuilder requires ranges to be added in order
      const sortedLines = Array.from(changes.keys()).sort((a, b) => a - b);
      for (const lineNo of sortedLines) {
        if (lineNo < 1 || lineNo > view.state.doc.lines) continue;
        try {
          const line = view.state.doc.line(lineNo);
          const type = changes.get(lineNo)!;
          builder.add(line.from, line.from, new GitGutterMarker(type));
        } catch {
          // Line might be out of range
        }
      }
      return builder.finish();
    },
    lineMarkerChange: (update) =>
      update.docChanged ||
      update.transactions.some((tr) => tr.effects.some((e) => e.is(setGitChanges))),
  }),
  EditorView.baseTheme({
    ".cm-git-gutter .cm-gutterElement": {
      padding: "0 2px",
    },
    ".cm-git-change": {
      width: "3px",
      height: "100%",
      borderRadius: "1px",
      display: "block",
    },
    ".cm-git-change--added": {
      background: "var(--c-success, #22c55e)",
    },
    ".cm-git-change--modified": {
      background: "var(--c-warning, #f59e0b)",
    },
  }),
];

// --- Diff parser ---

/**
 * Parse a unified diff and return a map of line number → change type
 * for the new version of the file.
 */
export function parseDiff(diff: string): GitChanges {
  const changes: GitChanges = new Map();
  if (!diff || diff.trim() === "(new file)") {
    return changes;
  }

  const lines = diff.split("\n");
  let newLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Hunk header: @@ -old_start[,old_len] +new_start[,new_len] @@
    if (line.startsWith("@@")) {
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
      if (match) {
        newLine = parseInt(match[1], 10) - 1;
      }
      continue;
    }

    // Skip file headers
    if (line.startsWith("---") || line.startsWith("+++") || line.startsWith("diff ") || line.startsWith("index ")) {
      continue;
    }

    if (line.startsWith("+")) {
      newLine++;
      // Determine if this is a modification (nearby deletion) or pure addition
      let hasNearbyDeletion = false;
      for (let j = Math.max(0, i - 8); j < i; j++) {
        if (lines[j].startsWith("-") && !lines[j].startsWith("---")) {
          hasNearbyDeletion = true;
          break;
        }
      }
      changes.set(newLine, hasNearbyDeletion ? "modified" : "added");
    } else if (line.startsWith("-")) {
      // Deletion — don't advance newLine
    } else if (!line.startsWith("\\")) {
      // Context line
      newLine++;
    }
  }

  return changes;
}
