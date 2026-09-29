import type { VRM } from "@pixiv/three-vrm";
import { VRMHumanBoneName as B, VRMExpression, VRMExpressionMorphTargetBind } from "@pixiv/three-vrm";
import * as THREE from "three";
import { EXPRESSIONS, type AvatarClip, type AvatarKeyframe, type Contact, type Expressions } from "@/lib/curriculum/schema";
import {
  faceSurface,
  isOtherHand,
  measureBody,
  measureFace,
  surfaceFor,
  type BodyMap,
  type Cloud,
  type FaceGrid,
} from "./bodyPoints";
import { distributeFlex, getFingerAbduction, getFingerFlex, isMeasured, Y_CHEST, Y_MOUTH, Y_PER_FACE } from "./pose";

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
type Vec3 = [number, number, number];
type ThumbTouch = NonNullable<AvatarKeyframe["thumbTouch"]>;

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

type FingerRest = {
  bones: [B, B, B];
  curlAxis: THREE.Vector3;
  /** Última falange en reposo (espacio del modelo) y lo que mide hasta la punta. */
  tipDir: THREE.Vector3;
  tipLen: number;
  /** Dirección de reposo en el marco de la mano (ver FingerValue medido). */
  restAz: number;
  restEl: number;
};
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
  /** Signo del giro alrededor de la normal de la palma que abre hacia el pulgar. */
  azSign: number;
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
  /** Lo más adelantado de la cabeza por columnas: dónde cae un contacto con coordenadas de cara. */
  face: FaceGrid;
  /** Articulaciones del cuello y de la cabeza en reposo: el giro de la cabeza se reparte entre las dos. */
  neck: THREE.Vector3;
  head: THREE.Vector3;
  /** Expresión del modelo (y peso máximo) para cada gesto de la cara que puede hacer. */
  expressions: Partial<Record<keyof Expressions, [string, number]>>;
  /** Todas las expresiones que toca el mapper, parpadeo incluido. */
  exprNames: string[];
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
    // Marco de la mano en reposo: hacia el corazón, hacia el lado del índice y la palma.
    const idx = pos(FINGERS[side][1]![0]);
    const lit = pos(FINGERS[side][4]![0]);
    const thumbSide = idx && lit ? perp(perp(idx.clone().sub(lit), r3, forward), palmRest, forward) : forward.clone();

    const fingers: FingerRest[] = FINGERS[side].map((chain) => {
      const a = pos(chain[0]);
      const b = pos(chain[1]);
      const dir = a && b ? b.clone().sub(a).normalize() : r3.clone();
      const curlAxis = new THREE.Vector3().crossVectors(dir, palmRest);
      if (curlAxis.lengthSq() < 1e-6) curlAxis.crossVectors(r3, palmRest);
      const inPlane = Math.hypot(dir.dot(thumbSide), dir.dot(r3));
      const c = pos(chain[2]);
      const last = b && c ? c.clone().sub(b) : dir.clone().multiplyScalar(0.02 * (e.distanceTo(s) + w.distanceTo(e)));
      return {
        bones: chain,
        curlAxis: curlAxis.normalize(),
        tipDir: last.clone().normalize(),
        tipLen: 0.85 * last.length(),
        restAz: Math.atan2(dir.dot(thumbSide), dir.dot(r3)),
        restEl: Math.atan2(dir.dot(palmRest), inPlane),
      };
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
      azSign: Math.sign(new THREE.Vector3().crossVectors(palmRest, r3).dot(thumbSide)) || 1,
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
  const cloud = collectCloud(vrm, toModel, origin, right, forward);
  const anchors = {
    eyeSep: eyeL && eyeR ? eyeL.distanceTo(eyeR) : 0.12 * armLen,
    neckU: (pos(B.Neck) ?? head).y - origin.y,
    hipsU: (pos(B.Hips) ?? R.shoulder.clone().setY(shoulderY - armLen)).y - origin.y,
    shoulderU: shoulderY - origin.y,
    shoulder: local(R.shoulder),
    armLen,
  };
  const body = measureBody(cloud, anchors);
  const face = measureFace(cloud, body, anchors);

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
    face,
    neck: pos(B.Neck) ?? head.clone(),
    head,
    ...faceExpressions(vrm),
    resolved: new WeakMap(),
  };
}

/**
 * Cada gesto de la cara en las expresiones del modelo: la boca con sus vocales (VRM trae
 * aa, ih, ou, ee y oh) y la sonrisa y la pena con las emociones. Las cejas, con los morphs
 * que muevan solo las cejas si el modelo los tiene: el «angry» de muchos modelos anime pinta
 * además un símbolo de enfado en la frente, y VRM0 no trae cejas levantadas.
 */
function faceExpressions(vrm: VRM): Pick<VrmRig, "expressions" | "exprNames"> {
  const em = vrm.expressionManager;
  if (!em) return { expressions: {}, exprNames: [] };
  const custom = (name: string, pick: (target: string, mesh: string) => boolean): string | null => {
    if (em.getExpression(name)) return name;
    const expr = new VRMExpression(name);
    let binds = 0;
    vrm.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.morphTargetDictionary) return;
      const meshName = `${mesh.parent?.name ?? ""}/${mesh.name}`;
      for (const [target, index] of Object.entries(mesh.morphTargetDictionary)) {
        if (!pick(target, meshName)) continue;
        expr.addBind(new VRMExpressionMorphTargetBind({ primitives: [mesh], index, weight: 1 }));
        binds++;
      }
    });
    if (!binds) return null;
    em.registerExpression(expr);
    return name;
  };
  const has = (name: string) => (em.getExpression(name) ? name : null);
  // Ceño: cejas abajo y, si la malla de las cejas tiene su forma de enfado, también esa.
  const browDown = custom(
    "panduroBrowDown",
    (t, mesh) => /eyebrows?[ _.]*down|brw_angry/i.test(t) || (/brow/i.test(mesh) && /angry/i.test(t)),
  );
  const browUp = custom("panduroBrowUp", (t) => /eyebrows?[ _.]*up|brw_surprised/i.test(t));
  const table: Record<keyof Expressions, [string | null, number]> = {
    jaw: [has("aa"), 1],
    pucker: [has("ou"), 0.9],
    stretch: [has("ih"), 0.8],
    smile: [has("happy"), 0.8],
    frown: [has("sad"), 0.8],
    browDown: browDown ? [browDown, 1] : [has("angry"), 0.4],
    browUp: browUp ? [browUp, 1] : [has("surprised"), 1],
  };
  const expressions: VrmRig["expressions"] = {};
  for (const e of EXPRESSIONS) {
    const [name, gain] = table[e];
    if (name) expressions[e] = [name, gain];
  }
  const exprNames = [...Object.values(expressions).map(([name]) => name), ...(has("blink") ? ["blink"] : [])];
  return { expressions, exprNames };
}

const HAIR = /hair|kami|bang|ahoge|髪/i;
/** Mallas de los ojos (globo, iris, pestañas), no de las cejas. */
const EYE = /eye|iris|pupil|lash|目/i;

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
  const eye: number[] = [];
  const v = new THREE.Vector3();
  vrm.scene.traverse((obj) => {
    const mesh = obj as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const position = mesh.geometry.getAttribute("position");
    if (!position) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const isHair = HAIR.test(mesh.name) || materials.some((m) => HAIR.test(m.name));
    const isEye = EYE.test(mesh.name) && !/brow/i.test(mesh.name);
    const toLocal = mesh.matrixWorld.clone().premultiply(toModel);
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i);
      mesh.applyBoneTransform(i, v);
      v.applyMatrix4(toLocal).sub(origin);
      r.push(v.dot(right));
      u.push(v.y);
      f.push(v.dot(forward));
      hair.push(isHair ? 1 : 0);
      eye.push(isEye ? 1 : 0);
    }
  });
  return {
    r: Float32Array.from(r),
    u: Float32Array.from(u),
    f: Float32Array.from(f),
    hair: Uint8Array.from(hair),
    eye: Uint8Array.from(eye),
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

/** Punta del dedo `i` (0, el pulgar) en el mundo, con la última falange tal como esté posada. */
function fingerTipWorld(rig: VrmRig, side: Side, i: number): THREE.Vector3 {
  const f = rig.arms[side].fingers[i]!;
  const distal = rig.vrm.humanoid.getNormalizedBoneNode(f.bones[2]);
  if (!distal) return rig.vrm.humanoid.getNormalizedBoneNode(ARM[side].hand)!.getWorldPosition(new THREE.Vector3());
  const q = distal.getWorldQuaternion(new THREE.Quaternion());
  return distal.getWorldPosition(new THREE.Vector3()).addScaledVector(f.tipDir.clone().applyQuaternion(q), f.tipLen);
}

/** Entre las dos puntas que se tocan queda el grosor de los dedos (en palmas del modelo). */
const PINCH_GAP = 0.18;

/**
 * Un paso de CCD: gira el hueso `n` sobre su articulación para acercar `tip()` a `want`. Con
 * `hinge` (eje en el espacio del modelo) solo gira en esa bisagra, como un dedo.
 */
function ccdStep(n: THREE.Object3D, tip: () => THREE.Vector3, want: THREE.Vector3, hinge?: THREE.Vector3) {
  const pivot = n.getWorldPosition(new THREE.Vector3());
  const parentQ = n.parent!.getWorldQuaternion(new THREE.Quaternion());
  const cur = tip().sub(pivot);
  const dst = want.clone().sub(pivot);
  let delta: THREE.Quaternion;
  if (hinge) {
    const axis = hinge.clone().applyQuaternion(parentQ).normalize();
    cur.projectOnPlane(axis);
    dst.projectOnPlane(axis);
    if (cur.lengthSq() < 1e-12 || dst.lengthSq() < 1e-12) return;
    delta = new THREE.Quaternion().setFromAxisAngle(axis, Math.atan2(cur.clone().cross(dst).dot(axis), cur.dot(dst)));
  } else {
    if (cur.lengthSq() < 1e-12 || dst.lengthSq() < 1e-12) return;
    delta = new THREE.Quaternion().setFromUnitVectors(cur.normalize(), dst.normalize());
  }
  n.quaternion.premultiply(parentQ.clone().invert().multiply(delta).multiply(parentQ));
  n.updateWorldMatrix(false, true);
}

/**
 * Pinza: con los dedos ya posados, junta la punta del pulgar con las yemas que toca. Los
 * ángulos medidos dejan las puntas separadas o cruzadas en una mano de otras proporciones
 * (este modelo tiene los dedos largos para su pulgar): el pulgar va hacia las yemas (IK por
 * CCD sobre sus tres huesos) y cada dedo tocado se dobla en sus bisagras hacia el pulgar,
 * por turnos, hasta que se encuentran. Con un peso parcial solo recorren esa parte.
 */
function closePinch(rig: VrmRig, side: Side, touch: ThumbTouch | undefined) {
  const strength = touch ? Math.max(...touch) : 0;
  const fingers = rig.arms[side].fingers;
  const node = (b: B) => rig.vrm.humanoid.getNormalizedBoneNode(b);
  if (!touch || strength < 0.02 || !fingers.every((f) => f.bones.every((b) => node(b)))) return;
  const hand = node(ARM[side].hand)!;
  hand.updateWorldMatrix(true, true);
  const palmLen = node(fingers[2]!.bones[0])!.getWorldPosition(new THREE.Vector3())
    .distanceTo(hand.getWorldPosition(new THREE.Vector3()));
  const tip = (i: number) => () => fingerTipWorld(rig, side, i);
  const touched = [1, 2, 3, 4].filter((i) => touch[i - 1]! > 0.02);
  const total = touched.reduce((a, i) => a + touch[i - 1]!, 0);
  const centroid = () =>
    touched.reduce((acc, i) => acc.addScaledVector(fingerTipWorld(rig, side, i), touch[i - 1]! / total), new THREE.Vector3());
  // Hasta dónde se cierra: el grosor de los dedos entre las puntas, o solo parte del camino.
  const aim = (from: THREE.Vector3, to: THREE.Vector3, w: number) => {
    const d = from.distanceTo(to);
    const end = Math.max(PINCH_GAP * palmLen, d - (d - PINCH_GAP * palmLen) * w);
    return to.clone().add(from.clone().sub(to).setLength(Math.min(d, end)));
  };
  for (let round = 0; round < 4; round++) {
    const thumbWant = aim(fingerTipWorld(rig, side, 0), centroid(), strength);
    for (let it = 0; it < 4; it++) {
      for (const b of [...fingers[0]!.bones].reverse()) ccdStep(node(b)!, tip(0), thumbWant);
    }
    for (const i of touched) {
      const f = fingers[i]!;
      const want = aim(fingerTipWorld(rig, side, i), fingerTipWorld(rig, side, 0), touch[i - 1]!);
      for (let it = 0; it < 3; it++) {
        for (const b of [...f.bones].reverse()) ccdStep(node(b)!, tip(i), want, f.curlAxis);
      }
    }
    if (fingerTipWorld(rig, side, 0).distanceTo(centroid()) < (PINCH_GAP + 0.03) * palmLen) break;
  }
}

/** Reparto de la flexión medida entre la falange media y la distal (el pulgar, a partes iguales). */
const MEASURED_SPLIT = { finger: [1, 0.65], thumb: [0.5, 0.5] } as const;

function poseFingers(rig: VrmRig, side: Side, fingers: Fingers, touch?: ThumbTouch) {
  const arm = rig.arms[side];
  const abdSign = side === "Right" ? 1 : -1;
  arm.fingers.forEach((finger, i) => {
    const value = fingers[i]!;
    const curlAbout = (angle: number) => new THREE.Quaternion().setFromAxisAngle(finger.curlAxis, angle);
    if (isMeasured(value)) {
      // Medido: el primer hueso gira hasta el azimut y la elevación grabados (en el marco de
      // esta mano) y los otros dos doblan lo que dobló el dedo.
      const [az, el, bend] = value;
      const [m, d] = i === 0 ? MEASURED_SPLIT.thumb : MEASURED_SPLIT.finger;
      const spread = new THREE.Quaternion().setFromAxisAngle(arm.palmRest, (az - finger.restAz) * arm.azSign);
      setNorm(rig.vrm, finger.bones[0], spread.multiply(curlAbout(el - finger.restEl)));
      setNorm(rig.vrm, finger.bones[1], curlAbout(bend * m));
      setNorm(rig.vrm, finger.bones[2], curlAbout(bend * d));
      return;
    }
    const flex = distributeFlex(getFingerFlex(value));
    const scale = i === 0 ? THUMB_FLEX_SCALE : 1;
    const abd = new THREE.Quaternion().setFromAxisAngle(arm.palmRest, getFingerAbduction(value) * abdSign);
    const curl = (angle: number) => new THREE.Quaternion().setFromAxisAngle(finger.curlAxis, angle * scale);
    setNorm(rig.vrm, finger.bones[0], abd.multiply(curl(flex.proximal)));
    setNorm(rig.vrm, finger.bones[1], curl(flex.middle));
    setNorm(rig.vrm, finger.bones[2], curl(flex.distal));
  });
  closePinch(rig, side, touch);
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
    .setY(heightToModel(rig, hand.y));
  const toModel = (v: [number, number, number]) =>
    rig.right.clone().multiplyScalar(v[0])
      .addScaledVector(rig.up, v[1])
      .addScaledVector(rig.forward, v[2]);
  // El codo, hacia donde lo tenía el signante (grabaciones); si no, abajo, algo hacia fuera y atrás.
  const pole = hand.elbowDir
    ? toModel(hand.elbowDir)
    : outward.clone().multiplyScalar(0.25).addScaledVector(rig.up, -1).addScaledVector(rig.forward, -0.3);
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
    y: heightFromModel(rig, target.y),
    z: (d.dot(rig.forward) / L - 0.55) / 0.9,
  };
}

/** Altura del currículo → altura en el modelo (ver Y_PER_FACE: por encima de la boca, en su cara). */
function heightToModel(rig: VrmRig, y: number): number {
  if (y <= Y_MOUTH) return rig.chestY + ((y - Y_CHEST) / (Y_MOUTH - Y_CHEST)) * (rig.mouthY - rig.chestY);
  return rig.mouthY + ((y - Y_MOUTH) / Y_PER_FACE) * Math.max(1e-3, rig.eyes.y - rig.mouthY);
}

function heightFromModel(rig: VrmRig, h: number): number {
  if (h <= rig.mouthY) return Y_CHEST + ((Y_MOUTH - Y_CHEST) * (h - rig.chestY)) / (rig.mouthY - rig.chestY);
  return Y_MOUTH + (Y_PER_FACE * (h - rig.mouthY)) / Math.max(1e-3, rig.eyes.y - rig.mouthY);
}

// --- Cabeza y cara ---------------------------------------------------------

/** Parte del giro de la cabeza que hace el cuello; el resto, la propia cabeza. */
const NECK_SHARE = 0.4;
/** Puntos del cuerpo que están en la cabeza y se mueven con ella. */
const HEAD_POINTS = new Set<string>(["chin", "mouth", "nose", "forehead", "top", "eye", "cheek", "temple", "ear"]);

/** Giro de la cabeza en el modelo (ver AvatarKeyframe.head). */
function headRotation(rig: VrmRig, head: Vec3 | undefined): THREE.Quaternion {
  if (!head) return new THREE.Quaternion();
  const [yaw, pitch, roll] = head;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  // Ejes de la cara en el espacio del signante: mira hacia `fwd` con la coronilla hacia `up`.
  const fwd: Vec3 = [sy * cp, -sp, cy * cp];
  const side: Vec3 = [cy, 0, -sy];
  const up = [sy * sp, cp, cy * sp].map((u, k) => u * Math.cos(roll) + side[k]! * Math.sin(roll)) as Vec3;
  const toModel = (v: Vec3) =>
    rig.right.clone().multiplyScalar(v[0]).addScaledVector(rig.up, v[1]).addScaledVector(rig.forward, v[2]);
  return rotation(basis(rig.forward, rig.up).invert(), basis(toModel(fwd), toModel(up)));
}

/** Dónde queda un punto de la cabeza (en reposo) con la cabeza girada `q`. */
function moveWithHead(rig: VrmRig, q: THREE.Quaternion, p: THREE.Vector3): THREE.Vector3 {
  const qNeck = new THREE.Quaternion().slerp(q, NECK_SHARE);
  const headAt = rig.head.clone().sub(rig.neck).applyQuaternion(qNeck).add(rig.neck);
  return p.clone().sub(rig.head).applyQuaternion(q).add(headAt);
}

function poseHead(rig: VrmRig, head: Vec3 | undefined) {
  const q = headRotation(rig, head);
  const hasNeck = !!rig.vrm.humanoid.getNormalizedBoneNode(B.Neck);
  const share = hasNeck ? NECK_SHARE : 0;
  setNorm(rig.vrm, B.Neck, new THREE.Quaternion().slerp(q, share));
  // La cabeza cuelga del cuello: su parte del giro, ya en el marco del cuello girado.
  setNorm(rig.vrm, B.Head, new THREE.Quaternion().slerp(q, 1 - share));
}

/** Parpadeo natural: uno cada 4 s, en un momento distinto de cada tramo, de unos 180 ms. */
function blinkAt(tMs: number): number {
  const slot = Math.floor(tMs / 4000);
  const r = Math.abs(Math.sin(slot * 12.9898 + 78.233) * 43758.5453) % 1;
  const u = tMs - slot * 4000 - (400 + 2800 * r);
  if (u < 0 || u > 180) return 0;
  return u < 70 ? u / 70 : 1 - (u - 70) / 110;
}

function setExpressions(rig: VrmRig, expr: Expressions | undefined, tMs: number) {
  const em = rig.vrm.expressionManager;
  if (!em) return;
  for (const name of rig.exprNames) em.setValue(name, 0);
  for (const e of EXPRESSIONS) {
    const target = rig.expressions[e];
    if (target) em.setValue(target[0], Math.min(1, (em.getValue(target[0]) ?? 0) + (expr?.[e] ?? 0) * target[1]));
  }
  // Con el ceño los ojos se entornan un poco (como en el «angry» del modelo, sin su símbolo).
  if (rig.exprNames.includes("blink")) em.setValue("blink", Math.max(blinkAt(tMs), 0.25 * (expr?.browDown ?? 0)));
}

// --- Contactos -------------------------------------------------------------

/** Piel entre el eje del dedo o de la palma y la superficie que toca. */
const SKIN = 0.012;

function bonePos(rig: VrmRig, toModel: THREE.Matrix4, name: B): THREE.Vector3 | null {
  const node = rig.vrm.humanoid.getNormalizedBoneNode(name);
  return node ? new THREE.Vector3().setFromMatrixPosition(node.matrixWorld).applyMatrix4(toModel) : null;
}

/** Normal de la palma (hacia el lado de la palma) y grosor de la mano, tras posar. */
function palmFrame(rig: VrmRig, side: Side, toModel: THREE.Matrix4) {
  const arm = rig.arms[side];
  const wrist = bonePos(rig, toModel, ARM[side].hand)!;
  const handNode = rig.vrm.humanoid.getNormalizedBoneNode(ARM[side].hand)!;
  const q = handNode.getWorldQuaternion(new THREE.Quaternion())
    .premultiply(new THREE.Quaternion().setFromRotationMatrix(toModel));
  const knuckle = bonePos(rig, toModel, arm.fingers[2]!.bones[0]) ?? wrist;
  return {
    wrist,
    knuckle,
    normal: arm.palmRest.clone().applyQuaternion(q).normalize(),
    thick: 0.2 * knuckle.distanceTo(wrist),
  };
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
  const tip = (i: number) => fingerTipWorld(rig, side, i).applyMatrix4(toModel);
  const mean = (ps: THREE.Vector3[]) =>
    ps.reduce((acc, p) => acc.add(p), new THREE.Vector3()).multiplyScalar(1 / ps.length);
  const palmCenter = () => {
    const ps = [1, 4].map((i) => bonePos(rig, toModel, arm.fingers[i]!.bones[0])).filter(Boolean) as THREE.Vector3[];
    const c = mean([wrist, wrist, ...ps]);
    const { normal, thick } = palmFrame(rig, side, toModel);
    return { c, normal, thick };
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

/** Superficie tocada, en el modelo: punto de la piel y normal hacia fuera. */
type Touched = { p: THREE.Vector3; n: THREE.Vector3 };

/**
 * Dónde está lo que se toca. Los puntos del cuerpo salen de la malla; las partes de la
 * otra mano, de su pose en este mismo keyframe (tiene que estar ya posada).
 */
function touchedSurface(rig: VrmRig, side: Side, c: Contact, otherFingers: Fingers, head?: Vec3): Touched {
  if (isOtherHand(c.at)) {
    const other: Side = side === "Right" ? "Left" : "Right";
    const root = rig.vrm.humanoid.normalizedHumanBonesRoot;
    root.updateWorldMatrix(true, true);
    const toModel = root.matrixWorld.clone().invert();
    const frame = palmFrame(rig, other, toModel);
    switch (c.at) {
      case "otherPalm":
        return { p: handPart(rig, other, "palm", otherFingers, toModel), n: frame.normal };
      case "otherBack":
        return { p: handPart(rig, other, "back", otherFingers, toModel), n: frame.normal.clone().negate() };
      case "otherTips":
        return {
          p: handPart(rig, other, "tips", otherFingers, toModel),
          n: frame.knuckle.clone().sub(frame.wrist).normalize(),
        };
      case "otherWrist":
        return { p: frame.wrist.clone().addScaledVector(frame.normal, frame.thick), n: frame.normal };
    }
  }
  const s = c.face ? faceSurface(rig.face, c.face) : surfaceFor(rig.body, c.at, side === "Right" ? "right" : "left");
  const local = (v: [number, number, number]) =>
    rig.right.clone().multiplyScalar(v[0]).addScaledVector(rig.up, v[1]).addScaledVector(rig.forward, v[2]);
  const p = rig.eyes.clone().add(local(s.p));
  const n = local(s.n);
  // En la cara, el punto se mueve con la cabeza si el signo la gira.
  if (head && (c.face || HEAD_POINTS.has(c.at))) {
    const q = headRotation(rig, head);
    return { p: moveWithHead(rig, q, p), n: n.applyQuaternion(q) };
  }
  return { p, n };
}

/** Punto (en el modelo) donde debe quedar la parte de la mano. */
function contactPoint(rig: VrmRig, side: Side, c: Contact, otherFingers: Fingers, head?: Vec3): THREE.Vector3 {
  const L = rig.armLen;
  const touched = touchedSurface(rig, side, c, otherFingers, head);
  const outward = rig.right.clone().multiplyScalar(side === "Right" ? 1 : -1);
  const skin = c.with === "palm" || c.with === "back" ? SKIN / 2 : SKIN;
  return touched.p
    .addScaledVector(touched.n, ((c.gap ?? 0) + skin) * L)
    .addScaledVector(outward, (c.offset?.[0] ?? 0) * L)
    .addScaledVector(rig.up, (c.offset?.[1] ?? 0) * L);
}

/**
 * Muñeca que deja la parte de la mano sobre el punto de contacto. La mano
 * cambia un poco de orientación al mover el antebrazo, así que se corrige
 * unas cuantas veces hasta que el error es despreciable.
 */
function reachContact(
  rig: VrmRig,
  side: Side,
  goal: ArmGoal,
  fingers: Fingers,
  c: Contact,
  otherFingers: Fingers,
  head?: Vec3,
  touch?: ThumbTouch,
): THREE.Vector3 {
  const want = contactPoint(rig, side, c, otherFingers, head);
  const root = rig.vrm.humanoid.normalizedHumanBonesRoot;
  root.updateWorldMatrix(true, false);
  const toModel = root.matrixWorld.clone().invert();
  const target = want.clone();
  poseFingers(rig, side, fingers, touch);
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
function resolveHand(
  rig: VrmRig,
  side: Side,
  hand: HandSpec,
  fingers: Fingers,
  /** Dedos de la otra mano si está signando (y ya posada); null si está en reposo. */
  otherFingers: Fingers | null,
  head?: Vec3,
  touch?: ThumbTouch,
): HandSpec {
  const { contact, ...rest } = hand;
  const L = rig.armLen;
  // Tocar la otra mano solo tiene sentido si la otra mano está en el signo.
  if (!contact || (isOtherHand(contact.at) && !otherFingers)) {
    const minFwd = rig.faceFwd + 0.12 * L;
    const fwd = Math.max(Math.max(0.55 * L, minFwd) + hand.z * 0.9 * L, minFwd);
    return { ...rest, z: (fwd / L - 0.55) / 0.9 };
  }
  const other = otherFingers ?? RELAXED;
  const oriented = { ...rest, ...contactOrientation(rig, side, contact, hand, other, head) };
  const goal = signingGoal(rig, side, oriented);
  const free = goal.target.clone();
  const reached = reachContact(rig, side, goal, fingers, contact, other, head, touch);
  return { ...oriented, ...toSigningSpace(rig, side, free.lerp(reached, contact.weight ?? 1)) };
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
  otherFingers: Fingers,
  head?: Vec3,
): Pick<HandSpec, "palmDir" | "pointDir"> {
  // Normal de lo tocado, en espacio del signante (x su derecha, y arriba, z adelante).
  const m = touchedSurface(rig, side, c, otherFingers, head).n;
  const n = new THREE.Vector3(m.dot(rig.right), m.dot(rig.up), m.dot(rig.forward)).normalize();
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
    keyframes: clip.keyframes.map((kf) => {
      // La mano pasiva primero: la dominante puede tocarla, y para eso tiene que estar posada.
      const fingers2 = kf.fingers2 ?? kf.fingers;
      const touch2 = kf.fingers2 ? kf.thumbTouch2 : kf.thumbTouch;
      const hand2 = kf.hand2 && resolveHand(rig, "Left", kf.hand2, fingers2, null, kf.head, touch2);
      if (hand2) {
        poseArm(rig, "Left", signingGoal(rig, "Left", hand2));
        poseFingers(rig, "Left", fingers2, touch2);
      }
      const hand = resolveHand(rig, "Right", kf.hand, kf.fingers, hand2 ? fingers2 : null, kf.head, kf.thumbTouch);
      return { ...kf, hand, hand2 };
    }),
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
  poseHead(rig, kf.head);
  setExpressions(rig, kf.expr, tMs);
  poseArm(rig, "Right", signingGoal(rig, "Right", kf.hand));
  poseFingers(rig, "Right", kf.fingers, kf.thumbTouch);
  if (kf.hand2) {
    poseArm(rig, "Left", signingGoal(rig, "Left", kf.hand2));
    poseFingers(rig, "Left", kf.fingers2 ?? kf.fingers, kf.fingers2 ? kf.thumbTouch2 : kf.thumbTouch);
  } else {
    poseArm(rig, "Left", idleGoal(rig, "Left", tMs));
    poseFingers(rig, "Left", RELAXED);
  }
}

/** Reposo: brazos caídos junto al cuerpo, palmas hacia los muslos. */
export function applyVrmIdle(rig: VrmRig, tMs: number) {
  poseHead(rig, undefined);
  setExpressions(rig, undefined, tMs);
  for (const side of ["Right", "Left"] as const) {
    poseArm(rig, side, idleGoal(rig, side, tMs));
    poseFingers(rig, side, RELAXED);
  }
}

/** Huesos que anima el mapper (cuello, cabeza, brazos y dedos de los dos lados). */
const POSED: B[] = [
  B.Neck,
  B.Head,
  ...(["Right", "Left"] as const).flatMap((side) => [
    ARM[side].upper,
    ARM[side].lower,
    ARM[side].hand,
    ...FINGERS[side].flat(),
  ]),
];

export type PoseSnapshot = { bones: Map<B, THREE.Quaternion>; expr: Map<string, number> };

/** Copia de la pose actual, para fundirla con la siguiente. */
export function snapshotPose(rig: VrmRig): PoseSnapshot {
  const snap: PoseSnapshot = { bones: new Map(), expr: new Map() };
  for (const name of POSED) {
    const node = rig.vrm.humanoid.getNormalizedBoneNode(name);
    if (node) snap.bones.set(name, node.quaternion.clone());
  }
  for (const e of rig.exprNames) snap.expr.set(e, rig.vrm.expressionManager?.getValue(e) ?? 0);
  return snap;
}

/** Mezcla la pose recién aplicada con una anterior (u = 0 anterior, 1 nueva). */
export function blendFromSnapshot(rig: VrmRig, from: PoseSnapshot, u: number) {
  for (const [name, q] of from.bones) {
    const node = rig.vrm.humanoid.getNormalizedBoneNode(name);
    if (node) node.quaternion.copy(q.clone().slerp(node.quaternion, u));
  }
  const em = rig.vrm.expressionManager;
  for (const [e, w] of from.expr) {
    // El parpadeo no se funde: a medias dejaría los ojos entornados.
    if (em && e !== "blink") em.setValue(e, w + ((em.getValue(e) ?? 0) - w) * u);
  }
}
