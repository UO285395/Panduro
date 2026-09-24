import type { AvatarClip, AvatarKeyframe } from "@/lib/curriculum/schema";
import type { Point3 } from "@/lib/mediapipe/types";
import { distributeFlex } from "./pose";

/**
 * Convierte una grabación con MediaPipe (pose + manos) en un AvatarClip.
 *
 * Todo se expresa en el espacio del signante, calculado a partir de sus
 * hombros: x hacia su derecha, y hacia arriba, z hacia el interlocutor. Las
 * posiciones se traducen a las coordenadas del currículo que interpreta
 * vrmMapper (x hacia fuera desde el hombro, y 0.35 ≈ pecho alto y 0.70 ≈ boca,
 * z hacia delante), así que el avatar reproduce el signo con sus propias
 * proporciones. La entrada no debe estar en espejo: los lados salen de la pose.
 */

export type Side = "left" | "right";
export type Landmark = Point3 & { visibility?: number };
export type HandSample = { world: Point3[]; image: Point3[] };

export type CaptureFrame = {
  t: number;
  /** worldLandmarks de PoseLandmarker (33 puntos, metros). */
  poseWorld: Landmark[] | null;
  /** Manos ya asignadas a su lado anatómico (ver assignHands). */
  hands: Partial<Record<Side, HandSample>>;
};

export type CaptureStats = {
  frames: number;
  poseRate: number;
  handRate: number;
  twoHands: boolean;
  durationMs: number;
};

export type CaptureResult =
  | { ok: true; clip: AvatarClip; templates: Point3[][]; stats: CaptureStats }
  | { ok: false; error: string };

type Vec = [number, number, number];

const P = { mouthL: 9, mouthR: 10, lShoulder: 11, rShoulder: 12, lElbow: 13, rElbow: 14, lWrist: 15, rWrist: 16 };
const STEP_MS = 100;
const SMOOTH_RADIUS = 2;
const FULL = distributeFlex(1);
const FINGER_MAX = FULL.proximal + FULL.middle + FULL.distal;
/** Igual que THUMB_FLEX_SCALE del mapper: el pulgar dobla menos. */
const THUMB_MAX = 0.7 * FINGER_MAX;
const FINGER_CHAINS = [
  [1, 2, 3, 4],
  [0, 5, 6, 7, 8],
  [0, 9, 10, 11, 12],
  [0, 13, 14, 15, 16],
  [0, 17, 18, 19, 20],
];
const RELAXED = [0.15, 0.15, 0.15, 0.15, 0.15];

const v = (p: Point3): Vec => [p.x, p.y, p.z];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: Vec, s: number): Vec => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len = (a: Vec) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec): Vec => {
  const l = len(a);
  return l < 1e-9 ? [0, 0, 0] : scale(a, 1 / l);
};
const mid = (a: Point3, b: Point3): Vec => scale([a.x + b.x, a.y + b.y, a.z + b.z], 0.5);
const angle = (a: Vec, b: Vec) => {
  const d = dot(unit(a), unit(b));
  return Math.acos(Math.max(-1, Math.min(1, d)));
};
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const round = (x: number) => Math.round(x * 1000) / 1000;
const mirrorX = (a: Vec): Vec => [-a[0], a[1], a[2]];

/** Inversa de smoothstep: distributeFlex aplica smoothstep a la flexión. */
function invSmoothstep(c: number): number {
  const x = Math.max(0, Math.min(1, c));
  return 0.5 - Math.sin(Math.asin(1 - 2 * x) / 3);
}

/**
 * Flexión 0..1 por dedo (pulgar, índice, medio, anular, meñique). En los
 * cuatro dedos se mide solo en el plano de flexión (se descarta la componente
 * a lo largo de los nudillos) y la referencia del nudillo es el eje de la
 * palma, no la línea muñeca→nudillo, que se abre en abanico con la mano plana.
 */
export function fingerFlex(world: Point3[]): number[] {
  const at = (i: number) => v(world[i]!);
  const knuckles = unit(sub(at(5), at(17)));
  const inPlane = (a: Vec) => sub(a, scale(knuckles, dot(a, knuckles)));
  const palmAxis = sub(at(9), at(0));
  return FINGER_CHAINS.map((chain, i) => {
    let bend = 0;
    if (i === 0) {
      for (let k = 0; k + 2 < chain.length; k++) {
        bend += angle(sub(at(chain[k + 1]!), at(chain[k]!)), sub(at(chain[k + 2]!), at(chain[k + 1]!)));
      }
      return invSmoothstep(bend / THUMB_MAX);
    }
    let prev = inPlane(palmAxis);
    for (let k = 1; k + 1 < chain.length; k++) {
      const seg = inPlane(sub(at(chain[k + 1]!), at(chain[k]!)));
      bend += angle(prev, seg);
      prev = seg;
    }
    return invSmoothstep(bend / FINGER_MAX);
  });
}

/** Dirección de los dedos y normal de la palma (lado de la palma) de una mano. */
export function handOrientation(world: Point3[], side: Side): { point: Vec; palm: Vec } {
  const point = sub(v(world[9]!), v(world[0]!));
  const across = sub(v(world[5]!), v(world[17]!));
  const palm = side === "right" ? cross(across, point) : cross(point, across);
  return { point: unit(point), palm: unit(palm) };
}

/**
 * Asigna cada mano detectada a su lado anatómico usando las muñecas de la
 * pose (coordenadas de imagen), más fiable que la etiqueta de HandLandmarker,
 * que asume imagen en espejo.
 */
export function assignHands(
  poseImage: Point3[] | null,
  hands: HandSample[],
): Partial<Record<Side, HandSample>> {
  if (!poseImage || hands.length === 0) return {};
  const lw = poseImage[P.lWrist]!;
  const rw = poseImage[P.rWrist]!;
  const d = (h: HandSample, w: Point3) => Math.hypot(h.image[0]!.x - w.x, h.image[0]!.y - w.y);
  const [a, b] = hands;
  if (!b) return d(a!, rw) <= d(a!, lw) ? { right: a } : { left: a };
  return d(a!, rw) + d(b, lw) <= d(a!, lw) + d(b, rw) ? { right: a, left: b } : { right: b, left: a };
}

type Sample = {
  t: number;
  pos: Vec;
  hand?: { fingers: number[]; palm: Vec; point: Vec; image: Point3[] };
};

type Timed<T> = { t: number; val: T };

function smooth(points: Timed<number[]>[]): Timed<number[]>[] {
  return points.map((p, i) => {
    const lo = Math.max(0, i - SMOOTH_RADIUS);
    const hi = Math.min(points.length - 1, i + SMOOTH_RADIUS);
    const acc = p.val.map(() => 0);
    for (let j = lo; j <= hi; j++) points[j]!.val.forEach((x, k) => (acc[k]! += x));
    return { t: p.t, val: acc.map((x) => x / (hi - lo + 1)) };
  });
}

function resample(points: Timed<number[]>[], times: number[]): number[][] {
  return times.map((t) => {
    let j = points.findIndex((p) => p.t >= t);
    if (j === -1) return points[points.length - 1]!.val;
    if (j === 0) return points[0]!.val;
    const a = points[j - 1]!;
    const b = points[j]!;
    const u = (t - a.t) / (b.t - a.t || 1);
    return a.val.map((x, k) => x + (b.val[k]! - x) * u);
  });
}

function channel(samples: (Sample | null)[], pick: (s: Sample) => number[] | undefined): Timed<number[]>[] {
  const out: Timed<number[]>[] = [];
  for (const s of samples) {
    const val = s && pick(s);
    if (s && val) out.push({ t: s.t, val });
  }
  return smooth(out);
}

export function framesToClip(frames: CaptureFrame[], opts: { leftHanded?: boolean } = {}): CaptureResult {
  const withPose = frames.filter((f) => f.poseWorld && f.poseWorld.length > P.rWrist);
  if (withPose.length < 5) {
    return { ok: false, error: "No se detecta el cuerpo. Encuadra de cintura para arriba, de frente y con buena luz." };
  }

  // Base del signante a partir de la línea de hombros (mediana, robusta a encogerlos).
  const shoulderLine = [0, 1, 2].map((k) =>
    median(withPose.map((f) => sub(v(f.poseWorld![P.rShoulder]!), v(f.poseWorld![P.lShoulder]!))[k]!)),
  ) as Vec;
  const R = unit(shoulderLine);
  const imageUp: Vec = [0, -1, 0];
  const U = unit(sub(imageUp, scale(R, dot(imageUp, R))));
  const F = cross(U, R);
  const toSigner = (a: Vec): Vec => [dot(a, R), dot(a, U), dot(a, F)];

  const armLen = median(
    withPose.flatMap((f) => {
      const p = f.poseWorld!;
      return [
        [P.lShoulder, P.lElbow, P.lWrist],
        [P.rShoulder, P.rElbow, P.rWrist],
      ].map(([s, e, w]) => len(sub(v(p[e!]!), v(p[s!]!))) + len(sub(v(p[w!]!), v(p[e!]!))));
    }),
  );
  const chestUp = -0.15 * armLen;
  const mouthUp = median(
    withPose.map((f) => {
      const p = f.poseWorld!;
      return dot(sub(mid(p[P.mouthL]!, p[P.mouthR]!), mid(p[P.lShoulder]!, p[P.rShoulder]!)), U);
    }),
  );

  const sampleSide = (f: CaptureFrame, side: Side): Sample | null => {
    const p = f.poseWorld;
    if (!p || p.length <= P.rWrist) return null;
    const [si, wi] = side === "right" ? [P.rShoulder, P.rWrist] : [P.lShoulder, P.lWrist];
    const wrist = p[wi]!;
    if ((wrist.visibility ?? 1) < 0.5) return null;
    const rel = sub(v(wrist), v(p[si]!));
    const outward = side === "right" ? R : scale(R, -1);
    const up = dot(sub(v(wrist), mid(p[P.lShoulder]!, p[P.rShoulder]!)), U);
    const pos: Vec = [
      dot(rel, outward) / (1.2 * armLen),
      0.35 + (0.35 * (up - chestUp)) / (mouthUp - chestUp),
      (dot(rel, F) / armLen - 0.55) / 0.9,
    ];
    const h = f.hands[side];
    if (!h) return { t: f.t, pos };
    const o = handOrientation(h.world, side);
    return {
      t: f.t,
      pos,
      hand: { fingers: fingerFlex(h.world), palm: toSigner(o.palm), point: toSigner(o.point), image: h.image },
    };
  };

  const dominant: Side = opts.leftHanded ? "left" : "right";
  const other: Side = opts.leftHanded ? "right" : "left";
  const dom = frames.map((f) => sampleSide(f, dominant));
  const isActive = (s: Sample | null) => !!s?.hand && s.pos[1] > 0;
  const first = dom.findIndex(isActive);
  if (first === -1) {
    return { ok: false, error: "No se ve la mano dominante levantada. Signa a la altura del pecho o la cara, sin tapar la cámara." };
  }
  let last = first;
  dom.forEach((s, i) => { if (isActive(s)) last = i; });
  const lo = Math.max(0, first - 2);
  const hi = Math.min(frames.length - 1, last + 2);
  const range = (xs: (Sample | null)[]) => xs.slice(lo, hi + 1);

  const t0 = frames[lo]!.t;
  const tEnd = frames[hi]!.t;
  const times: number[] = [];
  for (let t = t0; t < tEnd; t += STEP_MS) times.push(t);
  times.push(tEnd);
  if (times.length < 2) times.push(t0 + 200);

  const mirror = opts.leftHanded ? mirrorX : (a: Vec) => a;
  const build = (samples: (Sample | null)[]) => {
    const pos = resample(channel(samples, (s) => s.pos), times);
    const fingerCh = channel(samples, (s) => s.hand?.fingers);
    const palmCh = channel(samples, (s) => s.hand?.palm);
    const pointCh = channel(samples, (s) => s.hand?.point);
    return {
      pos,
      fingers: fingerCh.length ? resample(fingerCh, times) : null,
      palm: palmCh.length ? resample(palmCh, times).map((a) => mirror(unit(a as Vec))) : null,
      point: pointCh.length ? resample(pointCh, times).map((a) => mirror(unit(a as Vec))) : null,
    };
  };

  const domRange = range(dom);
  const main = build(domRange);
  const otherRange = range(frames.map((f) => sampleSide(f, other)));
  const otherActive = otherRange.filter(isActive).length / otherRange.length;
  const second = otherActive >= 0.3 ? build(otherRange) : null;

  const handSpec = (d: ReturnType<typeof build>, i: number): AvatarKeyframe["hand"] => ({
    x: round(d.pos[i]![0]!),
    y: round(d.pos[i]![1]!),
    z: round(d.pos[i]![2]!),
    rot: [0, 0, 0],
    ...(d.palm && d.point
      ? { palmDir: d.palm[i]!.map(round) as Vec, pointDir: d.point[i]!.map(round) as Vec }
      : {}),
  });
  const fingerSpec = (d: ReturnType<typeof build>, i: number) =>
    (d.fingers ? d.fingers[i]! : RELAXED).map(round) as AvatarKeyframe["fingers"];

  const keyframes: AvatarKeyframe[] = times.map((t, i) => ({
    t: Math.round(t - t0),
    hand: handSpec(main, i),
    fingers: fingerSpec(main, i),
    ...(second ? { hand2: handSpec(second, i), fingers2: fingerSpec(second, i) } : {}),
  }));

  const durationMs = Math.round(tEnd - t0);
  const withHand = domRange.filter((s) => s?.hand).length;

  return {
    ok: true,
    clip: {
      handedness: second ? "two" : "one",
      duration: Math.max(200, Math.min(6000, durationMs)),
      keyframes,
    },
    templates: pickTemplates(domRange, opts.leftHanded ?? false),
    stats: {
      frames: frames.length,
      poseRate: withPose.length / frames.length,
      handRate: withHand / domRange.length,
      twoHands: !!second,
      durationMs,
    },
  };
}

/** Plantillas de reconocimiento: los fotogramas más quietos de la mano dominante. */
function pickTemplates(samples: (Sample | null)[], leftHanded: boolean): Point3[][] {
  const speeds = samples.map((s, i) => {
    const prev = samples[i - 1];
    if (!s?.hand || !prev) return Infinity;
    return len(sub(s.pos, prev.pos)) / Math.max(1, s.t - prev.t);
  });
  const order = speeds.map((sp, i) => ({ sp, i })).filter((x) => Number.isFinite(x.sp)).sort((a, b) => a.sp - b.sp);
  const picked: number[] = [];
  for (const { i } of order) {
    if (picked.length === 5) break;
    if (picked.every((j) => Math.abs(j - i) >= 3)) picked.push(i);
  }
  return picked.map((i) =>
    samples[i]!.hand!.image.map((p) => ({
      x: round(leftHanded ? 1 - p.x : p.x),
      y: round(p.y),
      z: round(p.z),
    })),
  );
}
