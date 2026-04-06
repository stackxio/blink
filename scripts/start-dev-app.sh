#!/usr/bin/env bash
# Run dev server + build, then launch a minimal .app so the Dock shows our icon.
# Dev listener / hot reload works because the binary loads from the dev server.
# On non-macOS, fall back to normal tauri dev.
set -e
if [ "$(uname)" != "Darwin" ]; then
  cd "$(dirname "$0")/.." && exec env TAURI_DIR=core bun run tauri dev
fi
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CORE="$PROJECT_ROOT/core"
APP="$CORE/target/debug/Codrift.app"
DEV_URL="http://localhost:1420"

# 1. Start frontend dev server in background
echo "Starting dev server..."
(
  cd "$PROJECT_ROOT"
  exec bun run dev
) &
VITE_PID=$!
cleanup() {
  kill $VITE_PID 2>/dev/null || true
  rm -rf "$APP"
}
trap cleanup EXIT

# 2. Wait for Vite to be ready
echo "Waiting for $DEV_URL..."
for i in {1..30}; do
  if curl -s -o /dev/null -w "%{http_code}" "$DEV_URL" 2>/dev/null | grep -q 200; then
    break
  fi
  sleep 0.5
done
curl -s -o /dev/null "$DEV_URL" || { echo "Dev server did not become ready."; exit 1; }

# 3. Build Rust binary (debug) in dev mode so it uses devUrl instead of bundled assets
echo "Building app (dev mode)..."
touch "$CORE/build.rs"  # force icon re-embed on every dev launch
(cd "$CORE" && export DEP_TAURI_DEV=true && cargo build)

# 4. Create minimal .app bundle with a compiled Mach-O launcher (required for codesign)
mkdir -p "$APP/Contents/MacOS"
mkdir -p "$APP/Contents/Resources"

# Compile a tiny C launcher so the bundle has a real Mach-O binary (not a shell script).
# codesign requires a Mach-O main executable — shell scripts are not signable.
LAUNCHER_C="$CORE/target/debug/codrift_launcher.c"
LAUNCHER_BIN="$APP/Contents/MacOS/Codrift"

cat > "$LAUNCHER_C" << 'CSRC'
#include <unistd.h>
#include <stdlib.h>
#include <stdio.h>
int main(void) {
    char *binary = getenv("CODRIFT_BINARY");
    char *cwd    = getenv("CODRIFT_CWD");
    if (!binary) { fprintf(stderr, "CODRIFT_BINARY not set\n"); return 1; }
    if (cwd) chdir(cwd);
    execl(binary, binary, (char *)0);
    perror("execl"); return 1;
}
CSRC

cc -o "$LAUNCHER_BIN" "$LAUNCHER_C" -mmacosx-version-min=11.0

# Icon
cp "$CORE/icons/icon.icns" "$APP/Contents/Resources/"

# Info.plist — LSEnvironment passes paths to the C launcher
# LSMinimumSystemVersion 11.0 + NSHighResolutionCapable trigger the dock squircle mask
cat > "$APP/Contents/Info.plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>Codrift</string>
  <key>CFBundleIdentifier</key>
  <string>com.stackxio.codrift</string>
  <key>CFBundleName</key>
  <string>Codrift</string>
  <key>CFBundleIconFile</key>
  <string>icon.icns</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSPrincipalClass</key>
  <string>NSApplication</string>
  <key>LSEnvironment</key>
  <dict>
    <key>CODRIFT_BINARY</key>
    <string>$CORE/target/debug/codrift</string>
    <key>CODRIFT_CWD</key>
    <string>$CORE</string>
    <key>TAURI_DEV_URL</key>
    <string>$DEV_URL</string>
  </dict>
</dict>
</plist>
PLIST

# Ad-hoc codesign — now works because the main executable is a proper Mach-O binary
echo "Signing bundle..."
codesign --force --deep --sign - "$APP"

# Force macOS to re-read the bundle
touch "$APP"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP" 2>/dev/null || true

# 5. Open the .app (keeps running; trap will kill vite on script exit)
echo "Opening Codrift.app (dev)..."
open "$APP"

# Keep script running so vite stays up; Ctrl+C will kill both
wait $VITE_PID
