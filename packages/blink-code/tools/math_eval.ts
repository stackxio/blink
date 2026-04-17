/** Safely evaluate a mathematical expression. */

// Safe math evaluator — only allows numbers, operators, and a whitelist of functions
function safeMathEval(expr: string): number {
  // Sanitize: only allow numbers, operators, parentheses, dots, spaces, and known function names
  const cleaned = expr
    .replace(/\s+/g, " ")
    .trim();

  const allowed = /^[0-9+\-*/%.^() e,]+$/i;
  const functions = /\b(Math\.)?(abs|ceil|floor|round|sqrt|cbrt|pow|log|log2|log10|sin|cos|tan|asin|acos|atan|atan2|min|max|PI|E|hypot|sign|trunc|exp)\b/gi;

  // Replace function names with Math.xxx equivalents
  const withMath = cleaned.replace(functions, (m) => {
    const fn = m.replace(/^Math\./i, "");
    const mathFns = new Set(["abs","ceil","floor","round","sqrt","cbrt","pow","log","log2","log10","sin","cos","tan","asin","acos","atan","atan2","min","max","hypot","sign","trunc","exp"]);
    if (mathFns.has(fn.toLowerCase())) return `Math.${fn.toLowerCase()}`;
    if (fn.toUpperCase() === "PI") return "Math.PI";
    if (fn.toUpperCase() === "E") return "Math.E";
    return m;
  });

  // Check remaining chars are safe
  const stripped = withMath.replace(/Math\.\w+/g, "1").replace(/[0-9+\-*/%.^() ,]/g, "");
  if (stripped.trim().length > 0) {
    throw new Error(`Unsafe expression: unexpected characters "${stripped.trim()}"`);
  }

  // Replace ^ with ** for exponentiation
  const normalized = withMath.replace(/\^/g, "**");

  // eslint-disable-next-line no-new-func
  const result = Function(`"use strict"; return (${normalized})`)();
  if (typeof result !== "number") throw new Error("Result is not a number");
  return result;
}

export async function math_eval(input: Record<string, unknown>): Promise<string> {
  const expression = input["expression"] as string;

  if (!expression || typeof expression !== "string") {
    return "Error: expression is required.";
  }

  try {
    const result = safeMathEval(expression);
    if (!isFinite(result)) return `Result: ${result} (not a finite number)`;

    // Format nicely: no trailing zeros for round numbers
    const formatted = Number.isInteger(result) ? String(result) : result.toPrecision(10).replace(/\.?0+$/, "");
    return `${expression} = ${formatted}`;
  } catch (e) {
    return `Error: ${String(e)}`;
  }
}

export const def = {
  name: "math_eval",
  description:
    "Safely evaluate a mathematical expression. Supports +, -, *, /, %, ^ (power), parentheses, and common Math functions (abs, ceil, floor, sqrt, pow, log, sin, cos, PI, E, min, max, etc.).",
  parameters: {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description: "Mathematical expression to evaluate (e.g. '2^10', 'sqrt(144)', 'sin(PI/2)', 'max(3, 7) * 4')",
      },
    },
    required: ["expression"],
  },
};
