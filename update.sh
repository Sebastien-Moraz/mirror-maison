#!/usr/bin/env bash
# Met à jour le miroir depuis GitHub : ./update.sh [--force]
# Sans sudo dans le cas courant : le service tourne sous cet utilisateur et systemd le relance
# (Restart=always) dès qu'on arrête son processus. install.sh (sudo) n'est rejoué que si
# l'installation elle-même a changé. La page du kiosque se recharge seule à la nouvelle version.
set -euo pipefail

# Tout le script est dans une fonction : bash la lit en entier avant de l'exécuter,
# donc le « git pull » qui réécrit ce fichier pendant qu'il tourne est sans danger.
main() {
  cd "$(dirname "$0")"
  export PATH="$HOME/.bun/bin:$PATH"
  SERVICE=mirror-maison

  before=$(git rev-parse HEAD)
  git pull --ff-only --quiet
  after=$(git rev-parse HEAD)

  if [ "$before" = "$after" ] && [ "${1:-}" != "--force" ]; then
    echo "Déjà à jour : $(git log -1 --format='%h %s')"
    exit 0
  fi
  [ "$before" != "$after" ] && git log --oneline "$before..$after"

  if git diff --name-only "$before" "$after" | grep -qE '^(install\.sh|deploy/mirror-maison\.service)$'; then
    echo "L'installation a changé : install.sh (sudo)…"
    exec ./install.sh
  fi

  bun install --silent
  bun run --silent textures >/dev/null
  pid=$(systemctl show -p MainPID --value "$SERVICE")
  if [ "${pid:-0}" -gt 0 ]; then
    kill "$pid"
    # Attend que systemd ait relancé le serveur et qu'il réponde.
    PORT=$(grep -s '^PORT=' .env | cut -d= -f2)
    for _ in $(seq 1 30); do
      sleep 1
      new=$(systemctl show -p MainPID --value "$SERVICE")
      if [ "${new:-0}" -gt 0 ] && [ "$new" != "$pid" ] && curl -sf "http://localhost:${PORT:-8090}/api/version" >/dev/null; then
        echo "Service relancé : $(git log -1 --format='%h %s')"
        exit 0
      fi
    done
    echo "Le service ne répond pas : journalctl -u $SERVICE -n 50" >&2
    exit 1
  else
    echo "Service arrêté : sudo systemctl start $SERVICE" >&2
    exit 1
  fi
}

main "$@"
