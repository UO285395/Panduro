import { describe, expect, it } from "vitest";
import { poseFromKeyframe } from "@/lib/avatar/pose";

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

  it("propaga la flexión de dedos y rotación de muñeca", () => {
    const pose = poseFromKeyframe({
      t: 0,
      hand: { x: 0, y: 0.2, z: 0, rot: [0.1, 0.2, 0.3] },
      fingers: [1, 0.5, 0, 0.25, 0.75],
    });
    expect(pose.fingers).toEqual([1, 0.5, 0, 0.25, 0.75]);
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
