import type { AvatarClip, AvatarKeyframe, HandSpec } from "@/lib/curriculum/schema";

/**
 * Correcciones a mano de signos grabados (content/signs/corrections.json). Donde MediaPipe mide
 * mal el vídeo —la mano de canto o con los dedos hacia la cámara, que da dedos encogidos y
 * palmas que se dan la vuelta de un fotograma a otro—, un parche dice, mirando el vídeo, la
 * forma de la mano o hacia dónde mira en un tramo del signo. La grabación (captured.json) no
 * se toca: los parches se aplican al cargarla, y solo a los signos que los tienen.
 */

type Vec3 = [number, number, number];
type Fingers = AvatarKeyframe["fingers"];
type Touch = NonNullable<AvatarKeyframe["thumbTouch"]>;

/** Azimut de reposo de cada dedo largo (rad), para las formas dadas con sus articulaciones. */
const AZ = [0.12, 0, -0.05, -0.23] as const;
const bent = (knuckle: number, phalanx: number): Fingers[number][] => AZ.map((az) => [az, knuckle, phalanx] as Vec3);

/** Formas de la mano: los cinco dedos y, si el pulgar toca alguna yema, cuál. */
export const SHAPES = {
  /** Mano plana, dedos juntos. */
  flat: { fingers: [0.12, 0, 0, 0, 0] },
  /** Mano abierta, dedos separados. */
  open: { fingers: [0.05, [0.3, 0, 0], [0.05, 0, 0], [-0.2, 0, 0], [-0.45, 0, 0]] },
  /** Pulgar e índice en anillo; los otros tres, estirados y separados. */
  ring: { fingers: [0.5, [0.1, 0.75, 0.9], [0, 0.05, 0.05], [-0.2, 0.05, 0.05], [-0.42, 0.05, 0.05]], touch: [1, 0, 0, 0] },
  /** Dedos juntos y rectos, doblados por los nudillos. */
  bent: { fingers: [0.2, ...bent(1.2, 0.1)] },
} as const satisfies Record<string, { fingers: readonly unknown[]; touch?: readonly number[] }>;

export type Patch = {
  /** Tramo del signo (ms); sin ellos, entero. */
  from?: number;
  to?: number;
  /** Mano dominante, pasiva o las dos (por defecto, las dos). */
  hand?: "dom" | "pas" | "both";
  shape?: keyof typeof SHAPES;
  /**
   * Hacia dónde mira la palma y hacia dónde apuntan los dedos, en el espacio del signante
   * (x a su derecha, y arriba, z hacia delante) y para la mano dominante: en la pasiva, en espejo.
   */
  palmDir?: Vec3;
  pointDir?: Vec3;
  /** Posición de la muñeca en el espacio de signado: x hacia fuera de su hombro, z hacia delante. */
  x?: number;
  z?: number;
  /** Quita el contacto detectado en ese tramo. */
  noContact?: boolean;
};

export type Corrections = Record<string, { why: string; patches: Patch[] }>;

const mirror = (v: Vec3): Vec3 => [-v[0], v[1], v[2]];

function patchHand(hand: HandSpec, p: Patch, passive: boolean): HandSpec {
  const out: HandSpec = { ...hand };
  if (p.palmDir) out.palmDir = passive ? mirror(p.palmDir) : p.palmDir;
  if (p.pointDir) out.pointDir = passive ? mirror(p.pointDir) : p.pointDir;
  if (p.x !== undefined) out.x = p.x;
  if (p.z !== undefined) out.z = p.z;
  if (p.noContact) delete out.contact;
  return out;
}

/** El clip con los parches aplicados (uno nuevo; el original queda igual). */
export function applyCorrections(clip: AvatarClip, patches: Patch[]): AvatarClip {
  return {
    ...clip,
    keyframes: clip.keyframes.map((kf) => {
      let out = kf;
      for (const p of patches) {
        if (kf.t < (p.from ?? 0) || kf.t > (p.to ?? Infinity)) continue;
        const which = p.hand ?? "both";
        const shape = p.shape && SHAPES[p.shape];
        const touch = shape && "touch" in shape ? ([...shape.touch] as Touch) : undefined;
        if (which !== "pas") {
          out = { ...out, hand: patchHand(out.hand, p, false) };
          if (shape) {
            out = { ...out, fingers: structuredClone(shape.fingers) as Fingers, thumbTouch: touch, thumbTip: undefined };
          }
        }
        if (which !== "dom" && out.hand2) {
          out = { ...out, hand2: patchHand(out.hand2, p, true) };
          if (shape) {
            out = { ...out, fingers2: structuredClone(shape.fingers) as Fingers, thumbTouch2: touch, thumbTip2: undefined };
          }
        }
      }
      return out;
    }),
  };
}
