import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { restPalm, segmentDistance, unbendFingers } from "@/lib/avatar/vrmMapper";

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
