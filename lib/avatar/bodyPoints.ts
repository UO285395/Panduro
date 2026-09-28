/**
 * Puntos del cuerpo donde la mano puede tocar (barbilla, sien, pecho…), medidos
 * sobre la malla del propio modelo en reposo. Cada modelo tiene otra cara y
 * otras proporciones, así que no sirven posiciones fijas: se toma la nube de
 * vértices en coordenadas del signante y se buscan los puntos con reglas
 * sencillas (el más adelantado de una franja, el más lateral…).
 *
 * Coordenadas: r hacia la derecha del signante, u hacia arriba y f hacia el
 * interlocutor, con origen entre los ojos.
 */

export const BODY_POINTS = [
  "chin", "mouth", "nose", "forehead", "top", "eye", "cheek", "temple", "ear",
  "neck", "chest", "heart", "belly", "shoulder", "shoulderOther",
] as const;
export type BodyPointName = (typeof BODY_POINTS)[number];

/** Partes de la otra mano (signos a dos manos): se calculan con la pose de cada keyframe. */
export const OTHER_HAND_POINTS = ["otherPalm", "otherBack", "otherTips", "otherWrist"] as const;
export type OtherHandPoint = (typeof OTHER_HAND_POINTS)[number];
export const isOtherHand = (name: string): name is OtherHandPoint =>
  (OTHER_HAND_POINTS as readonly string[]).includes(name);

/** Puntos que existen a cada lado; el lado lo pone la mano que toca. */
const SIDED = ["eye", "cheek", "temple", "ear", "shoulder"] as const;
type SidedPoint = (typeof SIDED)[number];
type CentralPoint = Exclude<BodyPointName, SidedPoint | "shoulderOther">;

export type V3 = [number, number, number];
/** Punto de la piel y normal hacia fuera, en (r, u, f). */
export type Surface = { p: V3; n: V3 };

export type BodyMap = Record<CentralPoint, Surface> & {
  right: Record<SidedPoint, Surface>;
  left: Record<SidedPoint, Surface>;
};

export type Cloud = {
  r: Float32Array;
  u: Float32Array;
  f: Float32Array;
  /** 1 si el vértice es pelo: no cuenta para la piel de la cara. */
  hair: Uint8Array;
};

/** Referencias del esqueleto en (r, u, f), ya relativas a los ojos. */
export type Anchors = {
  eyeSep: number;
  neckU: number;
  hipsU: number;
  shoulderU: number;
  /** Hombro derecho (el izquierdo es simétrico). */
  shoulder: V3;
  armLen: number;
};

type Box = { r?: [number, number]; u?: [number, number]; f?: [number, number]; hair?: boolean };

function inside(c: Cloud, i: number, b: Box): boolean {
  if (!b.hair && c.hair[i]) return false;
  const r = c.r[i]!;
  const u = c.u[i]!;
  const f = c.f[i]!;
  return (!b.r || (r >= b.r[0] && r <= b.r[1]))
    && (!b.u || (u >= b.u[0] && u <= b.u[1]))
    && (!b.f || (f >= b.f[0] && f <= b.f[1]));
}

/** Vértice de la caja con mayor valor de `score`. */
function best(c: Cloud, b: Box, score: (r: number, u: number, f: number) => number): V3 | null {
  let bestI = -1;
  let bestS = -Infinity;
  for (let i = 0; i < c.r.length; i++) {
    if (!inside(c, i, b)) continue;
    const s = score(c.r[i]!, c.u[i]!, c.f[i]!);
    if (s > bestS) {
      bestS = s;
      bestI = i;
    }
  }
  return bestI < 0 ? null : [c.r[bestI]!, c.u[bestI]!, c.f[bestI]!];
}

const front = (_r: number, _u: number, f: number) => f;

function norm(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Barbilla: el punto más bajo del perfil de la cara antes de caer al cuello. */
function findChinU(c: Cloud, a: Anchors, bridgeF: number): number {
  const s = a.eyeSep;
  const step = 0.05 * s;
  const mid: [number, number] = [-0.2 * s, 0.2 * s];
  let chin = -1.2 * s;
  let misses = 0;
  for (let u = -step; u > Math.max(a.neckU, -4 * s); u -= step) {
    const p = best(c, { r: mid, u: [u - step / 2, u + step / 2] }, front);
    if (!p) {
      if (++misses > 2) break;
      continue;
    }
    if (p[2] < bridgeF - 0.5 * s) break;
    misses = 0;
    chin = u;
  }
  return chin;
}

export function measureBody(c: Cloud, a: Anchors): BodyMap {
  const s = a.eyeSep;
  const L = a.armLen;
  const mid: [number, number] = [-0.2 * s, 0.2 * s];
  const bridgeF = best(c, { r: mid, u: [-0.1 * s, 0.1 * s] }, front)?.[2] ?? 0.4 * s;
  const chinU = findChinU(c, a, bridgeF);
  const h = -chinU; // de la barbilla a los ojos
  const band = (lo: number, hi: number): [number, number] => [chinU + lo * h, chinU + hi * h];
  const F: V3 = [0, 0, 1];
  const U: V3 = [0, 1, 0];

  const at = (p: V3 | null, fallback: V3, n: V3): Surface => ({ p: p ?? fallback, n: norm(n) });
  const midFront = (u: [number, number], fallback: V3, n: V3 = F, hair = false) =>
    at(best(c, { r: mid, u, hair }, front), fallback, n);

  const shoulderHalf = Math.abs(a.shoulder[0]);
  const chestU = a.shoulderU - 0.2 * L;
  const chestFallbackF = a.shoulder[2] + 0.12 * L;

  const sided = (sign: 1 | -1): Record<SidedPoint, Surface> => {
    const out: V3 = [sign, 0, 0];
    const side = (lo: number, hi: number): [number, number] =>
      sign > 0 ? [lo, hi] : [-hi, -lo];
    const lateral = (r: number) => r * sign;

    const cheekBand = band(0.4, 0.55);
    const faceHalf = Math.abs(
      best(c, { u: cheekBand, f: [bridgeF - 0.6 * h, Infinity], r: side(0, 2 * s) }, lateral)?.[0] ?? 0.7 * s,
    );
    const eyeR = 0.5 * s;
    return {
      eye: at(
        best(c, { r: side(eyeR - 0.15 * s, eyeR + 0.15 * s), u: [-0.18 * h, -0.05 * h] }, front),
        [sign * eyeR, -0.1 * h, bridgeF],
        F,
      ),
      cheek: at(
        best(c, { r: side(0.5 * faceHalf, 0.75 * faceHalf), u: cheekBand }, front),
        [sign * 0.6 * faceHalf, chinU + 0.45 * h, bridgeF - 0.2 * h],
        [sign * 0.7, 0, 1],
      ),
      temple: at(
        best(c, { u: [0.15 * h, 0.4 * h], f: [bridgeF - 0.7 * h, bridgeF - 0.15 * h], r: side(0, 3 * s) }, lateral),
        [sign * 1.1 * s, 0.15 * h, bridgeF - 0.4 * h],
        [sign, 0, 0.35],
      ),
      ear: at(
        best(c, { u: [-0.35 * h, -0.1 * h], f: [bridgeF - 1.4 * h, bridgeF - 0.4 * h], r: side(0, 3 * s) }, lateral),
        [sign * 1.2 * s, -0.2 * h, bridgeF - 0.9 * h],
        out,
      ),
      shoulder: at(
        best(c, {
          r: side(0.6 * shoulderHalf, 1.05 * shoulderHalf),
          u: [a.shoulderU - 0.2 * L, a.shoulderU + 0.2 * L],
          f: [a.shoulder[2] - 0.12 * L, a.shoulder[2] + 0.12 * L],
        }, (_r, u) => u),
        [sign * 0.85 * shoulderHalf, a.shoulderU + 0.06 * L, a.shoulder[2]],
        [0, 0.8, 0.4],
      ),
    };
  };

  return {
    chin: midFront(band(0, 0.12), [0, chinU, bridgeF - 0.1 * h], [0, -0.55, 0.85]),
    mouth: midFront(band(0.25, 0.35), [0, chinU + 0.3 * h, bridgeF], F),
    nose: midFront(band(0.5, 0.75), [0, chinU + 0.6 * h, bridgeF + 0.1 * h], F),
    forehead: midFront([0.35 * h, 0.55 * h], [0, 0.45 * h, bridgeF - 0.05 * h], [0, 0.25, 1]),
    top: at(
      best(c, { r: [-0.5 * s, 0.5 * s], f: [bridgeF - 2.5 * h, bridgeF], hair: true }, (_r, u) => u),
      [0, 1.1 * h, bridgeF - h],
      U,
    ),
    neck: midFront([(chinU + a.neckU) / 2 - 0.1 * h, (chinU + a.neckU) / 2 + 0.1 * h], [0, (chinU + a.neckU) / 2, bridgeF - 0.8 * h]),
    chest: midFront([chestU - 0.04 * L, chestU + 0.04 * L], [0, chestU, chestFallbackF], F, true),
    heart: at(
      best(c, { r: [-0.5 * shoulderHalf, -0.25 * shoulderHalf], u: [chestU - 0.04 * L, chestU + 0.04 * L], hair: true }, front),
      [-0.35 * shoulderHalf, chestU, chestFallbackF],
      F,
    ),
    belly: (() => {
      const u = a.hipsU + 0.45 * (chestU - a.hipsU);
      return midFront([u - 0.04 * L, u + 0.04 * L], [0, u, chestFallbackF], F, true);
    })(),
    right: sided(1),
    left: sided(-1),
  };
}

/** Punto al que apunta un contacto, desde el lado de la mano que toca. */
export function surfaceFor(map: BodyMap, name: BodyPointName, side: "right" | "left"): Surface {
  if (name === "shoulderOther") return map[side === "right" ? "left" : "right"].shoulder;
  if ((SIDED as readonly string[]).includes(name)) return map[side][name as SidedPoint];
  return map[name as CentralPoint];
}

// --- Cara: punto exacto donde toca la mano ------------------------------------

/**
 * Coordenadas de cara de un contacto, medidas en la imagen de la grabación: h en medias
 * distancias entre los ojos (positivo hacia la derecha del signante) y v en distancias
 * ojos→boca (positivo hacia arriba), desde el punto entre los ojos. En una persona la
 * boca queda en v = −1, la barbilla hacia −1.75, la frente hacia +0.8, la sien hacia
 * h = 2.1 y el borde de la cara hacia h = 2.3.
 */
export type FaceCoords = [number, number];

const HUMAN = { chinV: -1.75, topV: 1.7, edgeH: 2.3 };

/** Profundidad (f) de lo más adelantado de la cabeza en una rejilla de columnas (r, u). */
export type FaceGrid = {
  halfEye: number;
  eyesToMouth: number;
  /** Semiancho de la cara (sin pelo) a la altura de los ojos. */
  halfWidth: number;
  chinU: number;
  topU: number;
  r0: number;
  u0: number;
  step: number;
  nr: number;
  nu: number;
  skin: Float32Array;
  hair: Float32Array;
};

export function measureFace(c: Cloud, map: BodyMap, a: Anchors): FaceGrid {
  const halfEye = a.eyeSep / 2;
  const eyesToMouth = Math.max(0.3 * a.eyeSep, -map.mouth.p[1]);
  let halfWidth = 0;
  for (let i = 0; i < c.r.length; i++) {
    if (c.hair[i] || Math.abs(c.u[i]!) > 0.25 * eyesToMouth || c.u[i]! < a.neckU) continue;
    if (c.f[i]! < map.nose.p[2] - 3 * eyesToMouth) continue;
    halfWidth = Math.max(halfWidth, Math.abs(c.r[i]!));
  }
  halfWidth = Math.max(halfWidth, 1.5 * halfEye);
  const chinU = map.chin.p[1];
  const topU = map.top.p[1];
  const step = halfWidth / 12;
  const r0 = -1.4 * halfWidth;
  const u0 = chinU - eyesToMouth;
  const nr = Math.ceil((2.8 * halfWidth) / step);
  const nu = Math.ceil((topU - u0) / step) + 1;
  const skin = new Float32Array(nr * nu).fill(-Infinity);
  const hair = new Float32Array(nr * nu).fill(-Infinity);
  for (let i = 0; i < c.r.length; i++) {
    const col = Math.floor((c.r[i]! - r0) / step);
    const row = Math.floor((c.u[i]! - u0) / step);
    if (col < 0 || col >= nr || row < 0 || row >= nu) continue;
    const k = row * nr + col;
    const grid = c.hair[i] ? hair : skin;
    if (c.f[i]! > grid[k]!) grid[k] = c.f[i]!;
  }
  // Las mallas tienen los vértices separados: se rellenan los huecos rodeados de cabeza
  // (con al menos 4 vecinas llenas), sin agrandar el contorno.
  for (const grid of [skin, hair]) {
    for (let pass = 0; pass < 2; pass++) {
      const src = grid.slice();
      for (let row = 1; row < nu - 1; row++) {
        for (let col = 1; col < nr - 1; col++) {
          if (Number.isFinite(src[row * nr + col]!)) continue;
          let n = 0;
          let best = -Infinity;
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const x = src[(row + dr) * nr + col + dc]!;
              if (Number.isFinite(x)) {
                n++;
                best = Math.max(best, x);
              }
            }
          }
          if (n >= 4) grid[row * nr + col] = best;
        }
      }
    }
  }
  return { halfEye, eyesToMouth, halfWidth, chinU, topU, r0, u0, step, nr, nu, skin, hair };
}

/** De coordenadas de cara de una persona a (r, u) en este modelo, por tramos. */
export function faceToModel(g: FaceGrid, [h, v]: FaceCoords): [number, number] {
  const ah = Math.abs(h);
  const r = Math.sign(h) * (ah <= 1
    ? ah * g.halfEye
    : g.halfEye + ((ah - 1) / (HUMAN.edgeH - 1)) * (g.halfWidth - g.halfEye));
  const u = v >= 0
    ? (v / HUMAN.topV) * 0.8 * g.topU
    : v >= -1
      ? v * g.eyesToMouth
      : -g.eyesToMouth + ((v + 1) / (HUMAN.chinV + 1)) * (g.chinU + g.eyesToMouth);
  return [r, u];
}

/**
 * Punto de la cabeza del modelo que se ve en esas coordenadas de cara mirándolo de
 * frente (lo que vio la cámara), con su normal. El pelo pegado a la piel (flequillo)
 * cuenta como superficie; el que sobresale mucho, no.
 */
export function faceSurface(g: FaceGrid, face: FaceCoords): Surface {
  const [r, u] = faceToModel(g, face);
  const cell = (col: number, row: number) => {
    if (col < 0 || col >= g.nr || row < 0 || row >= g.nu) return -Infinity;
    const k = row * g.nr + col;
    const s = g.skin[k]!;
    const hr = g.hair[k]!;
    return hr > s && hr - s < 0.35 * g.eyesToMouth ? hr : s;
  };
  const row = Math.min(g.nu - 1, Math.max(0, Math.floor((u - g.u0) / g.step)));
  const start = Math.min(g.nr - 1, Math.max(0, Math.floor((r - g.r0) / g.step)));
  let col = start;
  // Fuera del contorno de la cabeza: hacia el centro hasta dar con ella.
  const center = Math.floor(-g.r0 / g.step);
  while (!Number.isFinite(cell(col, row)) && col !== center) col += col > center ? -1 : 1;
  const f = cell(col, row);
  const at = (dc: number, dr: number) => {
    const x = cell(col + dc, row + dr);
    return Number.isFinite(x) ? x : f - 2 * g.step;
  };
  // Normal de la superficie f(r, u): (−∂f/∂r, −∂f/∂u, 1), con diferencias centradas.
  const dfr = (at(1, 0) - at(-1, 0)) / (2 * g.step);
  const dfu = (at(0, 1) - at(0, -1)) / (2 * g.step);
  return {
    p: [col === start ? r : g.r0 + (col + 0.5) * g.step, u, Number.isFinite(f) ? f : 0],
    n: norm([-dfr, -dfu, 1]),
  };
}
