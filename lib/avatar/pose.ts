import type { AvatarKeyframe } from "@/lib/curriculum/schema";
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
  /** Flexión desglosada por dedo (MCP, PIP, DIP en rad). */
  fingers: [FingerPose, FingerPose, FingerPose, FingerPose, FingerPose];
};

const ARM_LENGTH = BONE_LENGTHS.upperArm + BONE_LENGTHS.foreArm;

/** Multiplicadores por falange para reproducir la curva natural del cierre de puño. */
const FLEX_PROXIMAL = 0.55;
const FLEX_MIDDLE = 0.90;
const FLEX_DISTAL = 0.60;
const MAX_FLEX_RAD = Math.PI / 2;

/**
 * Reparte un valor de flexión [0..1] entre las tres falanges de un dedo,
 * con más ángulo en la falange media (PIP) y remate en la distal (DIP).
 * Los multiplicadores se afinaron para que el puño cerrado quede legible.
 */
export function distributeFlex(flex: number): FingerPose {
  const f = Math.min(1, Math.max(0, flex));
  return {
    proximal: f * FLEX_PROXIMAL * MAX_FLEX_RAD,
    middle: f * FLEX_MIDDLE * MAX_FLEX_RAD,
    distal: f * FLEX_DISTAL * MAX_FLEX_RAD,
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
  const target = {
    x: RIGHT_SHOULDER_X + kf.hand.x * 0.5,
    y: SHOULDER_HEIGHT + kf.hand.y * 0.5,
    z: kf.hand.z * 0.3,
  };

  const dx = target.x - RIGHT_SHOULDER_X;
  const dy = target.y - SHOULDER_HEIGHT;
  const dz = target.z;
  const dist = Math.min(Math.sqrt(dx * dx + dy * dy + dz * dz), ARM_LENGTH * 0.99);

  const shoulderPitch = Math.atan2(-dy, Math.hypot(dx, dz));
  const shoulderYaw = Math.atan2(dx, dz || 1e-6);

  const a = BONE_LENGTHS.upperArm;
  const b = BONE_LENGTHS.foreArm;
  const cosElbow = Math.min(
    1,
    Math.max(-1, (a * a + b * b - dist * dist) / (2 * a * b)),
  );
  const elbow = Math.PI - Math.acos(cosElbow);

  return {
    shoulder: [shoulderPitch, shoulderYaw, 0],
    elbow,
    wrist: [kf.hand.rot[0], kf.hand.rot[1], kf.hand.rot[2]],
    fingers: [
      distributeFlex(kf.fingers[0]),
      distributeFlex(kf.fingers[1]),
      distributeFlex(kf.fingers[2]),
      distributeFlex(kf.fingers[3]),
      distributeFlex(kf.fingers[4]),
    ],
  };
}
