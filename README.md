# Miroir maison

Page plein écran 1080×1920 pour le Raspberry Pi derrière le miroir. Elle remplace MagicMirror².
Un seul service Bun sert la page et une API JSON (`/api/...`). Les tokens et les URL privées restent côté serveur.
three.js, la police et les textures sont servis en local : la page fonctionne même sans Internet.

Prérequis : **Raspberry Pi OS 64 bits** (Bun n'existe pas en 32 bits sur ARM) et Chromium.

## Installation sur le Pi

```sh
git clone <ce dépôt> ~/mirror-maison && cd ~/mirror-maison
./install.sh            # Bun, dépendances, textures NASA, .env, service systemd
nano .env               # PLEX_TOKEN, ICS_LIONEL, ICS_VERO, ICS_CHLOE, ICS_SEB
sudo systemctl restart mirror-maison
```

La page est alors servie sur `http://<pi>:8090`. MagicMirror continue de tourner : ouvrez cette adresse depuis un autre
ordinateur pour la valider.

Diagnostics (chaque commande affiche ce qui est reçu, sans jamais afficher de secret) :

```sh
bun run check:weather   bun run check:alert   bun run check:ics
bun run check:plex      bun run check:ping    bun run check:xiaomi [secondes] [--raw]
bun run check:clouds
```

Logs : `journalctl -u mirror-maison -f`.

## Passer du MagicMirror au miroir

Une fois la page validée :

```sh
pm2 stop MagicMirror && pm2 save     # ou : sudo systemctl stop magicmirror && sudo systemctl disable magicmirror
./install.sh --kiosk                 # ajoute Chromium en kiosque au démarrage de session, désactive la veille
sudo reboot
```

`--kiosk` détecte la session :

- **Wayland / labwc** (Raspberry Pi OS récent) : ajoute une ligne à `~/.config/labwc/autostart`.
- **X11 / LXDE** : ajoute une ligne à `~/.config/lxsession/LXDE-pi/autostart`. `kiosk.sh` coupe aussi l'économiseur (`xset`) et masque le curseur (`unclutter`).

La page masque elle-même le curseur (`cursor: none`). La veille de l'écran est désactivée par
`raspi-config nonint do_blanking 1`, qui couvre les deux sessions.

**Rotation portrait** : si l'écran était déjà en portrait avec MagicMirror, il n'y a rien à faire. Sinon, deux options :

- l'outil *Screen Configuration* du bureau (sous labwc, il écrit `~/.config/kanshi/config`) ;
- `ROTATE=90` (ou `270`) dans `.env`. `kiosk.sh` applique alors `wlr-randr --transform` sous Wayland, ou `xrandr --rotate` sous X11.

**Revenir à MagicMirror :**

```sh
./install.sh --remove-kiosk
sudo systemctl disable --now mirror-maison   # facultatif
pm2 start MagicMirror && pm2 save
sudo reboot
```

MagicMirror n'est ni modifié ni supprimé.

## Mode démo

```sh
bun install && bun run textures
bun run mock      # ou bun run dev (rechargement automatique du serveur)
```

`MOCK=1` : toutes les routes renvoient les données de la maquette. Seuls les nuages viennent d'Internet.

## Mise à jour

```sh
cd ~/mirror-maison && git pull && ./install.sh
```

La page se recharge seule dès que le serveur annonce une nouvelle version. Elle se recharge aussi chaque nuit à 04:00.

## Configuration

`config.js` contient les coordonnées, hôtes, capteurs (sid), personnes et couleurs, seuils, rythmes de rafraîchissement
et la région d'alerte. Les secrets sont uniquement dans `.env` (ignoré par git).

Globe : textures 4096×2048 par défaut. Le navigateur repasse seul en 2048×1024 si le GPU l'exige. On peut aussi forcer
ce mode avec `globe.textureSize: 2048` ou `?tex=2048`. Le globe n'est redessiné qu'une fois par minute et à chaque
nouvelle carte de nuages, toutes les 3 h.

## Notes

- **Alerte** : endpoint de MMM-WetteralarmCH (`my.wetteralarm.ch/v6/alarms/meteo/with-regions.json`), région `VD Jura`.
  Une alerte annoncée reste affichée jusqu'à sa fin, même si elle n'a pas encore commencé.
- **Xiaomi** : le port UDP 9898 est partagé (`reuseAddr`). Si MagicMirror le bloque, le serveur réessaie chaque minute.
  Un capteur qui renvoie la valeur d'erreur (`10000`) ou `No device` est compté comme sans nouvelle : il passe hors ligne
  après 30 min.
- **Plex** : si le serveur Plex ne répond plus pendant ~10 s, le bloc disparaît au lieu de figer une lecture fantôme.

## Développement

```sh
bun test                    # logique pure : dates d'agenda, pluie, vent, Plex, capteurs, soleil, sources
scripts/shot.sh URL out.png # capture 1080×1920 avec Chromium headless
```

Arborescence : `server/` (Bun.serve, cache par source, `sources/*`), `public/` (page, `js/shared/` partagé avec le
serveur et les tests), `scripts/` (textures, checks), `deploy/` (systemd, kiosque).
