import type { AvatarKeyframe } from "@/lib/curriculum/schema";
import { BONE_LENGTHS, RIGHT_SHOULDER_X, SHOULDER_HEIGHT } from "./rig";

export type Pose = {
  /** Rotación del hombro derecho en radianes (X, Y, Z locales). */
  shoulder: [number, number, number];
  /** Rotación del codo (flexión sobre el eje X del antebrazo). */
  elbow: number;
  /** Rotación de la mano (heredada del clip). */
  wrist: [number, number, number];
  /** Flexión por dedo (0 = extendido, 1 = puño). */
  fingers: [number, number, number, number, number];
};

const ARM_LENGTH = BONE_LENGTHS.upperArm + BONE_LENGTHS.foreArm;

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
    x: RIGHT_SHOULDER_X + kf.hand.x * 0.5, // el clip cubre ~1 unidad; la escalamos
    y: SHOULDER_HEIGHT + kf.hand.y * 0.5,
    z: kf.hand.z * 0.3,
  };

  const dx = target.x - RIGHT_SHOULDER_X;
  const dy = target.y - SHOULDER_HEIGHT;
  const dz = target.z;
  const dist = Math.min(Math.sqrt(dx * dx + dy * dy + dz * dz), ARM_LENGTH * 0.99);

  // Ángulo del brazo total desde el hombro (dirección al codo/target).
  const shoulderPitch = Math.atan2(-dy, Math.hypot(dx, dz)); // eje X: elevación
  const shoulderYaw = Math.atan2(dx, dz || 1e-6); // eje Y: rotación lateral

  // Codo: por ley de cosenos con brazo y antebrazo.
  const a = BONE_LENGTHS.upperArm;
  const b = BONE_LENGTHS.foreArm;
  const cosElbow = Math.min(
    1,
    Math.max(-1, (a * a + b * b - dist * dist) / (2 * a * b)),
  );
  const elbow = Math.PI - Math.acos(cosElbow); // 0 = extendido, positivo = flexionado

  return {
    shoulder: [shoulderPitch, shoulderYaw, 0],
    elbow,
    wrist: [kf.hand.rot[0], kf.hand.rot[1], kf.hand.rot[2]],
    fingers: [
      kf.fingers[0],
      kf.fingers[1],
      kf.fingers[2],
      kf.fingers[3],
      kf.fingers[4],
    ],
  };
}
