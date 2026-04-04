import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/**
 * Syntax highlighting using CSS classes so colors are driven by CSS custom
 * properties (--hl-*) defined in _variables.scss / themes/_light.scss.
 * Switching the IDE theme automatically recolors the editor.
 */
const highlightStyle = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword], class: "hl-keyword" },
  { tag: [t.typeName, t.className, t.namespace], class: "hl-type" },
  {
    tag: [
      t.function(t.variableName),
      t.function(t.propertyName),
      t.definition(t.function(t.variableName)),
    ],
    class: "hl-function",
  },
  { tag: [t.variableName, t.definition(t.variableName)], class: "hl-variable" },
  { tag: t.propertyName, class: "hl-property" },
  { tag: t.string, class: "hl-string" },
  { tag: t.special(t.string), class: "hl-string-special" },
  { tag: t.number, class: "hl-number" },
  { tag: [t.bool, t.null], class: "hl-builtin" },
  { tag: [t.comment, t.lineComment, t.blockComment], class: "hl-comment" },
  { tag: [t.operator, t.punctuation, t.bracket, t.separator], class: "hl-punctuation" },
  { tag: [t.tagName], class: "hl-tag" },
  { tag: t.attributeName, class: "hl-attr-name" },
  { tag: t.attributeValue, class: "hl-attr-value" },
  { tag: t.regexp, class: "hl-regexp" },
  { tag: [t.meta, t.annotation], class: "hl-meta" },
  { tag: t.constant(t.variableName), class: "hl-constant" },
  { tag: [t.heading, t.heading1, t.heading2, t.heading3], class: "hl-heading" },
  { tag: [t.link, t.url], class: "hl-link" },
  { tag: t.emphasis, class: "hl-em" },
  { tag: t.strong, class: "hl-strong" },
]);

export const darkSyntaxHighlighting = syntaxHighlighting(highlightStyle);
