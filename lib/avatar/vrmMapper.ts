import type { VRM } from "@pixiv/three-vrm";
import { VRMHumanBoneName } from "@pixiv/three-vrm";
import type { Pose } from "./pose";
import { THUMB_ABDUCTION } from "./rig";

/**
 * Aplica poses calculadas por pose.ts a los bones humanoides de un VRM.
 * Cubre ambos brazos, roll de antebrazo, muñeca y los 5 dedos × 3 falanges
 * con abducción lateral. Todos los getBoneNode son no-op si el VRM no
 * expone ese hueso (VRM0 y VRM1 tienen distintos subsets de huesos).
 */
export function applyPoseToVrm(vrm: VRM, poseR: Pose, poseL: Pose) {
  const h = vrm.humanoid;

  // ── Brazo derecho ────────────────────────────────────────────────────────
  const rua = h.getBoneNode(VRMHumanBoneName.RightUpperArm);
  if (rua) rua.rotation.set(poseR.shoulder[0], poseR.shoulder[1], poseR.shoulder[2]);

  const rla = h.getBoneNode(VRMHumanBoneName.RightLowerArm);
  if (rla) { rla.rotation.x = -poseR.elbow; rla.rotation.y = poseR.forearmRoll; }

  const rh = h.getBoneNode(VRMHumanBoneName.RightHand);
  if (rh) rh.rotation.set(poseR.wrist[0], poseR.wrist[1], poseR.wrist[2]);

  applyFingers(vrm, poseR, "Right");

  // ── Brazo izquierdo ──────────────────────────────────────────────────────
  const lua = h.getBoneNode(VRMHumanBoneName.LeftUpperArm);
  if (lua) lua.rotation.set(poseL.shoulder[0], poseL.shoulder[1], poseL.shoulder[2]);

  const lla = h.getBoneNode(VRMHumanBoneName.LeftLowerArm);
  if (lla) { lla.rotation.x = -poseL.elbow; lla.rotation.y = poseL.forearmRoll; }

  const lh = h.getBoneNode(VRMHumanBoneName.LeftHand);
  if (lh) lh.rotation.set(poseL.wrist[0], poseL.wrist[1], poseL.wrist[2]);

  applyFingers(vrm, poseL, "Left");
}

/** Tabla de bones VRM por dedo × falange para un lado dado. */
const FINGER_BONES: Record<"Right" | "Left", [VRMHumanBoneName, VRMHumanBoneName, VRMHumanBoneName][]> = {
  Right: [
    [VRMHumanBoneName.RightThumbMetacarpal,  VRMHumanBoneName.RightThumbProximal,      VRMHumanBoneName.RightThumbDistal],
    [VRMHumanBoneName.RightIndexProximal,    VRMHumanBoneName.RightIndexIntermediate,   VRMHumanBoneName.RightIndexDistal],
    [VRMHumanBoneName.RightMiddleProximal,   VRMHumanBoneName.RightMiddleIntermediate,  VRMHumanBoneName.RightMiddleDistal],
    [VRMHumanBoneName.RightRingProximal,     VRMHumanBoneName.RightRingIntermediate,    VRMHumanBoneName.RightRingDistal],
    [VRMHumanBoneName.RightLittleProximal,   VRMHumanBoneName.RightLittleIntermediate,  VRMHumanBoneName.RightLittleDistal],
  ],
  Left: [
    [VRMHumanBoneName.LeftThumbMetacarpal,   VRMHumanBoneName.LeftThumbProximal,        VRMHumanBoneName.LeftThumbDistal],
    [VRMHumanBoneName.LeftIndexProximal,     VRMHumanBoneName.LeftIndexIntermediate,    VRMHumanBoneName.LeftIndexDistal],
    [VRMHumanBoneName.LeftMiddleProximal,    VRMHumanBoneName.LeftMiddleIntermediate,   VRMHumanBoneName.LeftMiddleDistal],
    [VRMHumanBoneName.LeftRingProximal,      VRMHumanBoneName.LeftRingIntermediate,     VRMHumanBoneName.LeftRingDistal],
    [VRMHumanBoneName.LeftLittleProximal,    VRMHumanBoneName.LeftLittleIntermediate,   VRMHumanBoneName.LeftLittleDistal],
  ],
};

/** Postura idle natural: brazos ligeramente caídos con respiración. */
export function applyVrmIdle(vrm: VRM, tMs: number) {
  const h = vrm.humanoid;
  const breath = Math.sin(tMs * 0.0008) * 0.015;

  const rua = h.getBoneNode(VRMHumanBoneName.RightUpperArm);
  if (rua) rua.rotation.set(0.10 + breath, -0.05, -0.08);
  const lua = h.getBoneNode(VRMHumanBoneName.LeftUpperArm);
  if (lua) lua.rotation.set(0.10 + breath,  0.05,  0.08);

  const rla = h.getBoneNode(VRMHumanBoneName.RightLowerArm);
  if (rla) { rla.rotation.x = -0.12; rla.rotation.y = 0; }
  const lla = h.getBoneNode(VRMHumanBoneName.LeftLowerArm);
  if (lla) { lla.rotation.x = -0.12; lla.rotation.y = 0; }

  const rh = h.getBoneNode(VRMHumanBoneName.RightHand);
  if (rh) rh.rotation.set(0, 0, 0);
  const lh = h.getBoneNode(VRMHumanBoneName.LeftHand);
  if (lh) lh.rotation.set(0, 0, 0);
}

function applyFingers(vrm: VRM, pose: Pose, side: "Right" | "Left") {
  const h = vrm.humanoid;
  const map = FINGER_BONES[side];
  const zSign = side === "Right" ? 1 : -1;

  for (let i = 0; i < 5; i++) {
    const fp = pose.fingers[i]!;
    const abd = pose.abduction[i]!;
    const [b0, b1, b2] = map[i]!;

    const n0 = h.getBoneNode(b0);
    if (n0) {
      n0.rotation.x = -fp.proximal;
      // Pulgar (i=0): abducción es la rotación Z de la metacarpiana
      // Dedos (i=1-4): abducción es Z en el proximal
      n0.rotation.z = i === 0 ? -zSign * THUMB_ABDUCTION + zSign * abd : zSign * abd;
    }
    const n1 = h.getBoneNode(b1);
    if (n1) n1.rotation.x = -fp.middle;
    const n2 = h.getBoneNode(b2);
    if (n2) n2.rotation.x = -fp.distal;
  }
}
