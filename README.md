# Panduro

PWA gamificada para aprender **Lengua de Signos Española (LSE)** con feedback por cámara. Alineada al currículo oficial LSE A1–B2 (MCER) de la Fundación CNSE.

> ⚠️ Proyecto en fase inicial (Hito 1 / MVP). El contenido de signos se valida siempre con profesorado sordo nativo antes de publicarse.

## Stack

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind CSS**
- **Supabase** (Postgres + Auth + RLS) para autenticación y persistencia
- **`@mediapipe/tasks-vision`** (Hand Landmarker) en Web Worker — llega en hitos posteriores
- **Vitest** para tests unitarios
- **PWA** vía `next-pwa`
- Todo el reconocimiento por cámara corre **on-device**; los frames de vídeo nunca salen del navegador.

## Requisitos locales

- Node ≥ 20 (`.nvmrc` incluido)
- pnpm ≥ 10 (`corepack enable && corepack prepare pnpm@10 --activate`)
- Un proyecto Supabase (cloud o local con `supabase start`)

## Setup

Tienes tres formas de arrancar la app en local, de menos a más completa. Elige la que te encaje.

### A. Modo demo (0 dependencias, sin backend)

Sirve para ver la aplicación entera sin instalar Docker ni tener cuenta de Supabase. Todo el progreso se guarda en `localStorage`.

```bash
pnpm install
NEXT_PUBLIC_DEMO_MODE=1 pnpm dev
```

En la landing verás el botón **"Entrar en modo demo"**. Puedes vaciar el progreso desde `/dev/demo-reset`.

### B. Modo local completo (Supabase local en Docker)

Levanta Postgres + Auth + Studio en tu máquina y aplica migraciones y semilla.

```bash
bash scripts/local-setup.sh
pnpm dev
```

Usuario demo pre-creado: `demo@panduro.local` / `panduro-demo`. Studio en <http://localhost:54323>.

### C. Modo cloud (Supabase en producción)

```bash
pnpm install
cp .env.example .env.local        # rellena URL y ANON_KEY del proyecto real
pnpm dlx supabase link --project-ref <tu-project-ref>
pnpm dlx supabase db push
pnpm dev
```

En los tres modos abre <http://localhost:3000>.

## Scripts

| Comando | Qué hace |
| --- | --- |
| `pnpm dev` | Next.js en modo desarrollo (PWA desactivada) |
| `pnpm build` | Build de producción con service worker |
| `pnpm start` | Servir el build |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript sin emitir |
| `pnpm test` | Vitest en modo run |
| `pnpm format` | Prettier |

## Estructura

```
app/                Rutas (App Router): landing, auth, dashboard, callback OAuth
lib/supabase/       Clientes SSR (browser, server, middleware)
supabase/           config.toml + migraciones SQL versionadas
tests/              Tests unitarios (Vitest)
public/             Assets estáticos + manifest PWA
.github/workflows/  CI (lint, typecheck, test, build)
```

## Autenticación

- Email + contraseña
- Google OAuth (configurar en Supabase Dashboard → Authentication → Providers)
- Callback: `/auth/callback` intercambia `?code=` por sesión
- Middleware (`middleware.ts`) protege `/dashboard/**`

Un trigger SQL (`handle_new_user`) crea automáticamente la fila `profiles` al registrar un usuario, con `mcer_level='A1'`.

## Roadmap

Ver `/root/.claude/plans/root-claude-uploads-b1567562-54a4-5158-mossy-breeze.md` (o el plan interno del equipo) para los 6 hitos del MVP.

| Hito | Contenido |
| --- | --- |
| 1 | Setup + auth + PWA |
| 2 | Árbol de lecciones + ejercicios sin cámara + Unidad 1 (Saludos) |
| 3 | Pipeline MediaPipe Hand Landmarker + `/dev/hand-tracking` |
| **4** *(actual)* | Reconocimiento de dactilología (k-NN + `SignThis` + `/dev/capture`) |
| 5 | Repetición espaciada (SM-2) + gamificación (corazones, racha) |
| 6 | 50 signos + avatar humanoide + pulido |
| 7 | Traductor/transcriptor en tiempo real (`/translate`) |

## Practicar dactilología (Unidad 2 · Alfabeto LSE)

La Unidad 2 introduce el alfabeto dactilológico con un nuevo tipo de ejercicio `sign_this`: el sistema pide una letra, tú la signas frente a la cámara y un clasificador **k-NN** ejecutándose localmente decide si has acertado.

**Cómo funciona la calibración por auto-aprendizaje**

La primera vez que aparece una letra, el clasificador no tiene plantillas. El ejercicio entra en modo **calibración**: te pide signar esa letra 3 veces seguidas y guarda las muestras en `localStorage`. A partir de la siguiente ronda, esa letra pasa al modo evaluación con voto por mayoría durante 2 s. Los fallos en ejercicios de cámara **no consumen corazones** — el ruido óptico puede provocar falsos negativos.

**Poblar el corpus global** (para cualquier persona sin calibrar previamente)

1. Ve a `/dev/capture` (requiere sesión o modo demo).
2. Signa cada letra y pulsa el botón correspondiente. Con 3–5 plantillas por letra el clasificador ya es útil.
3. Pulsa **Descargar JSON** y pega el contenido en `content/signs/fingerspelling.json`. Al commitearlo, cualquier usuario nuevo tendrá plantillas globales listas y no necesitará calibrar.

## Probar el hand-tracking (`/dev/hand-tracking`)

1. Inicia sesión y navega a `/dev/hand-tracking`.
2. Haz clic en **Empezar cámara** y concede el permiso cuando el navegador lo pida.
3. La primera vez, el modelo (`hand_landmarker.task`, ~5 MB) tarda 1–3 s en descargarse desde el CDN de Google.
4. Enseña una mano abierta a la cámara; verás 21 puntos + esqueleto superpuestos.
5. La tarjeta inferior muestra **FPS**, **P50/P95 de latencia** y qué **delegate** está en uso (GPU o CPU fallback).

**Requisitos**:
- Chrome, Edge, Safari (iOS 15+) o Firefox actuales.
- `localhost` o HTTPS (getUserMedia lo exige).
- Buena iluminación frontal; encuadre a media distancia.

**Privacidad**: la inferencia corre íntegra en tu navegador vía WebAssembly + WebGL. Ningún frame se sube a ningún servidor.

## Contribuir

Ver [`CONTRIBUTING.md`](./CONTRIBUTING.md) — incluye el flujo para asesores sordos.

## Licencia

Código: MIT (ver [`LICENSE`](./LICENSE)).
Contenido de signos y traducciones: sujeto a licencias de terceros (DILSE, ARASAAC, Spreadthesign). Ver [`CREDITS.md`](./CREDITS.md).
