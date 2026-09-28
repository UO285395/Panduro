import type { AvatarKeyframe, FingerValue } from "@/lib/curriculum/schema";
import { BONE_LENGTHS, LEFT_SHOULDER_X, RIGHT_SHOULDER_X, SHOULDER_HEIGHT } from "./rig";

/** Rotación acumulada por falange (rad, alrededor del eje X local del hueso). */
export type FingerPose = {
  proximal: number;
  middle: number;
  distal: number;
};

export type Pose = {
  /** Rotación del hombro en radianes (X, Y, Z locales). */
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

/**
 * Altura de la mano (y del currículo): del pecho (0.35) a la boca (0.70) es lineal; por
 * encima se cuenta en distancias boca→ojos, 0.15 cada una. Así una mano junto a la frente
 * queda junto a la frente también en un avatar de cabeza grande.
 */
export const Y_CHEST = 0.35;
export const Y_MOUTH = 0.7;
export const Y_PER_FACE = 0.15;

const DEG = Math.PI / 180;
/** Flexión máxima del nudillo y de la falange media (dedo medido, ver FingerValue). */
export const MCP_MAX = 85 * DEG;
export const PIP_MAX = 100 * DEG;
/** Azimut de cada dedo estirado en una mano relajada (medianas del DILSE, desde el corazón). */
export const REST_AZIMUTH = [32 * DEG, 7 * DEG, 0, -3 * DEG, -13 * DEG] as const;

export type MeasuredFinger = [number, number, number];
export const isMeasured = (v: FingerValue): v is MeasuredFinger => Array.isArray(v);

/** Extrae el valor de flexión 0..1 de un FingerValue. */
export function getFingerFlex(v: FingerValue): number {
  if (isMeasured(v)) return Math.max(0, Math.min(1, (v[1] + v[2]) / (MCP_MAX + PIP_MAX)));
  return typeof v === "number" ? v : v.flex;
}

/** Extrae la abducción de un FingerValue (0 si es número simple o medido). */
export function getFingerAbduction(v: FingerValue): number {
  if (isMeasured(v)) return 0;
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
 * IK analítica 2-bone para un brazo.
 * shoulderX: posición X del hombro en el espacio de escena.
 * hand: posición normalizada de la muñeca (espacio del clip).
 */
function _poseForArm(
  hand: AvatarKeyframe["hand"],
  fingers: AvatarKeyframe["fingers"],
  shoulderX: number,
): Pose {
  // Siempre hay componente Z positiva (hacia cámara) para evitar yaw ±90°.
  const effectiveZ = hand.z * 0.32 + 0.20;
  const target = {
    x: shoulderX + hand.x * 0.40,
    y: SHOULDER_HEIGHT + hand.y * 0.40,
    z: effectiveZ,
  };

  const dx = target.x - shoulderX;
  const dy = target.y - SHOULDER_HEIGHT;
  const dz = target.z;
  const dist = Math.min(Math.sqrt(dx * dx + dy * dy + dz * dz), ARM_LENGTH * 0.98);

  // Fórmula correcta: el brazo apunta hacia (dx, dy, dz) desde el hombro.
  // Pitch = ángulo entre el eje -Y y la dirección (respecto al plano horizontal).
  // arm_dir_y = -cos(pitch) = dy/dist  →  pitch = acos(-dy/dist)
  const shoulderPitch = Math.acos(Math.min(1, Math.max(-1, -dy / dist)));
  // Yaw en el plano XZ: atan2(dx, dz). Con effectiveZ > 0 nunca da ±90°.
  const shoulderYaw   = Math.atan2(dx, dz);

  const a = BONE_LENGTHS.upperArm;
  const b = BONE_LENGTHS.foreArm;
  const cosElbow = Math.min(
    1,
    Math.max(-1, (a * a + b * b - dist * dist) / (2 * a * b)),
  );
  const elbow = Math.max(0.35, Math.PI - Math.acos(cosElbow));

  return {
    shoulder: [shoulderPitch, shoulderYaw, 0],
    elbow,
    wrist: [hand.rot[0], hand.rot[1], hand.rot[2]],
    forearmRoll: hand.forearmRoll ?? 0,
    fingers: [
      distributeFlex(getFingerFlex(fingers[0])),
      distributeFlex(getFingerFlex(fingers[1])),
      distributeFlex(getFingerFlex(fingers[2])),
      distributeFlex(getFingerFlex(fingers[3])),
      distributeFlex(getFingerFlex(fingers[4])),
    ],
    abduction: [
      getFingerAbduction(fingers[0]),
      getFingerAbduction(fingers[1]),
      getFingerAbduction(fingers[2]),
      getFingerAbduction(fingers[3]),
      getFingerAbduction(fingers[4]),
    ],
  };
}

/** Convierte un keyframe a pose del brazo derecho. */
export function poseFromKeyframe(kf: AvatarKeyframe): Pose {
  return _poseForArm(kf.hand, kf.fingers, RIGHT_SHOULDER_X);
}

/**
 * Convierte un keyframe a pose del brazo izquierdo.
 * Si el clip tiene `hand2`/`fingers2`, los usa; si no, espeja el brazo derecho.
 */
export function poseFromKeyframeLeft(kf: AvatarKeyframe): Pose {
  if (kf.hand2) {
    return _poseForArm(kf.hand2, kf.fingers2 ?? kf.fingers, LEFT_SHOULDER_X);
  }
  // Signo unimanual: espejo simétrico del brazo derecho.
  const mirroredHand = {
    ...kf.hand,
    x: -kf.hand.x,
    rot: [kf.hand.rot[0], -kf.hand.rot[1], -kf.hand.rot[2]] as [number, number, number],
  };
  return _poseForArm(mirroredHand, kf.fingers, LEFT_SHOULDER_X);
}
