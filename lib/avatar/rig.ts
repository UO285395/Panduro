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
  hand: 0.11,
  thumb1: 0.035,
  thumb2: 0.030,
  thumb3: 0.025,
  index1: 0.050,
  index2: 0.030,
  index3: 0.020,
  middle1: 0.055,
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
export const SHOULDER_HEIGHT = 0.85;
export const RIGHT_SHOULDER_X = 0.10;
export const LEFT_SHOULDER_X = -0.10;

/** Palma anatómica: ancho radio-cubital, alto proximo-distal, grosor dorso-palmar. */
export const PALM_WIDTH = 0.075;
export const PALM_HEIGHT = 0.095;
export const PALM_DEPTH = 0.030;

/** Radio de la esfera que cubre la articulación metacarpo-falángica. */
export const KNUCKLE_RADIUS = 0.014;

/** Abducción por defecto del pulgar (rad) respecto al plano de la palma. */
export const THUMB_ABDUCTION = 0.6;
