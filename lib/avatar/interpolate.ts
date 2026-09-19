import type { AvatarClip, AvatarKeyframe, FingerValue } from "@/lib/curriculum/schema";

/** Porción del clip usada para la transición de bucle suave (inicio→fin). */
const LOOP_FADE = 0.12; // 12 % de la duración

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
      const t01 = span > 0 ? (tMs - a.t) / span : 0;
      // Catmull-Rom: puntos de control envolventes (loop en los extremos).
      const p0 = kfs[(i - 1 + n) % n]!;
      const p3 = kfs[(i + 2) % n]!;
      return catmullRomBlend(p0, a, b, p3, t01, tMs);
    }
  }
  return last;
}

/** Interpolación Catmull-Rom entre a y b usando p0 y p3 como tangentes. */
function catmullRomBlend(
  p0: AvatarKeyframe, a: AvatarKeyframe, b: AvatarKeyframe, p3: AvatarKeyframe,
  t: number, tMs: number,
): AvatarKeyframe {
  const cr = (v0: number, v1: number, v2: number, v3: number) => {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (
      2 * v1 +
      (v2 - v0) * t +
      (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 +
      (3 * v1 - v0 - 3 * v2 + v3) * t3
    );
  };
  const crF = (v0: number, v1: number, v2: number, v3: number) =>
    Math.max(0, Math.min(1, cr(v0, v1, v2, v3)));

  const fFlex = (kf: AvatarKeyframe, i: number) =>
    typeof kf.fingers[i] === "number" ? (kf.fingers[i] as number) : (kf.fingers[i] as { flex: number }).flex;

  return {
    t: tMs,
    hand: {
      x: cr(p0.hand.x, a.hand.x, b.hand.x, p3.hand.x),
      y: cr(p0.hand.y, a.hand.y, b.hand.y, p3.hand.y),
      z: cr(p0.hand.z, a.hand.z, b.hand.z, p3.hand.z),
      rot: [
        cr(p0.hand.rot[0], a.hand.rot[0], b.hand.rot[0], p3.hand.rot[0]),
        cr(p0.hand.rot[1], a.hand.rot[1], b.hand.rot[1], p3.hand.rot[1]),
        cr(p0.hand.rot[2], a.hand.rot[2], b.hand.rot[2], p3.hand.rot[2]),
      ],
      forearmRoll: lerpMaybe(a.hand.forearmRoll, b.hand.forearmRoll, t),
    },
    fingers: [0, 1, 2, 3, 4].map((i) =>
      crF(fFlex(p0, i), fFlex(a, i), fFlex(b, i), fFlex(p3, i))
    ) as [number, number, number, number, number],
  };
}

function blendKeyframes(a: AvatarKeyframe, b: AvatarKeyframe, u: number, t: number): AvatarKeyframe {
  return {
    t,
    hand: {
      x: lerp(a.hand.x, b.hand.x, u),
      y: lerp(a.hand.y, b.hand.y, u),
      z: lerp(a.hand.z, b.hand.z, u),
      rot: [
        lerp(a.hand.rot[0], b.hand.rot[0], u),
        lerp(a.hand.rot[1], b.hand.rot[1], u),
        lerp(a.hand.rot[2], b.hand.rot[2], u),
      ],
      forearmRoll: lerpMaybe(a.hand.forearmRoll, b.hand.forearmRoll, u),
    },
    fingers: [
      lerpFinger(a.fingers[0], b.fingers[0], u),
      lerpFinger(a.fingers[1], b.fingers[1], u),
      lerpFinger(a.fingers[2], b.fingers[2], u),
      lerpFinger(a.fingers[3], b.fingers[3], u),
      lerpFinger(a.fingers[4], b.fingers[4], u),
    ],
  };
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function lerpMaybe(a: number | undefined, b: number | undefined, u: number): number | undefined {
  if (a === undefined && b === undefined) return undefined;
  return lerp(a ?? 0, b ?? 0, u) || undefined;
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
