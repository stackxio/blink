#!/usr/bin/env node
/**
 * Bakes the macOS squircle mask into core/app-icon.png before icon generation.
 * Drop any 1024x1024 PNG into core/app-icon.png, then run: bun run icon
 *
 * Apple icon grid: squircle occupies ~90% of the canvas (≈920px),
 * centred with ~52px transparent margin on each side. Icons that go
 * edge-to-edge appear ~11% larger than system icons in the Dock.
 */
import sharp from "sharp";
import { renameSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "core/app-icon.png");
const TMP = "/tmp/blink-icon-src.png";

const CANVAS = 1024;
const CARD = Math.round(CANVAS * 0.9); // 922 — squircle size
const INSET = Math.round((CANVAS - CARD) / 2); // 51 — margin on each side
const RADIUS = Math.round(CARD * 0.2237); // 206 — matches Apple's squircle curve

// 1. Squircle mask at card size
const maskSvg = `<svg width="${CARD}" height="${CARD}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${CARD}" height="${CARD}" rx="${RADIUS}" ry="${RADIUS}" fill="white"/>
</svg>`;
const mask = await sharp(Buffer.from(maskSvg)).png().toBuffer();

// 2. Resize source to card size, apply mask
renameSync(SRC, TMP);
const card = await sharp(TMP)
  .resize(CARD, CARD)
  .ensureAlpha()
  .composite([{ input: mask, blend: "dest-in" }])
  .png()
  .toBuffer();

// 3. Place masked card on a transparent 1024x1024 canvas with the correct inset
await sharp({
  create: {
    width: CANVAS,
    height: CANVAS,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([{ input: card, left: INSET, top: INSET }])
  .png()
  .toFile(SRC);

console.log(`✓ Squircle applied — ${CARD}px card, ${INSET}px inset, radius ${RADIUS}`);
