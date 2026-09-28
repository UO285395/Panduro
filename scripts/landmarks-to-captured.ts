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
/** Menos no es un signo (la simplificación deja en dos keyframes un movimiento sencillo). */
const MIN_DURATION_MS = 400;

const args = process.argv.slice(2);
const merge = args.includes("--merge");
const outIdx = args.indexOf("--out");
const out = outIdx >= 0 ? args[outIdx + 1]! : "signos-convertidos.json";
const inputs = args.filter((a, i) => !a.startsWith("--") && (outIdx < 0 || i !== outIdx + 1));
if (inputs.length === 0) {
  console.error("Uso: pnpm tsx scripts/landmarks-to-captured.ts <landmarks.json[.gz]> [--merge] [--out archivo.json]");
  process.exit(1);
}

/** Dos decimales bastan para el avatar (1 % del brazo, 0.6° en una dirección) y pesan menos en la app. */
const roundClip = (clip: CapturedSigns["signs"][string]["avatarClip"]) =>
  JSON.parse(JSON.stringify(clip, (_k, v) => (typeof v === "number" && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v))) as typeof clip;

/** Un signo por línea: el archivo se puede revisar y los cambios de un signo no mueven los demás. */
const storeJson = (store: { version: 1; signs: Record<string, unknown> }) =>
  `{\n  "version": ${store.version},\n  "signs": {\n${Object.entries(store.signs)
    .map(([id, e]) => `    ${JSON.stringify(id)}: ${JSON.stringify(e)}`)
    .join(",\n")}\n  }\n}\n`;

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
      .map((s) => ({ s, ...convertSample(s.frames, s.fps ?? data.fps, s.aspect) }))
      .filter((c): c is typeof c & { result: { ok: true } } => c.result.ok)
      .filter((c) => c.result.stats.handRate >= MIN_HAND_RATE && c.result.clip.duration >= MIN_DURATION_MS)
      .sort((a, b) => b.result.stats.handRate - a.result.stats.handRate);
    const best = candidates[0];
    if (!best) {
      rejected.push(signId);
      continue;
    }
    contacts += best.result.clip.keyframes.filter((k) => k.hand.contact).length > 0 ? 1 : 0;
    const url = best.s.url ?? (/^https?:/.test(data.doi) ? data.doi : undefined);
    result.signs[signId] = {
      avatarClip: best.result.clip,
      templates: best.result.templates,
      recordedAt: new Date().toISOString(),
      source: `${data.source}${!url && ref ? ` (${ref})` : ""}${best.leftHanded ? " · signante zurdo" : ""}`,
      license: data.license,
      ...(url ? { url } : {}),
    };
  }
}

const valid = CapturedSignsSchema.parse(result);
const converted = Object.keys(valid.signs).length;
console.log(`${converted} signos convertidos (${contacts} con contacto detectado).`);
if (rejected.length) console.log(`Sin muestra válida (${rejected.length}): ${rejected.join(", ")}`);

if (merge) {
  const dir = join(process.cwd(), "content", "signs");
  const target = join(dir, "captured.json");
  const templatesFile = join(dir, "captured-templates.json");
  type Store<T> = { version: 1; signs: Record<string, T> };
  const store = JSON.parse(readFileSync(target, "utf8")) as Store<object>;
  const templates = JSON.parse(readFileSync(templatesFile, "utf8")) as Store<unknown>;
  for (const [id, { templates: tpl, ...entry }] of Object.entries(valid.signs)) {
    // Las plantillas van aparte: el reconocedor no necesita los clips ni el avatar las plantillas.
    store.signs[id] = { ...entry, avatarClip: roundClip(entry.avatarClip) };
    if (tpl.length) templates.signs[id] = tpl;
  }
  const sorted = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  store.signs = sorted(store.signs);
  templates.signs = sorted(templates.signs);
  CapturedSignsSchema.parse(store);
  writeFileSync(target, storeJson(store));
  writeFileSync(templatesFile, JSON.stringify(templates) + "\n");
  console.log(`Añadidos a ${target} (${Object.keys(store.signs).length} signos grabados en total).`);
} else {
  writeFileSync(out, JSON.stringify(valid, null, 2) + "\n");
  console.log(`Escrito ${out}. Revísalo en /dev/grabar o añádelo con node scripts/add-captured.mjs ${out}.`);
}
