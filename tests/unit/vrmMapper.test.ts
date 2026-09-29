import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { segmentDistance } from "@/lib/avatar/vrmMapper";

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
