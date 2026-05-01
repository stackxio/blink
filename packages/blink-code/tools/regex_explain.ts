/** Break down a regex pattern into its components with explanations. */

const TOKEN_DESCRIPTIONS: Array<[RegExp, (m: string) => string]> = [
  [/^\\d/, () => "any digit (0-9)"],
  [/^\\D/, () => "any non-digit"],
  [/^\\w/, () => "word character (a-z, A-Z, 0-9, _)"],
  [/^\\W/, () => "non-word character"],
  [/^\\s/, () => "whitespace (space, tab, newline)"],
  [/^\\S/, () => "non-whitespace"],
  [/^\\b/, () => "word boundary"],
  [/^\\B/, () => "non-word boundary"],
  [/^\\n/, () => "newline"],
  [/^\\t/, () => "tab"],
  [/^\\r/, () => "carriage return"],
  [/^\\\\/, () => "literal backslash"],
  [/^\\\./, () => "literal period"],
  [/^\\\//, () => "literal slash"],
  [/^\\\(/, () => "literal opening paren"],
  [/^\\\)/, () => "literal closing paren"],
  [/^\\\[/, () => "literal opening bracket"],
  [/^\\\]/, () => "literal closing bracket"],
  [/^\\u[0-9a-fA-F]{4}/, (m) => `Unicode character ${m}`],
  [/^\\x[0-9a-fA-F]{2}/, (m) => `hex character ${m}`],
  [/^\(\?:/, () => "non-capturing group start"],
  [/^\(\?=/, () => "positive lookahead start"],
  [/^\(\?!/, () => "negative lookahead start"],
  [/^\(\?<=/, () => "positive lookbehind start"],
  [/^\(\?<!/, () => "negative lookbehind start"],
  [/^\(\?<\w+>/, (m) => `named group "${m.slice(3, -1)}" start`],
  [/^\(/, () => "capturing group start"],
  [/^\)/, () => "group end"],
  [/^\[\^/, () => "negated character class start"],
  [/^\[/, () => "character class start"],
  [/^\]/, () => "character class end"],
  [/^\.\*\?/, () => "any characters (lazy)"],
  [/^\.\+\?/, () => "one or more any (lazy)"],
  [/^\.\*/, () => "any characters (greedy)"],
  [/^\.\+/, () => "one or more any (greedy)"],
  [/^\./, () => "any single character (except newline)"],
  [/^\*\?/, () => "zero or more (lazy)"],
  [/^\*/, () => "zero or more (greedy)"],
  [/^\+\?/, () => "one or more (lazy)"],
  [/^\+/, () => "one or more (greedy)"],
  [/^\?/, () => "optional (zero or one)"],
  [/^\^/, () => "start of line/string"],
  [/^\$/, () => "end of line/string"],
  [/^\|/, () => "OR alternation"],
  [/^\{(\d+),(\d+)\}/, (m) => `between ${m.match(/\{(\d+),(\d+)\}/)![1]} and ${m.match(/\{(\d+),(\d+)\}/)![2]} times`],
  [/^\{(\d+),\}/, (m) => `${m.match(/\{(\d+),\}/)![1]} or more times`],
  [/^\{(\d+)\}/, (m) => `exactly ${m.match(/\{(\d+)\}/)![1]} times`],
];

export async function regex_explain(input: Record<string, unknown>): Promise<string> {
  const pattern = input["pattern"] as string;
  if (!pattern) return "Error: pattern is required.";

  // Validate
  try {
    new RegExp(pattern);
  } catch (e) {
    return `Invalid regex: ${String(e)}`;
  }

  const lines: string[] = [`Pattern: /${pattern}/`, ""];
  let i = 0;
  while (i < pattern.length) {
    const remainder = pattern.slice(i);
    let matched = false;
    for (const [re, fn] of TOKEN_DESCRIPTIONS) {
      const m = remainder.match(re);
      if (m) {
        lines.push(`  ${m[0].padEnd(8)} — ${fn(m[0])}`);
        i += m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      const c = pattern[i];
      lines.push(`  ${c.padEnd(8)} — literal "${c}"`);
      i++;
    }
  }
  return lines.join("\n");
}

export const def = {
  name: "regex_explain",
  description:
    "Break down a regex pattern into its components with plain-English explanations. Useful for understanding unfamiliar regular expressions.",
  parameters: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "Regex pattern (without delimiting slashes)",
      },
    },
    required: ["pattern"],
  },
};
