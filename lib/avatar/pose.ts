import type { AvatarKeyframe, FingerValue } from "@/lib/curriculum/schema";
import { BONE_LENGTHS, RIGHT_SHOULDER_X, SHOULDER_HEIGHT } from "./rig";

/** Rotación acumulada por falange (rad, alrededor del eje X local del hueso). */
export type FingerPose = {
  proximal: number;
  middle: number;
  distal: number;
};

export type Pose = {
  /** Rotación del hombro derecho en radianes (X, Y, Z locales). */
  shoulder: [number, number, number];
  /** Rotación del codo (flexión sobre el eje X del antebrazo). */
  elbow: number;
  /** Rotación de la mano (heredada del clip). */
  wrist: [number, number, number];
  /** Supinación/pronación del antebrazo (rad, eje Y del hueso). */
  forearmRoll: number;
  /** Flexión desglosada por dedo (MCP, PIP, DIP en rad). */
  fingers: [FingerPose, FingerPose, FingerPose, FingerPose, FingerPose];
  /** Abducción lateral de cada dedo (rad, eje Z del anclaje). */
  abduction: [number, number, number, number, number];
};

/** Extrae el valor de flexión de un FingerValue (número o {flex, abduction?}). */
export function getFingerFlex(v: FingerValue): number {
  return typeof v === "number" ? v : v.flex;
}

/** Extrae la abducción de un FingerValue (0 si es número simple). */
export function getFingerAbduction(v: FingerValue): number {
  return typeof v === "number" ? 0 : (v.abduction ?? 0);
}

const ARM_LENGTH = BONE_LENGTHS.upperArm + BONE_LENGTHS.foreArm;

/** Multiplicadores por falange para reproducir la curva natural del cierre de puño. */
const FLEX_PROXIMAL = 0.60;
const FLEX_MIDDLE   = 0.95;
const FLEX_DISTAL   = 0.65;
const MAX_FLEX_RAD  = Math.PI / 2;

/**
 * Reparte un valor de flexión [0..1] entre las tres falanges de un dedo.
 * Usa una curva cúbica para que los primeros grados cierren suavemente y el
 * final del cierre sea más pronunciado — más natural que la relación lineal.
 */
export function distributeFlex(flex: number): FingerPose {
  const f = Math.min(1, Math.max(0, flex));
  // Curva: lento al principio, rápido al final (ease-in cúbico).
  const c = f * f * (3 - 2 * f); // smoothstep
  return {
    proximal: c * FLEX_PROXIMAL * MAX_FLEX_RAD,
    middle:   c * FLEX_MIDDLE   * MAX_FLEX_RAD,
    distal:   c * FLEX_DISTAL   * MAX_FLEX_RAD,
  };
}

/**
 * Convierte un `AvatarKeyframe` (posición deseada de la muñeca + flexión de
 * dedos, en el espacio de landmarks normalizados que usa el clip) a rotaciones
 * en radianes para los huesos relevantes.
 *
 * IK simplificada 2-bone en el plano frontal (XY):
 *  - Se coloca el hombro derecho en (RIGHT_SHOULDER_X, SHOULDER_HEIGHT, 0).
 *  - El "target" es el hombro + escalado del vector (hand.x, hand.y) del clip.
 *  - Solución analítica para hombro y codo dado el triángulo (hombro, codo, muñeca).
 */
export function poseFromKeyframe(kf: AvatarKeyframe): Pose {
  // Escala 0.55 para aprovechar mejor el rango de movimiento del brazo.
  const target = {
    x: RIGHT_SHOULDER_X + kf.hand.x * 0.55,
    y: SHOULDER_HEIGHT  + kf.hand.y * 0.55,
    z: kf.hand.z * 0.32,
  };

  const dx = target.x - RIGHT_SHOULDER_X;
  const dy = target.y - SHOULDER_HEIGHT;
  const dz = target.z;
  const dist = Math.min(Math.sqrt(dx * dx + dy * dy + dz * dz), ARM_LENGTH * 0.98);

  const shoulderPitch = Math.atan2(-dy, Math.hypot(dx, dz));
  const shoulderYaw   = Math.atan2(dx, dz || 1e-6);

  const a = BONE_LENGTHS.upperArm;
  const b = BONE_LENGTHS.foreArm;
  // Ley de cosenos para el ángulo en el codo.
  const cosElbow = Math.min(
    1,
    Math.max(-1, (a * a + b * b - dist * dist) / (2 * a * b)),
  );
  // Codo extendido = 0 rad; las poses de reposo muestran ~20 ° de flexión mínima.
  const elbow = Math.max(0.35, Math.PI - Math.acos(cosElbow));

  return {
    shoulder: [shoulderPitch, shoulderYaw, 0],
    elbow,
    wrist: [kf.hand.rot[0], kf.hand.rot[1], kf.hand.rot[2]],
    forearmRoll: kf.hand.forearmRoll ?? 0,
    fingers: [
      distributeFlex(getFingerFlex(kf.fingers[0])),
      distributeFlex(getFingerFlex(kf.fingers[1])),
      distributeFlex(getFingerFlex(kf.fingers[2])),
      distributeFlex(getFingerFlex(kf.fingers[3])),
      distributeFlex(getFingerFlex(kf.fingers[4])),
    ],
    abduction: [
      getFingerAbduction(kf.fingers[0]),
      getFingerAbduction(kf.fingers[1]),
      getFingerAbduction(kf.fingers[2]),
      getFingerAbduction(kf.fingers[3]),
      getFingerAbduction(kf.fingers[4]),
    ],
  };
}
