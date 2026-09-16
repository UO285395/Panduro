/**
 * Rig humanoide procedimental para el avatar. Todas las longitudes son
 * relativas a la altura total del cuerpo (1.0). Solo modelamos el lado
 * derecho (mano dominante); el resto se dibuja simétrico como decoración.
 */

export type BoneName =
  | "torso"
  | "neck"
  | "head"
  | "shoulder"
  | "upperArm"
  | "foreArm"
  | "hand"
  | "thumb1"
  | "thumb2"
  | "thumb3"
  | "index1"
  | "index2"
  | "index3"
  | "middle1"
  | "middle2"
  | "middle3"
  | "ring1"
  | "ring2"
  | "ring3"
  | "pinky1"
  | "pinky2"
  | "pinky3";

/** Longitudes normalizadas (fracción de altura). Aproximaciones antropométricas. */
export const BONE_LENGTHS: Record<BoneName, number> = {
  torso: 0.30,
  neck: 0.05,
  head: 0.13,
  shoulder: 0.10,
  upperArm: 0.18,
  foreArm: 0.16,
  hand: 0.08,
  thumb1: 0.035,
  thumb2: 0.030,
  thumb3: 0.025,
  index1: 0.045,
  index2: 0.030,
  index3: 0.020,
  middle1: 0.050,
  middle2: 0.035,
  middle3: 0.020,
  ring1: 0.045,
  ring2: 0.030,
  ring3: 0.020,
  pinky1: 0.035,
  pinky2: 0.025,
  pinky3: 0.020,
};

/** Origen de la escena: pies del avatar en (0,0,0), altura hacia +Y. */
export const SHOULDER_HEIGHT = 0.85; // eje Y en unidades relativas
export const RIGHT_SHOULDER_X = 0.10; // separación desde el eje central
