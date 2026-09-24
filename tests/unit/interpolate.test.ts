import { describe, expect, it } from "vitest";
import { LOOP_HOLD_MS, LOOP_RETURN_MS, phaseOf, sampleClip, sampleLoop } from "@/lib/avatar/interpolate";
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

  it("interpola con Hermite: tangentes de los vecinos y cero en los extremos", () => {
    // kf1 tiene tangente (2 - 0) / 1000 en x; kf0 y kf2, cero.
    const a = sampleClip(clip, 250);
    expect(a.hand.x).toBeCloseTo(0.375, 4);
    expect(a.hand.y).toBeCloseTo(0.5, 4);
    expect(a.fingers[0]).toBeCloseTo(0.46875, 4);
    const b = sampleClip(clip, 750);
    expect(b.hand.x).toBeCloseTo(1.625, 4);
    expect(b.fingers[0]).toBeCloseTo(0.78125, 4);
  });

  it("mantiene la velocidad al cruzar un keyframe aunque los tramos sean desiguales", () => {
    const uneven: AvatarClip = {
      ...clip,
      keyframes: [
        { ...clip.keyframes[0]!, t: 0 },
        { ...clip.keyframes[1]!, t: 200 },
        { ...clip.keyframes[2]!, t: 1000 },
      ],
    };
    const v = (t: number) => (sampleClip(uneven, t + 0.01).hand.x - sampleClip(uneven, t - 0.01).hand.x) / 0.02;
    expect(v(199.9)).toBeCloseTo(v(200.1), 3);
  });

  it("arranca y termina con velocidad cero", () => {
    const v = (t: number) => (sampleClip(clip, t + 0.5).hand.x - sampleClip(clip, t).hand.x) / 0.5;
    expect(Math.abs(v(0))).toBeLessThan(1e-3);
    expect(Math.abs(v(999.4))).toBeLessThan(1e-3);
  });

  it("conserva la abducción de los dedos y la orientación entre keyframes", () => {
    const shaped: AvatarClip = {
      ...clip,
      keyframes: clip.keyframes.map((k, i) => ({
        ...k,
        fingers: [0, { flex: 0, abduction: 0.3 }, { flex: 0, abduction: -0.2 }, 1, 1],
        hand: i === 1 ? { ...k.hand } : { ...k.hand, palmDir: [0, 0, 1] as [number, number, number] },
      })),
    };
    const k = sampleClip(shaped, 300);
    expect(k.fingers[1]).toEqual({ flex: 0, abduction: expect.closeTo(0.3, 5) });
    expect(k.hand.palmDir).toEqual([0, 0, 1]);
  });

  it("pasa por los keyframes exactos", () => {
    expect(sampleClip(clip, 0).hand.x).toBe(0);
    expect(sampleClip(clip, 500).hand.x).toBe(1);
    expect(sampleClip(clip, 1000).hand.x).toBe(2);
  });
});

describe("sampleLoop", () => {
  it("se detiene al final y vuelve al inicio sin saltos", () => {
    expect(sampleLoop(clip, 1000 + LOOP_HOLD_MS / 2).hand.x).toBe(2);
    const mid = sampleLoop(clip, 1000 + LOOP_HOLD_MS + LOOP_RETURN_MS / 2);
    expect(mid.hand.x).toBeCloseTo(1, 4);
    const period = 1000 + LOOP_HOLD_MS + LOOP_RETURN_MS;
    expect(sampleLoop(clip, period - 0.01).hand.x).toBeCloseTo(0, 3);
    expect(sampleLoop(clip, period + 250).hand.x).toBeCloseTo(0.375, 4);
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
