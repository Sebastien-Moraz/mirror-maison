#!/usr/bin/env bash
# Met à jour le miroir depuis GitHub puis relance le service : ./update.sh [--force]
# La page ouverte dans le kiosque se recharge seule dès que le serveur annonce la nouvelle version.
set -euo pipefail
cd "$(dirname "$0")"

before=$(git rev-parse HEAD)
git pull --ff-only --quiet
after=$(git rev-parse HEAD)

if [ "$before" = "$after" ] && [ "${1:-}" != "--force" ]; then
  echo "Déjà à jour : $(git log -1 --format='%h %s')"
  exit 0
fi

[ "$before" != "$after" ] && git log --oneline "$before..$after"
./install.sh
