import type { AvatarClip, AvatarKeyframe, Contact } from "@/lib/curriculum/schema";
import type { Point3 } from "@/lib/mediapipe/types";
import type { FaceCoords } from "./bodyPoints";
import {
  distributeFlex,
  MCP_MAX,
  PIP_MAX,
  REST_AZIMUTH,
  Y_CHEST,
  Y_MOUTH,
  Y_PER_FACE,
  type MeasuredFinger,
} from "./pose";

/**
 * Convierte una grabación con MediaPipe (pose + manos) en un AvatarClip.
 *
 * Todo se expresa en el espacio del signante, calculado a partir de sus
 * hombros: x hacia su derecha, y hacia arriba, z hacia el interlocutor. Las
 * posiciones se traducen a las coordenadas del currículo que interpreta
 * vrmMapper (x hacia fuera desde el hombro, y 0.35 ≈ pecho alto y 0.70 ≈ boca,
 * z hacia delante), así que el avatar reproduce el signo con sus propias
 * proporciones. La entrada no debe estar en espejo: los lados salen de la pose.
 */

export type Side = "left" | "right";
export type Landmark = Point3 & { visibility?: number };
export type HandSample = { world: Point3[]; image: Point3[] };

export type CaptureFrame = {
  t: number;
  /** worldLandmarks de PoseLandmarker (33 puntos, metros). */
  poseWorld: Landmark[] | null;
  /** landmarks de PoseLandmarker en la imagen (al menos la cara, 0-10) y ancho/alto del vídeo. */
  poseImage?: Point3[] | null;
  aspect?: number;
  /** Manos ya asignadas a su lado anatómico (ver assignHands). */
  hands: Partial<Record<Side, HandSample>>;
};

export type CaptureStats = {
  frames: number;
  poseRate: number;
  handRate: number;
  twoHands: boolean;
  durationMs: number;
};

export type CaptureResult =
  | { ok: true; clip: AvatarClip; templates: Point3[][]; stats: CaptureStats }
  | { ok: false; error: string };

type Vec = [number, number, number];

const P = { mouthL: 9, mouthR: 10, lShoulder: 11, rShoulder: 12, lElbow: 13, rElbow: 14, lWrist: 15, rWrist: 16 };
const STEP_MS = 100;
/** σ del suavizado de las trayectorias: con la mano rápida y quieta, y la velocidad (u/s) entre medias. */
// Ajustado con los 305 vídeos del DILSE: frente a un σ fijo de 60 ms, el temblor con la
// mano casi quieta baja un 28 % y los signos que oscilan (ADIÓS, AMIGO, NOMBRE…) conservan
// todos sus giros; más fuerte, las oscilaciones pequeñas y rápidas se perdían.
const SMOOTH_FAST_MS = 40;
const SMOOTH_SLOW_MS = 170;
const SMOOTH_SPEED = 1.0;
/**
 * Error admitido al quitar un keyframe que se puede sacar interpolando sus vecinos:
 * posición en unidades del espacio de signado (~1.5 % del brazo), direcciones de la mano
 * (~5°) y dedos (rad, ~7°). Sin los keyframes sobrantes la spline no sigue el temblor.
 */
const SIMPLIFY_TOL = { pos: 0.015, dir: 0.09, finger: 0.12 };
const FULL = distributeFlex(1);
const FINGER_MAX = FULL.proximal + FULL.middle + FULL.distal;
/** Igual que THUMB_FLEX_SCALE del mapper: el pulgar dobla menos. */
const THUMB_MAX = 0.7 * FINGER_MAX;
const DEG = Math.PI / 180;
/** Flexión medida de un dedo estirado y de uno cerrado del todo (ver fingerFlex). */
const OPEN_BEND = 50 * DEG;
const CURLED_BEND = 170 * DEG;
/** Suma de los cuatro dedos por debajo de la cual la mano está reflejada. */
const MIRRORED_BEND = -120 * DEG;
const FINGER_CHAINS = [
  [1, 2, 3, 4],
  [0, 5, 6, 7, 8],
  [0, 9, 10, 11, 12],
  [0, 13, 14, 15, 16],
  [0, 17, 18, 19, 20],
];
const RELAXED = [0.15, 0.15, 0.15, 0.15, 0.15];

const v = (p: Point3): Vec => [p.x, p.y, p.z];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: Vec, s: number): Vec => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len = (a: Vec) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec): Vec => {
  const l = len(a);
  return l < 1e-9 ? [0, 0, 0] : scale(a, 1 / l);
};
const mid = (a: Point3, b: Point3): Vec => scale([a.x + b.x, a.y + b.y, a.z + b.z], 0.5);
const angle = (a: Vec, b: Vec) => {
  const d = dot(unit(a), unit(b));
  return Math.acos(Math.max(-1, Math.min(1, d)));
};
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const round = (x: number) => Math.round(x * 1000) / 1000;
const mirrorX = (a: Vec): Vec => [-a[0], a[1], a[2]];

/** Inversa de smoothstep: distributeFlex aplica smoothstep a la flexión. */
function invSmoothstep(c: number): number {
  const x = Math.max(0, Math.min(1, c));
  return 0.5 - Math.sin(Math.asin(1 - 2 * x) / 3);
}

/**
 * Lo que dobla cada dedo (rad), del índice al meñique. Se mide solo en el plano
 * de flexión (se descarta la componente a lo largo de los nudillos) y desde el
 * eje de la palma, no desde la línea muñeca→nudillo, que se abre en abanico con
 * la mano plana. Los ángulos llevan signo (hacia la palma, positivo): el
 * temblor de los landmarks dobla unas articulaciones hacia un lado y otras
 * hacia el otro y así se compensa, en vez de sumarse como flexión.
 */
function fingerBends(world: Point3[], side: Side): number[] {
  const at = (i: number) => v(world[i]!);
  const o = handOrientation(world, side);
  let knuckles = unit(sub(at(5), at(17)));
  // Eje de flexión orientado para que doblar hacia la palma sea positivo.
  if (dot(knuckles, cross(o.point, o.palm)) < 0) knuckles = scale(knuckles, -1);
  const inPlane = (a: Vec) => sub(a, scale(knuckles, dot(a, knuckles)));
  const signed = (a: Vec, b: Vec) => Math.atan2(dot(cross(a, b), knuckles), dot(a, b));
  return FINGER_CHAINS.slice(1).map((chain) => {
    let bend = 0;
    let prev = inPlane(sub(at(9), at(0)));
    for (let k = 1; k + 1 < chain.length; k++) {
      const seg = inPlane(sub(at(chain[k + 1]!), at(chain[k]!)));
      bend += signed(prev, seg);
      prev = seg;
    }
    return bend;
  });
}

/**
 * Flexión 0..1 por dedo (pulgar, índice, medio, anular, meñique). En los vídeos
 * del DILSE un dedo estirado mide 50-60° y uno cerrado del todo 150-170°: se
 * reescala ese tramo para que la mano abierta quede abierta en el avatar y el
 * puño, cerrado.
 */
export function fingerFlex(world: Point3[], side: Side): number[] {
  const at = (i: number) => v(world[i]!);
  const c = FINGER_CHAINS[0]!;
  let thumb = 0;
  for (let k = 0; k + 2 < c.length; k++) {
    thumb += angle(sub(at(c[k + 1]!), at(c[k]!)), sub(at(c[k + 2]!), at(c[k + 1]!)));
  }
  return [
    invSmoothstep(thumb / THUMB_MAX),
    ...fingerBends(world, side).map((b) => invSmoothstep((b - OPEN_BEND) / (CURLED_BEND - OPEN_BEND))),
  ];
}

/** Calibración de cada articulación con el DILSE: medianas de dedos estirados y cerrados. */
const MCP_OPEN = 14 * DEG;
const MCP_CLOSED = 67 * DEG;
const PIP_OPEN = 3 * DEG;
const PIP_CLOSED = 80 * DEG;
/** El eje muñeca→nudillo del corazón se desvía unos 8° del propio dedo corazón. */
const AZ_SHIFT = 8 * DEG;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const perpUnit = (a: Vec, axis: Vec): Vec => unit(sub(a, scale(axis, dot(a, axis))));

/**
 * Cada dedo como [azimut, elevación, flexión] (rad) en el marco de la mano: hacia el
 * corazón, hacia el lado del índice y hacia la palma. Distingue lo que una sola flexión
 * no puede: la B doblada (solo el nudillo) de la garra (solo las falanges), los dedos
 * juntos de separados, y dónde está el pulgar (junto al índice, cruzado, fuera).
 * Nudillo y falange media, calibrados con el DILSE (MediaPipe los da doblados de más con
 * la mano estirada); el azimut de un dedo muy doblado no se ve bien y tiende al de reposo.
 */
export function fingerPose(world: Point3[], side: Side): MeasuredFinger[] {
  const at = (i: number) => v(world[i]!);
  const P = unit(sub(at(9), at(0)));
  const N = perpUnit(handOrientation(world, side).palm, P);
  const A = perpUnit(perpUnit(sub(at(5), at(17)), P), N);
  const chains = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
  return chains.map((c, i) => {
    const s1 = unit(sub(at(c[1]!), at(c[0]!)));
    const s2 = unit(sub(at(c[2]!), at(c[1]!)));
    const s3 = unit(sub(at(c[3]!), at(c[2]!)));
    const az = Math.atan2(dot(s1, A), dot(s1, P)) + AZ_SHIFT;
    const el = Math.atan2(dot(s1, N), Math.hypot(dot(s1, A), dot(s1, P)));
    // Flexión en el plano del dedo, con signo (hacia la palma, positiva).
    const k = unit(cross(s1, perpUnit(N, s1)));
    const bendOf = (a: Vec, b: Vec) => {
      const pa = perpUnit(a, k);
      const pb = perpUnit(b, k);
      return Math.atan2(dot(cross(pa, pb), k), dot(pa, pb));
    };
    if (i === 0) return [az, el, clamp(bendOf(s1, s2) + bendOf(s2, s3), -0.3, 1.6)];
    const mcp = clamp(((el - MCP_OPEN) / (MCP_CLOSED - MCP_OPEN)) * MCP_MAX, -10 * DEG, MCP_MAX + 10 * DEG);
    const pip = clamp(((bendOf(s1, s2) - PIP_OPEN) / (PIP_CLOSED - PIP_OPEN)) * PIP_MAX, -10 * DEG, PIP_MAX + 10 * DEG);
    const seen = clamp((70 * DEG - mcp) / (40 * DEG), 0, 1);
    return [seen * az + (1 - seen) * REST_AZIMUTH[i]!, mcp, pip];
  });
}

/**
 * La mano que dan los landmarks dobla los dedos hacia el dorso: MediaPipe la ha
 * reflejado en profundidad o es la otra mano. Su palma sale al revés, así que
 * ese fotograma no sirve.
 */
export function mirroredHand(world: Point3[], side: Side): boolean {
  return fingerBends(world, side).reduce((a, b) => a + b, 0) < MIRRORED_BEND;
}

/** Dirección de los dedos y normal de la palma (lado de la palma) de una mano. */
export function handOrientation(world: Point3[], side: Side): { point: Vec; palm: Vec } {
  const point = sub(v(world[9]!), v(world[0]!));
  const across = sub(v(world[5]!), v(world[17]!));
  const palm = side === "right" ? cross(across, point) : cross(point, across);
  return { point: unit(point), palm: unit(palm) };
}

/**
 * Asigna cada mano detectada a su lado anatómico usando las muñecas de la
 * pose (coordenadas de imagen), más fiable que la etiqueta de HandLandmarker,
 * que asume imagen en espejo.
 */
export function assignHands(
  poseImage: Point3[] | null,
  hands: HandSample[],
): Partial<Record<Side, HandSample>> {
  if (!poseImage || hands.length === 0) return {};
  const lw = poseImage[P.lWrist]!;
  const rw = poseImage[P.rWrist]!;
  const d = (h: HandSample, w: Point3) => Math.hypot(h.image[0]!.x - w.x, h.image[0]!.y - w.y);
  const [a, b] = hands;
  if (!b) return d(a!, rw) <= d(a!, lw) ? { right: a } : { left: a };
  return d(a!, rw) + d(b, lw) <= d(a!, lw) + d(b, rw) ? { right: a, left: b } : { right: b, left: a };
}

type Sample = {
  t: number;
  pos: Vec;
  /** fingers: flexión 0..1; joints: fingerPose aplanado (5 × 3). */
  hand?: { fingers: number[]; joints: number[]; palm: Vec; point: Vec; image: Point3[] };
  /** Parte de la mano más cerca de la cara o de la otra mano, y a qué distancia (m). */
  touch?: { at: Contact["at"]; with: NonNullable<Contact["with"]>; d: number; face?: FaceCoords };
};

// Pose de MediaPipe: nariz, ojos, comisuras de los ojos, orejas y boca (lado anatómico).
const FACE = { nose: 0, lEye: 2, lEyeOuter: 3, rEye: 5, rEyeOuter: 6, lEar: 7, rEar: 8 };
/** A esta distancia o menos, contacto pleno; a partir de TOUCH_FAR, ninguno. */
export const TOUCH_NEAR = 0.035;
export const TOUCH_FAR = 0.07;
/** Un contacto que dura esto o más cuenta como pleno (ver touchRuns). */
const TOUCH_HOLD_MS = 200;
/** Peso de la profundidad (z de la cámara) al medir si la mano toca la cara. */
const FACE_DEPTH_WEIGHT = 0.25;

/**
 * Qué toca la mano en un fotograma: la parte de la mano (yemas, índice, pulgar, palma o
 * puño) más cercana a un punto de la cara del mismo lado o del centro, o a la otra mano.
 * Así una grabación en la que el signante se toca la barbilla hace que el avatar se la
 * toque también, aunque su cara tenga otras proporciones (el mapper lleva la parte de la
 * mano al punto medido en la malla del modelo).
 */
function detectTouch(f: CaptureFrame, side: Side, fingers: number[]): Sample["touch"] {
  const p = f.poseWorld;
  const h = f.hands[side];
  if (!p || p.length <= P.rWrist || !h) return undefined;
  const wrist = v(p[side === "right" ? P.rWrist : P.lWrist]!);
  const at = (hand: HandSample, w: Vec, i: number): Vec => {
    const o = v(hand.world[0]!);
    const q = v(hand.world[i]!);
    return [w[0] + q[0] - o[0], w[1] + q[1] - o[1], w[2] + q[2] - o[2]];
  };
  const meanOf = (ps: Vec[]): Vec => scale(ps.reduce((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], [0, 0, 0]), 1 / ps.length);
  const extended = [1, 2, 3, 4].filter((i) => (fingers[i] ?? 1) < 0.5);
  const tipIndex = [4, 8, 12, 16, 20];
  // Cada parte con los landmarks de la mano que la forman (para situarla también en la imagen).
  const partIds: [NonNullable<Contact["with"]>, number[]][] = [
    ["index", [8]],
    ["thumb", [4]],
    ["palm", [0, 5, 17]],
    ["knuckles", [6, 10]],
  ];
  if (extended.length > 1) partIds.unshift(["tips", extended.map((i) => tipIndex[i]!)]);
  const parts: [NonNullable<Contact["with"]>, Vec][] = partIds.map(([name, ids]) => [
    name,
    meanOf(ids.map((i) => at(h, wrist, i))),
  ]);

  const r = side === "right";
  const nose = v(p[FACE.nose]!);
  const mouth = mid(p[P.mouthL]!, p[P.mouthR]!);
  const eyes = mid(p[FACE.lEye]!, p[FACE.rEye]!);
  const eyeOuter = v(p[r ? FACE.rEyeOuter : FACE.lEyeOuter]!);
  const ear = v(p[r ? FACE.rEar : FACE.lEar]!);
  const corner = v(p[r ? P.mouthR : P.mouthL]!);
  const upFace = sub(eyes, mouth);
  const lerp = (a: Vec, b: Vec, u: number): Vec => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
  // Sin el ojo: los signos tocan la sien, la frente o la mejilla junto a él, y con la
  // profundidad poco fiable un índice en la sien salía como «ojo» (y el avatar se lo metía).
  const targets: [Contact["at"], Vec][] = [
    ["chin", sub(mouth, scale(sub(nose, mouth), 1.8))],
    ["mouth", mouth],
    ["nose", nose],
    ["forehead", [eyes[0] + upFace[0] * 0.8, eyes[1] + upFace[1] * 0.8, eyes[2] + upFace[2] * 0.8]],
    ["temple", [...lerp(eyeOuter, ear, 0.35)].map((x, k) => x + upFace[k]! * 0.3) as Vec],
    ["cheek", lerp(corner, ear, 0.4)],
    ["ear", ear],
  ];

  // La otra mano, si se ve: palma (o dorso, según el lado de la palma en que quede), yemas o muñeca.
  const otherSide: Side = r ? "left" : "right";
  const oh = f.hands[otherSide];
  let otherPalm: Vec | null = null;
  let otherNormal: Vec | null = null;
  if (oh) {
    const ow = v(p[r ? P.lWrist : P.rWrist]!);
    otherPalm = meanOf([0, 5, 17].map((i) => at(oh, ow, i)));
    otherNormal = handOrientation(oh.world, otherSide).palm;
    targets.push(["otherPalm", otherPalm], ["otherTips", meanOf([8, 12].map((i) => at(oh, ow, i)))], ["otherWrist", ow]);
  }

  // Con la cara en la imagen, lo que toca se decide ahí: la parte dentro del contorno de la
  // cara (o a cuánto queda de él) y la profundidad con poco peso. La cara de la pose en el
  // espacio está estrechada y daba la sien o la mejilla más lejos de lo que estaban.
  const imageOf = (ids: number[]) =>
    ids.reduce((acc, i) => ({ x: acc.x + h.image[i]!.x / ids.length, y: acc.y + h.image[i]!.y / ids.length }), { x: 0, y: 0 });
  const faceTouch = (what: NonNullable<Contact["with"]>, q: Vec): Sample["touch"] => {
    if (!f.poseImage) return undefined;
    const face = faceCoords(f.poseImage, f.aspect ?? 1, imageOf(partIds.find(([n]) => n === what)![1]));
    if (!face) return undefined;
    const at = namedFacePoint(face);
    const ref = targets.find(([name]) => name === at) ?? targets.find(([name]) => name === "forehead")!;
    const depth = q[2] - ref[1][2];
    return { at, with: what, face, d: Math.hypot(outsideFace(face), FACE_DEPTH_WEIGHT * depth) };
  };

  let best: Sample["touch"];
  let bestPart: Vec | null = null;
  for (const [what, q] of parts) {
    const onFace = faceTouch(what, q);
    if (onFace && (!best || onFace.d < best.d)) {
      best = onFace;
      bestPart = q;
    }
    for (const [where, tp] of targets) {
      if (onFace && !where.startsWith("other")) continue;
      const diff = sub(q, tp);
      // Contra la cara, la profundidad cuenta poco: con el brazo levantado la pose pone la
      // muñeca 15-30 cm por delante aunque la mano toque la frente o la barbilla (en el
      // plano de la imagen, que sí es fiable, está encima). Entre las dos manos el error es
      // parecido en las dos muñecas y se anula.
      const d = where.startsWith("other") ? len(diff) : Math.hypot(diff[0], diff[1], FACE_DEPTH_WEIGHT * diff[2]);
      if (!best || d < best.d) {
        best = { at: where, with: what, d };
        bestPart = q;
      }
    }
  }
  // La palma de la otra mano mira hacia un lado: si la parte queda detrás, toca el dorso.
  if (best?.at === "otherPalm" && otherPalm && otherNormal && bestPart && dot(sub(bestPart, otherPalm), otherNormal) < 0) {
    best = { ...best, at: "otherBack" };
  }
  return best && best.d < TOUCH_FAR ? best : undefined;
}

/** Contorno de la cara en coordenadas de cara: de oreja a oreja y de la barbilla a la coronilla. */
const FACE_OUTLINE = { h: 2.5, v0: -1.9, v1: 1.9 };
/** Metros por unidad de coordenadas de cara, en una persona (distancia ojos→boca). */
const FACE_UNIT_M = 0.07;

/** Distancia (m) de un punto al contorno de la cara en la imagen; 0 si cae dentro. */
function outsideFace([h, v]: FaceCoords): number {
  const cv = (FACE_OUTLINE.v0 + FACE_OUTLINE.v1) / 2;
  const k = Math.hypot(h / FACE_OUTLINE.h, (v - cv) / ((FACE_OUTLINE.v1 - FACE_OUTLINE.v0) / 2));
  return Math.max(0, k - 1) * FACE_OUTLINE.h * FACE_UNIT_M;
}

/**
 * Coordenadas de cara (ver FaceCoords) de un punto de la imagen: desde el punto entre
 * los ojos, h hacia la derecha del signante en medias distancias entre ojos y v hacia
 * arriba en distancias ojos→boca. En la imagen la cara se ve bien; en profundidad, no.
 */
export function faceCoords(img: Point3[], aspect: number, q: { x: number; y: number }): FaceCoords | null {
  const pt = (i: number): [number, number] | null => (img[i] ? [img[i]!.x * aspect, img[i]!.y] : null);
  const eyeL = pt(FACE.lEye);
  const eyeR = pt(FACE.rEye);
  const mL = pt(P.mouthL);
  const mR = pt(P.mouthR);
  if (!eyeL || !eyeR || !mL || !mR) return null;
  const o = [(eyeL[0] + eyeR[0]) / 2, (eyeL[1] + eyeR[1]) / 2];
  const halfEye = Math.hypot(eyeR[0] - eyeL[0], eyeR[1] - eyeL[1]) / 2;
  if (halfEye < 1e-4) return null;
  const r = [(eyeR[0] - eyeL[0]) / (2 * halfEye), (eyeR[1] - eyeL[1]) / (2 * halfEye)];
  const mouth = [(mL[0] + mR[0]) / 2, (mL[1] + mR[1]) / 2];
  // Arriba: perpendicular a la línea de los ojos, del lado contrario a la boca.
  let u = [-r[1]!, r[0]!];
  if ((o[0]! - mouth[0]!) * u[0]! + (o[1]! - mouth[1]!) * u[1]! < 0) u = [-u[0]!, -u[1]!];
  const eyesToMouth = (o[0]! - mouth[0]!) * u[0]! + (o[1]! - mouth[1]!) * u[1]!;
  if (eyesToMouth < 1e-4) return null;
  const d = [q.x * aspect - o[0]!, q.y - o[1]!];
  const two = (x: number) => Math.round(x * 100) / 100;
  return [two((d[0]! * r[0]! + d[1]! * r[1]!) / halfEye), two((d[0]! * u[0]! + d[1]! * u[1]!) / eyesToMouth)];
}

/** Puntos de la cara de una persona en coordenadas de cara (el lado lo pone h). */
const FACE_POINTS: [Contact["at"], number, number][] = [
  ["chin", 0, -1.75],
  ["mouth", 0, -1],
  ["nose", 0, -0.55],
  ["forehead", 0, 0.8],
  ["top", 0, 1.7],
  ["cheek", 1.3, -0.6],
  ["temple", 2.1, 0.3],
  ["ear", 2.5, -0.3],
];

/** El punto con nombre más cercano, como etiqueta legible del contacto. */
function namedFacePoint([h, v]: FaceCoords): Contact["at"] {
  let best = FACE_POINTS[0]!;
  let bestD = Infinity;
  for (const p of FACE_POINTS) {
    const d = Math.hypot(Math.abs(h) - p[1], v - p[2]);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best[0];
}

const mode = <T>(xs: T[]): T => {
  const count = new Map<T, number>();
  for (const x of xs) count.set(x, (count.get(x) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]![0];
};

type TouchRun = {
  t0: number;
  t1: number;
  contact: Contact;
  /** Contacto con la cara: por dónde va la parte que toca (la mano puede deslizarse). */
  path?: { t: number; face: FaceCoords }[];
};

function touchRuns(samples: (Sample | null)[], twoHands: boolean): TouchRun[] {
  const out: TouchRun[] = [];
  let run: Sample[] = [];
  let gap = 0;
  // La cara cuenta como un solo sitio (el punto se sigue por el camino); la otra mano, por partes.
  const kind = (s: Sample) => (s.touch!.at.startsWith("other") ? s.touch!.at : "face");
  const flush = () => {
    const touching = run.filter((s) => twoHands || !s.touch!.at.startsWith("other"));
    if (touching.length >= 2) {
      const where = mode(touching.map(kind));
      const same = touching.filter((s) => kind(s) === where);
      // El momento del toque es el más cercano del tramo (la pose comprime la cara y en los
      // demás fotogramas la mano parece más lejos de lo que está).
      const d = Math.min(...same.map((s) => s.touch!.d));
      const closeness = Math.max(0, Math.min(1, (TOUCH_FAR - d) / (TOUCH_FAR - TOUCH_NEAR)));
      // Quedarse junto al mismo punto un rato es tocarlo: al signar la mano no se para al
      // lado de la cara sin tocarla, y la distancia medida engaña (la pose estrecha la cara).
      const held = same[same.length - 1]!.t - same[0]!.t >= TOUCH_HOLD_MS;
      const weight = held && closeness > 0 ? Math.max(closeness, 0.9) : closeness;
      if (weight >= 0.1) {
        const path = same.filter((s) => s.touch!.face).map((s) => ({ t: s.t, face: s.touch!.face! }));
        out.push({
          t0: touching[0]!.t,
          t1: touching[touching.length - 1]!.t,
          contact: {
            at: where === "face" ? mode(same.map((s) => s.touch!.at)) : (where as Contact["at"]),
            with: mode(same.map((s) => s.touch!.with)),
            weight: round(weight),
          },
          ...(path.length ? { path } : {}),
        });
      }
    }
    run = [];
    gap = 0;
  };
  for (const s of samples) {
    if (s?.touch) {
      run.push(s);
      gap = 0;
    } else if (run.length && ++gap > 1) {
      flush();
    }
  }
  flush();
  return out;
}

/** Contacto del tramo en `t`: en la cara, el punto por el que va la mano en ese momento. */
function contactOfRun(run: TouchRun, t: number, leftHanded: boolean): Contact {
  if (!run.path) return run.contact;
  const near = run.path.filter((p) => Math.abs(p.t - t) <= STEP_MS);
  const pts = near.length ? near : [run.path.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a))];
  const h = median(pts.map((p) => p.face[0]));
  const face: FaceCoords = [round(leftHanded ? -h : h), round(median(pts.map((p) => p.face[1])))];
  return { ...run.contact, at: namedFacePoint(face), face };
}

type Timed<T> = { t: number; val: T };

/**
 * Suavizado gaussiano en el tiempo (σ en ms): quita el temblor de MediaPipe sin los
 * rebotes de una media móvil, que deja pasar parte de las frecuencias altas. Pesa por
 * tiempo, así que los fotogramas que faltan no juntan puntos lejanos.
 */
function smooth(points: Timed<number[]>[], sigmaMs: number | ((t: number) => number)): Timed<number[]>[] {
  const sigmaAt = typeof sigmaMs === "number" ? () => sigmaMs : sigmaMs;
  const sigmas = points.map((p) => sigmaAt(p.t));
  return points.map((p, i) => {
    if (sigmas[i]! <= 0) return p;
    const acc = p.val.map(() => 0);
    let wsum = 0;
    for (const [j, q] of points.entries()) {
      const dt = q.t - p.t;
      // Con el menor de los dos σ: una pausa se suaviza con la pausa, sin que el movimiento
      // de después se cuele en ella (la mano empezaría a moverse antes de tiempo).
      const sigma = Math.min(sigmas[i]!, sigmas[j]!);
      if (sigma <= 0 || Math.abs(dt) > 3 * sigma) continue;
      const w = Math.exp((-dt * dt) / (2 * sigma * sigma));
      wsum += w;
      q.val.forEach((x, k) => (acc[k]! += w * x));
    }
    return { t: p.t, val: acc.map((x) => x / wsum) };
  });
}

/**
 * σ según lo deprisa que va la muñeca: con la mano casi quieta el temblor es lo que más se
 * ve y se suaviza mucho; en un movimiento rápido (saludar, golpear dos veces) poco, para
 * no comerse el gesto. Como el filtro «One Euro», pero simétrico en el tiempo (sin retraso).
 */
function adaptiveSigma(
  samples: (Sample | null)[],
  { fast, slow, speed: v0 } = { fast: SMOOTH_FAST_MS, slow: SMOOTH_SLOW_MS, speed: SMOOTH_SPEED },
): (t: number) => number {
  const pts: Timed<number[]>[] = [];
  for (const s of samples) if (s) pts.push({ t: s.t, val: s.pos });
  const light = smooth(pts, fast);
  const speed = light.map((p, i) => {
    const a = light[Math.max(0, i - 1)]!;
    const b = light[Math.min(light.length - 1, i + 1)]!;
    return { t: p.t, v: b.t > a.t ? len(sub(b.val as Vec, a.val as Vec)) / ((b.t - a.t) / 1000) : 0 };
  });
  // La velocidad máxima alrededor, no la del instante: al dar la vuelta en una oscilación
  // la mano se para un momento y un σ grande ahí se comería los extremos.
  return (t: number) => {
    let v = 0;
    for (const s of speed) if (Math.abs(s.t - t) <= slow) v = Math.max(v, s.v);
    return fast + (slow - fast) * Math.exp(-v / v0);
  };
}

function resample(points: Timed<number[]>[], times: number[]): number[][] {
  return times.map((t) => {
    let j = points.findIndex((p) => p.t >= t);
    if (j === -1) return points[points.length - 1]!.val;
    if (j === 0) return points[0]!.val;
    const a = points[j - 1]!;
    const b = points[j]!;
    const u = (t - a.t) / (b.t - a.t || 1);
    return a.val.map((x, k) => x + (b.val[k]! - x) * u);
  });
}

function channel(
  samples: (Sample | null)[],
  pick: (s: Sample) => number[] | undefined,
  sigmaMs: number | ((t: number) => number),
): Timed<number[]>[] {
  const out: Timed<number[]>[] = [];
  for (const s of samples) {
    const val = s && pick(s);
    if (s && val) out.push({ t: s.t, val });
  }
  return smooth(out, sigmaMs);
}

export function framesToClip(
  frames: CaptureFrame[],
  opts: {
    leftHanded?: boolean;
    /** Para comparar ajustes: false deja todos los keyframes; smoothing cambia el suavizado. */
    simplify?: boolean;
    smoothing?: number | { fast: number; slow: number; speed: number };
  } = {},
): CaptureResult {
  const withPose = frames.filter((f) => f.poseWorld && f.poseWorld.length > P.rWrist);
  if (withPose.length < 5) {
    return { ok: false, error: "No se detecta el cuerpo. Encuadra de cintura para arriba, de frente y con buena luz." };
  }

  // Base del signante a partir de la línea de hombros (mediana, robusta a encogerlos).
  const shoulderLine = [0, 1, 2].map((k) =>
    median(withPose.map((f) => sub(v(f.poseWorld![P.rShoulder]!), v(f.poseWorld![P.lShoulder]!))[k]!)),
  ) as Vec;
  const R = unit(shoulderLine);
  const imageUp: Vec = [0, -1, 0];
  const U = unit(sub(imageUp, scale(R, dot(imageUp, R))));
  const F = cross(U, R);
  const toSigner = (a: Vec): Vec => [dot(a, R), dot(a, U), dot(a, F)];

  const armLen = median(
    withPose.flatMap((f) => {
      const p = f.poseWorld!;
      return [
        [P.lShoulder, P.lElbow, P.lWrist],
        [P.rShoulder, P.rElbow, P.rWrist],
      ].map(([s, e, w]) => len(sub(v(p[e!]!), v(p[s!]!))) + len(sub(v(p[w!]!), v(p[e!]!))));
    }),
  );
  const chestUp = -0.15 * armLen;
  const mouthUp = median(
    withPose.map((f) => {
      const p = f.poseWorld!;
      return dot(sub(mid(p[P.mouthL]!, p[P.mouthR]!), mid(p[P.lShoulder]!, p[P.rShoulder]!)), U);
    }),
  );

  const eyesUp = median(
    withPose.map((f) => {
      const p = f.poseWorld!;
      return dot(sub(mid(p[FACE.lEye]!, p[FACE.rEye]!), mid(p[P.lShoulder]!, p[P.rShoulder]!)), U);
    }),
  );
  /**
   * Con el brazo levantado la pose en 3D baja la muñeca unos 7 cm (una distancia ojos→boca):
   * PENSAR la tiene a la altura de los ojos en la imagen y a la de la boca en 3D. Cerca de
   * la cara se toma la altura de la imagen, medida con la propia cara; lejos (a la altura
   * del pecho), la de 3D, porque en la imagen no hay con qué medirla.
   */
  const heightNearFace = (f: CaptureFrame, wristIdx: number, up3d: number) => {
    const img = f.poseImage?.[wristIdx];
    const face = img && faceCoords(f.poseImage!, f.aspect ?? 1, img);
    if (!face) return up3d;
    const upImg = eyesUp + face[1] * (eyesUp - mouthUp);
    const w = Math.max(0, Math.min(1, (face[1] + 3) / 1.5));
    return w * upImg + (1 - w) * up3d;
  };
  // Ver Y_PER_FACE: por encima de la boca, en distancias boca→ojos.
  const heightOf = (up: number) =>
    up <= mouthUp
      ? Y_CHEST + ((Y_MOUTH - Y_CHEST) * (up - chestUp)) / (mouthUp - chestUp)
      : Y_MOUTH + (Y_PER_FACE * (up - mouthUp)) / Math.max(0.02, eyesUp - mouthUp);

  const sampleSide = (f: CaptureFrame, side: Side): Sample | null => {
    const p = f.poseWorld;
    if (!p || p.length <= P.rWrist) return null;
    const [si, wi] = side === "right" ? [P.rShoulder, P.rWrist] : [P.lShoulder, P.lWrist];
    const wrist = p[wi]!;
    if ((wrist.visibility ?? 1) < 0.5) return null;
    const rel = sub(v(wrist), v(p[si]!));
    const outward = side === "right" ? R : scale(R, -1);
    const up = heightNearFace(f, wi, dot(sub(v(wrist), mid(p[P.lShoulder]!, p[P.rShoulder]!)), U));
    const pos: Vec = [
      dot(rel, outward) / (1.2 * armLen),
      heightOf(up),
      (dot(rel, F) / armLen - 0.55) / 0.9,
    ];
    const h = f.hands[side];
    if (!h || mirroredHand(h.world, side)) return { t: f.t, pos };
    const o = handOrientation(h.world, side);
    const fingers = fingerFlex(h.world, side);
    return {
      t: f.t,
      pos,
      hand: { fingers, joints: fingerPose(h.world, side).flat(), palm: toSigner(o.palm), point: toSigner(o.point), image: h.image },
      touch: detectTouch(f, side, fingers),
    };
  };

  const dominant: Side = opts.leftHanded ? "left" : "right";
  const other: Side = opts.leftHanded ? "right" : "left";
  const dom = frames.map((f) => sampleSide(f, dominant));
  // Mano activa: se ve y está levantada, sobre el pecho o al menos ~10 cm por encima de
  // donde descansa en esta grabación (hay signos a la altura de la cintura, como HIJO).
  const restY = (samples: (Sample | null)[]) => {
    const ys = samples.filter((s): s is Sample => !!s).map((s) => s.pos[1]).sort((a, b) => a - b);
    return ys.length ? ys[Math.floor(ys.length * 0.05)]! : 0;
  };
  const raisedBy = (0.1 * 0.35) / (mouthUp - chestUp);
  const activeAbove = (rest: number) => (s: Sample | null) => !!s?.hand && (s.pos[1] > 0 || s.pos[1] > rest + raisedBy);
  const isActive = activeAbove(restY(dom));
  const first = dom.findIndex(isActive);
  if (first === -1) {
    return { ok: false, error: "No se ve la mano dominante levantada. Signa a la altura del pecho o la cara, sin tapar la cámara." };
  }
  let last = first;
  dom.forEach((s, i) => { if (isActive(s)) last = i; });
  const lo = Math.max(0, first - 2);
  const hi = Math.min(frames.length - 1, last + 2);
  const range = (xs: (Sample | null)[]) => xs.slice(lo, hi + 1);

  const t0 = frames[lo]!.t;
  const tEnd = frames[hi]!.t;
  const times: number[] = [];
  for (let t = t0; t < tEnd; t += STEP_MS) times.push(t);
  times.push(tEnd);
  if (times.length < 2) times.push(t0 + 200);

  const mirror = opts.leftHanded ? mirrorX : (a: Vec) => a;
  const build = (samples: (Sample | null)[]) => {
    const sigma = typeof opts.smoothing === "number" ? opts.smoothing : adaptiveSigma(samples, opts.smoothing);
    const pos = resample(channel(samples, (s) => s.pos, sigma), times);
    const fingerCh = channel(samples, (s) => s.hand?.joints, sigma);
    const palmCh = channel(samples, (s) => s.hand?.palm, sigma);
    const pointCh = channel(samples, (s) => s.hand?.point, sigma);
    return {
      pos,
      fingers: fingerCh.length ? resample(fingerCh, times) : null,
      palm: palmCh.length ? resample(palmCh, times).map((a) => mirror(unit(a as Vec))) : null,
      point: pointCh.length ? resample(pointCh, times).map((a) => mirror(unit(a as Vec))) : null,
    };
  };

  const domRange = range(dom);
  const main = build(domRange);
  const otherAll = frames.map((f) => sampleSide(f, other));
  const otherRange = range(otherAll);
  const otherActive = otherRange.filter(activeAbove(restY(otherAll))).length / otherRange.length;
  const second = otherActive >= 0.3 ? build(otherRange) : null;

  const handSpec = (d: ReturnType<typeof build>, i: number): AvatarKeyframe["hand"] => ({
    x: round(d.pos[i]![0]!),
    y: round(d.pos[i]![1]!),
    z: round(d.pos[i]![2]!),
    rot: [0, 0, 0],
    ...(d.palm && d.point
      ? { palmDir: d.palm[i]!.map(round) as Vec, pointDir: d.point[i]!.map(round) as Vec }
      : {}),
  });
  const fingerSpec = (d: ReturnType<typeof build>, i: number): AvatarKeyframe["fingers"] => {
    const j = d.fingers?.[i];
    if (!j) return [...RELAXED] as AvatarKeyframe["fingers"];
    const two = (x: number) => Math.round(x * 100) / 100;
    return [0, 1, 2, 3, 4].map((f) => [two(j[3 * f]!), two(j[3 * f + 1]!), two(j[3 * f + 2]!)]) as AvatarKeyframe["fingers"];
  };

  // Contactos por tramos: los fotogramas seguidos en los que la mano toca (con huecos de
  // uno) son un solo contacto, con el punto y la parte más repetidos y el peso de lo más
  // cerca que llega. Fotograma a fotograma el punto saltaba (sien, nariz, sien…) y el peso
  // subía y bajaba, y el avatar se quedaba a medio camino. Un roce de un solo fotograma
  // (la mano que pasa por delante de la cara) no cuenta. La otra mano, solo si está en el clip.
  const runs = touchRuns(domRange, !!second);
  const contactAt = (t: number): Contact | undefined => {
    const run = runs.find((r) => t >= r.t0 - STEP_MS / 2 && t <= r.t1 + STEP_MS / 2);
    return run && contactOfRun(run, t, opts.leftHanded ?? false);
  };

  const keyframes: AvatarKeyframe[] = times.map((t, i) => {
    const contact = contactAt(t);
    return {
      t: Math.round(t - t0),
      hand: { ...handSpec(main, i), ...(contact ? { contact } : {}) },
      fingers: fingerSpec(main, i),
      ...(second ? { hand2: handSpec(second, i), fingers2: fingerSpec(second, i) } : {}),
    };
  });

  const durationMs = Math.round(tEnd - t0);
  const kept = opts.simplify === false ? keyframes : simplifyKeyframes(keyframes);
  const withHand = domRange.filter((s) => s?.hand).length;

  return {
    ok: true,
    clip: {
      handedness: second ? "two" : "one",
      duration: Math.max(200, Math.min(6000, durationMs)),
      keyframes: kept,
    },
    templates: pickTemplates(domRange, opts.leftHanded ?? false),
    stats: {
      frames: frames.length,
      poseRate: withPose.length / frames.length,
      handRate: withHand / domRange.length,
      twoHands: !!second,
      durationMs,
    },
  };
}

/** Canales de un keyframe agrupados por tolerancia (ver SIMPLIFY_TOL). */
function channelsOf(k: AvatarKeyframe): { pos: number[]; dir: number[]; finger: number[] } {
  const hands = [k.hand, k.hand2].filter((h): h is AvatarKeyframe["hand"] => !!h);
  const fingerVals = [k.fingers, k.fingers2 ?? []].flatMap((fs) =>
    fs.flatMap((f) => (Array.isArray(f) ? f : typeof f === "number" ? [f] : [f.flex, f.abduction ?? 0])),
  );
  return {
    pos: hands.flatMap((h) => [h.x, h.y, h.z]),
    dir: hands.flatMap((h) => [...(h.palmDir ?? []), ...(h.pointDir ?? [])]),
    finger: fingerVals,
  };
}

const contactKey = (k: AvatarKeyframe) => {
  const c = k.hand.contact;
  return c ? `${c.at}/${c.with}` : "";
};

/**
 * Quita los keyframes que se pueden reconstruir interpolando entre los que se quedan
 * (Ramer-Douglas-Peucker en el tiempo, con una tolerancia por tipo de canal). Se quedan
 * siempre el primero, el último y los que empiezan o acaban un contacto.
 */
export function simplifyKeyframes(kfs: AvatarKeyframe[]): AvatarKeyframe[] {
  if (kfs.length <= 3) return kfs;
  const ch = kfs.map(channelsOf);
  const keep = new Set<number>([0, kfs.length - 1]);
  for (let i = 1; i < kfs.length; i++) {
    if (contactKey(kfs[i]!) !== contactKey(kfs[i - 1]!)) {
      keep.add(i);
      keep.add(i - 1);
    }
  }
  // Un contacto que se desliza (cara) cambia de punto: se conservan sus keyframes.
  kfs.forEach((k, i) => { if (k.hand.contact?.face) keep.add(i); });
  const err = (i: number, a: number, b: number) => {
    const u = (kfs[i]!.t - kfs[a]!.t) / (kfs[b]!.t - kfs[a]!.t || 1);
    let worst = 0;
    for (const g of ["pos", "dir", "finger"] as const) {
      const va = ch[a]![g];
      const vb = ch[b]![g];
      const vi = ch[i]![g];
      for (let c = 0; c < vi.length; c++) {
        const lin = va[c]! + (vb[c]! - va[c]!) * u;
        worst = Math.max(worst, Math.abs(vi[c]! - lin) / SIMPLIFY_TOL[g]);
      }
    }
    return worst;
  };
  const split = (a: number, b: number) => {
    if (b - a < 2) return;
    let worst = 0;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const e = err(i, a, b);
      if (e > worst) {
        worst = e;
        at = i;
      }
    }
    if (worst > 1) {
      keep.add(at);
      split(a, at);
      split(at, b);
    }
  };
  const anchors = [...keep].sort((x, y) => x - y);
  for (let j = 1; j < anchors.length; j++) split(anchors[j - 1]!, anchors[j]!);
  return [...keep].sort((x, y) => x - y).map((i) => kfs[i]!);
}

/** Plantillas de reconocimiento: los fotogramas más quietos de la mano dominante. */
function pickTemplates(samples: (Sample | null)[], leftHanded: boolean): Point3[][] {
  const speeds = samples.map((s, i) => {
    const prev = samples[i - 1];
    if (!s?.hand || !prev) return Infinity;
    return len(sub(s.pos, prev.pos)) / Math.max(1, s.t - prev.t);
  });
  const order = speeds.map((sp, i) => ({ sp, i })).filter((x) => Number.isFinite(x.sp)).sort((a, b) => a.sp - b.sp);
  const picked: number[] = [];
  for (const { i } of order) {
    if (picked.length === 5) break;
    if (picked.every((j) => Math.abs(j - i) >= 3)) picked.push(i);
  }
  return picked.map((i) =>
    samples[i]!.hand!.image.map((p) => ({
      x: round(leftHanded ? 1 - p.x : p.x),
      y: round(p.y),
      z: round(p.z),
    })),
  );
}
