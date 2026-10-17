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
  /** 1 si es de los ojos (globo, iris, pestañas): da el contorno de los ojos del modelo. */
  eye?: Uint8Array;
  /** 1 si es ropa: no es la cabeza, aunque el cuello de una capucha llegue a la barbilla. */
  cloth?: Uint8Array;
  /** Triángulos de la malla (tres índices de vértice cada uno), para la cara vista de frente. */
  tri?: Uint32Array;
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

/**
 * Ya es el cuello lo que está esto por detrás del entrecejo, o de golpe esto por detrás de lo
 * anterior del perfil (en distancias entre los ojos). La barbilla de una cara de dibujo, pequeña
 * y metida, queda más de media distancia por detrás del entrecejo.
 */
const CHIN_BEHIND = 0.9;
const CHIN_CLIFF = 0.5;

/**
 * Perfil de la cara: lo más adelantado de la línea media en franjas de altura `step` hacia abajo
 * desde los ojos (la k-ésima centrada en −(k+1)·step), de los vértices cerca del centro y de los
 * triángulos que lo cruzan. Con los vértices solos, la cara de un modelo de dibujo (casi plana de
 * la nariz a la boca, de triángulos grandes) dejaba franjas vacías o con solo la nuca.
 */
function midlineFront(c: Cloud, mid: number, step: number, n: number): Float32Array {
  const out = new Float32Array(n).fill(-Infinity);
  const put = (u: number, f: number) => {
    const k = Math.round(-u / step) - 1;
    if (k >= 0 && k < n && f > out[k]!) out[k] = f;
  };
  for (let i = 0; i < c.r.length; i++) {
    if (!c.hair[i] && Math.abs(c.r[i]!) <= mid) put(c.u[i]!, c.f[i]!);
  }
  const t = c.tri;
  for (let j = 0; t && j + 2 < t.length; j += 3) {
    const v = [t[j]!, t[j + 1]!, t[j + 2]!];
    if (v.every((i) => c.hair[i])) continue;
    // Donde el triángulo corta el plano r = 0: un segmento en (u, f).
    const pts: [number, number][] = [];
    for (let e = 0; e < 3; e++) {
      const a = v[e]!;
      const b = v[(e + 1) % 3]!;
      const ra = c.r[a]!;
      const rb = c.r[b]!;
      if ((ra < 0) === (rb < 0) || ra === rb) continue;
      const x = ra / (ra - rb);
      pts.push([c.u[a]! + x * (c.u[b]! - c.u[a]!), c.f[a]! + x * (c.f[b]! - c.f[a]!)]);
    }
    if (pts.length < 2) continue;
    const [[ua, fa], [ub, fb]] = pts as [[number, number], [number, number]];
    const k0 = Math.ceil(-Math.max(ua, ub) / step) - 1;
    const k1 = Math.floor(-Math.min(ua, ub) / step) - 1;
    for (let k = Math.max(0, k0); k <= Math.min(n - 1, k1); k++) {
      const u = -(k + 1) * step;
      put(u, ua === ub ? Math.max(fa, fb) : fa + ((u - ua) / (ub - ua)) * (fb - fa));
    }
  }
  return out;
}

/**
 * Barbilla: el punto más bajo del perfil de la cara antes de caer al cuello. Una franja suelta
 * sin cara delante (entre el labio y la barbilla de una malla realista, solo se ven por ella los
 * dientes) no es aún el cuello: hacen falta dos seguidas.
 */
function findChinU(c: Cloud, a: Anchors, bridgeF: number): number {
  const s = a.eyeSep;
  const step = 0.05 * s;
  // Sin parar en el hueso del cuello: en una cabeza de dibujo, grande, está por encima de la barbilla.
  const profile = midlineFront(c, 0.2 * s, step, Math.floor((4 * s) / step) - 1);
  let chin = -1.2 * s;
  let misses = 0;
  let behind = 0;
  let last = bridgeF;
  for (let k = 0; k < profile.length; k++) {
    const f = profile[k]!;
    if (f === -Infinity) {
      if (++misses > 2) break;
      continue;
    }
    if (f < bridgeF - CHIN_BEHIND * s || f < last - CHIN_CLIFF * s) {
      if (++behind > 1) break;
      continue;
    }
    misses = 0;
    behind = 0;
    last = f;
    chin = -(k + 1) * step;
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
  // Media altura del cuello, por debajo de la barbilla aunque el hueso del cuello (en una cabeza
  // de dibujo) quede por encima.
  const neckU = (chinU + Math.min(a.neckU, chinU - 0.4 * h)) / 2;
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
    neck: midFront([neckU - 0.1 * h, neckU + 0.1 * h], [0, neckU, bridgeF - 0.8 * h]),
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

/**
 * Referencias de una cara de persona en coordenadas de cara: barbilla, nacimiento del pelo,
 * borde de la cara a la altura de los ojos y contorno del ojo (unos 30 × 10 mm con 63 mm
 * entre pupilas y 70 mm de los ojos a la boca).
 */
const HUMAN = { chinV: -1.75, topV: 1.7, edgeH: 2.3, eyeInH: 0.52, eyeOutH: 1.48, eyeTopV: 0.12, eyeBottomV: -0.12 };

/** Profundidad (f) de lo más adelantado de la cabeza en una rejilla de columnas (r, u). */
export type FaceGrid = {
  halfEye: number;
  eyesToMouth: number;
  /** Semiancho de la cara (sin pelo) a la altura de los ojos. */
  halfWidth: number;
  chinU: number;
  /** Lo más adelantado de la barbilla. */
  chinF: number;
  /** Semiancho de la nariz (lo que sobresale de las mejillas a la altura de su punta). */
  noseHalf: number;
  topU: number;
  /** Contorno del ojo derecho del modelo: lado de la nariz y de fuera (r), y arriba y abajo (u). */
  eye: { inR: number; outR: number; top: number; bottom: number };
  r0: number;
  u0: number;
  step: number;
  nr: number;
  nu: number;
  skin: Float32Array;
  hair: Float32Array;
  /** Lo más atrasado de la cabeza (piel o pelo) por celdas: hasta dónde llega por detrás. */
  back: Float32Array;
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
  const back = new Float32Array(nr * nu).fill(Infinity);
  for (let i = 0; i < c.r.length; i++) {
    if (c.cloth?.[i]) continue;
    const col = Math.floor((c.r[i]! - r0) / step);
    const row = Math.floor((c.u[i]! - u0) / step);
    if (col < 0 || col >= nr || row < 0 || row >= nu) continue;
    const k = row * nr + col;
    const grid = c.hair[i] ? hair : skin;
    if (c.f[i]! > grid[k]!) grid[k] = c.f[i]!;
    if (c.f[i]! < back[k]!) back[k] = c.f[i]!;
  }
  // Los vértices solos dejan agujeros donde la malla tiene triángulos más grandes que una
  // celda (en esta cara, casi todas las mejillas): en esas celdas solo caían vértices de la
  // nuca y un contacto en la mejilla acababa dentro de la cabeza. Así que también se pinta
  // cada triángulo, con la profundidad interpolada en el centro de cada celda que cubre.
  const t = c.tri;
  for (let j = 0; t && j + 2 < t.length; j += 3) {
    const a = t[j]!;
    const b = t[j + 1]!;
    const d = t[j + 2]!;
    if (c.cloth?.[a]) continue;
    const ra = c.r[a]!, rb = c.r[b]!, rd = c.r[d]!;
    const ua = c.u[a]!, ub = c.u[b]!, ud = c.u[d]!;
    const c0 = Math.max(0, Math.ceil((Math.min(ra, rb, rd) - r0) / step - 0.5));
    const c1 = Math.min(nr - 1, Math.floor((Math.max(ra, rb, rd) - r0) / step - 0.5));
    const w0 = Math.max(0, Math.ceil((Math.min(ua, ub, ud) - u0) / step - 0.5));
    const w1 = Math.min(nu - 1, Math.floor((Math.max(ua, ub, ud) - u0) / step - 0.5));
    if (c0 > c1 || w0 > w1) continue;
    const det = (rb - ra) * (ud - ua) - (rd - ra) * (ub - ua);
    if (Math.abs(det) < 1e-12) continue;
    const grid = c.hair[a] && c.hair[b] && c.hair[d] ? hair : skin;
    for (let row = w0; row <= w1; row++) {
      const uc = u0 + (row + 0.5) * step;
      for (let col = c0; col <= c1; col++) {
        const rc = r0 + (col + 0.5) * step;
        const l1 = ((rc - ra) * (ud - ua) - (rd - ra) * (uc - ua)) / det;
        const l2 = ((rb - ra) * (uc - ua) - (rc - ra) * (ub - ua)) / det;
        if (l1 < 0 || l2 < 0 || l1 + l2 > 1) continue;
        const f = c.f[a]! + l1 * (c.f[b]! - c.f[a]!) + l2 * (c.f[d]! - c.f[a]!);
        const k = row * nr + col;
        if (f > grid[k]!) grid[k] = f;
        if (f < back[k]!) back[k] = f;
      }
    }
  }
  // Las mallas tienen los vértices separados: se rellenan los huecos rodeados de cabeza
  // (con al menos 4 vecinas llenas), sin agrandar el contorno.
  for (const [grid, sign] of [[skin, 1], [hair, 1], [back, -1]] as const) {
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
                best = Math.max(best, sign * x);
              }
            }
          }
          if (n >= 4) grid[row * nr + col] = sign * best;
        }
      }
    }
  }
  return { halfEye, eyesToMouth, halfWidth, chinU, chinF: map.chin.p[2], noseHalf: noseHalf(c, map, eyesToMouth), topU, eye: eyeBox(c, halfEye, eyesToMouth, halfWidth), r0, u0, step, nr, nu, skin, hair, back };
}

/**
 * Semiancho de la nariz: hasta dónde, a la altura de su punta, la cara sobresale más de la
 * mitad de lo que la nariz sobresale de las mejillas. En una cara de dibujo es un bultito.
 */
function noseHalf(c: Cloud, map: BodyMap, eyesToMouth: number): number {
  const [, noseU, noseF] = map.nose.p;
  const cut = (noseF + Math.max(map.right.cheek.p[2], map.left.cheek.p[2])) / 2;
  let half = 0;
  for (let i = 0; i < c.r.length; i++) {
    if (c.hair[i] || c.eye?.[i] || Math.abs(c.u[i]! - noseU) > 0.15 * eyesToMouth || c.f[i]! < cut) continue;
    half = Math.max(half, Math.abs(c.r[i]!));
  }
  return half;
}

/**
 * Contorno de los ojos del modelo a partir de sus mallas de ojos. En un modelo anime los
 * ojos son enormes (en este, del 30 % al 270 % de la media distancia entre ojos y hasta el
 * 60 % del camino a la boca): sin tenerlo en cuenta, un contacto junto al ojo de una persona
 * caía dentro del ojo del modelo. Sin mallas de ojos, las proporciones de una persona.
 */
function eyeBox(c: Cloud, halfEye: number, eyesToMouth: number, halfWidth: number): FaceGrid["eye"] {
  const human = {
    inR: HUMAN.eyeInH * halfEye,
    outR: HUMAN.eyeOutH * halfEye,
    top: HUMAN.eyeTopV * eyesToMouth,
    bottom: HUMAN.eyeBottomV * eyesToMouth,
  };
  if (!c.eye) return human;
  const rs: number[] = [];
  const us: number[] = [];
  for (let i = 0; i < c.r.length; i++) {
    if (!c.eye[i] || Math.abs(c.u[i]!) > 2 * eyesToMouth || Math.abs(c.r[i]!) > halfWidth) continue;
    rs.push(Math.abs(c.r[i]!));
    us.push(c.u[i]!);
  }
  if (rs.length < 20) return human;
  const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.floor(p * (xs.length - 1))]!;
  // De lado, sin las puntas: el rabillo del delineado de un ojo de dibujo (VRoid) sale bastante
  // más allá del blanco del ojo.
  const box = { inR: q(rs, 0.05), outR: q(rs, 0.9), top: q(us, 0.98), bottom: q(us, 0.02) };
  // Los huesos de los ojos no siempre están en el centro del ojo que se ve (en este modelo,
  // más hacia dentro): basta con que el contorno sea coherente con la cara.
  const sane = box.inR < box.outR && box.outR < halfWidth && box.bottom < box.top && box.bottom > -eyesToMouth && box.top < 2 * eyesToMouth;
  return sane ? box : human;
}

/** Interpolación lineal por tramos entre anclas (xs creciente); fuera, sigue el tramo del extremo. */
function piecewise(x: number, xs: number[], ys: number[]): number {
  let k = 0;
  while (k < xs.length - 2 && x > xs[k + 1]!) k++;
  return ys[k]! + ((x - xs[k]!) / (xs[k + 1]! - xs[k]!)) * (ys[k + 1]! - ys[k]!);
}

/**
 * De coordenadas de cara de una persona a (r, u) en este modelo, por tramos anclados en lo
 * que tienen las dos caras: el centro, el contorno del ojo, el borde de la cara, la boca, la
 * barbilla y el nacimiento del pelo. Lo que en la persona queda por fuera, por debajo o por
 * encima del ojo cae igual respecto al ojo del modelo, aunque sea mucho más grande.
 */
export function faceToModel(g: FaceGrid, [h, v]: FaceCoords): [number, number] {
  const u = piecewise(
    v,
    [HUMAN.chinV, -1, HUMAN.eyeBottomV, HUMAN.eyeTopV, HUMAN.topV],
    [g.chinU, -g.eyesToMouth, g.eye.bottom, g.eye.top, 0.8 * g.topU],
  );
  const byEye = piecewise(
    Math.abs(h),
    [0, HUMAN.eyeInH, HUMAN.eyeOutH, HUMAN.edgeH],
    [0, g.eye.inR, g.eye.outR, g.halfWidth],
  );
  // Por debajo de los ojos, de lado según lo ancha que es la cara a esa altura: en una cara de
  // dibujo, de ojos enormes y barbilla en punta, junto a la nariz caía bajo el centro del ojo
  // (NARIZ) y bajo la mandíbula, fuera de la barbilla, a la altura de la boca (GRACIAS). Fuera
  // de la cara solo de la boca para abajo: a la altura de la oreja, como el ojo.
  const human = piecewise(v, HUMAN_HALF[0], HUMAN_HALF[1]);
  const below = smoothstep01((HUMAN.eyeBottomV - v) / 0.5);
  const outside = smoothstep01((v + 1) / 0.5) * smoothstep01((Math.abs(h) / human - 0.9) / 0.3);
  const w = below * (1 - outside);
  // Bajo la barbilla, con su anchura: la del cuello es otra.
  const byWidth = w > 0 ? besideNose(g, Math.abs(h), v, human, rowHalf(g, Math.max(u, g.chinU))) : byEye;
  return [Math.sign(h) * ((1 - w) * byEye + w * byWidth), u];
}

/**
 * De lado por debajo de los ojos, en proporción a la anchura de la cara (`half` en el modelo,
 * `human` en la persona) y, a la altura de la nariz, con la nariz como nariz: lo que en una
 * persona está en ella o pegado a ella (NARIZ, DESCUBRIR) queda junto a la del modelo, que en
 * una cara de dibujo es un bultito, y no en medio de la mejilla.
 */
function besideNose(g: FaceGrid, h: number, v: number, human: number, half: number): number {
  const byWidth = (h / human) * half;
  const band = smoothstep01((v + 0.85) / 0.2) * smoothstep01((-0.05 - v) / 0.2);
  if (band <= 0) return byWidth;
  const nose = Math.min(g.noseHalf, (HUMAN_NOSE_H / human) * half);
  const byNose = h <= HUMAN_NOSE_H
    ? (h / HUMAN_NOSE_H) * nose
    : nose + ((h - HUMAN_NOSE_H) / (human - HUMAN_NOSE_H)) * (half - nose);
  return (1 - band) * byWidth + band * byNose;
}

/** Semiancho de la nariz de una persona con el dedo que la toca por un lado, en coordenadas de cara. */
const HUMAN_NOSE_H = 0.8;

/** Media anchura de la cara de una persona (sin las orejas) según la altura, en coordenadas de cara. */
const HUMAN_HALF: [number[], number[]] = [
  [HUMAN.chinV, -1.4, -1, -0.55, HUMAN.eyeBottomV],
  [0.9, 1.5, 1.9, 2.2, HUMAN.edgeH],
];

const smoothstep01 = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

/**
 * Media anchura de la cara del modelo en la fila de altura `u` (o en la más cercana con piel):
 * la de la piel que está casi tan delante como la más adelantada de la fila. La de más atrás es
 * el cuello, las orejas o los lados de la cabeza, que de frente asoman tras la mandíbula.
 */
function rowHalf(g: FaceGrid, u: number): number {
  const row0 = Math.min(g.nu - 1, Math.max(0, Math.floor((u - g.u0) / g.step)));
  for (let d = 0; d < g.nu; d++) {
    for (const row of [row0 + d, row0 - d]) {
      if (row < 0 || row >= g.nu) continue;
      let front = -Infinity;
      for (let c = 0; c < g.nr; c++) {
        const f = g.skin[row * g.nr + c]!;
        if (f > front) front = f;
      }
      if (front === -Infinity) continue;
      let half = 0;
      for (let c = 0; c < g.nr; c++) {
        if (g.skin[row * g.nr + c]! >= front - FACE_FRONT_DEPTH * g.eyesToMouth) {
          half = Math.max(half, Math.abs(g.r0 + (c + 0.5) * g.step));
        }
      }
      return half;
    }
  }
  return g.halfWidth;
}

/** Cuánto más atrás que lo más adelantado de su fila sigue siendo cara, en distancias ojos→boca. */
const FACE_FRONT_DEPTH = 0.6;

/** Por detrás de la punta de la barbilla, en distancias ojos→boca, donde la sostiene la mano. */
const UNDER_CHIN_DEPTH = 0.13;
/**
 * Por debajo de la barbilla, en distancias ojos→boca, donde quedan los nudillos de en medio (el
 * contacto «knuckles»): con los dedos algo doblados, el dorso queda por encima de ellos.
 */
const UNDER_CHIN_DROP = 0.15;

/**
 * Bajo la barbilla, en la vertical de `face`: la mano plana que la sostiene (ENFADADO, PADRE)
 * apoya el dorso ahí, algo por detrás de la punta; el punto, el de sus nudillos de en medio, y
 * la normal hacia abajo. Con el punto de
 * la cara, en una cara de dibujo (la barbilla pegada a la boca) la mano tapaba la boca.
 */
export function chinUnderside(g: FaceGrid, face: FaceCoords): Surface {
  const [r] = faceToModel(g, face);
  const col = Math.min(g.nr - 1, Math.max(0, Math.floor((r - g.r0) / g.step)));
  let row = Math.min(g.nu - 1, Math.max(0, Math.floor((g.chinU - g.u0) / g.step)));
  // La primera fila con cara desde la barbilla hacia arriba y, desde ella, hacia abajo mientras
  // siga siendo barbilla (el cuello queda muy por detrás): la barbilla medida es lo más
  // adelantado de su parte baja, algo por encima de donde acaba.
  const neckF = g.chinF - NECK_BEHIND * g.eyesToMouth;
  while (row < g.nu - 1 && !(frontAt(g, col, row) >= neckF)) row++;
  while (row > 0 && frontAt(g, col, row - 1) >= neckF) row--;
  const f = frontAt(g, col, row);
  if (!Number.isFinite(f)) return faceSurface(g, face);
  return {
    p: [r, g.u0 + row * g.step - UNDER_CHIN_DROP * g.eyesToMouth, f - UNDER_CHIN_DEPTH * g.eyesToMouth],
    n: [0, -1, 0],
  };
}

/**
 * Lo más adelantado de la cabeza en una celda: la piel, o el pelo pegado a ella (flequillo).
 * Con `hairOnly`, donde no hay piel detrás (lo alto de la cabeza), el pelo.
 */
function frontAt(g: FaceGrid, col: number, row: number, hairOnly = false): number {
  if (col < 0 || col >= g.nr || row < 0 || row >= g.nu) return -Infinity;
  const k = row * g.nr + col;
  const s = g.skin[k]!;
  const hr = g.hair[k]!;
  return hr > s && (hr - s < 0.35 * g.eyesToMouth || (hairOnly && !Number.isFinite(s))) ? hr : s;
}

/**
 * Cuánto se mete en la cabeza una bola de radio `radius` centrada en (r, u, f): lo menos que
 * hay que moverla para que salga por delante de su columna (de la cara al cogote) o, de lado
 * o hacia arriba o abajo, a una columna por delante de cuya piel quede. Por detrás de la
 * cabeza no cuenta: una mano no se saca de la cara atravesándola. Los mechones sueltos
 * tampoco: que un dedo pase entre ellos no se nota, y en un modelo con el pelo de punta
 * harían la cabeza el doble de ancha. Mirar solo por delante daba en el borde de la cabeza
 * (la sien, vista de frente) una bola metida hasta el fondo aunque le faltara un pelo para
 * salir de lado.
 */
export function headDepth(g: FaceGrid, [r, u, f]: V3, radius: number): number {
  const col = Math.floor((r - g.r0) / g.step);
  const row = Math.floor((u - g.u0) / g.step);
  const front = frontAt(g, col, row);
  if (!Number.isFinite(front) || f < Math.min(g.back[row * g.nr + col]!, front) - radius) return 0;
  let depth = front + radius - f;
  if (depth <= 0) return 0;
  const clearAt = (c: number, w: number) => f - radius >= frontAt(g, c, w);
  for (let k = 1; k <= HEAD_EXIT_CELLS && (k - 1) * g.step + radius < depth; k++) {
    // Hasta el borde de la celda de al lado y un radio más.
    const toward = (k - 1) * g.step + radius;
    const exits = [
      clearAt(col + k, row) && g.r0 + (col + 1) * g.step - r,
      clearAt(col - k, row) && r - (g.r0 + col * g.step),
      clearAt(col, row + k) && g.u0 + (row + 1) * g.step - u,
      clearAt(col, row - k) && u - (g.u0 + row * g.step),
    ];
    for (const e of exits) if (e !== false) depth = Math.min(depth, toward + e);
  }
  return Math.max(0, depth);
}

/** Cuántas celdas se mira de lado buscando por dónde sale antes una bola metida en la cabeza. */
const HEAD_EXIT_CELLS = 6;

/** Centro de la cabeza (r, u, f): a media altura entre la barbilla y lo alto, y a medio camino de la cara a la nuca. */
export function headCenter(g: FaceGrid): V3 {
  const u = (g.chinU + g.topU) / 2;
  const col = Math.floor(-g.r0 / g.step);
  const row = Math.min(g.nu - 1, Math.max(0, Math.floor((u - g.u0) / g.step)));
  const front = frontAt(g, col, row);
  const back = g.back[row * g.nr + col]!;
  return [0, u, Number.isFinite(front) && Number.isFinite(back) ? (front + back) / 2 : -g.halfWidth];
}

/** Media distancia entre los ojos de una persona, en brazos (hombro→muñeca): unos 3 cm de 58. */
const HUMAN_HALF_EYE_ARMS = 0.055;

/**
 * A qué distancia a un lado del centro de la cara del modelo (r) cae una mano que en la
 * persona está a `h` (coordenada de cara). Dentro de la cara, anclado como `faceToModel`; más
 * allá del borde, lo que sobra es tamaño de mano, no de cara, y se cuenta en brazos: con la
 * cara del modelo mucho más ancha, contado en caras la mano junto a la oreja quedaría lejísimos.
 */
export function lateralToModel(g: FaceGrid, h: number, armLen: number): number {
  const edge = HUMAN.edgeH;
  if (Math.abs(h) <= edge) return faceToModel(g, [h, 0])[0];
  return Math.sign(h) * (g.halfWidth + (Math.abs(h) - edge) * HUMAN_HALF_EYE_ARMS * armLen);
}

/** Lo más que mide de delante atrás una oreja (en tramos ojos-boca); más, y es el cráneo. */
const EAR_DEPTH = 0.6;

/** Cuánto por detrás de la barbilla empieza el cuello, en distancias ojos→boca. */
const NECK_BEHIND = 0.5;

/**
 * Punto de la cabeza del modelo que se ve en esas coordenadas de cara mirándolo de
 * frente (lo que vio la cámara), con su normal. El pelo pegado a la piel (flequillo)
 * cuenta como superficie; el que sobresale mucho, no. Con `behind`, en la oreja, el de detrás.
 */
export function faceSurface(g: FaceGrid, face: FaceCoords, behind = false): Surface {
  const [r, u] = faceToModel(g, face);
  // Por debajo de la boca, lo que está muy por detrás de la barbilla es el cuello, no la cara:
  // junto a una barbilla estrecha (de dibujo), el contacto de la mandíbula (GRACIAS) caía en el
  // cuello, detrás de ella, y la mano no llegaba. Así va al borde de la mandíbula.
  const neckF = g.chinF - NECK_BEHIND * g.eyesToMouth;
  const cell = (col: number, row: number) => {
    const f = frontAt(g, col, row, true);
    return f < neckF && g.u0 + (row + 0.5) * g.step < -g.eyesToMouth ? -Infinity : f;
  };
  const row0 = Math.min(g.nu - 1, Math.max(0, Math.floor((u - g.u0) / g.step)));
  const start = Math.min(g.nr - 1, Math.max(0, Math.floor((r - g.r0) / g.step)));
  let col = start;
  let row = row0;
  // Fuera del contorno de la cabeza: el punto del contorno más cercano, vista de frente, sin
  // alejarse mucho de esa altura. Solo hacia el centro, junto a la oreja de una cabeza de
  // persona caía en la mandíbula, que a la altura del lóbulo queda por delante de la oreja.
  const reach = Math.ceil((0.4 * g.eyesToMouth) / g.step);
  // Bajo la mandíbula, el borde que queda justo encima: las yemas la tocan desde abajo
  // (GRACIAS). Lo más cercano era la punta de una barbilla estrecha y las dos manos se juntaban.
  if (!Number.isFinite(cell(col, row)) && u < -g.eyesToMouth) {
    for (let w = row0 + 1; w <= Math.min(g.nu - 1, row0 + reach); w++) {
      if (Number.isFinite(cell(col, w))) {
        row = w;
        break;
      }
    }
  }
  if (!Number.isFinite(cell(col, row))) {
    let best = Infinity;
    for (let w = Math.max(0, row0 - reach); w <= Math.min(g.nu - 1, row0 + reach); w++) {
      for (let c = 0; c < g.nr; c++) {
        if (!Number.isFinite(cell(c, w))) continue;
        const d = Math.hypot(g.r0 + (c + 0.5) * g.step - r, g.u0 + (w + 0.5) * g.step - u);
        if (d < best) {
          best = d;
          col = c;
          row = w;
        }
      }
    }
  }
  const f = cell(col, row);
  if (!Number.isFinite(f)) return { p: [r, u, 0], n: [0, 0, 1] };
  // Por detrás (la mano ahuecada detrás de la oreja de ESCUCHAR): la cara de atrás de la
  // columna, si es delgada como una oreja; en el cráneo, la de delante.
  const back = g.back[row * g.nr + col]!;
  if (behind && Number.isFinite(back) && f - back < EAR_DEPTH * g.eyesToMouth) {
    return {
      p: [col === start ? r : g.r0 + (col + 0.5) * g.step, row === row0 ? u : g.u0 + (row + 0.5) * g.step, back],
      n: norm([Math.sign(r) * 0.5, 0, -1]),
    };
  }
  const at = (dc: number, dr: number) => {
    const x = cell(col + dc, row + dr);
    return Number.isFinite(x) ? x : f - 2 * g.step;
  };
  // Normal de la superficie f(r, u): (−∂f/∂r, −∂f/∂u, 1), con diferencias centradas.
  const dfr = (at(1, 0) - at(-1, 0)) / (2 * g.step);
  const dfu = (at(0, 1) - at(0, -1)) / (2 * g.step);
  return {
    p: [col === start ? r : g.r0 + (col + 0.5) * g.step, row === row0 ? u : g.u0 + (row + 0.5) * g.step, f],
    n: norm([-dfr, -dfu, 1]),
  };
}
