#!/usr/bin/env node
/**
 * Prepares core/app-icon.png for Tauri icon generation.
 *
 * macOS Tahoe (and Big Sur+) applies the squircle mask automatically for
 * ad-hoc or properly signed apps — the icon should be a full-bleed 1024x1024
 * square with NO pre-baked transparency. The OS clips the corners itself.
 *
 * Pre-baking a squircle fights with the system mask and makes the icon appear
 * larger than other dock icons.
 */
import sharp from "sharp";
import { renameSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "core/app-icon.png");
const TMP = "/tmp/blink-icon-src.png";
const SIZE = 1024;

const { width, height } = await sharp(SRC).metadata();

if (width === SIZE && height === SIZE) {
  // Already 1024x1024 — just flatten any transparency to white (full-bleed)
  renameSync(SRC, TMP);
  await sharp(TMP).resize(SIZE, SIZE).flatten({ background: "#ffffff" }).png().toFile(SRC);
} else {
  // Resize/pad smaller source to 1024x1024 on white background
  renameSync(SRC, TMP);
  await sharp(TMP)
    .resize(SIZE, SIZE, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .flatten({ background: "#ffffff" })
    .png()
    .toFile(SRC);
}

console.log("✓ Icon prepared — full-bleed 1024x1024 (macOS Tahoe applies squircle mask)");
