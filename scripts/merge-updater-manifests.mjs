#!/usr/bin/env node
/**
 * Generate latest.json for Tauri v2 auto-updater from build artifacts.
 *
 * Usage: node scripts/merge-updater-manifests.mjs <artifacts-dir> <version> <tag>
 *
 * Reads: <artifacts-dir>/<name>.app.tar.gz + <name>.app.tar.gz.sig
 * Writes: <artifacts-dir>/latest.json
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

const [, , dir, version, tag] = process.argv;

if (!dir || !version || !tag) {
  console.error("Usage: merge-updater-manifests.mjs <dir> <version> <tag>");
  process.exit(1);
}

const repo = process.env.GITHUB_REPOSITORY;
if (!repo) {
  console.error("GITHUB_REPOSITORY env var is required");
  process.exit(1);
}

const baseUrl = `https://github.com/${repo}/releases/download/${tag}`;
const files = readdirSync(dir);
const platforms = {};

for (const file of files) {
  if (!file.endsWith(".app.tar.gz")) continue;

  const sigPath = join(dir, `${file}.sig`);
  let signature;
  try {
    signature = readFileSync(sigPath, "utf8").trim();
  } catch {
    console.warn(`Skipping ${file} — no .sig found (updater signing not configured)`);
    continue;
  }

  let platform;
  if (file.includes("aarch64")) platform = "darwin-aarch64";
  else if (file.includes("x86_64") || file.includes("x64")) platform = "darwin-x86_64";
  else {
    console.warn(`Could not determine platform for ${file}, skipping`);
    continue;
  }

  platforms[platform] = {
    signature,
    url: `${baseUrl}/${encodeURIComponent(file)}`,
  };
}

if (Object.keys(platforms).length === 0) {
  console.warn("No signed updater artifacts found — skipping latest.json");
  process.exit(0);
}

const manifest = {
  version: tag.replace(/^v/, ""), // strip leading "v" so Tauri semver comparison works
  notes: "",
  pub_date: new Date().toISOString(),
  platforms,
};

const outPath = join(dir, "latest.json");
writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Wrote ${outPath} (platforms: ${Object.keys(platforms).join(", ")})`);
