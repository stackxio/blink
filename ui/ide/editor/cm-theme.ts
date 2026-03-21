import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/**
 * Dark theme syntax colors — based on VS Code Dark+ / One Dark.
 */
const darkHighlight = HighlightStyle.define([
  // Keywords: if, else, return, func, type, struct, import, package
  { tag: t.keyword, color: "#c586c0" },
  { tag: t.controlKeyword, color: "#c586c0" },
  { tag: t.moduleKeyword, color: "#c586c0" },
  { tag: t.operatorKeyword, color: "#c586c0" },

  // Types & classes
  { tag: t.typeName, color: "#4ec9b0" },
  { tag: t.className, color: "#4ec9b0" },
  { tag: t.namespace, color: "#4ec9b0" },

  // Functions
  { tag: t.function(t.variableName), color: "#dcdcaa" },
  { tag: t.function(t.propertyName), color: "#dcdcaa" },
  { tag: t.definition(t.function(t.variableName)), color: "#dcdcaa" },

  // Variables & properties
  { tag: t.variableName, color: "#9cdcfe" },
  { tag: t.definition(t.variableName), color: "#9cdcfe" },
  { tag: t.propertyName, color: "#9cdcfe" },

  // Strings
  { tag: t.string, color: "#ce9178" },
  { tag: t.special(t.string), color: "#d7ba7d" }, // template literals

  // Numbers
  { tag: t.number, color: "#b5cea8" },
  { tag: t.bool, color: "#569cd6" },
  { tag: t.null, color: "#569cd6" },

  // Comments
  { tag: t.comment, color: "#6a9955", fontStyle: "italic" },
  { tag: t.lineComment, color: "#6a9955", fontStyle: "italic" },
  { tag: t.blockComment, color: "#6a9955", fontStyle: "italic" },

  // Operators & punctuation
  { tag: t.operator, color: "#d4d4d4" },
  { tag: t.punctuation, color: "#d4d4d4" },
  { tag: t.bracket, color: "#d4d4d4" },
  { tag: t.separator, color: "#d4d4d4" },

  // Tags (HTML/XML)
  { tag: t.tagName, color: "#569cd6" },
  { tag: t.attributeName, color: "#9cdcfe" },
  { tag: t.attributeValue, color: "#ce9178" },

  // Regex
  { tag: t.regexp, color: "#d16969" },

  // Meta / annotations
  { tag: t.meta, color: "#569cd6" },
  { tag: t.annotation, color: "#dcdcaa" },

  // Constants
  { tag: t.constant(t.variableName), color: "#4fc1ff" },

  // Headings (Markdown)
  { tag: t.heading, color: "#569cd6", fontWeight: "bold" },
  { tag: t.heading1, color: "#569cd6", fontWeight: "bold" },
  { tag: t.heading2, color: "#569cd6", fontWeight: "bold" },

  // Links
  { tag: t.link, color: "#569cd6", textDecoration: "underline" },
  { tag: t.url, color: "#569cd6" },

  // Emphasis
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "bold" },
]);

export const darkSyntaxHighlighting = syntaxHighlighting(darkHighlight);
