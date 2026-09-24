#!/usr/bin/env node
// Añade signos exportados desde /dev/grabar a content/signs/captured.json.
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

const store = JSON.parse(readFileSync(target, "utf8"));
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
    store.signs[id] = entry;
    console.log(`${replaced ? "↻" : "+"} ${id} (${entry.avatarClip.keyframes.length} keyframes, ${entry.avatarClip.duration} ms)`);
  }
}
store.signs = Object.fromEntries(Object.entries(store.signs).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(target, JSON.stringify(store, null, 2) + "\n");
console.log(`Guardado en ${target} (${Object.keys(store.signs).length} signos grabados).`);
