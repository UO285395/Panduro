#!/usr/bin/env node
// Añade signos exportados desde /dev/grabar a content/signs/captured.json (y sus plantillas
// de reconocimiento a captured-templates.json).
// Uso: node scripts/add-captured.mjs <archivo.json> [más archivos...]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "content", "signs", "captured.json");
const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Uso: node scripts/add-captured.mjs <archivo.json> [más archivos...]");
  process.exit(1);
}

const templatesFile = join(root, "content", "signs", "captured-templates.json");
const store = JSON.parse(readFileSync(target, "utf8"));
// Las plantillas (para el reconocedor) van aparte de los clips (para el avatar).
const templates = JSON.parse(readFileSync(templatesFile, "utf8"));
for (const file of files) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  if (data.version !== 1 || typeof data.signs !== "object") {
    console.error(`✗ ${file}: no es una exportación de /dev/grabar`);
    process.exitCode = 1;
    continue;
  }
  for (const [id, entry] of Object.entries(data.signs)) {
    if (!entry?.avatarClip?.keyframes?.length) {
      console.error(`✗ ${file}: ${id} no tiene keyframes`);
      process.exitCode = 1;
      continue;
    }
    const replaced = id in store.signs;
    const { templates: tpl = [], ...rest } = entry;
    store.signs[id] = rest;
    if (tpl.length) templates.signs[id] = tpl;
    else delete templates.signs[id];
    console.log(`${replaced ? "↻" : "+"} ${id} (${entry.avatarClip.keyframes.length} keyframes, ${entry.avatarClip.duration} ms)`);
  }
}
store.signs = Object.fromEntries(Object.entries(store.signs).sort(([a], [b]) => a.localeCompare(b)));
templates.signs = Object.fromEntries(Object.entries(templates.signs).sort(([a], [b]) => a.localeCompare(b)));
// Un signo por línea, como scripts/landmarks-to-captured.ts.
const lines = Object.entries(store.signs).map(([id, e]) => `    ${JSON.stringify(id)}: ${JSON.stringify(e)}`);
writeFileSync(target, `{\n  "version": ${store.version},\n  "signs": {\n${lines.join(",\n")}\n  }\n}\n`);
writeFileSync(templatesFile, JSON.stringify(templates) + "\n");
console.log(`Guardado en ${target} (${Object.keys(store.signs).length} signos grabados).`);
