#!/usr/bin/env node
/**
 * Bakes the macOS squircle mask into core/app-icon.png before icon generation.
 * Drop any 1024x1024 PNG into core/app-icon.png, then run: bun run icon
 */
import sharp from "sharp";
import { renameSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "core/app-icon.png");
const TMP = "/tmp/blink-icon-src.png";
const SIZE = 1024;
const RADIUS = 224;

const mask = await sharp(
  Buffer.from(
    `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${SIZE}" height="${SIZE}" rx="${RADIUS}" ry="${RADIUS}" fill="white"/>
    </svg>`,
  ),
)
  .png()
  .toBuffer();

renameSync(SRC, TMP);
await sharp(TMP)
  .resize(SIZE, SIZE)
  .ensureAlpha()
  .composite([{ input: mask, blend: "dest-in" }])
  .png()
  .toFile(SRC);

console.log("✓ Squircle mask applied to core/app-icon.png");
