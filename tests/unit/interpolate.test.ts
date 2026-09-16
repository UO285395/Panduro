import { describe, expect, it } from "vitest";
import { phaseOf, sampleClip } from "@/lib/avatar/interpolate";
import type { AvatarClip } from "@/lib/curriculum/schema";

const clip: AvatarClip = {
  handedness: "one",
  duration: 1000,
  keyframes: [
    {
      t: 0,
      hand: { x: 0, y: 0, z: 0, rot: [0, 0, 0] },
      fingers: [0, 0, 0, 0, 0],
    },
    {
      t: 500,
      hand: { x: 1, y: 1, z: 0, rot: [0, 0, 0] },
      fingers: [1, 1, 1, 1, 1],
    },
    {
      t: 1000,
      hand: { x: 2, y: 0, z: 0, rot: [0, 0, 0] },
      fingers: [0.5, 0.5, 0.5, 0.5, 0.5],
    },
  ],
};

describe("sampleClip", () => {
  it("devuelve el primer keyframe antes del inicio", () => {
    const k = sampleClip(clip, -10);
    expect(k.hand.x).toBe(0);
    expect(k.fingers[0]).toBe(0);
  });

  it("devuelve el último keyframe después del final", () => {
    const k = sampleClip(clip, 5000);
    expect(k.hand.x).toBe(2);
  });

  it("interpola linealmente en el primer segmento", () => {
    const k = sampleClip(clip, 250); // 50% entre 0 y 500
    expect(k.hand.x).toBeCloseTo(0.5);
    expect(k.hand.y).toBeCloseTo(0.5);
    expect(k.fingers[0]).toBeCloseTo(0.5);
  });

  it("interpola linealmente en el segundo segmento", () => {
    const k = sampleClip(clip, 750); // 50% entre 500 y 1000
    expect(k.hand.x).toBeCloseTo(1.5);
    expect(k.hand.y).toBeCloseTo(0.5);
    expect(k.fingers[0]).toBeCloseTo(0.75);
  });

  it("pasa por los keyframes exactos", () => {
    expect(sampleClip(clip, 0).hand.x).toBe(0);
    expect(sampleClip(clip, 500).hand.x).toBe(1);
    expect(sampleClip(clip, 1000).hand.x).toBe(2);
  });
});

describe("phaseOf", () => {
  it("devuelve fase [0,1) haciendo loop", () => {
    expect(phaseOf(clip, 0)).toBe(0);
    expect(phaseOf(clip, 500)).toBeCloseTo(0.5);
    expect(phaseOf(clip, 1500)).toBeCloseTo(0.5); // ha dado la vuelta
  });

  it("aguanta duration=0 sin dividir por cero", () => {
    expect(phaseOf({ ...clip, duration: 200 }, 100)).toBeCloseTo(0.5);
  });
});
