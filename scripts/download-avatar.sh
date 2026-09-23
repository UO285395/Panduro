#!/usr/bin/env bash
# Descarga Seed-san (personaje femenino CC-BY del VRM Consortium) a public/avatars/panduro.vrm.
# El binario NO está versionado en git; este script es el mecanismo de provisión.
#
# Alternativa local (sin internet):
#   node scripts/build-avatar.mjs
#   Genera un avatar VRM1 procedimental con 52 huesos y materiales PBR (~134 KB).
set -euo pipefail

URL="https://github.com/vrm-c/vrm-specification/raw/master/samples/Seed-san/vrm1/Seed-san.vrm"
DEST="public/avatars/panduro.vrm"

mkdir -p public/avatars
echo "Descargando Seed-san (VRM CC-BY) desde el repositorio oficial del VRM Consortium..."
curl -L --retry 3 --cacert "${HTTPS_PROXY_CA:-/etc/ssl/certs/ca-certificates.crt}" \
  -o "$DEST" "$URL" 2>/dev/null || \
curl -L --retry 3 -o "$DEST" "$URL"
echo "Avatar descargado en $DEST ($(du -sh "$DEST" | cut -f1))"
