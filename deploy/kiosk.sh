#!/usr/bin/env bash
# Lance Chromium en kiosque sur la page du miroir. Fonctionne sous X11 et sous Wayland (labwc).
DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT=$(grep -s '^PORT=' "$DIR/.env" | cut -d= -f2)
BASE="http://localhost:${PORT:-8090}"
PROFILE="$HOME/.config/mirror-kiosk"
# Journal du kiosque (rotation simple : on repart à zéro à chaque lancement)
LOG="$HOME/.cache/mirror-kiosk.log"
mkdir -p "$(dirname "$LOG")"
exec >"$LOG" 2>&1
echo "kiosque : $(date) WAYLAND_DISPLAY=${WAYLAND_DISPLAY:-} DISPLAY=${DISPLAY:-}"

# Rotation optionnelle (ROTATE=90|180|270 dans .env) si l'écran n'est pas déjà tourné par le système.
ROTATE=$(grep -s '^ROTATE=' "$DIR/.env" | cut -d= -f2)
if [ -n "$ROTATE" ] && [ "$ROTATE" != "0" ]; then
  if [ -n "$WAYLAND_DISPLAY" ] && command -v wlr-randr >/dev/null; then
    OUT=$(wlr-randr | awk '/^[^ ]/{print $1; exit}')
    wlr-randr --output "$OUT" --transform "$ROTATE"
  elif command -v xrandr >/dev/null; then
    case "$ROTATE" in 90) R=right ;; 180) R=inverted ;; 270) R=left ;; esac
    OUT=$(xrandr | awk '/ connected/{print $1; exit}')
    xrandr --output "$OUT" --rotate "$R"
  fi
fi

# Pas de mise en veille ni d'économiseur (X11). Sous labwc : raspi-config s'en charge (voir README).
if [ -z "$WAYLAND_DISPLAY" ] && command -v xset >/dev/null; then
  xset s off; xset s noblank; xset -dpms
  command -v unclutter >/dev/null && unclutter -idle 0.5 -root &
fi

# Attend que le serveur réponde (démarrage du Pi).
for _ in $(seq 1 60); do curl -sf "$BASE/api/version" >/dev/null && break; sleep 2; done

# Évite la bulle « Chromium ne s'est pas fermé correctement » après une coupure.
PREFS="$PROFILE/Default/Preferences"
[ -f "$PREFS" ] && sed -i 's/"exited_cleanly":false/"exited_cleanly":true/; s/"exit_type":"[^"]*"/"exit_type":"Normal"/' "$PREFS"

BROWSER=$(command -v chromium-browser || command -v chromium)
OZONE=()
[ -n "$WAYLAND_DISPLAY" ] && OZONE=(--ozone-platform=wayland)

exec "$BROWSER" "${OZONE[@]}" \
  --kiosk --noerrdialogs --disable-infobars --check-for-update-interval=31536000 \
  --user-data-dir="$PROFILE" --disable-session-crashed-bubble --disable-features=Translate,TranslateUI --lang=fr \
  --overscroll-history-navigation=0 --disable-pinch --password-store=basic \
  "$BASE/"
