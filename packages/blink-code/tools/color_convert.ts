/** Convert colors between HEX, RGB, HSL, HSV, and CSS color names. */

const CSS_COLORS: Record<string, string> = {
  red: "#ff0000", green: "#008000", blue: "#0000ff", white: "#ffffff", black: "#000000",
  yellow: "#ffff00", cyan: "#00ffff", magenta: "#ff00ff", orange: "#ffa500", purple: "#800080",
  pink: "#ffc0cb", brown: "#a52a2a", gray: "#808080", grey: "#808080", lime: "#00ff00",
  navy: "#000080", teal: "#008080", olive: "#808000", silver: "#c0c0c0", maroon: "#800000",
  aqua: "#00ffff", fuchsia: "#ff00ff", coral: "#ff7f50", salmon: "#fa8072", gold: "#ffd700",
  indigo: "#4b0082", violet: "#ee82ee", turquoise: "#40e0d0", crimson: "#dc143c",
};

function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.replace(/^#/, "");
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  if (h.length === 6) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }
  return null;
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6;
  else if (max === gg) h = ((bb - rr) / d + 2) / 6;
  else h = ((rr - gg) / d + 4) / 6;
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const ss = s / 100, ll = l / 100;
  const a = ss * Math.min(ll, 1 - ll);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return ll - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function parseInput(color: string): [number, number, number] | null {
  const c = color.trim().toLowerCase();

  // CSS name
  if (CSS_COLORS[c]) return hexToRgb(CSS_COLORS[c]);

  // HEX
  if (c.startsWith("#") || /^[0-9a-f]{3,6}$/i.test(c)) {
    return hexToRgb(c.startsWith("#") ? c : `#${c}`);
  }

  // RGB
  const rgbMatch = c.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (rgbMatch) return [parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3])];

  // HSL
  const hslMatch = c.match(/hsl\s*\(\s*(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?\s*\)/);
  if (hslMatch) return hslToRgb(parseInt(hslMatch[1]), parseInt(hslMatch[2]), parseInt(hslMatch[3]));

  return null;
}

export async function color_convert(input: Record<string, unknown>): Promise<string> {
  const color = input["color"] as string;
  if (!color) return "Error: color is required.";

  const rgb = parseInput(color);
  if (!rgb) return `Cannot parse color: "${color}". Supported formats: #hex, rgb(r,g,b), hsl(h,s%,l%), or CSS color name.`;

  const [r, g, b] = rgb;
  const hex = rgbToHex(r, g, b);
  const [h, s, l] = rgbToHsl(r, g, b);

  // Luminance for contrast info
  const luminance = 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
  const contrastOnWhite = (1.05) / (luminance + 0.05);
  const contrastOnBlack = (luminance + 0.05) / (0.05);

  return [
    `Input: ${color}`,
    "",
    `HEX:  ${hex}`,
    `RGB:  rgb(${r}, ${g}, ${b})`,
    `HSL:  hsl(${h}, ${s}%, ${l}%)`,
    `HSL:  hsl(${h}deg ${s}% ${l}%)`,
    "",
    `Luminance: ${luminance.toFixed(3)}`,
    `Contrast vs white: ${contrastOnWhite.toFixed(2)}:1 ${contrastOnWhite >= 4.5 ? "✅ AA" : contrastOnWhite >= 3 ? "⚠️ AA Large" : "❌ fails AA"}`,
    `Contrast vs black: ${contrastOnBlack.toFixed(2)}:1 ${contrastOnBlack >= 4.5 ? "✅ AA" : contrastOnBlack >= 3 ? "⚠️ AA Large" : "❌ fails AA"}`,
    "",
    `Best readable on: ${luminance > 0.35 ? "dark (#000)" : "light (#fff)"} background`,
  ].join("\n");
}

export const def = {
  name: "color_convert",
  description:
    "Convert colors between HEX, RGB, and HSL formats. Also shows WCAG contrast ratios against black/white backgrounds for accessibility checking. Accepts CSS color names, #hex, rgb(), or hsl().",
  parameters: {
    type: "object",
    properties: {
      color: {
        type: "string",
        description: "Color to convert: '#ff5733', 'rgb(255, 87, 51)', 'hsl(14, 100%, 60%)', or CSS name like 'coral'",
      },
    },
    required: ["color"],
  },
};
