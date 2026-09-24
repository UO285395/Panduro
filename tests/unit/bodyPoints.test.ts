import { describe, expect, it } from "vitest";
import { measureBody, surfaceFor, type Anchors, type Cloud } from "@/lib/avatar/bodyPoints";

// Figura sintética en (r, u, f) con origen entre los ojos: cabeza elipsoidal,
// cuello cilíndrico, torso en caja y un mechón de pelo delante de la frente.
function figure(): Cloud {
  const r: number[] = [];
  const u: number[] = [];
  const f: number[] = [];
  const hair: number[] = [];
  const add = (x: number, y: number, z: number, isHair = false) => {
    r.push(x);
    u.push(y);
    f.push(z);
    hair.push(isHair ? 1 : 0);
  };
  for (let i = 0; i <= 80; i++) {
    for (let j = 0; j < 120; j++) {
      const th = (Math.PI * i) / 80;
      const ph = (2 * Math.PI * j) / 120;
      add(0.075 * Math.sin(th) * Math.cos(ph), 0.02 + 0.11 * Math.cos(th), -0.08 + 0.09 * Math.sin(th) * Math.sin(ph));
    }
  }
  for (let k = 0; k <= 20; k++) {
    for (let j = 0; j < 60; j++) {
      const ph = (2 * Math.PI * j) / 60;
      add(0.045 * Math.cos(ph), -0.09 - 0.012 * k, -0.08 + 0.045 * Math.sin(ph));
    }
  }
  for (let a = 0; a <= 40; a++) {
    for (let b = 0; b <= 40; b++) {
      const x = -0.18 + (0.36 * a) / 40;
      const y = -0.2 - (0.5 * b) / 40;
      add(x, y, 0.02);
      add(x, y, -0.18);
    }
  }
  for (let a = 0; a <= 10; a++) for (let b = 0; b <= 10; b++) add(-0.02 + a * 0.004, b * 0.01, 0.03, true);
  return { r: Float32Array.from(r), u: Float32Array.from(u), f: Float32Array.from(f), hair: Uint8Array.from(hair) };
}

const anchors: Anchors = {
  eyeSep: 0.06,
  neckU: -0.12,
  hipsU: -0.7,
  shoulderU: -0.22,
  shoulder: [0.17, -0.22, -0.08],
  armLen: 0.55,
};

describe("measureBody", () => {
  const body = measureBody(figure(), anchors);

  it("ordena la cara de abajo arriba: barbilla, boca, nariz, ojos, frente", () => {
    expect(body.chin.p[1]).toBeLessThan(body.mouth.p[1]);
    expect(body.mouth.p[1]).toBeLessThan(body.nose.p[1]);
    expect(body.nose.p[1]).toBeLessThan(0);
    expect(body.forehead.p[1]).toBeGreaterThan(0);
    expect(body.chin.p[1]).toBeGreaterThan(anchors.neckU);
  });

  it("los puntos de la cara están en la piel, no en el pelo", () => {
    expect(body.forehead.p[2]).toBeLessThan(0.02);
    expect(body.forehead.p[2]).toBeGreaterThan(-0.03);
  });

  it("sien, mejilla y oreja a cada lado, simétricas", () => {
    for (const k of ["temple", "cheek", "ear", "shoulder"] as const) {
      expect(body.right[k].p[0]).toBeGreaterThan(0);
      expect(body.left[k].p[0]).toBeCloseTo(-body.right[k].p[0], 2);
    }
    expect(body.right.temple.p[0]).toBeGreaterThan(body.right.cheek.p[0]);
    expect(body.right.temple.n[0]).toBeGreaterThan(0.5);
  });

  it("el pecho está delante del torso y el corazón a la izquierda", () => {
    expect(body.chest.p[2]).toBeCloseTo(0.02, 3);
    expect(body.chest.p[1]).toBeLessThan(anchors.shoulderU);
    expect(body.heart.p[0]).toBeLessThan(0);
  });

  it("resuelve el lado según la mano que toca", () => {
    expect(surfaceFor(body, "temple", "left")).toBe(body.left.temple);
    expect(surfaceFor(body, "shoulderOther", "right")).toBe(body.left.shoulder);
    expect(surfaceFor(body, "chin", "left")).toBe(body.chin);
  });
});
