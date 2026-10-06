#!/usr/bin/env bash
# Masque le curseur sous labwc (Wayland) avec un thème de curseur entièrement transparent.
# Sous Wayland, c'est le compositeur qui dessine la souris : « cursor: none » dans la page ne suffit pas
# dès que le pointeur bouge (VNC, souris branchée).
#   deploy/hide-cursor.sh          installe et active le thème (prise en compte à la prochaine session)
#   deploy/hide-cursor.sh --undo   revient au curseur normal
set -euo pipefail
THEME=mirror-invisible
DIR="$HOME/.icons/$THEME"
ENV_FILE="$HOME/.config/labwc/environment"
MARK="# mirror-maison : curseur transparent (deploy/hide-cursor.sh)"
# labwc lit « CLE=valeur » ligne par ligne : pas de commentaire en fin de ligne.
clean_env() { [ -f "$ENV_FILE" ] && sed -i "/^# mirror-maison/d; /^XCURSOR_THEME=$THEME\$/d" "$ENV_FILE"; return 0; }

if [ "${1:-}" = "--undo" ]; then
  clean_env
  rm -rf "$DIR"
  echo "Curseur normal rétabli (à la prochaine session)."
  exit 0
fi

mkdir -p "$DIR/cursors"
cat > "$DIR/index.theme" <<EOF
[Icon Theme]
Name=$THEME
Comment=Curseur transparent pour le miroir
EOF

# Fichier Xcursor : une image 24×24 entièrement transparente.
python3 - "$DIR/cursors/default" <<'EOF'
import struct, sys
size = 24
pixels = b"\0\0\0\0" * size * size
chunk = struct.pack("<9I", 36, 0xFFFD0002, size, 1, size, size, 0, 0, 0) + pixels
header = struct.pack("<4sIII", b"Xcur", 16, 0x10000, 1)
toc = struct.pack("<III", 0xFFFD0002, size, 16 + 12)
open(sys.argv[1], "wb").write(header + toc + chunk)
EOF

# Tous les noms de curseurs connus pointent vers ce curseur transparent : sans cela,
# un nom absent retomberait sur la flèche par défaut de wlroots.
NAMES="default left_ptr arrow pointer hand1 hand2 text xterm ibeam wait watch progress left_ptr_watch
crosshair move fleur grab grabbing not-allowed help question_arrow context-menu cell all-scroll
col-resize row-resize n-resize s-resize e-resize w-resize ne-resize nw-resize se-resize sw-resize
ew-resize ns-resize nesw-resize nwse-resize top_side bottom_side left_side right_side top_left_corner
top_right_corner bottom_left_corner bottom_right_corner sb_h_double_arrow sb_v_double_arrow"
for src in /usr/share/icons/*/cursors; do
  [ -d "$src" ] && NAMES="$NAMES $(ls "$src")"
done
for n in $NAMES; do
  [ "$n" = default ] || ln -sf default "$DIR/cursors/$n"
done

mkdir -p "$(dirname "$ENV_FILE")"
touch "$ENV_FILE"
clean_env
printf '%s\nXCURSOR_THEME=%s\n' "$MARK" "$THEME" >> "$ENV_FILE"
echo "Curseur transparent installé ($(ls "$DIR/cursors" | wc -l) noms). Effet à la prochaine session (redémarrage)."
