# Créditos y licencias

Panduro combina código propio con recursos abiertos de la comunidad LSE. Este archivo se actualiza en cada release.

## Recursos lingüísticos (contenido)

- **DILSE** — Diccionario de la Lengua de Signos Española (Fundación CNSE). <https://fundacioncnse-dilse.org>. Consultar términos de uso; atribución obligatoria.
- **Spreadthesign** — diccionario internacional gratuito de lenguas de signos. <https://www.spreadthesign.com>. Uso educativo.
- **ARASAAC** — Portal Aragonés de la Comunicación Aumentativa y Alternativa. Pictogramas y recursos LSE bajo **CC BY-NC-SA 4.0**. <https://arasaac.org>.

## Marcos normativos y curriculares

- Ley 27/2007 de reconocimiento de las lenguas de signos españolas (BOE-A-2007-18476).
- Propuesta Curricular LSE A1–B2 (Fundación CNSE, alineada con el MCER).
- CNLSE — Centro de Normalización Lingüística de la LSE.

## Software (dependencias principales)

- **Next.js** — MIT
- **React** — MIT
- **Tailwind CSS** — MIT
- **@supabase/ssr, @supabase/supabase-js** — MIT
- **@tanstack/react-query** — MIT
- **zod** — MIT
- **zustand** — MIT
- **next-pwa** — MIT
- **@mediapipe/tasks-vision** *(uso planificado)* — Apache 2.0

## Reconocimiento de signos

El motor de reconocimiento de `lib/esku/` es el de **[Esku](https://github.com/Endika/esku)**
(© 2026 Endika Iglesias, **MIT**), incorporado sin cambios de lógica (ver `lib/esku/README.md`).
Los modelos entrenados de `public/models/` tienen licencias propias
(detalle en `public/models/LICENSE.md`):

- `lse-alphabet.*` — **CC BY 4.0**. Entrenado con **LSE-FS-UVigo** (Ruanova Lea, Alba-Castro,
  Docío-Fernández, Pérez Pérez, Longa Alonso), DOI `10.5281/zenodo.15797079`.
- `lse-vocabulary.*` — **CC BY-NC 4.0: solo uso no comercial.** Entrenado con **SWL-LSE**
  (Docío-Fernández et al., *Technologies* 12(10), 2024; CC BY 4.0,
  DOI `10.5281/zenodo.13691887`) y **LSE-Health-UVigo** (Alba-Castro et al.; CC BY-NC 4.0,
  DOI `10.5281/zenodo.10234465`). Una versión comercial de Panduro tendría que retirarlo o
  reentrenarlo solo con SWL-LSE.

## Modelos y datasets

- **MediaPipe Hand / Pose / Face Landmarker** — Apache 2.0.
- **MANO** / **SMPL-X** — **licencias de investigación no comerciales**. Un uso comercial requiere renegociación.
- **DexAvatar**, **HaMeR**, **SMPLer-X** — licencias de investigación; verificar antes de cualquier uso derivado.

## Personas

- Asesoría lingüística LSE: *pendiente de acuerdo formal con Fundación CNSE / CNLSE*.
- Profesorado sordo colaborador: se listará aquí con consentimiento explícito por PR.
