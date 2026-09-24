import type { AvatarClip, AvatarKeyframe, FingerValue } from "@/lib/curriculum/schema";

/** Porción del clip usada para la transición de bucle suave (inicio→fin). */
const LOOP_FADE = 0.12; // 12 % de la duración

/** Velocidad de reproducción de los signos (0.8 = un 20 % más despacio). */
export const SIGN_PLAYBACK_RATE = 0.8;

/**
 * Interpola entre keyframes para obtener la pose en `tMs`.
 * Usa spline Catmull-Rom para trayectorias suaves con C1-continuidad
 * y una ventana de cross-fade al final del bucle.
 */
export function sampleClip(clip: AvatarClip, tMs: number): AvatarKeyframe {
  const kfs = clip.keyframes;
  if (kfs.length === 0) throw new Error("sampleClip: clip vacío");
  const first = kfs[0]!;
  const last = kfs[kfs.length - 1]!;
  if (tMs <= first.t) return first;
  if (tMs >= last.t) return last;

  // Ventana de cross-fade: blend suave del último keyframe al primero en los
  // últimos LOOP_FADE% del clip para eliminar el salto visual al hacer loop.
  const fadeStart = last.t - clip.duration * LOOP_FADE;
  if (tMs >= fadeStart) {
    const raw = (tMs - fadeStart) / (clip.duration * LOOP_FADE);
    const u = raw * raw * (3 - 2 * raw);
    return blendKeyframes(last, first, u, tMs);
  }

  // Buscar el segmento (i, i+1) tal que kfs[i].t <= t < kfs[i+1].t
  const n = kfs.length;
  for (let i = 0; i < n - 1; i++) {
    const a = kfs[i]!;
    const b = kfs[i + 1]!;
    if (tMs >= a.t && tMs < b.t) {
      const span = b.t - a.t;
      const tRaw = span > 0 ? (tMs - a.t) / span : 0;
      // Ease-in-out: aplica smoothstep para dar aceleración/desaceleración
      // natural a cada segmento (lento al principio y al final, rápido en medio).
      const t01 = tRaw * tRaw * (3 - 2 * tRaw);
      // Catmull-Rom: puntos de control envolventes (loop en los extremos).
      const p0 = kfs[(i - 1 + n) % n]!;
      const p3 = kfs[(i + 2) % n]!;
      return catmullRomBlend(p0, a, b, p3, t01, tMs);
    }
  }
  return last;
}

type Hand = AvatarKeyframe["hand"];
type Fingers = AvatarKeyframe["fingers"];
type Vec3 = [number, number, number];

function cr(v0: number, v1: number, v2: number, v3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * v1 +
    (v2 - v0) * t +
    (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 +
    (3 * v1 - v0 - 3 * v2 + v3) * t3
  );
}

function unit(v: number[], fallback: Vec3): Vec3 {
  const len = Math.hypot(v[0]!, v[1]!, v[2]!);
  return len < 1e-6 ? fallback : [v[0]! / len, v[1]! / len, v[2]! / len];
}

function crVec(p0: Vec3 | undefined, a: Vec3 | undefined, b: Vec3 | undefined, p3: Vec3 | undefined, t: number): Vec3 | undefined {
  if (!a || !b) return a ?? b;
  const q0 = p0 ?? a;
  const q3 = p3 ?? b;
  return unit([0, 1, 2].map((i) => cr(q0[i]!, a[i]!, b[i]!, q3[i]!, t)), a);
}

function lerpVec(a: Vec3 | undefined, b: Vec3 | undefined, u: number): Vec3 | undefined {
  if (!a || !b) return a ?? b;
  return unit([0, 1, 2].map((i) => lerp(a[i]!, b[i]!, u)), a);
}

function crHand(p0: Hand, a: Hand, b: Hand, p3: Hand, t: number): Hand {
  return {
    x: cr(p0.x, a.x, b.x, p3.x, t),
    y: cr(p0.y, a.y, b.y, p3.y, t),
    z: cr(p0.z, a.z, b.z, p3.z, t),
    rot: [
      cr(p0.rot[0], a.rot[0], b.rot[0], p3.rot[0], t),
      cr(p0.rot[1], a.rot[1], b.rot[1], p3.rot[1], t),
      cr(p0.rot[2], a.rot[2], b.rot[2], p3.rot[2], t),
    ],
    forearmRoll: crScalarMaybe(p0.forearmRoll, a.forearmRoll, b.forearmRoll, p3.forearmRoll, t),
    palmDir: crVec(p0.palmDir, a.palmDir, b.palmDir, p3.palmDir, t),
    pointDir: crVec(p0.pointDir, a.pointDir, b.pointDir, p3.pointDir, t),
  };
}

function lerpHand(a: Hand, b: Hand, u: number): Hand {
  return {
    x: lerp(a.x, b.x, u),
    y: lerp(a.y, b.y, u),
    z: lerp(a.z, b.z, u),
    rot: [lerp(a.rot[0], b.rot[0], u), lerp(a.rot[1], b.rot[1], u), lerp(a.rot[2], b.rot[2], u)],
    forearmRoll: lerpMaybe(a.forearmRoll, b.forearmRoll, u),
    palmDir: lerpVec(a.palmDir, b.palmDir, u),
    pointDir: lerpVec(a.pointDir, b.pointDir, u),
  };
}

const flexOf = (v: FingerValue) => (typeof v === "number" ? v : v.flex);

function crFingers(p0: Fingers, a: Fingers, b: Fingers, p3: Fingers, t: number): Fingers {
  return [0, 1, 2, 3, 4].map((i) =>
    Math.max(0, Math.min(1, cr(flexOf(p0[i]!), flexOf(a[i]!), flexOf(b[i]!), flexOf(p3[i]!), t))),
  ) as Fingers;
}

/** Interpolación Catmull-Rom entre a y b usando p0 y p3 como tangentes. */
function catmullRomBlend(
  p0: AvatarKeyframe, a: AvatarKeyframe, b: AvatarKeyframe, p3: AvatarKeyframe,
  t: number, tMs: number,
): AvatarKeyframe {
  return {
    t: tMs,
    hand: crHand(p0.hand, a.hand, b.hand, p3.hand, t),
    fingers: crFingers(p0.fingers, a.fingers, b.fingers, p3.fingers, t),
    hand2: a.hand2 && b.hand2
      ? crHand(p0.hand2 ?? a.hand2, a.hand2, b.hand2, p3.hand2 ?? b.hand2, t)
      : a.hand2 ?? b.hand2,
    fingers2: a.fingers2 && b.fingers2
      ? crFingers(p0.fingers2 ?? a.fingers2, a.fingers2, b.fingers2, p3.fingers2 ?? b.fingers2, t)
      : a.fingers2 ?? b.fingers2,
  };
}

function blendKeyframes(a: AvatarKeyframe, b: AvatarKeyframe, u: number, t: number): AvatarKeyframe {
  const lerpFingers = (fa: Fingers, fb: Fingers) =>
    [0, 1, 2, 3, 4].map((i) => lerpFinger(fa[i]!, fb[i]!, u)) as Fingers;
  return {
    t,
    hand: lerpHand(a.hand, b.hand, u),
    fingers: lerpFingers(a.fingers, b.fingers),
    hand2: a.hand2 && b.hand2 ? lerpHand(a.hand2, b.hand2, u) : a.hand2 ?? b.hand2,
    fingers2: a.fingers2 && b.fingers2 ? lerpFingers(a.fingers2, b.fingers2) : a.fingers2 ?? b.fingers2,
  };
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function lerpMaybe(a: number | undefined, b: number | undefined, u: number): number | undefined {
  if (a === undefined && b === undefined) return undefined;
  return lerp(a ?? 0, b ?? 0, u) || undefined;
}

function crScalarMaybe(
  v0: number | undefined, v1: number | undefined,
  v2: number | undefined, v3: number | undefined,
  t: number,
): number | undefined {
  if (v0 === undefined && v1 === undefined && v2 === undefined && v3 === undefined) return undefined;
  return cr(v0 ?? 0, v1 ?? 0, v2 ?? 0, v3 ?? 0, t) || undefined;
}

function lerpFinger(a: FingerValue, b: FingerValue, u: number): FingerValue {
  const af = typeof a === "number" ? a : a.flex;
  const bf = typeof b === "number" ? b : b.flex;
  const aa = typeof a === "number" ? 0 : (a.abduction ?? 0);
  const ba = typeof b === "number" ? 0 : (b.abduction ?? 0);
  const flex = lerp(af, bf, u);
  const abduction = lerp(aa, ba, u);
  if (aa === 0 && ba === 0) return flex;
  return { flex, abduction };
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
