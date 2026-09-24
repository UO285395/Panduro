import { describe, expect, it } from "vitest";
import {
  assignHands,
  fingerFlex,
  framesToClip,
  handOrientation,
  type CaptureFrame,
  type Landmark,
} from "@/lib/avatar/capture";
import type { Point3 } from "@/lib/mediapipe/types";

// Ejes de cámara de MediaPipe: x a la derecha de la imagen, y hacia abajo,
// z alejándose de la cámara. Un signante de frente y sin espejo tiene su
// derecha en -x, arriba en -y y "hacia el interlocutor" en -z.
type Vec = [number, number, number];
const R: Vec = [-1, 0, 0];
const U: Vec = [0, -1, 0];
const F: Vec = [0, 0, -1];
const add = (...vs: Vec[]): Vec => vs.reduce((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], [0, 0, 0]);
const mul = (a: Vec, s: number): Vec => [a[0] * s, a[1] * s, a[2] * s];
const signer = (r: number, u: number, f: number): Vec => add(mul(R, r), mul(U, u), mul(F, f));
const pt = (a: Vec): Landmark => ({ x: a[0], y: a[1], z: a[2], visibility: 1 });
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec): Vec => mul(a, 1 / Math.hypot(...a));

function makeHand(side: "left" | "right", point: Vec, palm: Vec, curled = false): Point3[] {
  const across = side === "right" ? cross(point, palm) : cross(palm, point);
  const out: Vec[] = new Array(21).fill([0, 0, 0]);
  out[0] = [0, 0, 0];
  const mcps: [number, Vec][] = [
    [5, add(mul(point, 0.085), mul(across, 0.025))],
    [9, mul(point, 0.09)],
    [13, add(mul(point, 0.085), mul(across, -0.02))],
    [17, add(mul(point, 0.075), mul(across, -0.035))],
  ];
  for (const [i, m] of mcps) {
    out[i] = m;
    if (curled) {
      out[i + 1] = add(m, mul(palm, 0.035));
      out[i + 2] = add(out[i + 1]!, mul(point, -0.025));
      out[i + 3] = add(out[i + 2]!, mul(palm, -0.02));
    } else {
      out[i + 1] = add(m, mul(point, 0.04));
      out[i + 2] = add(m, mul(point, 0.065));
      out[i + 3] = add(m, mul(point, 0.085));
    }
  }
  out[1] = add(mul(point, 0.02), mul(across, 0.03), mul(palm, 0.01));
  out[2] = add(out[1]!, mul(point, 0.02), mul(across, 0.02));
  out[3] = add(out[2]!, mul(point, 0.02), mul(across, 0.015));
  out[4] = add(out[3]!, mul(point, 0.02), mul(across, 0.01));
  return out.map((a) => ({ x: a[0], y: a[1], z: a[2] }));
}

const L_SH = signer(-0.18, 0, 0);
const R_SH = signer(0.18, 0, 0);
const RAISED_RIGHT = { elbow: add(R_SH, signer(0.05, -0.1, 0.26)), wrist: add(R_SH, signer(0.1, 0.16, 0.31)) };
const RAISED_LEFT = { elbow: add(L_SH, signer(-0.05, -0.1, 0.26)), wrist: add(L_SH, signer(-0.1, 0.16, 0.31)) };
const DOWN_RIGHT = { elbow: add(R_SH, signer(0, -0.28, 0)), wrist: add(R_SH, signer(0, -0.55, 0)) };
const DOWN_LEFT = { elbow: add(L_SH, signer(0, -0.28, 0)), wrist: add(L_SH, signer(0, -0.55, 0)) };

function pose(right: { elbow: Vec; wrist: Vec }, left: { elbow: Vec; wrist: Vec }): Landmark[] {
  const p: Landmark[] = Array.from({ length: 33 }, () => pt([0, 0, 0]));
  p[9] = pt(signer(-0.03, 0.2, 0.1));
  p[10] = pt(signer(0.03, 0.2, 0.1));
  p[11] = pt(L_SH);
  p[12] = pt(R_SH);
  p[13] = pt(left.elbow);
  p[14] = pt(right.elbow);
  p[15] = pt(left.wrist);
  p[16] = pt(right.wrist);
  return p;
}

const dist = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const ARM = (dist(R_SH, RAISED_RIGHT.elbow) + dist(RAISED_RIGHT.elbow, RAISED_RIGHT.wrist) + 0.55) / 2;
const image = (h: Point3[]) => h.map((p) => ({ x: 0.3 + p.x, y: 0.5 + p.y, z: p.z }));

function frame(t: number, raised: boolean, hand?: Point3[]): CaptureFrame {
  return {
    t,
    poseWorld: pose(raised ? RAISED_RIGHT : DOWN_RIGHT, DOWN_LEFT),
    hands: hand ? { right: { world: hand, image: image(hand) } } : {},
  };
}

const HOLA_HAND = makeHand("right", U, F);

describe("capture: landmarks → clip", () => {
  it("mide flexión de dedos: mano abierta ≈ 0, puño ≈ 1", () => {
    const open = fingerFlex(HOLA_HAND);
    const fist = fingerFlex(makeHand("right", U, F, true));
    for (let i = 1; i < 5; i++) {
      expect(open[i]).toBeLessThan(0.1);
      expect(fist[i]).toBeGreaterThan(0.9);
    }
  });

  it("palma y dedos de una mano derecha con la palma hacia delante", () => {
    const o = handOrientation(HOLA_HAND, "right");
    const d = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    expect(d(o.palm, F)).toBeGreaterThan(0.99);
    expect(d(o.point, U)).toBeGreaterThan(0.99);
  });

  it("traduce la posición y la orientación al espacio del currículo", () => {
    const frames = Array.from({ length: 30 }, (_, i) => frame(i * 33, true, HOLA_HAND));
    const res = framesToClip(frames);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const k = res.clip.keyframes[0]!;
    const chestUp = -0.15 * ARM;
    expect(k.hand.x).toBeCloseTo(0.1 / (1.2 * ARM), 2);
    expect(k.hand.y).toBeCloseTo(0.35 + (0.35 * (0.16 - chestUp)) / (0.2 - chestUp), 2);
    expect(k.hand.z).toBeCloseTo((0.31 / ARM - 0.55) / 0.9, 2);
    expect(k.hand.palmDir![2]).toBeGreaterThan(0.99);
    expect(k.hand.pointDir![1]).toBeGreaterThan(0.99);
    expect(res.clip.handedness).toBe("one");
    expect(res.templates.length).toBeGreaterThan(0);
  });

  it("recorta el reposo antes y después del signo", () => {
    const frames = Array.from({ length: 40 }, (_, i) =>
      i >= 10 && i < 30 ? frame(i * 33, true, HOLA_HAND) : frame(i * 33, false),
    );
    const res = framesToClip(frames);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.stats.durationMs).toBe((31 - 8) * 33);
  });

  it("falla con un mensaje claro si la mano no se levanta", () => {
    const frames = Array.from({ length: 20 }, (_, i) => frame(i * 33, false));
    const res = framesToClip(frames);
    expect(res.ok).toBe(false);
  });

  it("signante zurdo: la mano izquierda anima la derecha del avatar en espejo", () => {
    const outwardUp = unit(add(U, mul(R, -0.3)));
    const leftHand = makeHand("left", outwardUp, F);
    const frames: CaptureFrame[] = Array.from({ length: 20 }, (_, i) => ({
      t: i * 33,
      poseWorld: pose(DOWN_RIGHT, RAISED_LEFT),
      hands: { left: { world: leftHand, image: image(leftHand) } },
    }));
    const res = framesToClip(frames, { leftHanded: true });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const k = res.clip.keyframes[0]!;
    expect(k.hand.x).toBeGreaterThan(0.1);
    expect(k.hand.pointDir![0]).toBeGreaterThan(0.2);
    expect(k.hand.palmDir![2]).toBeGreaterThan(0.95);
  });

  it("asigna cada mano al lado anatómico por cercanía a las muñecas de la pose", () => {
    const poseImage: Point3[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 }));
    poseImage[15] = { x: 0.7, y: 0.5, z: 0 };
    poseImage[16] = { x: 0.3, y: 0.5, z: 0 };
    const at = (x: number) => ({ world: [], image: [{ x, y: 0.5, z: 0 }] });
    const both = assignHands(poseImage, [at(0.69), at(0.31)]);
    expect(both.right?.image[0]!.x).toBe(0.31);
    expect(both.left?.image[0]!.x).toBe(0.69);
    expect(assignHands(poseImage, [at(0.68)]).left).toBeDefined();
  });
});
