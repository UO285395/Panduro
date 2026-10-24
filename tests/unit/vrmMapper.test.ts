import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { loopDuration } from "@/lib/avatar/interpolate";
import {
  fistKnuckle,
  fistWeights,
  loopBlink,
  pinchOutsideFist,
  restPalm,
  segmentDistance,
  unbendFingers,
} from "@/lib/avatar/vrmMapper";
import type { AvatarClip, AvatarKeyframe } from "@/lib/curriculum/schema";

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

describe("segmentDistance: distancia entre dos falanges", () => {
  it("segmentos paralelos, cruzados y que no llegan", () => {
    expect(segmentDistance(v(0, 0, 0), v(1, 0, 0), v(0, 1, 0), v(1, 1, 0))).toBeCloseTo(1, 6);
    expect(segmentDistance(v(-1, 0, 0), v(1, 0, 0), v(0, -1, 0.3), v(0, 1, 0.3))).toBeCloseTo(0.3, 6);
    // El más cercano es un extremo: del (1,0,0) al segmento que empieza en (2,0,0).
    expect(segmentDistance(v(0, 0, 0), v(1, 0, 0), v(2, 0, 0), v(3, 1, 0))).toBeCloseTo(1, 6);
  });

  it("con el primero desplazado, como si se moviera la mano", () => {
    const a = v(-1, 0, 0);
    const b = v(1, 0, 0);
    const c = v(0, -1, 0.3);
    const d = v(0, 1, 0.3);
    expect(segmentDistance(a, b, c, d, v(0, 0, 0.3))).toBeCloseTo(0, 6);
    expect(segmentDistance(a, b, c, d, v(0, 0, -0.2))).toBeCloseTo(0.5, 6);
    // No cambia los vectores que recibe.
    expect(a.toArray()).toEqual([-1, 0, 0]);
  });

  it("un segmento degenerado es un punto", () => {
    expect(segmentDistance(v(0, 2, 0), v(0, 2, 0), v(-1, 0, 0), v(1, 0, 0))).toBeCloseTo(2, 6);
  });
});

describe("puño: dedos medidos que MediaPipe deja a medio cerrar", () => {
  type Fingers = AvatarKeyframe["fingers"];
  // NUM_1 del DILSE: índice estirado y los otros tres cerrados, con el nudillo corto.
  const num1: Fingers = [
    [0.16, 0.51, -0.28],
    [0.12, 0.2, 0.56],
    [-0.13, 0.82, 1.92],
    [-0.06, 1.17, 1.69],
    [-0.18, 0.98, 1.38],
  ];

  it("los dedos cerrados llevan el nudillo al de un puño; el estirado y el pulgar, no", () => {
    const w = fistWeights(num1);
    expect(w[0]).toBe(0);
    expect(w[1]).toBe(0);
    expect(w[2]).toBeCloseTo(1, 2);
    expect(w[3]).toBeCloseTo(1, 2);
    expect(fistKnuckle(0.82, w[2]!)).toBeCloseTo(1.45, 2);
    expect(fistKnuckle(0.2, w[1]!)).toBe(0.2);
  });

  it("el meñique va con el anular cerrado aunque se mida menos doblado", () => {
    expect(fistWeights(num1)[4]).toBeGreaterThan(0.95);
    // Con el anular estirado, el mismo meñique solo se corrige por sí mismo.
    const ringOut: Fingers = [num1[0]!, num1[1]!, num1[2]!, [0, 0.1, 0.1], num1[4]!];
    expect(fistWeights(ringOut)[4]).toBeLessThan(0.6);
  });

  it("una garra o una C (poco cerradas en total) y los dedos no medidos quedan igual", () => {
    expect(fistWeights([0, [0, 0.3, 1.4], [0, 0.6, 0.9], 0.5, { flex: 1 }])).toEqual([0, 0, 0, 0, 0]);
    expect(fistKnuckle(1.6, 1)).toBe(1.6);
  });

  it("la pinza no saca del puño un dedo cerrado, pero la de verdad se queda", () => {
    const [index, middle] = pinchOutsideFist([0, 0.98, 0, 0], num1);
    expect(index).toBe(0);
    expect(middle!).toBeLessThan(0.1);
    // DAR: índice algo doblado tocando el pulgar.
    const dar: Fingers = [[0, 0.5, 0.3], [0, 0.7, 0.9], [0, 0.8, 1.0], [0, 0.9, 1.0], [0, 0.9, 1.0]];
    expect(pinchOutsideFist([0.9, 0.5, 0, 0], dar)).toEqual([0.9, 0.5, 0, 0]);
  });
});

describe("restPalm: hacia dónde mira la palma en reposo", () => {
  // Un modelo que mira hacia +z: su derecha queda en -x.
  const forward = v(0, 0, 1);
  const right = v(-1, 0, 0);
  const left = v(1, 0, 0);

  it("en la pose en T, abajo, con el índice delante del meñique", () => {
    expect(restPalm("Right", right, v(-1, 0, 0.04), v(-1, 0, -0.04), forward).y).toBeCloseTo(-1, 6);
    expect(restPalm("Left", left, v(1, 0, 0.04), v(1, 0, -0.04), forward).y).toBeCloseTo(-1, 6);
  });

  it("con las palmas hacia arriba (el índice detrás), arriba", () => {
    expect(restPalm("Right", right, v(-1, 0, -0.04), v(-1, 0, 0.04), forward).y).toBeCloseTo(1, 6);
    expect(restPalm("Left", left, v(1, 0, -0.04), v(1, 0, 0.04), forward).y).toBeCloseTo(1, 6);
  });

  it("sin dedos, abajo", () => {
    expect(restPalm("Right", right, null, null, forward).y).toBeCloseTo(-1, 6);
  });
});

describe("unbendFingers: dedos con la palma de frente a la cámara", () => {
  type F = Parameters<typeof unbendFingers>[0];
  const hand = (el: number, bend: number): F =>
    [[0.5, 0.3, -0.3], [0, el, bend], [0, el, bend], [0, el, bend], [0, el, bend]] as F;

  it("lo poco doblado se endereza y el puño se queda", () => {
    const open = unbendFingers(hand(0.45, 0.55), [0, 0, 1]);
    expect((open[2] as number[])[1]).toBeLessThan(0.2);
    expect((open[2] as number[])[2]).toBeLessThan(0.25);
    const fist = unbendFingers(hand(1.5, 1.6), [0, 0, 1]);
    expect((fist[2] as number[])[1]).toBeCloseTo(1.5, 6);
    expect((fist[2] as number[])[2]).toBeCloseTo(1.6, 6);
  });

  it("con la palma de lado no cambia nada, y el pulgar nunca", () => {
    const side = hand(0.45, 0.55);
    expect(unbendFingers(side, [1, 0, 0])).toEqual(side);
    expect(unbendFingers(side, [0, 0, -1])[0]).toEqual(side[0]);
  });
});

describe("vrmMapper: parpadeo de un signo que se repite", () => {
  const clip: AvatarClip = {
    handedness: "one",
    duration: 1500,
    keyframes: [
      { t: 0, hand: { x: 0, y: 0.5, z: 0.3, rot: [0, 0, 0] }, fingers: [0, 0, 0, 0, 0] },
      { t: 1500, hand: { x: 0, y: 0.5, z: 0.3, rot: [0, 0, 0] }, fingers: [0, 0, 0, 0, 0] },
    ],
  };
  const period = loopDuration(clip);

  it("no parpadea mientras signa, y sí una vez en cada vuelta al inicio", () => {
    for (let t = 0; t <= clip.duration; t += 10) expect(loopBlink(clip, t)).toBe(0);
    const closed = (from: number) => {
      let n = 0;
      for (let t = from; t < from + period; t += 10) if (loopBlink(clip, t) > 0.9) n++;
      return n;
    };
    expect(closed(0)).toBeGreaterThan(0);
    expect(closed(period)).toBe(closed(0));
    let peak = 0;
    for (let t = clip.duration; t < period; t += 10) peak = Math.max(peak, loopBlink(clip, t));
    expect(peak).toBeCloseTo(1, 1);
  });
});
