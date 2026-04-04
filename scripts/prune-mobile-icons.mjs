#!/usr/bin/env node

import { rmSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const mobileDirs = [join(ROOT, "core/icons/ios"), join(ROOT, "core/icons/android")];

for (const dir of mobileDirs) {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
    console.log(`Removed ${dir}`);
  }
}
