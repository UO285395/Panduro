import * as THREE from "three";
import type { AvatarClip } from "@/lib/curriculum/schema";
import { sampleLoop } from "./interpolate";
import { applyVrmKeyframe, handJointWorld, resolveClip, turnBody, type VrmRig } from "./vrmMapper";

/**
 * El esqueleto del avatar mientras hace un signo, para compararlo con el vídeo del que salió
 * (/dev/auditar y scripts/audit_signs.py). Todo en el mundo, con el avatar de cara a la cámara
 * (+Z): x a la derecha de quien mira, y hacia arriba.
 */
export type SkeletonFrame = {
  t: number;
  /** Las 21 articulaciones de MediaPipe de cada mano (Right y Left del avatar). */
  R: Vec[];
  L: Vec[];
  /** Hombros, codos y muñecas, como la pose de MediaPipe (11-16): izquierdo y derecho de cada uno. */
  arms: Vec[];
  /** Entre los ojos, el centro de la boca, y un punto a la derecha y otro arriba de los ojos (a 5 cm). */
  eyes: Vec;
  mouth: Vec;
  fr: Vec;
  fu: Vec;
  /** Si cada mano (derecha, izquierda) toca algo en ese instante. */
  contact: [boolean, boolean];
};

export type ClipSkeleton = {
  duration: number;
  handedness: AvatarClip["handedness"];
  yaw: number;
  /** Las medidas de la cara del modelo (FaceGrid) para pasar a coordenadas de cara de una persona. */
  grid: { halfWidth: number; eyesToMouth: number; chinU: number; topU: number; eye: { inR: number; outR: number; top: number; bottom: number } };
  frames: SkeletonFrame[];
};

type Vec = [number, number, number];

const round = (v: THREE.Vector3): Vec => [+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4)];

/** Si cada mano toca algo en el keyframe del clip más cercano (el clip resuelto ya no lo dice). */
function touching(clip: AvatarClip, t: number): [boolean, boolean] {
  let near = clip.keyframes[0]!;
  for (const kf of clip.keyframes) if (Math.abs(kf.t - t) < Math.abs(near.t - t)) near = kf;
  return [!!near.hand.contact, !!near.hand2?.contact];
}

/** Cada `stepMs` del clip, ya resuelto para este modelo (contactos, manos que no se cruzan…). */
export function clipSkeleton(rig: VrmRig, clip: AvatarClip, stepMs = 40): ClipSkeleton {
  const h = rig.vrm.humanoid;
  const root = h.normalizedHumanBonesRoot;
  const head = h.getNormalizedBoneNode("head")!;
  const bone = (n: Parameters<typeof h.getNormalizedBoneNode>[0]) => round(h.getNormalizedBoneNode(n)!.getWorldPosition(new THREE.Vector3()));

  // Ojos, boca y ejes de la cara en el espacio de la cabeza, de frente: luego giran con ella.
  turnBody(rig, 0);
  root.updateWorldMatrix(true, true);
  const q = root.getWorldQuaternion(new THREE.Quaternion());
  const eyesW = rig.eyes.clone().applyMatrix4(root.matrixWorld);
  const local = (w: THREE.Vector3) => head.worldToLocal(w.clone());
  const eyes = local(eyesW);
  const mouth = local(new THREE.Vector3(rig.eyes.x, rig.mouthY, rig.eyes.z).applyMatrix4(root.matrixWorld));
  const right = local(eyesW.clone().addScaledVector(rig.right.clone().applyQuaternion(q), 0.05));
  const up = local(eyesW.clone().addScaledVector(rig.up.clone().applyQuaternion(q), 0.05));
  const world = (p: THREE.Vector3) => round(head.localToWorld(p.clone()));

  const resolved = resolveClip(rig, clip);
  turnBody(rig, clip.bodyYaw ?? 0);
  const frames: SkeletonFrame[] = [];
  for (let t = 0; t <= clip.duration; t += stepMs) {
    const kf = sampleLoop(resolved, t);
    applyVrmKeyframe(rig, kf, t, 0);
    root.updateWorldMatrix(true, true);
    const hand = (side: "Right" | "Left") => Array.from({ length: 21 }, (_, k) => round(handJointWorld(rig, side, k)));
    frames.push({
      t,
      R: hand("Right"),
      L: hand("Left"),
      arms: [bone("leftUpperArm"), bone("rightUpperArm"), bone("leftLowerArm"), bone("rightLowerArm"), bone("leftHand"), bone("rightHand")],
      eyes: world(eyes),
      mouth: world(mouth),
      fr: world(right),
      fu: world(up),
      contact: touching(clip, t),
    });
  }
  turnBody(rig, 0);

  const g = rig.face;
  return {
    duration: clip.duration,
    handedness: clip.handedness,
    yaw: clip.bodyYaw ?? 0,
    grid: { halfWidth: g.halfWidth, eyesToMouth: g.eyesToMouth, chinU: g.chinU, topU: g.topU, eye: g.eye },
    frames,
  };
}
