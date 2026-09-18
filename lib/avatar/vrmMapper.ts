import type { VRM } from "@pixiv/three-vrm";
import { VRMHumanBoneName } from "@pixiv/three-vrm";
import type { Pose } from "./pose";

/**
 * Aplica una Pose calculada por pose.ts a los bones humanoides de un VRM.
 * Todos los getBoneNode son silenciosos si el VRM no expone ese hueso.
 */
export function applyPoseToVrm(vrm: VRM, pose: Pose) {
  const h = vrm.humanoid;

  // Brazo derecho
  const rua = h.getBoneNode(VRMHumanBoneName.RightUpperArm);
  if (rua) rua.rotation.set(pose.shoulder[0], pose.shoulder[1], pose.shoulder[2]);

  const rla = h.getBoneNode(VRMHumanBoneName.RightLowerArm);
  if (rla) rla.rotation.x = -pose.elbow;

  const rh = h.getBoneNode(VRMHumanBoneName.RightHand);
  if (rh) rh.rotation.set(pose.wrist[0], pose.wrist[1], pose.wrist[2]);

  // 5 dedos × 3 falanges
  // Pulgar: Metacarpal → Proximal → Distal (sin Intermediate en VRM spec).
  const boneMap: [VRMHumanBoneName, VRMHumanBoneName, VRMHumanBoneName][] = [
    [VRMHumanBoneName.RightThumbMetacarpal, VRMHumanBoneName.RightThumbProximal,    VRMHumanBoneName.RightThumbDistal],
    [VRMHumanBoneName.RightIndexProximal,   VRMHumanBoneName.RightIndexIntermediate, VRMHumanBoneName.RightIndexDistal],
    [VRMHumanBoneName.RightMiddleProximal,  VRMHumanBoneName.RightMiddleIntermediate,VRMHumanBoneName.RightMiddleDistal],
    [VRMHumanBoneName.RightRingProximal,    VRMHumanBoneName.RightRingIntermediate,  VRMHumanBoneName.RightRingDistal],
    [VRMHumanBoneName.RightLittleProximal,  VRMHumanBoneName.RightLittleIntermediate,VRMHumanBoneName.RightLittleDistal],
  ];

  for (let i = 0; i < 5; i++) {
    const fp = pose.fingers[i];
    const [b0, b1, b2] = boneMap[i]!;
    const n0 = h.getBoneNode(b0); if (n0) n0.rotation.x = -fp.proximal;
    const n1 = h.getBoneNode(b1); if (n1) n1.rotation.x = -fp.middle;
    const n2 = h.getBoneNode(b2); if (n2) n2.rotation.x = -fp.distal;
  }
}
