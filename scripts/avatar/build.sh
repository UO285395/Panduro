#!/usr/bin/env bash
# Rehace public/avatars/panduro.vrm desde cero: Blender + MPFB (MakeHuman) con recursos CC0 y el
# complemento VRM. Descarga lo que falte en $WORK (por defecto .avatar-build/, fuera de git).
#
#   bash scripts/avatar/build.sh            # todo: descargas, personaje, VRM y copia a public/
#   PREVIEW=1 bash scripts/avatar/build.sh  # además, renders de prueba en $WORK/out
#
# Pasos (ver docs/avatar.md):
#   build_avatar.py   personaje de MakeHuman (fenotipo, pelo, piel, ropa, rig «mixamo»)
#   finish_avatar.py  expresiones, forma horneada, colores y pose en T
#   export_vrm.py     pose en T como reposo, huesos de los ojos, VRM 1.0 con licencia CC0
#   pack_vrm.py       texturas en JPEG, formas de la cara dispersas, pelo recortado (MASK)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$ROOT/scripts/avatar"
WORK="${WORK:-$ROOT/.avatar-build}"
DL="$WORK/dl"
mkdir -p "$DL" "$WORK/out"

BLENDER_VERSION=4.2.23
BLENDER_URL="https://download.blender.org/release/Blender4.2/blender-$BLENDER_VERSION-linux-x64.tar.xz"
MPFB_URL="https://extensions.blender.org/download/sha256:c075b3e9b94b8e5556a5f03f4653602d02ea306de08126e8f55ed6dee28a2dad/add-on-mpfb-v2.0.18.zip"
VRM_URL="https://extensions.blender.org/download/sha256:228e622d158fbbf070b1b49547708f360a223873f00fa81a42170794492e6db9/add-on-vrm-v4.10.2.zip"
MH=https://files2.makehumancommunity.org
PACKS=(
  "$MH/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip"
  "$MH/asset_packs/hair01/hair01_cc0.zip"
  "$MH/asset_packs/skins02/skins02_cc0.zip"
  "$MH/asset_packs/system_clothes_materials01/system_clothes_materials01_cc0.zip"
  "$MH/functional/faceunits01.zip"
  "$MH/functional/visemes02.zip"
)

fetch() { [ -s "$2" ] || curl -fL --retry 3 -o "$2" "$1"; }

fetch "$BLENDER_URL" "$DL/blender.tar.xz"
fetch "$MPFB_URL" "$DL/mpfb.zip"
fetch "$VRM_URL" "$DL/vrm.zip"
mkdir -p "$DL/packs"
for url in "${PACKS[@]}"; do fetch "$url" "$DL/packs/$(basename "$url")"; done

B="$WORK/blender-$BLENDER_VERSION-linux-x64/blender"
[ -x "$B" ] || tar -xJf "$DL/blender.tar.xz" -C "$WORK"
# Preferencias, complementos y recursos de MakeHuman de esta construcción, no los del usuario.
export BLENDER_USER_RESOURCES="$WORK/bluser"
if [ ! -f "$WORK/.addons" ]; then
  for z in mpfb vrm; do "$B" -b --command extension install-file -r user_default --enable "$DL/$z.zip"; done
  # Al instalar MPFB se guardan sus preferencias y el de VRM queda desactivado.
  "$B" -b --python-expr "import bpy; bpy.ops.preferences.addon_enable(module='bl_ext.user_default.vrm'); bpy.ops.wm.save_userpref()"
  "$B" -b --python "$HERE/install_packs.py" -- "$DL/packs"
  touch "$WORK/.addons"
fi

cd "$WORK/out"
"$B" -b --python "$HERE/build_avatar.py" -- "$HERE/panduro.json" panduro-base.blend
"$B" -b panduro-base.blend --python "$HERE/finish_avatar.py" -- "$HERE/panduro.json" panduro-finished.blend
"$B" -b panduro-finished.blend --python "$HERE/export_vrm.py" -- "$HERE/meta.json" panduro-raw.vrm
python3 -I "$HERE/pack_vrm.py" panduro-raw.vrm "$ROOT/public/avatars/panduro.vrm"
if [ -n "${PREVIEW:-}" ]; then
  SHOTS=full,tq,face,eyes "$B" -b panduro-finished.blend --python "$HERE/render_preview.py" -- preview
fi
echo "Listo: public/avatars/panduro.vrm ($(du -h "$ROOT/public/avatars/panduro.vrm" | cut -f1))"
