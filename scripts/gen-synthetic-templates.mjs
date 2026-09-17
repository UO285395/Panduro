#!/usr/bin/env node
/**
 * Genera plantillas sintéticas plausibles para el clasificador k-NN.
 *
 * Estructura de salida:
 *  - content/signs/fingerspelling.json: 27 letras (A-Z + Ñ). Las 12 más
 *    distintivas reciben 3 plantillas sintéticas; el resto queda vacío
 *    (pendiente de calibración con /dev/capture).
 *  - content/signs/lexicon.json: 6 signos léxicos representativos con
 *    3 plantillas cada uno.
 *
 * Convención de coordenadas normalizadas:
 *  - wrist (idx 0) = (0, 0, 0)
 *  - middle_mcp (idx 9) = (0, -1, 0)   → hacia arriba en la imagen
 *  - eje X: derecha positiva
 *  - eje Z: profundidad (0 = plano frontal)
 *
 * IMPORTANTE: son APROXIMACIONES basadas en la configuración canónica de
 * cada signo. Se marcan explícitamente como "synthetic" en el JSON. La
 * fidelidad lingüística requiere validación con asesor sordo.
 */

import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// --- helpers ---------------------------------------------------------------

/** Devuelve un dedo genérico según su estado ("open" | "closed" | "half"). */
function finger(kind, base, dir, length) {
  // base: {x,y,z} del MCP
  // dir: {x,y,z} vector unitario del dedo extendido
  // length: longitud total del dedo (MCP a TIP)
  const [mcp, pip, dip, tip] = [
    base,
    { x: base.x + dir.x * length * 0.33, y: base.y + dir.y * length * 0.33, z: base.z + dir.z * length * 0.33 },
    { x: base.x + dir.x * length * 0.66, y: base.y + dir.y * length * 0.66, z: base.z + dir.z * length * 0.66 },
    { x: base.x + dir.x * length, y: base.y + dir.y * length, z: base.z + dir.z * length },
  ];
  if (kind === "open") return [mcp, pip, dip, tip];
  if (kind === "half") {
    // dedo doblado 90 grados en PIP: DIP y TIP se curvan hacia palma
    const curve = { x: -dir.y, y: dir.x, z: 0.2 };
    return [
      mcp,
      pip,
      { x: pip.x + curve.x * length * 0.25, y: pip.y + curve.y * length * 0.25, z: 0.15 },
      { x: pip.x + curve.x * length * 0.45, y: pip.y + curve.y * length * 0.45, z: 0.2 },
    ];
  }
  // closed: DIP y TIP muy curvados hacia la palma
  return [
    mcp,
    { x: mcp.x + dir.x * length * 0.28, y: mcp.y + dir.y * length * 0.15, z: 0.1 },
    { x: mcp.x + dir.x * length * 0.2, y: mcp.y + dir.y * length * 0.02, z: 0.2 },
    { x: mcp.x + dir.x * length * 0.12, y: mcp.y - dir.y * length * 0.05, z: 0.25 },
  ];
}

/** Pulgar. Los estados son "up" (arriba, junto a los dedos), "side" (lateral extendido), "down" (abajo), "closed" (plegado sobre palma). */
function thumb(kind) {
  // base fija: CMC
  const cmc = { x: 0.25, y: -0.05, z: 0 };
  if (kind === "up") {
    return [
      cmc,
      { x: 0.35, y: -0.4, z: 0 },
      { x: 0.35, y: -0.75, z: 0 },
      { x: 0.35, y: -1.05, z: 0 },
    ];
  }
  if (kind === "side") {
    return [
      cmc,
      { x: 0.5, y: -0.2, z: 0 },
      { x: 0.7, y: -0.25, z: 0 },
      { x: 0.9, y: -0.25, z: 0 },
    ];
  }
  if (kind === "down") {
    return [
      cmc,
      { x: 0.28, y: 0.2, z: 0 },
      { x: 0.3, y: 0.55, z: 0 },
      { x: 0.32, y: 0.85, z: 0 },
    ];
  }
  // closed: pulgar plegado sobre la palma
  return [
    cmc,
    { x: 0.2, y: -0.3, z: 0.05 },
    { x: 0.05, y: -0.4, z: 0.1 },
    { x: -0.1, y: -0.45, z: 0.12 },
  ];
}

/** Compone los 21 landmarks para una configuración dada. */
function buildHand({ t, i, m, r, p }) {
  const wrist = { x: 0, y: 0, z: 0 };
  const dirUp = { x: 0, y: -1, z: 0 };
  // Los MCPs de los 4 dedos se distribuyen a lo ancho de la palma
  const indexMcp = { x: 0.35, y: -0.9, z: 0 };
  const middleMcp = { x: 0.05, y: -1.0, z: 0 };
  const ringMcp = { x: -0.25, y: -0.95, z: 0 };
  const pinkyMcp = { x: -0.5, y: -0.85, z: 0 };

  const t4 = thumb(t);
  const i4 = finger(i, indexMcp, dirUp, 1.05);
  const m4 = finger(m, middleMcp, dirUp, 1.15);
  const r4 = finger(r, ringMcp, dirUp, 1.05);
  const p4 = finger(p, pinkyMcp, dirUp, 0.9);

  // Orden MediaPipe: wrist, thumb(1..4), index(5..8), middle(9..12), ring(13..16), pinky(17..20)
  return [wrist, ...t4, ...i4, ...m4, ...r4, ...p4];
}

/** Perturba una plantilla con ruido pequeño (evita todas iguales). */
function perturb(hand, seed) {
  let s = seed;
  return hand.map((p) => {
    s = (s * 9301 + 49297) % 233280;
    const jx = (s / 233280 - 0.5) * 0.05;
    s = (s * 9301 + 49297) % 233280;
    const jy = (s / 233280 - 0.5) * 0.05;
    s = (s * 9301 + 49297) % 233280;
    const jz = (s / 233280 - 0.5) * 0.03;
    return { x: p.x + jx, y: p.y + jy, z: p.z + jz };
  });
}

/** Devuelve 3 plantillas ligeramente perturbadas para una configuración. */
function templatesFor(config, baseSeed) {
  const base = buildHand(config);
  return [1, 2, 3].map((i) => perturb(base, baseSeed + i * 137));
}

// --- Definición de letras --------------------------------------------------

const LETTER_CONFIGS = {
  A: { t: "side", i: "closed", m: "closed", r: "closed", p: "closed" },
  B: { t: "closed", i: "open", m: "open", r: "open", p: "open" },
  C: { t: "side", i: "half", m: "half", r: "half", p: "half" },
  F: { t: "side", i: "closed", m: "open", r: "open", p: "open" },
  I: { t: "closed", i: "closed", m: "closed", r: "closed", p: "open" },
  L: { t: "side", i: "open", m: "closed", r: "closed", p: "closed" },
  O: { t: "half", i: "half", m: "half", r: "half", p: "half" },
  P: { t: "down", i: "open", m: "half", r: "closed", p: "closed" },
  U: { t: "closed", i: "open", m: "open", r: "closed", p: "closed" },
  V: { t: "closed", i: "open", m: "open", r: "closed", p: "closed" }, // como U pero con separación (aprox)
  W: { t: "closed", i: "open", m: "open", r: "open", p: "closed" },
  Y: { t: "side", i: "closed", m: "closed", r: "closed", p: "open" },
};

// --- Definición de signos léxicos -----------------------------------------

// Muy simplificadas: la mayoría son configuraciones estáticas de un fotograma
// clave. La distinción real depende también del movimiento, que un k-NN
// estático no captura.
const LEXICON_CONFIGS = {
  HOLA: { t: "side", i: "open", m: "open", r: "open", p: "open" }, // mano abierta
  ADIOS: { t: "closed", i: "open", m: "open", r: "open", p: "open" }, // parecido pero pulgar plegado
  GRACIAS: { t: "half", i: "half", m: "half", r: "half", p: "half" }, // dedos juntos junto a la barbilla
  SI: { t: "up", i: "closed", m: "closed", r: "closed", p: "closed" }, // puño; usamos como aproximación
  NO: { t: "closed", i: "open", m: "closed", r: "closed", p: "closed" }, // índice extendido
  BIEN: { t: "up", i: "closed", m: "closed", r: "closed", p: "closed" }, // pulgar arriba
};

// --- Ensamblar JSONs -------------------------------------------------------

function loadJson(rel) {
  return JSON.parse(readFileSync(path.join(ROOT, rel), "utf-8"));
}

function writeJson(rel, obj) {
  writeFileSync(path.join(ROOT, rel), JSON.stringify(obj, null, 2) + "\n");
}

const fingerspelling = loadJson("content/signs/fingerspelling.json");
for (const [letter, cfg] of Object.entries(LETTER_CONFIGS)) {
  const entry = fingerspelling.letters[letter];
  if (!entry) throw new Error(`letter ${letter} missing from fingerspelling.json`);
  entry.templates = templatesFor(cfg, letter.charCodeAt(0) * 31);
  entry.templateSource = "synthetic";
}
writeJson("content/signs/fingerspelling.json", fingerspelling);

const lexicon = {
  version: 1,
  signs: {},
};
for (const [sign, cfg] of Object.entries(LEXICON_CONFIGS)) {
  lexicon.signs[sign] = {
    templates: templatesFor(cfg, sign.charCodeAt(0) * 47),
    templateSource: "synthetic",
  };
}
writeJson("content/signs/lexicon.json", lexicon);

console.log("✅ Templates generated");
console.log(`   fingerspelling: ${Object.keys(LETTER_CONFIGS).length} letters × 3 templates`);
console.log(`   lexicon: ${Object.keys(LEXICON_CONFIGS).length} signs × 3 templates`);
