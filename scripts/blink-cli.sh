#!/bin/bash
# Blink CLI — open files/folders in Blink from the terminal
# Usage: blink [path]  — opens path (file or folder) in Blink
#        blink .       — opens current directory
#        blink         — launches Blink

APP_NAME="Blink"
APP_BUNDLE="com.voxire.blink"

if [ -z "$1" ]; then
  # No args — just launch the app
  open -b "$APP_BUNDLE" 2>/dev/null || open -a "$APP_NAME" 2>/dev/null
  exit 0
fi

# Resolve to absolute path
TARGET=$(cd "$(dirname "$1")" 2>/dev/null && echo "$(pwd)/$(basename "$1")" || echo "$1")

# Open the app with the path as argument
open -b "$APP_BUNDLE" --args "$TARGET" 2>/dev/null || open -a "$APP_NAME" --args "$TARGET" 2>/dev/null
