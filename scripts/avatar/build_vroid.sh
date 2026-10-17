#!/usr/bin/env bash
# Rehace public/avatars/panduro.vrm: HairSample_Male, una de las muestras de VRoid Studio que el
# VRoid Project publicó con licencia CC0 (las de las versiones alfa, en OpenGameArt), aligerada
# para la web con pack_vrm.py --vroid (texturas a 1024 y en JPEG las que no usan el alfa, formas
# de la cara dispersas y sus nombres donde los lee three.js, contorno de 2 mm). De ~19 MB a unos 3.
#
#   bash scripts/avatar/build_vroid.sh
#
# Descarga en $WORK (por defecto .avatar-build/vroid, fuera de git) y comprueba el archivo.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$ROOT/scripts/avatar"
WORK="${WORK:-$ROOT/.avatar-build}/vroid"
URL="https://opengameart.org/sites/default/files/hairsample_male.zip"
SHA256="ba87440272b157a443dbe2cddb375eb175bce3586a45a84779bb018a5e730129"

mkdir -p "$WORK/x"
[ -s "$WORK/hairsample_male.zip" ] || curl -fL --retry 3 -o "$WORK/hairsample_male.zip" "$URL"
echo "$SHA256  $WORK/hairsample_male.zip" | sha256sum -c -
python3 -I -m zipfile -e "$WORK/hairsample_male.zip" "$WORK/x"
python3 -I "$HERE/pack_vrm.py" "$WORK/x/HairSample_Male.vrm" "$ROOT/public/avatars/panduro.vrm" --vroid
