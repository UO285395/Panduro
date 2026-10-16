# Créditos y licencias

Panduro combina código propio con recursos abiertos de la comunidad LSE. Este archivo se actualiza en cada release.

## Recursos lingüísticos (contenido)

- **DILSE** — Diccionario de la Lengua de Signos Española, © Fundación CNSE. <https://fundacioncnse-dilse.org>. Licencia **CC BY-NC-SA 3.0**.
  Las animaciones del avatar de los signos marcados con esta fuente en `content/signs/captured.json`
  (y sus plantillas de reconocimiento en `captured-templates.json`) se han obtenido de los vídeos del
  DILSE: posición, forma y orientación de las manos medidas con MediaPipe en cada fotograma
  (`scripts/dilse_download.py`, `scripts/videos_to_signs.py`, `scripts/landmarks-to-captured.ts`).
  Son una obra derivada y se distribuyen con la misma licencia CC BY-NC-SA 3.0, sin uso comercial. La
  app cita la fuente y enlaza la entrada del diccionario junto a cada animación. Los vídeos no se
  incluyen en el repositorio.
- **Spreadthesign** — diccionario internacional gratuito de lenguas de signos. <https://www.spreadthesign.com>. Uso educativo.
  Las descripciones de los signos que el DILSE no tiene (ARTISTA, COCINERO, CREATIVIDAD,
  CLASIFICAR, AMBIGÜEDAD, NORMALIZACIÓN…) están escritas mirando sus vídeos de LSE; para algunos,
  los de una palabra de la misma familia (innovar, coherente, sutil, espontaneidad, fluido, cómo).
  Su alfabeto dactilológico y algunos signos sirven también para medir el reconocimiento por
  cámara con otra persona (`docs/reconocimiento.md`). Los vídeos no se guardan en el repositorio
  ni se usan para las animaciones.
- **ARASAAC** — Portal Aragonés de la Comunicación Aumentativa y Alternativa. Pictogramas y recursos LSE bajo **CC BY-NC-SA 4.0**. <https://arasaac.org>.

## Avatar 3D

- **Modelo de Panduro** (`public/avatars/panduro.vrm`) — **CC0 1.0**, dedicado al dominio
  público. Hecho con MakeHuman a partir de recursos **CC0** de la comunidad MakeHuman
  (<https://www.makehumancommunity.org>): malla base, ojos, cejas, pestañas, dientes y lengua de
  sistema y la ropa `male_casualsuit01` y `shoes01` (`makehuman_system_assets`), el pelo
  `culturalibre_hair_02` (`hair01`), la piel `toigo_light_skin_male_bronze` (`skins02`), el
  material de la camisa de toigo (`system_clothes_materials01`, recoloreado) y las formas de la
  cara `faceunits01` (ARKit) y `visemes02`. Se rehace con `scripts/avatar/build.sh`
  (ver `docs/avatar.md`).
- Herramientas, que no se distribuyen: **Blender** (GPL), **MPFB** (complemento de MakeHuman para
  Blender, GPL) y **VRM Add-on for Blender** (MIT).

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
