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
APP="$CORE/target/debug/Blink.app"
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
(cd "$CORE" && export DEP_TAURI_DEV=true && cargo build)

# 4. Create minimal .app bundle with icon so Dock shows it
mkdir -p "$APP/Contents/MacOS"
mkdir -p "$APP/Contents/Resources"

# Launcher: run binary from target/debug (so it finds config) as a child; we stay main process so Dock keeps our icon
cat > "$APP/Contents/MacOS/Blink" << LAUNCHER
#!/bin/bash
CORE="$CORE"
cd "\$CORE"
export TAURI_DEV_URL="$DEV_URL"
"\$CORE/target/debug/blink"
LAUNCHER
chmod +x "$APP/Contents/MacOS/Blink"

# Icon
cp "$CORE/icons/icon.icns" "$APP/Contents/Resources/"

# Info.plist
cat > "$APP/Contents/Info.plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>Blink</string>
  <key>CFBundleIdentifier</key>
  <string>com.voxire.blink</string>
  <key>CFBundleName</key>
  <string>Blink</string>
  <key>CFBundleIconFile</key>
  <string>icon.icns</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSMinimumSystemVersion</key>
  <string>10.13</string>
</dict>
</plist>
PLIST

# 5. Open the .app (keeps running; trap will kill vite on script exit)
echo "Opening Blink.app (dev)..."
open "$APP"

# Keep script running so vite stays up; Ctrl+C will kill both
wait $VITE_PID
