import { describe, expect, it } from "vitest";
import {
  assignHands,
  FACE_BLENDSHAPES,
  faceCoords,
  fingerFlex,
  fingerPose,
  framesToClip,
  handOrientation,
  mirroredHand,
  thumbTip,
  thumbTouch,
  withArmDepth,
  type CaptureFrame,
  type Landmark,
} from "@/lib/avatar/capture";
import type { Point3 } from "@/lib/mediapipe/types";
import { sampleClip } from "@/lib/avatar/interpolate";
import { getFingerFlex } from "@/lib/avatar/pose";

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
const sub3 = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

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
/** La mano en la imagen donde está de verdad (cámara ortográfica): para ver una mano junto a la otra. */
const imageAt = (h: Point3[], wrist: Vec) =>
  h.map((p) => ({ x: 0.5 + wrist[0] + p.x - h[0]!.x, y: 0.5 + wrist[1] + p.y - h[0]!.y, z: p.z }));

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
    const open = fingerFlex(HOLA_HAND, "right");
    const fist = fingerFlex(makeHand("right", U, F, true), "right");
    for (let i = 1; i < 5; i++) {
      expect(open[i]).toBeLessThan(0.1);
      expect(fist[i]).toBeGreaterThan(0.9);
    }
  });

  it("el temblor de los landmarks no se mide como flexión, con cualquier mano", () => {
    // Mano abierta con cada articulación desviada ±25° hacia la palma o el dorso,
    // como sale en vídeo: con ángulos sin signo sumaba 75° y daba flexión 0.35.
    const jitter = (side: "left" | "right", palm: Vec) => {
      const h = makeHand(side, U, palm);
      const tilt = Math.tan((25 * Math.PI) / 180) * 0.02;
      for (const base of [5, 9, 13, 17]) {
        [1, -1, 1].forEach((s, k) => {
          for (let j = base + 1 + k; j <= base + 3; j++) {
            const p = add([h[j]!.x, h[j]!.y, h[j]!.z], mul(palm, s * tilt));
            h[j] = { x: p[0], y: p[1], z: p[2] };
          }
        });
      }
      return h;
    };
    for (const side of ["right", "left"] as const) {
      const open = fingerFlex(jitter(side, F), side);
      const fist = fingerFlex(makeHand(side, U, F, true), side);
      for (let i = 1; i < 5; i++) {
        expect(open[i]).toBeLessThan(0.25);
        expect(fist[i]).toBeGreaterThan(0.9);
      }
    }
  });

  it("calibrada con vídeo real: 55° es un dedo estirado y 165°, uno cerrado", () => {
    // Dedo recto que sale del nudillo girado `deg` hacia la palma (toda la flexión en él).
    const bent = (deg: number) => {
      const h = makeHand("right", U, F);
      const r = (deg * Math.PI) / 180;
      const dir = add(mul(U, Math.cos(r)), mul(F, Math.sin(r)));
      for (const base of [5, 9, 13, 17]) {
        const m: Vec = [h[base]!.x, h[base]!.y, h[base]!.z];
        [0.04, 0.065, 0.085].forEach((d, k) => {
          const p = add(m, mul(dir, d));
          h[base + 1 + k] = { x: p[0], y: p[1], z: p[2] };
        });
      }
      return fingerFlex(h, "right");
    };
    for (let i = 1; i < 5; i++) {
      expect(bent(55)[i]).toBeLessThan(0.15);
      expect(bent(110)[i]).toBeGreaterThan(0.35);
      expect(bent(110)[i]).toBeLessThan(0.65);
      expect(bent(165)[i]).toBeGreaterThan(0.85);
    }
  });

  it("descarta la mano reflejada en profundidad (dedos doblados hacia el dorso)", () => {
    const mirror = (h: Point3[]) => h.map((p) => ({ x: p.x, y: p.y, z: -p.z }));
    const fist = makeHand("right", U, F, true);
    expect(mirroredHand(fist, "right")).toBe(false);
    expect(mirroredHand(mirror(fist), "right")).toBe(true);
    // La otra mano asignada por error también sale reflejada.
    expect(mirroredHand(makeHand("left", U, F, true), "right")).toBe(true);
    // Con la mano plana no hay forma de saberlo: se acepta.
    expect(mirroredHand(mirror(HOLA_HAND), "right")).toBe(false);
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
    // Media distancia entre los hombros, en brazos: el avatar sabe dónde está el centro del cuerpo.
    expect(res.clip.shoulderX).toBeCloseTo(0.18 / ARM, 2);
  });

  it("con el cuerpo girado respecto a la cámara lo guarda (bodyYaw) y mide las manos respecto al cuerpo", () => {
    // Todo girado `a` hacia la derecha del signante alrededor de la vertical.
    const turned = (a: number) => {
      const r2 = add(mul(R, Math.cos(a)), mul(F, -Math.sin(a)));
      const f2 = add(mul(F, Math.cos(a)), mul(R, Math.sin(a)));
      const turn = (p: { x: number; y: number; z: number }) => {
        const q: Vec = [p.x, p.y, p.z];
        const v = add(mul(r2, dot3(q, R)), mul(U, dot3(q, U)), mul(f2, dot3(q, F)));
        return { ...p, x: v[0], y: v[1], z: v[2] };
      };
      return framesToClip(
        Array.from({ length: 30 }, (_, i) => {
          const f = frame(i * 33, true, HOLA_HAND);
          return { ...f, poseWorld: f.poseWorld!.map(turn), hands: { right: { world: HOLA_HAND.map(turn), image: image(HOLA_HAND) } } };
        }),
      );
    };
    const front = turned(0);
    const side = turned(0.4);
    expect(front.ok && side.ok).toBe(true);
    if (!front.ok || !side.ok) return;
    expect(front.clip.bodyYaw).toBeUndefined();
    expect(side.clip.bodyYaw).toBeCloseTo(0.4, 2);
    const [a, b] = [front.clip.keyframes[0]!.hand, side.clip.keyframes[0]!.hand];
    expect(b.x).toBeCloseTo(a.x, 2);
    expect(b.z).toBeCloseTo(a.z, 2);
    // Un poco de giro (la mitad de los signantes, menos de 4°) no cuenta.
    const slight = turned(0.1);
    expect(slight.ok && slight.clip.bodyYaw).toBeUndefined();
  });

  it("por encima de la boca la altura se cuenta en la cara: la muñeca a la altura de los ojos es 0.85", () => {
    const frames: CaptureFrame[] = Array.from({ length: 20 }, (_, i) => {
      const p = pose({ elbow: add(R_SH, signer(0.08, 0.02, 0.25)), wrist: add(R_SH, signer(0.1, 0.28, 0.31)) }, DOWN_LEFT);
      p[2] = pt(signer(-0.03, 0.28, 0.1)); // ojos a 0.28 sobre los hombros; boca a 0.2
      p[5] = pt(signer(0.03, 0.28, 0.1));
      return { t: i * 33, poseWorld: p, hands: { right: { world: HOLA_HAND, image: image(HOLA_HAND) } } };
    });
    const res = framesToClip(frames);
    if (!res.ok) throw new Error(res.error);
    expect(res.clip.keyframes[0]!.hand.y).toBeCloseTo(0.85, 3);
  });

  it("cerca de la cara manda la altura de la imagen (la pose en 3D baja la muñeca levantada)", () => {
    // En 3D la muñeca está a la altura de la boca (0.2); en la imagen, a la de los ojos.
    const img: Point3[] = [];
    img[2] = { x: 0.55, y: 0.3, z: 0 };
    img[5] = { x: 0.45, y: 0.3, z: 0 };
    img[9] = { x: 0.53, y: 0.37, z: 0 };
    img[10] = { x: 0.47, y: 0.37, z: 0 };
    img[16] = { x: 0.3, y: 0.3, z: 0 };
    const frames: CaptureFrame[] = Array.from({ length: 20 }, (_, i) => {
      const p = pose({ elbow: add(R_SH, signer(0.08, 0.0, 0.25)), wrist: add(R_SH, signer(0.1, 0.2, 0.31)) }, DOWN_LEFT);
      p[2] = pt(signer(-0.03, 0.28, 0.1));
      p[5] = pt(signer(0.03, 0.28, 0.1));
      return { t: i * 33, poseWorld: p, poseImage: img, aspect: 1, hands: { right: { world: HOLA_HAND, image: image(HOLA_HAND) } } };
    });
    const res = framesToClip(frames);
    if (!res.ok) throw new Error(res.error);
    expect(res.clip.keyframes[0]!.hand.y).toBeCloseTo(0.85, 2);
  });

  it("recorta el reposo antes y después del signo", () => {
    const frames = Array.from({ length: 40 }, (_, i) =>
      i >= 10 && i < 30 ? frame(i * 33, true, HOLA_HAND) : frame(i * 33, false),
    );
    const res = framesToClip(frames);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.stats.durationMs).toBe((31 - 8) * 33);
    // El t = 0 del clip en la grabación, para compararlo con el vídeo.
    expect(res.stats.startMs).toBe(8 * 33);
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

  it("la mano pasiva cuenta aunque MediaPipe la dé reflejada casi siempre (plana y de canto)", () => {
    const fist = makeHand("left", U, F, true);
    const reflected = fist.map((p) => ({ ...p, z: -p.z }));
    expect(mirroredHand(reflected, "left")).toBe(true);
    // Solo uno de cada cuatro fotogramas sirve para la forma: antes no llegaba a contar como levantada.
    const frames: CaptureFrame[] = Array.from({ length: 30 }, (_, i) => {
      const left = i % 4 === 0 ? fist : reflected;
      return {
        t: i * 33,
        poseWorld: pose(RAISED_RIGHT, RAISED_LEFT),
        hands: { right: { world: HOLA_HAND, image: image(HOLA_HAND) }, left: { world: left, image: image(left) } },
      };
    });
    const res = framesToClip(frames);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.clip.handedness).toBe("two");
    // La forma, de los fotogramas que sirven: el puño (la dominante está abierta).
    const k = res.clip.keyframes[0]!;
    expect(k.hand2).toBeDefined();
    expect(getFingerFlex(k.fingers2![1]!)).toBeGreaterThan(getFingerFlex(k.fingers[1]!) + 0.3);
  });

  describe("contactos detectados en la grabación", () => {
    // Cara del signante: nariz algo por encima y delante de la boca, ojos, orejas.
    const withFace = (p: Landmark[]) => {
      p[0] = pt(signer(0, 0.24, 0.12));
      p[2] = pt(signer(-0.03, 0.28, 0.1));
      p[3] = pt(signer(-0.05, 0.28, 0.09));
      p[5] = pt(signer(0.03, 0.28, 0.1));
      p[6] = pt(signer(0.05, 0.28, 0.09));
      p[7] = pt(signer(-0.08, 0.26, 0.02));
      p[8] = pt(signer(0.08, 0.26, 0.02));
      return p;
    };
    // Barbilla = boca − 1,8·(nariz − boca), como en detectTouch.
    const CHIN = signer(0, 0.2 - 1.8 * 0.04, 0.1 - 1.8 * 0.02);
    const hand = makeHand("right", U, mul(F, -1));
    const indexOffset: Vec = [hand[8]!.x - hand[0]!.x, hand[8]!.y - hand[0]!.y, hand[8]!.z - hand[0]!.z];
    // `gap`: separación en el plano de la imagen (bajo la barbilla); `depth`: por delante.
    const touching = (gap: number, depth = 0): CaptureFrame[] =>
      Array.from({ length: 20 }, (_, i) => {
        const wrist = add(CHIN, mul(indexOffset, -1), signer(0, -gap, depth));
        const p = withFace(pose({ elbow: add(R_SH, signer(0.05, -0.1, 0.2)), wrist }, DOWN_LEFT));
        return { t: i * 33, poseWorld: p, hands: { right: { world: hand, image: image(hand) } } };
      });

    it("el índice en la barbilla se anota como contacto pleno", () => {
      const res = framesToClip(touching(0));
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.clip.keyframes[0]!.hand.contact).toEqual({ at: "chin", with: "index", weight: 1 });
    });

    it("un acercamiento breve a medio camino es contacto parcial; mantenido, pleno; lejos, ninguno", () => {
      const away = touching(0.2);
      const halfway = touching(0.05);
      // Tres fotogramas (menos de TOUCH_HOLD_MS) a 5 cm de la barbilla.
      const brief = framesToClip(away.map((f, i) => (i >= 9 && i <= 11 ? halfway[i]! : f)));
      const held = framesToClip(halfway);
      const far = framesToClip(touching(0.15));
      if (!brief.ok || !held.ok || !far.ok) throw new Error("clip");
      const w = Math.max(...brief.clip.keyframes.map((k) => k.hand.contact?.weight ?? 0));
      expect(w).toBeGreaterThan(0.2);
      expect(w).toBeLessThan(0.9);
      expect(held.clip.keyframes[0]!.hand.contact?.weight).toBeGreaterThanOrEqual(0.9);
      expect(far.clip.keyframes[0]!.hand.contact).toBeUndefined();
    });

    it("un contacto que parpadea es un solo tramo; un roce de un fotograma no cuenta", () => {
      const near = touching(0);
      const away = touching(0.2);
      // Uno de cada tres fotogramas la detección se aleja: sigue siendo el mismo contacto.
      const flicker = framesToClip(near.map((f, i) => (i % 3 === 1 ? away[i]! : f)));
      if (!flicker.ok) throw new Error(flicker.error);
      for (const k of flicker.clip.keyframes) {
        expect(k.hand.contact).toEqual({ at: "chin", with: "index", weight: 1 });
      }
      const brush = framesToClip(away.map((f, i) => (i === 10 ? near[i]! : f)));
      if (!brush.ok) throw new Error(brush.error);
      expect(brush.clip.keyframes.some((k) => k.hand.contact)).toBe(false);
    });

    it("cuenta el contacto aunque la pose ponga la mano por delante de la cara", () => {
      // Con el brazo levantado MediaPipe adelanta la muñeca 15-30 cm aunque toque la cara.
      const res = framesToClip(touching(0, 0.2));
      if (!res.ok) throw new Error(res.error);
      expect(res.clip.keyframes[0]!.hand.contact).toMatchObject({ at: "chin", with: "index" });
      expect(res.clip.keyframes[0]!.hand.contact!.weight).toBeGreaterThan(0.5);
    });

    describe("junto a la oreja, en la imagen", () => {
      // Cara en la imagen: media distancia entre ojos 0,05 y de los ojos a la boca 0,07; la
      // oreja derecha del signante (a la izquierda de la imagen) en h = 3, algo girada.
      const faceImg: Point3[] = [];
      faceImg[2] = { x: 0.55, y: 0.3, z: 0 };
      faceImg[5] = { x: 0.45, y: 0.3, z: 0 };
      faceImg[7] = { x: 0.62, y: 0.314, z: 0 };
      faceImg[8] = { x: 0.35, y: 0.314, z: 0 };
      faceImg[9] = { x: 0.53, y: 0.37, z: 0 };
      faceImg[10] = { x: 0.47, y: 0.37, z: 0 };
      const at = (h: number, v: number) => ({ x: 0.5 - 0.05 * h, y: 0.3 - 0.07 * v });
      // La yema del índice en (h, v) de la imagen; en 3D, 30 cm por delante de la oreja, como
      // pone MediaPipe la mano con el brazo levantado aunque la toque.
      const beside = (h: number, v: number): CaptureFrame[] => {
        const tip = at(h, v);
        const img = hand.map((p) => ({ x: tip.x + p.x - hand[8]!.x, y: tip.y + p.y - hand[8]!.y, z: p.z }));
        const wrist = add(signer(0.08, 0.26, 0.32), mul(indexOffset, -1));
        return Array.from({ length: 20 }, (_, i) => {
          const p = withFace(pose({ elbow: add(R_SH, signer(0.1, 0, 0.2)), wrist }, DOWN_LEFT));
          const poseImage = [...faceImg];
          poseImage[16] = img[0]!;
          return { t: i * 33, poseWorld: p, poseImage, aspect: 1, hands: { right: { world: hand, image: img } } };
        });
      };

      it("las yemas en la oreja, fuera del contorno de la cara, son un contacto con ella", () => {
        const res = framesToClip(beside(3.5, -0.2));
        if (!res.ok) throw new Error(res.error);
        const c = res.clip.keyframes[0]!.hand.contact;
        expect(c).toMatchObject({ at: "ear", with: "tips" });
        expect(c!.weight).toBeGreaterThanOrEqual(0.9);
        // Fuera del contorno de la cara (h = 2,5 de oreja a oreja).
        expect(c!.face![0]).toBeGreaterThan(2.5);
      });

      it("sin tocarla, guarda a qué lado de la cara queda la palma (faceH)", () => {
        const res = framesToClip(beside(6, 1));
        if (!res.ok) throw new Error(res.error);
        const k = res.clip.keyframes[0]!;
        expect(k.hand.contact).toBeUndefined();
        expect(k.hand.faceH).toBeGreaterThan(5);
        expect(k.hand.faceH).toBeLessThan(6);
      });
    });

    it("la mano dominante sobre la palma de la otra toca otherPalm; por detrás, otherBack", () => {
      // Mano pasiva con la palma hacia arriba delante del pecho.
      const baseWrist = add(L_SH, signer(0.1, -0.1, 0.3));
      const base = makeHand("left", unit(add(F, mul(R, 0.5))), U);
      const baseCenter = (() => {
        const ids = [0, 5, 17];
        const m = ids.reduce<Vec>((a, i) => add(a, [base[i]!.x - base[0]!.x, base[i]!.y - base[0]!.y, base[i]!.z - base[0]!.z]), [0, 0, 0]);
        return add(baseWrist, mul(m, 1 / 3));
      })();
      const run = (above: number) => {
        const frames: CaptureFrame[] = Array.from({ length: 20 }, (_, i) => {
          const wrist = add(baseCenter, mul(indexOffset, -1), signer(0, above, 0));
          const p = pose({ elbow: add(R_SH, signer(0.05, -0.2, 0.2)), wrist }, { elbow: add(L_SH, signer(-0.05, -0.25, 0.15)), wrist: baseWrist });
          return {
            t: i * 33,
            poseWorld: p,
            hands: { right: { world: hand, image: imageAt(hand, wrist) }, left: { world: base, image: imageAt(base, baseWrist) } },
          };
        });
        const res = framesToClip(frames);
        if (!res.ok) throw new Error(res.error);
        return res.clip.keyframes[0]!.hand.contact;
      };
      const palm = run(0.01);
      const back = run(-0.01);
      expect(palm?.at).toBe("otherPalm");
      expect(back?.at).toBe("otherBack");
      // El punto exacto: una articulación de la palma y, desde ella, hacia la palma o el dorso.
      for (const c of [palm, back]) expect([0, 1, 5, 9, 13, 17, 21]).toContain(c!.hand![0]);
      expect(palm!.hand![3]).toBeGreaterThan(0);
      expect(back!.hand![3]).toBeLessThan(0);
    });

    it("si antes de tocar la otra mano pasa por la cara, el contacto empieza al tocarla", () => {
      const baseWrist = add(L_SH, signer(0.1, -0.1, 0.3));
      const base = makeHand("left", unit(add(F, mul(R, 0.5))), U);
      const baseCenter = add(baseWrist, mul([0, 5, 17].reduce<Vec>((a, i) => add(a, [base[i]!.x - base[0]!.x, base[i]!.y - base[0]!.y, base[i]!.z - base[0]!.z]), [0, 0, 0]), 1 / 3));
      const onPalm = (i: number): CaptureFrame => {
        const wrist = add(baseCenter, mul(indexOffset, -1), signer(0, 0.01, 0));
        const p = pose({ elbow: add(R_SH, signer(0.05, -0.2, 0.2)), wrist }, { elbow: add(L_SH, signer(-0.05, -0.25, 0.15)), wrist: baseWrist });
        return { t: i * 33, poseWorld: p, hands: { right: { world: hand, image: imageAt(hand, wrist) }, left: { world: base, image: imageAt(base, baseWrist) } } };
      };
      // Seis fotogramas con el índice en la barbilla y, sin soltar, sobre la palma de la otra.
      const chin = touching(0);
      const res = framesToClip(Array.from({ length: 20 }, (_, i) => (i < 6 ? chin[i]! : onPalm(i))));
      if (!res.ok) throw new Error(res.error);
      const at = (t: number) => res.clip.keyframes.find((k) => k.t === t)?.hand.contact?.at;
      expect(at(0)).toBeUndefined();
      expect(at(100)).toBeUndefined();
      expect(at(300)).toBe("otherPalm");
    });
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

describe("capture: dónde toca en la cara, en la imagen", () => {
  // Signante de frente, sin espejo: su ojo izquierdo (2) sale a la derecha de la imagen.
  const img: Point3[] = [];
  img[2] = { x: 0.55, y: 0.3, z: 0 };
  img[5] = { x: 0.45, y: 0.3, z: 0 };
  img[9] = { x: 0.53, y: 0.37, z: 0 };
  img[10] = { x: 0.47, y: 0.37, z: 0 };

  it("la boca es (0, −1) y la sien derecha, a la izquierda de la imagen, h positivo", () => {
    expect(faceCoords(img, 1, { x: 0.5, y: 0.37 })).toEqual([0, -1]);
    const [h, v] = faceCoords(img, 1, { x: 0.39, y: 0.28 })!;
    expect(h).toBeCloseTo(2.2, 5);
    expect(v).toBeCloseTo(0.29, 2);
  });

  it("no depende del tamaño ni del ancho del vídeo", () => {
    const wide = img.map((p) => (p ? { ...p, x: 0.5 + (p.x - 0.5) / 2 } : p));
    expect(faceCoords(wide, 2, { x: 0.5 + (0.39 - 0.5) / 2, y: 0.28 })).toEqual(faceCoords(img, 1, { x: 0.39, y: 0.28 }));
  });
});

describe("capture: forma de cada dedo", () => {
  // Mano derecha con los dedos hacia arriba y la palma al frente; cada dedo se dobla
  // `mcp` en el nudillo y `pip` en las falanges, y se abre `az` hacia el pulgar.
  const P: Vec = U;
  const N: Vec = F;
  const A: Vec = cross(P, N); // lado del índice (makeHand pone el índice en cross(point, palm))
  const rotate = (v: Vec, toward: Vec, deg: number): Vec => {
    const r = (deg * Math.PI) / 180;
    return add(mul(v, Math.cos(r)), mul(toward, Math.sin(r)));
  };
  const handShaped = (mcp: number, pip: number, az = 0) => {
    const h = makeHand("right", P, N);
    for (const base of [5, 9, 13, 17]) {
      const m: Vec = [h[base]!.x, h[base]!.y, h[base]!.z];
      // MediaPipe dobla ~14° el nudillo y ~3° la falange con la mano estirada.
      const d1 = rotate(rotate(P, A, az), N, mcp + 14);
      const n1 = unit(sub3(N, mul(d1, dot3(N, d1))));
      const d2 = rotate(d1, n1, pip + 3);
      const pts = [add(m, mul(d1, 0.04)), add(m, mul(d1, 0.04), mul(d2, 0.025)), add(m, mul(d1, 0.04), mul(d2, 0.045))];
      pts.forEach((q, k) => (h[base + 1 + k] = { x: q[0], y: q[1], z: q[2] }));
    }
    return h;
  };
  const shaped = (mcp: number, pip: number, az = 0) => fingerPose(handShaped(mcp, pip, az), "right");
  const deg = (r: number) => (r * 180) / Math.PI;

  it("distingue la B doblada (solo el nudillo) de la garra (solo las falanges)", () => {
    const bent = shaped(80, 0);
    const claw = shaped(0, 90);
    for (let i = 1; i < 5; i++) {
      expect(deg(bent[i]![1])).toBeGreaterThan(70);
      expect(Math.abs(deg(bent[i]![2]))).toBeLessThan(15);
      expect(Math.abs(deg(claw[i]![1]))).toBeLessThan(15);
      expect(deg(claw[i]![2])).toBeGreaterThan(80);
    }
  });

  it("con la palma de frente a la cámara, la separación de los dedos sale de la imagen", () => {
    // En 3D juntos (la profundidad engaña); en la imagen, abiertos 20°.
    const flat = (h: Point3[]) => ({ points: h.map((q) => ({ x: 0.5 + q.x, y: 0.5 + q.y, z: 0 })), aspect: 1 });
    const together = shaped(0, 0, 0);
    const seen = fingerPose(handShaped(0, 0, 0), "right", flat(handShaped(0, 0, 20)));
    for (let i = 1; i < 5; i++) expect(deg(seen[i]![0] - together[i]![0])).toBeCloseTo(20, 0);
    // El pulgar no está en el plano de la palma: sigue en 3D.
    expect(seen[0]![0]).toBeCloseTo(together[0]![0], 5);
  });

  it("mide la separación de los dedos estirados", () => {
    const together = shaped(0, 0, 0);
    const spread = shaped(0, 0, 20);
    for (let i = 1; i < 5; i++) expect(deg(spread[i]![0] - together[i]![0])).toBeCloseTo(20, 0);
  });
});

describe("capture: suavizado según la velocidad", () => {
  // 1 s quieta con temblor de ±1 cm y luego 1 s oscilando ±8 cm a 3 Hz (como ADIÓS),
  // comparado con el suavizado fijo de antes (σ 60 ms).
  let seed = 7;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.02;
  const frames: CaptureFrame[] = Array.from({ length: 50 }, (_, i) => {
    const t = i * 40;
    const dx = t < 1000 ? noise() : 0.08 * Math.sin(2 * Math.PI * 3 * ((t - 1000) / 1000));
    const wrist = add(RAISED_RIGHT.wrist, signer(dx, 0, 0));
    return { t, poseWorld: pose({ elbow: RAISED_RIGHT.elbow, wrist }, DOWN_LEFT), hands: { right: { world: HOLA_HAND, image: image(HOLA_HAND) } } };
  });
  const clipOf = (opts: Parameters<typeof framesToClip>[1]) => {
    const r = framesToClip(frames, opts);
    if (!r.ok) throw new Error(r.error);
    return r.clip;
  };
  const spread = (clip: ReturnType<typeof clipOf>, from: number, to: number) => {
    const xs: number[] = [];
    for (let t = from; t <= to; t += 10) xs.push(sampleClip(clip, t).hand.x);
    return Math.max(...xs) - Math.min(...xs);
  };
  // Sin quitar keyframes, para comparar solo el filtro.
  const adaptive = clipOf({ simplify: false });
  const fixed = clipOf({ smoothing: 60, simplify: false });

  // Temblor: aceleración media (segundas diferencias) de la muñeca.
  const roughness = (clip: ReturnType<typeof clipOf>, from: number, to: number) => {
    const xs: number[] = [];
    for (let t = from; t <= to; t += 20) xs.push(sampleClip(clip, t).hand.x);
    let acc = 0;
    for (let i = 1; i + 1 < xs.length; i++) acc += Math.abs(xs[i + 1]! - 2 * xs[i]! + xs[i - 1]!);
    return acc / (xs.length - 2);
  };

  it("con la mano quieta tiembla bastante menos", () => {
    expect(roughness(adaptive, 200, 800)).toBeLessThan(0.7 * roughness(fixed, 200, 800));
  });

  it("un golpe de dedos con la muñeca quieta no se aplana (los dedos se suavizan por su cuenta)", () => {
    const open = HOLA_HAND;
    const curled = makeHand("right", U, F, true);
    const flick: CaptureFrame[] = Array.from({ length: 40 }, (_, i) => {
      const hand = i >= 18 && i < 22 ? curled : open; // cerrar y abrir en 160 ms
      return { t: i * 40, poseWorld: pose(RAISED_RIGHT, DOWN_LEFT), hands: { right: { world: hand, image: image(hand) } } };
    });
    const r = framesToClip(flick);
    if (!r.ok) throw new Error(r.error);
    // Nudillo del índice: estirado ≈ 0, cerrado ≈ 1,66 rad en esta mano sintética.
    const mcps: number[] = [];
    for (let t = 0; t <= r.clip.duration; t += 10) mcps.push((sampleClip(r.clip, t).fingers[1] as number[])[1]!);
    const shut = fingerPose(curled, "right")[1]![1];
    expect(Math.max(...mcps)).toBeGreaterThan(0.8 * shut);
  });

  it("una oscilación rápida conserva su amplitud", () => {
    expect(spread(adaptive, 1100, 1900)).toBeGreaterThan(0.85 * spread(fixed, 1100, 1900));
  });
});

describe("capture: cabeza, cara y codo", () => {
  // Giro de la cabeza sobre el eje vertical de la cámara (matriz 3×3 por filas). Con θ < 0
  // la cara mira hacia la izquierda de la imagen, que es la derecha del signante.
  const yawMatrix = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];
  };
  const blend = (values: Partial<Record<(typeof FACE_BLENDSHAPES)[number], number>>) =>
    FACE_BLENDSHAPES.map((n) => values[n] ?? 0);
  // La signante tiene las cejas algo bajas en reposo; la cámara está girada 5°.
  const NEUTRAL = { browDownLeft: 0.3, browDownRight: 0.3, mouthSmileLeft: 0.1, mouthSmileRight: 0.1 };
  const frames: CaptureFrame[] = Array.from({ length: 40 }, (_, i) => {
    const signing = i >= 10 && i < 30;
    return {
      ...frame(i * 40, signing, signing ? HOLA_HAND : undefined),
      headR: yawMatrix(signing ? 5 - 15 : 5),
      faceBlend: blend(signing ? { ...NEUTRAL, browDownLeft: 0.7, browDownRight: 0.7, jawOpen: 0.03 } : NEUTRAL),
    };
  });
  const res = framesToClip(frames, { simplify: false });
  if (!res.ok) throw new Error(res.error);
  const mid = sampleClip(res.clip, res.clip.duration / 2);

  it("el giro de la cabeza, respecto a como la tiene en reposo", () => {
    expect(mid.head![0]).toBeCloseTo((15 * Math.PI) / 180, 2);
    expect(Math.abs(mid.head![1])).toBeLessThan(0.01);
    expect(Math.abs(mid.head![2])).toBeLessThan(0.01);
  });

  it("los gestos de la cara, lo que se apartan de su cara neutra y sin el temblor", () => {
    expect(mid.expr?.browDown).toBeGreaterThan(0.95);
    // La boca apenas se mueve (dentro de la zona muerta) y la sonrisa es la de reposo.
    expect(mid.expr?.jaw ?? 0).toBe(0);
    expect(mid.expr?.smile ?? 0).toBe(0);
  });

  it("el codo sale de la línea hombro→muñeca hacia abajo y adelante", () => {
    const e = mid.hand.elbowDir!;
    expect(e[0]).toBeCloseTo(-0.01, 1);
    expect(e[1]).toBeCloseTo(-0.89, 1);
    expect(e[2]).toBeCloseTo(0.46, 1);
  });

  it("sin cara ni giro no guarda nada de la cabeza", () => {
    const plain = framesToClip(frames.map(({ headR: _h, faceBlend: _f, ...f }) => f));
    expect(plain.ok && plain.clip.keyframes.some((k) => k.head || k.expr)).toBe(false);
  });
});

describe("capture: pinza del pulgar", () => {
  // Mano derecha con la palma hacia delante y los dedos hacia arriba (ver makeHand).
  const base = makeHand("right", U, F);
  const withThumbAt = (tip: Vec) => base.map((p, i) => (i === 4 ? { x: tip[0], y: tip[1], z: tip[2] } : p));
  const at = (p: Point3): Vec => [p.x, p.y, p.z];

  it("la yema del pulgar sobre la del índice es una pinza con el índice", () => {
    const t = thumbTouch(withThumbAt(add(at(base[8]!), mul(F, 0.015))));
    expect(t[0]).toBe(1);
    expect(t.slice(1).every((w) => w < 1)).toBe(true);
  });

  it("con el pulgar lejos no hay pinza", () => {
    expect(thumbTouch(base)).toEqual([0, 0, 0, 0]);
  });

  it("el pulgar sobre los dedos de un puño no cuenta (las yemas están en la palma)", () => {
    const fist = makeHand("right", U, F, true);
    const t = thumbTouch(fist.map((p, i) => (i === 4 ? { ...fist[12]! } : p)));
    expect(t).toEqual([0, 0, 0, 0]);
  });
});

describe("capture: yema del pulgar", () => {
  const palm = mul(F, -1);
  const across = cross(U, palm);
  const at = (x: number, y: number, z: number): Point3 => {
    const a = add(mul(U, x), mul(across, y), mul(palm, z));
    return { x: a[0], y: a[1], z: a[2] };
  };

  it("estirado: apunta hacia los dedos y hacia fuera, a un largo de pulgar de su base", () => {
    const tip = thumbTip(makeHand("right", U, palm), "right");
    expect(Math.hypot(...tip)).toBeGreaterThan(0.95);
    expect(tip[0]).toBeGreaterThan(0.5);
    expect(tip[1]).toBeGreaterThan(0.3);
  });

  it("doblado sobre la palma (el 4): más cerca de su base, hacia el meñique y por delante de la palma", () => {
    const hand = makeHand("right", U, palm);
    hand[3] = at(0.05, 0, 0.025);
    hand[4] = at(0.055, -0.02, 0.02);
    const tip = thumbTip(hand, "right");
    expect(Math.hypot(...tip)).toBeLessThan(0.8);
    expect(tip[1]).toBeLessThan(0);
    expect(tip[2]).toBeGreaterThan(0);
    // No depende de lo grande que se vea la mano.
    const big = thumbTip(hand.map((p) => ({ x: 2 * p.x, y: 2 * p.y, z: 2 * p.z })), "right");
    big.forEach((x, k) => expect(x).toBeCloseTo(tip[k]!, 6));
  });
});

describe("capture: profundidad del brazo desde la imagen", () => {
  // Pose de MediaPipe (x a la derecha de la imagen, y abajo, z hacia dentro): hombros,
  // codos y muñecas; en la imagen, lo mismo sin la profundidad (1 unidad = 1 m).
  const at = (x: number, y: number, z: number): Landmark => ({ x, y, z, visibility: 1 });
  const frame = (t: number, rightWrist: [number, number, number], rightWristImg: [number, number]): CaptureFrame => {
    const world: Landmark[] = Array.from({ length: 17 }, () => at(0, 0, 0));
    const image: Landmark[] = [];
    const put = (i: number, w: [number, number, number], img: [number, number] = [w[0], w[1]]) => {
      world[i] = at(...w);
      image[i] = at(0.5 + img[0], 0.3 + img[1], 0);
    };
    put(11, [0.18, 0, 0]);
    put(12, [-0.18, 0, 0]);
    put(13, [0.18, 0.26, 0]);
    put(14, [-0.18, 0.26, 0]);
    put(15, [0.18, 0.49, 0]);
    put(16, rightWrist, rightWristImg);
    return { t, poseWorld: world, poseImage: image, aspect: 1, hands: {} };
  };
  // En reposo, los brazos caídos (en el plano de la imagen); luego el antebrazo derecho
  // vertical en la imagen y, en 3D, casi horizontal hacia la cámara.
  const rest = Array.from({ length: 6 }, (_, i) => frame(i * 33, [-0.18, 0.49, 0], [-0.18, 0.49]));
  const up = frame(300, [-0.18, 0.21, -0.22], [-0.18, 0.09]);

  it("rehace la profundidad con lo que el antebrazo se ve en la imagen", () => {
    const out = withArmDepth([...rest, up]);
    const wrist = out[out.length - 1]!.poseWorld![16]!;
    // Sube 0,17 m (lo que se ve) y se adelanta lo que le falta para medir 0,23 m.
    expect(wrist.y).toBeCloseTo(0.09, 2);
    expect(wrist.z).toBeCloseTo(-Math.sqrt(0.23 ** 2 - 0.17 ** 2), 2);
    // El hombro y el brazo que no cambia, igual.
    expect(out[out.length - 1]!.poseWorld![12]).toEqual(up.poseWorld![12]);
    expect(out[out.length - 1]!.poseWorld![15]!.z).toBeCloseTo(0, 5);
  });

  it("sin los brazos en la imagen, la pose tal cual", () => {
    const noArms = [...rest, up].map((f) => ({ ...f, poseImage: f.poseImage!.map((q, i) => (i >= 11 ? { ...q, visibility: 0 } : q)) }));
    expect(withArmDepth(noArms)).toEqual(noArms);
  });
});
