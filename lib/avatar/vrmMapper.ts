import type { VRM } from "@pixiv/three-vrm";
import { VRMHumanBoneName } from "@pixiv/three-vrm";
import * as THREE from "three";
import type { Pose } from "./pose";
import { THUMB_ABDUCTION } from "./rig";

/**
 * Aplica poses calculadas por pose.ts a los bones humanoides de un VRM
 * usando la API de bones normalizados de three-vrm.
 *
 * En three-vrm, los bones normalizados usan un sistema de coordenadas
 * canónico donde (0,0,0,1) = T-pose para todos los huesos.
 * Para el brazo derecho: +X_norm = dirección del brazo en T-pose.
 * Para bajarlo hacia posición natural: rotación negativa alrededor del eje Z.
 *
 * IMPORTANTE: llamar a setNormalizedLocalRotation ANTES de vrm.update(),
 * porque update() propaga normalized→raw. Invertir el orden no funciona.
 */
function setNormRot(vrm: VRM, name: VRMHumanBoneName, q: THREE.Quaternion) {
  const node = vrm.humanoid.getNormalizedBoneNode(name);
  if (node) node.quaternion.copy(q);
}

export function applyPoseToVrm(vrm: VRM, poseR: Pose, poseL: Pose) {
  // ── Brazo derecho ────────────────────────────────────────────────────────
  setNormRot(vrm, VRMHumanBoneName.RightUpperArm,
    shoulderQuat(poseR.shoulder[0], poseR.shoulder[1], "Right"));
  setNormRot(vrm, VRMHumanBoneName.RightLowerArm,
    new THREE.Quaternion().setFromEuler(new THREE.Euler(-poseR.elbow, poseR.forearmRoll, 0)));
  setNormRot(vrm, VRMHumanBoneName.RightHand,
    new THREE.Quaternion().setFromEuler(new THREE.Euler(poseR.wrist[0], poseR.wrist[1], poseR.wrist[2])));

  applyFingers(vrm, poseR, "Right");

  // ── Brazo izquierdo ──────────────────────────────────────────────────────
  setNormRot(vrm, VRMHumanBoneName.LeftUpperArm,
    shoulderQuat(poseL.shoulder[0], poseL.shoulder[1], "Left"));
  setNormRot(vrm, VRMHumanBoneName.LeftLowerArm,
    new THREE.Quaternion().setFromEuler(new THREE.Euler(-poseL.elbow, poseL.forearmRoll, 0)));
  setNormRot(vrm, VRMHumanBoneName.LeftHand,
    new THREE.Quaternion().setFromEuler(new THREE.Euler(poseL.wrist[0], poseL.wrist[1], poseL.wrist[2])));

  applyFingers(vrm, poseL, "Left");
}

/**
 * Convierte los ángulos IK del hombro (pitch desde -Y, yaw en XZ) a un
 * quaternion en el espacio de bones normalizados de three-vrm.
 *
 * En el espacio normalizado:
 * - (0,0,0,1) = T-pose (brazo horizontal)
 * - La dirección del brazo normalizado local +Y = +X_world (brazo der) o -X_world (brazo izq)
 * - Z normalizado negativo baja el brazo derecho; Z positivo baja el izquierdo
 *
 * Transformación (brazo derecho):
 *   Q_parent^-1 = rotación +90° alrededor de Z
 *   local.x = -world_arm.y = cos(pitch)
 *   local.y = world_arm.x  = sin(pitch)*sin(yaw)
 *   local.z = world_arm.z  (en VRM space, negado por la rotación de escena)
 */
function shoulderQuat(
  pitch: number,
  yaw: number,
  side: "Right" | "Left",
): THREE.Quaternion {
  // Dirección del brazo en espacio de escena (procedural rig convention)
  const wx = Math.sin(pitch) * Math.sin(yaw);
  const wy = -Math.cos(pitch);
  // wz negado al pasar a VRM space (vrmScene.rotation.y = PI)
  const wz = -(Math.sin(pitch) * Math.cos(yaw));

  let lx: number, ly: number, lz: number;
  if (side === "Right") {
    // Q_parent_R^-1 = rotación +90° Z: local.x=-wy, local.y=wx, local.z=wz
    lx = -wy; // = cos(pitch)
    ly = wx;  // = sin(pitch)*sin(yaw)
    lz = wz;
  } else {
    // Para brazo izquierdo, el parent alínea +Y_local con -X_world
    // Q_parent_L^-1 = rotación -90° Z: local.x=wy, local.y=-wx, local.z=wz
    lx = wy;  // = -(-cos(pitch)) = cos(pitch)
    ly = -wx; // = -sin(pitch)*sin(yaw)
    lz = wz;
  }

  const len = Math.sqrt(lx * lx + ly * ly + lz * lz);
  if (len < 1e-6) return new THREE.Quaternion(); // degenerate case

  return new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(lx / len, ly / len, lz / len),
  );
}

/** Postura idle natural: brazos caídos con ligera respiración. */
export function applyVrmIdle(vrm: VRM, tMs: number) {
  const breath = Math.sin(tMs * 0.0008) * 0.012;

  // Z negativo baja el brazo derecho, Z positivo baja el izquierdo.
  // -1.4 rad ≈ -80° = brazos casi completamente caídos.
  const downR = -1.4 - breath * 0.1;
  const downL = 1.4 + breath * 0.1;

  setNormRot(vrm, VRMHumanBoneName.RightUpperArm,
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0.08, 0, downR)));
  setNormRot(vrm, VRMHumanBoneName.LeftUpperArm,
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0.08, 0, downL)));

  const elbowQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.1, 0, 0));
  setNormRot(vrm, VRMHumanBoneName.RightLowerArm, elbowQ);
  setNormRot(vrm, VRMHumanBoneName.LeftLowerArm, elbowQ);

  setNormRot(vrm, VRMHumanBoneName.RightHand, new THREE.Quaternion());
  setNormRot(vrm, VRMHumanBoneName.LeftHand, new THREE.Quaternion());
}

/** Tabla de bones VRM por dedo × falange para un lado dado. */
const FINGER_BONES: Record<
  "Right" | "Left",
  [VRMHumanBoneName, VRMHumanBoneName, VRMHumanBoneName][]
> = {
  Right: [
    [VRMHumanBoneName.RightThumbMetacarpal, VRMHumanBoneName.RightThumbProximal, VRMHumanBoneName.RightThumbDistal],
    [VRMHumanBoneName.RightIndexProximal,   VRMHumanBoneName.RightIndexIntermediate,  VRMHumanBoneName.RightIndexDistal],
    [VRMHumanBoneName.RightMiddleProximal,  VRMHumanBoneName.RightMiddleIntermediate, VRMHumanBoneName.RightMiddleDistal],
    [VRMHumanBoneName.RightRingProximal,    VRMHumanBoneName.RightRingIntermediate,   VRMHumanBoneName.RightRingDistal],
    [VRMHumanBoneName.RightLittleProximal,  VRMHumanBoneName.RightLittleIntermediate, VRMHumanBoneName.RightLittleDistal],
  ],
  Left: [
    [VRMHumanBoneName.LeftThumbMetacarpal,  VRMHumanBoneName.LeftThumbProximal,  VRMHumanBoneName.LeftThumbDistal],
    [VRMHumanBoneName.LeftIndexProximal,    VRMHumanBoneName.LeftIndexIntermediate,  VRMHumanBoneName.LeftIndexDistal],
    [VRMHumanBoneName.LeftMiddleProximal,   VRMHumanBoneName.LeftMiddleIntermediate, VRMHumanBoneName.LeftMiddleDistal],
    [VRMHumanBoneName.LeftRingProximal,     VRMHumanBoneName.LeftRingIntermediate,   VRMHumanBoneName.LeftRingDistal],
    [VRMHumanBoneName.LeftLittleProximal,   VRMHumanBoneName.LeftLittleIntermediate, VRMHumanBoneName.LeftLittleDistal],
  ],
};

function applyFingers(vrm: VRM, pose: Pose, side: "Right" | "Left") {
  const h = vrm.humanoid;
  const map = FINGER_BONES[side];
  const zSign = side === "Right" ? 1 : -1;

  for (let i = 0; i < 5; i++) {
    const fp = pose.fingers[i]!;
    const abd = pose.abduction[i]!;
    const [b0, b1, b2] = map[i]!;

    // Usar getRawBoneNode para dedos — el mapeado de bones normalizados
    // para falanges es idéntico en VRM0 y VRM1 (no hay transformación extra)
    const n0 = h.getRawBoneNode(b0);
    if (n0) {
      n0.rotation.x = -fp.proximal;
      n0.rotation.z = i === 0 ? -zSign * THUMB_ABDUCTION + zSign * abd : zSign * abd;
    }
    const n1 = h.getRawBoneNode(b1);
    if (n1) n1.rotation.x = -fp.middle;
    const n2 = h.getRawBoneNode(b2);
    if (n2) n2.rotation.x = -fp.distal;
  }
}
