# Contribuir a Panduro

Gracias por tu interés. Esta guía cubre cómo contribuir código y —muy importante— cómo contribuir contenido de LSE con validación de la comunidad sorda.

## Principios

1. **La LSE es una lengua natural con gramática y léxico propios**. No es español signado ni ASL. Nunca dependemos de traducciones automáticas para el contenido.
2. **Ninguna lección se publica sin validación de un profesor sordo nativo certificado** (nivel B2+ como enseñante, según la Red Estatal de Enseñanza de las Lenguas de Signos Españolas, CNSE).
3. **Accesibilidad primero**: WCAG 2.2 AA como mínimo. Todo el contenido crítico va acompañado de vídeo signado + texto escrito.

## Contribuir código

### Flujo

1. Fork o rama desde `main`.
2. `pnpm install` y `pnpm dev`.
3. Antes de abrir PR:
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm build`
4. Mensajes de commit convencionales (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`).
5. PR con descripción del *qué*, *por qué* y capturas si toca UI.

### Convenciones

- TypeScript estricto. Sin `any` salvo con justificación en un comentario.
- Componentes de servidor por defecto en `app/**`; marca `"use client"` solo cuando haga falta.
- Tests unitarios para toda lógica no trivial en `lib/` (SM-2, clasificador, gamificación).
- El feedback visual de errores debe ser textual también (no solo color).

## Contribuir contenido (signos, lecciones)

Este flujo se activará plenamente a partir del **Hito 2**. Descripción anticipada:

1. **Propuesta** vía issue con el label `content` describiendo el signo/lección: gloss LSE, castellano, nivel MCER, fuente (DILSE, Spreadthesign, referencia propia).
2. **Grabación** por asesor sordo certificado (los datos técnicos irán en la guía de captura).
3. **Anotación** con landmarks: la herramienta `/dev/capture` (Hito 4) generará el JSON de plantilla.
4. **Revisión** cruzada por un segundo asesor sordo antes de merge.
5. **PR** con:
   - `content/signs/<GLOSS>.json`
   - Referencia al vídeo (URL en CDN)
   - Confirmación explícita de licencia (si viene de DILSE/ARASAAC, indicar atribución CC BY-NC-SA)

## Reportar problemas

- Bugs: issue con pasos, navegador y capturas.
- Errores lingüísticos en LSE: **prioridad alta**, cierra el ojo del reviewer con etiqueta `linguistic-review` y pinguea a alguien de la comunidad sorda.
- Accesibilidad: etiqueta `a11y`.

## Contacto

- Alianzas institucionales: por definir (CNSE / Fundación CNSE / CNLSE — véase `docs/outreach/` cuando exista).
