import type { VRM } from "@pixiv/three-vrm";
import { VRMHumanBoneName as B, VRMExpression, VRMExpressionMorphTargetBind } from "@pixiv/three-vrm";
import * as THREE from "three";
import { EXPRESSIONS, type AvatarClip, type AvatarKeyframe, type Contact, type Expressions } from "@/lib/curriculum/schema";
import {
  faceSurface,
  headCenter,
  headDepth,
  isOtherHand,
  lateralToModel,
  measureBody,
  measureFace,
  surfaceFor,
  type BodyMap,
  type Cloud,
  type FaceGrid,
} from "./bodyPoints";
import { HAND_OUTLINE_WIDTH } from "./handOutline";
import { returnPath, sampleClip, type LoopingClip } from "./interpolate";
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
/** El pulgar de una mano en un keyframe: la pinza que cierra y dónde tiene la yema. */
type Thumb = { touch?: ThumbTouch; tip?: Vec3 };

/** El pulgar de cada mano del keyframe (la izquierda sin dedos propios copia los de la derecha). */
function thumbOf(kf: AvatarKeyframe, side: Side): Thumb {
  return side === "Left" && kf.fingers2
    ? { touch: kf.thumbTouch2, tip: kf.thumbTip2 }
    : { touch: kf.thumbTouch, tip: kf.thumbTip };
}

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
  /** Radio de un dedo y media palma de grosor, medidos en la malla, en palmas (muñeca→nudillo del corazón). */
  handShape: { finger: number; palm: number };
  /** Lo más lejos de la muñeca que llega la mano (la punta de un dedo estirado), en el modelo. */
  handReach: number;
  /** Expresión del modelo (y peso máximo) para cada gesto de la cara que puede hacer. */
  expressions: Partial<Record<keyof Expressions, [string, number]>>;
  /** Todas las expresiones que toca el mapper, parpadeo incluido. */
  exprNames: string[];
  /** Clips con los contactos ya resueltos para este modelo. */
  resolved: WeakMap<AvatarClip, LoopingClip>;
  /** Lo que ocupan las manos en cada clip (ver signBounds). */
  bounds: WeakMap<AvatarClip, THREE.Box3>;
  /**
   * Mientras se resuelve un clip, los dedos ya posados (sus rotaciones) por forma de mano:
   * no dependen del brazo, y se posan cientos de veces con los mismos valores.
   */
  fingerMemo?: Map<string, THREE.Quaternion[]>;
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
  const wristR = must(ARM.Right.hand);
  const handReach = Math.max(
    ...R.fingers.map((f) => pos(f.bones[2])?.addScaledVector(f.tipDir, f.tipLen).distanceTo(wristR) ?? 0),
  );
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
    handShape: measureHandShape(vrm),
    handReach,
    ...faceExpressions(vrm),
    resolved: new WeakMap(),
    bounds: new WeakMap(),
  };
}

/**
 * Cuánto más grandes que las del modelo se ven sus manos. En un modelo anime son pequeñas
 * para el cuerpo y, del tamaño del reproductor, no se distinguía la forma de la mano.
 */
export const HAND_SCALE = 1.15;

/**
 * Agranda las manos del modelo (la mano y sus dedos): la real, que es la que se ve, y la
 * normalizada, con la que el mapper mide contactos y colisiones. Antes de `createVrmRig`, que
 * así mide las yemas, el alcance y el grosor de la mano ya agrandada.
 */
export function enlargeHands(vrm: VRM, scale = HAND_SCALE) {
  for (const b of [B.RightHand, B.LeftHand]) {
    vrm.humanoid.getNormalizedBoneNode(b)?.scale.multiplyScalar(scale);
    vrm.humanoid.getRawBoneNode(b)?.scale.multiplyScalar(scale);
  }
  vrm.scene.updateMatrixWorld(true);
}

/**
 * Lo que ocupan las manos durante el signo, en el mundo (yemas y muñecas), para acercar la
 * cámara lo que se pueda sin que se salgan del cuadro. Sin el principio y el final del clip,
 * cuando suben desde el reposo o vuelven a él; con una mano, sin la otra, que está en reposo.
 */
export function signBounds(rig: VrmRig, clip: AvatarClip): THREE.Box3 {
  const hit = rig.bounds.get(clip);
  if (hit) return hit.clone();
  const r = resolveClip(rig, clip);
  const kfs = r.keyframes;
  const t0 = kfs[0]!.t;
  const t1 = kfs[kfs.length - 1]!.t;
  const box = new THREE.Box3();
  // Con el cuerpo como se va a ver.
  const was = rig.vrm.scene.rotation.y;
  turnBody(rig, clip.bodyYaw ?? 0);
  for (let k = 0; k <= BOUNDS_SAMPLES; k++) {
    const t = t0 + (t1 - t0) * (BOUNDS_TRIM + ((1 - 2 * BOUNDS_TRIM) * k) / BOUNDS_SAMPLES);
    const kf = sampleClip(r, t);
    applyVrmKeyframe(rig, kf, t);
    for (const side of kf.hand2 ? (["Right", "Left"] as const) : (["Right"] as const)) {
      for (const j of handJointsWorld(rig, side)) box.expandByPoint(j);
    }
  }
  rig.vrm.scene.rotation.y = was;
  rig.vrm.scene.updateMatrixWorld(true);
  rig.bounds.set(clip, box);
  return box.clone();
}

/** Muestras del clip para medir lo que ocupa, y qué parte se deja al principio y al final. */
const BOUNDS_SAMPLES = 16;
const BOUNDS_TRIM = 0.1;

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

/**
 * Grosor de los dedos y de la palma de este modelo, midiendo en su malla la distancia de los
 * vértices a su hueso (la mediana): las dos manos se tocan y se apartan por su superficie.
 */
function measureHandShape(vrm: VRM): VrmRig["handShape"] {
  const fallback = { finger: FINGER_RADIUS, palm: PALM_HALF_THICKNESS };
  const raw = (b: B) => vrm.humanoid.getRawBoneNode(b);
  const hand = raw(B.RightHand);
  const knuckle = raw(B.RightMiddleProximal);
  if (!hand || !knuckle) return fallback;
  vrm.scene.updateMatrixWorld(true);
  const at = (n: THREE.Object3D) => n.getWorldPosition(new THREE.Vector3());
  const palmLen = at(knuckle).distanceTo(at(hand));
  const segments: [THREE.Object3D, THREE.Object3D][] = (
    [
      [B.RightIndexIntermediate, B.RightIndexDistal],
      [B.RightMiddleIntermediate, B.RightMiddleDistal],
      [B.RightRingIntermediate, B.RightRingDistal],
      [B.RightLittleIntermediate, B.RightLittleDistal],
    ] as [B, B][]
  ).flatMap(([a, b]) => {
    const na = raw(a);
    const nb = raw(b);
    return na && nb ? [[na, nb] as [THREE.Object3D, THREE.Object3D]] : [];
  });
  const fingerD: number[] = [];
  const palmD: number[] = [];
  const index = raw(B.RightIndexProximal);
  const little = raw(B.RightLittleProximal);
  const palmN = index && little
    ? at(index).sub(at(hand)).cross(at(little).sub(at(hand))).normalize()
    : null;
  const v = new THREE.Vector3();
  vrm.scene.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const pos = mesh.geometry.getAttribute("position");
    const si = mesh.geometry.getAttribute("skinIndex");
    const sw = mesh.geometry.getAttribute("skinWeight");
    if (!pos || !si || !sw) return;
    const bones = mesh.skeleton.bones;
    for (let i = 0; i < pos.count; i++) {
      let main = -1;
      let w = 0;
      for (let k = 0; k < 4; k++) {
        if (sw.getComponent(i, k) > w) {
          w = sw.getComponent(i, k);
          main = si.getComponent(i, k);
        }
      }
      const bone = bones[main];
      if (!bone) continue;
      const seg = segments.find(([a]) => a === bone);
      if (!seg && !(bone === hand && palmN)) continue;
      v.fromBufferAttribute(pos, i);
      mesh.applyBoneTransform(i, v);
      v.applyMatrix4(mesh.matrixWorld);
      if (seg) {
        const a = at(seg[0]);
        const ab = at(seg[1]).sub(a);
        const t = THREE.MathUtils.clamp(v.clone().sub(a).dot(ab) / Math.max(1e-12, ab.lengthSq()), 0, 1);
        fingerD.push(v.distanceTo(a.addScaledVector(ab, t)));
      } else {
        palmD.push(Math.abs(v.clone().sub(at(hand)).dot(palmN!)));
      }
    }
  });
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1]!;
  return {
    finger: fingerD.length > 20 && palmLen > 0 ? median(fingerD) / palmLen : fallback.finger,
    palm: palmD.length > 10 && palmLen > 0 ? median(palmD) / palmLen : fallback.palm,
  };
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
  const tri: number[] = [];
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
    const base = r.length;
    const index = mesh.geometry.getIndex();
    const corners = index ? index.count : position.count;
    for (let k = 0; k + 2 < corners; k += 3) {
      for (let c = 0; c < 3; c++) tri.push(base + (index ? index.getX(k + c) : k + c));
    }
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
    tri: Uint32Array.from(tri),
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

/** Articulaciones de la palma en la numeración de MediaPipe (muñeca, base del pulgar, nudillos, centro). */
const PALM_JOINTS = new Set([0, 1, 5, 9, 13, 17, 21]);
/** Media palma de grosor y radio de un dedo, en palmas (muñeca→nudillo del corazón), si no se pueden medir en la malla. */
const PALM_HALF_THICKNESS = 0.2;
const FINGER_RADIUS = 0.1;

/**
 * Articulación `k` de MediaPipe en la mano del modelo, en el mundo: 0 la muñeca, 1-4 el
 * pulgar (base, nudillo, falange y punta), 5-20 los otros dedos de cuatro en cuatro, y 21 el
 * centro de la palma.
 */
function handJointWorld(rig: VrmRig, side: Side, k: number): THREE.Vector3 {
  const h = rig.vrm.humanoid;
  const wrist = h.getNormalizedBoneNode(ARM[side].hand)!.getWorldPosition(new THREE.Vector3());
  if (k === 0) return wrist;
  if (k === 21) {
    return [0, 5, 9, 13, 17]
      .reduce((acc, j) => acc.add(handJointWorld(rig, side, j)), new THREE.Vector3())
      .multiplyScalar(1 / 5);
  }
  const finger = Math.floor((k - 1) / 4);
  const joint = (k - 1) % 4;
  if (joint === 3) return fingerTipWorld(rig, side, finger);
  return h.getNormalizedBoneNode(rig.arms[side].fingers[finger]!.bones[joint])?.getWorldPosition(new THREE.Vector3()) ?? wrist;
}

/**
 * Las 21 articulaciones de MediaPipe (ver `handJointWorld`) de una vez, en el mundo: se
 * actualiza la mano una sola vez y se leen sus matrices.
 */
function handJointsWorld(rig: VrmRig, side: Side): THREE.Vector3[] {
  const h = rig.vrm.humanoid;
  const hand = h.getNormalizedBoneNode(ARM[side].hand)!;
  hand.updateWorldMatrix(true, true);
  const at = (n: THREE.Object3D) => new THREE.Vector3().setFromMatrixPosition(n.matrixWorld);
  const wrist = at(hand);
  const out = [wrist];
  for (const f of rig.arms[side].fingers) {
    const nodes = f.bones.map((b) => h.getNormalizedBoneNode(b));
    for (const n of nodes) out.push(n ? at(n) : wrist.clone());
    const distal = nodes[2];
    out.push(distal ? at(distal).addScaledVector(f.tipDir.clone().transformDirection(distal.matrixWorld), f.tipLen) : wrist.clone());
  }
  return out;
}

/** Marco de la mano posada, en el modelo: hacia los dedos, hacia el índice y hacia la palma. */
function handFrame(rig: VrmRig, side: Side, toModel: THREE.Matrix4) {
  const joint = (k: number) => handJointWorld(rig, side, k).applyMatrix4(toModel);
  const wrist = joint(0);
  const knuckle = joint(9);
  const P = knuckle.clone().sub(wrist).normalize();
  const N = perp(palmFrame(rig, side, toModel).normal, P, rig.forward);
  const A = perp(perp(joint(5).sub(joint(17)), P, rig.right), N, rig.right);
  return { P, A, N, len: Math.max(1e-6, knuckle.distanceTo(wrist)), joint };
}

/** Entre las dos puntas que se tocan queda el grosor de los dedos (en palmas del modelo). */
const PINCH_GAP = 0.18;

const WP = new THREE.Vector3();
const WS = new THREE.Vector3();

/** Giro en el mundo a partir de la matriz ya calculada (sin subir por toda la cadena). */
function worldQuat(n: THREE.Object3D): THREE.Quaternion {
  const q = new THREE.Quaternion();
  n.matrixWorld.decompose(WP, q, WS);
  return q;
}

/** Como `fingerTipWorld`, con las matrices del mundo ya al día (se llama miles de veces). */
function fingerTipNow(rig: VrmRig, side: Side, i: number): THREE.Vector3 {
  const f = rig.arms[side].fingers[i]!;
  const distal = rig.vrm.humanoid.getNormalizedBoneNode(f.bones[2]);
  if (!distal) return new THREE.Vector3().setFromMatrixPosition(rig.vrm.humanoid.getNormalizedBoneNode(ARM[side].hand)!.matrixWorld);
  return new THREE.Vector3().setFromMatrixPosition(distal.matrixWorld).addScaledVector(f.tipDir.clone().applyQuaternion(worldQuat(distal)), f.tipLen);
}

/**
 * Un paso de CCD: gira el hueso `n` sobre su articulación para acercar `tip()` a `want`. Con
 * `hinge` (eje en el espacio del modelo) solo gira en esa bisagra, como un dedo. Las matrices
 * del mundo de la cadena tienen que estar al día, y así las deja.
 */
function ccdStep(n: THREE.Object3D, tip: () => THREE.Vector3, want: THREE.Vector3, hinge?: THREE.Vector3) {
  const pivot = new THREE.Vector3().setFromMatrixPosition(n.matrixWorld);
  const parentQ = worldQuat(n.parent!);
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
 * El pulgar hacia donde tenía la yema el signante: `tip` es la yema respecto a la base del
 * pulgar, en el marco de la mano (hacia los dedos, hacia el índice, hacia la palma) y en
 * largos de pulgar. Así apunta hacia donde apuntaba y se dobla lo mismo, aunque el pulgar
 * del modelo sea más largo y salga más de fuera que el de una persona. Los ángulos solos no
 * bastan: la flexión del pulgar se mide hacia la palma, y un pulgar doblado sobre ella (el 4,
 * el 9) quedaba estirado hacia fuera.
 */
function reachThumbTip(rig: VrmRig, side: Side, tip: Vec3) {
  const thumb = rig.arms[side].fingers[0]!;
  const nodes = thumb.bones.map((b) => rig.vrm.humanoid.getNormalizedBoneNode(b));
  if (!nodes.every(Boolean)) return;
  const j = handJointsWorld(rig, side);
  const P = j[9]!.clone().sub(j[0]!).normalize();
  const across = j[5]!.clone().sub(j[17]!);
  const N = perp(side === "Right" ? new THREE.Vector3().crossVectors(across, P) : new THREE.Vector3().crossVectors(P, across), P, rig.forward);
  const A = perp(perp(across, P, rig.right), N, rig.right);
  const len = j[1]!.distanceTo(j[2]!) + j[2]!.distanceTo(j[3]!) + j[3]!.distanceTo(j[4]!);
  const want = j[1]!.clone()
    .addScaledVector(P, tip[0] * len)
    .addScaledVector(A, tip[1] * len)
    .addScaledVector(N, tip[2] * len);
  const [cmc, mcp, ip] = nodes as THREE.Object3D[];
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const worldQ = (o: THREE.Object3D) => {
    const q = new THREE.Quaternion();
    o.matrixWorld.decompose(pos, q, scl);
    return q;
  };
  // La yema a partir de las matrices ya calculadas (sin subir por toda la cadena cada vez).
  const tipNow = () => {
    const q = worldQ(ip);
    return new THREE.Vector3().setFromMatrixPosition(ip.matrixWorld).addScaledVector(thumb.tipDir.clone().applyQuaternion(q), thumb.tipLen);
  };
  const base = new THREE.Vector3().setFromMatrixPosition(cmc.matrixWorld);
  // Primero la flexión, repartida a partes iguales entre las dos articulaciones del pulgar y
  // hacia el objetivo, hasta que de la base a la yema haya lo que hay hasta él; luego se
  // apunta todo el pulgar desde la base. Un CCD lo enroscaba doblando de más la última.
  const need = base.distanceTo(want);
  const axis = new THREE.Vector3().crossVectors(tipNow().sub(base), want.clone().sub(base));
  if (axis.lengthSq() > 1e-12) {
    axis.normalize();
    const rest = [mcp.quaternion.clone(), ip.quaternion.clone()];
    const cmcQ = worldQ(cmc);
    const turn = (n: THREE.Object3D, parentQ: THREE.Quaternion, a: number) =>
      n.quaternion.premultiply(parentQ.clone().invert().multiply(new THREE.Quaternion().setFromAxisAngle(axis, a)).multiply(parentQ));
    const bend = (a: number) => {
      mcp.quaternion.copy(rest[0]!);
      ip.quaternion.copy(rest[1]!);
      turn(mcp, cmcQ, a);
      mcp.updateWorldMatrix(false, false);
      turn(ip, worldQ(mcp), a);
      ip.updateWorldMatrix(false, false);
      return tipNow().distanceTo(base);
    };
    // La cuerda frente al ángulo es suave y monótona en este tramo: secante, con los extremos
    // de tope.
    let a0 = 0;
    let f0 = bend(a0) - need;
    let a1 = f0 > 0 ? 0.3 : -0.3;
    let f1 = bend(a1) - need;
    for (let k = 0; k < 6 && Math.abs(f1) > 0.005 * len && f1 !== f0; k++) {
      const a2 = THREE.MathUtils.clamp(a1 - (f1 * (a1 - a0)) / (f1 - f0), -THUMB_UNBEND, THUMB_BEND);
      a0 = a1;
      f0 = f1;
      a1 = a2;
      f1 = bend(a1) - need;
    }
  }
  cmc.updateWorldMatrix(false, true);
  ccdStep(cmc, () => tipNow(), want);
}

/** Lo que se deja estirar y doblar cada articulación del pulgar al llevar la yema a su sitio (rad). */
const THUMB_UNBEND = 0.5;
const THUMB_BEND = 1.4;

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
  const tip = (i: number) => () => fingerTipNow(rig, side, i);
  const touched = [1, 2, 3, 4].filter((i) => touch[i - 1]! > 0.02);
  const total = touched.reduce((a, i) => a + touch[i - 1]!, 0);
  const centroid = () =>
    touched.reduce((acc, i) => acc.addScaledVector(fingerTipNow(rig, side, i), touch[i - 1]! / total), new THREE.Vector3());
  // Hasta dónde se cierra: el grosor de los dedos entre las puntas, o solo parte del camino.
  const aim = (from: THREE.Vector3, to: THREE.Vector3, w: number) => {
    const d = from.distanceTo(to);
    const end = Math.max(PINCH_GAP * palmLen, d - (d - PINCH_GAP * palmLen) * w);
    return to.clone().add(from.clone().sub(to).setLength(Math.min(d, end)));
  };
  for (let round = 0; round < 4; round++) {
    const thumbWant = aim(fingerTipNow(rig, side, 0), centroid(), strength);
    for (let it = 0; it < 4; it++) {
      for (const b of [...fingers[0]!.bones].reverse()) ccdStep(node(b)!, tip(0), thumbWant);
    }
    for (const i of touched) {
      const f = fingers[i]!;
      const want = aim(fingerTipNow(rig, side, i), fingerTipNow(rig, side, 0), touch[i - 1]!);
      for (let it = 0; it < 3; it++) {
        for (const b of [...f.bones].reverse()) ccdStep(node(b)!, tip(i), want, f.curlAxis);
      }
    }
    if (fingerTipNow(rig, side, 0).distanceTo(centroid()) < (PINCH_GAP + 0.03) * palmLen) break;
  }
}

/**
 * Cuánto más se separan los dedos del corazón que en la grabación. Los de este modelo son más
 * gruesos y cortos que los de una persona: con la misma separación no queda hueco entre ellos
 * y un 4 o un 3 se veían como una mano plana. Juntos (o cruzados) quedan como están.
 */
const SPREAD_GAIN = 1.3;

/** Reparto de la flexión medida entre la falange media y la distal (el pulgar, a partes iguales). */
const MEASURED_SPLIT = { finger: [1, 0.65], thumb: [0.5, 0.5] } as const;

function poseFingers(rig: VrmRig, side: Side, fingers: Fingers, thumb?: Thumb) {
  const memo = rig.fingerMemo;
  if (!memo) return poseFingersNow(rig, side, fingers, thumb);
  const nodes = rig.arms[side].fingers.flatMap((f) => f.bones.map((b) => rig.vrm.humanoid.getNormalizedBoneNode(b)));
  const key = JSON.stringify([side, fingers, thumb?.touch, thumb?.tip]);
  const hit = memo.get(key);
  if (hit) {
    nodes.forEach((n, k) => n?.quaternion.copy(hit[k]!));
    return;
  }
  poseFingersNow(rig, side, fingers, thumb);
  if (memo.size > 5000) memo.clear();
  memo.set(key, nodes.map((n) => n?.quaternion.clone() ?? new THREE.Quaternion()));
}

function poseFingersNow(rig: VrmRig, side: Side, fingers: Fingers, thumb?: Thumb) {
  const arm = rig.arms[side];
  const abdSign = side === "Right" ? 1 : -1;
  const middle = fingers[2]!;
  arm.fingers.forEach((finger, i) => {
    const value = fingers[i]!;
    const curlAbout = (angle: number) => new THREE.Quaternion().setFromAxisAngle(finger.curlAxis, angle);
    if (isMeasured(value)) {
      // Medido: el primer hueso gira hasta el azimut y la elevación grabados (en el marco de
      // esta mano) y los otros dos doblan lo que dobló el dedo.
      const [az0, el, bend] = value;
      let az = az0;
      // Separados del corazón hacia su lado, algo más que el signante (ver SPREAD_GAIN).
      if (i !== 0 && i !== 2 && isMeasured(middle) && (az0 - middle[0]) * (i === 1 ? 1 : -1) > 0) {
        az = middle[0] + (az0 - middle[0]) * SPREAD_GAIN;
      }
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
  if (thumb?.tip) reachThumbTip(rig, side, thumb.tip);
  keepThumbOut(rig, side, thumb?.touch);
  closePinch(rig, side, thumb?.touch);
}

/** Lo que el pulgar se puede meter en la palma o en un dedo sin que se note (en palmas). */
const THUMB_SINK = 0.03;

/**
 * El pulgar fuera de la palma y de los dedos que no pinza: el del signante va pegado a su
 * palma, y en este modelo, de mano más gruesa, ese mismo sitio queda dentro. Se gira todo el
 * pulgar desde su base lo justo para sacar la falange que más se mete, unas pocas veces.
 */
function keepThumbOut(rig: VrmRig, side: Side, touch: ThumbTouch | undefined) {
  const cmc = rig.vrm.humanoid.getNormalizedBoneNode(rig.arms[side].fingers[0]!.bones[0]);
  if (!cmc) return;
  const closest = { s: 0, diff: new THREE.Vector3() };
  for (let it = 0; it < 4; it++) {
    const { caps } = handCapsules(rig, side);
    const len = caps[1]!.a.distanceTo(caps[1]!.b);
    let worst = THUMB_SINK * len;
    let move: { at: THREE.Vector3; to: THREE.Vector3 } | null = null;
    // Cápsulas: 0-3 palma, 4-6 pulgar (de la base a la yema), 7-18 los otros dedos.
    for (const t of [5, 6]) {
      const ct = caps[t]!;
      for (let k = 0; k < caps.length; k++) {
        if (k >= 4 && k <= 6) continue;
        if (k > 6 && (touch?.[Math.floor((k - 7) / 3)] ?? 0) > 0.3) continue;
        const c = caps[k]!;
        const d = segmentDistance(ct.a, ct.b, c.a, c.b, undefined, closest);
        const over = ct.r + c.r - d;
        if (over <= worst || d < 1e-9) continue;
        worst = over;
        const at = ct.a.clone().lerp(ct.b, closest.s);
        move = { at, to: at.clone().addScaledVector(closest.diff, over / d) };
      }
    }
    if (!move) return;
    const { at, to } = move;
    ccdStep(cmc, () => at.clone(), to);
  }
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

/**
 * Altura del currículo → altura en el modelo: por encima de la boca, en su cara (ver
 * Y_PER_FACE); entre el pecho y la boca, a la misma fracción de ese tramo; y por debajo del
 * pecho, en brazos, con lo que mide ese tramo en una persona (CHEST_TO_MOUTH).
 */
function heightToModel(rig: VrmRig, y: number): number {
  const per = (y - Y_CHEST) / (Y_MOUTH - Y_CHEST);
  if (y <= Y_CHEST) return rig.chestY + per * CHEST_TO_MOUTH * rig.armLen;
  if (y <= Y_MOUTH) return rig.chestY + per * (rig.mouthY - rig.chestY);
  return rig.mouthY + ((y - Y_MOUTH) / Y_PER_FACE) * Math.max(1e-3, rig.eyes.y - rig.mouthY);
}

function heightFromModel(rig: VrmRig, h: number): number {
  if (h <= rig.chestY) return Y_CHEST + ((Y_MOUTH - Y_CHEST) * (h - rig.chestY)) / (CHEST_TO_MOUTH * rig.armLen);
  if (h <= rig.mouthY) return Y_CHEST + ((Y_MOUTH - Y_CHEST) * (h - rig.chestY)) / (rig.mouthY - rig.chestY);
  return Y_MOUTH + (Y_PER_FACE * (h - rig.mouthY)) / Math.max(1e-3, rig.eyes.y - rig.mouthY);
}

/**
 * Del pecho a la boca en una persona, en brazos (mediana de los signantes del DILSE; del 10 al
 * 90 %, de 0,41 a 0,46). El modelo tiene el cuello y la cabeza más largos (0,66): medidas en
 * ese tramo, las manos a la altura de la cintura le quedaban un palmo más bajas que en el
 * vídeo (TIENDA, BAJO, SILLA), con el brazo casi estirado hacia abajo.
 */
const CHEST_TO_MOUTH = 0.435;

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
    // Punto exacto (grabaciones): la misma articulación en la mano del modelo y, desde ella,
    // la dirección en la que estaba la parte que toca; a esa distancia, su superficie.
    if (c.hand) {
      const [k, dp, da, dn] = c.hand;
      const f = handFrame(rig, other, toModel);
      const dir = f.P.clone().multiplyScalar(dp).addScaledVector(f.A, da).addScaledVector(f.N, dn);
      if (dir.lengthSq() < 1e-8) dir.copy(f.N);
      dir.normalize();
      const radius = (PALM_JOINTS.has(k) ? rig.handShape.palm : rig.handShape.finger) * f.len;
      return { p: f.joint(k).addScaledVector(dir, radius), n: dir };
    }
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
  thumb?: Thumb,
): THREE.Vector3 {
  const want = contactPoint(rig, side, c, otherFingers, head);
  const root = rig.vrm.humanoid.normalizedHumanBonesRoot;
  root.updateWorldMatrix(true, false);
  const toModel = root.matrixWorld.clone().invert();
  const target = want.clone();
  poseFingers(rig, side, fingers, thumb);
  for (let k = 0; k < 8; k++) {
    poseArm(rig, side, { ...goal, target });
    root.updateWorldMatrix(false, true);
    const err = want.clone().sub(handPart(rig, side, c.with ?? "tips", fingers, toModel));
    // Sin pasar de lo que llega el brazo: si el punto queda lejos, el objetivo se iría
    // alejando en cada vuelta y arrastraría el brazo hacia cualquier parte.
    target.copy(reachable(rig, side, target.add(err)));
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
  thumb?: Thumb,
): HandSpec {
  const { contact, ...recorded } = hand;
  const L = rig.armLen;
  const beside = besideFace(rig, side, recorded);
  const rest = beside.hand;
  // Tocar la otra mano solo tiene sentido si la otra mano está en el signo.
  if (!contact || (isOtherHand(contact.at) && !otherFingers)) {
    // Al lado de la cabeza (junto a la oreja) no hace falta adelantarla: no está delante de
    // la cara, y si roza la cabeza la saca `outOfHead`.
    if (beside.lateral) return rest;
    const minFwd = rig.faceFwd + 0.12 * L;
    const fwd = Math.max(Math.max(0.55 * L, minFwd) + hand.z * 0.9 * L, minFwd);
    return { ...rest, z: (fwd / L - 0.55) / 0.9 };
  }
  const other = otherFingers ?? RELAXED;
  const oriented = { ...rest, ...contactOrientation(rig, side, contact, hand, other, head) };
  return placeTouching(rig, side, oriented, contact, fingers, other, head, thumb);
}

/** La mano con esa orientación, llevada hasta el contacto (en la proporción de su peso). */
function placeTouching(
  rig: VrmRig,
  side: Side,
  oriented: HandSpec,
  contact: Contact,
  fingers: Fingers,
  other: Fingers,
  head?: Vec3,
  thumb?: Thumb,
): HandSpec {
  const goal = signingGoal(rig, side, oriented);
  const free = goal.target.clone();
  const reached = reachContact(rig, side, goal, fingers, contact, other, head, thumb);
  const w = contact.weight ?? 1;
  const off = free.sub(reached).multiplyScalar(1 - w);
  // Con la otra mano, el peso dice a cuánto de ella se quedó en la grabación: no más lejos.
  // La mano libre puede quedar a medio brazo (la profundidad de cada brazo se rehace por
  // separado), y a una fracción de eso las dos manos que casi se tocaban (POESÍA, EUFEMISMO,
  // PARA) quedaban a un palmo.
  if (isOtherHand(contact.at)) off.clampLength(0, (1 - w) * OTHER_NEAR_GAP * rig.armLen);
  return { ...oriented, ...toSigningSpace(rig, side, reached.add(off)) };
}

/**
 * Hueco (en brazos) que deja entre las manos un contacto de peso 0: lo que va de TOUCH_NEAR
 * a TOUCH_FAR en la captura, 3,5 cm, en un brazo de 55.
 */
const OTHER_NEAR_GAP = 0.064;

/**
 * La mano cerca de la cara, al mismo lado de ella que en la grabación (`faceH`: dónde tenía
 * el centro de la palma), medido en la cara del modelo: en brazos, una mano junto a la oreja
 * de una persona le quedaba delante de los ojos, porque su cara es mucho más ancha. Del todo
 * de la barbilla para arriba, nada a la altura del pecho; y cada vez menos cuanto más lejos
 * a un lado. `lateral`: la mano queda al lado de la cabeza y no delante.
 */
function besideFace(rig: VrmRig, side: Side, hand: HandSpec): { hand: HandSpec; lateral: boolean } {
  if (hand.faceH === undefined) return { hand, lateral: false };
  const v = (hand.y - Y_MOUTH) / Y_PER_FACE - 1;
  const w = THREE.MathUtils.clamp((v + 3) / 1.5, 0, 1) * THREE.MathUtils.clamp((FACE_H_FAR - Math.abs(hand.faceH)) / 3, 0, 1);
  if (w <= 0) return { hand, lateral: false };
  // Dónde queda ahora el centro de la palma y dónde tendría que estar, a lo ancho.
  poseArm(rig, side, signingGoal(rig, side, hand));
  const j = handJointsWorld(rig, side);
  const root = rig.vrm.humanoid.normalizedHumanBonesRoot;
  const toModel = root.matrixWorld.clone().invert();
  const palm = [0, 5, 9, 13, 17]
    .reduce((a, k) => a.add(j[k]!), new THREE.Vector3())
    .multiplyScalar(1 / 5)
    .applyMatrix4(toModel);
  const now = palm.sub(rig.eyes).dot(rig.right);
  const want = lateralToModel(rig.face, hand.faceH, rig.armLen);
  const outward = side === "Right" ? 1 : -1;
  const shift = w * (want - now);
  return {
    hand: { ...hand, x: hand.x + (shift * outward) / (1.2 * rig.armLen) },
    lateral: w > 0.5 && Math.abs(want) > rig.face.halfWidth,
  };
}

/** Más allá de esto a un lado de la cara (coordenada h), la muñeca ya no se coloca respecto a ella. */
const FACE_H_FAR = 10;

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
export function resolveClip(rig: VrmRig, clip: AvatarClip): LoopingClip {
  const cached = rig.resolved.get(clip);
  if (cached) return cached;
  rig.fingerMemo = new Map();
  try {
    return resolveClipNow(rig, clip);
  } finally {
    rig.fingerMemo = undefined;
  }
}

function resolveClipNow(rig: VrmRig, input: AvatarClip): LoopingClip {
  const clip = facingCamera(input);
  const resolved: AvatarClip = {
    ...clip,
    keyframes: centeredHands(rig, clip).map((kf) => {
      // La mano pasiva primero: la dominante puede tocarla, y para eso tiene que estar posada.
      const fingers2 = kf.fingers2 ?? kf.fingers;
      const thumb2 = thumbOf(kf, "Left");
      const thumb = thumbOf(kf, "Right");
      const hand2 =
        kf.hand2 &&
        outOfHead(rig, "Left", resolveHand(rig, "Left", kf.hand2, fingers2, null, kf.head, thumb2), kf.hand2.contact, fingers2, thumb2, kf.head, null);
      if (hand2) {
        poseArm(rig, "Left", signingGoal(rig, "Left", hand2));
        poseFingers(rig, "Left", fingers2, thumb2);
      }
      const resolved = resolveHand(rig, "Right", kf.hand, kf.fingers, hand2 ? fingers2 : null, kf.head, thumb);
      const hand = outOfHead(rig, "Right", resolved, kf.hand.contact, kf.fingers, thumb, kf.head, hand2 ? fingers2 : null);
      return { ...kf, hand, hand2 };
    }),
  };
  const clear: LoopingClip = keepOutOfHead(rig, keepHandsApart(rig, resolved));
  // Al repetirse, la vuelta al inicio tampoco puede llevar una mano a través de la otra
  // (VIDEOLLAMADA, METRO: acaban con la dominante al otro lado de la pasiva).
  const back = returnPath(clear, APART_STEP_MS);
  const apart = keepHandsApart(rig, back);
  if (apart !== back) clear.back = apart;
  rig.resolved.set(input, clear);
  return clear;
}

/**
 * Con el cuerpo girado (`bodyYaw`, ver turnBody), la cabeza gira lo mismo al revés: el
 * signante de las grabaciones de tres cuartos sigue mirando a la cámara, y su giro de cabeza
 * se mide respecto a como la tiene en reposo, ya de cara a ella.
 */
function facingCamera(clip: AvatarClip): AvatarClip {
  const yaw = clip.bodyYaw;
  if (!yaw) return clip;
  return {
    ...clip,
    keyframes: clip.keyframes.map((kf) => ({ ...kf, head: [(kf.head?.[0] ?? 0) - yaw, kf.head?.[1] ?? 0, kf.head?.[2] ?? 0] })),
  };
}

/**
 * El cuerpo girado `yaw` radianes hacia su derecha respecto a la cámara, como el signante en
 * las grabaciones de tres cuartos (AvatarClip.bodyYaw). Gira el modelo entero: todo lo de
 * aquí va en su espacio y gira con él.
 */
export function turnBody(rig: VrmRig, yaw: number) {
  rig.vrm.scene.rotation.y = rig.facingY - yaw;
  rig.vrm.scene.updateMatrixWorld(true);
}

/**
 * `x` de cada mano en el modelo, contando con el centro del cuerpo. En la grabación se mide
 * desde el hombro de su lado, y este modelo tiene los hombros más separados que una persona
 * (en brazos: 0,42 frente a 0,35): dos manos que se juntaban o se cruzaban delante del pecho
 * (AMIGO, NOMBRE, los números cruzados) le quedaban a casi una palma de distancia. Junto al
 * centro se conserva lo que distaba de él; a la altura del hombro y más afuera, del hombro,
 * y entre medias, a partes.
 */
function centeredHands(rig: VrmRig, clip: AvatarClip): AvatarKeyframe[] {
  const human = clip.shoulderX;
  if (!human) return clip.keyframes;
  const model = rig.arms.Right.shoulder.distanceTo(rig.arms.Left.shoulder) / (2 * rig.armLen);
  const x = (hx: number) => {
    const fromCenter = human + 1.2 * hx;
    const toShoulder = THREE.MathUtils.clamp(fromCenter / human, 0, 1);
    return (fromCenter + (model - human) * toShoulder - model) / 1.2;
  };
  return clip.keyframes.map((kf) => ({
    ...kf,
    hand: { ...kf.hand, x: x(kf.hand.x) },
    ...(kf.hand2 ? { hand2: { ...kf.hand2, x: x(kf.hand2.x) } } : {}),
  }));
}

// --- Las dos manos sin atravesarse ---------------------------------------------

type Capsule = { a: THREE.Vector3; b: THREE.Vector3; r: number; mid: THREE.Vector3; reach: number };

const capsule = (a: THREE.Vector3, b: THREE.Vector3, r: number): Capsule => ({
  a,
  b,
  r,
  mid: a.clone().add(b).multiplyScalar(0.5),
  reach: a.distanceTo(b) / 2 + r,
});

/**
 * La mano posada como cápsulas, en el mundo: la palma (de la muñeca a cada nudillo, con su
 * grosor) y cada falange (con el de un dedo; la última acaba en la yema, no un radio más
 * allá, que es donde se apoya al tocar). Basta para saber si una mano se mete en la otra.
 */
function handCapsules(rig: VrmRig, side: Side): { caps: Capsule[]; center: THREE.Vector3; reach: number } {
  const j = handJointsWorld(rig, side);
  const len = j[9]!.distanceTo(j[0]!);
  const palm = rig.handShape.palm * len;
  const r = rig.handShape.finger * len;
  const caps = [5, 9, 13, 17].map((mcp) => capsule(j[0]!, j[mcp]!, palm));
  for (let finger = 0; finger < 5; finger++) {
    const base = 1 + 4 * finger;
    for (let s = 0; s < 3; s++) {
      const a = j[base + s]!;
      const b = j[base + s + 1]!;
      const l = a.distanceTo(b);
      caps.push(capsule(a, s < 2 || l < 1e-9 ? b : a.clone().lerp(b, Math.max(0, l - r) / l), r));
    }
  }
  const center = [0, 5, 9, 13, 17].reduce((acc, k) => acc.add(j[k]!), new THREE.Vector3()).multiplyScalar(1 / 5);
  const reach = Math.max(...caps.map((c) => c.mid.distanceTo(center) + c.reach));
  return { caps, center, reach };
}

const D1 = new THREE.Vector3();
const D2 = new THREE.Vector3();
const R = new THREE.Vector3();

/**
 * Distancia entre dos segmentos, el primero desplazado `shift` (Ericson, «Real-Time
 * Collision Detection»). Sin crear vectores: se llama miles de veces al resolver un clip.
 */
export function segmentDistance(
  p1: THREE.Vector3,
  q1: THREE.Vector3,
  p2: THREE.Vector3,
  q2: THREE.Vector3,
  shift?: THREE.Vector3,
  closest?: { s: number; diff: THREE.Vector3 },
): number {
  D1.subVectors(q1, p1);
  D2.subVectors(q2, p2);
  R.subVectors(p1, p2);
  if (shift) R.add(shift);
  const a = D1.dot(D1);
  const e = D2.dot(D2);
  const f = D2.dot(R);
  let s = 0;
  let t = 0;
  if (a < 1e-12 && e < 1e-12) return R.length();
  if (a < 1e-12) {
    t = THREE.MathUtils.clamp(f / e, 0, 1);
  } else {
    const c = D1.dot(R);
    if (e < 1e-12) {
      s = THREE.MathUtils.clamp(-c / a, 0, 1);
    } else {
      const b = D1.dot(D2);
      const denom = a * e - b * b;
      s = denom > 1e-12 ? THREE.MathUtils.clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = THREE.MathUtils.clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = THREE.MathUtils.clamp((b - c) / a, 0, 1);
      }
    }
  }
  // (p1 + shift + s·d1) − (p2 + t·d2)
  R.addScaledVector(D1, s).addScaledVector(D2, -t);
  if (closest) {
    closest.s = s;
    closest.diff.copy(R);
  }
  return R.length();
}

/**
 * Las dos manos como cápsulas y cuánto se mete la derecha, desplazada `shift`, en la
 * izquierda. Con `enough`, para en cuanto se meten más que eso (basta con saber que sí).
 */
function handsProbe(rig: VrmRig) {
  const right = handCapsules(rig, "Right");
  const left = handCapsules(rig, "Left");
  const mid = new THREE.Vector3();
  /** Con `slack`, lo que les falta para quedar a esa distancia (0: están al menos así de separadas). */
  const depthAt = (shift: THREE.Vector3, enough = Infinity, slack = 0): number => {
    let depth = 0;
    if (mid.copy(right.center).add(shift).distanceTo(left.center) > right.reach + left.reach + slack) return depth;
    for (const cr of right.caps) {
      mid.copy(cr.mid).add(shift);
      for (const cl of left.caps) {
        const room = cr.r + cl.r + slack;
        if (room <= depth || mid.distanceTo(cl.mid) > cr.reach + cl.reach + slack) continue;
        depth = Math.max(depth, room - segmentDistance(cr.a, cr.b, cl.a, cl.b, shift));
        if (depth > enough) return depth;
      }
    }
    return depth;
  };
  return { right, left, depthAt };
}

/** Normal de la palma (el signo no importa) a partir de las cápsulas de la palma. */
function palmNormal(caps: Capsule[]): THREE.Vector3 {
  const wrist = caps[0]!.a;
  return new THREE.Vector3().crossVectors(caps[0]!.b.clone().sub(wrist), caps[3]!.b.clone().sub(wrist)).normalize();
}

/**
 * Desplazamientos de la mano derecha respecto a la izquierda (en el modelo) que las sacan de
 * estar metidas una en otra en la pose del keyframe; sin nada que sacar, solo el nulo. Con
 * las manos muy metidas (cruzadas en X en los números, un puño hundido en los dedos de la
 * otra) las normales de cada par de cápsulas se contradicen, así que se prueba en unas
 * cuantas direcciones (las normales de las palmas, los ejes del cuerpo, de un centro de la
 * palma al otro) y se busca por bisección cuánto hace falta en cada una, contando con que
 * un brazo casi estirado no llega más lejos.
 */
function apartOptions(rig: VrmRig, kf: AvatarKeyframe & { hand2: HandSpec }, tol: number, max: number): THREE.Vector3[] {
  const probe = handsProbe(rig);
  const root = rig.vrm.humanoid.normalizedHumanBonesRoot;
  const toWorld = new THREE.Matrix3().setFromMatrix4(root.matrixWorld);
  const toModel = toWorld.clone().invert();
  const zero = new THREE.Vector3();
  const view = rig.forward.clone().applyMatrix3(toWorld).normalize();
  // Entre las dos, además, el contorno: pegadas, el de la mano de atrás asoma por los dedos de
  // la de delante y de frente se ven los dedos de las dos mezclados.
  const crossings = crossingsOf(probe, view, HAND_OUTLINE_WIDTH * rig.armLen);
  // Lo que les falta en los cruces con la derecha por delante (+1) o por detrás (−1).
  const layer = (rel: THREE.Vector3, order: number) =>
    crossings.reduce((m, c) => Math.max(m, c.room - order * (c.dz + rel.dot(view))), 0);
  // Si no se tocan, también cuando la dominante queda detrás (ver BEHIND_COST).
  const touching = !!kf.hand.contact && isOtherHand(kf.hand.contact.at);
  const tangled = crossings.length > 0 && (touching ? Math.min(layer(zero, 1), layer(zero, -1)) : layer(zero, 1)) > tol;
  if (!tangled && probe.depthAt(zero) <= tol) return [zero];
  const hands = shiftedTargets(rig, kf);
  const depth = (shift: THREE.Vector3, order = 0) => {
    const { r, l, r0, l0 } = hands(shift);
    const rel = r.sub(r0).sub(l.sub(l0)).applyMatrix3(toWorld);
    return Math.max(probe.depthAt(rel, tol), order ? layer(rel, order) : 0);
  };
  const along = (dir: THREE.Vector3, order = 0, most = max): THREE.Vector3 | null => {
    if (depth(dir.clone().multiplyScalar(most), order) > tol) return null;
    let lo = 0;
    let hi = most;
    for (let k = 0; k < 7; k++) {
      const m = (lo + hi) / 2;
      if (depth(dir.clone().multiplyScalar(m), order) > tol) lo = m;
      else hi = m;
    }
    // Un poco más de lo justo: la bisección se queda en el borde.
    return dir.clone().multiplyScalar(1.05 * hi);
  };
  // Con los dedos cruzados, una mano entera por delante de la otra y apartándolas solo hacia
  // el que mira: de frente la figura (la X, el tejado) queda igual.
  const layered: ApartOption[] = [];
  if (tangled) {
    const fwd = rig.forward.clone().normalize();
    for (const [dir, order] of [[fwd, 1], [fwd.clone().negate(), -1]] as const) {
      // Hacia el que mira se pueden apartar más: de frente el signo no cambia.
      const v = along(dir, order, LAYER_MAX_SHIFT * rig.armLen);
      // La dominante, por delante: la pasiva suele hacer de base y la otra actúa sobre ella de
      // cara al que mira (PROGRAMA, SÍMBOLO, VOTO). Entre las dos manos la profundidad de la
      // grabación no es fiable, así que detrás solo si delante hay que apartarlas mucho más.
      if (v) layered.push(order < 0 && !touching ? Object.assign(v, { penalty: BEHIND_COST * rig.armLen }) : v);
    }
  }
  const dirs = [
    palmNormal(probe.right.caps),
    palmNormal(probe.left.caps),
    ...[rig.forward, rig.up, rig.right].map((v) => v.clone().applyMatrix3(toWorld)),
    probe.right.center.clone().sub(probe.left.center),
  ]
    .map((d) => d.applyMatrix3(toModel).normalize())
    .flatMap((d) => [d, d.clone().negate()]);
  // Las de siempre, también con los dedos cruzados (con un orden de manos que no cabe, o que
  // cambia de una muestra a otra cuando una mano pasa a través de la otra, el camino necesita
  // alternativas), pero cargando lo que dejan entrelazado.
  const out: ApartOption[] = dirs
    .map((dir) => along(dir))
    .filter((v): v is THREE.Vector3 => v !== null)
    .map((v) => {
      if (!tangled || !layered.length) return v;
      const { r, l, r0, l0 } = hands(v);
      const rel = r.sub(r0).sub(l.sub(l0)).applyMatrix3(toWorld);
      const behind = !touching && layer(rel, 1) > tol ? BEHIND_COST * rig.armLen : 0;
      return Object.assign(v, { penalty: TANGLE_COST * Math.min(layer(rel, 1), layer(rel, -1)) + behind });
    });
  const all = [...layered, ...out];
  return all.length ? all : [zero];
}

/** Un desplazamiento para apartar las manos y lo que cuesta además elegirlo (en brazos). */
type ApartOption = THREE.Vector3 & { penalty?: number };
/** Lo que cuesta dejar los dedos entrelazados, frente a apartar las manos. */
const TANGLE_COST = 4;
/**
 * Lo que cuesta, en cada instante, que la mano dominante quede detrás en un cruce (en brazos):
 * se pone delante si para eso no hay que apartarlas más que esto hacia el que mira.
 */
const BEHIND_COST = 0.5;
/** Lo más que se apartan las manos hacia el que mira para poner una delante de la otra (en brazos). */
const LAYER_MAX_SHIFT = 0.5;

/**
 * Dónde se cruzan, vistas de frente, las falanges y la palma de una mano con las de la otra
 * (una X, los números cruzados, BUENAS NOCHES): en cada cruce, cuánto está la derecha por
 * delante de la izquierda hacia el que mira (`dz`) y cuánto haría falta (`room`, los dos
 * grosores). Una persona pone una mano entera delante de la otra; si en unos cruces queda
 * delante y en otros detrás, los dedos se entrelazan como un peine y de frente no se
 * entiende la forma, aunque no se atraviesen.
 */
function crossingsOf(probe: ReturnType<typeof handsProbe>, view: THREE.Vector3, gap: number): { room: number; dz: number }[] {
  const up = new THREE.Vector3(0, 1, 0).projectOnPlane(view).normalize();
  const side = new THREE.Vector3().crossVectors(view, up);
  const flat = (p: THREE.Vector3): [number, number] => [p.dot(side), p.dot(up)];
  const out: { room: number; dz: number }[] = [];
  for (const cr of probe.right.caps) {
    const [ax, ay] = flat(cr.a);
    const [bx, by] = flat(cr.b);
    for (const cl of probe.left.caps) {
      const [cx, cy] = flat(cl.a);
      const [dx, dy] = flat(cl.b);
      // Segmentos a→b y c→d en el plano: a + s·(b − a) = c + t·(d − c).
      const den = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
      if (Math.abs(den) < 1e-12) continue;
      const s = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / den;
      const t = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / den;
      if (s < 0 || s > 1 || t < 0 || t > 1) continue;
      const dz = cr.a.clone().lerp(cr.b, s).sub(cl.a.clone().lerp(cl.b, t)).dot(view);
      out.push({ room: cr.r + cl.r + gap, dz });
    }
  }
  return out;
}

/**
 * La mano posada contra la cabeza: cuánto se mete en ella (en el modelo) si se desplaza
 * `shift` (en el mundo). Las cápsulas de la mano se llevan a la cabeza en reposo, deshaciendo
 * su giro, y se miran contra la cabeza vista de frente, de la cara al cogote.
 */
function headProbe(rig: VrmRig, side: Side) {
  const root = rig.vrm.humanoid.normalizedHumanBonesRoot;
  const headNode = rig.vrm.humanoid.getNormalizedBoneNode(B.Head);
  const { caps } = handCapsules(rig, side);
  if (!headNode) return () => 0;
  headNode.updateWorldMatrix(true, false);
  const toModel = root.matrixWorld.clone().invert();
  // Del mundo a la cabeza en reposo: a la cabeza (girada) y de ahí a donde estaba.
  const toRestHead = new THREE.Matrix4().makeTranslation(rig.head)
    .multiply(toModel.clone().multiply(headNode.matrixWorld).invert())
    .multiply(toModel);
  const points = caps.flatMap((c) => [0, 0.5, 1].map((t) => ({ p: c.a.clone().lerp(c.b, t), r: c.r })));
  const q = new THREE.Vector3();
  return (shift: THREE.Vector3, enough = Infinity): number => {
    let depth = 0;
    for (const { p, r } of points) {
      q.copy(p).add(shift).applyMatrix4(toRestHead).sub(rig.eyes);
      depth = Math.max(depth, headDepth(rig.face, [q.dot(rig.right), q.y, q.dot(rig.forward)], r));
      if (depth > enough) break;
    }
    return depth;
  };
}

/** Lo que una mano puede meterse en la cabeza sin que se note, y lo más que se aparta de ella (en brazos). */
const HEAD_OVERLAP_TOL = 0.004;
const HEAD_MAX_PUSH = 0.6;

/**
 * La mano fuera de la cabeza. El modelo tiene la cabeza mucho más grande que una persona
 * (en proporción al brazo, casi el doble): con los nudillos en la mejilla o el pulgar en la
 * frente y la orientación de la grabación, el resto de la mano quedaba dentro. Si toca la
 * cara, la mano gira sobre el punto de contacto hacia fuera, de 15 en 15°, hasta que sale:
 * el contacto se mantiene y la orientación cambia lo justo. Si no toca (o ni girada sale),
 * se saca entera lo justo (`headPush`).
 */
function outOfHead(
  rig: VrmRig,
  side: Side,
  hand: HandSpec,
  contact: Contact | undefined,
  fingers: Fingers,
  thumb: Thumb,
  head: Vec3 | undefined,
  other: Fingers | null,
): HandSpec {
  const L = rig.armLen;
  const tol = HEAD_OVERLAP_TOL * L;
  const wristOf = (h: HandSpec) => reachable(rig, side, signingGoal(rig, side, h).target);
  // Lejos de la cabeza: nada que hacer (ni que posar).
  const d = wristOf(hand).sub(rig.eyes);
  const g = rig.face;
  if (Math.abs(d.dot(rig.right)) > -g.r0 + rig.handReach || d.y < g.u0 - rig.handReach || d.y > g.topU + rig.handReach) {
    return hand;
  }
  poseHead(rig, head);
  // Con la pinza cerrada: si el pulgar toca la cara, es el que se mete.
  const inside = (h: HandSpec) => {
    poseArm(rig, side, signingGoal(rig, side, h));
    poseFingers(rig, side, fingers, thumb);
    return headProbe(rig, side);
  };
  const depthAt = inside(hand);
  if (depthAt(new THREE.Vector3(), tol) <= tol) return hand;
  const onFace = contact && (contact.face || HEAD_POINTS.has(contact.at)) && !isOtherHand(contact.at);
  const n = onFace ? touchedSurface(rig, side, contact, RELAXED, head).n.normalize() : null;

  // Girar sobre el contacto, hacia un lado o hacia el otro (con el contacto a media mano, lo
  // que sale por un lado entra por el otro): lo menos posible y, entre los giros de ese
  // ángulo que la sacan, el que menos cambia la mano vista de frente. Además de inclinarla
  // respecto a la cara, girándola sobre la vertical o de lado: hacia la cámara apenas se
  // nota, y solo con lo primero MADRE o TÍMIDO acababan con la mano en horizontal junto a la
  // mejilla (en el vídeo va vertical).
  let base = hand;
  let baseDepth = depthAt(new THREE.Vector3());
  if (onFace && n && hand.palmDir && hand.pointDir) {
    const { palmDir, pointDir } = hand;
    const at = contactPoint(rig, side, contact, RELAXED, head);
    const tilt = new THREE.Vector3().crossVectors(wristOf(hand).sub(at), n);
    const axes = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)];
    if (tilt.lengthSq() > 1e-10 * L * L) {
      tilt.normalize();
      axes.unshift(new THREE.Vector3(tilt.dot(rig.right), tilt.dot(rig.up), tilt.dot(rig.forward)));
    }
    const turn = (v: [number, number, number], q: THREE.Quaternion) =>
      new THREE.Vector3(...v).applyQuaternion(q).toArray() as [number, number, number];
    // Lo que se nota de frente: cuánto se mueven en la imagen los dedos y, menos, la palma.
    const seen = (a: [number, number, number], b: [number, number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    for (const deg of [15, 30, 45, 60]) {
      let best: { placed: HandSpec; change: number } | null = null;
      for (const axis of axes) {
        for (const sign of [1, -1]) {
          const q = new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(sign * deg));
          const oriented = { ...hand, palmDir: turn(palmDir, q), pointDir: turn(pointDir, q) };
          const placed = placeTouching(rig, side, oriented, contact, fingers, other ?? RELAXED, head, thumb);
          const dd = inside(placed)(new THREE.Vector3());
          if (dd <= tol) {
            const change = seen(pointDir, oriented.pointDir) + 0.5 * seen(palmDir, oriented.palmDir);
            if (!best || change < best.change) best = { placed, change };
          } else if (dd < baseDepth) {
            base = placed;
            baseDepth = dd;
          }
        }
      }
      if (best) return best.placed;
    }
    inside(base);
  }

  // Si ni girando sale, se saca entera.
  const push = headPush(rig, side, head);
  return push.lengthSq() > 0 ? { ...base, ...toSigningSpace(rig, side, wristOf(base).add(push)) } : base;
}

/** Lo que las manos pueden meterse una en otra sin que se note (en brazos). */
const HANDS_OVERLAP_TOL = 0.004;
/** Lo más que se aparta una mano de la otra (en brazos): más, y el signo sería otro. */
const HANDS_MAX_SHIFT = 0.25;
/** Lo que cuesta invertir el sentido del apartado de una muestra a la siguiente: casi nunca compensa (ver keepHandsApart). */
const RESIDUAL_FLIP_COST = 10;
/** Lo que puede cambiar la mano al poner el pulgar en su sitio (en brazos). */
const THUMB_SLACK = 0.06;
/** Cada cuánto (ms de clip) se mira si las manos se meten una en otra. */
const APART_STEP_MS = 1000 / 60;
/** Lo que cuesta cambiar de golpe hacia dónde se apartan, frente a apartarlas más. */
const APART_SWITCH_COST = 2;

/** Lo más cerca del objetivo que llega la muñeca (`solveArm` no estira del todo el brazo). */
function reachable(rig: VrmRig, side: Side, target: THREE.Vector3): THREE.Vector3 {
  const arm = rig.arms[side];
  const d = target.clone().sub(arm.shoulder);
  const max = 0.97 * (arm.upperLen + arm.lowerLen);
  return d.length() > max ? arm.shoulder.clone().addScaledVector(d.normalize(), max) : target;
}

/**
 * Muñecas (en el modelo) con la mano derecha desplazada `shift` respecto a la izquierda:
 * cada una la mitad, o la otra lo que no alcance.
 */
function shiftedTargets(rig: VrmRig, kf: AvatarKeyframe & { hand2: HandSpec }) {
  const r0 = reachable(rig, "Right", signingGoal(rig, "Right", kf.hand).target);
  const l0 = reachable(rig, "Left", signingGoal(rig, "Left", kf.hand2).target);
  return (shift: THREE.Vector3) => {
    const half = shift.clone().multiplyScalar(0.5);
    const r = reachable(rig, "Right", r0.clone().add(half));
    const short = half.clone().sub(r.clone().sub(r0));
    const l = reachable(rig, "Left", l0.clone().sub(half).sub(short));
    return { r, l, r0, l0 };
  };
}

/** El keyframe con la mano derecha desplazada `shift` respecto a la izquierda. */
function shiftHands(rig: VrmRig, kf: AvatarKeyframe, shift: THREE.Vector3): AvatarKeyframe {
  if (!kf.hand2 || shift.lengthSq() < 1e-12) return kf;
  const { r, l } = shiftedTargets(rig, { ...kf, hand2: kf.hand2 })(shift);
  return {
    ...kf,
    hand: { ...kf.hand, ...toSigningSpace(rig, "Right", r) },
    hand2: { ...kf.hand2, ...toSigningSpace(rig, "Left", l) },
  };
}

/**
 * El clip muestreado cada APART_STEP_MS. Si ya lo está, o más a menudo (con los keyframes que
 * añade `apartSamples`), tal cual.
 */
function sampleEvenly(clip: AvatarClip): AvatarKeyframe[] {
  const kfs = clip.keyframes;
  const t0 = kfs[0]!.t;
  const t1 = kfs[kfs.length - 1]!.t;
  const n = Math.max(2, Math.ceil((t1 - t0) / APART_STEP_MS) + 1);
  if (kfs.every((k, i) => i === 0 || k.t - kfs[i - 1]!.t <= (t1 - t0) / (n - 1) + 1e-6)) return kfs;
  return Array.from({ length: n }, (_, i) => sampleClip(clip, t0 + ((t1 - t0) * i) / (n - 1)));
}

/** Lo más que se mueve una mano respecto a la otra (o a la cabeza) de una muestra a la siguiente (en brazos). */
const APART_MAX_MOTION = 0.02;
/** En cuántas se parte como mucho el tramo entre dos muestras. */
const APART_MAX_SPLIT = 8;

/**
 * Puntos de una mano respecto a lo que no puede atravesar (la otra mano, la cabeza) en una
 * muestra, y si quedan al menos a `gap` de ello.
 */
type Nearby = { points: THREE.Vector3[]; apart: (gap: number) => boolean };

/**
 * Las muestras `even` con más entre dos donde una mano se mueve deprisa junto a lo que no
 * puede atravesar (`tracks`: en cada muestra, sus puntos respecto a eso, o null si está
 * lejos): si no, entre dos muestras se metería en ello sin que se viera. Solo si le da para
 * tocarlo: lo que se mueve es más de lo que los separa (con margen: al medirlo el pulgar no
 * se lleva a su yema, y puede quedar más cerca).
 */
function splitFast(rig: VrmRig, clip: AvatarClip, even: AvatarKeyframe[], tracks: (Nearby | null)[][]): AvatarKeyframe[] {
  const out: AvatarKeyframe[] = [];
  even.forEach((kf, i) => {
    out.push(kf);
    let parts = 1;
    for (const track of tracks) {
      const a = track[i];
      const b = track[i + 1];
      if (!a || !b) continue;
      const moved = a.points.reduce((m, p, k) => Math.max(m, p.distanceTo(b.points[k]!)), 0);
      if (a.apart(2 * moved) && b.apart(2 * moved)) continue;
      parts = Math.max(parts, Math.min(APART_MAX_SPLIT, Math.ceil(moved / (APART_MAX_MOTION * rig.armLen))));
    }
    const t1 = even[i + 1]?.t ?? kf.t;
    for (let j = 1; j < parts; j++) out.push(sampleClip(clip, kf.t + ((t1 - kf.t) * j) / parts));
  });
  return out;
}

/**
 * Las muestras de `keepHandsApart`: cada APART_STEP_MS y más seguidas donde una mano pasa
 * deprisa junto a la otra (VIDEOLLAMADA: la dominante cruza en un instante por delante de
 * la pasiva).
 */
function apartSamples(rig: VrmRig, clip: AvatarClip): AvatarKeyframe[] {
  const even = sampleEvenly(clip);
  const near = even.map((kf) => {
    if (!kf.hand2) return false;
    const { r0, l0 } = shiftedTargets(rig, { ...kf, hand2: kf.hand2 })(new THREE.Vector3());
    return r0.distanceTo(l0) < 2.3 * rig.handReach;
  });
  // Donde están cerca o lo están en la muestra de al lado: las articulaciones de cada mano
  // respecto a la muñeca de la otra.
  const track = even.map((kf, i): Nearby | null => {
    if (!kf.hand2 || !(near[i] || near[i - 1] || near[i + 1])) return null;
    poseArm(rig, "Right", signingGoal(rig, "Right", kf.hand));
    poseArm(rig, "Left", signingGoal(rig, "Left", kf.hand2));
    poseFingers(rig, "Right", kf.fingers);
    poseFingers(rig, "Left", kf.fingers2 ?? kf.fingers);
    const r = handJointsWorld(rig, "Right");
    const l = handJointsWorld(rig, "Left");
    const probe = handsProbe(rig);
    return {
      points: [...r.map((p) => p.clone().sub(l[0]!)), ...l.map((p) => p.clone().sub(r[0]!))],
      apart: (gap) => probe.depthAt(new THREE.Vector3(), 0, gap) === 0,
    };
  });
  return splitFast(rig, clip, even, [track]);
}

/**
 * Lo que dura cada muestra (hasta la mitad del camino a cada vecina), en muestras de
 * `sampleEvenly`: todas 1 si están a intervalos iguales, menos donde hay más seguidas.
 */
function spans(times: number[]): number[] {
  const n = times.length;
  if (n < 2) return times.map(() => 1);
  const even = (times[n - 1]! - times[0]!) / Math.max(1, Math.ceil((times[n - 1]! - times[0]!) / APART_STEP_MS));
  return times.map((t, k) => {
    const span = k === 0 ? times[1]! - t : k === n - 1 ? t - times[k - 1]! : (times[k + 1]! - times[k - 1]!) / 2;
    return span / even;
  });
}

/**
 * Suavizado (gaussiano de una muestra de APART_STEP_MS, contando con los tiempos: donde hay
 * muestras más seguidas no se vuelve más brusco) de los desplazamientos que hacen falta en
 * cada muestra: un cambio de lado dura unas pocas muestras. Lejos de un cambio de lado, sin
 * quedarse por debajo de lo que hace falta.
 */
function smoothShifts(need: THREE.Vector3[], times: number[]): THREE.Vector3[] {
  const reach = 3 * APART_STEP_MS + 1e-6;
  const weight = spans(times);
  const lifts: THREE.Vector3[] = [];
  const base = need.map((v, i) => {
    const acc = new THREE.Vector3();
    let wsum = 0;
    let sameWay = true;
    const add = (k: number) => {
      // Cada muestra pesa lo que dura: donde hay más seguidas no cuentan más.
      const w = Math.exp(-0.5 * ((times[k]! - times[i]!) / APART_STEP_MS) ** 2) * weight[k]!;
      acc.addScaledVector(need[k]!, w);
      wsum += w;
      sameWay &&= need[k]!.dot(v) >= 0;
    };
    for (let k = i; k >= 0 && times[i]! - times[k]! <= reach; k--) add(k);
    for (let k = i + 1; k < need.length && times[k]! - times[i]! <= reach; k++) add(k);
    acc.multiplyScalar(1 / wsum);
    const size = v.length();
    const lift = new THREE.Vector3();
    if (size > 0 && sameWay) {
      const dir = v.clone().normalize();
      const along = acc.dot(dir);
      if (along < size) lift.copy(dir).multiplyScalar(size - along);
    }
    lifts.push(lift);
    return acc;
  });
  return base.map((acc, k) => acc.add(lifts[k]!));
}

/**
 * Lo que se apartan las manos hacia el que mira (para poner una delante de la otra en un
 * cruce), sin cambiar más de `step` cada APART_STEP_MS: empieza antes del cruce y acaba
 * después, en vez de adelantar y atrasar las manos de golpe. Solo se añade: donde hacía
 * falta apartarlas, siguen apartadas lo mismo.
 */
function rampDepth(shifts: THREE.Vector3[], times: number[], view: THREE.Vector3, step: number): THREE.Vector3[] {
  const depth = shifts.map((v) => v.dot(view));
  const allowed = (i: number) => (step * (times[i]! - times[i - 1]!)) / APART_STEP_MS;
  const envelope = (sign: number) => {
    const out = depth.map((d) => Math.max(0, sign * d));
    for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i]!, out[i - 1]! - allowed(i));
    for (let i = out.length - 2; i >= 0; i--) out[i] = Math.max(out[i]!, out[i + 1]! - allowed(i + 1));
    return out;
  };
  const ahead = envelope(1);
  const back = envelope(-1);
  return shifts.map((v, i) => {
    // Donde las dos envolventes se pisan (cambia de sentido), la que manda es la que más aparta.
    const want = ahead[i]! >= back[i]! ? ahead[i]! : -back[i]!;
    return v.clone().addScaledVector(view, want - depth[i]!);
  });
}

/** Lo más que cambia cada APART_STEP_MS lo que se apartan hacia el que mira (en brazos). */
const DEPTH_RAMP = 0.02;

/**
 * Una opción por muestra, por el camino de menor coste: lo que se apartan más lo que cambia
 * de una muestra a la siguiente (programación dinámica). Con `flipCost`, invertir el sentido
 * de una muestra a la siguiente cuesta además eso por lo que se apartan las dos. Lo que se
 * apartan pesa en cada muestra lo que dura (`times`): las muestras más seguidas donde las
 * manos van deprisa no cuentan más que las demás.
 */
function cheapestPath(options: ApartOption[][], times: number[], flipCost = 0): THREE.Vector3[] {
  const n = options.length;
  const weight = spans(times);
  const cost: number[][] = [];
  const from: number[][] = [];
  options.forEach((opts, i) => {
    from[i] = [];
    const own = (v: ApartOption) => (v.length() + (v.penalty ?? 0)) * weight[i]!;
    cost[i] = opts.map((v, j) => {
      if (i === 0) return own(v);
      let best = Infinity;
      options[i - 1]!.forEach((u, k) => {
        const flip = v.dot(u) < 0 ? flipCost * (v.length() + u.length()) : 0;
        const c = cost[i - 1]![k]! + APART_SWITCH_COST * v.distanceTo(u) + flip;
        if (c < best) {
          best = c;
          from[i]![j] = k;
        }
      });
      return best + own(v);
    });
  });
  const chosen: THREE.Vector3[] = new Array(n);
  let j = cost[n - 1]!.indexOf(Math.min(...cost[n - 1]!));
  for (let i = n - 1; i >= 0; i--) {
    chosen[i] = options[i]![j]!;
    if (i > 0) j = from[i]![j]!;
  }
  return chosen;
}

/**
 * Las dos manos sin meterse una en otra en todo el signo: en los keyframes (dedos cruzados
 * en CASA, un puño dentro del otro en ESPERAR) y de camino entre ellos. Se muestrea el clip,
 * se ve en cada instante hacia dónde se pueden apartar y se elige con programación dinámica
 * lo menos posible sin cambiar de lado de golpe: si en la grabación una mano pasa a través
 * de la otra (la profundidad de la cámara no es fiable), cambia de lado donde menos cuesta,
 * y el resultado se suaviza. Si hace falta apartarlas, el clip queda con un keyframe por
 * muestra.
 */
function keepHandsApart(rig: VrmRig, clip: AvatarClip): AvatarClip {
  const kfs = clip.keyframes;
  if (kfs.length < 2 || !kfs.some((k) => k.hand2)) return clip;
  const L = rig.armLen;
  const samples = apartSamples(rig, clip);
  const n = samples.length;
  const none = (o: THREE.Vector3[]) => o.length === 1 && o[0]!.lengthSq() === 0;
  const optionsAt = (kf: AvatarKeyframe): THREE.Vector3[] => {
    if (!kf.hand2) return [new THREE.Vector3()];
    const hand2 = { ...kf, hand2: kf.hand2 };
    // Muñecas tan lejos que ni con los dedos estirados se tocan: no hace falta posar.
    const { r0, l0 } = shiftedTargets(rig, hand2)(new THREE.Vector3());
    if (r0.distanceTo(l0) > 2.3 * rig.handReach) return [new THREE.Vector3()];
    const fingers2 = kf.fingers2 ?? kf.fingers;
    const thumb = thumbOf(kf, "Right");
    const thumb2 = thumbOf(kf, "Left");
    poseArm(rig, "Right", signingGoal(rig, "Right", kf.hand));
    poseArm(rig, "Left", signingGoal(rig, "Left", kf.hand2));
    // Primero con los ángulos de los dedos solos (el pulgar hasta su yema y la pinza son lo más
    // caro de posar); si se meten, ya con todo.
    poseFingers(rig, "Right", kf.fingers);
    poseFingers(rig, "Left", fingers2);
    const opts = apartOptions(rig, hand2, HANDS_OVERLAP_TOL * L, HANDS_MAX_SHIFT * L);
    if (!(thumb.touch || thumb2.touch || thumb.tip || thumb2.tip)) return opts;
    // Sin meterse, pero tan cerca que el pulgar en su sitio (hasta su yema, fuera de la palma)
    // podría hacerlo.
    if (none(opts) && handsProbe(rig).depthAt(new THREE.Vector3(), Infinity, THUMB_SLACK * L) === 0) return opts;
    poseFingers(rig, "Right", kf.fingers, thumb);
    poseFingers(rig, "Left", fingers2, thumb2);
    return apartOptions(rig, hand2, HANDS_OVERLAP_TOL * L, HANDS_MAX_SHIFT * L);
  };
  const options = samples.map(optionsAt);
  if (options.every(none)) return clip;

  // Como en las pasadas de después, sin invertir el sentido de una muestra a otra: al suavizar
  // se anulaba (una mano que pasa a través de la otra, los dos órdenes de un cruce).
  const view = rig.forward.clone().normalize();
  const times = samples.map((kf) => kf.t);
  const chosen = cheapestPath(options, times, RESIDUAL_FLIP_COST);
  const shifts = rampDepth(smoothShifts(chosen, times), times, view, DEPTH_RAMP * L);
  const apart = samples.map((kf, i) => shiftHands(rig, kf, shifts[i]!));
  // Al cambiar de lado el suavizado las deja metidas un momento: lo que siga dentro, fuera
  // con lo mínimo que haga falta en esa muestra (es poco y dura dos o tres muestras), también
  // suavizado para que no dé un tirón. Se mira también donde no se metían pero se han movido:
  // al apartarlas en las muestras de al lado, una mano que pasaba rozando la otra acababa dentro.
  let keyframes = apart;
  const moved = shifts.map((s) => s.lengthSq() > 0);
  for (let pass = 0; pass < 3; pass++) {
    // Por el mismo lado en las muestras seguidas: si una mano atraviesa la otra, lo mínimo en
    // cada muestra es salir por delante en una y por detrás en la siguiente, y suavizado se
    // anula. Aquí invertir el sentido cuesta mucho más: la mano rodea a la otra.
    const rest = cheapestPath(
      keyframes.map((kf, i) => ((none(options[i]!) && !moved[i]) || !kf.hand2 ? [new THREE.Vector3()] : optionsAt(kf))),
      times,
      RESIDUAL_FLIP_COST,
    );
    if (rest.every((v) => v.lengthSq() === 0)) break;
    const extra = smoothShifts(rest, times);
    extra.forEach((s, i) => (moved[i] ||= s.lengthSq() > 0));
    keyframes = keyframes.map((kf, i) => shiftHands(rig, kf, extra[i]!));
  }
  return { ...clip, keyframes };
}

/**
 * Lo que hay que sacar la mano de la cabeza (en el modelo) en la pose de ahora, contando con
 * lo que llega el brazo: por bisección, desde el centro de la cabeza hacia la mano y algo
 * hacia delante (la normal de la cara vista de frente no sirve en los lados de la cabeza,
 * donde la piel se mezcla con el pelo) o, si así no sale, hacia delante, arriba o afuera.
 * Nulo si no se mete o si ni así sale al menos a medias.
 */
function headPush(rig: VrmRig, side: Side, head: Vec3 | undefined): THREE.Vector3 {
  const L = rig.armLen;
  const tol = HEAD_OVERLAP_TOL * L;
  const depthAt = headProbe(rig, side);
  const none = new THREE.Vector3();
  if (depthAt(none, tol) <= tol) return none;
  const q = headRotation(rig, head);
  const fwd = rig.forward.clone().applyQuaternion(q);
  const [, cu, cf] = headCenter(rig.face);
  const center = moveWithHead(rig, q, rig.eyes.clone().addScaledVector(rig.up, cu).addScaledVector(rig.forward, cf));
  const root = rig.vrm.humanoid.normalizedHumanBonesRoot;
  root.updateWorldMatrix(true, false);
  const toWorld = new THREE.Matrix3().setFromMatrix4(root.matrixWorld);
  const wrist = new THREE.Vector3()
    .setFromMatrixPosition(rig.vrm.humanoid.getNormalizedBoneNode(ARM[side].hand)!.matrixWorld)
    .applyMatrix4(root.matrixWorld.clone().invert());
  // Lo que de verdad se mueve la muñeca: con el brazo casi estirado, hacia fuera no llega.
  const moved = (dir: THREE.Vector3, s: number) => reachable(rig, side, wrist.clone().addScaledVector(dir, s * L)).sub(wrist);
  const depthFor = (dir: THREE.Vector3, s: number) => depthAt(moved(dir, s).applyMatrix3(toWorld), tol);
  // Desde el centro de la cabeza hacia la mano y algo hacia delante; si con el brazo estirado
  // así no sale, hacia delante, hacia delante y arriba o hacia delante y afuera.
  const radial = wrist.clone().sub(center).normalize();
  const ahead = radial.dot(fwd);
  if (ahead < 0.5) radial.addScaledVector(fwd, 0.5 - ahead).normalize();
  const outward = rig.right.clone().multiplyScalar(side === "Right" ? 1 : -1);
  const dirs = [radial, fwd, fwd.clone().add(rig.up).normalize(), fwd.clone().add(outward).normalize()];
  let best: { s: number; dir: THREE.Vector3; depth: number } | null = null;
  for (const dir of dirs) {
    const far = depthFor(dir, HEAD_MAX_PUSH);
    if (far > tol) {
      if (!best || (best.depth > tol && far < best.depth)) best = { s: HEAD_MAX_PUSH, dir, depth: far };
      continue;
    }
    let lo = 0;
    let hi = HEAD_MAX_PUSH;
    for (let k = 0; k < 7; k++) {
      const m = (lo + hi) / 2;
      if (depthFor(dir, m) <= tol) hi = m;
      else lo = m;
    }
    // La primera que sale basta: de una muestra a otra, siempre la misma dirección si se puede.
    best = { s: hi, dir, depth: 0 };
    break;
  }
  // Si en ninguna sale del todo, lo que más la saque, si al menos es la mitad.
  if (!best || best.depth > 0.5 * depthAt(none)) return none;
  return moved(best.dir, best.s);
}

/**
 * Las muestras de `keepOutOfHead`: cada APART_STEP_MS y más seguidas donde una mano pasa
 * deprisa junto a la cabeza (SORPRENDIDO: de delante de la cara a la frente).
 */
function headSamples(rig: VrmRig, clip: AvatarClip, nearHead: (target: THREE.Vector3) => boolean): AvatarKeyframe[] {
  const even = sampleEvenly(clip);
  const root = rig.vrm.humanoid.normalizedHumanBonesRoot;
  const [, cu, cf] = headCenter(rig.face);
  const tracks = (["Right", "Left"] as const).map((side) => {
    const handOf = (kf: AvatarKeyframe) => (side === "Right" ? kf.hand : kf.hand2);
    const near = even.map((kf) => {
      const hand = handOf(kf);
      return !!hand && nearHead(reachable(rig, side, signingGoal(rig, side, hand).target.clone()));
    });
    // Donde está cerca o lo está en la muestra de al lado: la mano respecto al centro de la
    // cabeza, y si queda a más de una distancia hacia él.
    return even.map((kf, i): Nearby | null => {
      const hand = handOf(kf);
      if (!hand || !(near[i] || near[i - 1] || near[i + 1])) return null;
      poseHead(rig, kf.head);
      poseArm(rig, side, signingGoal(rig, side, hand));
      poseFingers(rig, side, side === "Right" || !kf.fingers2 ? kf.fingers : kf.fingers2);
      const depthAt = headProbe(rig, side);
      const joints = handJointsWorld(rig, side);
      root.updateWorldMatrix(true, false);
      const center = moveWithHead(rig, headRotation(rig, kf.head), rig.eyes.clone().addScaledVector(rig.up, cu).addScaledVector(rig.forward, cf))
        .applyMatrix4(root.matrixWorld);
      const toHead = joints.reduce((acc, p) => acc.add(p), new THREE.Vector3()).multiplyScalar(-1 / joints.length).add(center).normalize();
      const tol = HEAD_OVERLAP_TOL * rig.armLen;
      return {
        points: joints.map((p) => p.clone().sub(center)),
        apart: (gap) => depthAt(toHead.clone().multiplyScalar(gap), tol) <= tol,
      };
    });
  });
  return splitFast(rig, clip, even, tracks);
}

/**
 * Las manos fuera de la cabeza también de camino entre keyframes (de una mejilla a la otra,
 * al subir a la frente). Los keyframes ya están fuera (`outOfHead`); aquí se muestrea el
 * clip, se ve cuánto hay que sacar cada mano en cada muestra y se suaviza. Si no hace falta
 * nada, el clip queda como estaba.
 */
function keepOutOfHead(rig: VrmRig, clip: AvatarClip): AvatarClip {
  if (clip.keyframes.length < 2) return clip;
  const g = rig.face;
  const nearHead = (target: THREE.Vector3) => {
    const d = target.clone().sub(rig.eyes);
    return Math.abs(d.dot(rig.right)) < -g.r0 + rig.handReach && d.y > g.u0 - rig.handReach && d.y < g.topU + rig.handReach;
  };
  /** Lo que hay que sacar cada mano de la cabeza en cada muestra (null si nada). */
  const pushesOf = (samples: AvatarKeyframe[], only?: (i: number, side: Side) => boolean) => {
    const pushes = { Right: [] as THREE.Vector3[], Left: [] as THREE.Vector3[] };
    let any = false;
    samples.forEach((kf, i) => {
      let posedHead = false;
      for (const side of ["Right", "Left"] as const) {
        const hand = side === "Right" ? kf.hand : kf.hand2;
        const goal = hand && (!only || only(i, side)) && signingGoal(rig, side, hand);
        if (!goal || !nearHead(reachable(rig, side, goal.target.clone()))) {
          pushes[side].push(new THREE.Vector3());
          continue;
        }
        if (!posedHead) poseHead(rig, kf.head);
        posedHead = true;
        poseArm(rig, side, goal);
        poseFingers(rig, side, side === "Right" || !kf.fingers2 ? kf.fingers : kf.fingers2, thumbOf(kf, side));
        const push = headPush(rig, side, kf.head);
        any ||= push.lengthSq() > 0;
        pushes[side].push(push);
      }
    });
    return any ? pushes : null;
  };
  const moved = (side: Side, hand: HandSpec, push: THREE.Vector3): HandSpec =>
    push.lengthSq() < 1e-12
      ? hand
      : { ...hand, ...toSigningSpace(rig, side, reachable(rig, side, signingGoal(rig, side, hand).target).add(push)) };
  const apply = (samples: AvatarKeyframe[], right: THREE.Vector3[], left: THREE.Vector3[]) =>
    samples.map((kf, i) => ({
      ...kf,
      hand: moved("Right", kf.hand, right[i]!),
      ...(kf.hand2 && { hand2: moved("Left", kf.hand2, left[i]!) }),
    }));
  let samples = headSamples(rig, clip, nearHead);
  const first = pushesOf(samples);
  if (!first) return clip;
  const times = samples.map((kf) => kf.t);
  const smoothed = { Right: smoothShifts(first.Right, times), Left: smoothShifts(first.Left, times) };
  samples = apply(samples, smoothed.Right, smoothed.Left);
  // El suavizado puede quedarse corto donde la dirección cambia de una muestra a otra: lo
  // que siga dentro, fuera sin suavizar (es poco). Solo hace falta mirar lo que se movió.
  const rest = pushesOf(samples, (i, side) => smoothed[side][i]!.lengthSq() > 0);
  if (rest) samples = apply(samples, rest.Right, rest.Left);
  return { ...clip, keyframes: samples };
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
  poseFingers(rig, "Right", kf.fingers, thumbOf(kf, "Right"));
  if (kf.hand2) {
    poseArm(rig, "Left", signingGoal(rig, "Left", kf.hand2));
    poseFingers(rig, "Left", kf.fingers2 ?? kf.fingers, thumbOf(kf, "Left"));
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

