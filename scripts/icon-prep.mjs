#!/usr/bin/env node
/**
 * Prepares core/app-icon.png for Tauri icon generation.
 *
 * Apple icon grid (exact HIG measurements):
 *   Canvas:  1024 × 1024
 *   Card:     824 × 824  (100px margin on each side — 80.5% of canvas)
 *   Radius:   184px      (22.37% of card — Apple's continuous-curvature squircle)
 *
 * Pre-baking at these exact dimensions means the icon matches what macOS Tahoe
 * would clip system icons to, so it appears the correct size alongside other apps.
 */
import sharp from "sharp";
import { renameSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "core/app-icon.png");
const TMP = "/tmp/blink-icon-src.png";

const CANVAS = 1024;
const CARD = 824; // Apple HIG exact content area
const INSET = 100; // Apple HIG exact margin
const RADIUS = 184; // 22.37% of 824 — Apple squircle curve

// 1. Squircle mask at card size
const maskSvg = `<svg width="${CARD}" height="${CARD}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${CARD}" height="${CARD}" rx="${RADIUS}" ry="${RADIUS}" fill="white"/>
</svg>`;
const mask = await sharp(Buffer.from(maskSvg)).png().toBuffer();

// 2. Resize source to card size, apply squircle mask
renameSync(SRC, TMP);
const card = await sharp(TMP)
  .resize(CARD, CARD)
  .flatten({ background: "#ffffff" })
  .ensureAlpha()
  .composite([{ input: mask, blend: "dest-in" }])
  .png()
  .toBuffer();

// 3. Place masked card centred on transparent 1024×1024 canvas
await sharp({
  create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([{ input: card, left: INSET, top: INSET }])
  .png()
  .toFile(SRC);

console.log(`✓ Icon prepared — ${CARD}px card, ${INSET}px margin, ${RADIUS}px radius (Apple HIG)`);
