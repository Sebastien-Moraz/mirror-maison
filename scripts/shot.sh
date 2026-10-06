#!/usr/bin/env bash
# Capture d'écran de la page (dev) : scripts/shot.sh [url] [sortie.png]
URL=${1:-http://localhost:8090/}
OUT=${2:-/tmp/miroir.png}
chromium-browser --headless=new --hide-scrollbars --window-size=1080,1920 --force-device-scale-factor=1 \
  --use-angle=swiftshader --enable-unsafe-swiftshader --virtual-time-budget=10000 \
  --screenshot="$OUT" "$URL" >/dev/null 2>&1
echo "$OUT"
