/**
 * Inline AI edit (Cmd+K) extension for CodeMirror.
 * When triggered, shows a floating prompt widget. On submit, calls the provided
 * callback with the selected text and instruction. The callback replaces the selection.
 */
import { EditorView, WidgetType, Decoration } from "@codemirror/view";
import { StateEffect, StateField } from "@codemirror/state";
import type { Extension } from "@codemirror/state";

// ── Effects ──

export const openInlineEdit = StateEffect.define<{ from: number; to: number }>();
export const closeInlineEdit = StateEffect.define<null>();

// ── State ──

interface InlineEditState {
  open: boolean;
  from: number;
  to: number;
}

const inlineEditField = StateField.define<InlineEditState>({
  create() {
    return { open: false, from: 0, to: 0 };
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(openInlineEdit)) {
        return { open: true, from: effect.value.from, to: effect.value.to };
      }
      if (effect.is(closeInlineEdit)) {
        return { open: false, from: 0, to: 0 };
      }
    }
    // Close if document changed
    if (tr.docChanged && value.open) {
      return { open: false, from: 0, to: 0 };
    }
    return value;
  },
  provide(field) {
    return EditorView.decorations.from(field, (state) => {
      if (!state.open) return Decoration.none;
      return Decoration.set([
        Decoration.widget({
          widget: new InlineEditWidget(state.from, state.to),
          side: 1,
          block: true,
        }).range(state.to),
      ]);
    });
  },
});

// ── Widget ──

class InlineEditWidget extends WidgetType {
  constructor(
    readonly from: number,
    readonly to: number,
  ) {
    super();
  }

  eq(other: InlineEditWidget) {
    return other.from === this.from && other.to === this.to;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-inline-edit";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "cm-inline-edit__input";
    input.placeholder = "Describe the edit… (Enter to apply, Esc to cancel)";
    input.setAttribute("spellcheck", "false");

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "cm-inline-edit__cancel";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      view.dispatch({ effects: closeInlineEdit.of(null) });
      view.focus();
    });

    wrapper.appendChild(input);
    wrapper.appendChild(cancelBtn);

    // Prevent editor from stealing focus
    wrapper.addEventListener("mousedown", (e) => e.stopPropagation());

    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        view.dispatch({ effects: closeInlineEdit.of(null) });
        view.focus();
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const instruction = input.value.trim();
        if (!instruction) return;
        // Disable input while processing
        input.disabled = true;
        input.value = "Generating…";
        cancelBtn.disabled = true;

        const selectedText = view.state.doc.sliceString(this.from, this.to);
        const event = new CustomEvent("caret:inline-edit", {
          detail: {
            from: this.from,
            to: this.to,
            selectedText,
            instruction,
            view,
          },
        });
        document.dispatchEvent(event);
      }
    });

    // Auto-focus the input after the widget is mounted
    requestAnimationFrame(() => input.focus());

    return wrapper;
  }

  ignoreEvent(e: Event) {
    // Don't let click/mousedown events bubble to CM
    return e.type !== "focus" && e.type !== "blur";
  }
}

// ── Key binding ──

export function createInlineEditKeymap() {
  return {
    key: "Mod-k",
    run(view: EditorView) {
      const selection = view.state.selection.main;
      if (selection.empty) return false;
      view.dispatch({
        effects: openInlineEdit.of({ from: selection.from, to: selection.to }),
      });
      return true;
    },
  };
}

// ── Main extension ──

export const inlineEditExtension: Extension = [inlineEditField];

// ── CSS (injected via EditorView.baseTheme) ──
export const inlineEditTheme = EditorView.baseTheme({
  ".cm-inline-edit": {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "6px 8px",
    margin: "2px 0",
    background: "var(--c-surface)",
    border: "1px solid var(--c-accent)",
    borderRadius: "var(--radius-sm)",
    boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
  },
  ".cm-inline-edit__input": {
    flex: "1",
    border: "none",
    background: "transparent",
    color: "var(--c-fg)",
    fontFamily: "var(--font-sans)",
    fontSize: "12px",
    outline: "none",
    "&::placeholder": { color: "var(--c-muted-fg)" },
  },
  ".cm-inline-edit__cancel": {
    border: "none",
    background: "transparent",
    color: "var(--c-muted-fg)",
    cursor: "pointer",
    fontFamily: "var(--font-sans)",
    fontSize: "11px",
    padding: "2px 6px",
    borderRadius: "4px",
    "&:hover": { color: "var(--c-fg)", background: "var(--c-surface-raised)" },
    "&:disabled": { opacity: 0.5, cursor: "default" },
  },
});
