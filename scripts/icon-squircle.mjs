#!/usr/bin/env node
/**
 * Generate a macOS-friendly app icon export from the 1024 source art.
 *
 * Apple’s current icon guidance uses a rounded-rectangle mask and a roomier
 * icon grid. Because our Tauri desktop pipeline consumes a flat PNG/.icns
 * rather than an Icon Composer asset catalog, we approximate that look by:
 * 1. shrinking the full-bleed source art into an inset canvas
 * 2. applying the rounded-rectangle mask to the inset art
 * 3. exporting a transparent 1024x1024 icon for Tauri to convert
 *
 * Reads: core/icons/icon.iconset/icon_1024x1024.png
 * Writes: core/app-icon.png (then runs `bun run icon` to regenerate .icns etc.)
 */

import sharp from "sharp";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "core/app-icon.png");

const SIZE = 1024;
const CARD_SIZE = 848;
const CARD_INSET = Math.round((SIZE - CARD_SIZE) / 2);
const CARD_RADIUS = Math.round(CARD_SIZE * 0.225);

const SOURCE = join(ROOT, "core/icons/icon.iconset/icon_1024x1024.png");

const squircleMaskSvg = `<svg width="${CARD_SIZE}" height="${CARD_SIZE}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${CARD_SIZE}" height="${CARD_SIZE}" rx="${CARD_RADIUS}" ry="${CARD_RADIUS}" fill="white"/>
</svg>`;

async function main() {
  // Resize source to card size, apply squircle mask, place on transparent canvas
  const mask = await sharp(Buffer.from(squircleMaskSvg)).png().toBuffer();

  const card = await sharp(SOURCE)
    .resize(CARD_SIZE, CARD_SIZE)
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();

  const masked = await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: card, left: CARD_INSET, top: CARD_INSET }])
    .png()
    .toBuffer();

  writeFileSync(OUT, masked);
  console.log("Wrote", OUT);

  console.log("Regenerating desktop icon set...");
  execSync("bun run icon", {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, TAURI_DIR: "core" },
  });
  console.log("Done. Rebuild the app to see the rounded icon in the Dock.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
