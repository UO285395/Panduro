/**
 * Enlaces a los vídeos del DILSE de cada signo grabado, para la página de revisión
 * (/dev/revisar), que los pone junto al avatar. Solo los enlaces: los vídeos siguen en la web
 * del DILSE (y, si se han descargado, en data/dilse/videos, que la página usa antes).
 *
 *   node scripts/dilse-video-urls.mjs [data/dilse/manifest.csv]
 *
 * Escribe content/signs/dilse-videos.json. Las frases sin entrada propia (PHRASES en
 * lib/avatar/compose.ts) llevan los vídeos de sus signos, en orden.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const manifestPath = process.argv[2] ?? join(root, "data", "dilse", "manifest.csv");

/** CSV con comillas dobles (las notas del manifest llevan comas). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, k) => [h, r[k] ?? ""])));
}

const manifest = new Map(parseCsv(readFileSync(manifestPath, "utf8")).map((r) => [r.signId, r]));
const captured = JSON.parse(readFileSync(join(root, "content", "signs", "captured.json"), "utf8")).signs;
const compose = readFileSync(join(root, "lib", "avatar", "compose.ts"), "utf8");
const phrases = Object.fromEntries(
  [...compose.matchAll(/^\s+([A-Z_]+): \[([^\]]+)\],$/gm)].map((m) => [m[1], m[2].match(/[A-Z_]+/g)]),
);

const videos = {};
const missing = [];
for (const id of Object.keys(captured).sort()) {
  const parts = phrases[id] ?? [id];
  const urls = parts.map((p) => manifest.get(p)?.video_url).filter(Boolean);
  if (urls.length === parts.length) videos[id] = urls;
  else missing.push(id);
}

const out = join(root, "content", "signs", "dilse-videos.json");
// Un signo por línea: los cambios de un signo no mueven los demás.
const lines = Object.entries(videos).map(([id, urls]) => `    ${JSON.stringify(id)}: ${JSON.stringify(urls)}`);
writeFileSync(out, `{\n  "version": 1,\n  "source": "DILSE · Fundación CNSE",\n  "videos": {\n${lines.join(",\n")}\n  }\n}\n`);
console.log(`${Object.keys(videos).length} signos con vídeo en ${out}.`);
if (missing.length) console.log(`Sin vídeo en el manifest: ${missing.join(", ")}`);
