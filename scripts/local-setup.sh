#!/usr/bin/env bash
# Arranca Supabase local (Docker) y aplica migraciones + seed.
# Requiere: Docker corriendo y `pnpm dlx supabase --version`.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "❌ Docker no está instalado o no está en PATH." >&2
  exit 1
fi

echo "▶ pnpm install"
pnpm install --frozen-lockfile

echo "▶ Levantando Supabase local (esto tarda la primera vez)…"
pnpm dlx supabase start | tee /tmp/panduro-supabase.log

API_URL=$(grep -m1 -o "API URL:.*" /tmp/panduro-supabase.log | awk '{print $3}')
ANON_KEY=$(grep -m1 -o "anon key:.*" /tmp/panduro-supabase.log | awk '{print $3}')
SERVICE_KEY=$(grep -m1 -o "service_role key:.*" /tmp/panduro-supabase.log | awk '{print $3}')

if [ -z "${API_URL:-}" ] || [ -z "${ANON_KEY:-}" ]; then
  echo "⚠ No pude leer las URLs de Supabase. Revisa /tmp/panduro-supabase.log." >&2
  exit 1
fi

cat > .env.local <<EOF
NEXT_PUBLIC_SUPABASE_URL=${API_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_KEY}
NEXT_PUBLIC_SITE_URL=http://localhost:3000
EOF

echo "▶ Aplicando migraciones y seed…"
pnpm dlx supabase db reset --local

cat <<EOF

✅ Listo.
   API:      ${API_URL}
   Studio:   http://localhost:54323
   Usuario:  demo@panduro.local  ·  contraseña: panduro-demo

   Arranca la app con:   pnpm dev
EOF
