/**
 * Convierte de golpe landmarks de vídeos (scripts/videos_to_signs.py o swl_lse_export.py)
 * en animaciones del curso, sin pasar signo a signo por /dev/grabar.
 *
 *   pnpm tsx scripts/landmarks-to-captured.ts dilse-landmarks.json[.gz] [más…] [--merge] [--out archivo.json]
 *
 * Por cada signo convierte todas sus muestras con el mismo código que la grabación
 * (framesToClip: posición, forma y orientación de la mano, y contactos con la cara y la
 * otra mano), se queda con la mejor y descarta las que no pasan un mínimo de calidad.
 * Con --merge las añade a content/signs/captured.json; si no, escribe --out (por defecto
 * signos-convertidos.json) para revisarlas antes con /dev/grabar o add-captured.mjs.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { convertSample, type SwlExport } from "@/lib/avatar/importSwl";
import { CapturedSignsSchema, type CapturedSigns } from "@/lib/curriculum/schema";

const MIN_HAND_RATE = 0.6;
const MIN_KEYFRAMES = 3;

const args = process.argv.slice(2);
const merge = args.includes("--merge");
const outIdx = args.indexOf("--out");
const out = outIdx >= 0 ? args[outIdx + 1]! : "signos-convertidos.json";
const inputs = args.filter((a, i) => !a.startsWith("--") && i !== outIdx + 1);
if (inputs.length === 0) {
  console.error("Uso: pnpm tsx scripts/landmarks-to-captured.ts <landmarks.json[.gz]> [--merge] [--out archivo.json]");
  process.exit(1);
}

const read = (file: string): SwlExport => {
  const raw = readFileSync(file);
  return JSON.parse((file.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8")) as SwlExport;
};

const result: CapturedSigns = { version: 1, signs: {} };
const rejected: string[] = [];
let contacts = 0;

for (const file of inputs) {
  const data = read(file);
  const ref = data.doi ? (/^https?:/.test(data.doi) ? data.doi : `doi:${data.doi}`) : "";
  for (const [signId, samples] of Object.entries(data.signs)) {
    const candidates = samples
      .map((s) => ({ s, ...convertSample(s.frames, s.fps ?? data.fps) }))
      .filter((c): c is typeof c & { result: { ok: true } } => c.result.ok)
      .filter((c) => c.result.stats.handRate >= MIN_HAND_RATE && c.result.clip.keyframes.length >= MIN_KEYFRAMES)
      .sort((a, b) => b.result.stats.handRate - a.result.stats.handRate);
    const best = candidates[0];
    if (!best) {
      rejected.push(signId);
      continue;
    }
    contacts += best.result.clip.keyframes.filter((k) => k.hand.contact).length > 0 ? 1 : 0;
    result.signs[signId] = {
      avatarClip: best.result.clip,
      templates: best.result.templates,
      recordedAt: new Date().toISOString(),
      source: `${data.source} (${data.license}${ref ? `, ${ref}` : ""}) · muestra ${best.s.sample}${best.leftHanded ? " · signante zurdo" : ""}`,
    };
  }
}

const valid = CapturedSignsSchema.parse(result);
const converted = Object.keys(valid.signs).length;
console.log(`${converted} signos convertidos (${contacts} con contacto detectado).`);
if (rejected.length) console.log(`Sin muestra válida (${rejected.length}): ${rejected.join(", ")}`);

if (merge) {
  const target = join(process.cwd(), "content", "signs", "captured.json");
  const store = CapturedSignsSchema.parse(JSON.parse(readFileSync(target, "utf8")));
  Object.assign(store.signs, valid.signs);
  store.signs = Object.fromEntries(Object.entries(store.signs).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(target, JSON.stringify(store, null, 2) + "\n");
  console.log(`Añadidos a ${target} (${Object.keys(store.signs).length} signos grabados en total).`);
} else {
  writeFileSync(out, JSON.stringify(valid, null, 2) + "\n");
  console.log(`Escrito ${out}. Revísalo en /dev/grabar o añádelo con node scripts/add-captured.mjs ${out}.`);
}
