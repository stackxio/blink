/**
 * CodeMirror extension for merge conflict detection and highlighting.
 *
 * Highlights the three sections of a conflict marker:
 *   - <<<<<<< (ours)   → green tint
 *   - ======= (divider)
 *   - >>>>>>> (theirs)  → red tint
 *
 * Also exports a helper to find all conflicts in the current document.
 */

import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";

export interface ConflictRegion {
  oursStart: number; // line number (1-indexed) of <<<<<<<
  divider: number; // line number of =======
  theirsEnd: number; // line number of >>>>>>>
  oursFrom: number; // document offset start of ours block
  oursTo: number; // document offset end of ours block (exclusive)
  theirsFrom: number;
  theirsTo: number;
}

/** Parse all conflict regions from the editor state */
export function findConflicts(doc: {
  lines: number;
  line: (n: number) => { from: number; to: number; text: string };
}): ConflictRegion[] {
  const regions: ConflictRegion[] = [];
  let oursStart = -1;
  let oursFrom = -1;
  let dividerLine = -1;
  let dividerFrom = -1;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;
    if (text.startsWith("<<<<<<<")) {
      oursStart = i;
      oursFrom = line.from;
    } else if (text.startsWith("=======") && oursStart !== -1) {
      dividerLine = i;
      dividerFrom = line.from;
    } else if (text.startsWith(">>>>>>>") && oursStart !== -1 && dividerLine !== -1) {
      regions.push({
        oursStart,
        divider: dividerLine,
        theirsEnd: i,
        oursFrom,
        oursTo: dividerFrom,
        theirsFrom: dividerFrom,
        theirsTo: line.to,
      });
      oursStart = -1;
      dividerLine = -1;
    }
  }
  return regions;
}

// ── Decorations ──────────────────────────────────────────────────────────────

const oursMark = Decoration.mark({ class: "cm-conflict-ours" });
const theirsMark = Decoration.mark({ class: "cm-conflict-theirs" });
const markerMark = Decoration.mark({ class: "cm-conflict-marker" });

export const setConflictDecorations = StateEffect.define<DecorationSet>();

export const conflictDecorationField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setConflictDecorations)) return effect.value;
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function applyConflictDecorations(view: EditorView) {
  const conflicts = findConflicts(view.state.doc);
  if (conflicts.length === 0) {
    view.dispatch({ effects: setConflictDecorations.of(Decoration.none) });
    return;
  }

  const marks: ReturnType<typeof oursMark.range>[] = [];
  for (const c of conflicts) {
    const doc = view.state.doc;
    // Ours marker line
    const oursMarkerLine = doc.line(c.oursStart);
    marks.push(markerMark.range(oursMarkerLine.from, oursMarkerLine.to));
    // Ours content
    if (c.oursFrom < c.oursTo - 1) {
      const contentFrom = doc.line(c.oursStart + 1).from;
      const contentTo = doc.line(c.divider - 1).to;
      if (contentFrom < contentTo) {
        marks.push(oursMark.range(contentFrom, contentTo));
      }
    }
    // Divider line
    const dividerLine = doc.line(c.divider);
    marks.push(markerMark.range(dividerLine.from, dividerLine.to));
    // Theirs content
    const theirsContentFrom = doc.line(c.divider + 1).from;
    const theirsMarkerLine = doc.line(c.theirsEnd);
    if (theirsContentFrom < theirsMarkerLine.from) {
      marks.push(theirsMark.range(theirsContentFrom, theirsMarkerLine.from - 1));
    }
    // Theirs marker line
    marks.push(markerMark.range(theirsMarkerLine.from, theirsMarkerLine.to));
  }

  marks.sort((a, b) => a.from - b.from);
  const decoSet = Decoration.set(marks, true);
  view.dispatch({ effects: setConflictDecorations.of(decoSet) });
}

export const mergeConflictExtension = [conflictDecorationField];
