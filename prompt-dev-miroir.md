Je veux remplacer mon MagicMirror² (Raspberry Pi 4, écran portrait derrière un miroir) par une simple page web propre que je maîtrise. Développe le projet complet : backend, page, globe 3D et déploiement sur le Pi.

La maquette validée est ici : https://claude.ai/artifact/PQsi6TcucAnMpniYaQGeHK (artboard `Main.dc.html`). Lis-la si tu y as accès. Sinon, la spec ci-dessous la décrit entièrement. Respecte la mise en page au pixel près ; ne rajoute ni cadres, ni titres de section, ni infos supplémentaires.

## Contexte matériel
- Raspberry Pi 4, Raspberry Pi OS. Écran 1080×1920 en portrait. Chromium en mode kiosque.
- Réseau local 192.168.1.0/24. Le MagicMirror actuel tourne dans `~/MagicMirror` (port 8080). Ses modules dans `~/MagicMirror/modules/` (MMM-XiaomiLAN, MMM-WetteralarmCH, MMM-ServerStatus, MMM-PlexLine) servent de référence pour les endpoints et protocoles. Lis leur code si tu y as accès, sinon demande-moi de te le coller.
- Langue fr, locale fr-CH, fuseau Europe/Zurich, format 24 h, unités métriques.

## Architecture voulue
- **Un seul service Node.js (LTS)**, sans framework lourd : Fastify ou Express. Il sert la page statique et une API JSON `/api/...`. Tous les appels externes, tokens et URL privées restent côté serveur. Le navigateur ne voit jamais un secret.
- **Frontend en HTML/CSS/JS vanilla** (modules ES), sans étape de build. three.js et la police Space Grotesk sont **servis en local** : aucun CDN ni Google Fonts au runtime, le miroir doit fonctionner même si Internet tombe.
- Le serveur interroge chaque source à son rythme, garde en cache la dernière valeur valide avec un horodatage, et l'expose. Si une source tombe, l'écran garde la dernière donnée. Chaque bloc est indépendant : une erreur dans l'un ne casse jamais les autres.
- Secrets dans un fichier `.env` (fourni en `.env.example`, `.env` dans `.gitignore`) :
  `PLEX_URL=http://192.168.1.22:32400`, `PLEX_TOKEN=`, `ICS_LIONEL=`, `ICS_VERO=`, `ICS_CHLOE=`, `ICS_SEB=`. Je les remplirai moi-même.
- **Mode démo** `MOCK=1` : toutes les routes renvoient les données d'exemple de la maquette, ce qui permet de développer hors de mon réseau. Commence par là.
- Fichier de config lisible (`config.json` ou `config.js`) pour : coordonnées, liste des hôtes, liste des capteurs, personnes et couleurs, seuils.
- La page se recharge seule chaque nuit à 04:00, et quand le serveur signale une nouvelle version.

## Sources de données

### Heure (client)
Date « mardi 6 octobre · semaine 41 » (semaine ISO), heure HH:MM et secondes. Mise à jour chaque seconde côté navigateur.

### Météo : Open-Meteo, sans clé
- lat 46.66583, lon 6.31601, `timezone=Europe/Zurich`. Rafraîchissement toutes les 10 minutes.
- Champs actuels : `temperature_2m`, `apparent_temperature`, `weather_code`, `is_day`, `wind_speed_10m`, `wind_direction_10m` (converti en points cardinaux FR : N, NNE, …, SSE…), `relative_humidity_2m`.
- Prévisions journalières sur 5 jours : `weather_code`, max, min (arrondis), `sunrise`, `sunset` (ceux du jour).
- Horaire : `precipitation_probability` et `precipitation` sur les 12 prochaines heures, pour générer la phrase de pluie. Exemples : « Pluie cette nuit de 02h à 05h », « Pluie cet après-midi dès 15h », « Pluie demain matin ». Une heure compte comme pluvieuse si la probabilité est ≥ 40 % ou les précipitations ≥ 0,2 mm. Si aucune heure n'est pluvieuse, la ligne est masquée.
- Icônes météo : SVG en traits (stroke 1.3–1.5, sans remplissage), correspondance avec les codes WMO, variantes jour/nuit (lune la nuit).

### Alerte météo
Wetteralarm.ch, région « VD Jura » (reprendre l'endpoint de MMM-WetteralarmCH). Rafraîchissement toutes les 5 minutes. Afficher uniquement s'il y a une alerte active : type, niveau, région, fin (« Alerte vent fort, niveau 2 · Jura vaudois, jusqu'à mercredi 06:00 »). Si plusieurs alertes, celle du niveau le plus élevé.

### Capteurs Xiaomi / Aqara : passerelle LAN 192.168.1.150
- Protocole LAN Xiaomi : UDP, multicast 224.0.0.50:9898, commandes `read` par `sid`, plus écoute des `report` et `heartbeat`. Température et humidité sont des entiers /100. Reprendre la logique de MMM-XiaomiLAN.
- Un capteur sans nouvelle depuis plus de 30 minutes est « hors ligne ».
- Ordre d'affichage et sid :
  - Extérieur 158d00062f9d5a
  - Salon 158d0008ab2c11
  - Cuisine 158d0004836aa9
  - Bibliothèque 158d0004111bc5
  - Bureau 158d0008ab2bbf
  - Salle de bain 158d00088faddb
  - Chambre Seb 158d00044b4629
  - Chambre Vero 158d0003ce30f1
  - Chambre Chloé 158d00033e7858
  - Cave 158d0008ab25b3
  - Couloir 158d00034f8c21
  - Couloir immeuble 158d00034f804c

### État des serveurs : ping ICMP toutes les 30 s
Proxmox 192.168.1.10, Web 192.168.1.25, Plex 192.168.1.22, Reolink 192.168.1.111, Synology 192.168.1.40, Internet 8.8.8.8. Un hôte passe « down » après 2 échecs consécutifs.

### Agendas : 4 flux ICS Google privés (URL dans `.env`)
- Rafraîchissement toutes les 10 minutes. Parser avec `node-ical` en développant correctement les récurrences (RRULE, EXDATE, occurrences modifiées) et les fuseaux.
- Par personne : les 3 prochains événements, en cours ou à venir, sur 60 jours. Un événement en cours reste affiché jusqu'à sa fin.
- Format de la ligne date : « Aujourd'hui · 18:15–19:45 », « Demain · 08:30–18:30 », « Jeu. 8 · 08:30–18:30 » (jour abrégé + numéro, sans mois si moins de 30 jours, sinon « 24.05 »). Un événement sur la journée entière s'affiche « Dim. 18 · journée ». Sur plusieurs jours : « Ven. 9 – Dim. 11 ».
- Personnes et couleurs : Lionel #8fb4ff, Véro #f2a6cc, Chloé #f2c27a, Seb #86dcae.

### Plex : `GET {PLEX_URL}/status/sessions` avec `X-Plex-Token` et `Accept: application/json`, toutes les 2 s
- Bloc visible seulement si une session est en cours (lecture ou pause). S'il y en a plusieurs, prendre la plus récemment active.
- Titre : série (`grandparentTitle`) ou film (`title`). Ligne 2 : « S1 · É2 Titre de l'épisode » pour une série, l'année pour un film.
- Utilisateur : nom (`User.title`) et avatar (`User.thumb`).
- Local ou distant : `Session.location` (`lan` → « Local », `wan` → « Distant »).
- Mode : « Lecture directe » s'il n'y a pas de `TranscodeSession`, sinon « Transcodage ». Qualité : `Media.videoResolution` (« 1080p », « 4K »…).
- Progression : `viewOffset`/`duration`, interpolée côté client chaque seconde entre deux mises à jour, figée quand `Player.state` vaut `paused` (afficher alors une icône pause au lieu de play).
- La cover et l'avatar passent par un **proxy backend** (`/api/plex/image?path=...`, avec redimensionnement via `/photo/:/transcode` de Plex) pour ne jamais exposer le token.

### Globe 3D : three.js, rendu à la demande
- Sphère texturée avec les images de la NASA :
  - jour : Blue Marble ;
  - nuit : Black Marble, les lumières des villes ;
  - nuages en direct : https://clouds.matteason.co.uk, `4096x2048/clouds-alpha.png`, mis à jour toutes les 3 h (CORS ouvert).
- Le backend télécharge et met en cache les nuages toutes les 3 h et sert la dernière bonne version. Les textures jour et nuit sont téléchargées une fois par un script `npm run textures` et servies en local. Maximum 4096×2048 ; prévoir un repli 2048×1024 si la carte graphique du Pi ne suit pas.
- Shader personnalisé :
  - Direction du soleil calculée depuis l'heure UTC (déclinaison et longitude subsolaire).
  - Mélange jour/nuit par `smoothstep(-0.10, 0.10, cos(angle zénithal))`.
  - Côté jour : légère ombre vers la limite jour/nuit (`0.30 + 0.70 * sqrt(max(cosZ, 0))`), nuages blancs mélangés à environ 92 % de leur alpha.
  - Côté nuit : lumières des villes en teinte chaude (1.0, 0.80, 0.50), atténuées d'environ 75 % sous les nuages, plus un très léger reflet de la texture jour (environ 7 %) pour deviner les continents.
  - Bord d'atmosphère bleu (0.35, 0.58, 1.0) : un liseré intérieur proportionnel à (1 − N·V)^2.2, plus un halo extérieur fin qui décroît de façon exponentielle. Les deux sont plus forts côté jour.
- Vue fixe centrée sur 44° N, 6.3° E (la Suisse un peu au-dessus du centre). Fond noir pur. Le disque occupe environ 88 % du carré de 560×560 px.
- **Pas de boucle à 60 fps** : redessiner une fois par minute (la limite jour/nuit avance) et à chaque nouvelle texture de nuages. Le Pi doit rester froid.

## Spécification visuelle (maquette validée)
- Écran fixe 1080×1920, fond `#000`. Padding 64 px en haut et sur les côtés, 56 px en bas. Colonne verticale avec 56 px entre les blocs.
- Police **Space Grotesk** (300/400/500), auto-hébergée. `font-variant-numeric: tabular-nums` sur tous les chiffres.
- Couleurs :
  - texte `#ececec` ; secondaire `#a8a8a8` ; tertiaire `#8a8a8a` ; atténué `#7f7f7f` ;
  - capteur hors ligne `#5a5a5a` ;
  - vert `#6fd49a` (en ligne, Plex, Local) ; rouge `#ff6b5b` (hôte en panne) ;
  - ambre `#f2c470` (alerte, Distant) ;
  - chaud `#ffad6b` (température ≥ 26°) ; bleu `#8fb4ff` (humidité ≥ 80 %, phrase de pluie) ;
  - contours `#262626`, rayon 16 px.

1. **En-tête**, deux colonnes. Le haut des deux colonnes est aligné.
   - **À gauche :**
     - la date en 30 px `#a8a8a8` ;
     - l'heure en 210 px, graisse 300, letter-spacing −0.045em, line-height 0.88 ;
     - les secondes en 60 px `#6e6e6e`, alignées en haut à droite de l'heure ;
     - dessous, à 18 px, la rangée des 6 serveurs : point de 9 px + nom en 18 px `#8a8a8a`, 22 px entre chaque, retour à la ligne autorisé. Un serveur en panne a son point et son nom en rouge.
   - **À droite**, aligné à droite :
     - icône météo de 72 px + température actuelle en 112 px, graisse 300, une décimale (« 11.5° ») ;
     - « Ressenti 10.7° » en 24 px `#a8a8a8` ;
     - « Vent 6 km/h SSE · Humidité 68 % » en 19 px `#8a8a8a` ;
     - « Soleil 07:39 – 18:58 » en 19 px `#8a8a8a` ;
     - la phrase de pluie en 19 px `#8fb4ff`, seulement si utile.
2. **Alerte** (seulement si active), juste sous l'en-tête avec une marge négative de −24 px : triangle ambre de 22 px + texte en 20 px `#f2c470`. Pas de cadre.
3. **Prévisions 5 jours** : grille de 5 colonnes égales, contenu centré.
   - Libellé en 18 px, letter-spacing 0.08em, `#8a8a8a` (AUJ., DEMAIN, JEU., VEN., SAM.).
   - Icône de 40 px, trait `#d0d0d0`.
   - Max en 28 px puis min en 22 px `#7f7f7f`, entiers.
4. **Globe + capteurs**, en ligne, centrés verticalement, 24 px d'écart.
   - Globe : 560×560, décalé de −34 px à gauche et −20 px en haut et en bas.
   - Capteurs : liste de 12 lignes, 12 px entre les lignes.
     - nom en 20 px `#a8a8a8`, coupé avec « … » si trop long ;
     - température en 25 px, une décimale + « ° » ;
     - humidité en 16 px `#7f7f7f`, alignée à droite sur 48 px de large (« 68% »).
     - Couleurs d'alerte : orange pour une température ≥ 26°, bleu pour une humidité ≥ 80 %.
     - Capteur hors ligne : « — » en `#5a5a5a`, humidité masquée.
5. **Agendas** : grille de 4 colonnes égales, 16 px d'écart.
   - Chaque personne a sa carte : bordure 1 px `#262626`, rayon 16, padding 18/18/20, hauteur minimale 270.
   - Prénom en 24 px, graisse 500, dans la couleur de la personne.
   - Jusqu'à 3 événements, 16 px entre eux : ligne date en 16 px `#8a8a8a`, puis titre en 21 px, line-height 1.2.
6. **Plex** (seulement pendant une lecture), collé en bas (`margin-top: auto`).
   - Carte avec la même bordure, padding 18/22. À gauche, la cover en 68×100, rayon 6.
   - À droite, sur 4 lignes réparties sur la hauteur :
     - icône play verte de 15 px (pause si en pause) + titre en 24 px, et à droite « 14:02 / 26:00 » en 17 px `#8a8a8a` ;
     - épisode en 18 px `#a8a8a8`, coupé avec « … » si trop long ;
     - avatar rond de 26 px + nom en `#d0d0d0` · icône + « Local » (maison, vert) ou « Distant » (globe, ambre) · « Lecture directe · 1080p », le tout en 16 px `#8a8a8a` ;
     - barre de progression de 3 px, fond `#1c1c1c`, remplissage `#6fd49a`.
- Aucune animation décorative. Seuls l'heure, la progression Plex et le globe (une fois par minute) bougent. Pas de flou ni d'ombre portée : c'est un Pi.

## Déploiement sur le Pi
- Service systemd pour le serveur (redémarrage automatique, logs dans journald).
- Lancement automatique de Chromium en kiosque sur `http://localhost:<port>` : options `--kiosk --noerrdialogs --disable-infobars --check-for-update-interval=31536000`, curseur masqué, mise en veille de l'écran désactivée, rotation portrait. Indique la marche à suivre pour X11 comme pour Wayland (labwc).
- Un script `install.sh` idempotent, et un README court : installation, `.env`, mode démo, mise à jour.
- **Ne supprime pas MagicMirror.** Arrête-le seulement (pm2 ou service) une fois la nouvelle page validée, et explique comment revenir en arrière.

## Façon de travailler
1. Propose d'abord l'arborescence et le plan en quelques lignes, puis enchaîne.
2. Ordre de travail :
   1. squelette du serveur et mode démo ;
   2. page fidèle à la maquette avec les données démo ;
   3. globe ;
   4. sources réelles une par une (météo, agendas, Plex, ping, Xiaomi, alerte) ;
   5. déploiement.
3. Tests unitaires pour la logique pure : formatage des dates d'agenda (récurrences, journée entière, multi-jours, changement d'heure), phrase de pluie, conversion du vent, interpolation Plex, détection des capteurs hors ligne.
4. Tu ne peux pas joindre mon réseau 192.168.1.x : pour tout ce qui en dépend, fournis une commande de test que je lancerai sur le Pi (par exemple `npm run check:plex`, `check:xiaomi`, `check:ics`) et qui affiche ce qui est reçu.
5. Commits petits et clairs. Ne mets jamais de token ni d'URL ICS dans le code, les tests ou l'historique git.
