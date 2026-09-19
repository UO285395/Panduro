#!/usr/bin/env bash
# Descarga el modelo hand_landmarker.task de MediaPipe a public/models/.
# El binario NO está versionado en git; este script es el mecanismo de provisión.
set -euo pipefail

URL="https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
DEST="public/models/hand_landmarker.task"

mkdir -p public/models
echo "Descargando modelo MediaPipe HandLandmarker (float16)..."
curl -L --retry 3 --cacert "${HTTPS_PROXY_CA:-/etc/ssl/certs/ca-certificates.crt}" \
  -o "$DEST" "$URL" 2>/dev/null || \
curl -L --retry 3 -o "$DEST" "$URL"
echo "Modelo descargado en $DEST ($(du -sh "$DEST" | cut -f1))"
