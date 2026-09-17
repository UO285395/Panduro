import { describe, expect, it } from "vitest";
import {
  PerfWindow,
  angleAt,
  distance,
  normalizeLandmarks,
} from "@/lib/mediapipe/landmarks";
import type { RawLandmark } from "@/lib/mediapipe/types";

function makeHand(offset = { x: 0, y: 0, z: 0 }, scale = 1): RawLandmark[] {
  // Mano sintética: 21 puntos alineados con 0=muñeca, 9=middle_mcp a distancia 0.2 en Y.
  const base: RawLandmark[] = Array.from({ length: 21 }, (_, i) => ({
    x: 0.5 + (i - 10) * 0.01,
    y: 0.5 + i * 0.005,
    z: 0,
  }));
  base[0] = { x: 0.5, y: 0.7, z: 0 };
  base[9] = { x: 0.5, y: 0.5, z: 0 };
  return base.map((p) => ({
    x: p.x * scale + offset.x,
    y: p.y * scale + offset.y,
    z: p.z * scale + offset.z,
  }));
}

describe("distance", () => {
  it("mide correctamente en 3D", () => {
    expect(distance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBeCloseTo(5);
    expect(distance({ x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 })).toBe(0);
  });
});

describe("angleAt", () => {
  it("da 90º en un ángulo recto", () => {
    const a = { x: 1, y: 0, z: 0 };
    const b = { x: 0, y: 0, z: 0 };
    const c = { x: 0, y: 1, z: 0 };
    expect(angleAt(a, b, c)).toBeCloseTo(Math.PI / 2);
  });

  it("da 180º en una línea recta", () => {
    const a = { x: -1, y: 0, z: 0 };
    const b = { x: 0, y: 0, z: 0 };
    const c = { x: 1, y: 0, z: 0 };
    expect(angleAt(a, b, c)).toBeCloseTo(Math.PI);
  });

  it("devuelve NaN si algún brazo es cero", () => {
    const p = { x: 0, y: 0, z: 0 };
    expect(Number.isNaN(angleAt(p, p, { x: 1, y: 0, z: 0 }))).toBe(true);
  });
});

describe("normalizeLandmarks", () => {
  it("es invariante a traslación", () => {
    const a = normalizeLandmarks(makeHand());
    const b = normalizeLandmarks(makeHand({ x: 0.2, y: -0.3, z: 0.1 }));
    for (let i = 0; i < a.length; i++) {
      expect(a[i]!.x).toBeCloseTo(b[i]!.x, 6);
      expect(a[i]!.y).toBeCloseTo(b[i]!.y, 6);
      expect(a[i]!.z).toBeCloseTo(b[i]!.z, 6);
    }
  });

  it("es invariante a escalado uniforme", () => {
    const a = normalizeLandmarks(makeHand({ x: 0, y: 0, z: 0 }, 1));
    const b = normalizeLandmarks(makeHand({ x: 0, y: 0, z: 0 }, 2.7));
    for (let i = 0; i < a.length; i++) {
      expect(a[i]!.x).toBeCloseTo(b[i]!.x, 5);
      expect(a[i]!.y).toBeCloseTo(b[i]!.y, 5);
      expect(a[i]!.z).toBeCloseTo(b[i]!.z, 5);
    }
  });

  it("deja la muñeca en el origen y |wrist→middle_mcp| = 1", () => {
    const norm = normalizeLandmarks(makeHand());
    expect(norm[0]!.x).toBeCloseTo(0);
    expect(norm[0]!.y).toBeCloseTo(0);
    expect(norm[0]!.z).toBeCloseTo(0);
    expect(distance(norm[0]!, norm[9]!)).toBeCloseTo(1, 5);
  });

  it("no explota con array vacío", () => {
    expect(normalizeLandmarks([])).toEqual([]);
  });
});

describe("PerfWindow", () => {
  it("calcula P50/P95 sobre latencias observadas", () => {
    const w = new PerfWindow(5);
    [10, 20, 30, 40, 50].forEach((ms, i) => w.push(ms, i * 10));
    const s = w.stats();
    expect(s.samples).toBe(5);
    expect(s.p50).toBe(30);
    expect(s.p95).toBe(50);
    expect(s.fps).toBeGreaterThan(0);
  });

  it("descarta las muestras más viejas al llegar a la capacidad", () => {
    const w = new PerfWindow(3);
    w.push(10, 0);
    w.push(20, 10);
    w.push(30, 20);
    w.push(40, 30);
    const s = w.stats();
    expect(s.samples).toBe(3);
    expect(s.p50).toBe(30); // 20, 30, 40 → mediana 30
  });

  it("stats vacío no divide por cero", () => {
    const w = new PerfWindow();
    expect(w.stats()).toEqual({ fps: 0, p50: 0, p95: 0, samples: 0 });
  });
});
