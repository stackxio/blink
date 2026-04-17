import { readFile, stat } from "node:fs/promises";
import { resolve, extname } from "node:path";

/** Read basic metadata from image files (PNG, JPEG, GIF, WebP, BMP). */

function readUint32BE(buf: Buffer, offset: number): number {
  return (buf[offset] << 24 | buf[offset + 1] << 16 | buf[offset + 2] << 8 | buf[offset + 3]) >>> 0;
}

function readUint32LE(buf: Buffer, offset: number): number {
  return (buf[offset] | buf[offset + 1] << 8 | buf[offset + 2] << 16 | buf[offset + 3] << 24) >>> 0;
}

function readUint16LE(buf: Buffer, offset: number): number {
  return buf[offset] | buf[offset + 1] << 8;
}

function parsePng(buf: Buffer): { width: number; height: number; colorType: string } | null {
  // PNG signature: 137 80 78 71 13 10 26 10
  if (buf.length < 24 || buf[0] !== 0x89 || buf[1] !== 0x50) return null;
  const width = readUint32BE(buf, 16);
  const height = readUint32BE(buf, 20);
  const colorTypes = ["Grayscale", "", "RGB", "Indexed", "Grayscale+Alpha", "", "RGBA"];
  const colorType = colorTypes[buf[25]] ?? "Unknown";
  return { width, height, colorType };
}

function parseJpeg(buf: Buffer): { width: number; height: number } | null {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length - 8) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    const len = (buf[i + 2] << 8) | buf[i + 3];
    // SOF markers: 0xC0-0xC3, 0xC5-0xC7, 0xC9-0xCB, 0xCD-0xCF
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7)) {
      const height = (buf[i + 5] << 8) | buf[i + 6];
      const width = (buf[i + 7] << 8) | buf[i + 8];
      return { width, height };
    }
    i += 2 + len;
  }
  return null;
}

function parseGif(buf: Buffer): { width: number; height: number } | null {
  // GIF87a or GIF89a
  if (buf.length < 10 || buf[0] !== 0x47 || buf[1] !== 0x49 || buf[2] !== 0x46) return null;
  const width = readUint16LE(buf, 6);
  const height = readUint16LE(buf, 8);
  return { width, height };
}

function parseBmp(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 26 || buf[0] !== 0x42 || buf[1] !== 0x4d) return null;
  const width = readUint32LE(buf, 18);
  const height = Math.abs(readUint32LE(buf, 22));
  return { width, height };
}

function parseWebp(buf: Buffer): { width: number; height: number } | null {
  // RIFF????WEBPVP8L or VP8_
  if (buf.length < 30 || buf.toString("ascii", 0, 4) !== "RIFF") return null;
  if (buf.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = buf.toString("ascii", 12, 16);
  if (chunk === "VP8L") {
    const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
    const width = (((b1 & 0x3f) << 8) | b0) + 1;
    const height = ((((b3 & 0x0f) << 10) | (b2 << 2)) | ((b1 & 0xc0) >> 6)) + 1;
    return { width, height };
  }
  if (chunk === "VP8 ") {
    const width = readUint16LE(buf, 26) & 0x3fff;
    const height = readUint16LE(buf, 28) & 0x3fff;
    return { width, height };
  }
  return null;
}

export async function image_info(input: Record<string, unknown>): Promise<string> {
  const filePath = input["path"] as string;
  const root = (input["root"] as string) || process.cwd();

  if (!filePath) return "Error: path is required.";

  const absPath = filePath.startsWith("/") ? filePath : resolve(root, filePath);

  let fileSize: number;
  try {
    const s = await stat(absPath);
    fileSize = s.size;
  } catch (e) {
    return `File not found: ${String(e)}`;
  }

  const ext = extname(absPath).toLowerCase();
  const supportedExts = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"];

  if (!supportedExts.includes(ext)) {
    return `Unsupported image format: ${ext}. Supported: PNG, JPEG, GIF, WebP, BMP`;
  }

  // Read first 64KB for header parsing
  let buf: Buffer;
  try {
    buf = Buffer.from(await readFile(absPath));
  } catch (e) {
    return `Error reading file: ${String(e)}`;
  }

  const sizeStr = fileSize > 1024 * 1024
    ? `${(fileSize / 1024 / 1024).toFixed(2)} MB`
    : `${(fileSize / 1024).toFixed(1)} KB`;

  let dims: { width: number; height: number } | null = null;
  let extra = "";

  if (ext === ".png") {
    const info = parsePng(buf);
    if (info) { dims = info; extra = `Color type: ${info.colorType}`; }
  } else if (ext === ".jpg" || ext === ".jpeg") {
    dims = parseJpeg(buf);
  } else if (ext === ".gif") {
    dims = parseGif(buf);
  } else if (ext === ".bmp") {
    dims = parseBmp(buf);
  } else if (ext === ".webp") {
    dims = parseWebp(buf);
  }

  const lines = [
    `File: ${filePath}`,
    `Format: ${ext.slice(1).toUpperCase()}`,
    `Size: ${sizeStr} (${fileSize.toLocaleString()} bytes)`,
    dims ? `Dimensions: ${dims.width} × ${dims.height} px` : "Dimensions: (could not parse)",
    dims ? `Aspect ratio: ${(dims.width / dims.height).toFixed(3)}` : null,
    extra || null,
    dims ? `Megapixels: ${((dims.width * dims.height) / 1_000_000).toFixed(2)} MP` : null,
  ];

  return lines.filter(Boolean).join("\n");
}

export const def = {
  name: "image_info",
  description:
    "Read metadata from image files (PNG, JPEG, GIF, WebP, BMP): dimensions, file size, color type, aspect ratio, and megapixels.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the image file (absolute or relative to root)",
      },
      root: {
        type: "string",
        description: "Base directory for relative paths (default: current workspace)",
      },
    },
    required: ["path"],
  },
};
