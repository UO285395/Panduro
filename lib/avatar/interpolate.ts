import type { AvatarClip, AvatarKeyframe, FingerValue } from "@/lib/curriculum/schema";

/** Velocidad de reproducción de los signos (0.8 = un 20 % más despacio). */
export const SIGN_PLAYBACK_RATE = 0.8;

/** Al repetir un signo: pausa en la posición final y vuelta suave al inicio (ms de clip). */
export const LOOP_HOLD_MS = 350;
export const LOOP_RETURN_MS = 500;

type Hand = AvatarKeyframe["hand"];
type Fingers = AvatarKeyframe["fingers"];
type Vec3 = [number, number, number];

/*
 * Cada keyframe se aplana en canales numéricos y cada canal se interpola con
 * una spline de Hermite cuyas tangentes salen de los keyframes vecinos y de
 * sus tiempos reales (Catmull-Rom no uniforme). Así la velocidad es continua
 * al pasar por un keyframe aunque estén desigualmente espaciados, y al
 * principio y al final del signo la mano arranca y se detiene sin tirones.
 */

const HAND_CHANNELS = 13; // x y z · rot×3 · roll · palm×3 · point×3
const FINGER_CHANNELS = 10; // flexión×5 · abducción×5

type Layout = {
  roll: boolean;
  palm: boolean;
  point: boolean;
};

type Prepared = {
  times: number[];
  values: number[][];
  tangents: number[][];
  hand: Layout;
  hand2: Layout | null;
  abduction: boolean[];
  abduction2: boolean[];
  twoHands: boolean;
  fingers2: boolean;
};

const cache = new WeakMap<AvatarClip, Prepared>();

const flexOf = (v: FingerValue) => (typeof v === "number" ? v : v.flex);
const abdOf = (v: FingerValue) => (typeof v === "number" ? 0 : (v.abduction ?? 0));

/** Valor del keyframe más cercano que tenga el campo (o `undefined`). */
function nearest<T>(kfs: AvatarKeyframe[], i: number, get: (k: AvatarKeyframe) => T | undefined): T | undefined {
  for (let d = 0; d < kfs.length; d++) {
    const a = kfs[i - d] && get(kfs[i - d]!);
    if (a !== undefined) return a;
    const b = kfs[i + d] && get(kfs[i + d]!);
    if (b !== undefined) return b;
  }
  return undefined;
}

function handChannels(kfs: AvatarKeyframe[], i: number, pick: (k: AvatarKeyframe) => Hand | undefined): number[] {
  const h = nearest(kfs, i, pick);
  if (!h) return new Array(HAND_CHANNELS).fill(0);
  const palm = nearest(kfs, i, (k) => pick(k)?.palmDir) ?? [0, 0, 1];
  const point = nearest(kfs, i, (k) => pick(k)?.pointDir) ?? [0, 1, 0];
  return [h.x, h.y, h.z, ...h.rot, h.forearmRoll ?? 0, ...palm, ...point];
}

function fingerChannels(f: Fingers): number[] {
  return [...f.map(flexOf), ...f.map(abdOf)];
}

function layoutOf(kfs: AvatarKeyframe[], pick: (k: AvatarKeyframe) => Hand | undefined): Layout {
  return {
    roll: kfs.some((k) => pick(k)?.forearmRoll !== undefined),
    palm: kfs.some((k) => pick(k)?.palmDir !== undefined),
    point: kfs.some((k) => pick(k)?.pointDir !== undefined),
  };
}

function prepare(clip: AvatarClip): Prepared {
  const hit = cache.get(clip);
  if (hit) return hit;
  const kfs = clip.keyframes;
  const twoHands = kfs.some((k) => k.hand2);
  const fingers2 = kfs.some((k) => k.fingers2);
  const values = kfs.map((kf, i) => [
    ...handChannels(kfs, i, (k) => k.hand),
    ...fingerChannels(kf.fingers),
    ...(twoHands ? handChannels(kfs, i, (k) => k.hand2) : []),
    ...(fingers2 ? fingerChannels(nearest(kfs, i, (k) => k.fingers2)!) : []),
  ]);
  const times = kfs.map((k) => k.t);
  const n = kfs.length;
  const tangents = values.map((v, i) =>
    v.map((_, c) => {
      if (i === 0 || i === n - 1) return 0;
      const span = times[i + 1]! - times[i - 1]!;
      return span > 0 ? (values[i + 1]![c]! - values[i - 1]![c]!) / span : 0;
    }),
  );
  const abd = (get: (k: AvatarKeyframe) => Fingers | undefined) =>
    [0, 1, 2, 3, 4].map((f) => kfs.some((k) => {
      const v = get(k)?.[f];
      return v !== undefined && typeof v !== "number" && v.abduction !== undefined;
    }));
  const prepared: Prepared = {
    times,
    values,
    tangents,
    hand: layoutOf(kfs, (k) => k.hand),
    hand2: twoHands ? layoutOf(kfs, (k) => k.hand2) : null,
    abduction: abd((k) => k.fingers),
    abduction2: abd((k) => k.fingers2),
    twoHands,
    fingers2,
  };
  cache.set(clip, prepared);
  return prepared;
}

function unit(v: number[]): Vec3 {
  const len = Math.hypot(v[0]!, v[1]!, v[2]!) || 1;
  return [v[0]! / len, v[1]! / len, v[2]! / len];
}

function toHand(c: number[], at: number, layout: Layout): Hand {
  const hand: Hand = {
    x: c[at]!,
    y: c[at + 1]!,
    z: c[at + 2]!,
    rot: [c[at + 3]!, c[at + 4]!, c[at + 5]!],
  };
  if (layout.roll) hand.forearmRoll = c[at + 6]!;
  if (layout.palm) hand.palmDir = unit(c.slice(at + 7, at + 10));
  if (layout.point) hand.pointDir = unit(c.slice(at + 10, at + 13));
  return hand;
}

function toFingers(c: number[], at: number, abduction: boolean[]): Fingers {
  return [0, 1, 2, 3, 4].map((i) => {
    const flex = Math.max(0, Math.min(1, c[at + i]!));
    return abduction[i] ? { flex, abduction: c[at + 5 + i]! } : flex;
  }) as Fingers;
}

function toKeyframe(p: Prepared, c: number[], t: number): AvatarKeyframe {
  let at = 0;
  const kf: AvatarKeyframe = {
    t,
    hand: toHand(c, at, p.hand),
    fingers: toFingers(c, (at += HAND_CHANNELS), p.abduction),
  };
  at += FINGER_CHANNELS;
  if (p.hand2) {
    kf.hand2 = toHand(c, at, p.hand2);
    at += HAND_CHANNELS;
  }
  if (p.fingers2) kf.fingers2 = toFingers(c, at, p.abduction2);
  return kf;
}

/** Pose del clip en `tMs` (sin bucle: antes del inicio, el primero; después, el último). */
export function sampleClip(clip: AvatarClip, tMs: number): AvatarKeyframe {
  const kfs = clip.keyframes;
  if (kfs.length === 0) throw new Error("sampleClip: clip vacío");
  const first = kfs[0]!;
  const last = kfs[kfs.length - 1]!;
  if (tMs <= first.t) return first;
  if (tMs >= last.t) return last;

  const p = prepare(clip);
  let i = 0;
  while (i < kfs.length - 2 && tMs >= p.times[i + 1]!) i++;
  const span = p.times[i + 1]! - p.times[i]!;
  if (span <= 0) return kfs[i + 1]!;
  const s = (tMs - p.times[i]!) / span;
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;
  const a = p.values[i]!;
  const b = p.values[i + 1]!;
  const ma = p.tangents[i]!;
  const mb = p.tangents[i + 1]!;
  const c = a.map((_, k) => h00 * a[k]! + h10 * span * ma[k]! + h01 * b[k]! + h11 * span * mb[k]!);
  return toKeyframe(p, c, tMs);
}

function blend(p: Prepared, a: number[], b: number[], u: number, t: number): AvatarKeyframe {
  return toKeyframe(p, a.map((v, k) => v + (b[k]! - v) * u), t);
}

/** Duración de una repetición: el signo, la pausa final y la vuelta al inicio. */
export function loopDuration(clip: AvatarClip): number {
  return clip.duration + LOOP_HOLD_MS + LOOP_RETURN_MS;
}

/**
 * Pose de un signo que se repite: tras cada repetición la mano se queda quieta
 * un momento y vuelve al primer keyframe con aceleración y frenada suaves, en
 * lugar de saltar.
 */
export function sampleLoop(clip: AvatarClip, tMs: number): AvatarKeyframe {
  const period = loopDuration(clip);
  const t = ((tMs % period) + period) % period;
  if (t <= clip.duration) return sampleClip(clip, t);
  const back = t - clip.duration - LOOP_HOLD_MS;
  if (back <= 0) return clip.keyframes[clip.keyframes.length - 1]!;
  const p = prepare(clip);
  const u = back / LOOP_RETURN_MS;
  const eased = u * u * u * (u * (u * 6 - 15) + 10);
  return blend(p, p.values[p.values.length - 1]!, p.values[0]!, eased, t);
}

/**
 * Fase [0,1) del reloj dentro del ciclo del clip, para que un `useEffect` pueda
 * decidir si loopear o pausar al final.
 */
export function phaseOf(clip: AvatarClip, tMs: number): number {
  if (clip.duration <= 0) return 0;
  const p = (tMs % clip.duration) / clip.duration;
  return p < 0 ? p + 1 : p;
}
