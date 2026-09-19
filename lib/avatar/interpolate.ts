import type { AvatarClip, AvatarKeyframe, FingerValue } from "@/lib/curriculum/schema";

/** Porción del clip usada para la transición de bucle suave (inicio→fin). */
const LOOP_FADE = 0.12; // 12 % de la duración

/**
 * Interpola entre keyframes para obtener la pose en `tMs`.
 * Usa smoothstep por segmento y una ventana de cross-fade al final del bucle
 * para suavizar la transición entre la última y la primera pose.
 */
export function sampleClip(clip: AvatarClip, tMs: number): AvatarKeyframe {
  const kfs = clip.keyframes;
  if (kfs.length === 0) throw new Error("sampleClip: clip vacío");
  const first = kfs[0]!;
  const last = kfs[kfs.length - 1]!;
  if (tMs <= first.t) return first;
  if (tMs >= last.t) {
    // Ventana de cross-fade: blend lineal suave del último keyframe al primero.
    const fadeStart = last.t - clip.duration * LOOP_FADE;
    if (tMs >= fadeStart) {
      const raw = (tMs - fadeStart) / (clip.duration * LOOP_FADE);
      const u = raw * raw * (3 - 2 * raw);
      return blendKeyframes(last, first, u, tMs);
    }
    return last;
  }

  // Buscar el segmento (a, b) tal que a.t <= t < b.t
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i]!;
    const b = kfs[i + 1]!;
    if (tMs >= a.t && tMs < b.t) {
      const span = b.t - a.t;
      const raw = span > 0 ? (tMs - a.t) / span : 0;
      const u = raw * raw * (3 - 2 * raw);
      return blendKeyframes(a, b, u, tMs);
    }
  }
  return last;
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
