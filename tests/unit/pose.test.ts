import { describe, expect, it } from "vitest";
import { distributeFlex, poseFromKeyframe } from "@/lib/avatar/pose";

describe("poseFromKeyframe", () => {
  it("codo más extendido cuando la mano está lejos que cuando está cerca del hombro", () => {
    const far = poseFromKeyframe({
      t: 0,
      hand: { x: 0.5, y: 0, z: 0, rot: [0, 0, 0] },
      fingers: [0, 0, 0, 0, 0],
    });
    const near = poseFromKeyframe({
      t: 0,
      hand: { x: 0, y: -0.05, z: 0, rot: [0, 0, 0] },
      fingers: [0, 0, 0, 0, 0],
    });
    expect(far.elbow).toBeLessThan(near.elbow);
  });

  it("codo flexionado (>1 rad) cuando la mano está en el pecho", () => {
    const pose = poseFromKeyframe({
      t: 0,
      hand: { x: 0, y: -0.05, z: 0, rot: [0, 0, 0] },
      fingers: [0, 0, 0, 0, 0],
    });
    expect(pose.elbow).toBeGreaterThan(1.0);
  });

  it("propaga la flexión de dedos (cascada por falange) y la rotación de muñeca", () => {
    const pose = poseFromKeyframe({
      t: 0,
      hand: { x: 0, y: 0.2, z: 0, rot: [0.1, 0.2, 0.3] },
      fingers: [1, 0.5, 0, 0.25, 0.75],
    });
    // Falange media siempre rota más que las otras dos en un dedo flexionado.
    expect(pose.fingers[0].middle).toBeGreaterThan(pose.fingers[0].proximal);
    expect(pose.fingers[0].middle).toBeGreaterThan(pose.fingers[0].distal);
    // Un dedo extendido no rota ninguna falange.
    expect(pose.fingers[2].proximal).toBe(0);
    expect(pose.fingers[2].middle).toBe(0);
    expect(pose.fingers[2].distal).toBe(0);
    // Escala lineal con la flexión.
    expect(pose.fingers[1].proximal).toBeCloseTo(pose.fingers[0].proximal * 0.5, 6);
    expect(pose.wrist).toEqual([0.1, 0.2, 0.3]);
  });

  it("no produce NaN aunque el target quede fuera del alcance del brazo", () => {
    const pose = poseFromKeyframe({
      t: 0,
      hand: { x: 5, y: 5, z: 5, rot: [0, 0, 0] },
      fingers: [0, 0, 0, 0, 0],
    });
    expect(Number.isFinite(pose.elbow)).toBe(true);
    expect(pose.shoulder.every((v) => Number.isFinite(v))).toBe(true);
  });
});

describe("distributeFlex", () => {
  it("clamp a [0..1]", () => {
    expect(distributeFlex(-1).middle).toBe(0);
    const capped = distributeFlex(2);
    // Con flex=1, smoothstep(1)=1, middle = 0.95 * π/2 ≈ 1.4923
    expect(capped.middle).toBeCloseTo(0.95 * (Math.PI / 2), 6);
  });

  it("respeta el ratio proximal:middle:distal ≈ 0.60:0.95:0.65", () => {
    const f = distributeFlex(1);
    expect(f.proximal / f.middle).toBeCloseTo(0.60 / 0.95, 4);
    expect(f.distal / f.middle).toBeCloseTo(0.65 / 0.95, 4);
  });
});
