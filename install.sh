#!/usr/bin/env bash
# Installation idempotente sur le Raspberry Pi. Relançable sans risque.
#   ./install.sh                 serveur (service systemd) seulement — MagicMirror n'est pas touché
#   ./install.sh --kiosk         + lancement automatique de Chromium en kiosque au démarrage de session
#   ./install.sh --remove-kiosk  retire le lancement automatique du kiosque
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
USER_NAME="$(id -un)"
SERVICE=mirror-maison
LABWC_AUTOSTART="$HOME/.config/labwc/autostart"
LXDE_AUTOSTART="$HOME/.config/lxsession/LXDE-pi/autostart"
MARK="# mirror-maison"

remove_kiosk() {
  for f in "$LABWC_AUTOSTART" "$LXDE_AUTOSTART"; do
    [ -f "$f" ] && sed -i "/$MARK/d" "$f" && echo "Kiosque retiré de $f"
  done
  return 0
}

if [ "${1:-}" = "--remove-kiosk" ]; then remove_kiosk; exit 0; fi

# 1. Bun (64 bits uniquement sur ARM)
if [ "$(uname -m)" != "aarch64" ] && [ "$(uname -m)" != "x86_64" ]; then
  echo "Bun exige un système 64 bits (aarch64). Ce Pi tourne en $(uname -m) : installez Raspberry Pi OS 64 bits." >&2
  exit 1
fi
if ! command -v bun >/dev/null && [ ! -x "$HOME/.bun/bin/bun" ]; then
  echo "Installation de Bun…"
  curl -fsSL https://bun.sh/install | bash
fi
BUN="$(command -v bun || echo "$HOME/.bun/bin/bun")"
echo "Bun : $("$BUN" --version)"

# 2. Paquets système utiles (ping, curl ; unclutter pour X11)
if command -v apt-get >/dev/null; then
  NEED=()
  command -v ping >/dev/null || NEED+=(iputils-ping)
  command -v curl >/dev/null || NEED+=(curl)
  # unclutter ne sert que sous X11 (sous Wayland, la page masque elle-même le curseur)
  if ! pgrep -x labwc >/dev/null && ! pgrep -x wayfire >/dev/null; then command -v unclutter >/dev/null || NEED+=(unclutter); fi
  if [ ${#NEED[@]} -gt 0 ]; then sudo apt-get install -y "${NEED[@]}"; fi
fi

# 3. Dépendances, three.js et police en local, textures du globe
cd "$DIR"
"$BUN" install
"$BUN" run textures

# 4. .env (jamais écrasé)
if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
  echo "→ .env créé : renseignez PLEX_TOKEN et les ICS_* puis : sudo systemctl restart $SERVICE"
fi

# 5. Service systemd
TMP="$(mktemp)"
sed -e "s|__USER__|$USER_NAME|" -e "s|__DIR__|$DIR|" -e "s|__BUN__|$BUN|" deploy/$SERVICE.service > "$TMP"
if ! cmp -s "$TMP" /etc/systemd/system/$SERVICE.service 2>/dev/null; then
  sudo install -m 644 "$TMP" /etc/systemd/system/$SERVICE.service
  sudo systemctl daemon-reload
fi
rm -f "$TMP"
sudo systemctl enable $SERVICE >/dev/null 2>&1
sudo systemctl restart $SERVICE
echo "Service $SERVICE démarré : http://$(hostname -I | awk '{print $1}'):$(grep -s '^PORT=' .env | cut -d= -f2 || true)"

# 6. Kiosque (optionnel)
if [ "${1:-}" = "--kiosk" ]; then
  remove_kiosk >/dev/null
  if [ -d "$HOME/.config/labwc" ] || pgrep -x labwc >/dev/null; then
    mkdir -p "$(dirname "$LABWC_AUTOSTART")"
    echo "$DIR/deploy/kiosk.sh & $MARK" >> "$LABWC_AUTOSTART"
    echo "Kiosque ajouté à $LABWC_AUTOSTART (Wayland / labwc)"
  else
    mkdir -p "$(dirname "$LXDE_AUTOSTART")"
    [ -f "$LXDE_AUTOSTART" ] || cp /etc/xdg/lxsession/LXDE-pi/autostart "$LXDE_AUTOSTART" 2>/dev/null || true
    echo "@$DIR/deploy/kiosk.sh $MARK" >> "$LXDE_AUTOSTART"
    echo "Kiosque ajouté à $LXDE_AUTOSTART (X11)"
  fi
  # Écran jamais en veille (X11 et Wayland)
  if command -v raspi-config >/dev/null; then sudo raspi-config nonint do_blanking 1 || true; fi
  echo "Redémarrez la session (ou le Pi) pour lancer le kiosque."
fi
