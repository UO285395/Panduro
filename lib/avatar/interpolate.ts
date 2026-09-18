import type { AvatarClip, AvatarKeyframe } from "@/lib/curriculum/schema";

/**
 * Interpola linealmente entre keyframes para obtener la pose en el instante `tMs`.
 * - Antes del primer keyframe: devuelve el primero.
 * - Después del último: devuelve el último.
 * - Si el clip tiene < 2 keyframes: lanza (schema ya lo impide, pero por si acaso).
 */
export function sampleClip(clip: AvatarClip, tMs: number): AvatarKeyframe {
  const kfs = clip.keyframes;
  if (kfs.length === 0) throw new Error("sampleClip: clip vacío");
  const first = kfs[0]!;
  const last = kfs[kfs.length - 1]!;
  if (tMs <= first.t) return first;
  if (tMs >= last.t) return last;

  // Buscar el segmento (a, b) tal que a.t <= t < b.t
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i]!;
    const b = kfs[i + 1]!;
    if (tMs >= a.t && tMs < b.t) {
      const span = b.t - a.t;
      const raw = span > 0 ? (tMs - a.t) / span : 0;
      // Smoothstep: elimina arranques y paradas abruptas entre keyframes.
      const u = raw * raw * (3 - 2 * raw);
      return {
        t: tMs,
        hand: {
          x: lerp(a.hand.x, b.hand.x, u),
          y: lerp(a.hand.y, b.hand.y, u),
          z: lerp(a.hand.z, b.hand.z, u),
          rot: [
            lerp(a.hand.rot[0], b.hand.rot[0], u),
            lerp(a.hand.rot[1], b.hand.rot[1], u),
            lerp(a.hand.rot[2], b.hand.rot[2], u),
          ],
        },
        fingers: [
          lerp(a.fingers[0], b.fingers[0], u),
          lerp(a.fingers[1], b.fingers[1], u),
          lerp(a.fingers[2], b.fingers[2], u),
          lerp(a.fingers[3], b.fingers[3], u),
          lerp(a.fingers[4], b.fingers[4], u),
        ],
      };
    }
  }
  return last;
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
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
