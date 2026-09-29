import { describe, expect, it } from "vitest";
import {
  faceSurface,
  faceToModel,
  measureBody,
  measureFace,
  surfaceFor,
  type Anchors,
  type Cloud,
} from "@/lib/avatar/bodyPoints";

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

describe("faceSurface: el punto exacto de la cara", () => {
  const cloud = figure();
  const body = measureBody(cloud, anchors);
  const grid = measureFace(cloud, body, anchors);

  it("la boca de una persona cae en la boca del modelo, en la piel y mirando al frente", () => {
    const s = faceSurface(grid, [0, -1]);
    expect(s.p[1]).toBeCloseTo(body.mouth.p[1], 3);
    expect(Math.abs(s.p[0])).toBeLessThan(0.005);
    expect(s.p[2]).toBeCloseTo(body.mouth.p[2], 2);
    expect(s.n[2]).toBeGreaterThan(0.8);
  });

  it("de abajo arriba y de un lado a otro, en orden", () => {
    const u = [-1.75, -1, -0.5, 0, 0.8].map((v) => faceSurface(grid, [0, v]).p[1]);
    for (let i = 1; i < u.length; i++) expect(u[i]!).toBeGreaterThan(u[i - 1]!);
    expect(faceSurface(grid, [2.1, 0.3]).p[0]).toBeGreaterThan(0);
    expect(faceSurface(grid, [-2.1, 0.3]).p[0]).toBeLessThan(0);
  });

  it("más allá de la sien queda en el borde de la cabeza, con la normal hacia fuera", () => {
    const s = faceSurface(grid, [3.5, 0.3]);
    expect(s.p[0]).toBeGreaterThan(0.05);
    expect(s.p[0]).toBeLessThan(0.08);
    expect(s.n[0]).toBeGreaterThan(0.5);
  });

  it("el mechón que sobresale de la frente no cuenta como piel", () => {
    expect(faceSurface(grid, [0, 0.8]).p[2]).toBeLessThan(0.02);
  });
});

describe("faceToModel: anclado en el contorno del ojo", () => {
  // Ojos enormes de modelo anime: de r 0,03 a 0,07 a cada lado y de u −0,03 a +0,04
  // (con los ojos a 0,06 de distancia y la boca a 0,05 por debajo).
  const withEyes = (): Cloud => {
    const c = figure();
    const r = [...c.r], u = [...c.u], f = [...c.f], hair = [...c.hair];
    const eye = new Array(r.length).fill(0);
    for (const side of [1, -1]) {
      for (let a = 0; a <= 10; a++) {
        for (let b = 0; b <= 10; b++) {
          r.push(side * (0.03 + 0.004 * a));
          u.push(-0.03 + 0.007 * b);
          f.push(0.005);
          hair.push(0);
          eye.push(1);
        }
      }
    }
    return { r: Float32Array.from(r), u: Float32Array.from(u), f: Float32Array.from(f), hair: Uint8Array.from(hair), eye: Uint8Array.from(eye) };
  };
  const cloud = withEyes();
  const grid = measureFace(cloud, measureBody(cloud, anchors), anchors);

  it("mide el contorno de los ojos del modelo", () => {
    expect(grid.eye.inR).toBeCloseTo(0.03, 2);
    expect(grid.eye.outR).toBeCloseTo(0.07, 2);
    expect(grid.eye.bottom).toBeCloseTo(-0.03, 2);
  });

  it("junto al ojo de una persona queda junto al ojo del modelo, no dentro", () => {
    // Sien (por fuera del ojo) y mejilla (debajo del ojo) de una persona.
    const [rTemple] = faceToModel(grid, [2, 0]);
    const [, uCheek] = faceToModel(grid, [1, -0.5]);
    expect(rTemple).toBeGreaterThan(grid.eye.outR);
    expect(uCheek).toBeLessThan(grid.eye.bottom);
  });

  it("dentro del ojo de una persona, dentro del ojo del modelo", () => {
    const [r, u] = faceToModel(grid, [1, 0]);
    expect(r).toBeGreaterThan(grid.eye.inR);
    expect(r).toBeLessThan(grid.eye.outR);
    expect(u).toBeGreaterThan(grid.eye.bottom);
    expect(u).toBeLessThan(grid.eye.top);
  });
});
