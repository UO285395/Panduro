import type { VRM } from "@pixiv/three-vrm";
import { VRMHumanBoneName as B } from "@pixiv/three-vrm";
import * as THREE from "three";
import type { AvatarClip, AvatarKeyframe, Contact } from "@/lib/curriculum/schema";
import { measureBody, surfaceFor, type BodyMap, type Cloud } from "./bodyPoints";
import { distributeFlex, getFingerAbduction, getFingerFlex } from "./pose";

/**
 * Anima un VRM a partir de los keyframes del currículo.
 *
 * Los huesos normalizados de three-vrm parten de rotación identidad y sus
 * ejes coinciden con el espacio del modelo, así que cada rotación se construye
 * como el cambio entre dos bases ortonormales: la de reposo (T-pose, palma
 * abajo) y la objetivo (dirección del hueso + palma o plano del codo). La
 * posición de la muñeca sale de una IK de dos huesos con las longitudes reales
 * del modelo, y el espacio de signado se ancla a la cara y el pecho del propio
 * modelo (VRM0 mira a -Z, VRM1 a +Z; se detecta a partir de los hombros).
 *
 * Los contactos (yemas en la barbilla, índice en la sien…) se resuelven una vez
 * por clip con `resolveClip`: se busca la posición de muñeca que deja esa parte
 * de la mano sobre el punto del cuerpo medido en la malla, y el clip resultante
 * ya solo tiene posiciones, que se interpolan como cualquier otro.
 */

type Side = "Right" | "Left";
type HandSpec = AvatarKeyframe["hand"];

const ARM = {
  Right: { upper: B.RightUpperArm, lower: B.RightLowerArm, hand: B.RightHand },
  Left: { upper: B.LeftUpperArm, lower: B.LeftLowerArm, hand: B.LeftHand },
} as const;

const FINGERS: Record<Side, [B, B, B][]> = {
  Right: [
    [B.RightThumbMetacarpal, B.RightThumbProximal, B.RightThumbDistal],
    [B.RightIndexProximal, B.RightIndexIntermediate, B.RightIndexDistal],
    [B.RightMiddleProximal, B.RightMiddleIntermediate, B.RightMiddleDistal],
    [B.RightRingProximal, B.RightRingIntermediate, B.RightRingDistal],
    [B.RightLittleProximal, B.RightLittleIntermediate, B.RightLittleDistal],
  ],
  Left: [
    [B.LeftThumbMetacarpal, B.LeftThumbProximal, B.LeftThumbDistal],
    [B.LeftIndexProximal, B.LeftIndexIntermediate, B.LeftIndexDistal],
    [B.LeftMiddleProximal, B.LeftMiddleIntermediate, B.LeftMiddleDistal],
    [B.LeftRingProximal, B.LeftRingIntermediate, B.LeftRingDistal],
    [B.LeftLittleProximal, B.LeftLittleIntermediate, B.LeftLittleDistal],
  ],
};

const THUMB_FLEX_SCALE = 0.7;

type FingerRest = { bones: [B, B, B]; curlAxis: THREE.Vector3 };
type Fingers = AvatarKeyframe["fingers"];

type ArmRest = {
  shoulder: THREE.Vector3;
  upperLen: number;
  lowerLen: number;
  upperRestInv: THREE.Matrix4;
  lowerRestInv: THREE.Matrix4;
  handRestInv: THREE.Matrix4;
  palmRest: THREE.Vector3;
  fingers: FingerRest[];
};

export type VrmRig = {
  vrm: VRM;
  /** Rotación Y de la escena para que el personaje mire a +Z (cámara). */
  facingY: number;
  right: THREE.Vector3;
  up: THREE.Vector3;
  forward: THREE.Vector3;
  armLen: number;
  chestY: number;
  mouthY: number;
  /** Distancia de la cara por delante del plano de los hombros. */
  faceFwd: number;
  arms: Record<Side, ArmRest>;
  /** Origen (entre los ojos) de las coordenadas de `body`. */
  eyes: THREE.Vector3;
  body: BodyMap;
  /** Clips con los contactos ya resueltos para este modelo. */
  resolved: WeakMap<AvatarClip, AvatarClip>;
};

const X = new THREE.Vector3();

function perp(v: THREE.Vector3, axis: THREE.Vector3, fallback: THREE.Vector3): THREE.Vector3 {
  const p = v.clone().addScaledVector(axis, -v.dot(axis));
  if (p.lengthSq() < 1e-6) return fallback.clone().addScaledVector(axis, -fallback.dot(axis)).normalize();
  return p.normalize();
}

function basis(primary: THREE.Vector3, secondary: THREE.Vector3): THREE.Matrix4 {
  const x = primary.clone().normalize();
  const y = secondary.clone().addScaledVector(x, -secondary.dot(x)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Matrix4().makeBasis(x, y, z);
}

function rotation(restInv: THREE.Matrix4, target: THREE.Matrix4): THREE.Quaternion {
  return new THREE.Quaternion().setFromRotationMatrix(target.multiply(restInv));
}

function setNorm(vrm: VRM, name: B, q: THREE.Quaternion) {
  vrm.humanoid.getNormalizedBoneNode(name)?.quaternion.copy(q);
}

/** Lee la pose de reposo del VRM. Llamar justo tras cargarlo, antes de posar. */
export function createVrmRig(vrm: VRM): VrmRig {
  const root = vrm.humanoid.normalizedHumanBonesRoot;
  root.updateWorldMatrix(true, true);
  const toModel = root.matrixWorld.clone().invert();
  const pos = (name: B): THREE.Vector3 | null => {
    const node = vrm.humanoid.getNormalizedBoneNode(name);
    return node ? new THREE.Vector3().setFromMatrixPosition(node.matrixWorld).applyMatrix4(toModel) : null;
  };
  const must = (name: B) => {
    const p = pos(name);
    if (!p) throw new Error(`VRM sin hueso ${name}`);
    return p;
  };

  const up = new THREE.Vector3(0, 1, 0);
  const right = must(B.RightUpperArm).sub(must(B.LeftUpperArm));
  right.y = 0;
  right.normalize();
  const forward = new THREE.Vector3().crossVectors(up, right);
  const down = up.clone().negate();

  const arms = {} as Record<Side, ArmRest>;
  for (const side of ["Right", "Left"] as const) {
    const bones = ARM[side];
    const s = must(bones.upper);
    const e = must(bones.lower);
    const w = must(bones.hand);
    const tip = pos(side === "Right" ? B.RightMiddleProximal : B.LeftMiddleProximal);
    const r1 = e.clone().sub(s).normalize();
    const r2 = w.clone().sub(e).normalize();
    const r3 = tip ? tip.clone().sub(w).normalize() : r2.clone();
    const palmRest = perp(down, r3, forward);

    const fingers: FingerRest[] = FINGERS[side].map((chain) => {
      const a = pos(chain[0]);
      const b = pos(chain[1]);
      const dir = a && b ? b.clone().sub(a).normalize() : r3.clone();
      const curlAxis = new THREE.Vector3().crossVectors(dir, palmRest);
      if (curlAxis.lengthSq() < 1e-6) curlAxis.crossVectors(r3, palmRest);
      return { bones: chain, curlAxis: curlAxis.normalize() };
    });

    arms[side] = {
      shoulder: s,
      upperLen: e.distanceTo(s),
      lowerLen: w.distanceTo(e),
      upperRestInv: basis(r1, perp(forward, r1, down)).invert(),
      lowerRestInv: basis(r2, perp(down, r2, forward)).invert(),
      handRestInv: basis(r3, palmRest).invert(),
      palmRest,
      fingers,
    };
  }

  const R = arms.Right;
  const armLen = R.upperLen + R.lowerLen;
  const shoulderY = R.shoulder.y;
  const head = pos(B.Head) ?? R.shoulder.clone().setY(shoulderY + 0.5 * armLen);
  const eyeL = pos(B.LeftEye);
  const eyeR = pos(B.RightEye);
  const eyes = eyeL && eyeR ? eyeL.add(eyeR).multiplyScalar(0.5) : null;
  const eyeY = eyes ? eyes.y : head.y + 0.3 * armLen;
  const faceFwd = eyes
    ? eyes.clone().sub(R.shoulder).dot(forward)
    : head.clone().sub(R.shoulder).dot(forward) + 0.3 * armLen;

  const origin = eyes ?? head.clone().addScaledVector(up, 0.3 * armLen).addScaledVector(forward, 0.1 * armLen);
  const local = (p: THREE.Vector3): [number, number, number] => {
    const d = p.clone().sub(origin);
    return [d.dot(right), d.y, d.dot(forward)];
  };
  const body = measureBody(collectCloud(vrm, toModel, origin, right, forward), {
    eyeSep: eyeL && eyeR ? eyeL.distanceTo(eyeR) : 0.12 * armLen,
    neckU: (pos(B.Neck) ?? head).y - origin.y,
    hipsU: (pos(B.Hips) ?? R.shoulder.clone().setY(shoulderY - armLen)).y - origin.y,
    shoulderU: shoulderY - origin.y,
    shoulder: local(R.shoulder),
    armLen,
  });

  return {
    vrm,
    facingY: -Math.atan2(forward.x, forward.z),
    right,
    up,
    forward,
    armLen,
    chestY: shoulderY - 0.15 * armLen,
    mouthY: head.y + 0.45 * (eyeY - head.y),
    faceFwd,
    arms,
    eyes: origin,
    body,
    resolved: new WeakMap(),
  };
}

const HAIR = /hair|kami|bang|ahoge|髪/i;

/** Vértices de las mallas en reposo, en coordenadas del signante (r, u, f). */
function collectCloud(
  vrm: VRM,
  toModel: THREE.Matrix4,
  origin: THREE.Vector3,
  right: THREE.Vector3,
  forward: THREE.Vector3,
): Cloud {
  vrm.scene.updateMatrixWorld(true);
  const r: number[] = [];
  const u: number[] = [];
  const f: number[] = [];
  const hair: number[] = [];
  const v = new THREE.Vector3();
  vrm.scene.traverse((obj) => {
    const mesh = obj as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const position = mesh.geometry.getAttribute("position");
    if (!position) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const isHair = HAIR.test(mesh.name) || materials.some((m) => HAIR.test(m.name));
    const toLocal = mesh.matrixWorld.clone().premultiply(toModel);
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i);
      mesh.applyBoneTransform(i, v);
      v.applyMatrix4(toLocal).sub(origin);
      r.push(v.dot(right));
      u.push(v.y);
      f.push(v.dot(forward));
      hair.push(isHair ? 1 : 0);
    }
  });
  return {
    r: Float32Array.from(r),
    u: Float32Array.from(u),
    f: Float32Array.from(f),
    hair: Uint8Array.from(hair),
  };
}

/** IK analítica de dos huesos; devuelve las direcciones del brazo y antebrazo. */
function solveArm(
  arm: ArmRest,
  target: THREE.Vector3,
  pole: THREE.Vector3,
): { upper: THREE.Vector3; lower: THREE.Vector3 } {
  const a = arm.upperLen;
  const b = arm.lowerLen;
  const toTarget = target.clone().sub(arm.shoulder);
  const dir = toTarget.clone().normalize();
  const dist = THREE.MathUtils.clamp(toTarget.length(), Math.abs(a - b) + 1e-3, (a + b) * 0.97);
  const cosA = (a * a + dist * dist - b * b) / (2 * a * dist);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const bendDir = perp(pole, dir, X.set(0, -1, 0));
  const elbow = arm.shoulder.clone()
    .addScaledVector(dir, a * cosA)
    .addScaledVector(bendDir, a * sinA);
  const wrist = arm.shoulder.clone().addScaledVector(dir, dist);
  return {
    upper: elbow.clone().sub(arm.shoulder).normalize(),
    lower: wrist.sub(elbow).normalize(),
  };
}

type ArmGoal = {
  target: THREE.Vector3;
  pole: THREE.Vector3;
  /** Hacia dónde mira la palma con la muñeca recta (se proyecta ⟂ antebrazo). */
  palm: THREE.Vector3;
  /** Dirección medida de los dedos (grabaciones): sustituye a roll y wrist. */
  point?: THREE.Vector3;
  /** Pronosupinación extra (rad); positivo gira la palma hacia la línea media. */
  roll: number;
  /** Flexión, giro y desviación de la muñeca (rad). */
  wrist: [number, number, number];
};

function poseArm(rig: VrmRig, side: Side, goal: ArmGoal) {
  const arm = rig.arms[side];
  const sign = side === "Right" ? 1 : -1;
  const { upper, lower } = solveArm(arm, goal.target, goal.pole);

  const bend = perp(lower, upper, rig.forward);
  const down = rig.up.clone().negate();
  let palm: THREE.Vector3;
  let handDir: THREE.Vector3;
  let handPalm: THREE.Vector3;
  if (goal.point) {
    handDir = goal.point.clone().normalize();
    handPalm = perp(goal.palm, handDir, down);
    palm = perp(handPalm, lower, down);
  } else {
    palm = perp(goal.palm, lower, down).applyAxisAngle(lower, goal.roll * sign);
    const lateral = new THREE.Vector3().crossVectors(lower, palm).normalize();
    const wristQ = new THREE.Quaternion()
      .setFromAxisAngle(lateral, goal.wrist[0])
      .multiply(new THREE.Quaternion().setFromAxisAngle(lower, goal.wrist[1] * sign))
      .multiply(new THREE.Quaternion().setFromAxisAngle(palm, goal.wrist[2] * sign));
    handDir = lower.clone().applyQuaternion(wristQ);
    handPalm = palm.clone().applyQuaternion(wristQ);
  }

  const q1 = rotation(arm.upperRestInv, basis(upper, bend));
  const q2 = rotation(arm.lowerRestInv, basis(lower, palm));
  const qh = rotation(arm.handRestInv, basis(handDir, handPalm));

  const bones = ARM[side];
  setNorm(rig.vrm, bones.upper, q1);
  setNorm(rig.vrm, bones.lower, q1.clone().invert().multiply(q2));
  setNorm(rig.vrm, bones.hand, q2.clone().invert().multiply(qh));
}

function poseFingers(rig: VrmRig, side: Side, fingers: Fingers) {
  const arm = rig.arms[side];
  const abdSign = side === "Right" ? 1 : -1;
  arm.fingers.forEach((finger, i) => {
    const value = fingers[i]!;
    const flex = distributeFlex(getFingerFlex(value));
    const scale = i === 0 ? THUMB_FLEX_SCALE : 1;
    const abd = new THREE.Quaternion().setFromAxisAngle(arm.palmRest, getFingerAbduction(value) * abdSign);
    const curl = (angle: number) => new THREE.Quaternion().setFromAxisAngle(finger.curlAxis, angle * scale);
    setNorm(rig.vrm, finger.bones[0], abd.multiply(curl(flex.proximal)));
    setNorm(rig.vrm, finger.bones[1], curl(flex.middle));
    setNorm(rig.vrm, finger.bones[2], curl(flex.distal));
  });
}

/**
 * Espacio de signado. x: hacia fuera desde el hombro del propio lado,
 * y: 0.35 ≈ pecho alto y 0.70 ≈ boca, z: hacia el interlocutor (0 ≈ 0.55
 * brazos por delante del hombro). Relación lineal: `resolveClip` ya ha
 * colocado cada keyframe donde debe estar para este modelo.
 */
function signingGoal(rig: VrmRig, side: Side, hand: HandSpec): ArmGoal {
  const L = rig.armLen;
  const outward = rig.right.clone().multiplyScalar(side === "Right" ? 1 : -1);
  const target = rig.arms[side].shoulder.clone()
    .addScaledVector(outward, hand.x * 1.2 * L)
    .addScaledVector(rig.forward, (0.55 + hand.z * 0.9) * L)
    .setY(rig.chestY + ((hand.y - 0.35) / 0.35) * (rig.mouthY - rig.chestY));
  const pole = outward.clone().multiplyScalar(0.25)
    .addScaledVector(rig.up, -1)
    .addScaledVector(rig.forward, -0.3);
  const toModel = (v: [number, number, number]) =>
    rig.right.clone().multiplyScalar(v[0])
      .addScaledVector(rig.up, v[1])
      .addScaledVector(rig.forward, v[2]);
  return {
    target,
    pole,
    palm: hand.palmDir ? toModel(hand.palmDir) : rig.forward,
    point: hand.pointDir ? toModel(hand.pointDir) : undefined,
    roll: hand.forearmRoll ?? 0,
    wrist: hand.rot,
  };
}

/** Inversa de la posición de `signingGoal`. */
function toSigningSpace(rig: VrmRig, side: Side, target: THREE.Vector3): Pick<HandSpec, "x" | "y" | "z"> {
  const L = rig.armLen;
  const outward = rig.right.clone().multiplyScalar(side === "Right" ? 1 : -1);
  const d = target.clone().sub(rig.arms[side].shoulder);
  return {
    x: d.dot(outward) / (1.2 * L),
    y: 0.35 + (0.35 * (target.y - rig.chestY)) / (rig.mouthY - rig.chestY),
    z: (d.dot(rig.forward) / L - 0.55) / 0.9,
  };
}

// --- Contactos -------------------------------------------------------------

/** Piel entre el eje del dedo o de la palma y la superficie que toca. */
const SKIN = 0.012;

function bonePos(rig: VrmRig, toModel: THREE.Matrix4, name: B): THREE.Vector3 | null {
  const node = rig.vrm.humanoid.getNormalizedBoneNode(name);
  return node ? new THREE.Vector3().setFromMatrixPosition(node.matrixWorld).applyMatrix4(toModel) : null;
}

/** Posición actual (tras posar) de la parte de la mano que toca. */
function handPart(
  rig: VrmRig,
  side: Side,
  part: NonNullable<Contact["with"]>,
  fingers: Fingers,
  toModel: THREE.Matrix4,
): THREE.Vector3 {
  const arm = rig.arms[side];
  const wrist = bonePos(rig, toModel, ARM[side].hand)!;
  const tip = (i: number) => {
    const [, b, c] = arm.fingers[i]!.bones;
    const pb = bonePos(rig, toModel, b);
    const pc = bonePos(rig, toModel, c);
    return pb && pc ? pc.clone().addScaledVector(pc.clone().sub(pb), 0.85) : wrist.clone();
  };
  const mean = (ps: THREE.Vector3[]) =>
    ps.reduce((acc, p) => acc.add(p), new THREE.Vector3()).multiplyScalar(1 / ps.length);
  const palmCenter = () => {
    const ps = [1, 4].map((i) => bonePos(rig, toModel, arm.fingers[i]!.bones[0])).filter(Boolean) as THREE.Vector3[];
    const c = mean([wrist, wrist, ...ps]);
    const handNode = rig.vrm.humanoid.getNormalizedBoneNode(ARM[side].hand)!;
    const q = handNode.getWorldQuaternion(new THREE.Quaternion())
      .premultiply(new THREE.Quaternion().setFromRotationMatrix(toModel));
    const normal = arm.palmRest.clone().applyQuaternion(q);
    const knuckle = bonePos(rig, toModel, arm.fingers[2]!.bones[0]) ?? wrist;
    return { c, normal, thick: 0.2 * knuckle.distanceTo(wrist) };
  };
  switch (part) {
    case "index":
      return tip(1);
    case "middle":
      return tip(2);
    case "thumb":
      return tip(0);
    case "palm": {
      const { c, normal, thick } = palmCenter();
      return c.addScaledVector(normal, thick);
    }
    case "back": {
      const { c, normal, thick } = palmCenter();
      return c.addScaledVector(normal, -thick);
    }
    case "knuckles": {
      const ps = [1, 2].map((i) => bonePos(rig, toModel, arm.fingers[i]!.bones[1])).filter(Boolean) as THREE.Vector3[];
      return ps.length ? mean(ps) : wrist;
    }
    case "tips": {
      const extended = [1, 2, 3, 4].filter((i) => getFingerFlex(fingers[i]!) < 0.5);
      if (extended.length) return mean(extended.map(tip));
      if (getFingerFlex(fingers[0]!) < 0.5) return tip(0);
      return handPart(rig, side, "knuckles", fingers, toModel);
    }
  }
}

/** Punto (en el modelo) donde debe quedar la parte de la mano. */
function contactPoint(rig: VrmRig, side: Side, c: Contact): THREE.Vector3 {
  const L = rig.armLen;
  const s = surfaceFor(rig.body, c.at, side === "Right" ? "right" : "left");
  const local = (v: [number, number, number]) =>
    rig.right.clone().multiplyScalar(v[0]).addScaledVector(rig.up, v[1]).addScaledVector(rig.forward, v[2]);
  const outward = rig.right.clone().multiplyScalar(side === "Right" ? 1 : -1);
  const skin = c.with === "palm" || c.with === "back" ? SKIN / 2 : SKIN;
  return rig.eyes.clone()
    .add(local(s.p))
    .addScaledVector(local(s.n), ((c.gap ?? 0) + skin) * L)
    .addScaledVector(outward, (c.offset?.[0] ?? 0) * L)
    .addScaledVector(rig.up, (c.offset?.[1] ?? 0) * L);
}

/**
 * Muñeca que deja la parte de la mano sobre el punto de contacto. La mano
 * cambia un poco de orientación al mover el antebrazo, así que se corrige
 * unas cuantas veces hasta que el error es despreciable.
 */
function reachContact(rig: VrmRig, side: Side, goal: ArmGoal, fingers: Fingers, c: Contact): THREE.Vector3 {
  const want = contactPoint(rig, side, c);
  const root = rig.vrm.humanoid.normalizedHumanBonesRoot;
  root.updateWorldMatrix(true, false);
  const toModel = root.matrixWorld.clone().invert();
  const target = want.clone();
  poseFingers(rig, side, fingers);
  for (let k = 0; k < 8; k++) {
    poseArm(rig, side, { ...goal, target });
    root.updateWorldMatrix(false, true);
    const err = want.clone().sub(handPart(rig, side, c.with ?? "tips", fingers, toModel));
    target.add(err);
    if (err.length() < 1e-3 * rig.armLen) break;
  }
  return target;
}

/**
 * Mano del clip → mano en posición para este modelo. Con contacto, la muñeca
 * sale de `reachContact`; sin él, se mantiene delante de la cara para que la
 * mano no atraviese la cabeza.
 */
function resolveHand(rig: VrmRig, side: Side, hand: HandSpec, fingers: Fingers): HandSpec {
  const { contact, ...rest } = hand;
  const L = rig.armLen;
  if (!contact) {
    const minFwd = rig.faceFwd + 0.12 * L;
    const fwd = Math.max(Math.max(0.55 * L, minFwd) + hand.z * 0.9 * L, minFwd);
    return { ...rest, z: (fwd / L - 0.55) / 0.9 };
  }
  const oriented = { ...rest, ...contactOrientation(rig, side, contact, hand) };
  const goal = signingGoal(rig, side, oriented);
  const free = goal.target.clone();
  const touch = reachContact(rig, side, goal, fingers, contact);
  return { ...oriented, ...toSigningSpace(rig, side, free.lerp(touch, contact.weight ?? 1)) };
}

/**
 * Orientación por defecto al tocar, en espacio del signante:
 * - yemas, palma o puño: esa cara de la mano mira a la piel y los dedos
 *   siguen la superficie hacia arriba (el dorso, al revés);
 * - índice o corazón: el dedo apunta a la piel, algo hacia arriba;
 * - pulgar: en un lateral (sien, oreja) el puño queda por fuera con el pulgar
 *   hacia dentro; en el centro (barbilla, pecho), puño de lado y pulgar arriba.
 * Lo que el clip indique explícitamente manda.
 */
function contactOrientation(
  rig: VrmRig,
  side: Side,
  c: Contact,
  hand: HandSpec,
): Pick<HandSpec, "palmDir" | "pointDir"> {
  const n = new THREE.Vector3(...surfaceFor(rig.body, c.at, side === "Right" ? "right" : "left").n);
  const up = new THREE.Vector3(0, 1, 0);
  const fwd = new THREE.Vector3(0, 0, 1);
  const medial = new THREE.Vector3(side === "Right" ? -1 : 1, 0, 0);
  const alongUp = () => (Math.abs(n.y) > 0.97 ? fwd.clone() : perp(up, n, fwd));
  let palm: THREE.Vector3;
  let point: THREE.Vector3;
  switch (c.with) {
    case "index":
    case "middle":
      point = n.clone().negate().addScaledVector(up, Math.abs(n.y) > 0.97 ? 0 : 0.4).normalize();
      palm = perp(up.clone().negate(), point, fwd.clone().negate());
      break;
    case "thumb":
      if (Math.abs(n.x) > 0.5) {
        palm = fwd.clone();
        point = up.clone();
      } else {
        palm = medial;
        point = fwd.clone();
      }
      break;
    case "back":
      palm = n.clone();
      point = alongUp();
      break;
    default:
      palm = n.clone().negate();
      point = alongUp();
  }
  const arr = (v: THREE.Vector3): [number, number, number] => [v.x, v.y, v.z];
  return { palmDir: hand.palmDir ?? arr(palm), pointDir: hand.pointDir ?? arr(point) };
}

/** Clip listo para `applyVrmKeyframe` en este modelo (se calcula una vez). */
export function resolveClip(rig: VrmRig, clip: AvatarClip): AvatarClip {
  const cached = rig.resolved.get(clip);
  if (cached) return cached;
  const resolved: AvatarClip = {
    ...clip,
    keyframes: clip.keyframes.map((kf) => ({
      ...kf,
      hand: resolveHand(rig, "Right", kf.hand, kf.fingers),
      hand2: kf.hand2 && resolveHand(rig, "Left", kf.hand2, kf.fingers2 ?? kf.fingers),
    })),
  };
  rig.resolved.set(clip, resolved);
  return resolved;
}

function idleGoal(rig: VrmRig, side: Side, tMs: number): ArmGoal {
  const L = rig.armLen;
  const outward = rig.right.clone().multiplyScalar(side === "Right" ? 1 : -1);
  const breath = Math.sin(tMs * 0.0008) * 0.01 * L;
  const target = rig.arms[side].shoulder.clone()
    .addScaledVector(outward, 0.12 * L)
    .addScaledVector(rig.forward, 0.08 * L)
    .addScaledVector(rig.up, -0.9 * L + breath);
  return {
    target,
    pole: rig.forward.clone().negate().addScaledVector(outward, 0.3),
    palm: outward.clone().negate(),
    roll: 0,
    wrist: [0, 0, 0],
  };
}

const RELAXED: Fingers = [0.15, 0.15, 0.15, 0.15, 0.15];

/**
 * Signo en curso: brazo derecho según `hand`; el izquierdo según `hand2` o en
 * reposo. El keyframe tiene que venir de un clip pasado por `resolveClip`.
 */
export function applyVrmKeyframe(rig: VrmRig, kf: AvatarKeyframe, tMs: number) {
  poseArm(rig, "Right", signingGoal(rig, "Right", kf.hand));
  poseFingers(rig, "Right", kf.fingers);
  if (kf.hand2) {
    poseArm(rig, "Left", signingGoal(rig, "Left", kf.hand2));
    poseFingers(rig, "Left", kf.fingers2 ?? kf.fingers);
  } else {
    poseArm(rig, "Left", idleGoal(rig, "Left", tMs));
    poseFingers(rig, "Left", RELAXED);
  }
}

/** Reposo: brazos caídos junto al cuerpo, palmas hacia los muslos. */
export function applyVrmIdle(rig: VrmRig, tMs: number) {
  for (const side of ["Right", "Left"] as const) {
    poseArm(rig, side, idleGoal(rig, side, tMs));
    poseFingers(rig, side, RELAXED);
  }
}

/** Huesos que anima el mapper (brazos y dedos de los dos lados). */
const POSED: B[] = (["Right", "Left"] as const).flatMap((side) => [
  ARM[side].upper,
  ARM[side].lower,
  ARM[side].hand,
  ...FINGERS[side].flat(),
]);

export type PoseSnapshot = Map<B, THREE.Quaternion>;

/** Copia de la pose actual, para fundirla con la siguiente. */
export function snapshotPose(rig: VrmRig): PoseSnapshot {
  const snap: PoseSnapshot = new Map();
  for (const name of POSED) {
    const node = rig.vrm.humanoid.getNormalizedBoneNode(name);
    if (node) snap.set(name, node.quaternion.clone());
  }
  return snap;
}

/** Mezcla la pose recién aplicada con una anterior (u = 0 anterior, 1 nueva). */
export function blendFromSnapshot(rig: VrmRig, from: PoseSnapshot, u: number) {
  for (const [name, q] of from) {
    const node = rig.vrm.humanoid.getNormalizedBoneNode(name);
    if (node) node.quaternion.copy(q.clone().slerp(node.quaternion, u));
  }
}
