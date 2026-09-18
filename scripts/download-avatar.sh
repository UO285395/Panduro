#!/usr/bin/env bash
# Descarga el avatar VRM CC0 (VRM Consortium sample) a public/avatars/panduro.vrm.
# El binario NO está versionado en git; este script es el mecanismo de provisión.
set -euo pipefail

URL="https://github.com/vrm-c/vrm-specification/raw/master/samples/VRM1_Constraint_Twist_Sample.vrm"
DEST="public/avatars/panduro.vrm"

mkdir -p public/avatars
echo "Descargando VRM CC0 desde el repositorio oficial de VRM Consortium..."
curl -L --retry 3 --cacert "${HTTPS_PROXY_CA:-/etc/ssl/certs/ca-certificates.crt}" \
  -o "$DEST" "$URL" 2>/dev/null || \
curl -L --retry 3 -o "$DEST" "$URL"
echo "Avatar descargado en $DEST ($(du -sh "$DEST" | cut -f1))"
