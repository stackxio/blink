/** Convert basic Markdown to HTML (no external deps). Subset only. */

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inline(text: string): string {
  // Code spans
  text = text.replace(/`([^`]+)`/g, (_, c) => `<code>${escapeHtml(c)}</code>`);
  // Bold + italic
  text = text.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  text = text.replace(/_([^_]+)_/g, "<em>$1</em>");
  // Strikethrough
  text = text.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // Auto-link
  text = text.replace(/(?<!["=])(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
  return text;
}

export async function markdown_to_html(input: Record<string, unknown>): Promise<string> {
  const text = input["text"] as string;
  if (text == null) return "Error: text is required.";

  const lines = text.split("\n");
  const out: string[] = [];
  let inCode = false;
  let codeLang = "";
  let listType: "ul" | "ol" | null = null;
  let inPara = false;

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };
  const closePara = () => {
    if (inPara) {
      out.push("</p>");
      inPara = false;
    }
  };

  for (const lineRaw of lines) {
    const line = lineRaw;

    if (inCode) {
      if (line.startsWith("```")) {
        out.push("</code></pre>");
        inCode = false;
      } else {
        out.push(escapeHtml(line));
      }
      continue;
    }

    if (line.startsWith("```")) {
      closePara();
      closeList();
      codeLang = line.slice(3).trim();
      out.push(`<pre><code${codeLang ? ` class="language-${codeLang}"` : ""}>`);
      inCode = true;
      continue;
    }

    // Heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closePara();
      closeList();
      out.push(`<h${h[1].length}>${inline(escapeHtml(h[2]))}</h${h[1].length}>`);
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line)) {
      closePara();
      closeList();
      out.push("<hr>");
      continue;
    }

    // Unordered list
    const ul = line.match(/^[-*+]\s+(.*)$/);
    if (ul) {
      closePara();
      if (listType !== "ul") { closeList(); out.push("<ul>"); listType = "ul"; }
      out.push(`<li>${inline(escapeHtml(ul[1]))}</li>`);
      continue;
    }

    // Ordered list
    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ol) {
      closePara();
      if (listType !== "ol") { closeList(); out.push("<ol>"); listType = "ol"; }
      out.push(`<li>${inline(escapeHtml(ol[1]))}</li>`);
      continue;
    }

    // Blockquote
    const bq = line.match(/^>\s?(.*)$/);
    if (bq) {
      closePara();
      closeList();
      out.push(`<blockquote>${inline(escapeHtml(bq[1]))}</blockquote>`);
      continue;
    }

    if (line.trim() === "") {
      closePara();
      closeList();
      continue;
    }

    // Paragraph
    if (!inPara) {
      closeList();
      out.push("<p>");
      inPara = true;
    }
    out.push(inline(escapeHtml(line)));
  }
  closePara();
  closeList();
  if (inCode) out.push("</code></pre>");

  return out.join("\n");
}

export const def = {
  name: "markdown_to_html",
  description:
    "Convert Markdown to HTML using a built-in subset parser (no external dependencies). Supports headings, paragraphs, lists, links, code blocks, inline code, bold, italic, strikethrough, blockquotes, horizontal rules.",
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "Markdown source",
      },
    },
    required: ["text"],
  },
};
