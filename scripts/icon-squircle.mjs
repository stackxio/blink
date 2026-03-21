#!/usr/bin/env node
/**
 * Apply macOS squircle (rounded rect) mask to the 1024x1024 app icon
 * so the Dock shows rounded corners. macOS does not auto-apply the mask;
 * the icon art must have transparent corners.
 *
 * Reads: core/icons/icon.iconset/icon_1024x1024.png
 * Writes: core/app-icon.png (then runs `pnpm icon` to regenerate .icns etc.)
 */

import sharp from "sharp";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ICON_1024 = join(ROOT, "core/icons/icon.iconset/icon_1024x1024.png");
const OUT = join(ROOT, "core/app-icon.png");

// macOS app icon squircle: corner radius ~230px for 1024pt (~22.5% per Apple HIG)
const SIZE = 1024;
const RADIUS = 230;

const squircleSvg = `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${SIZE}" height="${SIZE}" rx="${RADIUS}" ry="${RADIUS}" fill="white"/>
</svg>`;

async function main() {
  const maskBuffer = Buffer.from(squircleSvg);
  const mask = await sharp(maskBuffer).png().toBuffer();

  const icon = await sharp(ICON_1024).ensureAlpha();
  const masked = await icon.composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();

  writeFileSync(OUT, masked);
  console.log("Wrote", OUT);

  console.log("Regenerating icon set with tauri icon...");
  execSync("pnpm icon core/app-icon.png", {
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
